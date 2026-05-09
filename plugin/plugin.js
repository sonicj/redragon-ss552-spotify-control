const fs = require("fs");
const path = require("path");

const LOG_FILE = path.join(process.env.USERPROFILE, "Desktop", "spotify_plugin_log.txt");

function log(message) {
    try {
        fs.appendFileSync(LOG_FILE, new Date().toISOString() + " " + message + "\r\n");
    } catch (e) {
    }
}

let websocket = null;

function connectElgatoStreamDeckSocket(inPort, inPluginUUID, inRegisterEvent, inInfo) {
    log("connect called");
    log("port=" + inPort);
    log("pluginUUID=" + inPluginUUID);
    log("registerEvent=" + inRegisterEvent);

    websocket = new WebSocket("ws://127.0.0.1:" + inPort);

    websocket.onopen = function () {
        log("websocket opened");
        websocket.send(JSON.stringify({
            event: inRegisterEvent,
            uuid: inPluginUUID
        }));
        log("register message sent");
    };

    websocket.onmessage = function (evt) {
        log("message received: " + evt.data);

        let data = null;
        try {
            data = JSON.parse(evt.data);
        } catch (e) {
            log("json parse failed");
            return;
        }

        if (data.event === "keyDown") {
            log("keyDown action=" + data.action);
        }

        if (data.event === "keyUp") {
            log("keyUp action=" + data.action);
        }

        if (data.event === "willAppear") {
            log("willAppear action=" + data.action);
        }
    };

    websocket.onerror = function () {
        log("websocket error");
    };

    websocket.onclose = function () {
        log("websocket closed");
    };
}