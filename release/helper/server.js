"use strict";

const crypto = require("crypto");
const childProcess = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const HOST = "127.0.0.1";
const PORT = 53999;
const REDIRECT_URI = `http://${HOST}:${PORT}/callback`;
const CONFIG_FILE = path.join(__dirname, "config.local.json");
const TOKEN_FILE = path.join(__dirname, "tokens.local.json");
const PLAYLIST_STATE_FILE = path.join(__dirname, "playlist-state.local.json");
const DEVICE_STATE_FILE = path.join(__dirname, "device-state.local.json");
const APP_LOG_DIR = path.join(process.env.APPDATA || __dirname, "RedragonSpotifyControl", "logs");
const LOG_FILE = path.join(APP_LOG_DIR, "helper.log");
const SPOTIFY_AUTHORIZE_URL = "https://accounts.spotify.com/authorize";
const SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token";
const SPOTIFY_API_BASE_URL = "https://api.spotify.com/v1";
const SPOTIFY_SCOPES = [
  "user-read-currently-playing",
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-library-read",
  "user-library-modify",
  "playlist-read-private",
  "playlist-read-collaborative"
];

const state = {
  isRunning: false,
  isPlaying: false,
  shuffleState: false,
  liked: false,
  playlists: [],
  selectedPlaylistIndex: 0,
  selectedDeviceId: ""
};

const pendingLogins = new Map();

function log(message, details) {
  const detailText = details === undefined ? "" : ` ${JSON.stringify(details)}`;
  const line = `${new Date().toISOString()} ${message}${detailText}`;

  console.log(line);

  try {
    fs.mkdirSync(APP_LOG_DIR, { recursive: true });
    fs.appendFileSync(LOG_FILE, `${line}\n`, "utf8");
  } catch (error) {
  }
}

function errorDetails(error) {
  return {
    name: error && error.name ? error.name : null,
    message: error && error.message ? error.message : String(error || ""),
    stack: error && error.stack ? error.stack : null
  };
}

function readJsonFile(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return {};
  }
}

function writeJsonFile(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function execFileCapture(command, args, options) {
  return new Promise((resolve) => {
    childProcess.execFile(command, args || [], options || {}, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        code: error && typeof error.code !== "undefined" ? error.code : 0,
        stdout: String(stdout || ""),
        stderr: String(stderr || ""),
        error: error ? error.message : null
      });
    });
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function loadConfig() {
  const localConfig = readJsonFile(CONFIG_FILE);
  return {
    spotifyClientId: String(process.env.SPOTIFY_CLIENT_ID || localConfig.spotifyClientId || "").trim(),
    deviceNames: localConfig.deviceNames && typeof localConfig.deviceNames === "object" ? localConfig.deviceNames : {}
  };
}

function loadTokens() {
  return readJsonFile(TOKEN_FILE);
}

function saveTokens(tokens) {
  writeJsonFile(TOKEN_FILE, tokens);
}

function loadPlaylistState() {
  const playlistState = readJsonFile(PLAYLIST_STATE_FILE);
  state.playlists = normalizePlaylists(playlistState.playlists || []);
  state.selectedPlaylistIndex = Number.isInteger(playlistState.selectedPlaylistIndex) ? playlistState.selectedPlaylistIndex : 0;

  if (state.selectedPlaylistIndex < 0 || state.selectedPlaylistIndex >= state.playlists.length) {
    state.selectedPlaylistIndex = 0;
  }
}

function savePlaylistState() {
  writeJsonFile(PLAYLIST_STATE_FILE, {
    playlists: state.playlists,
    selectedPlaylistIndex: state.selectedPlaylistIndex
  });
}

function loadDeviceState() {
  const deviceState = readJsonFile(DEVICE_STATE_FILE);
  state.selectedDeviceId = String(deviceState.selectedDeviceId || "").trim();
}

function saveDeviceState() {
  writeJsonFile(DEVICE_STATE_FILE, {
    selectedDeviceId: state.selectedDeviceId
  });
}

function hasRefreshToken(tokens) {
  return Boolean(tokens && tokens.refresh_token);
}

function hasValidAccessToken(tokens) {
  return Boolean(tokens && tokens.access_token && tokens.expires_at && Date.now() < tokens.expires_at - 60000);
}

function base64Url(buffer) {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function createCodeVerifier() {
  return base64Url(crypto.randomBytes(64));
}

function createCodeChallenge(verifier) {
  return base64Url(crypto.createHash("sha256").update(verifier).digest());
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);

  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(body);
}

function sendHtml(res, statusCode, body) {
  res.writeHead(statusCode, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  });
  res.end(body);
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function readJsonBody(req) {
  return new Promise((resolve) => {
    let raw = "";

    req.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > 1024 * 1024) {
        req.destroy();
      }
    });

    req.on("end", () => {
      if (!raw.trim()) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        resolve({});
      }
    });

    req.on("error", () => {
      resolve({});
    });
  });
}

function currentPlaylist() {
  if (state.playlists.length === 0) {
    return null;
  }

  return state.playlists[state.selectedPlaylistIndex] || state.playlists[0];
}

