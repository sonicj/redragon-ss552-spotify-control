@echo off
setlocal

set "TASK_NAME=Spotify Control Helper"
set "OLD_STARTUP_SHORTCUT=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Spotify Control Helper.lnk"

schtasks /Delete /TN "%TASK_NAME%" /F >nul 2>nul
if errorlevel 1 (
  echo Scheduled task "%TASK_NAME%" was not found.
) else (
  echo Removed scheduled task "%TASK_NAME%".
)

if exist "%OLD_STARTUP_SHORTCUT%" (
  del "%OLD_STARTUP_SHORTCUT%" >nul 2>nul
  echo Removed old Startup-folder shortcut.
)

pause
