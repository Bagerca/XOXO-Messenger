import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyDhg4-QY-bWcmi55Y9BKAVV9c9T5cWCZOY",
    authDomain: "xoxo-messenger.firebaseapp.com",
    projectId: "xoxo-messenger",
    storageBucket: "xoxo-messenger.firebasestorage.app",
    messagingSenderId: "931225503438",
    appId: "1:931225503438:web:a7ec6c5e79cab24578f29f"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
