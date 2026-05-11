$ErrorActionPreference = "Stop"

$helperDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$taskName = "Spotify Control Helper"
$taskScript = Join-Path $helperDir "start-helper-task.ps1"
$oldStartupShortcut = Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup\Spotify Control Helper.lnk"
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

if (-not (Test-Path -LiteralPath $taskScript)) {
  throw "Missing $taskScript"
}

$actionArguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$taskScript`""
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $actionArguments -WorkingDirectory $helperDir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $currentUser
$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable
$task = New-ScheduledTask -Action $action -Trigger $trigger -Principal $principal -Settings $settings

Register-ScheduledTask -TaskName $taskName -InputObject $task -Force | Out-Null

if (Test-Path -LiteralPath $oldStartupShortcut) {
  Remove-Item -LiteralPath $oldStartupShortcut -Force
}
