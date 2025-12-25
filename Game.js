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
let lastSpokenKey = ""; // prevents repeating the same line on every Firebase update

function htmlToText(html) {
    const tmp = document.createElement("div");
    tmp.innerHTML = html;
    return (tmp.textContent || tmp.innerText || "").replace(/\s+/g, " ").trim();
}

function speak(text, key = "") {

    if (!narratorEnabled) return;
    if (!text) return;

    // prevent repeating
    if (key && key === lastSpokenKey) return;
    if (key) lastSpokenKey = key;

    try { window.speechSynthesis.resume(); } catch (e) {}
    // stop previous speech
    window.speechSynthesis.cancel();

    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0;     // speed
    u.pitch = 1.0;    // tone
    u.volume = 1.0;   // volume

    // OPTIONAL: pick a nicer English voice if available
    const voices = window.speechSynthesis.getVoices();
    const preferred = voices.find(v => /en/i.test(v.lang) && /female|samantha|zira|google/i.test(v.name));
    if (preferred) u.voice = preferred;

    window.speechSynthesis.speak(u);
}

// load voices on iOS / Chrome
window.speechSynthesis.onvoiceschanged = () => {};

const ttsToggle = document.getElementById("ttsToggle");
if (ttsToggle) {
    ttsToggle.onclick = () => {
        narratorEnabled = !narratorEnabled;
        ttsToggle.textContent = narratorEnabled ? "🔊 Narrator: ON" : "🔇 Narrator: OFF";
        if (!narratorEnabled) window.speechSynthesis.cancel();
    };
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

async function hostAdvance(room, nextPhase, extra = {}) {
    if (!isHost(room)) return;
    await update(ref(db, `rooms/${code}`), { phase: nextPhase, ...extra });
}

// timers
function startCountdown(endsAt, labelWhenDone) {
    timerPanel.style.display = "block";
    const tick = () => {
        const ms = Math.max(0, endsAt - Date.now());
        const s = Math.ceil(ms / 1000);
        timerText.textContent = `Time remaining: ${s}s`;
        if (ms <= 0) timerText.textContent = labelWhenDone;
    };
    tick();
    const iv = setInterval(() => {
        tick();
        if (Date.now() >= endsAt) clearInterval(iv);
    }, 250);
}

async function markReady() {
    continueBtn.disabled = true;
    continueBtn.textContent = "Ready ✅";
    await update(ref(db, `rooms/${code}/ready`), { [pid]: true });
}


function render(room) {
    hideAll();

    const role = myRole(room);
    const phase = room.phase || "roleReveal";
    const amAlive = room.alive?.[pid] ?? true;

    if (phase === "roleReveal") {
        phaseTitle.textContent = "Your Role";
        story.innerHTML = "";

        continueBtn.style.display = "block";
        continueBtn.disabled = false;
        continueBtn.textContent = "Continue";

        const cards = {
            Murderer: ["🧝 Killer Elf", "Pick one player to sabotage each night. Blend in."],
            Santa: ["🎅 Santa (Doctor)", "Pick one player to protect each night."],
            HeadElf: ["🕵️ Head Elf", "Starting Round 2, inspect one player each night."],
            Town: ["🎶 Town Member", "No night power. Discuss and vote wisely."]
        };
        const [t, desc] = cards[role] || cards.Town;
        story.innerHTML = `<p style="font-size:22px;"><b>${t}</b></p><p>${desc}</p>`;

        const total = Object.keys(room.players || {}).length;
        const readyCount = Object.values(room.ready || {}).filter(Boolean).length;
        readyText.textContent = `Ready: ${readyCount} / ${total}`;

        continueBtn.onclick = markReady;

        if (isHost(room) && total > 0 && readyCount === total) {
            hostAdvance(room, "intro");
        }
        return;
    }

    // intro
    if (phase === "intro") {
        phaseTitle.textContent = "🎄 North Pole Nights";
        story.innerHTML = `<p>The workshop is buzzing… but something feels off.</p>
                       <p>Someone has been sabotaging toys after midnight.</p>
                       <p>Stay sharp. Trust no one.</p>`;
        speak(htmlToText(story.innerHTML), `intro`);
        return;
    }

    // sleep
    if (phase === "night_sleep") {
        phaseTitle.textContent = "🌙 Night Falls";
        story.innerHTML = `<p>Everyone close your eyes…</p><p>The North Pole goes silent.</p>`;
        speak(htmlToText(story.innerHTML), `night_sleep_${room.round || 1}`);

        return;
    }

    // dead spectators
    if (!amAlive) {
        phaseTitle.textContent = "👻 You are out";
        story.innerHTML = `<p>You can watch the story unfold.</p>`;
        if (phase === "night_resolve") story.innerHTML = formatNightStory(room);
        if (phase === "day_story" || phase === "day_resolve") story.innerHTML = formatDayStory(room);
        return;
    }

    if (phase === "night_killer") {
        phaseTitle.textContent = "🧝 Killer Elf Turn";
        if (role !== "Murderer") {
            story.innerHTML = `<p>Shhh… stay asleep.</p>`;
            return;
        }
        story.innerHTML = `<p>Choose ONE player to sabotage.</p>`;
        actionPanel.style.display = "block";
        actionPrompt.textContent = "Pick a target:";
        renderPlayerChoice(alivePlayers(room, false));
        confirmBtn.onclick = async () => {
            if (!selectedTarget) return;
            confirmBtn.disabled = true;
            await writeAction("killer", room, selectedTarget);
            story.innerHTML = `<p>Target chosen. Go back to sleep…</p>`;
            actionPanel.style.display = "none";
        };
        return;
    }

    if (phase === "night_santa") {
        phaseTitle.textContent = "🎅 Santa Turn";
        if (role !== "Santa") {
            story.innerHTML = `<p>Shhh… stay asleep.</p>`;
            return;
        }
        story.innerHTML = `<p>Choose ONE player to protect (you may protect yourself).</p>`;
        actionPanel.style.display = "block";
        actionPrompt.textContent = "Pick someone to save:";
        renderPlayerChoice(alivePlayers(room, true));
        confirmBtn.onclick = async () => {
            if (!selectedTarget) return;
            confirmBtn.disabled = true;
            await writeAction("santa", room, selectedTarget);
            story.innerHTML = `<p>Protection chosen. Go back to sleep…</p>`;
            actionPanel.style.display = "none";
        };
        return;
    }

    if (phase === "night_detective") {
        phaseTitle.textContent = "🕵️ Head Elf Turn";
        if (role !== "HeadElf") {
            story.innerHTML = `<p>Shhh… stay asleep.</p>`;
            return;
        }
        story.innerHTML = `<p>Choose ONE player to investigate.</p>`;
        actionPanel.style.display = "block";
        actionPrompt.textContent = "Pick someone to inspect:";
        renderPlayerChoice(alivePlayers(room, false));
        confirmBtn.onclick = async () => {
            if (!selectedTarget) return;
            confirmBtn.disabled = true;
            await writeAction("detective", room, selectedTarget);
            story.innerHTML = `<p>Investigation locked in. Go back to sleep…</p>`;
            actionPanel.style.display = "none";
        };
        return;
    }

    if (phase === "night_resolve") {
        story.innerHTML = formatNightStory(room);
        speak(htmlToText(story.innerHTML), `morning_${room.lastResult?.resolvedRound || room.round || 1}`);
    }
    if (phase === "day_story" || phase === "day_resolve") {
        story.innerHTML = phase === "day_story"
            ? `<p>The workshop gathers to discuss what happened.</p>`
            : formatDayStory(room);
        speak(htmlToText(story.innerHTML), `${phase}_${room.round || 1}`);
    }


    if (phase === "day_discuss") {
        phaseTitle.textContent = "⏳ Discuss";
        story.innerHTML = `<p>Talk it out. Who’s acting suspicious?</p>`;
        const endsAt = room.timers?.discussEndsAt || 0;
        if (endsAt) startCountdown(endsAt, "Discussion over.");

        speak(htmlToText(story.innerHTML), `day_discuss_${room.round || 1}`);
        return;
    }

    if (phase === "day_vote") {
        phaseTitle.textContent = "🗳️ Vote";
        story.innerHTML = `<p>Vote to eliminate one player.</p>`;
        actionPanel.style.display = "block";
        actionPrompt.textContent = "Vote for:";
        renderPlayerChoice(alivePlayers(room, false));
        confirmBtn.onclick = async () => {
            if (!selectedTarget) return;
            confirmBtn.disabled = true;
            await writeVote(room, selectedTarget);
            story.innerHTML = `<p>Vote submitted.</p>`;
            actionPanel.style.display = "none";
        };
        const endsAt = room.timers?.voteEndsAt || 0;
        if (endsAt) startCountdown(endsAt, "Voting over.");

        speak(htmlToText(story.innerHTML), `day_vote`);
        return;
    }

    if (phase === "day_resolve") {
        phaseTitle.textContent = "🎁 Results";
        story.innerHTML = formatDayStory(room);

        speak(htmlToText(story.innerHTML), `day_resolve`);
        return;
    }

    if (phase === "game_over") {
        phaseTitle.textContent = "🏁 Game Over";
        const w = room.winner;
        story.innerHTML = w === "town"
            ? `<p><b>The Town wins!</b> The Killer Elf has been caught.</p>`
            : `<p><b>The Elves win!</b> The workshop has fallen into chaos.</p>`;
        return;
    }

    phaseTitle.textContent = "Loading...";
    story.innerHTML = `<p>Waiting for game phase...</p>`;
}


async function hostTick(room) {
    if (!isHost(room)) return;

    const round = room.round || 1;
    const r = String(round);
    const actions = room.actions?.[r] || {};

    // intro -> night_sleep (once)
    if (room.phase === "intro" && room._introDone !== true) {
        await update(ref(db, `rooms/${code}`), { phase: "night_sleep", _introDone: true });
        return;
    }

    // night_sleep -> night_killer (once per round)
    if (room.phase === "night_sleep" && room._sleepDoneRound !== round) {
        await update(ref(db, `rooms/${code}`), { phase: "night_killer", _sleepDoneRound: round });
        return;
    }

    // night_killer -> santa
    if (room.phase === "night_killer" && actions.killer?.target) {
        await hostAdvance(room, "night_santa");
        return;
    }

    // night_santa -> detective (round >=2) else resolve
    if (room.phase === "night_santa" && actions.santa?.target) {
        if (round >= 2) await hostAdvance(room, "night_detective");
        else await hostAdvance(room, "night_resolve");
        return;
    }

    // detective -> resolve
    if (room.phase === "night_detective" && actions.detective?.target) {
        await hostAdvance(room, "night_resolve");
        return;
    }

    // resolve night -> discussion
    if (room.phase === "night_resolve") {
        if (room.lastResult?.resolvedRound === round) return;

        const killerTarget = actions.killer?.target || null;
        const santaSave = actions.santa?.target || null;
        const killedPid = (killerTarget && killerTarget !== santaSave) ? killerTarget : null;

        const updates = {
            lastResult: {
                resolvedRound: round,
                killedPid: killedPid || null,
                savedPid: santaSave || null
            },
            phase: "day_story"
        };

        if (killedPid) updates[`alive/${killedPid}`] = false;

        await update(ref(db, `rooms/${code}`), updates);

        const discussEndsAt = Date.now() + 120000;
        await update(ref(db, `rooms/${code}`), {
            phase: "day_discuss",
            timers: { ...(room.timers || {}), discussEndsAt }
        });
        return;
    }

    // discussion -> vote
    if (room.phase === "day_discuss") {
        const endsAt = room.timers?.discussEndsAt || 0;
        if (endsAt && Date.now() >= endsAt) {
            const voteEndsAt = Date.now() + 45000;
            await update(ref(db, `rooms/${code}`), {
                phase: "day_vote",
                timers: { ...(room.timers || {}), voteEndsAt }
            });
        }
        return;
    }

    // vote -> resolve -> win -> next round
    if (room.phase === "day_vote") {
        const endsAt = room.timers?.voteEndsAt || 0;
        if (!endsAt || Date.now() < endsAt) return;

        const votes = room.votes?.[r] || {};
        const alive = room.alive || {};

        const counts = {};
        for (const [voter, target] of Object.entries(votes)) {
            if (!alive[voter]) continue;
            if (!alive[target]) continue;
            counts[target] = (counts[target] || 0) + 1;
        }

        let eliminatedPid = null;
        let top = 0;
        for (const [p, c] of Object.entries(counts)) {
            if (c > top) { top = c; eliminatedPid = p; }
        }

        const upd = {
            lastResult: { ...(room.lastResult || {}), eliminatedPid: eliminatedPid || null },
            phase: "day_resolve"
        };
        if (eliminatedPid) upd[`alive/${eliminatedPid}`] = false;

        await update(ref(db, `rooms/${code}`), upd);

        const winner = checkWinner({
            ...room,
            alive: { ...(room.alive || {}), ...(eliminatedPid ? { [eliminatedPid]: false } : {}) }
        });

        if (winner) {
            await update(ref(db, `rooms/${code}`), { phase: "game_over", winner });
            return;
        }

        await update(ref(db, `rooms/${code}`), {
            round: round + 1,
            phase: "night_sleep"
        });
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
