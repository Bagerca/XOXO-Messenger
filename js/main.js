// Импорт Firebase
import { auth, db } from '../firebase-config.js'; 
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// Импорт наших модулей
import { state } from './modules/state.js';
import { initSidebar, updateSidebarUI } from './modules/sidebar.js';
import { initSettings } from './modules/settings.js';
import { initChat, loadMessages } from './modules/chat.js';

console.log("🚀 Starting XOXO Messenger...");

// Слушаем состояние входа
onAuthStateChanged(auth, async (user) => {
    if (user) {
        // 1. Сохраняем текущего юзера
        state.currentUser = user;
        console.log("Logged in as:", user.email);
        
        // 2. Загружаем профиль из базы данных
        const userRef = doc(db, "users", user.uid);
        const snap = await getDoc(userRef);

        if (snap.exists()) {
            // Если профиль есть - берем данные и объединяем с дефолтными
            state.userProfile = { ...state.userProfile, ...snap.data() };
        } else {
            // Если профиля нет (первый вход) - создаем
            const namePart = user.email.split('@')[0];
            state.userProfile.nickname = namePart.charAt(0).toUpperCase() + namePart.slice(1);
            
            await setDoc(userRef, { 
                ...state.userProfile, 
                email: user.email 
            });
        }

        // 3. Инициализируем интерфейс (по порядку)
        initSidebar();        // Запускает левое меню и WebGL аватар
        initChat();           // Запускает кнопки отправки и логику сообщений
        initSettings();       // Запускает модальное окно настроек
        
        // 4. Первичная отрисовка
        updateSidebarUI();
        loadMessages(state.currentRoom);

    } else {
        // Если не вошли - выкидываем на логин
        console.log("No user, redirecting...");
        window.location.href = "index.html";
    }
});
