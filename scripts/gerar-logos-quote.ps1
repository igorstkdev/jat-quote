<#
  JAT Quote — gera as versões da logo do Quote a partir do original (fundo transparente,
  "Q" branco feito para fundo escuro).

  Uso: powershell -ExecutionPolicy Bypass -File scripts\gerar-logos-quote.ps1 [-Original <png>]

  Saída em apps\web\public\brand:
    logo-quote-branco.png           original (fundo escuro)
    logo-quote.png                  "Q" no azul JAT e subtítulo escuro (fundo claro)
    logo-quote-compacta*.png        as duas, sem o subtítulo "Cotações de Fretes" (tamanhos pequenos)
  e apps\web\public\favicon.png (o símbolo Q + seta).
#>
param([string]$Original = (Join-Path $PSScriptRoot '..\apps\web\public\brand\logo-quote-original.png'))

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$destino = Join-Path $PSScriptRoot '..\apps\web\public\brand'

# Área útil do original (1620x720) e limites das partes.
$recorte = New-Object System.Drawing.Rectangle 84, 90, 1492, 523
$inicioSubtituloX = 860 - 84   # o subtítulo começa à direita do símbolo
$inicioSubtituloY = 452 - 90
$fimSimboloX = 700 - 84

$AZUL_JAT = [System.Drawing.Color]::FromArgb(31, 66, 138)      # #1F428A
$SUBTITULO_CLARO = [System.Drawing.Color]::FromArgb(84, 99, 128) # cinza-azulado legível no branco

function Ler([string]$caminho) {
  $b = [System.Drawing.Bitmap]::FromFile((Resolve-Path $caminho))
  $c = $b.Clone($recorte, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $b.Dispose()
  return $c
}

function Pixels([System.Drawing.Bitmap]$bmp, [scriptblock]$fn) {
  $r = New-Object System.Drawing.Rectangle 0, 0, $bmp.Width, $bmp.Height
  $d = $bmp.LockBits($r, 'ReadWrite', [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $n = $d.Stride * $bmp.Height
  $buf = New-Object byte[] $n
  [Runtime.InteropServices.Marshal]::Copy($d.Scan0, $buf, 0, $n)
  for ($y = 0; $y -lt $bmp.Height; $y++) {
    for ($x = 0; $x -lt $bmp.Width; $x++) {
      $i = $y * $d.Stride + $x * 4
      if ($buf[$i + 3] -gt 0) { & $fn $buf $i $x $y }
    }
  }
  [Runtime.InteropServices.Marshal]::Copy($buf, 0, $d.Scan0, $n)
  $bmp.UnlockBits($d)
}

function Salvar([System.Drawing.Bitmap]$bmp, [string]$nome) {
  $bmp.Save((Join-Path $destino $nome), [System.Drawing.Imaging.ImageFormat]::Png)
}

function SemSubtitulo([System.Drawing.Bitmap]$bmp) {
  Pixels $bmp { param($b, $i, $x, $y) if ($x -ge $inicioSubtituloX -and $y -ge $inicioSubtituloY) { $b[$i + 3] = 0 } }
}

# 1) Original (fundo escuro)
$branco = Ler $Original
Salvar $branco 'logo-quote-branco.png'
SemSubtitulo $branco
Salvar $branco 'logo-quote-compacta-branco.png'
$branco.Dispose()

# 2) Fundo claro: "Q" branco → azul JAT; subtítulo claro → cinza-azulado escuro (BGRA)
$claro = Ler $Original
Pixels $claro {
  param($b, $i, $x, $y)
  # (PowerShell não diferencia maiúsculas: nada de $B/$b.)
  $cAzul = $b[$i]; $cVerde = $b[$i + 1]; $cVermelho = $b[$i + 2]
  if ($x -lt $fimSimboloX -and $cVermelho -gt 200 -and $cVerde -gt 200 -and $cAzul -gt 200) {
    $b[$i] = $AZUL_JAT.B; $b[$i + 1] = $AZUL_JAT.G; $b[$i + 2] = $AZUL_JAT.R
  } elseif ($x -ge $inicioSubtituloX -and $y -ge $inicioSubtituloY -and $cAzul -gt $cVermelho) {
    $b[$i] = $SUBTITULO_CLARO.B; $b[$i + 1] = $SUBTITULO_CLARO.G; $b[$i + 2] = $SUBTITULO_CLARO.R
  }
}
Salvar $claro 'logo-quote.png'

# 3) Favicon: só o símbolo (Q + seta), quadrado 256 px. Apaga o começo do "Quote" que fica
#    acima da ponta da seta (x >= 580 e y < 380 na área recortada).
$soSimbolo = $claro.Clone((New-Object System.Drawing.Rectangle 0, 0, $claro.Width, $claro.Height), $claro.PixelFormat)
Pixels $soSimbolo { param($b, $i, $x, $y) if ($x -ge 580 -and $y -lt 380) { $b[$i + 3] = 0 } }
$fav = New-Object System.Drawing.Bitmap 256, 256, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($fav)
$g.InterpolationMode = 'HighQualityBicubic'; $g.SmoothingMode = 'HighQuality'
$simbolo = New-Object System.Drawing.Rectangle 0, 0, $fimSimboloX, $claro.Height
$lado = [math]::Max($simbolo.Width, $simbolo.Height)
$escala = 248 / $lado
$w = [int]($simbolo.Width * $escala); $h = [int]($simbolo.Height * $escala)
$g.DrawImage($soSimbolo, (New-Object System.Drawing.Rectangle ([int]((256 - $w) / 2)), ([int]((256 - $h) / 2)), $w, $h), $simbolo, 'Pixel')
$g.Dispose()
$fav.Save((Join-Path $PSScriptRoot '..\apps\web\public\favicon.png'), [System.Drawing.Imaging.ImageFormat]::Png)
$fav.Dispose(); $soSimbolo.Dispose()

SemSubtitulo $claro
Salvar $claro 'logo-quote-compacta.png'
$claro.Dispose()
Write-Host 'Logos do Quote geradas.'
