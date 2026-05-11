@echo off
setlocal

set "TASK_NAME=Spotify Control Helper"

schtasks /Delete /TN "%TASK_NAME%" /F >nul 2>nul
if errorlevel 1 (
  echo Scheduled task "%TASK_NAME%" was not found.
) else (
  echo Removed scheduled task "%TASK_NAME%".
)

pause
