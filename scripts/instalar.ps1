<#
  JAT Quote — instalação completa no servidor Windows (um script faz tudo).

  Antes (uma vez, instaladores gratuitos):
    - Node.js LTS (24 ou superior): https://nodejs.org
    - PostgreSQL 16 ou superior: https://www.postgresql.org/download/windows/
      (anote a senha do usuário "postgres" definida na instalação)

  Depois, no PowerShell como Administrador, na pasta do sistema:
    powershell -ExecutionPolicy Bypass -File scripts\instalar.ps1

  O que faz (pode rodar de novo com segurança; o que já existe é mantido):
     1. Confere Node.js, npm e PostgreSQL.
     2. Cria o .env de produção com uma senha aleatória para o banco.
     3. Cria o usuário e o banco no PostgreSQL (pede a senha do "postgres", que não é gravada).
     4. Instala as dependências e compila o sistema.
     5. Aplica as migrations do banco.
     6. Instala o Chromium usado para gerar os PDFs.
     7. Cria o Admin inicial (mostra a senha temporária UMA vez).
     8. Registra o sistema para iniciar com o Windows, agenda o backup diário e libera a porta
        no Firewall para a rede local.
     9. Inicia o sistema e mostra o endereço de acesso.
#>
param(
  [string]$AdminUsuario,
  [int]$Porta = 3333,
  [string]$PgBin,
  [string]$PastaBackup,
  [string]$HoraBackup = '23:00'
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\comum.ps1"
$raiz = Get-Raiz
Set-Location $raiz

function Etapa([int]$n, [string]$texto) { Write-Host "`n[$n/9] $texto" -ForegroundColor Cyan }
function Executar([string]$descricao, [scriptblock]$comando) {
  & $comando
  if ($LASTEXITCODE -ne 0) { throw "$descricao falhou (código $LASTEXITCODE)." }
}
function Nova-Senha([int]$Tamanho = 24) {
  $chars = [char[]]'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  $bytes = New-Object byte[] $Tamanho
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })
}

try {
  Write-Host 'JAT Quote - instalação no servidor' -ForegroundColor White
  if (-not (Test-Administrador)) {
    throw 'Abra o PowerShell como Administrador (botão direito > Executar como administrador) e rode de novo.'
  }

  # 1. Pré-requisitos
  Etapa 1 'Conferindo Node.js, npm e PostgreSQL'
  $node = Get-Command node.exe -ErrorAction SilentlyContinue
  if (-not $node) { throw 'Node.js não encontrado. Instale o Node.js LTS (https://nodejs.org) e rode de novo.' }
  $versaoNode = [int]((& node.exe -v) -replace '^v(\d+).*', '$1')
  if ($versaoNode -lt 24) { throw "Node.js $(& node.exe -v) é antigo. Instale o Node.js 24 LTS ou superior." }
  if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) { throw 'npm não encontrado (vem junto com o Node.js).' }
  $bin = Get-PgBin $PgBin
  Write-Host "  Node.js $(& node.exe -v), npm $(& npm.cmd -v), PostgreSQL em $bin" -ForegroundColor Green

  # 2. .env
  Etapa 2 'Configuração (.env)'
  $envArq = Join-Path $raiz '.env'
  if (Test-Path $envArq) {
    Write-Host '  .env já existe: mantido.' -ForegroundColor Green
  } else {
    Copy-Item (Join-Path $raiz '.env.example') $envArq
    $senha = Nova-Senha
    Set-DotEnvValue 'NODE_ENV' 'production'
    Set-DotEnvValue 'HOST' '0.0.0.0'
    Set-DotEnvValue 'PORT' "$Porta"
    Set-DotEnvValue 'DB_PASSWORD' $senha
    Set-DotEnvValue 'DATABASE_URL' "postgresql://jat:$senha@localhost:5432/jat_quote"
    Set-DotEnvValue 'TEST_DATABASE_URL' "postgresql://jat:$senha@localhost:5432/jat_quote_test"
    Set-DotEnvValue 'PG_BIN' $bin
    Set-DotEnvValue 'BACKUP_DIR' $(if ($PastaBackup) { $PastaBackup } else { Join-Path $raiz 'backups' })
    Set-DotEnvValue 'BACKUP_KEEP' '30'
    Write-Host '  .env criado com uma senha aleatória para o banco.' -ForegroundColor Green
  }
  $cfg = Read-DotEnv

  # 3. Banco
  Etapa 3 'Banco de dados (digite a senha do usuário "postgres" quando pedir)'
  Executar 'Criação do banco' { & "$PSScriptRoot\setup-db.ps1" -PgBin $bin }

  # 4. Dependências e compilação
  Etapa 4 'Instalando dependências e compilando (alguns minutos)'
  Executar 'npm ci' { & npm.cmd ci --no-audit --no-fund }
  Executar 'Compilação' { & npm.cmd run build }

  # 5. Migrations
  Etapa 5 'Atualizando a estrutura do banco'
  Executar 'Migrations' { & npm.cmd run db:deploy -w @jat/api }

  # 6. Chromium (PDF)
  Etapa 6 'Instalando o Chromium para os PDFs'
  $env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $raiz '.navegadores'
  Executar 'Instalação do Chromium' { & npx.cmd playwright install chromium }

  # 7. Admin inicial
  Etapa 7 'Admin inicial'
  if (-not $AdminUsuario) {
    $AdminUsuario = Read-Host '  Login do Admin (Enter = admin)'
    if (-not $AdminUsuario) { $AdminUsuario = 'admin' }
  }
  Executar 'Criação do Admin' { & npm.cmd run --silent db:seed:prod -w @jat/api -- $AdminUsuario }

  # 8. Inicialização automática, backup e Firewall
  Etapa 8 'Inicialização com o Windows, backup diário e Firewall'
  & "$PSScriptRoot\servico.ps1" -Acao instalar -HoraBackup $HoraBackup

  # 9. Inicia
  Etapa 9 'Iniciando o sistema'
  & "$PSScriptRoot\servico.ps1" -Acao iniciar
  if ($LASTEXITCODE -ne 0) { throw 'O sistema não iniciou. Veja logs\jat-quote.log.' }

  Write-Log 'Instalação concluída.' -Arquivo instalacao -Nivel Ok
  Write-Host "`nPróximos passos:" -ForegroundColor White
  Write-Host '  1. Acesse o endereço acima, entre com o Admin e troque a senha temporária.'
  Write-Host '  2. Cadastre os usuários em Administração > Usuários.'
  Write-Host '  3. Importe os cadastros do Base44 (README, seção "Migração do Base44").'
  Write-Host "  4. Copie a pasta de backups ($($cfg.BACKUP_DIR)) para outro disco ou para a rede regularmente."
} catch {
  Write-Log "Instalação interrompida: $($_.Exception.Message)" -Arquivo instalacao -Nivel Erro
  exit 1
}
