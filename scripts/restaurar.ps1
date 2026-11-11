<#
  JAT Quote — restaura um backup do banco.

  Uso:
    powershell -ExecutionPolicy Bypass -File scripts\restaurar.ps1                 (lista e escolhe)
    powershell -ExecutionPolicy Bypass -File scripts\restaurar.ps1 -Arquivo "backups\jat_quote_2026-11-11_230000.dump"

  O que faz:
    1. Pede para digitar RESTAURAR (o banco atual será substituído pelo backup).
    2. Faz um backup do estado atual (sufixo "antes-restauracao"), para poder voltar atrás.
    3. Para o sistema, restaura e inicia o sistema de novo.
#>
param(
  [string]$Arquivo,
  [string]$PgBin,
  # Pula a pergunta de confirmação (uso em scripts e testes).
  [switch]$Confirmar,
  # Somente para testes: restaura em outro banco no lugar do DATABASE_URL do .env.
  [string]$DatabaseUrl
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\comum.ps1"

$cfg = Read-DotEnv
$url = if ($DatabaseUrl) { $DatabaseUrl } else { $cfg.DATABASE_URL }
$db = ConvertFrom-DatabaseUrl $url
$bin = Get-PgBin $(if ($PgBin) { $PgBin } else { $cfg.PG_BIN })
$pasta = if ($cfg.BACKUP_DIR) { $cfg.BACKUP_DIR } else { Join-Path (Get-Raiz) 'backups' }

if (-not $Arquivo) {
  $lista = @(Get-ChildItem -LiteralPath $pasta -Filter '*.dump' -ErrorAction SilentlyContinue |
      Sort-Object LastWriteTime -Descending | Select-Object -First 15)
  if ($lista.Count -eq 0) { Write-Log "Nenhum backup encontrado em $pasta." -Arquivo backup -Nivel Erro; exit 1 }
  Write-Host "`nBackups em ${pasta}:`n"
  for ($i = 0; $i -lt $lista.Count; $i++) {
    Write-Host ("  [{0,2}] {1}  ({2:dd/MM/yyyy HH:mm}, {3:N0} KB)" -f ($i + 1), $lista[$i].Name, $lista[$i].LastWriteTime, ($lista[$i].Length / 1KB))
  }
  $n = Read-Host "`nNúmero do backup a restaurar (Enter cancela)"
  if (-not $n) { Write-Host 'Cancelado.'; exit 0 }
  $Arquivo = $lista[[int]$n - 1].FullName
}
if (-not (Test-Path -LiteralPath $Arquivo)) { Write-Log "Arquivo não encontrado: $Arquivo" -Arquivo backup -Nivel Erro; exit 1 }
$Arquivo = (Resolve-Path -LiteralPath $Arquivo).Path

if (-not $Confirmar) {
  Write-Host "`nATENÇÃO: o banco '$($db.Banco)' será SUBSTITUÍDO pelo backup:" -ForegroundColor Yellow
  Write-Host "  $Arquivo`n" -ForegroundColor Yellow
  if ((Read-Host 'Digite RESTAURAR para continuar') -cne 'RESTAURAR') { Write-Host 'Cancelado.'; exit 0 }
}

$tarefa = Get-ScheduledTask -TaskName $script:NomeTarefa -ErrorAction SilentlyContinue
$parouServico = $false
try {
  # 1. Backup do estado atual
  & "$PSScriptRoot\backup.ps1" -Sufixo 'antes-restauracao' -PgBin $bin -DatabaseUrl $url | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'Não foi possível fazer o backup de segurança. Nada foi alterado.' }

  # 2. Para o sistema (se estiver instalado como tarefa) para liberar as conexões
  if ($tarefa -and -not $DatabaseUrl) {
    & "$PSScriptRoot\servico.ps1" -Acao parar | Out-Null
    $parouServico = $true
  }

  # 3. Restaura
  $env:PGPASSWORD = $db.Senha
  & (Join-Path $bin 'pg_restore.exe') -h $db.Host -p $db.Porta -U $db.Usuario -d $db.Banco `
    --clean --if-exists --no-owner --single-transaction --exit-on-error $Arquivo
  if ($LASTEXITCODE -ne 0) { throw "pg_restore terminou com erro ($LASTEXITCODE). O banco não foi alterado." }
  Write-Log "Backup restaurado em '$($db.Banco)': $Arquivo" -Arquivo backup -Nivel Ok
} catch {
  Write-Log "Falha na restauração: $($_.Exception.Message)" -Arquivo backup -Nivel Erro
  exit 1
} finally {
  Remove-Item Env:\PGPASSWORD -ErrorAction SilentlyContinue
  if ($parouServico) { & "$PSScriptRoot\servico.ps1" -Acao iniciar | Out-Null }
}
