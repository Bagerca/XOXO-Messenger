import { auth, db } from '../firebase-config.js'; // Проверь путь!
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Импортируем модули
import { state } from './modules/state.js';
import { initSidebar, updateSidebarUI } from './modules/sidebar.js';
import { initSettings } from './modules/settings.js';
import { initChat, loadMessages } from './modules/chat.js';

// Запуск
console.log("Starting XOXO...");

onAuthStateChanged(auth, async (user) => {
    if (user) {
        state.currentUser = user;
        
        // Загрузка профиля
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);

        if (snap.exists()) {
            state.userProfile = { ...state.userProfile, ...snap.data() };
        } else {
            // Новый юзер
            const namePart = user.email.split('@')[0];
            state.userProfile.nickname = namePart;
            await setDoc(userRef, { ...state.userProfile, email: user.email });
        }

        // Инициализация модулей
        initSidebar();
        initSettings();
        initChat();
        
        // Первый рендер
        updateSidebarUI();
        loadMessages(state.currentRoom);

    } else {
        window.location.href = "index.html";
    }
});
