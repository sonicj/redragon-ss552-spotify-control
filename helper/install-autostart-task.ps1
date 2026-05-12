$ErrorActionPreference = "Stop"

$helperDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$taskName = "Spotify Control Helper"
$taskScript = Join-Path $helperDir "start-helper-task.ps1"
$oldStartupShortcut = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup\Spotify Control Helper.lnk"
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$logDir = Join-Path $env:APPDATA "RedragonSpotifyControl\logs"
$logPath = Join-Path $logDir "autostart.log"

function Write-InstallLog {
  param([string]$Message)
  if (-not (Test-Path -LiteralPath $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
  }
  Add-Content -LiteralPath $logPath -Value "$(Get-Date -Format o) install-autostart-task.ps1 $Message" -Encoding UTF8
}

if (-not (Test-Path -LiteralPath $taskScript)) {
  throw "Missing $taskScript"
}

$actionArguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$taskScript`""
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $actionArguments -WorkingDirectory $helperDir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable
$task = New-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings

Write-InstallLog "Registering task '$taskName' for user '$currentUser'."
Write-InstallLog "Action: powershell.exe $actionArguments"
Write-InstallLog "Working directory: $helperDir"
Register-ScheduledTask -TaskName $taskName -InputObject $task -Force | Out-Null
Write-InstallLog "Registered task '$taskName'."

if (Test-Path -LiteralPath $oldStartupShortcut) {
  Remove-Item -LiteralPath $oldStartupShortcut -Force
  Write-InstallLog "Removed legacy Startup shortcut: $oldStartupShortcut"
}
