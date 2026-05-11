$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$release = Join-Path $root "release"
$pluginSource = Join-Path $root "plugin"
$helperSource = Join-Path $root "helper"
$installGuide = Join-Path $root "docs\INSTALL.md"
$manifest = Get-Content -Raw (Join-Path $pluginSource "manifest.json") | ConvertFrom-Json
$version = $manifest.Version
$zipName = "redragon-ss552-spotify-control-v$version.zip"
$zipPath = Join-Path $root $zipName

if (Test-Path $release) {
  Remove-Item -LiteralPath $release -Recurse -Force
}

if (Test-Path $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

New-Item -ItemType Directory -Path $release | Out-Null

$pluginTarget = Join-Path $release "com.sonic.spotifycontrol.sdPlugin"
$helperTarget = Join-Path $release "helper"

Copy-Item -LiteralPath $pluginSource -Destination $pluginTarget -Recurse
New-Item -ItemType Directory -Path $helperTarget | Out-Null

$helperFiles = @(
  "server.js",
  "package.json",
  "config.example.json",
  "start-helper.bat",
  "start-helper-console.bat",
  "stop-helper.bat",
  "install-autostart.bat",
  "uninstall-autostart.bat",
  "start-helper-task.ps1",
  "install-autostart-task.bat",
  "uninstall-autostart-task.bat"
)

foreach ($file in $helperFiles) {
  Copy-Item -LiteralPath (Join-Path $helperSource $file) -Destination $helperTarget
}

Copy-Item -LiteralPath $installGuide -Destination (Join-Path $release "README.md")

Compress-Archive -Path (Join-Path $release "*") -DestinationPath $zipPath -Force

Write-Host "Release folder created:"
Write-Host $release
Write-Host ""
Write-Host "Release zip created:"
Write-Host $zipPath
Write-Host ""
Write-Host "Zip contents:"
Write-Host "  com.sonic.spotifycontrol.sdPlugin"
Write-Host "  helper"
Write-Host "  README.md"
