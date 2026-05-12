$ErrorActionPreference = "Stop"

$helperDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverPath = Join-Path $helperDir "server.js"
$configPath = Join-Path $helperDir "config.local.json"
$logDir = Join-Path $env:APPDATA "RedragonSpotifyControl\logs"
$logPath = Join-Path $logDir "autostart.log"
$nodeStdoutPath = Join-Path $logDir "node-autostart.stdout.log"
$nodeStderrPath = Join-Path $logDir "node-autostart.stderr.log"

function Write-AutostartLog {
  param([string]$Message)
  if (-not (Test-Path -LiteralPath $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  }
  $line = "$(Get-Date -Format o) $Message"
  Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
}

try {
  Write-AutostartLog "start-helper-task.ps1 invoked."
  Write-AutostartLog "User: $([System.Security.Principal.WindowsIdentity]::GetCurrent().Name)"
  Write-AutostartLog "Helper directory: $helperDir"
  Write-AutostartLog "Server path: $serverPath"
  Write-AutostartLog "Working directory for node: $helperDir"

  $nodeCommand = Get-Command node.exe -ErrorAction Stop
  Write-AutostartLog "Node command: $($nodeCommand.Source)"

  if (-not (Test-Path -LiteralPath $configPath)) {
    Write-AutostartLog "config.local.json is missing. Run start-helper.bat once from the helper folder to create and configure it."
    exit 0
  }

  $configText = Get-Content -LiteralPath $configPath -Raw
  if ($configText -match "paste-your-spotify-client-id-here") {
    Write-AutostartLog "config.local.json still contains the example Spotify Client ID."
    exit 0
  }

  $serverPathLower = $serverPath.ToLowerInvariant()
  $helperProcesses = Get-CimInstance Win32_Process -Filter "name='node.exe'" |
    Where-Object {
      $_.CommandLine -and
      $_.CommandLine -like "*server.js*"
    }

  foreach ($helperProcess in $helperProcesses) {
    $commandLine = [string]$helperProcess.CommandLine

    if ($commandLine.ToLowerInvariant().Contains($serverPathLower)) {
      Write-AutostartLog "Helper is already running from this helper folder as PID $($helperProcess.ProcessId)."
      exit 0
    }

    Write-AutostartLog "Stopping stale helper PID $($helperProcess.ProcessId): $commandLine"
    Stop-Process -Id $helperProcess.ProcessId -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
  }

  $nodeArguments = "`"$serverPath`""
  Write-AutostartLog "Launching: $($nodeCommand.Source) $nodeArguments"
  $process = Start-Process -FilePath $nodeCommand.Source -ArgumentList $nodeArguments -WorkingDirectory $helperDir -WindowStyle Hidden -RedirectStandardOutput $nodeStdoutPath -RedirectStandardError $nodeStderrPath -PassThru
  Start-Sleep -Seconds 2

  $process.Refresh()
  if ($process.HasExited) {
    Write-AutostartLog "Node exited early with code $($process.ExitCode)."
    if (Test-Path -LiteralPath $nodeStderrPath) {
      $stderrTail = Get-Content -LiteralPath $nodeStderrPath -Tail 20 -ErrorAction SilentlyContinue
      if ($stderrTail) {
        Write-AutostartLog "Recent node stderr: $($stderrTail -join ' | ')"
      }
    }
    exit 0
  }

  Write-AutostartLog "Started Spotify Control helper as PID $($process.Id)."
} catch {
  Write-AutostartLog "Failed to start helper: $($_.Exception.Message)"
  exit 0
}