function parsePlaylistInput(value) {
  const rawValue = String(value || "").trim();
  const withoutQuery = rawValue.split("?")[0].trim();
  let playlistId = "";

  if (!rawValue) {
    return {
      ok: false,
      input: rawValue,
      error: "Playlist value is empty."
    };
  }

  if (/^spotify:playlist:/i.test(withoutQuery)) {
    playlistId = withoutQuery.replace(/^spotify:playlist:/i, "").trim();
  } else if (/^https?:\/\//i.test(rawValue)) {
    try {
      const parsedUrl = new URL(rawValue);
      const parts = parsedUrl.pathname.split("/").filter(Boolean);
      const playlistIndex = parts.findIndex((part) => part.toLowerCase() === "playlist");

      if (playlistIndex >= 0 && parts[playlistIndex + 1]) {
        playlistId = parts[playlistIndex + 1].trim();
      }
    } catch (error) {
      playlistId = "";
    }
  } else {
    playlistId = withoutQuery;
  }

  if (!/^[A-Za-z0-9]{22}$/.test(playlistId)) {
    return {
      ok: false,
      input: rawValue,
      error: "Playlist must be a Spotify playlist link, spotify:playlist URI, or raw 22-character playlist ID."
    };
  }

  return {
    ok: true,
    input: rawValue,
    id: playlistId,
    uri: `spotify:playlist:${playlistId}`
  };
}

function normalizePlaylists(options) {
  if (!Array.isArray(options)) {
    return [];
  }

  return options
    .map((item) => {
      const name = String((item && item.name) || "Playlist").trim() || "Playlist";
      const parsed = parsePlaylistInput(item && item.uri);
      const normalized = {
        name,
        uri: parsed.ok ? parsed.uri : String((item && item.uri) || "").trim(),
        input: parsed.input,
        id: parsed.id || null
      };

      if (!parsed.ok) {
        normalized.error = parsed.error;
      }

      log("playlist normalize", {
        name,
        input: normalized.input,
        normalized_uri: normalized.uri,
        ok: parsed.ok,
        error: parsed.error || null
      });

      return normalized;
    })
    .filter((item) => item.input || item.uri);
}

function isValidPlaylistUri(uri) {
  return /^spotify:playlist:[A-Za-z0-9]{22}$/.test(String(uri || "").trim());
}

function makePlaylistResponse(extra) {
  return {
    ok: true,
    connected: true,
    selected: currentPlaylist(),
    index: state.selectedPlaylistIndex,
    count: state.playlists.length,
    total_configured: state.playlists.length,
    ...(extra || {})
  };
}

function tokenResponseToStoredTokens(tokenResponse, existingTokens) {
  return {
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token || (existingTokens && existingTokens.refresh_token) || "",
    token_type: tokenResponse.token_type || "Bearer",
    scope: tokenResponse.scope || "",
    expires_in: tokenResponse.expires_in || 3600,
    expires_at: Date.now() + ((tokenResponse.expires_in || 3600) * 1000),
    saved_at: new Date().toISOString()
  };
}

function makeUnauthenticatedResponse() {
  return {
    ok: false,
    connected: false,
    is_playing: false,
    shuffle_state: false,
    track: null,
    artist: null,
    album: null,
    track_id: null,
    error: "not_authenticated",
    message: "Spotify is not authenticated. Open http://127.0.0.1:53999/login first."
  };
}

function makeNoActiveDeviceResponse() {
  return {
    ok: false,
    connected: false,
    is_playing: false,
    shuffle_state: false,
    track: null,
    artist: null,
    album: null,
    track_id: null,
    error: "no_active_device",
    message: "No active Spotify device found. Open Spotify and start playback once."
  };
}

function makeNoCurrentTrackResponse() {
  return {
    ok: false,
    connected: false,
    is_playing: false,
    shuffle_state: false,
    track: null,
    artist: null,
    album: null,
    track_id: null,
    liked: false,
    error: "no_current_track",
    message: "No current Spotify track found. Start playing a track and try again."
  };
}

function makeNoPlaylistConfiguredResponse() {
  return {
    ok: false,
    connected: false,
    selected: null,
    index: 0,
    count: 0,
    total_configured: 0,
    error: "no_playlist_configured",
    message: "No playlist is configured. Add playlists in the StreamDock property inspector."
  };
}

function makeNoDevicesAvailableResponse() {
  return {
    ok: false,
    connected: false,
    selected: null,
    devices: [],
    count: 0,
    error: "no_devices_available",
    message: "No Spotify playback devices are available. Open Spotify on the device you want to use."
  };
}

function makeDeviceVolumeUnsupportedResponse(device) {
  return {
    ok: false,
    connected: false,
    selected: device || null,
    volume_percent: null,
    error: "volume_unsupported",
    message: "The active Spotify device does not report controllable volume."
  };
}

function makeInvalidPlaylistResponse(playlist) {
  return {
    ok: false,
    connected: false,
    selected: playlist || null,
    index: state.selectedPlaylistIndex,
    count: state.playlists.length,
    total_configured: state.playlists.length,
    error: "invalid_playlist_uri",
    message: (playlist && playlist.error) || "Playlist must be a Spotify playlist link, spotify:playlist URI, or raw playlist ID."
  };
}

function makePlaylistUnavailableResponse(playlist, message) {
  return {
    ok: false,
    connected: false,
    selected: playlist || null,
    index: state.selectedPlaylistIndex,
    count: state.playlists.length,
    total_configured: state.playlists.length,
    error: "playlist_unavailable",
    message: message || "Spotify could not access this playlist. Check that the link is correct and that your account can open it."
  };
}

function makePlaylistCannotPlayResponse(playlist, response) {
  return {
    ok: false,
    connected: false,
    selected: playlist || null,
    index: state.selectedPlaylistIndex,
    count: state.playlists.length,
    total_configured: state.playlists.length,
    error: "playlist_cannot_play",
    message: (response && response.message) || "Spotify could not play this playlist. Open Spotify, start playback once, and try again.",
    spotify_error: response && response.error ? response.error : null
  };
}

function makePremiumRequiredResponse() {
  return {
    ok: false,
    connected: false,
    is_playing: false,
    shuffle_state: false,
    track: null,
    artist: null,
    album: null,
    track_id: null,
    liked: false,
    error: "premium_required",
    message: "Spotify Premium is required for Web API playback controls."
  };
}

