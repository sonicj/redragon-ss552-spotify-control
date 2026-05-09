@echo off
setlocal

set "HELPER_DIR=%~dp0"
cd /d "%HELPER_DIR%"

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js was not found.
  echo Install Node.js 18 or newer from https://nodejs.org/ and try again.
  pause
  exit /b 1
)

node server.js
pause
