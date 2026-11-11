<#
  JAT Quote — backup do banco PostgreSQL (pg_dump, formato custom).

  Uso:
    powershell -ExecutionPolicy Bypass -File scripts\backup.ps1
    powershell -ExecutionPolicy Bypass -File scripts\backup.ps1 -Destino "\\nas\backups\jat" -Manter 30

  - Destino padrão: BACKUP_DIR do .env ou a pasta "backups" do sistema.
  - Mantém as N cópias mais recentes (padrão: BACKUP_KEEP do .env ou 30) e apaga as mais antigas.
  - Confere o arquivo gerado (pg_restore --list). Registra tudo em logs\backup.log.
  - Agendado todo dia às 23h pelo instalador (tarefa "JAT Quote - Backup").
#>
param(
  [string]$Destino,
  [int]$Manter,
  [string]$PgBin,
  [string]$Sufixo = '',
  # Somente para testes: usa outro banco no lugar do DATABASE_URL do .env.
  [string]$DatabaseUrl
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\comum.ps1"

try {
  $cfg = Read-DotEnv
  if (-not $Destino) { $Destino = if ($cfg.BACKUP_DIR) { $cfg.BACKUP_DIR } else { Join-Path (Get-Raiz) 'backups' } }
  if (-not $Manter) { $Manter = if ($cfg.BACKUP_KEEP) { [int]$cfg.BACKUP_KEEP } else { 30 } }
  if ($Manter -lt 1) { throw 'Manter deve ser 1 ou mais.' }
  $db = ConvertFrom-DatabaseUrl $(if ($DatabaseUrl) { $DatabaseUrl } else { $cfg.DATABASE_URL })
  $bin = Get-PgBin $(if ($PgBin) { $PgBin } else { $cfg.PG_BIN })

  if (-not (Test-Path $Destino)) { New-Item -ItemType Directory -Path $Destino -Force | Out-Null }
  $nome = '{0}_{1}{2}.dump' -f $db.Banco, (Get-Date -Format 'yyyy-MM-dd_HHmmss'), $(if ($Sufixo) { "_$Sufixo" } else { '' })
  $arquivo = Join-Path $Destino $nome

  $env:PGPASSWORD = $db.Senha
  & (Join-Path $bin 'pg_dump.exe') -h $db.Host -p $db.Porta -U $db.Usuario -F c -Z 6 -f $arquivo $db.Banco
  if ($LASTEXITCODE -ne 0) { throw "pg_dump terminou com erro ($LASTEXITCODE)." }

  # Confere se o arquivo é um backup válido e legível.
  & (Join-Path $bin 'pg_restore.exe') --list $arquivo | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "O arquivo gerado não pôde ser lido pelo pg_restore: $arquivo" }
  $tamanho = [math]::Round((Get-Item $arquivo).Length / 1KB, 1)
  Write-Log "Backup criado: $arquivo ($tamanho KB)" -Arquivo backup -Nivel Ok

  # Rotação: só os backups automáticos/manuais deste banco (os "antes-restauracao" ficam).
  $antigos = Get-ChildItem -LiteralPath $Destino -Filter "$($db.Banco)_*.dump" |
    Where-Object { $_.Name -match "^$([regex]::Escape($db.Banco))_\d{4}-\d{2}-\d{2}_\d{6}\.dump$" } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -Skip $Manter
  foreach ($a in $antigos) {
    Remove-Item -LiteralPath $a.FullName -Force
    Write-Log "Backup antigo removido: $($a.Name)" -Arquivo backup
  }
  Write-Output $arquivo
} catch {
  Write-Log "Falha no backup: $($_.Exception.Message)" -Arquivo backup -Nivel Erro
  exit 1
} finally {
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
}
