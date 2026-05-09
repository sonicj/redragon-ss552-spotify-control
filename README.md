# redragon-ss552-spotify-control

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

## Run the helper stub

The helper is currently a local Node.js helper. It can complete Spotify OAuth login and control current playback, next, previous, and shuffle. Some endpoints are still stubs until later steps.

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
Invoke-RestMethod http://127.0.0.1:53999/api/current
Invoke-RestMethod -Method Post http://127.0.0.1:53999/api/playpause
Invoke-RestMethod http://127.0.0.1:53999/api/openclose-state
```

## Spotify Developer Dashboard setup

This helper uses Spotify Authorization Code with PKCE. It needs a Spotify Client ID only. Do not add a client secret to this project.

1. Go to the Spotify Developer Dashboard: https://developer.spotify.com/dashboard
2. Create an app.
3. Open the app settings.
4. Add this redirect URI exactly:

```text
http://127.0.0.1:53999/callback
```

Spotify requires the redirect URI used by the helper to match the dashboard entry. For local loopback HTTP, use `127.0.0.1`; do not use `localhost`.

5. Copy your app's Client ID.
6. Create a local config file from the example:

```powershell
cd C:\Users\<USER>\Documents\redragon-ss552-spotify-control\helper
Copy-Item config.example.json config.local.json
notepad config.local.json
```

7. Replace `paste-your-spotify-client-id-here` with your Spotify Client ID.
8. Start the helper:

```powershell
npm start
```

9. Open the login URL in your browser:

```text
http://127.0.0.1:53999/login
```

10. After approving Spotify access, check helper auth status:

```powershell
Invoke-RestMethod http://127.0.0.1:53999/api/status
```

## Test Spotify playback endpoints

After Spotify login is complete, open the Spotify desktop app and start playing any track once so Spotify has an active device. Then run:

```powershell
Invoke-RestMethod http://127.0.0.1:53999/api/current
Invoke-RestMethod -Method Post http://127.0.0.1:53999/api/playpause
Invoke-RestMethod -Method Post http://127.0.0.1:53999/api/playpause
Invoke-RestMethod -Method Post http://127.0.0.1:53999/api/next
Invoke-RestMethod -Method Post http://127.0.0.1:53999/api/previous
Invoke-RestMethod -Method Post http://127.0.0.1:53999/api/shuffle
```

If Spotify is not authenticated, the helper returns `error: "not_authenticated"`. If Spotify is open but no device is active, it returns `error: "no_active_device"`. If the account cannot use playback controls, it returns `error: "premium_required"`.

## Test Spotify device switching

After Spotify login is complete, open Spotify on each device you want to cycle between. Start playback once so Spotify reports active devices. Then run:

```powershell
Invoke-RestMethod http://127.0.0.1:53999/api/devices/current
Invoke-RestMethod -Method Post http://127.0.0.1:53999/api/devices/select-next
Invoke-RestMethod http://127.0.0.1:53999/api/devices/current
Get-Content .\helper.log -Tail 30
```

On the SS-552, add the Switch Spotify Device action to a key. Press it to switch playback to the next available Spotify device.

## Rename Spotify devices

Some Spotify Connect devices report an ID-like name instead of a friendly name. The helper logs the full `/me/player/devices` response so you can map the device ID to a display name.

Open `helper\config.local.json` and add or edit `deviceNames`:

```json
{
  "spotifyClientId": "your-client-id",
  "deviceNames": {
    "paste-your-spotify-device-id-here": "Living Room Speaker"
  }
}
```

Restart the helper after editing. Then run:

```powershell
Invoke-RestMethod http://127.0.0.1:53999/api/devices/current
Get-Content .\helper.log -Tail 80
```

Look for `devices raw response` to see every field Spotify returned for each device.

## Test Spotify open / close

The power button uses these endpoints:

```powershell
Invoke-RestMethod http://127.0.0.1:53999/api/openclose-state
Invoke-RestMethod -Method Post http://127.0.0.1:53999/api/openclose
Start-Sleep -Seconds 3
Invoke-RestMethod http://127.0.0.1:53999/api/openclose-state
Get-Content .\helper.log -Tail 80
```

Logs show Spotify process detection, launch commands tried, close commands tried, and the final running state.

## Test Spotify device volume

After Spotify login is complete, start playback on the Spotify device you want to control. Then run:

```powershell
Invoke-RestMethod http://127.0.0.1:53999/api/volume/current
Invoke-RestMethod -Method Post http://127.0.0.1:53999/api/volume/up
Invoke-RestMethod -Method Post http://127.0.0.1:53999/api/volume/down
Invoke-RestMethod -Method Post -ContentType "application/json" -Body '{"volume_percent":35}' http://127.0.0.1:53999/api/volume/set
Invoke-RestMethod http://127.0.0.1:53999/api/volume/current
Get-Content .\helper.log -Tail 30
```

On the SS-552, add Spotify Volume Up and Spotify Volume Down to keypad buttons. These control the active Spotify playback device, not Windows desktop volume.

## Test Spotify like endpoints

After Spotify login is complete, open Spotify desktop and start playing a track. Then run:

```powershell
Invoke-RestMethod http://127.0.0.1:53999/api/current
Invoke-RestMethod http://127.0.0.1:53999/api/current-like-state
Invoke-RestMethod -Method Post http://127.0.0.1:53999/api/like-current
Invoke-RestMethod http://127.0.0.1:53999/api/current-like-state
Invoke-RestMethod -Method Post http://127.0.0.1:53999/api/like-current
Invoke-RestMethod http://127.0.0.1:53999/api/current-like-state
```

The first `POST /api/like-current` toggles the current track's Liked Songs state. The second `POST /api/like-current` toggles it back.

## Test Spotify playlist endpoints

Users can paste the normal Spotify playlist link from Spotify:

1. Open Spotify.
2. Right-click a playlist.
3. Choose Share.
4. Choose Copy link to playlist.
5. Paste it into the SS-552 playlist box like:

```text
Release Radar | https://open.spotify.com/playlist/37i9dQZEVXbqnb2U7chFug?si=...
```

The helper also accepts `spotify:playlist:37i9dQZEVXbqnb2U7chFug` and raw playlist IDs like `37i9dQZEVXbqnb2U7chFug`. It stores them internally as `spotify:playlist:...`.

After Spotify login is complete, open Spotify desktop and start playing any track once so Spotify has an active device. Then run:

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

For the SS-552, add the Play Playlist action to a key. In its property inspector, enter playlists as `Name | Spotify playlist link`, one per line. Tap the key to cycle the selected playlist. Hold the key for about half a second to play the selected playlist.

If Spotify returns 404 for personalized playlists such as Discover Weekly or Release Radar, the helper keeps them in your configured list so they remain visible and cyclable. Run this to see each configured playlist and its validation status:

```powershell
Invoke-RestMethod http://127.0.0.1:53999/api/playlist/list
Get-Content .\helper.log -Tail 50
```

A 404 means Spotify's Web API could not validate that playlist ID for your account, even if the Spotify app can show the playlist. The helper still tries to play the selected playlist URI; if Spotify also rejects playback, the response shows `playlist_cannot_play` for that selected playlist. For personalized Spotify-made playlists, try following or saving the playlist in Spotify, copying the link again from your own account, opening it in Spotify once, then restarting playback and testing again.

Local files that may contain credentials or tokens are ignored by git:

- `helper/config.local.json`
- `helper/tokens.local.json`
- `helper/playlist-state.local.json`
