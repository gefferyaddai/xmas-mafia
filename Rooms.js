import {db} from "./FireBase-init.js"

import {
    ref, set, update, push, onValue, get
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";


export function GenerateGameCode(){
    const letters = "abcdefghijklmnopqrstuvwxyz";
    let gameCode = "";

    for (let i = 0; i < 6; i++){
        const randomINdex = Math.floor(Math.random() * letters.length);
        gameCode += letters[randomINdex];

    }
    return gameCode.toUpperCase();
}

export async function CreateRoom({code, hostName, maxPlayers = 10}) {
    const roomRef = ref(db, `rooms/${code}`);
    const now = Date.now();

    const hostId = crypto.randomUUID();
    const playerId = crypto.randomUUID();

    await set(roomRef, {
        status: "lobby",
        maxPlayers,
        hostId,
        createdAt: now,
        players: {
            [playerId]: { name: hostName, joinedAt: now, isHost: true }
        }
    });

    return {code, hostId, playerId};
}

export async function joinRoom({ code, name }) {
    const roomRef = ref(db, `rooms/${code}`);
    const snap = await get(roomRef);

    if (!snap.exists()) throw new Error("Room not found.");

    const room = snap.val();
    if (room.status !== "lobby") throw new Error("Game already started.");

    const players = room.players || {};
    const count = Object.keys(players).length;
    if (count >= room.maxPlayers) throw new Error("Room is full.");

    const playerId = crypto.randomUUID();
    const now = Date.now();

    await update(ref(db, `rooms/${code}/players/${playerId}`), {
        name,
        joinedAt: now,
        isHost: false
    });

    return { code, playerId, hostId: room.hostId };
}

export function listenToRoom(code, cb) {
    const roomRef = ref(db, `rooms/${code}`);
    return onValue(roomRef, (snap) => cb(snap.val()));
}

export async function startGame(code) {
    await update(ref(db, `rooms/${code}`), { status: "started", startedAt: Date.now() });
}



function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

export async function startGameWithRoles(code) {
    const snap = await get(ref(db, `rooms/${code}`));
    if (!snap.exists()) throw new Error("Room not found.");

    const room = snap.val();
    const playersObj = room.players || {};
    const playerIds = Object.keys(playersObj);

    if (playerIds.length < 4) throw new Error("Need at least 4 players to start.");

    const roles = ["Murderer", "Santa", "HeadElf"];
    while (roles.length < playerIds.length) roles.push("Town");

    shuffle(playerIds);
    shuffle(roles);

    const assignments = {};
    for (let i = 0; i < playerIds.length; i++) {
        const pid = playerIds[i];
        assignments[pid] = { role: roles[i], name: playersObj[pid].name };
    }

    const alive = {};
    for (const pid of playerIds) alive[pid] = true;

    await update(ref(db, `rooms/${code}`), {
        roles: assignments,
        alive,
        round: 1,
        ready: null,
        actions: null,
        votes: null,
        lastResult: null,
        phase: "roleReveal",
        status: "started",
        startedAt: Date.now()
    });

    return assignments;
}