function normalizeSpotifyError(status, payload) {
  const spotifyError = payload && payload.error ? payload.error : {};
  const rawMessage = String(spotifyError.message || payload.error_description || payload.error || "").trim();
  const reason = String(spotifyError.reason || "").trim();
  const combined = `${rawMessage} ${reason}`.toLowerCase();

  if (status === 401) {
    return makeUnauthenticatedResponse();
  }

  if (combined.includes("no active device") || reason === "NO_ACTIVE_DEVICE") {
    return makeNoActiveDeviceResponse();
  }

  if (combined.includes("premium") || reason === "PREMIUM_REQUIRED") {
    return makePremiumRequiredResponse();
  }

  return {
    ok: false,
    connected: false,
    error: "spotify_error",
    status,
    message: rawMessage || `Spotify request failed with status ${status}.`
  };
}

function makeCurrentResponse(playback) {
  const item = playback && playback.item ? playback.item : null;
  const artists = item && Array.isArray(item.artists) ? item.artists : [];

  return {
    ok: true,
    connected: true,
    is_playing: Boolean(playback && playback.is_playing),
    shuffle_state: Boolean(playback && playback.shuffle_state),
    track: item && item.name ? item.name : null,
    artist: artists.map((artist) => artist.name).filter(Boolean).join(", ") || null,
    album: item && item.album && item.album.name ? item.album.name : null,
    track_id: item && item.id ? item.id : null,
    track_uri: item && item.uri ? item.uri : null,
    device: playback && playback.device ? {
      id: playback.device.id || null,
      name: playback.device.name || null,
      type: playback.device.type || null,
      is_active: Boolean(playback.device.is_active),
      is_restricted: Boolean(playback.device.is_restricted)
    } : null
  };
}

function makeLikeStateResponse(track, liked) {
  return {
    ok: true,
    connected: true,
    liked: Boolean(liked),
    track_id: track.track_id,
    track_uri: track.track_uri,
    track: track.track,
    artist: track.artist
  };
}

