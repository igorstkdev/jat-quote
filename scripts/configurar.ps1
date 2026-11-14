<#
  JAT Quote — etapas de configuração usadas pelo instalador gráfico (JAT-Quote-Setup.exe).

  O assistente chama este script uma vez por etapa, para mostrar o progresso:
    postgres      inicializa o PostgreSQL embutido (runtime\pgsql) e o registra como serviço
    configuracao  cria o .env de produção (senha aleatória do banco)
    banco         cria o usuário e o banco do sistema
    migrations    aplica as migrations
    admin         cria o Admin inicial e grava login/senha temporária em -SaidaAdmin
    servico       registra a inicialização com o Windows, o backup e o Firewall, e inicia
    parar         (atualização) faz backup, para o sistema e o PostgreSQL
    iniciar-banco (atualização) inicia o PostgreSQL de novo
    remover       (desinstalação) remove tarefas, Firewall e o serviço do PostgreSQL;
                  com -RemoverDados apaga também banco, backups, logs e .env

  Tudo é registrado em logs\instalacao.log. Código de saída diferente de 0 = falhou.
#>
param(
  [Parameter(Mandatory)]
  [ValidateSet('postgres', 'configuracao', 'banco', 'migrations', 'admin', 'servico', 'parar', 'iniciar-banco', 'remover')]
  [string]$Etapa,
  [int]$Porta = 3333,
  [string]$AdminUsuario = 'admin',
  [string]$PastaBackup,
  [string]$HoraBackup = '23:00',
  [int]$Copias = 30,
  [switch]$PermitirRedePublica,
  [string]$SaidaAdmin,
  [switch]$RemoverDados
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\comum.ps1"
$raiz = Get-Raiz
$pgBin = Join-Path $raiz 'runtime\pgsql\bin'
$pastaDados = Join-Path $raiz 'dados'
$pgDados = Join-Path $pastaDados 'postgres'
$arqSuper = Join-Path $pastaDados 'postgres-superusuario.txt'
$arqEstado = Join-Path $pastaDados 'postgres.json'
$servicoPg = 'JATQuote-PostgreSQL'
try { [Console]::OutputEncoding = [System.Text.Encoding]::UTF8 } catch { }

function Log([string]$m, [string]$n = 'Info') { Write-Log "[$Etapa] $m" -Arquivo instalacao -Nivel $n }

function Nova-Senha([int]$Tamanho = 24) {
  $chars = [char[]]'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  $bytes = New-Object byte[] $Tamanho
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })
}

function Test-PortaLivre([int]$p) {
  try {
    $l = New-Object System.Net.Sockets.TcpListener([System.Net.IPAddress]::Any, $p)
    $l.Start(); $l.Stop(); return $true
  } catch { return $false }
}

<# Arquivo só para Administradores e SYSTEM (senhas). #>
function Proteger([string]$Caminho) {
  & icacls.exe $Caminho /inheritance:r /grant:r '*S-1-5-32-544:F' '*S-1-5-18:F' | Out-Null
}

function Executar([string]$descricao, [scriptblock]$comando) {
  $global:LASTEXITCODE = 0
  # Programas como o Prisma escrevem avisos normais na saída de erro (stderr). No Windows
  # PowerShell 5.1, com 'Stop', isso viraria falha: aqui só o código de saída decide.
  $anterior = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $saida = & $comando 2>&1 | ForEach-Object { "$_" }
  } finally { $ErrorActionPreference = $anterior }
  foreach ($l in $saida) { Add-Content -LiteralPath (Join-Path $raiz 'logs\instalacao.log') -Value "    $l" -Encoding UTF8 }
  if ($LASTEXITCODE -ne 0) { throw "$descricao falhou (código $LASTEXITCODE). Detalhes em logs\instalacao.log." }
  return $saida
}

function Get-EstadoPg {
  if (-not (Test-Path $arqEstado)) { throw 'PostgreSQL do JAT Quote ainda não inicializado.' }
  Get-Content $arqEstado -Raw | ConvertFrom-Json
}

function Aguardar-Pg([int]$p, [int]$Segundos = 60) {
  $fim = (Get-Date).AddSeconds($Segundos)
  while ((Get-Date) -lt $fim) {
    & (Join-Path $pgBin 'pg_isready.exe') -h localhost -p $p -q
    if ($LASTEXITCODE -eq 0) { return }
    Start-Sleep -Seconds 1
  }
  throw "O PostgreSQL não respondeu na porta $p."
}

