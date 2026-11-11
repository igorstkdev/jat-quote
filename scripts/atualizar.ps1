<#
  JAT Quote — aplica uma nova versão do sistema no servidor.

  1. Coloque os arquivos da nova versão na pasta do sistema (ou deixe o script baixar com o git,
     se a pasta for um repositório git).
  2. No PowerShell como Administrador, na pasta do sistema:
       powershell -ExecutionPolicy Bypass -File scripts\atualizar.ps1

  O que faz: backup do banco → para o sistema → instala dependências → compila →
  aplica as migrations → atualiza o Chromium → inicia e confere se respondeu.
  Se algo falhar depois do backup, o sistema é iniciado de novo e o backup fica em backups\
  (sufixo "antes-atualizacao") para restaurar com scripts\restaurar.ps1, se preciso.
#>
param(
  # Não roda "git pull" mesmo que a pasta seja um repositório git.
  [switch]$SemGit
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\comum.ps1"
$raiz = Get-Raiz
Set-Location $raiz

function Executar([string]$descricao, [scriptblock]$comando) {
  & $comando
  if ($LASTEXITCODE -ne 0) { throw "$descricao falhou (código $LASTEXITCODE)." }
}

$parado = $false
try {
  if (-not (Test-Administrador)) { throw 'Abra o PowerShell como Administrador e rode de novo.' }

  if (-not $SemGit -and (Test-Path (Join-Path $raiz '.git')) -and (Get-Command git.exe -ErrorAction SilentlyContinue)) {
    Write-Host "`n[1/7] Baixando a nova versão (git pull)" -ForegroundColor Cyan
    Executar 'git pull' { & git.exe pull --ff-only }
  } else {
    Write-Host "`n[1/7] Usando os arquivos já copiados para a pasta" -ForegroundColor Cyan
  }

  Write-Host "`n[2/7] Backup do banco" -ForegroundColor Cyan
  Executar 'Backup' { & "$PSScriptRoot\backup.ps1" -Sufixo 'antes-atualizacao' }

  Write-Host "`n[3/7] Parando o sistema" -ForegroundColor Cyan
  & "$PSScriptRoot\servico.ps1" -Acao parar
  $parado = $true

  Write-Host "`n[4/7] Instalando dependências e compilando" -ForegroundColor Cyan
  Executar 'npm ci' { & npm.cmd ci --no-audit --no-fund }
  Executar 'Compilação' { & npm.cmd run build }

  Write-Host "`n[5/7] Atualizando a estrutura do banco" -ForegroundColor Cyan
  Executar 'Migrations' { & npm.cmd run db:deploy -w @jat/api }

  Write-Host "`n[6/7] Atualizando o Chromium dos PDFs" -ForegroundColor Cyan
  $env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $raiz '.navegadores'
  Executar 'Chromium' { & npx.cmd playwright install chromium }

  Write-Host "`n[7/7] Iniciando o sistema" -ForegroundColor Cyan
  & "$PSScriptRoot\servico.ps1" -Acao iniciar
  $parado = $false
  if ($LASTEXITCODE -ne 0) { throw 'O sistema não respondeu depois da atualização.' }
  Write-Log 'Atualização concluída.' -Arquivo instalacao -Nivel Ok
} catch {
  Write-Log "Atualização interrompida: $($_.Exception.Message)" -Arquivo instalacao -Nivel Erro
  if ($parado) {
    Write-Host 'Tentando iniciar o sistema de novo...' -ForegroundColor Yellow
    & "$PSScriptRoot\servico.ps1" -Acao iniciar
  }
  exit 1
}
