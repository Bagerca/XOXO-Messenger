import { AuthService } from "./services/auth.js";
import { ChatService } from "./services/database.js";
import { AvatarRenderer } from "./core/avatar.js";
import { ChatUI } from "./ui/chat-ui.js";

// --- Глобальные переменные ---
let currentUser = null;
let currentProfile = null;
let mainAvatarRenderer = null;
let previewAvatarRenderer = null;

// Элементы
const modal = document.getElementById('settings-modal');
const statusPopup = document.getElementById('status-popup');
const statusDot = document.getElementById('current-status-dot');

// Превью элементы
const prevNick = document.getElementById('prev-nick');
const prevBio = document.getElementById('prev-bio');
const prevBanner = document.getElementById('prev-banner');
const prevFrame = document.getElementById('prev-frame');

// --- ИНИЦИАЛИЗАЦИЯ ---
AuthService.monitor(async (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    currentUser = user;
    currentProfile = await ChatService.getProfile(user.uid, user.email);

    // 1. Инит Чата
    new ChatUI(user, currentProfile).loadRoom("Общий холл");

    // 2. Инит Аватара (Главный)
    mainAvatarRenderer = new AvatarRenderer("my-avatar-3d", currentProfile.avatar, {
        effect: currentProfile.effect || 'liquid',
        intensity: 0.3
    });

    // 3. Заполнение UI сайдбара
    updateSidebarUI(currentProfile);

    // 4. Инит Аватара (Превью) - создаем его сразу, чтобы он был готов
    previewAvatarRenderer = new AvatarRenderer("prev-avatar-3d", currentProfile.avatar, {
        effect: currentProfile.effect || 'liquid',
        intensity: 0.5
    });
});

function updateSidebarUI(profile) {
    document.getElementById("my-name").innerText = profile.nickname;
    document.getElementById("my-status-text").innerText = profile.bio;
    document.getElementById("my-banner-bg").style.backgroundImage = profile.banner && profile.banner !== 'none' ? `url('${profile.banner}')` : 'none';
    document.getElementById("my-avatar-frame").className = `avatar-frame ${profile.frame || 'frame-none'}`;
    statusDot.className = `status-dot ${profile.status || 'online'}`;
    
    // Обновляем рендерер если данные изменились
    if(mainAvatarRenderer) {
        mainAvatarRenderer.updateSettings({ effect: profile.effect || 'liquid' });
    }
}

// --- УПРАВЛЕНИЕ СТАТУСОМ ---
statusDot.addEventListener('click', (e) => {
    e.stopPropagation();
    statusPopup.classList.toggle('active');
});

document.querySelectorAll('.status-option').forEach(opt => {
    opt.addEventListener('click', async () => {
        const newStatus = opt.dataset.status;
        statusDot.className = `status-dot ${newStatus}`;
        statusPopup.classList.remove('active');
        
        // Сохраняем статус в БД
        await ChatService.updateUserProfile(currentUser.uid, { status: newStatus });
    });
});

// Закрытие попапов при клике вне
document.addEventListener('click', (e) => {
    if (!statusPopup.contains(e.target) && e.target !== statusDot) {
        statusPopup.classList.remove('active');
    }
});


// --- ЛОГИКА НАСТРОЕК (PREVIEW) ---
const tempState = { ...currentProfile };

function openSettings(tab) {
    modal.classList.add('open');
    statusPopup.classList.remove('active');
    switchTab(tab);
    
    // Загрузка текущих данных в инпуты
    document.getElementById('set-nick').value = currentProfile.nickname;
    document.getElementById('set-bio').value = currentProfile.bio;
    
    // Синхронизация превью
    syncPreview(currentProfile);
}

function syncPreview(data) {
    prevNick.innerText = data.nickname;
    prevBio.innerText = data.bio;
    prevBanner.style.backgroundImage = data.banner && data.banner !== 'none' ? `url('${data.banner}')` : 'none';
    prevFrame.className = `avatar-frame ${data.frame || 'frame-none'}`;
    
    if (previewAvatarRenderer) {
        if(data.avatar) previewAvatarRenderer.updateImage(data.avatar);
        if(data.effect) previewAvatarRenderer.updateSettings({ effect: data.effect });
    }
}

// Слушатели инпутов (Live Typing)
document.getElementById('set-nick').addEventListener('input', (e) => {
    tempState.nickname = e.target.value;
    prevNick.innerText = e.target.value;
});
document.getElementById('set-bio').addEventListener('input', (e) => {
    tempState.bio = e.target.value;
    prevBio.innerText = e.target.value;
});

// Слушатели Гридов (Аватары, Баннеры)
document.querySelectorAll('#grid-avatars .grid-item').forEach(item => {
    item.addEventListener('click', () => {
        const url = item.dataset.val;
        tempState.avatar = url;
        previewAvatarRenderer.updateImage(url);
        // Выделение
        document.querySelectorAll('#grid-avatars .grid-item').forEach(i => i.classList.remove('selected'));
        item.classList.add('selected');
    });
});

document.querySelectorAll('#grid-banners .grid-item').forEach(item => {
    item.addEventListener('click', () => {
        const url = item.dataset.val;
        tempState.banner = url;
        prevBanner.style.backgroundImage = url !== 'none' ? `url('${url}')` : 'none';
    });
});

// Слушатели Кнопок (Шейдеры, Рамки)
const bindButtons = (containerId, key, callback) => {
    document.querySelectorAll(`#${containerId} button`).forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll(`#${containerId} button`).forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const val = btn.dataset.val;
            tempState[key] = val;
            if (callback) callback(val);
        });
    });
};

bindButtons('select-shader', 'effect', (val) => previewAvatarRenderer.updateSettings({ effect: val }));
bindButtons('select-frame', 'frame', (val) => prevFrame.className = `avatar-frame ${val}`);


// --- ОТКРЫТИЕ ---
// 1. Шестеренка -> Профиль
document.getElementById('btn-settings-toggle').addEventListener('click', () => openSettings('profile'));
// 2. Аватар -> Внешность
document.getElementById('my-avatar-wrap').addEventListener('click', (e) => {
    if(e.target !== statusDot) openSettings('appearance');
});
// 3. Закрытие
document.getElementById('btn-close-modal').addEventListener('click', () => modal.classList.remove('open'));

// 4. Переключение табов
document.querySelectorAll('.nav-btn').forEach(btn => {
    if(btn.id === 'modal-logout-btn') return;
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

function switchTab(tab) {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.settings-section').forEach(s => s.classList.toggle('active', s.id === `tab-${tab}`));
}

// --- СОХРАНЕНИЕ ---
document.getElementById('btn-save').addEventListener('click', async () => {
    const btn = document.getElementById('btn-save');
    btn.innerText = "Сохранение...";
    
    // Обновляем глобальный объект
    currentProfile = { ...currentProfile, ...tempState };
    
    // Шлем в БД
    await ChatService.updateUserProfile(currentUser.uid, currentProfile);
    
    // Обновляем настоящий UI
    updateSidebarUI(currentProfile);
    if(mainAvatarRenderer) {
        mainAvatarRenderer.updateImage(currentProfile.avatar);
    }
    
    btn.innerText = "Сохранено!";
    setTimeout(() => {
        btn.innerText = "Сохранить изменения";
        modal.classList.remove('open');
    }, 1000);
});

// Выход
document.getElementById('modal-logout-btn').addEventListener('click', () => {
    AuthService.logout().then(() => window.location.href = "index.html");
});
