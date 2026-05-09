# Developer Notes

This file keeps build, helper, and endpoint testing notes out of the user-facing README.

## Build a release folder

Run this from PowerShell:

```powershell
.\build-release.bat
```

Or run the PowerShell script directly:

```powershell
powershell -ExecutionPolicy Bypass -File .\build-release.ps1
```

The build creates `release\` and a versioned zip:

- `redragon-ss552-spotify-control-vX.X.X.zip`
- `com.sonic.spotifycontrol.sdPlugin`
- `helper`
- `README.md`

The release copy excludes local config, tokens, device names, playlist state, logs, and dependencies.

## Helper development

The helper is a local Node.js app. It completes Spotify OAuth login and exposes the local API used by `plugin/index.html`.

Requirements:

- Windows
- Node.js 18 or newer

From PowerShell:

```powershell
cd helper
npm start
```

The helper listens on:

```text
http://127.0.0.1:53999
```

Quick test:

```powershell
Invoke-RestMethod http://127.0.0.1:53999/api/status
Invoke-RestMethod http://127.0.0.1:53999/api/current
Invoke-RestMethod http://127.0.0.1:53999/api/openclose-state
```

## Spotify OAuth setup

This helper uses Spotify Authorization Code with PKCE. It needs a Spotify Client ID only. Do not add a client secret.

1. Go to the Spotify Developer Dashboard: https://developer.spotify.com/dashboard
2. Create an app.
3. Open the app settings.
4. Add this redirect URI exactly:

```text
http://127.0.0.1:53999/callback
```

Spotify requires the redirect URI used by the helper to match the dashboard entry. For local loopback HTTP, use `127.0.0.1`; do not use `localhost`.

Create local config:

```powershell
cd C:\Users\<USER>\Documents\redragon-ss552-spotify-control\helper
Copy-Item config.example.json config.local.json
notepad config.local.json
```

Then start the helper and open:

```text
http://127.0.0.1:53999/login
```

## Endpoint tests

### Playback

After Spotify login is complete, open Spotify desktop and start playing any track once so Spotify has an active device.

```powershell
Invoke-RestMethod http://127.0.0.1:53999/api/current
Invoke-RestMethod -Method Post http://127.0.0.1:53999/api/playpause
Invoke-RestMethod -Method Post http://127.0.0.1:53999/api/playpause
Invoke-RestMethod -Method Post http://127.0.0.1:53999/api/next
Invoke-RestMethod -Method Post http://127.0.0.1:53999/api/previous
Invoke-RestMethod -Method Post http://127.0.0.1:53999/api/shuffle
```

### Device switching

```powershell
Invoke-RestMethod http://127.0.0.1:53999/api/devices/current
Invoke-RestMethod -Method Post http://127.0.0.1:53999/api/devices/select-next
Invoke-RestMethod http://127.0.0.1:53999/api/devices/current
Get-Content .\helper.log -Tail 30
```

### Open / close Spotify

```powershell
Invoke-RestMethod http://127.0.0.1:53999/api/openclose-state
Invoke-RestMethod -Method Post http://127.0.0.1:53999/api/openclose
Start-Sleep -Seconds 3
Invoke-RestMethod http://127.0.0.1:53999/api/openclose-state
Get-Content .\helper.log -Tail 80
```

### Volume

```powershell
Invoke-RestMethod http://127.0.0.1:53999/api/volume/current
Invoke-RestMethod -Method Post http://127.0.0.1:53999/api/volume/up
Invoke-RestMethod -Method Post http://127.0.0.1:53999/api/volume/down
Invoke-RestMethod -Method Post -ContentType "application/json" -Body '{"volume_percent":35}' http://127.0.0.1:53999/api/volume/set
Invoke-RestMethod http://127.0.0.1:53999/api/volume/current
Get-Content .\helper.log -Tail 30
```

### Liked songs

```powershell
Invoke-RestMethod http://127.0.0.1:53999/api/current
Invoke-RestMethod http://127.0.0.1:53999/api/current-like-state
Invoke-RestMethod -Method Post http://127.0.0.1:53999/api/like-current
Invoke-RestMethod http://127.0.0.1:53999/api/current-like-state
Invoke-RestMethod -Method Post http://127.0.0.1:53999/api/like-current
Invoke-RestMethod http://127.0.0.1:53999/api/current-like-state
```

### Playlists

```powershell
$body = @{
  options = @(
    @{ name = "Release Radar Link"; uri = "https://open.spotify.com/playlist/37i9dQZEVXbqnb2U7chFug?si=36b5d3c125764d4f" },
    @{ name = "Release Radar URI"; uri = "spotify:playlist:37i9dQZEVXbqnb2U7chFug" },
    @{ name = "Release Radar ID"; uri = "37i9dQZEVXbqnb2U7chFug" }
  )
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Method Post -ContentType "application/json" -Body $body http://127.0.0.1:53999/api/playlist/set-options
Invoke-RestMethod http://127.0.0.1:53999/api/playlist/list
Invoke-RestMethod http://127.0.0.1:53999/api/playlist/current
Invoke-RestMethod -Method Post http://127.0.0.1:53999/api/playlist/select-next
Invoke-RestMethod http://127.0.0.1:53999/api/playlist/current
Invoke-RestMethod -Method Post http://127.0.0.1:53999/api/play-playlist
Get-Content .\helper.log -Tail 30
```

## Local files ignored by git

- `helper/config.local.json`
- `helper/tokens.local.json`
- `helper/playlist-state.local.json`
- `helper/device-state.local.json`
- `helper/*.log`