async function requestSpotifyToken(params) {
  const response = await fetch(SPOTIFY_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams(params).toString()
  });

  const text = await response.text();
  let payload = {};

  try {
    payload = text ? JSON.parse(text) : {};
  } catch (error) {
    payload = {
      error: "invalid_token_response",
      error_description: text
    };
  }

  if (!response.ok) {
    const message = payload.error_description || payload.error || `Spotify token request failed with ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

async function refreshAccessTokenIfNeeded() {
  const config = loadConfig();
  const tokens = loadTokens();

  if (!config.spotifyClientId || !hasRefreshToken(tokens)) {
    return {
      refreshed: false,
      tokens
    };
  }

  if (hasValidAccessToken(tokens)) {
    return {
      refreshed: false,
      tokens
    };
  }

  const tokenResponse = await requestSpotifyToken({
    grant_type: "refresh_token",
    refresh_token: tokens.refresh_token,
    client_id: config.spotifyClientId
  });

  const updatedTokens = tokenResponseToStoredTokens(tokenResponse, tokens);
  saveTokens(updatedTokens);

  return {
    refreshed: true,
    tokens: updatedTokens
  };
}

async function getAccessToken() {
  const result = await refreshAccessTokenIfNeeded();

  if (!hasValidAccessToken(result.tokens)) {
    return null;
  }

  return result.tokens.access_token;
}

async function readSpotifyResponse(response) {
  const text = await response.text();

  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch (error) {
    return {
      error: "invalid_json",
      error_description: text
    };
  }
}

async function spotifyApiRequest(pathname, options) {
  let token = null;

  try {
    token = await getAccessToken();
  } catch (error) {
    return {
      ok: false,
      status: 401,
      error: {
        ...makeUnauthenticatedResponse(),
        refresh_error: error && error.message ? error.message : "Token refresh failed."
      }
    };
  }

  if (!token) {
    return {
      ok: false,
      status: 401,
      error: makeUnauthenticatedResponse()
    };
  }

  const requestOptions = options || {};
  const headers = {
    Authorization: `Bearer ${token}`
  };

  if (requestOptions.body !== undefined) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(`${SPOTIFY_API_BASE_URL}${pathname}`, {
    method: requestOptions.method || "GET",
    headers,
    body: requestOptions.body !== undefined ? JSON.stringify(requestOptions.body) : undefined
  });

  if (response.status === 204) {
    return {
      ok: true,
      status: response.status,
      data: null
    };
  }

  const data = await readSpotifyResponse(response);

  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      error: normalizeSpotifyError(response.status, data)
    };
  }

  return {
    ok: true,
    status: response.status,
    data
  };
}

async function getCurrentPlayback() {
  const result = await spotifyApiRequest("/me/player");

  if (!result.ok) {
    return result.error;
  }

  if (result.status === 204 || !result.data) {
    return makeNoActiveDeviceResponse();
  }

  return makeCurrentResponse(result.data);
}

async function runPlaybackCommand(pathname, options) {
  const result = await spotifyApiRequest(pathname, options);

  if (!result.ok) {
    return result.error;
  }

  return {
    ok: true,
    connected: true
  };
}

function getFriendlyDeviceName(device) {
  const config = loadConfig();
  const id = String((device && device.id) || "").trim();
  const spotifyName = String((device && device.name) || "").trim();
  const mappedName = (id && config.deviceNames[id]) || (spotifyName && config.deviceNames[spotifyName]) || "";

  if (mappedName) {
    return String(mappedName).trim();
  }

  return spotifyName || "Spotify Device";
}

function normalizeDevice(device) {
  const rawName = String((device && device.name) || "").trim();

  return {
    id: device.id || "",
    name: getFriendlyDeviceName(device),
    spotify_name: rawName,
    type: device.type || "",
    is_active: Boolean(device.is_active),
    is_restricted: Boolean(device.is_restricted),
    volume_percent: device.volume_percent === null || device.volume_percent === undefined ? null : device.volume_percent
  };
}

function makeDevicesResponse(devices, selected, extra) {
  return {
    ok: true,
    connected: true,
    selected,
    devices,
    count: devices.length,
    ...(extra || {})
  };
}

async function isSpotifyRunning() {
  const result = await execFileCapture("tasklist.exe", ["/FI", "IMAGENAME eq Spotify.exe", "/FO", "CSV", "/NH"]);
  let running = /Spotify\.exe/i.test(result.stdout);

  log("openclose detection result", {
    running,
    command: "tasklist.exe",
    code: result.code,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim()
  });

  if (running || result.ok) {
    return running;
  }

  const fallback = await execFileCapture("powershell.exe", [
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-Command",
    "if (Get-Process -Name Spotify -ErrorAction SilentlyContinue) { 'running' } else { 'stopped' }"
  ]);

  running = /\brunning\b/i.test(fallback.stdout);

  log("openclose detection result", {
    running,
    command: "powershell.exe Get-Process Spotify",
    code: fallback.code,
    stdout: fallback.stdout.trim(),
    stderr: fallback.stderr.trim()
  });

  return running;
}

function getSpotifyLaunchCandidates() {
  const candidates = [];
  const localAppData = process.env.LOCALAPPDATA || "";
  const appData = process.env.APPDATA || "";
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";

  if (appData) {
    candidates.push({
      type: "exe",
      command: path.join(appData, "Spotify", "Spotify.exe")
    });
  }

  if (localAppData) {
    candidates.push({
      type: "exe",
      command: path.join(localAppData, "Microsoft", "WindowsApps", "Spotify.exe")
    });
    candidates.push({
      type: "exe",
      command: path.join(localAppData, "Spotify", "Spotify.exe")
    });
  }

  candidates.push({
    type: "exe",
    command: path.join(programFiles, "WindowsApps", "Spotify.exe")
  });
  candidates.push({
    type: "exe",
    command: path.join(programFilesX86, "Spotify", "Spotify.exe")
  });
  candidates.push({
    type: "cmd",
    command: "cmd.exe",
    args: ["/c", "start", "", "spotify:"],
    label: "spotify URI"
  });
  candidates.push({
    type: "cmd",
    command: "explorer.exe",
    args: ["shell:AppsFolder\\SpotifyAB.SpotifyMusic_zpdnekdrzrea0!Spotify"],
    label: "Microsoft Store app"
  });

  return candidates;
}

async function launchSpotify() {
  const tried = [];

  for (const candidate of getSpotifyLaunchCandidates()) {
    const label = candidate.label || candidate.command;

    if (candidate.type === "exe" && !fs.existsSync(candidate.command)) {
      log("openclose launch skipped missing", {
        command: candidate.command
      });
      tried.push({
        command: candidate.command,
        skipped: "missing"
      });
      continue;
    }

    log("openclose launch command tried", {
      command: candidate.command,
      args: candidate.args || [],
      label
    });

    tried.push({
      command: candidate.command,
      args: candidate.args || [],
      label
    });

    try {
      const child = childProcess.spawn(candidate.command, candidate.args || [], {
        detached: true,
        stdio: "ignore",
        shell: false
      });
      child.unref();
    } catch (error) {
      log("openclose launch command failed", {
        command: candidate.command,
        message: error.message
      });
      continue;
    }

    await sleep(2500);

    if (await isSpotifyRunning()) {
      return {
        ok: true,
        tried
      };
    }
  }

  return {
    ok: false,
    tried
  };
}

async function closeSpotify() {
  const tried = [];
  const graceful = await execFileCapture("taskkill.exe", ["/IM", "Spotify.exe"]);

  log("openclose close command tried", {
    command: "taskkill.exe",
    args: ["/IM", "Spotify.exe"],
    ok: graceful.ok,
    code: graceful.code,
    stdout: graceful.stdout.trim(),
    stderr: graceful.stderr.trim()
  });

  tried.push({
    command: "taskkill.exe",
    args: ["/IM", "Spotify.exe"],
    ok: graceful.ok
  });

  await sleep(1500);

  if (!(await isSpotifyRunning())) {
    return {
      ok: true,
      tried
    };
  }

  const forced = await execFileCapture("taskkill.exe", ["/F", "/IM", "Spotify.exe"]);

  log("openclose close command tried", {
    command: "taskkill.exe",
    args: ["/F", "/IM", "Spotify.exe"],
    ok: forced.ok,
    code: forced.code,
    stdout: forced.stdout.trim(),
    stderr: forced.stderr.trim()
  });

  tried.push({
    command: "taskkill.exe",
    args: ["/F", "/IM", "Spotify.exe"],
    ok: forced.ok
  });

  await sleep(1000);

  return {
    ok: !(await isSpotifyRunning()),
    tried
  };
}

async function toggleSpotifyOpenClose() {
  const beforeRunning = await isSpotifyRunning();
  const action = beforeRunning ? "close" : "launch";
  const actionResult = beforeRunning ? await closeSpotify() : await launchSpotify();
  const afterRunning = await isSpotifyRunning();

  log("openclose final running state", {
    action,
    before_running: beforeRunning,
    after_running: afterRunning,
    action_ok: actionResult.ok
  });

  return {
    ok: actionResult.ok,
    action,
    was_running: beforeRunning,
    is_running: afterRunning,
    tried: actionResult.tried,
    message: actionResult.ok
      ? (afterRunning ? "Spotify is running." : "Spotify is closed.")
      : (action === "launch" ? "Could not launch Spotify." : "Could not close Spotify.")
  };
}

async function getAvailableDevices() {
  const result = await spotifyApiRequest("/me/player/devices");

  if (!result.ok) {
    return result.error;
  }

  log("devices raw response", result.data);

  const devices = ((result.data && result.data.devices) || [])
    .map(normalizeDevice)
    .filter((device) => device.id && !device.is_restricted);

  if (devices.length === 0) {
    return makeNoDevicesAvailableResponse();
  }

  let selected = devices.find((device) => device.id === state.selectedDeviceId) || null;

  if (!selected) {
    selected = devices.find((device) => device.is_active) || devices[0];
    state.selectedDeviceId = selected.id;
    saveDeviceState();
  }

  log("devices current", {
    count: devices.length,
    selected_name: selected.name,
    selected_spotify_name: selected.spotify_name,
    selected_id: selected.id
  });

  return makeDevicesResponse(devices, selected);
}

async function selectNextDevice() {
  const current = await getAvailableDevices();

  if (!current.ok) {
    log("devices select failed", current);
    return current;
  }

  const devices = current.devices;
  const currentIndex = Math.max(0, devices.findIndex((device) => device.id === current.selected.id));
  const nextIndex = (currentIndex + 1) % devices.length;
  const selected = devices[nextIndex];

  log("devices select attempt", {
    count: devices.length,
    from_index: currentIndex,
    to_index: nextIndex,
    selected_name: selected.name,
    selected_id: selected.id
  });

  const result = await spotifyApiRequest("/me/player", {
    method: "PUT",
    body: {
      device_ids: [selected.id],
      play: true
    }
  });

  if (!result.ok) {
    const response = {
      ...result.error,
      selected,
      devices,
      count: devices.length
    };

    log("devices select failed", {
      selected_name: selected.name,
      selected_id: selected.id,
      error: response.error,
      message: response.message
    });

    return response;
  }

  state.selectedDeviceId = selected.id;
  saveDeviceState();

  log("devices select ok", {
    selected_name: selected.name,
    selected_id: selected.id
  });

  return makeDevicesResponse(devices, {
    ...selected,
    is_active: true
  }, {
    switched: true
  });
}

function clampVolume(value) {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return null;
  }

  return Math.max(0, Math.min(100, Math.round(number)));
}

function makeVolumeResponse(device, volumePercent, extra) {
  return {
    ok: true,
    connected: true,
    selected: device,
    volume_percent: volumePercent,
    ...(extra || {})
  };
}

async function getActiveDeviceForVolume() {
  const result = await spotifyApiRequest("/me/player");

  if (!result.ok) {
    return result.error;
  }

  if (result.status === 204 || !result.data || !result.data.device) {
    return makeNoActiveDeviceResponse();
  }

  const device = normalizeDevice(result.data.device);

  if (device.volume_percent === null) {
    return makeDeviceVolumeUnsupportedResponse(device);
  }

  return makeVolumeResponse(device, clampVolume(device.volume_percent));
}

async function setActiveDeviceVolume(volumePercent) {
  const targetVolume = clampVolume(volumePercent);

  if (targetVolume === null) {
    return {
      ok: false,
      connected: false,
      volume_percent: null,
      error: "invalid_volume",
      message: "Volume must be a number between 0 and 100."
    };
  }

  const current = await getActiveDeviceForVolume();

  if (!current.ok) {
    return current;
  }

  const oldVolume = current.volume_percent;
  const device = current.selected;
  let endpoint = `/me/player/volume?volume_percent=${targetVolume}`;

  if (device && device.id) {
    endpoint += `&device_id=${encodeURIComponent(device.id)}`;
  }

  const result = await spotifyApiRequest(endpoint, {
    method: "PUT"
  });

  if (!result.ok) {
    const response = {
      ...result.error,
      selected: device,
      old_volume_percent: oldVolume,
      new_volume_percent: oldVolume,
      volume_percent: oldVolume
    };

    log("volume set failed", {
      device_name: device ? device.name : null,
      device_id: device ? device.id : null,
      old_volume: oldVolume,
      new_volume: targetVolume,
      error: response.error,
      message: response.message
    });

    return response;
  }

  log("volume set ok", {
    device_name: device ? device.name : null,
    device_id: device ? device.id : null,
    old_volume: oldVolume,
    new_volume: targetVolume
  });

  return makeVolumeResponse(device, targetVolume, {
    old_volume_percent: oldVolume,
    new_volume_percent: targetVolume
  });
}

async function changeActiveDeviceVolume(delta) {
  const current = await getActiveDeviceForVolume();

  if (!current.ok) {
    return current;
  }

  return setActiveDeviceVolume(current.volume_percent + delta);
}

async function getCurrentTrackForLibrary() {
  const current = await getCurrentPlayback();

  if (!current.ok) {
    return {
      ok: false,
      error: current
    };
  }

  if (!current.track_id || !current.track_uri) {
    return {
      ok: false,
      error: makeNoCurrentTrackResponse()
    };
  }

  return {
    ok: true,
    track: current
  };
}

async function getCurrentTrackLikeState() {
  const currentTrack = await getCurrentTrackForLibrary();

  if (!currentTrack.ok) {
    return currentTrack.error;
  }

  const result = await spotifyApiRequest(`/me/library/contains?uris=${encodeURIComponent(currentTrack.track.track_uri)}`);

  if (!result.ok) {
    return {
      ...result.error,
      liked: false
    };
  }

  const liked = Array.isArray(result.data) ? Boolean(result.data[0]) : false;
  return makeLikeStateResponse(currentTrack.track, liked);
}

async function toggleCurrentTrackLikeState() {
  const currentTrack = await getCurrentTrackForLibrary();

  if (!currentTrack.ok) {
    return currentTrack.error;
  }

  const currentLikeState = await getCurrentTrackLikeState();

  if (!currentLikeState.ok) {
    return currentLikeState;
  }

  const nextLiked = !currentLikeState.liked;
  const method = nextLiked ? "PUT" : "DELETE";
  const result = await spotifyApiRequest(`/me/library?uris=${encodeURIComponent(currentTrack.track.track_uri)}`, {
    method
  });

  if (!result.ok) {
    return {
      ...result.error,
      liked: currentLikeState.liked
    };
  }

  return makeLikeStateResponse(currentTrack.track, nextLiked);
}

function getSelectedPlaylistOrError() {
  if (state.playlists.length === 0) {
    return {
      ok: false,
      error: makeNoPlaylistConfiguredResponse()
    };
  }

  const selected = currentPlaylist();

  if (!selected || !isValidPlaylistUri(selected.uri)) {
    return {
      ok: false,
      error: makeInvalidPlaylistResponse(selected)
    };
  }

  return {
    ok: true,
    selected
  };
}

async function validatePlaylistIfPossible(playlist) {
  if (!playlist || !isValidPlaylistUri(playlist.uri)) {
    return {
      ok: false,
      status: "invalid",
      error: makeInvalidPlaylistResponse(playlist)
    };
  }

  const token = await getAccessToken().catch(() => null);

  if (!token) {
    log("playlist validate skipped unauthenticated", {
      name: playlist.name,
      uri: playlist.uri
    });

    return {
      ok: null,
      status: "skipped",
      message: "Spotify authentication is required to validate this playlist."
    };
  }

  const result = await spotifyApiRequest(`/playlists/${encodeURIComponent(playlist.id)}?fields=id,name`);

  if (!result.ok) {
    const message = result.error && result.error.message ? result.error.message : "Spotify could not validate this playlist.";
    log("playlist validate failed", {
      name: playlist.name,
      uri: playlist.uri,
      error: result.error
    });

    return {
      ok: false,
      status: "failed",
      error: makePlaylistUnavailableResponse(playlist, message)
    };
  }

  log("playlist validate ok", {
    name: playlist.name,
    uri: playlist.uri,
    spotify_name: result.data && result.data.name ? result.data.name : null
  });

  return {
    ok: true,
    status: "ok",
    spotify_name: result.data && result.data.name ? result.data.name : null
  };
}

async function buildPlaylistStatusList() {
  const items = [];

  for (let i = 0; i < state.playlists.length; i++) {
    const playlist = state.playlists[i];
    const validation = await validatePlaylistIfPossible(playlist);

    items.push({
      index: i,
      selected: i === state.selectedPlaylistIndex,
      name: playlist.name,
      input: playlist.input || playlist.uri,
      uri: playlist.uri,
      id: playlist.id || null,
      valid_format: isValidPlaylistUri(playlist.uri),
      validation_status: validation.status,
      validation_ok: validation.ok,
      validation_message: validation.error ? validation.error.message : validation.message || null,
      spotify_name: validation.spotify_name || null
    });
  }

  log("playlist list status", {
    total_configured: state.playlists.length,
    selected_index: state.selectedPlaylistIndex,
    selected_name: currentPlaylist() ? currentPlaylist().name : null
  });

  return {
    ok: true,
    total_configured: state.playlists.length,
    selected_index: state.selectedPlaylistIndex,
    selected: currentPlaylist(),
    playlists: items
  };
}

async function playSelectedPlaylist() {
  const selectedResult = getSelectedPlaylistOrError();

  if (!selectedResult.ok) {
    log("playlist play blocked", selectedResult.error);
    return selectedResult.error;
  }

  log("playlist play attempt", {
    total_configured: state.playlists.length,
    selected_index: state.selectedPlaylistIndex,
    name: selectedResult.selected.name,
    uri: selectedResult.selected.uri,
    input: selectedResult.selected.input
  });

  const validation = await validatePlaylistIfPossible(selectedResult.selected);

  log("playlist play validation result", {
    total_configured: state.playlists.length,
    selected_index: state.selectedPlaylistIndex,
    selected_name: selectedResult.selected.name,
    normalized_uri: selectedResult.selected.uri,
    validation_status: validation.status,
    validation_ok: validation.ok,
    message: validation.error ? validation.error.message : validation.message || null
  });

  if (validation.status === "invalid") {
    log("playlist play validation failed", validation.error);
    return validation.error;
  }

  const result = await runPlaybackCommand("/me/player/play", {
    method: "PUT",
    body: {
      context_uri: selectedResult.selected.uri
    }
  });

  if (!result.ok) {
    const knownErrors = ["not_authenticated", "no_active_device", "premium_required"];
    const response = knownErrors.includes(result.error) ? {
      ...result,
      selected: selectedResult.selected,
      index: state.selectedPlaylistIndex,
      count: state.playlists.length,
      total_configured: state.playlists.length
    } : makePlaylistCannotPlayResponse(selectedResult.selected, result);

    log("playlist play failed", {
      total_configured: state.playlists.length,
      selected_index: state.selectedPlaylistIndex,
      selected_name: selectedResult.selected.name,
      normalized_uri: selectedResult.selected.uri,
      error: response.error,
      message: response.message,
      validation_status: validation.status
    });
    return response;
  }

  log("playlist play ok", {
    total_configured: state.playlists.length,
    selected_index: state.selectedPlaylistIndex,
    name: selectedResult.selected.name,
    uri: selectedResult.selected.uri,
    validation_status: validation.status
  });

  return makePlaylistResponse({
    playing: true
  });
}

async function getAuthStatus() {
  const config = loadConfig();
  let tokens = loadTokens();
  let refreshError = null;

  try {
    const refreshResult = await refreshAccessTokenIfNeeded();
    tokens = refreshResult.tokens;
  } catch (error) {
    refreshError = error && error.message ? error.message : "Token refresh failed.";
  }

  return {
    ok: true,
    spotify_client_id_configured: Boolean(config.spotifyClientId),
    spotify_authenticated: hasValidAccessToken(tokens),
    has_refresh_token: hasRefreshToken(tokens),
    token_expires_at: tokens && tokens.expires_at ? new Date(tokens.expires_at).toISOString() : null,
    login_url: `http://${HOST}:${PORT}/login`,
    redirect_uri: REDIRECT_URI,
    refresh_error: refreshError
  };
}

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  const pathname = url.pathname;

  if (req.method === "OPTIONS") {
    sendJson(res, 204, {});
    return;
  }

  if (req.method === "GET" && pathname === "/api/status") {
    sendJson(res, 200, await getAuthStatus());
    return;
  }

  if (req.method === "GET" && pathname === "/login") {
    const config = loadConfig();

    if (!config.spotifyClientId) {
      sendHtml(res, 400, "<h1>Spotify Client ID is not configured</h1><p>Create helper/config.local.json from helper/config.example.json and restart the helper.</p>");
      return;
    }

    const verifier = createCodeVerifier();
    const loginState = base64Url(crypto.randomBytes(32));
    const challenge = createCodeChallenge(verifier);

    for (const [key, pending] of pendingLogins.entries()) {
      if (Date.now() - pending.createdAt > 10 * 60 * 1000) {
        pendingLogins.delete(key);
      }
    }

    pendingLogins.set(loginState, {
      verifier,
      createdAt: Date.now()
    });

    const authUrl = new URL(SPOTIFY_AUTHORIZE_URL);
    authUrl.search = new URLSearchParams({
      response_type: "code",
      client_id: config.spotifyClientId,
      scope: SPOTIFY_SCOPES.join(" "),
      redirect_uri: REDIRECT_URI,
      state: loginState,
      code_challenge_method: "S256",
      code_challenge: challenge
    }).toString();

    res.writeHead(302, {
      Location: authUrl.toString(),
      "Access-Control-Allow-Origin": "*"
    });
    res.end();
    return;
  }

  if (req.method === "GET" && pathname === "/callback") {
    const config = loadConfig();
    const code = url.searchParams.get("code");
    const loginState = url.searchParams.get("state");
    const spotifyError = url.searchParams.get("error");

    if (spotifyError) {
      sendHtml(res, 400, `<h1>Spotify login failed</h1><p>${escapeHtml(spotifyError)}</p>`);
      return;
    }

    if (!config.spotifyClientId) {
      sendHtml(res, 400, "<h1>Spotify Client ID is not configured</h1>");
      return;
    }

    if (!code || !loginState || !pendingLogins.has(loginState)) {
      sendHtml(res, 400, "<h1>Spotify login failed</h1><p>The OAuth state was missing or expired. Open /login and try again.</p>");
      return;
    }

    const pending = pendingLogins.get(loginState);
    pendingLogins.delete(loginState);

    try {
      const tokenResponse = await requestSpotifyToken({
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI,
        client_id: config.spotifyClientId,
        code_verifier: pending.verifier
      });

      saveTokens(tokenResponseToStoredTokens(tokenResponse));
      sendHtml(res, 200, "<h1>Spotify login complete</h1><p>You can close this tab and return to StreamDock.</p>");
    } catch (error) {
      const message = error && error.message ? error.message : "Token exchange failed.";
      sendHtml(res, 500, `<h1>Spotify login failed</h1><p>${escapeHtml(message)}</p>`);
    }
    return;
  }

  if (req.method === "GET" && pathname === "/api/current") {
    sendJson(res, 200, await getCurrentPlayback());
    return;
  }

  if (req.method === "POST" && pathname === "/api/playpause") {
    const current = await getCurrentPlayback();

    if (!current.ok) {
      sendJson(res, 200, current);
      return;
    }

    const commandPath = current.is_playing ? "/me/player/pause" : "/me/player/play";
    const result = await runPlaybackCommand(commandPath, {
      method: "PUT",
      body: current.is_playing ? undefined : {}
    });

    sendJson(res, 200, {
      ...result,
      is_playing: result.ok ? !current.is_playing : current.is_playing
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/next") {
    sendJson(res, 200, await runPlaybackCommand("/me/player/next", {
      method: "POST"
    }));
    return;
  }

  if (req.method === "POST" && pathname === "/api/previous") {
    sendJson(res, 200, await runPlaybackCommand("/me/player/previous", {
      method: "POST"
    }));
    return;
  }

  if (req.method === "POST" && pathname === "/api/shuffle") {
    const current = await getCurrentPlayback();

    if (!current.ok) {
      sendJson(res, 200, current);
      return;
    }

    const nextShuffleState = !current.shuffle_state;
    const result = await runPlaybackCommand(`/me/player/shuffle?state=${nextShuffleState}`, {
      method: "PUT"
    });

    sendJson(res, 200, {
      ...result,
      shuffle_state: result.ok ? nextShuffleState : current.shuffle_state
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/like-current") {
    sendJson(res, 200, await toggleCurrentTrackLikeState());
    return;
  }

  if (req.method === "GET" && pathname === "/api/current-like-state") {
    sendJson(res, 200, await getCurrentTrackLikeState());
    return;
  }

  if (req.method === "GET" && pathname === "/api/playlist/list") {
    sendJson(res, 200, await buildPlaylistStatusList());
    return;
  }

  if (req.method === "GET" && pathname === "/api/devices/current") {
    sendJson(res, 200, await getAvailableDevices());
    return;
  }

  if (req.method === "POST" && pathname === "/api/devices/select-next") {
    sendJson(res, 200, await selectNextDevice());
    return;
  }

  if (req.method === "GET" && pathname === "/api/volume/current") {
    sendJson(res, 200, await getActiveDeviceForVolume());
    return;
  }

  if (req.method === "POST" && pathname === "/api/volume/up") {
    sendJson(res, 200, await changeActiveDeviceVolume(5));
    return;
  }

  if (req.method === "POST" && pathname === "/api/volume/down") {
    sendJson(res, 200, await changeActiveDeviceVolume(-5));
    return;
  }

  if (req.method === "POST" && pathname === "/api/volume/set") {
    const body = await readJsonBody(req);
    const requestedVolume = body.volume_percent !== undefined ? body.volume_percent : body.volume;
    sendJson(res, 200, await setActiveDeviceVolume(requestedVolume));
    return;
  }

  if (req.method === "POST" && pathname === "/api/openclose") {
    sendJson(res, 200, await toggleSpotifyOpenClose());
    return;
  }

  if (req.method === "GET" && pathname === "/api/openclose-state") {
    const isRunning = await isSpotifyRunning();
    sendJson(res, 200, {
      ok: true,
      is_running: isRunning
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/playlist/set-options") {
    const body = await readJsonBody(req);
    const nextPlaylists = normalizePlaylists(body.options);

    log("playlist set received", {
      total_configured: nextPlaylists.length,
      previous_total: state.playlists.length
    });

    if (nextPlaylists.length === 0) {
      state.playlists = [];
      state.selectedPlaylistIndex = 0;
      savePlaylistState();

      sendJson(res, 200, makeNoPlaylistConfiguredResponse());
      return;
    }

    state.playlists = nextPlaylists;

    if (state.selectedPlaylistIndex >= state.playlists.length || state.selectedPlaylistIndex < 0) {
      state.selectedPlaylistIndex = 0;
    }

    savePlaylistState();
    log("playlist set saved", {
      total_configured: state.playlists.length,
      selected_index: state.selectedPlaylistIndex,
      selected_name: currentPlaylist() ? currentPlaylist().name : null,
      normalized_uri: currentPlaylist() ? currentPlaylist().uri : null
    });

    sendJson(res, 200, makePlaylistResponse());
    return;
  }

  if (req.method === "GET" && pathname === "/api/playlist/current") {
    if (state.playlists.length === 0) {
      sendJson(res, 200, makeNoPlaylistConfiguredResponse());
      return;
    }

    const selected = currentPlaylist();

    log("playlist current", {
      total_configured: state.playlists.length,
      selected_index: state.selectedPlaylistIndex,
      selected_name: selected ? selected.name : null,
      normalized_uri: selected ? selected.uri : null,
      valid_format: selected ? isValidPlaylistUri(selected.uri) : false
    });

    sendJson(res, 200, makePlaylistResponse());
    return;
  }

  if (req.method === "POST" && pathname === "/api/playlist/select-next") {
    if (state.playlists.length === 0) {
      sendJson(res, 200, makeNoPlaylistConfiguredResponse());
      return;
    }

    state.selectedPlaylistIndex = (state.selectedPlaylistIndex + 1) % state.playlists.length;
    const selected = currentPlaylist();

    savePlaylistState();
    log("playlist selected next", {
      total_configured: state.playlists.length,
      selected_index: state.selectedPlaylistIndex,
      selected_name: selected ? selected.name : null,
      normalized_uri: selected ? selected.uri : null,
      valid_format: selected ? isValidPlaylistUri(selected.uri) : false
    });

    sendJson(res, 200, {
      ok: true,
      connected: true,
      name: selected ? selected.name : null,
      uri: selected ? selected.uri : null,
      selected,
      index: state.selectedPlaylistIndex,
      count: state.playlists.length,
      total_configured: state.playlists.length
    });
    return;
  }

  if (req.method === "POST" && pathname === "/api/play-playlist") {
    sendJson(res, 200, await playSelectedPlaylist());
    return;
  }

  sendJson(res, 404, {
    ok: false,
    error: "Not found"
  });
}

loadPlaylistState();
loadDeviceState();

log("helper process starting", {
  pid: process.pid,
  node: process.execPath,
  cwd: process.cwd(),
  helper_dir: __dirname,
  config_file: CONFIG_FILE,
  token_file: TOKEN_FILE,
  playlist_state_file: PLAYLIST_STATE_FILE,
  device_state_file: DEVICE_STATE_FILE,
  log_file: LOG_FILE
});

process.on("uncaughtException", (error) => {
  log("uncaught exception", errorDetails(error));
  process.exitCode = 1;
});

process.on("unhandledRejection", (reason) => {
  log("unhandled rejection", errorDetails(reason));
});

const server = http.createServer((req, res) => {
  handleRequest(req, res).catch((error) => {
    log("request handler failed", {
      method: req.method,
      url: req.url,
      error: errorDetails(error)
    });
    sendJson(res, 500, {
      ok: false,
      error: error && error.message ? error.message : "Internal server error"
    });
  });
});

server.on("error", (error) => {
  log("server listen error", errorDetails(error));
});

server.listen(PORT, HOST, () => {
  log("server listening", {
    host: HOST,
    port: PORT
  });
  console.log(`Spotify helper stub listening at http://${HOST}:${PORT}`);
  console.log(`Spotify auth status: http://${HOST}:${PORT}/api/status`);
  console.log(`Spotify login URL: http://${HOST}:${PORT}/login`);
});
