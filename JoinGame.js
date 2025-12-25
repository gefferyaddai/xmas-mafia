import { joinRoom } from "./Rooms.js";

const codeInput = document.getElementById("joinCode");
const nameInput = document.getElementById("playerName");
const joinBtn = document.getElementById("joinBtn");
const err = document.getElementById("err");

joinBtn.addEventListener("click", async () => {
    err.textContent = "";

    const code = codeInput.value.trim().toUpperCase();
    const name = nameInput.value.trim();

    if (!code) {
        err.textContent = "Please enter a room code.";
        return;
    }
    if (!name) {
        err.textContent = "Please enter a username.";
        return;
    }

    joinBtn.disabled = true;
    joinBtn.textContent = "Joining...";

    try {
        const { hostId, playerId } = await joinRoom({ code, name });
        window.location.href = `WaitingRoom.html?room=${code}&hid=${hostId}&pid=${playerId}`;
    } catch (e) {
        err.textContent = e.message || "Could not join room.";
    } finally {
        joinBtn.disabled = false;
        joinBtn.textContent = "Join";
    }
});
