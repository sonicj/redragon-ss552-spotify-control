# Spotify Control for Redragon StreamDock v1.0.5

This release contains:

- `com.sonic.spotifycontrol.sdPlugin` - the StreamDock plugin folder
- `helper` - the local Spotify companion helper
- `README.md` - this install guide

The helper runs locally on `http://127.0.0.1:53999`. It is a small background companion app for Spotify control.

## Requirements

- Windows 10 or newer
- Redragon StreamDock / HotSpot StreamDock
- Node.js 18 or newer from https://nodejs.org/
- Spotify desktop app
- Spotify account

## Install the Plugin

1. Close StreamDock.
2. Copy this folder:

```text
com.sonic.spotifycontrol.sdPlugin
```

into:

```text
C:\Users\<YOUR_USER>\AppData\Roaming\HotSpot\StreamDock\plugins\
```

For example:

```text
C:\Users\<YOUR_USER>\AppData\Roaming\HotSpot\StreamDock\plugins\com.sonic.spotifycontrol.sdPlugin
```

3. Start StreamDock again.
4. Look for the Spotify actions in the Spotify category.

## First-Time Spotify Setup

The helper uses a Spotify Client ID only. Do not use or paste a client secret.

1. Go to https://developer.spotify.com/dashboard
2. Create an app.
3. Open the app settings.
4. Add this redirect URI exactly:

```text
http://127.0.0.1:53999/callback
```

5. Copy the app's Client ID.
6. Open the release `helper` folder.
7. Double-click `start-helper.bat`.
8. If `config.local.json` does not exist, it will be created and opened in Notepad.
9. Paste your Client ID into `spotifyClientId`, save the file, and run `start-helper.bat` again.

## Start the Helper

Double-click:

```text
helper\start-helper.bat
```

The helper starts in the background. You do not need to keep a terminal window open.

Then open this URL in your browser:

```text
http://127.0.0.1:53999/login
```

Approve Spotify access. Open Spotify desktop and start any song once so Spotify has an active playback device.

For troubleshooting with a visible console, run:

```text
helper\start-helper-console.bat
```

## Optional Auto-Start With Windows

Recommended for v1.0.5: to start the helper automatically and silently when you sign in to Windows, double-click this once from the extracted release:

```text
helper\install-autostart-task.bat
```

This creates the scheduled task `Spotify Control Helper` for the current Windows user. It uses normal privileges (`/RL LIMITED`), runs immediately at user logon, and does not require administrator rights or a UAC prompt.

The installer also removes the old Startup-folder shortcut from earlier packages if it exists, so normal Windows startup does not launch `start-helper.bat` in a visible window.

To remove this scheduled task, double-click:

```text
helper\uninstall-autostart-task.bat
```

After reboot or sign-out/sign-in, the scheduled task launches the helper in the background. If you are already logged in to Spotify, the StreamDock buttons should work after Spotify has an active device.

Auto-start diagnostics are written to:

```text
%APPDATA%\RedragonSpotifyControl\logs\autostart.log
```

The helper server writes to:

```text
%APPDATA%\RedragonSpotifyControl\logs\helper.log
```

## Add Playlist Buttons

1. In StreamDock, add the Play Playlist action to a key.
2. Open its property inspector.
3. Enter one playlist per line:

```text
Release Radar | https://open.spotify.com/playlist/37i9dQZEVXbqnb2U7chFug?si=...
All Songs | spotify:playlist:37i9dQZF1DXcBWIGoYBM5M
```

To get a playlist link:

1. Open Spotify.
2. Right-click a playlist.
3. Choose Share.
4. Choose Copy link to playlist.
5. Paste it after `Name |` in the playlist box.

Tap the key to cycle playlists. Hold the key for about half a second to play the selected playlist.

## Rename Spotify Devices

Some Spotify Connect devices report an ID-like name. Open:

```text
helper\config.local.json
```

Add a friendly device name:

```json
{
  "spotifyClientId": "your-client-id",
  "deviceNames": {
    "paste-your-spotify-device-id-here": "Living Room Speaker"
  }
}
```

Restart the helper after editing.

## Troubleshooting

### Helper Not Running

Open:

```text
http://127.0.0.1:53999/api/status
```

If the page does not load, run `helper\start-helper.bat`.

### Spotify Not Authenticated

Open:

```text
http://127.0.0.1:53999/login
```

Then check:

```powershell
Invoke-RestMethod http://127.0.0.1:53999/api/status
```

`spotify_authenticated` should be `True`.

### Only Open/Close Spotify Works

The Open/Close button uses local Windows process control. Playback, shuffle, liked songs, playlists, device switching, volume, and now-playing require Spotify authentication and an active Spotify playback device.

Check:

```powershell
Invoke-RestMethod http://127.0.0.1:53999/api/status
Invoke-RestMethod http://127.0.0.1:53999/api/current
```

If `spotify_client_id_configured` or `spotify_authenticated` is `False`, finish Spotify setup and open:

```text
http://127.0.0.1:53999/login
```

### No Active Spotify Device

Open Spotify desktop and start any song once. Spotify Web API controls need an active playback device.

### Device Volume Does Not Change

Some devices do not report or allow volume control through Spotify. Check:

```powershell
Invoke-RestMethod http://127.0.0.1:53999/api/volume/current
```

If the helper returns `volume_unsupported`, that device cannot be controlled through Spotify volume APIs.

### Playlist Returns 404

Some personalized Spotify-made playlists, including Discover Weekly and Release Radar, can return 404 from Spotify's Web API even when the Spotify app can show them. The helper keeps those playlists visible and cyclable, then tries playback when selected.

Try this:

1. Open the playlist in Spotify.
2. Follow or save it if Spotify offers that option.
3. Copy the playlist link again from your own Spotify account.
4. Paste the new link into the StreamDock playlist box.
5. Start playback once in Spotify desktop and try again.

To inspect playlist status and logs:

```powershell
Invoke-RestMethod http://127.0.0.1:53999/api/playlist/list
Get-Content "$env:APPDATA\RedragonSpotifyControl\logs\helper.log" -Tail 50
```

### Old Playlists Still Appear After Reinstall

The release zip does not contain playlists. Playlist text is saved by StreamDock as per-key settings in profiles under:

```text
%APPDATA%\HotSpot\StreamDock\profiles\
```

The helper also mirrors the last selected playlist state beside the extracted helper:

```text
helper\playlist-state.local.json
```

To find StreamDock profile files that still contain playlist settings:

```powershell
Get-ChildItem "$env:APPDATA\HotSpot\StreamDock\profiles" -Recurse -Filter manifest.json | Select-String -Pattern "playlistList"
```

To remove helper-side local data from an extracted release folder:

```powershell
Remove-Item .\helper\config.local.json,.\helper\tokens.local.json,.\helper\playlist-state.local.json,.\helper\device-state.local.json -ErrorAction SilentlyContinue
Remove-Item "$env:APPDATA\RedragonSpotifyControl" -Recurse -Force -ErrorAction SilentlyContinue
```

To fully clear StreamDock key settings, remove the Spotify keys from your StreamDock profile or delete/recreate the affected StreamDock profile in the StreamDock app.

### Stop the Helper

Double-click:

```text
helper\stop-helper.bat
```

## Packaged EXE Helper

A future release can package the helper as a Windows EXE using a tool such as `pkg`, `nexe`, or a small native wrapper. For now, the Node.js helper is simpler, easier to inspect, and avoids antivirus false positives that unsigned homemade EXEs often trigger.
