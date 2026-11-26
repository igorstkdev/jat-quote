<#
  JAT Quote — gera o instalador gráfico (instalador\saida\JAT-Quote-Setup-<versão>.exe).

  Uso (na máquina de desenvolvimento, na raiz do projeto):
    powershell -ExecutionPolicy Bypass -File scripts\gerar-instalador.ps1

  Requisitos nesta máquina: Inno Setup 6, internet (só na primeira vez, para as dependências e o
  Chromium) e os zips oficiais em instalador\cache:
    - node-v<versão>-win-x64.zip                  (https://nodejs.org)
    - postgresql-<versão>-windows-x64-binaries.zip (https://www.enterprisedb.com)

  O pacote leva o sistema já compilado, as dependências de produção, o Node.js, o PostgreSQL e o
  Chromium dos PDFs. O servidor não precisa de internet nem de nada instalado antes.
#>
param(
  [string]$NodeZip = 'node-v26.13.0-win-x64.zip',
  [string]$PgZip = 'postgresql-18.6-1-windows-x64-binaries.zip',
  [switch]$SemCompilar,
  # Só gera o .exe de novo a partir de instalador\pacote já montado.
  [switch]$SoSetup
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\comum.ps1"
$raiz = Get-Raiz
Set-Location $raiz

$cache = Join-Path $raiz 'instalador\cache'
$pacote = Join-Path $raiz 'instalador\pacote'
$app = Join-Path $pacote 'app'
$versao = (Get-Content (Join-Path $raiz 'package.json') -Raw | ConvertFrom-Json).version

function Etapa([string]$t) { Write-Host "`n== $t" -ForegroundColor Cyan }
function Executar([string]$descricao, [scriptblock]$comando) {
  $global:LASTEXITCODE = 0
  & $comando
  if ($LASTEXITCODE -ne 0) { throw "$descricao falhou (código $LASTEXITCODE)." }
}
function Copiar([string]$origem, [string]$destino) {
  New-Item -ItemType Directory -Force (Split-Path $destino) | Out-Null
  Copy-Item -LiteralPath (Join-Path $raiz $origem) -Destination $destino -Recurse -Force
}

$iscc = @(
  (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 6\ISCC.exe'),
  (Join-Path ${env:ProgramFiles(x86)} 'Inno Setup 6\ISCC.exe'),
  (Join-Path $env:ProgramFiles 'Inno Setup 6\ISCC.exe')
) | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) { throw 'Inno Setup 6 não encontrado. Instale: winget install JRSoftware.InnoSetup' }
foreach ($z in @($NodeZip, $PgZip)) {
  if (-not (Test-Path (Join-Path $cache $z))) { throw "Falta instalador\cache\$z (veja o cabeçalho deste script)." }
}

if ($SoSetup) {
  if (-not (Test-Path (Join-Path $app 'apps\api\dist\server.js'))) { throw 'Pacote não montado: rode sem -SoSetup.' }
} else {

if (-not $SemCompilar) {
  Etapa 'Compilando o sistema'
  Executar 'Compilação' { & npm.cmd run build }
}

Etapa 'Montando o pacote'
if (Test-Path $pacote) { Remove-Item $pacote -Recurse -Force }
New-Item -ItemType Directory $app | Out-Null

# Sistema compilado + package.json para instalar só as dependências de produção da API e do core.
foreach ($c in @(
    'package.json', 'package-lock.json', '.env.example', 'README.md', 'CHECKLIST.md',
    'apps\api\package.json', 'apps\api\prisma.config.ts', 'apps\api\prisma', 'apps\api\dist',
    'apps\api\assets',
    'apps\web\package.json', 'apps\web\dist',
    'packages\core\package.json', 'packages\core\dist'
  )) { Copiar $c (Join-Path $app $c) }
New-Item -ItemType Directory (Join-Path $app 'scripts') | Out-Null
Get-ChildItem (Join-Path $raiz 'scripts\*.ps1') |
  Where-Object { $_.Name -notin @('gerar-instalador.ps1', 'gerar-icone.ps1', 'instalar.ps1', 'atualizar.ps1') } |
  Copy-Item -Destination (Join-Path $app 'scripts')

Etapa 'Dependências de produção (API e núcleo)'
Push-Location $app
try {
  $env:DATABASE_URL = 'postgresql://pacote:pacote@localhost:5432/pacote' # só para o "prisma generate"
  Executar 'npm ci' { & npm.cmd ci --omit=dev --no-audit --no-fund -w @jat/api -w @jat/core --include-workspace-root }
} finally {
  Remove-Item Env:\DATABASE_URL -ErrorAction SilentlyContinue
  Pop-Location
}
# O cliente do Prisma já está compilado em apps\api\dist\generated.
Remove-Item (Join-Path $app 'apps\api\src') -Recurse -Force -ErrorAction SilentlyContinue
# Os workspaces viram links (junções) no node_modules: troca por cópias reais para o instalador.
foreach ($ws in @('@jat\api', '@jat\core', '@jat\web')) {
  $link = Join-Path $app "node_modules\$ws"
  if (Test-Path $link) {
    cmd.exe /c rmdir "$link" | Out-Null
    if ($ws -eq '@jat\core') { Copy-Item -LiteralPath (Join-Path $app 'packages\core') -Destination $link -Recurse }
  }
}

Etapa 'Node.js embutido'
$tmp = Join-Path $pacote 'tmp'
Expand-Archive (Join-Path $cache $NodeZip) $tmp -Force
$pastaNode = Get-ChildItem $tmp -Directory | Where-Object { $_.Name -like 'node-*' } | Select-Object -First 1
New-Item -ItemType Directory (Join-Path $app 'runtime\node') -Force | Out-Null
Copy-Item (Join-Path $pastaNode.FullName 'node.exe'), (Join-Path $pastaNode.FullName 'LICENSE') (Join-Path $app 'runtime\node')
Remove-Item $tmp -Recurse -Force

Etapa 'PostgreSQL embutido (sem pgAdmin, documentação e arquivos de desenvolvimento)'
Expand-Archive (Join-Path $cache $PgZip) $tmp -Force
$pg = Join-Path $tmp 'pgsql'
foreach ($p in @('pgAdmin 4', 'pgAdmin', 'doc', 'include', 'symbols', 'StackBuilder')) {
  $c = Join-Path $pg $p
  if (Test-Path $c) { Remove-Item $c -Recurse -Force }
}
Get-ChildItem $pg -Filter '*pgAdmin*' -File | Remove-Item -Force
Get-ChildItem $pg -Filter 'StackBuilder*' -File | Remove-Item -Force
Move-Item $pg (Join-Path $app 'runtime\pgsql')
Remove-Item $tmp -Recurse -Force
# Runtime do Visual C++ junto do PostgreSQL (implantação local permitida pela Microsoft),
# para funcionar em servidor sem o "Visual C++ Redistributable" instalado.
foreach ($dll in @('vcruntime140.dll', 'vcruntime140_1.dll', 'msvcp140.dll')) {
  $origem = Join-Path $env:SystemRoot "System32\$dll"
  if (-not (Test-Path $origem)) { throw "$dll não encontrada nesta máquina (instale o Visual C++ Redistributable x64)." }
  Copy-Item $origem (Join-Path $app 'runtime\pgsql\bin')
}

Etapa 'Chromium dos PDFs'
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path $app '.navegadores'
try {
  Executar 'Chromium' { & (Join-Path $app 'runtime\node\node.exe') (Join-Path $app 'node_modules\playwright-core\cli.js') install --only-shell chromium }
} finally { Remove-Item Env:\PLAYWRIGHT_BROWSERS_PATH }

Etapa 'Removendo arquivos de depuração (.map)'
Get-ChildItem $app -Recurse -File -Filter '*.map' | Remove-Item -Force

} # fim da montagem do pacote

Etapa 'Conferindo o pacote'
# Tudo que o sistema lê do disco em produção. Faltou algo = o setup NÃO é gerado
# (22/11/2026: a logo do PDF ficou de fora e o PDF dava "erro interno" só no instalado).
$obrigatorios = @(
  'apps\api\dist\server.js',
  'apps\api\dist\recuperar-acesso-cli.js',
  'apps\api\dist\seed-cli.js',
  'apps\api\package.json',
  'apps\api\prisma\schema.prisma',
  'apps\api\assets\logo-jat.png',
  'apps\api\assets\logo-quote.png',
  'apps\api\dist\seed-demo-cli.js',
  'apps\web\dist\index.html',
  'apps\web\dist\favicon.png',
  'apps\web\dist\brand\logo-jat.png',
  'apps\web\dist\brand\logo-jat-clean.png',
  'apps\web\dist\brand\logo-quote.png',
  'node_modules\prisma\build\index.js',
  'node_modules\playwright-core\cli.js',
  'runtime\node\node.exe',
  'runtime\pgsql\bin\pg_ctl.exe',
  'scripts\configurar.ps1',
  'scripts\executar.ps1'
)
$faltando = $obrigatorios | Where-Object { -not (Test-Path (Join-Path $app $_)) }
if (-not (Get-ChildItem (Join-Path $app '.navegadores') -Recurse -Filter 'chrome-headless-shell.exe' -ErrorAction SilentlyContinue)) {
  $faltando += '.navegadores\...\chrome-headless-shell.exe (Chromium dos PDFs)'
}
if ($faltando) { throw "Pacote incompleto. Faltam:`n  - $($faltando -join "`n  - ")" }
Write-Host "  $($obrigatorios.Count + 1) arquivos obrigatórios conferidos."
$tamanho = [math]::Round(((Get-ChildItem $app -Recurse -File | Measure-Object Length -Sum).Sum) / 1MB)
Write-Host "  $tamanho MB em $app"

Etapa 'Gerando o instalador (sistema real)'
Executar 'Inno Setup' { & $iscc "/DAppVersion=$versao" (Join-Path $raiz 'instalador\jat-quote.iss') }
# Edição de demonstração (25/11/2026): mesmo pacote, só o instalador muda.
Etapa 'Gerando o instalador da demonstração'
Executar 'Inno Setup (demo)' { & $iscc "/DAppVersion=$versao" '/DDemo' (Join-Path $raiz 'instalador\jat-quote.iss') }
foreach ($nome in @("JAT-Quote-Setup-$versao.exe", "Quote-Demo-Setup-$versao.exe")) {
  $exe = Get-Item (Join-Path $raiz "instalador\saida\$nome")
  Write-Host "Pronto: $($exe.FullName) ($([math]::Round($exe.Length / 1MB)) MB)" -ForegroundColor Green
}
