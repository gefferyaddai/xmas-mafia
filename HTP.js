
const state = {
    step: 0
};

const steps = [
    {
        title: "What is the game?",
        html: `
      <p><b>Xmas Mafia</b> is a social deduction game. One player is the <b>Killer Elf</b>,
      and everyone else tries to figure out who it is before the town gets eliminated.</p>
      <ul>
        <li>Night: special roles act secretly</li>
        <li>Day: discussion + vote someone out</li>
        <li>Goal: eliminate the Killer Elf before they outnumber the town</li>
      </ul>
    `
    },
    {
        title: "Roles",
        html: `
      <ul>
        <li><b>Killer Elf</b>: chooses 1 person to “sabotage” each night.</li>
        <li><b>Santa (Doctor)</b>: chooses 1 person to protect each night.</li>
        <li><b>Head Elf (Detective)</b>: investigates 1 person per night.</li>
        <li><b>Town/Carolers</b>: no powers — talk, deduce, vote.</li>
      </ul>
      <p><i>Tip:</i> Roles scale with players (I can help you generate role ratios later).</p>
    `
    },
    {
        title: "How to play",
        html: `
      <ol>
        <li><b>Create/Join</b> a room.</li>
        <li>Everyone receives a secret role.</li>
        <li><b>Night:</b> Killer acts → Santa saves → Detective investigates.</li>
        <li><b>Morning:</b> Moderator announces what happened.</li>
        <li><b>Vote:</b> discuss and vote to eliminate a suspect.</li>
        <li>Repeat until the town wins or the elves win.</li>
      </ol>
    `
    }
];

// ----- "Render" like React -----
function renderHowToPlay() {
    const card = document.getElementById("howtoCard");
    const prevBtn = document.getElementById("prevBtn");
    const nextBtn = document.getElementById("nextBtn");
    const dots = document.getElementById("dots");

    const s = steps[state.step];

    card.innerHTML = `<h2>${s.title}</h2>${s.html}`;

    // Buttons
    prevBtn.disabled = state.step === 0;
    nextBtn.textContent = state.step === steps.length - 1 ? "Done" : "Next";

    // Dots
    dots.innerHTML = steps
        .map((_, i) => `<div class="dot ${i === state.step ? "active" : ""}"></div>`)
        .join("");
}

// ----- Events (setState) -----
function setStep(newStep) {
    state.step = Math.max(0, Math.min(steps.length - 1, newStep));
    renderHowToPlay();
}

document.addEventListener("DOMContentLoaded", () => {
    const howToSection = document.getElementById("howToPlay");

    // Hook your existing "How To Play" button:
    // change this selector to match your button id/class
    const howToBtn = document.getElementById("how-to-play");
    const closeBtn = document.getElementById("closeHowTo");

    document.getElementById("prevBtn").addEventListener("click", () => setStep(state.step - 1));
    document.getElementById("nextBtn").addEventListener("click", () => {
        if (state.step === steps.length - 1) {
            howToSection.classList.add("hidden");
            setStep(0);
            return;
        }
        setStep(state.step + 1);
    });

    howToBtn?.addEventListener("click", () => {
        howToSection.classList.remove("hidden");
        setStep(0);
    });

    closeBtn.addEventListener("click", () => {
        howToSection.classList.add("hidden");
        setStep(0);
    });

    renderHowToPlay();
});
