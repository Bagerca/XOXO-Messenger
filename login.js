// Импортируем auth из нашего конфига
import { auth } from "./firebase-config.js";
import { signInWithEmailAndPassword } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

const loginBtn = document.getElementById('btn-login');
const errorMsg = document.getElementById('error-msg');

loginBtn.addEventListener('click', () => {
    const login = document.getElementById('login').value.trim();
    const password = document.getElementById('password').value;

    if (!login || !password) return;

    // Добавляем хвост
    const email = login + "@xoxo.com";

    signInWithEmailAndPassword(auth, email, password)
        .then(() => {
            window.location.href = "chat.html";
        })
        .catch((error) => {
            errorMsg.style.display = 'block';
            errorMsg.innerText = "Ошибка: " + error.code;
        });
});
