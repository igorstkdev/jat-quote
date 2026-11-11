<#
  JAT Quote — funções usadas pelos scripts de instalação, backup e serviço.
  Carregue com:  . "$PSScriptRoot\comum.ps1"
#>

$script:Raiz = Split-Path -Parent $PSScriptRoot
$script:NomeTarefa = 'JAT Quote'

function Get-Raiz { $script:Raiz }

<# Lê o .env da raiz como hashtable (ignora comentários e linhas vazias). #>
function Read-DotEnv {
  param([string]$Arquivo = (Join-Path $script:Raiz '.env'))
  if (-not (Test-Path $Arquivo)) { throw "Arquivo .env não encontrado em $Arquivo." }
  $vars = @{}
  foreach ($linha in Get-Content -LiteralPath $Arquivo -Encoding UTF8) {
    if ($linha -match '^\s*#' -or $linha -notmatch '=') { continue }
    $k, $v = $linha -split '=', 2
    $vars[$k.Trim()] = $v.Trim().Trim('"')
  }
  return $vars
}

<# Grava/atualiza uma chave no .env, preservando o resto do arquivo (UTF-8 sem BOM). #>
function Set-DotEnvValue {
  param([string]$Chave, [string]$Valor, [string]$Arquivo = (Join-Path $script:Raiz '.env'))
  $linhas = @(Get-Content -LiteralPath $Arquivo -Encoding UTF8)
  $achou = $false
  for ($i = 0; $i -lt $linhas.Count; $i++) {
    if ($linhas[$i] -match "^\s*$([regex]::Escape($Chave))\s*=") {
      $linhas[$i] = "$Chave=$Valor"
      $achou = $true
    }
  }
  if (-not $achou) { $linhas += "$Chave=$Valor" }
  [System.IO.File]::WriteAllText($Arquivo, ($linhas -join "`r`n") + "`r`n", (New-Object System.Text.UTF8Encoding($false)))
}

<# Separa postgresql://usuario:senha@host:porta/banco nas partes. #>
function ConvertFrom-DatabaseUrl {
  param([Parameter(Mandatory)][string]$Url)
  $m = [regex]::Match($Url, '^postgres(?:ql)?://([^:@/]+)(?::([^@/]*))?@([^:/]+)(?::(\d+))?/([^?]+)')
  if (-not $m.Success) { throw "DATABASE_URL inválida: use postgresql://usuario:senha@host:porta/banco" }
  [pscustomobject]@{
    Usuario = [uri]::UnescapeDataString($m.Groups[1].Value)
    Senha   = [uri]::UnescapeDataString($m.Groups[2].Value)
    Host    = $m.Groups[3].Value
    Porta   = if ($m.Groups[4].Success) { [int]$m.Groups[4].Value } else { 5432 }
    Banco   = $m.Groups[5].Value
  }
}

<# Pasta bin do PostgreSQL: a informada, PG_BIN do .env ou a versão mais nova em Arquivos de Programas. #>
function Get-PgBin {
  param([string]$Informada)
  if ($Informada) {
    if (Test-Path (Join-Path $Informada 'pg_dump.exe')) { return $Informada }
    throw "pg_dump.exe não encontrado em $Informada."
  }
  $base = Join-Path $env:ProgramFiles 'PostgreSQL'
  if (Test-Path $base) {
    $versoes = Get-ChildItem $base -Directory |
      Where-Object { Test-Path (Join-Path $_.FullName 'bin\pg_dump.exe') } |
      Sort-Object { [int]($_.Name -replace '\D', '0') } -Descending
    if ($versoes) { return (Join-Path $versoes[0].FullName 'bin') }
  }
  throw "PostgreSQL não encontrado em $base. Informe -PgBin ""<pasta>\bin""."
}

<# Escreve na tela e num arquivo de log (logs\<nome>.log). #>
function Write-Log {
  param([string]$Mensagem, [string]$Arquivo = 'scripts', [ValidateSet('Info', 'Ok', 'Aviso', 'Erro')][string]$Nivel = 'Info')
  $pasta = Join-Path $script:Raiz 'logs'
  if (-not (Test-Path $pasta)) { New-Item -ItemType Directory $pasta | Out-Null }
  $linha = "{0} [{1}] {2}" -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Nivel.ToUpper(), $Mensagem
  Add-Content -LiteralPath (Join-Path $pasta "$Arquivo.log") -Value $linha -Encoding UTF8
  $cor = @{ Info = 'Gray'; Ok = 'Green'; Aviso = 'Yellow'; Erro = 'Red' }[$Nivel]
  Write-Host $Mensagem -ForegroundColor $cor
}

function Test-Administrador {
  $p = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
  return $p.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
