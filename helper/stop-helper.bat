@echo off
setlocal

echo Stopping Spotify Control helper...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$helper=(Resolve-Path '%~dp0server.js').Path; Get-CimInstance Win32_Process -Filter \"name='node.exe'\" | Where-Object { $_.CommandLine -like '*server.js*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
echo Done.
pause
