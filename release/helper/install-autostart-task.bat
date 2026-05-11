@echo off
setlocal

set "HELPER_DIR=%~dp0"
set "TASK_NAME=Spotify Control Helper"
set "INSTALL_SCRIPT=%HELPER_DIR%install-autostart-task.ps1"

if not exist "%INSTALL_SCRIPT%" (
  echo Missing "%INSTALL_SCRIPT%".
  pause
  exit /b 1
)

powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%INSTALL_SCRIPT%"
if errorlevel 1 (
  echo.
  echo Could not create the scheduled task.
  echo Make sure you are running as the same Windows user who will use StreamDock.
  pause
  exit /b 1
)

echo.
echo Created scheduled task "%TASK_NAME%" for the current user.
echo It runs immediately at sign-in with normal current-user privileges.
echo It should not show a UAC prompt or command window.
echo.
echo Starting the helper now...
schtasks /Run /TN "%TASK_NAME%" >nul 2>nul

echo.
echo Check http://127.0.0.1:53999/api/status after a few seconds.
pause
