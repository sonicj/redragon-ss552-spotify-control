@echo off
setlocal

set "SHORTCUT=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\Spotify Control Helper.lnk"

if exist "%SHORTCUT%" del "%SHORTCUT%"

echo Spotify Control helper auto-start removed.
pause
