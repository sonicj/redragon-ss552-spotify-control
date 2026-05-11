@echo off
setlocal

set "HELPER_DIR=%~dp0"
set "TASK_NAME=Spotify Control Helper"
set "TASK_SCRIPT=%HELPER_DIR%start-helper-task.ps1"
set "TASK_ACTION=powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"%TASK_SCRIPT%\""
set "OLD_STARTUP_SHORTCUT=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Spotify Control Helper.lnk"

if not exist "%TASK_SCRIPT%" (
  echo Missing "%TASK_SCRIPT%".
  pause
  exit /b 1
)

schtasks /Create /TN "%TASK_NAME%" /SC ONLOGON /TR "%TASK_ACTION%" /RL LIMITED /F
if errorlevel 1 (
  echo.
  echo Could not create the scheduled task.
  echo Make sure you are running as the same Windows user who will use StreamDock.
  pause
  exit /b 1
)

if exist "%OLD_STARTUP_SHORTCUT%" (
  del "%OLD_STARTUP_SHORTCUT%" >nul 2>nul
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
