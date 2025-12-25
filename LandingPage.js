document.addEventListener("DOMContentLoaded", () => {
    document.querySelector(".button.primary").onclick = () => {
        window.location.href = "CreateGame.html";
    };

    document.querySelectorAll(".button")[1].onclick = () => {
        window.location.href = "JoinGame.html"; // or prompt-based join if you want
    };
});
