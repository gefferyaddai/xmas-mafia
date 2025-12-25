import { db } from "./FireBase-init.js";
import { ref, onValue, update } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const qs = (id) => document.getElementById(id);

const params = new URLSearchParams(window.location.search);
const code = params.get("room");
const pid  = params.get("pid");
const hid  = params.get("hid");

const phaseTitle = qs("phaseTitle");
const story = qs("story");
const actionPanel = qs("actionPanel");
const actionPrompt = qs("actionPrompt");
const playerButtons = qs("playerButtons");
const confirmBtn = qs("confirmBtn");
const timerPanel = qs("timerPanel");
const timerText = qs("timerText");
const continueBtn = qs("continueBtn");
const readyText = qs("readyText");

let selectedTarget = null;
let narratorEnabled = true;
let lastSpokenKey = "";

function htmlToText(html) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return (tmp.textContent || tmp.innerText || "").replace(/\s+/g, " ").trim();
}

function speak(text, key = "") {
    if (!narratorEnabled) return;
    if (!text) return;
    if (key && key === lastSpokenKey) return;
    if (key) lastSpokenKey = key;

    try { window.speechSynthesis.resume(); } catch (e) {}
    window.speechSynthesis.cancel();

    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0;
    u.pitch = 1.0;
    u.volume = 1.0;

    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => /en/i.test(v.lang) && /female|samantha|zira|google/i.test(v.name));
    if (preferred) u.voice = preferred;

    window.speechSynthesis.speak(u);
}

window.speechSynthesis.onvoiceschanged = () => {};

const ttsToggle = document.getElementById("ttsToggle");
if (ttsToggle) {
    ttsToggle.onclick = () => {
        narratorEnabled = !narratorEnabled;
        ttsToggle.textContent = narratorEnabled ? "🔊 Narrator: ON" : "🔇 Narrator: OFF";
        if (!narratorEnabled) window.speechSynthesis.cancel();
    };
}

function phaseKey(room) {
    const round = room.round || 1;
    return `${room.phase}_${round}`;
}

async function markPhaseReady(room) {
    const key = phaseKey(room);
    await update(ref(db, `rooms/${code}/phaseReady/${key}`), { [pid]: true });
}

function aliveCount(room) {
    const alive = room.alive || {};
    return Object.values(alive).filter(Boolean).length;
}

function readyCountFor(room) {
    const key = phaseKey(room);
    const ready = room.phaseReady?.[key] || {};
    const alive = room.alive || {};
    return Object.keys(ready).filter(p => ready[p] && alive[p]).length;
}

async function advancePhaseOnce(room, nextPhase, extra = {}) {
    const key = phaseKey(room);
    if (room._advancedKey === key) return;

    await update(ref(db, `rooms/${code}`), {
        phase: nextPhase,
        _advancedKey: key,
        ...extra
    });
}

function showContinueReadyUI(room, nextPhase, label = "Continue") {
    const alive = aliveCount(room);
    const ready = readyCountFor(room);

    continueBtn.style.display = "block";
    continueBtn.disabled = false;
    continueBtn.textContent = label;

    readyText.textContent = `Ready: ${ready} / ${alive}`;

    continueBtn.onclick = async () => {
        continueBtn.disabled = true;
        continueBtn.textContent = "Ready ✅";
        await markPhaseReady(room);
    };

    if (alive > 0 && ready === alive) {
        advancePhaseOnce(room, nextPhase);
    }
}

function isHost(room) {
    return room?.hostId && hid && room.hostId === hid;
}

function myRole(room) {
    return room?.roles?.[pid]?.role || null;
}

function alivePlayers(room, includeSelf = true) {
    const alive = room.alive || {};
    const roles = room.roles || {};
    return Object.keys(alive)
        .filter(p => alive[p])
        .filter(p => includeSelf ? true : p !== pid)
        .map(p => ({ pid: p, name: roles[p]?.name || "Player" }));
}

function hideAll() {
    actionPanel.style.display = "none";
    timerPanel.style.display = "none";
    confirmBtn.style.display = "none";
    continueBtn.style.display = "none";
    readyText.textContent = "";
    selectedTarget = null;
    confirmBtn.disabled = false;
}

function renderPlayerChoice(list) {
    playerButtons.innerHTML = "";
    list.forEach(pl => {
        const btn = document.createElement("button");
        btn.className = "button small";
        btn.textContent = pl.name;
        btn.onclick = () => {
            selectedTarget = pl.pid;
            [...playerButtons.children].forEach(b => b.style.opacity = "0.7");
            btn.style.opacity = "1";
            confirmBtn.style.display = "block";
        };
        btn.style.opacity = "0.7";
        playerButtons.appendChild(btn);
    });
}

async function writeAction(type, room, targetPid) {
    const round = String(room.round || 1);
    await update(ref(db, `rooms/${code}/actions/${round}`), {
        [type]: { by: pid, target: targetPid, at: Date.now() }
    });
}

