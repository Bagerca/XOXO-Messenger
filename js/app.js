import { AuthService } from "./services/auth.js";
import { ChatService } from "./services/database.js";
import { AvatarRenderer } from "./core/avatar.js";
import { ChatUI } from "./ui/chat-ui.js";

console.log("🚀 XOXO V2 Initializing...");

// Глобальные переменные для UI
const settingsBtn = document.getElementById('btn-settings-toggle');
const settingsMenu = document.getElementById('settings-popup');
const logoutBtn = document.getElementById('btn-logout');

const statusDot = document.getElementById('current-status-dot');
const statusMenu = document.getElementById('status-popup');
const statusText = document.getElementById('my-status-text');

// --- ГЛАВНАЯ ЛОГИКА ---
AuthService.monitor(async (user) => {
    if (!user) {
        console.log("🔒 No user, redirecting to Login...");
        window.location.href = "index.html";
        return;
    }

    console.log("✅ Logged in as:", user.email);

    // 1. Загрузка профиля
    const profile = await ChatService.getProfile(user.uid, user.email);

    // 2. Инициализация UI чата
    const chatUI = new ChatUI(user, profile);
    chatUI.loadRoom("Общий холл"); // Загружаем дефолтную комнату

    // 3. Инициализация 3D Аватара
    new AvatarRenderer("my-avatar-3d", profile.avatar);

    // 4. Обновление данных в сайдбаре
    document.getElementById("my-name").innerText = profile.nickname;
    updateStatusUI(profile.status);

    // 5. Обработка кликов по комнатам
    document.querySelectorAll('.rooms-nav button').forEach(btn => {
        btn.addEventListener('click', () => {
            // Визуальное переключение
            document.querySelectorAll('.rooms-nav button').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            // Логика переключения
            const roomName = btn.innerText.replace('# ', ''); // Убираем решетку
            chatUI.loadRoom(roomName);
        });
    });
});

// --- ЛОГИКА НИЖНЕЙ ПАНЕЛИ (События) ---

// Функция обновления UI статуса
function updateStatusUI(status) {
    statusDot.className = `status-dot ${status}`;
    const labels = { online: "Online", busy: "Не беспокоить", offline: "Invisible" };
    statusText.innerText = labels[status] || "Online";
}

// Открытие/Закрытие меню настроек
settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    settingsMenu.classList.toggle('active');
    statusMenu.classList.remove('active');
});

// Открытие/Закрытие меню статуса
statusDot.addEventListener('click', (e) => {
    e.stopPropagation();
    statusMenu.classList.toggle('active');
    settingsMenu.classList.remove('active');
});

// Смена статуса (Клик по пункту меню)
document.querySelectorAll('.status-option').forEach(option => {
    option.addEventListener('click', () => {
        const newStatus = option.dataset.status;
        updateStatusUI(newStatus);
        statusMenu.classList.remove('active');
        // В будущем здесь можно добавить сохранение статуса в Firebase
    });
});

// Логика выхода
logoutBtn.addEventListener('click', async () => {
    try {
        await AuthService.logout();
        window.location.href = "index.html";
    } catch (e) {
        console.error("Logout failed:", e);
    }
});

// Закрытие меню при клике в пустоту
document.addEventListener('click', (e) => {
    if (settingsMenu && !settingsMenu.contains(e.target) && e.target !== settingsBtn) {
        settingsMenu.classList.remove('active');
    }
    if (statusMenu && !statusMenu.contains(e.target) && e.target !== statusDot) {
        statusMenu.classList.remove('active');
    }
});

// Клик по аватарке (Заглушка для смены фото)
document.getElementById('my-avatar-wrap').addEventListener('click', (e) => {
    if(e.target !== statusDot) {
        // Здесь можно открыть модальное окно загрузки фото
        console.log("Change avatar clicked");
    }
});
