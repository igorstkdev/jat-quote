<#
  JAT Quote — gera instalador\jat-quote.ico (16 a 256 px) a partir de instalador\jat-quote.png.
  Usado no atalho, no instalador e no desinstalador. Rode de novo se a imagem mudar:
    powershell -ExecutionPolicy Bypass -File scripts\gerar-icone.ps1
#>
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$raiz = Split-Path -Parent $PSScriptRoot
$origem = Join-Path $raiz 'instalador\jat-quote.png'
$destino = Join-Path $raiz 'instalador\jat-quote.ico'

$img = [System.Drawing.Image]::FromFile($origem)
$tamanhos = 16, 24, 32, 48, 64, 128, 256
$imagens = foreach ($t in $tamanhos) {
  $bmp = New-Object System.Drawing.Bitmap $t, $t
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $g.DrawImage($img, 0, 0, $t, $t)
  $g.Dispose()
  $ms = New-Object System.IO.MemoryStream
  $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  , $ms.ToArray()
}
$img.Dispose()

# Formato ICO com as imagens em PNG (aceito pelo Windows Vista em diante).
$fs = [System.IO.File]::Create($destino)
$w = New-Object System.IO.BinaryWriter $fs
$w.Write([uint16]0); $w.Write([uint16]1); $w.Write([uint16]$tamanhos.Count)
$offset = 6 + 16 * $tamanhos.Count
for ($i = 0; $i -lt $tamanhos.Count; $i++) {
  $t = $tamanhos[$i]
  $lado = if ($t -ge 256) { 0 } else { $t }
  $w.Write([byte]$lado); $w.Write([byte]$lado); $w.Write([byte]0); $w.Write([byte]0)
  $w.Write([uint16]1); $w.Write([uint16]32)
  $w.Write([uint32]$imagens[$i].Length); $w.Write([uint32]$offset)
  $offset += $imagens[$i].Length
}
foreach ($b in $imagens) { $w.Write($b) }
$w.Close()
Write-Host "Ícone gerado: $destino"
