@echo off
setlocal

set "HELPER_DIR=%~dp0"
set "CONFIG_FILE=%HELPER_DIR%config.local.json"
set "EXAMPLE_FILE=%HELPER_DIR%config.example.json"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Install Node.js 18 or newer from https://nodejs.org/ and try again.
  pause
  exit /b 1
)

if not exist "%CONFIG_FILE%" (
  copy "%EXAMPLE_FILE%" "%CONFIG_FILE%" >nul
  echo Created config.local.json.
  echo Paste your Spotify Client ID into this file, save it, then run start-helper.bat again.
  start "" notepad "%CONFIG_FILE%"
  pause
  exit /b 1
)

findstr /C:"paste-your-spotify-client-id-here" "%CONFIG_FILE%" >nul 2>nul
if not errorlevel 1 (
  echo config.local.json still has the example Spotify Client ID.
  echo Paste your real Spotify Client ID into this file, save it, then run start-helper.bat again.
  start "" notepad "%CONFIG_FILE%"
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath 'node.exe' -ArgumentList 'server.js' -WorkingDirectory '%HELPER_DIR%' -WindowStyle Hidden"

echo Spotify Control helper started in the background.
echo Open http://127.0.0.1:53999/login if you have not logged in yet.
timeout /t 3 >nul
