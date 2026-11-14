<#
  JAT Quote — mantém o sistema rodando (chamado pela tarefa "JAT Quote" do Windows).

  Inicia a API (que também entrega o site) e, se ela parar por qualquer motivo,
  inicia de novo em alguns segundos. A saída vai para logs\jat-quote.log
  (o arquivo é renovado ao passar de 10 MB; ficam os 5 mais recentes).

  Não é preciso rodar à mão: use scripts\servico.ps1 -Acao iniciar | parar | status.
#>
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\comum.ps1"

$raiz = Get-Raiz
$servidor = Join-Path $raiz 'apps\api\dist\server.js'
$pastaLogs = Join-Path $raiz 'logs'
$log = Join-Path $pastaLogs 'jat-quote.log'
if (-not (Test-Path $pastaLogs)) { New-Item -ItemType Directory $pastaLogs | Out-Null }

try { $node = Get-Node } catch { Write-Log 'Node.js não encontrado.' -Arquivo servico -Nivel Erro; exit 1 }
if (-not (Test-Path $servidor)) { Write-Log "Sistema não compilado ($servidor). Rode o instalador." -Arquivo servico -Nivel Erro; exit 1 }

# Ambiente do sistema: produção e Chromium do PDF numa pasta do próprio sistema
# (a tarefa roda como SYSTEM, que não enxerga a pasta do usuário que instalou).
$env:NODE_ENV = 'production'
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $raiz '.navegadores'

function Limpar-Log {
  if ((Test-Path $log) -and (Get-Item $log).Length -gt 10MB) {
    for ($i = 4; $i -ge 1; $i--) {
      $a = "$log.$i"
      if (Test-Path $a) { Move-Item $a "$log.$($i + 1)" -Force }
    }
    Move-Item $log "$log.1" -Force
  }
}

$falhasRapidas = 0
while ($true) {
  Limpar-Log
  $inicio = Get-Date
  Write-Log "Iniciando o JAT Quote ($node $servidor)" -Arquivo servico
  # cmd grava a saída do Node como ela é (UTF-8), acrescentando ao log.
  Push-Location (Join-Path $raiz 'apps\api')
  try {
    & cmd.exe /d /c "`"$node`" `"$servidor`" >> `"$log`" 2>&1"
    $codigo = $LASTEXITCODE
  } finally {
    Pop-Location
  }
  $durou = ((Get-Date) - $inicio).TotalSeconds

  # Caiu logo depois de iniciar várias vezes seguidas: espera mais (banco fora do ar, porta ocupada...).
  if ($durou -lt 30) { $falhasRapidas++ } else { $falhasRapidas = 0 }
  $espera = [math]::Min(60, 5 * [math]::Max(1, $falhasRapidas))
  Write-Log "O JAT Quote parou (código $codigo, após $([int]$durou) s). Reiniciando em $espera s. Detalhes em logs\jat-quote.log." -Arquivo servico -Nivel Aviso
  Start-Sleep -Seconds $espera
}
