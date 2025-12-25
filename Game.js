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

// ---------- NARRATOR ----------
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

// ---------- READY / CONTINUE (ALIVE ONLY) ----------
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

    // auto-advance when all alive are ready
    if (alive > 0 && ready === alive) {
        advancePhaseOnce(room, nextPhase);
    }
}

// ---------- GAME HELPERS ----------
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

// ---------- RENDER ----------
function render(room) {
    hideAll();

    const role = myRole(room);
    const phase = room.phase || "roleReveal";
    const amAlive = room.alive?.[pid] ?? true;
    const round = room.round || 1;

    // role reveal uses old "all players ready"
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

        // roleReveal needs host to kick off once
        if (isHost(room) && total > 0 && rdy === total) {
            update(ref(db, `rooms/${code}`), { phase: "intro" });
        }
        return;
    }

    // spectators
    if (!amAlive) {
        phaseTitle.textContent = "👻 You are out";
        story.innerHTML = `<p>You can watch the story unfold.</p>`;

        if (phase === "night_resolve") {
            story.innerHTML = formatNightStory(room);
            speak(htmlToText(story.innerHTML), `morning_${room.lastResult?.resolvedRound || round}`);
        }
        if (phase === "day_story") {
            story.innerHTML = `<p>The workshop gathers to discuss what happened.</p>`;
            speak(htmlToText(story.innerHTML), `day_story_${round}`);
        }
        if (phase === "day_discuss") {
            story.innerHTML = `<p>Talk it out. Who’s acting suspicious?</p>`;
            speak(htmlToText(story.innerHTML), `day_discuss_${round}`);
        }
        if (phase === "day_vote") {
            story.innerHTML = `<p>Voting is happening…</p>`;
        }
        if (phase === "day_resolve") {
            story.innerHTML = formatDayStory(room);
            speak(htmlToText(story.innerHTML), `day_resolve_${round}`);
        }
        return;
    }

    // intro (READY UP -> night_sleep)
    if (phase === "intro") {
        phaseTitle.textContent = "🎄 North Pole Nights";
        story.innerHTML = `<p>The workshop is buzzing… but something feels off.</p>
                       <p>Someone has been sabotaging toys after midnight.</p>
                       <p>Stay sharp. Trust no one.</p>`;
        speak(htmlToText(story.innerHTML), `intro`);
        showContinueReadyUI(room, "night_sleep");
        return;
    }

    // night sleep (READY UP -> night_killer)
    if (phase === "night_sleep") {
        phaseTitle.textContent = "🌙 Night Falls";
        story.innerHTML = `<p>Everyone close your eyes…</p><p>The North Pole goes silent.</p>`;
        speak(htmlToText(story.innerHTML), `night_sleep_${round}`);
        showContinueReadyUI(room, "night_killer");
        return;
    }

    // action phases
    if (phase === "night_killer") {
        phaseTitle.textContent = "🧝 Killer Elf Turn";
        if (role !== "Murderer") { story.innerHTML = `<p>Shhh… stay asleep.</p>`; return; }

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
        if (role !== "Santa") { story.innerHTML = `<p>Shhh… stay asleep.</p>`; return; }

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
        if (role !== "HeadElf") { story.innerHTML = `<p>Shhh… stay asleep.</p>`; return; }

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

    // night resolve (READY UP -> day_story)  ✅ (optional skip)
    if (phase === "night_resolve") {
        phaseTitle.textContent = "☀️ Morning Report";
        story.innerHTML = formatNightStory(room);
        speak(htmlToText(story.innerHTML), `morning_${room.lastResult?.resolvedRound || round}`);
        showContinueReadyUI(room, "day_story");
        return;
    }

    // day story (timer-based OR ready-up) ✅
    if (phase === "day_story") {
        phaseTitle.textContent = "☀️ Day Break";
        story.innerHTML = `<p>The workshop gathers to discuss what happened.</p>`;
        speak(htmlToText(story.innerHTML), `day_story_${round}`);

        // show the timer if present (cinematic)
        const endsAt = room.timers?.dayStoryEndsAt || 0;
        if (endsAt) {
            timerPanel.style.display = "block";
            const s = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
            timerText.textContent = `Continuing in ${s}s…`;
        }

        // allow early skip if everyone is ready
        showContinueReadyUI(room, "day_discuss");
        return;
    }

    // discussion (READY UP -> vote) + shows timer (2 min max) ✅
    if (phase === "day_discuss") {
        phaseTitle.textContent = "⏳ Discuss";
        story.innerHTML = `<p>Talk it out. Who’s acting suspicious?</p>`;
        speak(htmlToText(story.innerHTML), `day_discuss_${round}`);

        const endsAt = room.timers?.discussEndsAt || 0;
        if (endsAt) {
            timerPanel.style.display = "block";
            const s = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
            timerText.textContent = `Time remaining: ${s}s`;
        }

        showContinueReadyUI(room, "day_vote", "Start Vote");
        return;
    }

    // vote phase
    if (phase === "day_vote") {
        phaseTitle.textContent = "🗳️ Vote";
        story.innerHTML = `<p>Vote to eliminate one player.</p>`;
        speak(htmlToText(story.innerHTML), `day_vote_${round}`);

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

        const votes = room.votes?.[String(round)] || {};
        const alive = room.alive || {};
        const alivePids = Object.keys(alive).filter(p => alive[p]);
        const votedAliveCount = alivePids.filter(p => !!votes[p]).length;
        readyText.textContent = `Votes: ${votedAliveCount} / ${alivePids.length}`;

        return;
    }

    // day resolve (READY UP -> night_sleep)
    if (phase === "day_resolve") {
        phaseTitle.textContent = "🎁 Results";
        story.innerHTML = formatDayStory(room);
        speak(htmlToText(story.innerHTML), `day_resolve_${round}`);
        showContinueReadyUI(room, "night_sleep");
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

// ---------- SERVER LOGIC (minimal host dependency) ----------
async function hostTick(room) {
    const round = room.round || 1;
    const r = String(round);
    const actions = room.actions?.[r] || {};

    // killer -> santa
    if (room.phase === "night_killer" && actions.killer?.target) {
        await advancePhaseOnce(room, "night_santa");
        return;
    }

    // santa -> detective/resolve
    if (room.phase === "night_santa" && actions.santa?.target) {
        if (round >= 2) await advancePhaseOnce(room, "night_detective");
        else await advancePhaseOnce(room, "night_resolve");
        return;
    }

    // detective -> resolve
    if (room.phase === "night_detective" && actions.detective?.target) {
        await advancePhaseOnce(room, "night_resolve");
        return;
    }

    // resolve night -> day_story (set dayStory timer)
    if (room.phase === "night_resolve") {
        if (room.lastResult?.resolvedRound === round) return;

        const killerTarget = actions.killer?.target || null;
        const santaSave = actions.santa?.target || null;
        const killedPid = (killerTarget && killerTarget !== santaSave) ? killerTarget : null;

        const dayStoryEndsAt = Date.now() + 12000;

        const updates = {
            lastResult: {
                resolvedRound: round,
                killedPid: killedPid || null,
                savedPid: santaSave || null
            },
            phase: "day_story",
            phaseReady: null, // reset ready tracking per phase group
            timers: { ...(room.timers || {}), dayStoryEndsAt }
        };

        if (killedPid) updates[`alive/${killedPid}`] = false;

        await update(ref(db, `rooms/${code}`), updates);
        return;
    }

    // day_story -> day_discuss (timer fallback)
    if (room.phase === "day_story") {
        const endsAt = room.timers?.dayStoryEndsAt || 0;
        if (endsAt && Date.now() >= endsAt) {
            const discussEndsAt = Date.now() + 120000;
            await update(ref(db, `rooms/${code}`), {
                phase: "day_discuss",
                phaseReady: null,
                timers: { ...(room.timers || {}), discussEndsAt }
            });
        }
        return;
    }

    // day_discuss -> day_vote (timer fallback)
    if (room.phase === "day_discuss") {
        const endsAt = room.timers?.discussEndsAt || 0;
        if (endsAt && Date.now() >= endsAt) {
            await advancePhaseOnce(room, "day_vote", { phaseReady: null });
        }
        return;
    }

    // day_vote -> day_resolve when all alive voted
    if (room.phase === "day_vote") {
        const alive = room.alive || {};
        const alivePids = Object.keys(alive).filter(p => alive[p]);
        const votes = room.votes?.[r] || {};
        const votedAliveCount = alivePids.filter(p => !!votes[p]).length;

        if (votedAliveCount < alivePids.length) return; // wait for all alive votes

        if (room.lastResult?.votedRound === round) return;

        // ✅ remove host-only dependency for resolving votes
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
            lastResult: { ...(room.lastResult || {}), eliminatedPid: eliminatedPid || null, votedRound: round },
            phase: "day_resolve",
            phaseReady: null
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

        // next round
        await update(ref(db, `rooms/${code}`), { round: round + 1 });
        return;
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
