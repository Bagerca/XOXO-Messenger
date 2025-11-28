import { AuthService } from "./services/auth.js";
import { ChatService } from "./services/database.js";
import { AvatarRenderer } from "./core/avatar.js";
import { ChatUI } from "./ui/chat-ui.js";

// --- Глобальные переменные ---
let currentUser = null;
let currentProfile = null;
let mainAvatarRenderer = null;
let previewAvatarRenderer = null;
let tempState = {}; // Состояние изменений

// --- Элементы UI ---
const modal = document.getElementById('settings-modal');
const statusPopup = document.getElementById('status-popup');
const statusDot = document.getElementById('current-status-dot');

// Элементы превью в модалке
const prevNick = document.getElementById('prev-nick');
const prevBio = document.getElementById('prev-bio');
const prevBanner = document.getElementById('prev-banner');
const prevFrame = document.getElementById('prev-frame');

// Views (Экраны настроек)
const viewMain = document.getElementById('view-main');
const viewVisuals = document.getElementById('view-visuals');

// --- ИНИЦИАЛИЗАЦИЯ ---
AuthService.monitor(async (user) => {
    if (!user) {
        window.location.href = "index.html";
        return;
    }
    currentUser = user;
    currentProfile = await ChatService.getProfile(user.uid, user.email);

    // 1. Инит Чата
    new ChatUI(user, currentProfile).loadRoom("Общий холл");

    // 2. Инит Аватара (Главный в сайдбаре)
    mainAvatarRenderer = new AvatarRenderer("my-avatar-3d", currentProfile.avatar, {
        effect: currentProfile.effect || 'liquid',
        intensity: 0.3
    });

    // 3. Заполнение UI сайдбара
    updateSidebarUI(currentProfile);

    // 4. Инит Аватара в Модалке (Сразу создаем, чтобы был готов)
    previewAvatarRenderer = new AvatarRenderer("prev-avatar-3d", currentProfile.avatar, {
        effect: currentProfile.effect || 'liquid',
        intensity: 0.5
    });
});

function updateSidebarUI(profile) {
    document.getElementById("my-name").innerText = profile.nickname;
    document.getElementById("my-status-text").innerText = profile.bio;
    document.getElementById("my-banner-bg").style.backgroundImage = 
        profile.banner && profile.banner !== 'none' ? `url('${profile.banner}')` : 'none';
    document.getElementById("my-avatar-frame").className = `avatar-frame ${profile.frame || 'frame-none'}`;
    statusDot.className = `status-dot ${profile.status || 'online'}`;
    
    // Обновляем эффект главного аватара если рендерер уже готов
    if(mainAvatarRenderer) {
        mainAvatarRenderer.updateSettings({ effect: profile.effect || 'liquid' });
    }
}

// --- УПРАВЛЕНИЕ МОДАЛКОЙ И НАСТРОЙКАМИ ---

