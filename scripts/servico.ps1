<#
  JAT Quote — controla o sistema no servidor (tarefa "JAT Quote" do Agendador de Tarefas).

  Uso (PowerShell como Administrador, na pasta do sistema):
    powershell -ExecutionPolicy Bypass -File scripts\servico.ps1 -Acao status
    powershell -ExecutionPolicy Bypass -File scripts\servico.ps1 -Acao iniciar
    powershell -ExecutionPolicy Bypass -File scripts\servico.ps1 -Acao parar
    powershell -ExecutionPolicy Bypass -File scripts\servico.ps1 -Acao reiniciar
    powershell -ExecutionPolicy Bypass -File scripts\servico.ps1 -Acao instalar   (feito pelo instalador)
    powershell -ExecutionPolicy Bypass -File scripts\servico.ps1 -Acao remover

  "instalar" cria:
    - a tarefa "JAT Quote": inicia com o Windows (mesmo sem ninguém logado), como SYSTEM,
      e é reiniciada se cair;
    - a tarefa "JAT Quote - Backup": backup do banco todo dia às 23h (scripts\backup.ps1);
    - a regra do Firewall liberando a porta do .env (padrão 3333) só para a rede local.
#>
param(
  [Parameter(Mandatory)][ValidateSet('instalar', 'remover', 'iniciar', 'parar', 'reiniciar', 'status')]
  [string]$Acao,
  [string]$HoraBackup = '23:00'
)

$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\comum.ps1"

$raiz = Get-Raiz
$tarefa = $script:NomeTarefa
$tarefaBackup = "$tarefa - Backup"
$cfg = Read-DotEnv
$porta = if ($cfg.PORT) { [int]$cfg.PORT } else { 3333 }
$regraFirewall = "JAT Quote (porta $porta)"
$servidor = Join-Path $raiz 'apps\api\dist\server.js'

function Exigir-Administrador {
  if (-not (Test-Administrador)) {
    throw 'Abra o PowerShell como Administrador (clique com o botão direito > Executar como administrador).'
  }
}

function Test-Saude {
  try {
    $r = Invoke-RestMethod -Uri "http://127.0.0.1:$porta/api/health" -TimeoutSec 3
    return $r.status -eq 'ok'
  } catch { return $false }
}

