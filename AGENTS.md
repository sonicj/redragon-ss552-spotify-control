Project goal:
Make this Redragon SS-552 / StreamDock Spotify Control plugin installable and usable by normal users.

Current plugin:
- The plugin folder is plugin/
- manifest.json defines the StreamDock actions.
- index.html is the real plugin entry point.
- playlist_pi.html and playlist_pi.js are the playlist property inspector.
- The plugin currently calls a local helper at http://127.0.0.1:53999.

Main goal:
A user should be able to download this project, place the plugin folder into:
C:\Users\<USER>\AppData\Roaming\HotSpot\StreamDock\plugins\
and run/install the helper so Spotify controls work.

Rules:
- Do not redesign the layout or icons.
- Preserve the existing button actions and visual style.
- Do not guess the StreamDock API. Inspect the current files first.
- Do not hardcode Spotify secrets.
- Do not commit credentials.
- Make the smallest working MVP first.
- Prefer a simple Windows helper app that runs locally on port 53999.
- Add clear install instructions.
- If a better packaging method exists, explain it first before changing structure.

Required helper endpoints:
- GET /api/current
- POST /api/playpause
- POST /api/next
- POST /api/previous
- POST /api/shuffle
- POST /api/like-current
- GET /api/current-like-state
- POST /api/openclose
- GET /api/openclose-state
- POST /api/playlist/set-options
- GET /api/playlist/current
- POST /api/playlist/select-next
- POST /api/play-playlist

Deliverables:
1. Working helper app in helper/
2. README with install steps
3. Spotify developer setup instructions
4. Plugin folder structure preserved
5. No secrets committed
6. A release-ready zip layout