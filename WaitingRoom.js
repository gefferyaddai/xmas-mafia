import { listenToRoom, startGameWithRoles } from "./Rooms.js";

function qs(id) { return document.getElementById(id); }

const params = new URLSearchParams(window.location.search);
const code = params.get("room");
const myPlayerId = params.get("pid");
const myHostId = params.get("hid");

if (!code) {
    alert("Missing room code.");
    window.location.href = "LandingPage.html";
}

qs("roomCodeInput").value = code;

listenToRoom(code, (room) => {
    if (!room) {
        alert("Room ended or not found.");
        window.location.href = "LandingPage.html";
        return;
    }

    const players = room.players || {};
    const names = Object.values(players).map(p => p.name);

    qs("countText").textContent = `Players: ${names.length} / ${room.maxPlayers}`;
    qs("playerList").innerHTML = names.map(n => `<div>🎁 ${n}</div>`).join("");

    const isHost = room.hostId && myHostId && room.hostId === myHostId;
    const canStart = Object.keys(players).length >= 4;

    qs("startBtn").style.display = (isHost && canStart) ? "block" : "none";

    // when game starts → redirect everyone
    if (room.status === "started" && room.phase === "roleReveal") {
        window.location.href = `Game.html?room=${code}&pid=${myPlayerId || ""}&hid=${myHostId || ""}`;
    }
});

qs("startBtn").addEventListener("click", async () => {
    try {
        await startGameWithRoles(code);
    } catch (e) {
        alert(e.message || "Could not start game.");
    }
});
