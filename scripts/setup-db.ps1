<#
  JAT Quote — cria o usuário "jat" e os bancos jat_quote e jat_quote_test no PostgreSQL.

  Uso (PowerShell, na raiz do projeto):
    powershell -ExecutionPolicy Bypass -File scripts\setup-db.ps1

  O psql pede a senha do superusuário "postgres" (ela não é gravada em lugar nenhum).
  A senha do usuário "jat" é lida de DB_PASSWORD no arquivo .env.
  Pode ser executado mais de uma vez: o que já existe é mantido (a senha do "jat" é atualizada).
#>
param(
  [string]$PgBin = "C:\Program Files\PostgreSQL\18\bin",
  [string]$PgHost = "localhost",
  [int]$PgPort = 5432,
  [string]$SuperUser = "postgres"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root ".env"
if (-not (Test-Path $envFile)) { throw "Arquivo .env não encontrado em $root. Copie o .env.example para .env primeiro." }

$line = Get-Content $envFile | Where-Object { $_ -match '^\s*DB_PASSWORD\s*=' } | Select-Object -First 1
if (-not $line) { throw "DB_PASSWORD não definida no .env." }
$pass = ($line -split '=', 2)[1].Trim()
if ($pass -notmatch '^[A-Za-z0-9]+$') { throw "DB_PASSWORD deve conter apenas letras e números." }

$psql = Join-Path $PgBin "psql.exe"
if (-not (Test-Path $psql)) { throw "psql não encontrado em $PgBin. Informe -PgBin." }

$sql = @"
DO `$`$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'jat') THEN
    CREATE ROLE jat LOGIN PASSWORD '$pass';
  ELSE
    ALTER ROLE jat WITH LOGIN PASSWORD '$pass';
  END IF;
END
`$`$;
-- Necessário para o "prisma migrate dev" criar o banco-sombra.
ALTER ROLE jat CREATEDB;
SELECT 'CREATE DATABASE jat_quote OWNER jat ENCODING ''UTF8'' TEMPLATE template0'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'jat_quote')\gexec
SELECT 'CREATE DATABASE jat_quote_test OWNER jat ENCODING ''UTF8'' TEMPLATE template0'
  WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'jat_quote_test')\gexec
"@

$tmp = New-TemporaryFile
try {
  # UTF-8 SEM BOM: no Windows PowerShell 5.1, "-Encoding UTF8" grava um BOM que o psql não aceita.
  [System.IO.File]::WriteAllText($tmp.FullName, $sql, (New-Object System.Text.UTF8Encoding($false)))
  & $psql -h $PgHost -p $PgPort -U $SuperUser -d postgres -v ON_ERROR_STOP=1 -f $tmp
  if ($LASTEXITCODE -ne 0) { throw "psql terminou com erro ($LASTEXITCODE)." }
  Write-Host "`nPronto: usuário 'jat' e bancos 'jat_quote' e 'jat_quote_test' configurados." -ForegroundColor Green
} finally {
  Remove-Item $tmp -Force
}
