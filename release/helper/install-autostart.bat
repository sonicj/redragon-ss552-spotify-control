@echo off
setlocal

set "HELPER_DIR=%~dp0"
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SHORTCUT=%STARTUP%\Spotify Control Helper.lnk"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut('%SHORTCUT%'); $s.TargetPath='%HELPER_DIR%start-helper.bat'; $s.WorkingDirectory='%HELPER_DIR%'; $s.Description='Start Spotify Control helper'; $s.Save()"

echo Spotify Control helper will start when you sign in to Windows.
pause