async function writeVote(room, targetPid) {
    const round = String(room.round || 1);
    await update(ref(db, `rooms/${code}/votes/${round}`), {
        [pid]: targetPid
    });
}

function formatNightStory(room) {
    const res = room.lastResult || {};
    if (!res.killedPid) {
        return `<p>During the night, someone tried to sabotage the workshop…</p>
                <p>…but an angel swooped in and saved the day. ✨</p>`;
    }
    const killedName = room.roles?.[res.killedPid]?.name || "someone";
    return `<p>During the night, <b>${killedName}</b> was sabotaged while making toys… 🧸💥</p>`;
}

function formatDayStory(room) {
    const res = room.lastResult || {};
    if (!res.eliminatedPid) return `<p>No one was eliminated today.</p>`;
    const name = room.roles?.[res.eliminatedPid]?.name || "someone";
    const role = room.roles?.[res.eliminatedPid]?.role || "Town";
    return `<p>The crowd voted… and <b>${name}</b> was escorted out. 🎁</p>
            <p><i>They were:</i> <b>${role}</b></p>`;
}

function checkWinner(room) {
    const alive = room.alive || {};
    const roles = room.roles || {};
    const alivePids = Object.keys(alive).filter(p => alive[p]);

    const murdererAlive = alivePids.some(p => roles[p]?.role === "Murderer");
    if (!murdererAlive) return "town";

    const townCount = alivePids.filter(p => roles[p]?.role !== "Murderer").length;
    const murdererCount = alivePids.filter(p => roles[p]?.role === "Murderer").length;

    if (murdererCount >= townCount) return "elves";
    return null;
}

function render(room) {
    hideAll();

    const role = myRole(room);
    const phase = room.phase || "roleReveal";
    const amAlive = room.alive?.[pid] ?? true;
    const round = room.round || 1;

    if (phase === "roleReveal") {
        phaseTitle.textContent = "Your Role";
        story.innerHTML = "";

        const roleMeta = {
            Murderer: { title: "🧝 Killer Elf", pill: "EVIL", desc: "Pick one player to sabotage each night. Blend in." },
            Santa: { title: "🎅 Santa (Doctor)", pill: "GOOD", desc: "Pick one player to protect each night (you may protect yourself)." },
            HeadElf: { title: "🕵️ Head Elf", pill: "GOOD", desc: "Starting Round 2, inspect one player each night." },
            Town: { title: "🎶 Town Member", pill: "GOOD", desc: "No night power. Discuss and vote wisely." }
        };

        const meta = roleMeta[role] || roleMeta.Town;

        story.innerHTML = `
        <div id="roleCard" class="role-card" data-role="${role || "Town"}">
            <div class="role-header">
                <h3 class="role-title">${meta.title}</h3>
                <span class="role-pill">${meta.pill}</span>
            </div>
            <p class="role-desc">${meta.desc}</p>
        </div>
        `;

        continueBtn.style.display = "block";
        continueBtn.disabled = false;
        continueBtn.textContent = "Continue";

        const total = Object.keys(room.players || {}).length;
        const rdy = Object.values(room.ready || {}).filter(Boolean).length;
        readyText.textContent = `Ready: ${rdy} / ${total}`;

        continueBtn.onclick = async () => {
            continueBtn.disabled = true;
            continueBtn.textContent = "Ready ✅";
            await update(ref(db, `rooms/${code}/ready`), { [pid]: true });
        };

        if (isHost(room) && total > 0 && rdy === total) {
            update(ref(db, `rooms/${code}`), { phase: "intro" });
        }
        return;
    }

    if (!amAlive) {
        phaseTitle.textContent = "👻 You are out";
        story.innerHTML = `<p>You can watch the story unfold.</p>`;
        return;
    }
}

async function hostTick(room) {
    const round = room.round || 1;
    const r = String(round);
    const actions = room.actions?.[r] || {};

    if (room.phase === "night_killer" && actions.killer?.target) {
        await advancePhaseOnce(room, "night_santa");
        return;
    }

    if (room.phase === "night_santa" && actions.santa?.target) {
        if (round >= 2) await advancePhaseOnce(room, "night_detective");
        else await advancePhaseOnce(room, "night_resolve");
        return;
    }

    if (room.phase === "night_detective" && actions.detective?.target) {
        await advancePhaseOnce(room, "night_resolve");
    }
}

if (!code || !pid) {
    phaseTitle.textContent = "Missing room info";
    story.innerHTML = `<p>Game.html needs:</p><code>?room=ABCDEF&pid=PLAYERID&hid=HOSTID</code>`;
} else {
    onValue(ref(db, `rooms/${code}`), (snap) => {
        const room = snap.val();
        if (!room) return;
        render(room);
        hostTick(room);
    });
}
