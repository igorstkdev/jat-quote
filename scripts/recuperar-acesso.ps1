<#
  JAT Quote — recupera o acesso de um Admin que esqueceu a senha.

  No PowerShell como Administrador, na pasta do sistema:
    powershell -ExecutionPolicy Bypass -File scripts\recuperar-acesso.ps1            (usuário "admin")
    powershell -ExecutionPolicy Bypass -File scripts\recuperar-acesso.ps1 maria      (outro Admin)

  Mostra uma senha temporária UMA vez, exige a troca no próximo acesso, desbloqueia o usuário,
  encerra as sessões abertas e registra na auditoria.
#>
param([string]$Usuario = 'admin')

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\comum.ps1"
if (-not (Test-Administrador)) { Write-Host 'Abra o PowerShell como Administrador.' -ForegroundColor Red; exit 1 }
$node = Get-Node
Push-Location (Join-Path (Get-Raiz) 'apps\api')
try {
  & $node 'dist\recuperar-acesso-cli.js' $Usuario
  exit $LASTEXITCODE
} finally { Pop-Location }
