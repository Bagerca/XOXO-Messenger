import { AuthService } from "./services/auth.js";
import { ChatService } from "./services/database.js";
import { AvatarRenderer } from "./core/avatar.js";
import { ChatUI } from "./ui/chat-ui.js";

// Элементы UI
const modal = document.getElementById('settings-modal');
const btnSettings = document.getElementById('btn-settings-toggle');
const btnClose = document.getElementById('btn-close-settings');
const btnSave = document.getElementById('btn-save-settings');
const btnLogoutModal = document.getElementById('modal-logout-btn');
const avatarWrap = document.getElementById('my-avatar-wrap');

// Инпуты в модалке
const inputNick = document.getElementById('set-nickname');
const inputBio = document.getElementById('set-bio');
const inputIntensity = document.getElementById('set-effect-intensity');
const avatarOptions = document.querySelectorAll('.avatar-option');

let currentUser = null;
let currentProfile = null;
let avatarRenderer = null;
let tempSettings = {}; // Для хранения временных изменений до сохранения

// --- ЗАПУСК ---
AuthService.monitor(async (user) => {
    if (!user) {
        window.location.href = "index.html";
        return;
    }
    currentUser = user;
    currentProfile = await ChatService.getProfile(user.uid, user.email);

    // 1. Инит чата
    const chatUI = new ChatUI(user, currentProfile);
    chatUI.loadRoom("Общий холл");

    // 2. Инит Аватара
    avatarRenderer = new AvatarRenderer("my-avatar-3d", currentProfile.avatar, {
        intensity: currentProfile.intensity || 0.3
    });

    // 3. Заполнение данных
    updateSidebarUI();
});

// --- ФУНКЦИИ UI ---
function updateSidebarUI() {
    document.getElementById("my-name").innerText = currentProfile.nickname;
    document.getElementById("my-status-text").innerText = currentProfile.bio || "В сети";
    // Обновляем статус (цвет)
    const statusDot = document.getElementById('current-status-dot');
    statusDot.className = `status-dot ${currentProfile.status || 'online'}`;
}

// --- ЛОГИКА НАСТРОЕК ---

// Открытие настроек (можно открыть конкретную вкладку)
function openSettings(tabName = 'account') {
    // Заполняем поля текущими данными
    inputNick.value = currentProfile.nickname;
    inputBio.value = currentProfile.bio || "";
    inputIntensity.value = currentProfile.intensity || 0.3;
    
    // Сброс временных настроек
    tempSettings = { ...currentProfile };
    
    // Выбор текущего аватара в сетке
    avatarOptions.forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.src === currentProfile.avatar);
    });

    // Переключение вкладки
    switchTab(tabName);
    modal.classList.add('open');
}

function closeSettings() {
    modal.classList.remove('open');
    // Откат визуальных изменений (аватара), если не сохранили
    if (avatarRenderer) {
        avatarRenderer.updateImage(currentProfile.avatar);
        avatarRenderer.updateSettings({ intensity: currentProfile.intensity || 0.3 });
    }
}

// Переключение вкладок
function switchTab(tabName) {
    document.querySelectorAll('.set-tab-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === tabName);
    });
    document.querySelectorAll('.settings-section').forEach(sec => {
        sec.classList.remove('active');
        if (sec.id === `tab-${tabName}`) sec.classList.add('active');
    });
}

// ОБРАБОТЧИКИ СОБЫТИЙ

// 1. Клик по шестеренке -> Открыть настройки (Аккаунт)
btnSettings.addEventListener('click', () => openSettings('account'));

// 2. Клик по аватару -> Открыть настройки (Внешний вид)
avatarWrap.addEventListener('click', (e) => {
    // Игнорируем клик, если нажали на точку статуса
    if(e.target.id !== 'current-status-dot') {
        openSettings('appearance');
    }
});

// 3. Закрытие
btnClose.addEventListener('click', closeSettings);

// 4. Переключение вкладок внутри
document.querySelectorAll('.set-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// 5. ДЕМОНСТРАЦИЯ (Preview)
// Выбор аватара в сетке
avatarOptions.forEach(opt => {
    opt.addEventListener('click', () => {
        // Визуальное выделение
        avatarOptions.forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        
        // Живое обновление в сайдбаре (только визуально пока)
        const newSrc = opt.dataset.src;
        tempSettings.avatar = newSrc;
        avatarRenderer.updateImage(newSrc);
    });
});

// Ползунок эффекта
inputIntensity.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    tempSettings.intensity = val;
    avatarRenderer.updateSettings({ intensity: val });
});

// 6. СОХРАНЕНИЕ
btnSave.addEventListener('click', async () => {
    btnSave.innerText = "Сохраняем...";
    
    // Собираем новые данные
    const newData = {
        nickname: inputNick.value,
        bio: inputBio.value,
        avatar: tempSettings.avatar,
        intensity: tempSettings.intensity,
        // privacy: ... (можно добавить позже)
    };

    try {
        await ChatService.updateUserProfile(currentUser.uid, newData);
        
        // Обновляем локальный профиль
        currentProfile = { ...currentProfile, ...newData };
        updateSidebarUI();
        
        btnSave.innerText = "Сохранено!";
        setTimeout(() => {
            btnSave.innerText = "Сохранить";
            modal.classList.remove('open');
        }, 800);
        
    } catch (e) {
        console.error(e);
        btnSave.innerText = "Ошибка";
    }
});

// 7. ВЫХОД ИЗ АККАУНТА
btnLogoutModal.addEventListener('click', async () => {
    await AuthService.logout();
    window.location.href = "index.html";
});