try {
  if (-not (Test-Administrador)) { throw 'É preciso rodar como Administrador.' }
  # Numa instalação nova a pasta de logs ainda não existe.
  $pastaLogs = Join-Path $raiz 'logs'
  if (-not (Test-Path $pastaLogs)) { New-Item -ItemType Directory $pastaLogs | Out-Null }
  $env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $raiz '.navegadores'

  switch ($Etapa) {
    'postgres' {
      if (-not (Test-Path $pastaDados)) { New-Item -ItemType Directory $pastaDados | Out-Null }
      # Inicialização interrompida (sem a senha ou o estado gravados) e sem serviço registrado:
      # o banco ainda está vazio, então é seguro recriar.
      $incompleto = (Test-Path $pgDados) -and -not ((Test-Path $arqSuper) -and (Test-Path $arqEstado)) -and
        -not (Get-Service $servicoPg -ErrorAction SilentlyContinue)
      if ($incompleto) {
        Log 'Encontrada uma inicialização interrompida do PostgreSQL: recriando a pasta de dados (vazia).' 'Aviso'
        Remove-Item $pgDados -Recurse -Force
        Remove-Item $arqSuper, $arqEstado -Force -ErrorAction SilentlyContinue
      }
      if (Test-Path (Join-Path $pgDados 'PG_VERSION')) {
        Log 'PostgreSQL já inicializado: mantido.'
      } else {
        # Porta própria (a partir da 5433) para não conflitar com outro PostgreSQL da máquina.
        $pgPorta = 5433
        while (-not (Test-PortaLivre $pgPorta)) { $pgPorta++; if ($pgPorta -gt 5499) { throw 'Nenhuma porta livre entre 5433 e 5499 para o PostgreSQL.' } }
        $senha = Nova-Senha
        $tmp = New-TemporaryFile
        try {
          [System.IO.File]::WriteAllText($tmp.FullName, $senha, (New-Object System.Text.UTF8Encoding($false)))
          Executar 'initdb' {
            & (Join-Path $pgBin 'initdb.exe') -D $pgDados -U postgres --pwfile=$($tmp.FullName) -A scram-sha-256 `
              -E UTF8 --locale-provider=icu --icu-locale=pt-BR --locale=C
          } | Out-Null
        } finally { Remove-Item $tmp -Force }
        [System.IO.File]::WriteAllText($arqSuper, $senha, (New-Object System.Text.UTF8Encoding($false)))
        Proteger $arqSuper
        # Só aceita conexões da própria máquina.
        Add-Content (Join-Path $pgDados 'postgresql.conf') "`nport = $pgPorta`nlisten_addresses = 'localhost'`n" -Encoding ASCII
        @{ porta = $pgPorta; servico = $servicoPg } | ConvertTo-Json | Set-Content $arqEstado -Encoding ASCII
        Log "PostgreSQL inicializado (porta $pgPorta)." 'Ok'
      }
      $estado = Get-EstadoPg
      # O serviço do PostgreSQL roda como NETWORK SERVICE: precisa de acesso à pasta de dados.
      & icacls.exe $pgDados /grant '*S-1-5-20:(OI)(CI)F' /T /Q | Out-Null
      if (-not (Get-Service $servicoPg -ErrorAction SilentlyContinue)) {
        Executar 'Registro do serviço do PostgreSQL' {
          & (Join-Path $pgBin 'pg_ctl.exe') register -N $servicoPg -D $pgDados -S auto -w
        } | Out-Null
        Log "Serviço '$servicoPg' registrado (inicia com o Windows)." 'Ok'
      }
      Start-Service $servicoPg
      Aguardar-Pg $estado.porta
      Log 'PostgreSQL no ar.' 'Ok'
    }

    'configuracao' {
      $envArq = Join-Path $raiz '.env'
      if (Test-Path $envArq) {
        Log '.env já existe: mantido.'
      } else {
        $estado = Get-EstadoPg
        Copy-Item (Join-Path $raiz '.env.example') $envArq
        $senha = Nova-Senha
        Set-DotEnvValue 'NODE_ENV' 'production'
        Set-DotEnvValue 'HOST' '0.0.0.0'
        Set-DotEnvValue 'PORT' "$Porta"
        Set-DotEnvValue 'DB_PASSWORD' $senha
        Set-DotEnvValue 'DATABASE_URL' "postgresql://jat:$senha@localhost:$($estado.porta)/jat_quote"
        Set-DotEnvValue 'TEST_DATABASE_URL' ''
        Set-DotEnvValue 'PG_BIN' $pgBin
        Set-DotEnvValue 'BACKUP_DIR' $(if ($PastaBackup) { $PastaBackup } else { Join-Path $raiz 'backups' })
        Set-DotEnvValue 'BACKUP_KEEP' "$Copias"
        Proteger $envArq
        Log ".env criado (porta $Porta)." 'Ok'
      }
    }

    'banco' {
      $estado = Get-EstadoPg
      $cfg = Read-DotEnv
      $db = ConvertFrom-DatabaseUrl $cfg.DATABASE_URL
      $env:PGPASSWORD = (Get-Content $arqSuper -Raw).Trim()
      try {
        Executar 'Criação do banco' {
          & "$PSScriptRoot\setup-db.ps1" -PgBin $pgBin -PgPort $estado.porta -Usuario $db.Usuario -Banco $db.Banco -SemBancoDeTeste
        } | Out-Null
      } finally { Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue }
      Log "Banco '$($db.Banco)' pronto." 'Ok'
    }

    'migrations' {
      Push-Location (Join-Path $raiz 'apps\api')
      try {
        $node = Get-Node
        Executar 'Migrations' { & $node (Join-Path $raiz 'node_modules\prisma\build\index.js') migrate deploy } | Out-Null
      } finally { Pop-Location }
      Log 'Estrutura do banco atualizada.' 'Ok'
    }

    'admin' {
      $node = Get-Node
      Push-Location (Join-Path $raiz 'apps\api')
      try {
        $saida = Executar 'Criação do Admin' { & $node 'dist\seed-cli.js' $AdminUsuario }
      } finally { Pop-Location }
      # Acentos podem chegar trocados conforme a página de código: casa com qualquer letra.
      $linhaSenha = $saida | Where-Object { $_ -match 'Senha tempor\S*ria:\s*(\S+)' } | Select-Object -First 1
      $linhaUsuario = $saida | Where-Object { $_ -match 'Usu\S*rio:\s*(\S+)' } | Select-Object -First 1
      $resultado = if ($linhaSenha) {
        $null = $linhaUsuario -match 'Usu\S*rio:\s*(\S+)'; $u = $Matches[1]
        $null = $linhaSenha -match 'Senha tempor\S*ria:\s*(\S+)'
        "criado`r`n$u`r`n$($Matches[1])"
      } else { 'existente' }
      if ($SaidaAdmin) { [System.IO.File]::WriteAllText($SaidaAdmin, $resultado, (New-Object System.Text.UTF8Encoding($false))) }
      Log $(if ($linhaSenha) { "Admin '$u' criado." } else { 'Já existe um Admin: nada a criar.' }) 'Ok'
    }

    'servico' {
      $opcoes = @{ Acao = 'instalar'; HoraBackup = $HoraBackup }
      if ($PermitirRedePublica) { $opcoes.PermitirRedePublica = $true }
      Executar 'Registro do serviço' { & "$PSScriptRoot\servico.ps1" @opcoes } | Out-Null
      Executar 'Início do sistema' { & "$PSScriptRoot\servico.ps1" -Acao iniciar } | Out-Null
      Log 'Sistema no ar.' 'Ok'
    }

    'parar' {
      if ((Test-Path (Join-Path $raiz '.env')) -and (Get-Service $servicoPg -ErrorAction SilentlyContinue)) {
        if ((Get-Service $servicoPg).Status -ne 'Running') { Start-Service $servicoPg; Aguardar-Pg (Get-EstadoPg).porta }
        Executar 'Backup antes da atualização' { & "$PSScriptRoot\backup.ps1" -Sufixo 'antes-atualizacao' } | Out-Null
      }
      if (Get-ScheduledTask -TaskName $script:NomeTarefa -ErrorAction SilentlyContinue) {
        & "$PSScriptRoot\servico.ps1" -Acao parar | Out-Null
      }
      if (Get-Service $servicoPg -ErrorAction SilentlyContinue) { Stop-Service $servicoPg -Force }
      Log 'Sistema e PostgreSQL parados para a atualização.' 'Ok'
    }

    'iniciar-banco' {
      Start-Service $servicoPg
      Aguardar-Pg (Get-EstadoPg).porta
      Log 'PostgreSQL no ar.' 'Ok'
    }

    'remover' {
      if (Test-Path (Join-Path $raiz '.env')) { & "$PSScriptRoot\servico.ps1" -Acao remover | Out-Null }
      if (Get-Service $servicoPg -ErrorAction SilentlyContinue) {
        Stop-Service $servicoPg -Force -ErrorAction SilentlyContinue
        & (Join-Path $pgBin 'pg_ctl.exe') unregister -N $servicoPg | Out-Null
      }
      if ($RemoverDados) {
        foreach ($p in @('dados', 'backups', 'logs', '.env', '.navegadores')) {
          $c = Join-Path $raiz $p
          if (Test-Path $c) { Remove-Item $c -Recurse -Force }
        }
      }
      Write-Host 'Remoção concluída.'
    }
  }
  exit 0
} catch {
  Log "Falhou: $($_.Exception.Message)" 'Erro'
  exit 1
}
