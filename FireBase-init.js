import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyVT4sh4WEL5rGJrQda240MCmI7UPacJ7M8",
    authDomain: "xmasmafia-c2482.firebaseapp.com",
    databaseURL: "https://xmasmafia-c2482-default-rtdb.firebaseio.com/",
    projectId: "xmasmafia-c2482",
    storageBucket: "xmasmafia-c2482.firebasestorage.app",
    messagingSenderId: "404945631704",
    appId: "1:404945631704:web:c9f98d8c77e71ba30a9aad"
};

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);
