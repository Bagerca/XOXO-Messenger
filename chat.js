import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { collection, addDoc, query, orderBy, onSnapshot } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let currentUser = null;

// 1. Проверка входа
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUser = user;
        const name = user.email.split('@')[0];
        document.getElementById('user-display').innerText = name.toUpperCase();
        loadMessages();
    } else {
        window.location.href = "index.html";
    }
});

// 2. Выход
document.getElementById('btn-logout').addEventListener('click', () => {
    signOut(auth).then(() => window.location.href = "index.html");
});

// 3. Отправка
const input = document.getElementById('msg-input');
const sendBtn = document.getElementById('send-btn');

async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;

    const name = currentUser.email.split('@')[0];
    const formattedName = name.charAt(0).toUpperCase() + name.slice(1);

    try {
        await addDoc(collection(db, "messages"), {
            text: text,
            sender: formattedName,
            senderEmail: currentUser.email,
            createdAt: Date.now()
        });
        input.value = "";
        input.focus();
    } catch (e) {
        console.error("Ошибка:", e);
    }
}

sendBtn.addEventListener('click', sendMessage);
input.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

// 4. Загрузка
function loadMessages() {
    const chatWindow = document.getElementById('chat-window');
    const q = query(collection(db, "messages"), orderBy("createdAt"));

    onSnapshot(q, (snapshot) => {
        chatWindow.innerHTML = "";
        snapshot.forEach((doc) => {
            const msg = doc.data();
            const div = document.createElement('div');
            const isMe = msg.senderEmail === currentUser.email;

            div.className = `message ${isMe ? 'my-message' : 'other-message'}`;
            
            const date = new Date(msg.createdAt);
            const time = `${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;

            let html = "";
            if (!isMe) html += `<span class="sender-name">${msg.sender}</span>`;
            html += `${msg.text} <span class="msg-time">${time}</span>`;

            div.innerHTML = html;
            chatWindow.appendChild(div);
        });
        chatWindow.scrollTop = chatWindow.scrollHeight;
    });
}