<# Encerra o Node do JAT Quote (ao parar a tarefa, o Windows não encerra os processos filhos). #>
function Stop-NodeDoSistema {
  $alvo = $servidor.ToLowerInvariant()
  Get-CimInstance Win32_Process -Filter "Name='node.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine.ToLowerInvariant().Contains($alvo) } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

function Aguardar-Saude([int]$Segundos = 60) {
  $fim = (Get-Date).AddSeconds($Segundos)
  while ((Get-Date) -lt $fim) {
    if (Test-Saude) { return $true }
    Start-Sleep -Seconds 2
  }
  return $false
}

function Mostrar-Enderecos {
  $ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.254.*' -and $_.PrefixOrigin -ne 'WellKnown' } |
    Select-Object -ExpandProperty IPAddress
  Write-Host "`nOs operadores acessam pelo navegador:" -ForegroundColor Cyan
  Write-Host "  http://$($env:COMPUTERNAME.ToLower()):$porta" -ForegroundColor Cyan
  foreach ($ip in $ips) { Write-Host "  http://${ip}:$porta" -ForegroundColor Cyan }
}

switch ($Acao) {
  'instalar' {
    Exigir-Administrador
    $ps = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

    # Sistema: inicia com o Windows, sem limite de tempo, reinicia se a tarefa falhar.
    $acao = New-ScheduledTaskAction -Execute $ps -WorkingDirectory $raiz `
      -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$raiz\scripts\executar.ps1`""
    $config = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
      -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew `
      -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)
    Register-ScheduledTask -TaskName $tarefa -Action $acao -Principal $principal -Settings $config `
      -Trigger (New-ScheduledTaskTrigger -AtStartup) -Force `
      -Description 'JAT Quote - Cotação de Fretes. Inicia com o Windows (scripts\executar.ps1).' | Out-Null
    Write-Log "Tarefa '$tarefa' criada (inicia com o Windows)." -Arquivo servico -Nivel Ok

    # Backup diário
    $acaoBackup = New-ScheduledTaskAction -Execute $ps -WorkingDirectory $raiz `
      -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$raiz\scripts\backup.ps1`""
    $configBackup = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
      -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)
    Register-ScheduledTask -TaskName $tarefaBackup -Action $acaoBackup -Principal $principal `
      -Settings $configBackup -Trigger (New-ScheduledTaskTrigger -Daily -At $HoraBackup) -Force `
      -Description 'JAT Quote - backup diário do banco (scripts\backup.ps1).' | Out-Null
    Write-Log "Tarefa '$tarefaBackup' criada (todo dia às $HoraBackup)." -Arquivo servico -Nivel Ok

    # Firewall: porta liberada só para a rede local
    Get-NetFirewallRule -DisplayName 'JAT Quote (porta *' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    New-NetFirewallRule -DisplayName $regraFirewall -Direction Inbound -Protocol TCP -LocalPort $porta `
      -Action Allow -Profile Domain, Private -RemoteAddress LocalSubnet | Out-Null
    Write-Log "Firewall: porta $porta liberada para a rede local." -Arquivo servico -Nivel Ok
  }

  'remover' {
    Exigir-Administrador
    Stop-ScheduledTask -TaskName $tarefa -ErrorAction SilentlyContinue
    Stop-NodeDoSistema
    Unregister-ScheduledTask -TaskName $tarefa -Confirm:$false -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $tarefaBackup -Confirm:$false -ErrorAction SilentlyContinue
    Get-NetFirewallRule -DisplayName 'JAT Quote (porta *' -ErrorAction SilentlyContinue | Remove-NetFirewallRule
    Write-Log 'Tarefas e regra do Firewall removidas. Banco, backups e arquivos continuam onde estão.' -Arquivo servico -Nivel Ok
  }

  'parar' {
    Exigir-Administrador
    Stop-ScheduledTask -TaskName $tarefa -ErrorAction SilentlyContinue
    Stop-NodeDoSistema
    Write-Log 'JAT Quote parado.' -Arquivo servico -Nivel Ok
  }

  { $_ -in 'iniciar', 'reiniciar' } {
    Exigir-Administrador
    if (-not (Get-ScheduledTask -TaskName $tarefa -ErrorAction SilentlyContinue)) {
      throw "A tarefa '$tarefa' não existe. Rode o instalador (scripts\instalar.ps1)."
    }
    Stop-ScheduledTask -TaskName $tarefa -ErrorAction SilentlyContinue
    Stop-NodeDoSistema
    Start-ScheduledTask -TaskName $tarefa
    Write-Host 'Aguardando o sistema responder...'
    if (Aguardar-Saude 90) {
      Write-Log "JAT Quote no ar na porta $porta." -Arquivo servico -Nivel Ok
      Mostrar-Enderecos
    } else {
      Write-Log "O sistema não respondeu em 90 s. Veja logs\jat-quote.log e logs\servico.log." -Arquivo servico -Nivel Erro
      exit 1
    }
  }

  'status' {
    $t = Get-ScheduledTask -TaskName $tarefa -ErrorAction SilentlyContinue
    $b = Get-ScheduledTask -TaskName $tarefaBackup -ErrorAction SilentlyContinue
    Write-Host ("Tarefa do sistema : {0}" -f $(if ($t) { $t.State } else { 'não instalada' }))
    Write-Host ("Tarefa de backup  : {0}" -f $(if ($b) { "$($b.State), próximo: $((Get-ScheduledTaskInfo -TaskName $tarefaBackup).NextRunTime)" } else { 'não instalada' }))
    if (Test-Saude) {
      Write-Host "Sistema           : no ar (http://127.0.0.1:$porta)" -ForegroundColor Green
      Mostrar-Enderecos
    } else {
      Write-Host "Sistema           : não está respondendo na porta $porta" -ForegroundColor Red
      exit 1
    }
  }
}
