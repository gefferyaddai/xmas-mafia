import { GenerateGameCode, CreateRoom } from "./Rooms.js";

const codeInput = document.getElementById("roomCode");
const nameInput = document.getElementById("hostName");
const createBtn = document.getElementById("createBtn");
const err = document.getElementById("err");

const code = GenerateGameCode();
codeInput.value = code;

createBtn.addEventListener("click", async () => {
    err.textContent = "";

    const hostName = nameInput.value.trim();
    if (!hostName) {
        err.textContent = "Please enter a username.";
        return;
    }

    createBtn.disabled = true;
    createBtn.textContent = "Creating...";

    try {
        const { hostId, playerId } = await CreateRoom({
            code,
            hostName,
            maxPlayers: 10
        });

        window.location.href = `WaitingRoom.html?room=${code}&hid=${hostId}&pid=${playerId}`;
    } catch (e) {
        err.textContent = e.message || "Failed to create room.";
    } finally {
        createBtn.disabled = false;
        createBtn.textContent = "Create Game";
    }
});
