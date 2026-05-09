let websocket = null;
let currentContext = null;
let currentSettings = {};

function connectElgatoStreamDeckSocket(inPort, inPropertyInspectorUUID, inRegisterEvent, inInfo, inActionInfo) {
    const actionInfo = JSON.parse(inActionInfo);
    currentContext = actionInfo.context;

    websocket = new WebSocket("ws://127.0.0.1:" + inPort);

    websocket.onopen = function () {
        websocket.send(JSON.stringify({
            event: inRegisterEvent,
            uuid: inPropertyInspectorUUID
        }));

        websocket.send(JSON.stringify({
            event: "getSettings",
            context: currentContext
        }));
    };

    websocket.onmessage = function (evt) {
        const data = JSON.parse(evt.data);

        if (data.event === "didReceiveSettings") {
            currentSettings = (data.payload && data.payload.settings) || {};
            document.getElementById("playlistList").value = currentSettings.playlistList || "";
        }
    };
}

function saveSettings() {
    currentSettings.playlistList = document.getElementById("playlistList").value;

    websocket.send(JSON.stringify({
        event: "setSettings",
        context: currentContext,
        payload: currentSettings
    }));
}

document.addEventListener("DOMContentLoaded", function () {
    document.getElementById("playlistList").addEventListener("input", saveSettings);
});

window.connectElgatoStreamDeckSocket = connectElgatoStreamDeckSocket;