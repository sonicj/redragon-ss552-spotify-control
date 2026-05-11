$ErrorActionPreference = "Stop"

$helperDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$serverPath = Join-Path $helperDir "server.js"
$configPath = Join-Path $helperDir "config.local.json"
$logPath = Join-Path $helperDir "helper-autostart.log"

function Write-AutostartLog {
  param([string]$Message)
  $line = "$(Get-Date -Format o) $Message"
  Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
}

try {
  $nodeCommand = Get-Command node.exe -ErrorAction Stop

  if (-not (Test-Path -LiteralPath $configPath)) {
    Write-AutostartLog "config.local.json is missing. Run start-helper.bat once from the helper folder to create and configure it."
    exit 0
  }

  $configText = Get-Content -LiteralPath $configPath -Raw
  if ($configText -match "paste-your-spotify-client-id-here") {
    Write-AutostartLog "config.local.json still contains the example Spotify Client ID."
    exit 0
  }

  $existing = Get-CimInstance Win32_Process -Filter "name='node.exe'" |
    Where-Object {
      $_.CommandLine -and
      $_.CommandLine -like "*server.js*" -and
      $_.CommandLine -like "*$helperDir*"
    } |
    Select-Object -First 1

  if ($existing) {
    Write-AutostartLog "Helper is already running as PID $($existing.ProcessId)."
    exit 0
  }

  Start-Process -FilePath $nodeCommand.Source -ArgumentList "`"$serverPath`"" -WorkingDirectory $helperDir -WindowStyle Hidden
  Write-AutostartLog "Started Spotify Control helper."
} catch {
  Write-AutostartLog "Failed to start helper: $($_.Exception.Message)"
  exit 0
}