function openSettings() {
    modal.classList.add('open');
    statusPopup.classList.remove('active');
    
    // Сброс на главный экран (текст)
    switchView(false); 

    // Копируем данные во временное состояние
    tempState = { ...currentProfile };

    // Заполняем инпуты
    document.getElementById('set-nick').value = currentProfile.nickname;
    document.getElementById('set-bio').value = currentProfile.bio;

    // Синхронизируем визуал превью
    syncPreview(currentProfile);
    
    // Выделяем активные кнопки в гридах
    highlightSelection('grid-avatars', currentProfile.avatar);
    highlightSelection('grid-banners', currentProfile.banner || 'none');
    highlightSelection('list-frames', currentProfile.frame || 'frame-none');
    highlightSelection('list-shaders', currentProfile.effect || 'liquid');
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

// --- АНИМАЦИЯ ПЕРЕКЛЮЧЕНИЯ ЭКРАНОВ (GSAP) ---
function switchView(toVisuals) {
    if(toVisuals) {
        // Убираем Main влево, Показываем Visuals
        gsap.to(viewMain, {x: -50, opacity: 0, pointerEvents: 'none', duration: 0.3});
        gsap.fromTo(viewVisuals, {x: 50, opacity: 0}, {x: 0, opacity: 1, pointerEvents: 'all', duration: 0.3, delay: 0.1});
    } else {
        // Наоборот
        gsap.to(viewVisuals, {x: 50, opacity: 0, pointerEvents: 'none', duration: 0.3});
        gsap.fromTo(viewMain, {x: -50, opacity: 0}, {x: 0, opacity: 1, pointerEvents: 'all', duration: 0.3, delay: 0.1});
    }
}

// --- СОБЫТИЯ ---

// 1. Открытие настроек
document.getElementById('btn-settings-toggle').addEventListener('click', openSettings);
document.getElementById('my-avatar-wrap').addEventListener('click', (e) => {
    // Если клик не по точке статуса, открываем настройки
    if(e.target !== statusDot) openSettings();
});

// 2. Закрытие настроек
document.getElementById('btn-close-modal').addEventListener('click', () => modal.classList.remove('open'));

// 3. Переключение видов (Волшебная кнопка и Назад)
document.getElementById('btn-edit-visuals').addEventListener('click', () => switchView(true));
document.getElementById('btn-back-visuals').addEventListener('click', () => switchView(false));

// 4. Живой ввод текста
document.getElementById('set-nick').addEventListener('input', (e) => {
    tempState.nickname = e.target.value;
    prevNick.innerText = e.target.value;
});
document.getElementById('set-bio').addEventListener('input', (e) => {
    tempState.bio = e.target.value;
    prevBio.innerText = e.target.value;
});

// 5. Обработка кликов по гридам (Аватары, Баннеры, Рамки, Шейдеры)
const setupGrid = (id, key, callback) => {
    document.getElementById(id).addEventListener('click', (e) => {
        const item = e.target.closest('[data-val]');
        if(!item) return;

        // UI обновление
        document.querySelectorAll(`#${id} [data-val]`).forEach(el => {
            el.classList.remove('selected', 'active');
        });
        item.classList.add(item.classList.contains('fx-btn') ? 'active' : 'selected');

        // Логика
        const val = item.dataset.val;
        tempState[key] = val;
        if(callback) callback(val);
    });
};

// Привязываем гриды
setupGrid('grid-avatars', 'avatar', (val) => previewAvatarRenderer.updateImage(val));
setupGrid('grid-banners', 'banner', (val) => prevBanner.style.backgroundImage = val !== 'none' ? `url('${val}')` : 'none');
setupGrid('list-frames', 'frame', (val) => prevFrame.className = `avatar-frame ${val}`);
setupGrid('list-shaders', 'effect', (val) => previewAvatarRenderer.updateSettings({ effect: val }));

function highlightSelection(containerId, value) {
    document.querySelectorAll(`#${containerId} [data-val]`).forEach(el => {
        if(el.dataset.val === value) el.classList.add(el.classList.contains('fx-btn') ? 'active' : 'selected');
        else el.classList.remove('selected', 'active');
    });
}

// --- СОХРАНЕНИЕ ---
document.getElementById('btn-save-settings').addEventListener('click', async () => {
    const btn = document.getElementById('btn-save-settings');
    btn.innerText = "Сохраняем...";
    
    try {
        await ChatService.updateUserProfile(currentUser.uid, tempState);
        currentProfile = { ...currentProfile, ...tempState };
        
        updateSidebarUI(currentProfile);
        if(mainAvatarRenderer) mainAvatarRenderer.updateImage(currentProfile.avatar);
        
        btn.innerText = "Сохранено!";
        setTimeout(() => {
            btn.innerText = "Сохранить изменения";
            modal.classList.remove('open');
        }, 800);
    } catch (e) {
        console.error(e);
        btn.innerText = "Ошибка сохранения";
    }
});

// --- ВЫХОД ---
document.getElementById('btn-logout-modal').addEventListener('click', async () => {
    await AuthService.logout();
    window.location.href = "index.html";
});

// --- СТАТУС (Оставляем старую логику попапа) ---
statusDot.addEventListener('click', (e) => { e.stopPropagation(); statusPopup.classList.toggle('active'); });
document.querySelectorAll('.status-option').forEach(opt => {
    opt.addEventListener('click', async () => {
        const newStatus = opt.dataset.status;
        statusDot.className = `status-dot ${newStatus}`;
        statusPopup.classList.remove('active');
        await ChatService.updateUserProfile(currentUser.uid, { status: newStatus });
    });
});
document.addEventListener('click', (e) => {
    if (!statusPopup.contains(e.target) && e.target !== statusDot) statusPopup.classList.remove('active');
});
