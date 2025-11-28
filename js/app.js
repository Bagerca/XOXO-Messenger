import { AuthService } from "./services/auth.js";
import { ChatService } from "./services/database.js";
import { AvatarRenderer } from "./core/avatar.js";
import { ChatUI } from "./ui/chat-ui.js";

// --- Глобальные переменные ---
let currentUser = null;
let currentProfile = null;
let chatUI = null;
let mainAvatarRenderer = null;
let previewAvatarRenderer = null;
let tempState = {}; 

// Список разблокированных приватных комнат (ID)
const unlockedRooms = new Set(['general']);

// Элементы навигации
const roomsListContainer = document.getElementById('rooms-list-container');
const btnHome = document.getElementById('btn-home');

// Элементы Модалки Создания
const modalCreate = document.getElementById('create-room-modal');
const btnOpenCreate = document.getElementById('btn-create-room-toggle');
const btnCancelCreate = document.getElementById('btn-cancel-create');
const btnConfirmCreate = document.getElementById('btn-confirm-create');
const inpRoomName = document.getElementById('new-room-name');
const radiosType = document.getElementsByName('roomType');
const divRoomPass = document.getElementById('room-pass-container');
const inpRoomPass = document.getElementById('new-room-pass');

// Элементы Модалки Пароля
const modalPass = document.getElementById('password-modal');
const inpJoinPass = document.getElementById('join-room-pass');
const btnCancelPass = document.getElementById('btn-cancel-pass');
const btnConfirmPass = document.getElementById('btn-confirm-pass');
let pendingRoomData = null; // Данные комнаты, которую пытаемся открыть

// Элементы Настроек
const modalSettings = document.getElementById('settings-modal');
const statusPopup = document.getElementById('status-popup');
const statusDot = document.getElementById('current-status-dot');
const prevNick = document.getElementById('prev-nick');
const prevBio = document.getElementById('prev-bio');
const prevBanner = document.getElementById('prev-banner');
const prevFrame = document.getElementById('prev-frame');
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

    // 1. Старт Чата
    chatUI = new ChatUI(user, currentProfile);
    chatUI.loadRoom("general", "Общий холл");

    // 2. Аватар в сайдбаре
    mainAvatarRenderer = new AvatarRenderer("my-avatar-3d", currentProfile.avatar, {
        effect: currentProfile.effect || 'liquid',
        intensity: 0.3
    });

    updateSidebarUI(currentProfile);

    // 3. Подписка на комнаты
    ChatService.subscribeToRooms((rooms) => {
        renderRoomsList(rooms);
    });

    // 4. Превью аватар для настроек
    previewAvatarRenderer = new AvatarRenderer("prev-avatar-3d", currentProfile.avatar, {
        effect: currentProfile.effect || 'liquid', intensity: 0.5
    });
});

function updateSidebarUI(profile) {
    document.getElementById("my-name").innerText = profile.nickname;
    document.getElementById("my-status-text").innerText = profile.bio;
    document.getElementById("my-banner-bg").style.backgroundImage = 
        profile.banner && profile.banner !== 'none' ? `url('${profile.banner}')` : 'none';
    document.getElementById("my-avatar-frame").className = `avatar-frame ${profile.frame || 'frame-none'}`;
    statusDot.className = `status-dot ${profile.status || 'online'}`;
    if(mainAvatarRenderer) mainAvatarRenderer.updateSettings({ effect: profile.effect || 'liquid' });
}


// ==========================================
// ЛОГИКА КОМНАТ И НАВИГАЦИИ
// ==========================================

function renderRoomsList(rooms) {
    roomsListContainer.innerHTML = '';
    
    rooms.forEach(room => {
        // "General" мы обрабатываем отдельно кнопкой "Домой"
        if(room.id === 'general') return;

        const btn = document.createElement('button');
        btn.className = 'room-btn';
        if(chatUI && chatUI.currentRoomId === room.id) btn.classList.add('active');
        
        // Иконка
        const icon = room.type === 'private' ? '🔒' : '#';
        btn.innerHTML = `<span class="room-icon">${icon}</span> ${room.name}`;
        
        btn.addEventListener('click', () => {
            tryEnterRoom(room);
        });
        roomsListContainer.appendChild(btn);
    });
}

// Попытка входа в комнату
function tryEnterRoom(room) {
    // 1. Вход в Общий холл
    if (room === 'general') {
        updateActiveButtons('general');
        chatUI.loadRoom('general', 'Общий холл');
        document.getElementById('room-lock-icon').style.display = 'none';
        return;
    }

    // 2. Вход в Приватную комнату (проверка)
    if (room.type === 'private' && !unlockedRooms.has(room.id)) {
        openPasswordModal(room);
        return;
    }

    // 3. Вход разрешен
    updateActiveButtons(room.id);
    chatUI.loadRoom(room.id, room.name);
    
    const lockIcon = document.getElementById('room-lock-icon');
    if(room.type === 'private') lockIcon.style.display = 'block';
    else lockIcon.style.display = 'none';
}

function updateActiveButtons(activeId) {
    // Сбрасываем active везде
    btnHome.classList.remove('active');
    document.querySelectorAll('.room-btn').forEach(b => b.classList.remove('active'));

    if(activeId === 'general') {
        btnHome.classList.add('active');
    } else {
        // Так как список перерисовывается, мы просто ищем нужный элемент в рендере, 
        // но здесь проще просто оставить highlight logic внутри renderRoomsList при следующем апдейте,
        // либо найти кнопку руками:
        // (Для простоты оставим визуальное обновление на совести renderRoomsList при следующем клике,
        // но добавим временный класс сейчас)
        const buttons = Array.from(document.querySelectorAll('.room-btn'));
        const target = buttons.find(b => b.innerText.includes(chatUI.currentRoomName)); // Грубый поиск
        // В идеале добавить data-id кнопкам
    }
}
// Добавляем Listener на Home
btnHome.addEventListener('click', () => tryEnterRoom('general'));


// ==========================================
// СОЗДАНИЕ КОМНАТЫ
// ==========================================
btnOpenCreate.addEventListener('click', () => {
    modalCreate.classList.add('open');
    inpRoomName.value = "";
    inpRoomPass.value = "";
    radiosType[0].checked = true; // Public check
    divRoomPass.style.display = 'none';
});

radiosType.forEach(radio => {
    radio.addEventListener('change', (e) => {
        divRoomPass.style.display = e.target.value === 'private' ? 'block' : 'none';
    });
});

btnCancelCreate.addEventListener('click', () => modalCreate.classList.remove('open'));

btnConfirmCreate.addEventListener('click', async () => {
    const name = inpRoomName.value.trim();
    const type = document.querySelector('input[name="roomType"]:checked').value;
    const pass = inpRoomPass.value.trim();

    if(!name) return;
    if(type === 'private' && !pass) {
        alert("Укажите пароль для приватной комнаты");
        return;
    }

    btnConfirmCreate.innerText = "...";
    try {
        await ChatService.createRoom(name, type, pass, currentUser.email);
        modalCreate.classList.remove('open');
    } catch(e) {
        console.error(e);
    } finally {
        btnConfirmCreate.innerText = "Создать";
    }
});


// ==========================================
// ПРОВЕРКА ПАРОЛЯ
// ==========================================
function openPasswordModal(room) {
    pendingRoomData = room;
    modalPass.classList.add('open');
    inpJoinPass.value = "";
    inpJoinPass.focus();
}
btnCancelPass.addEventListener('click', () => {
    modalPass.classList.remove('open');
    pendingRoomData = null;
});
btnConfirmPass.addEventListener('click', () => {
    const entered = inpJoinPass.value.trim();
    if (entered === pendingRoomData.password) {
        unlockedRooms.add(pendingRoomData.id); // Запоминаем что открыли
        modalPass.classList.remove('open');
        tryEnterRoom(pendingRoomData); // Повторный вход (теперь пустит)
    } else {
        alert("Неверный пароль!");
        inpJoinPass.value = "";
    }
});


// ==========================================
// НАСТРОЙКИ ПРОФИЛЯ (Старый код)
// ==========================================

function openSettings() {
    modalSettings.classList.add('open');
    statusPopup.classList.remove('active');
    switchView(false); 
    tempState = { ...currentProfile };
    document.getElementById('set-nick').value = currentProfile.nickname;
    document.getElementById('set-bio').value = currentProfile.bio;
    syncPreview(currentProfile);
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

function switchView(toVisuals) {
    if(toVisuals) {
        gsap.to(viewMain, {x: -50, opacity: 0, pointerEvents: 'none', duration: 0.3});
        gsap.fromTo(viewVisuals, {x: 50, opacity: 0}, {x: 0, opacity: 1, pointerEvents: 'all', duration: 0.3, delay: 0.1});
    } else {
        gsap.to(viewVisuals, {x: 50, opacity: 0, pointerEvents: 'none', duration: 0.3});
        gsap.fromTo(viewMain, {x: -50, opacity: 0}, {x: 0, opacity: 1, pointerEvents: 'all', duration: 0.3, delay: 0.1});
    }
}

document.getElementById('btn-settings-toggle').addEventListener('click', openSettings);
document.getElementById('my-avatar-wrap').addEventListener('click', (e) => {
    if(e.target !== statusDot) openSettings();
});
document.getElementById('btn-close-modal').addEventListener('click', () => modalSettings.classList.remove('open'));
document.getElementById('btn-edit-visuals').addEventListener('click', () => switchView(true));
document.getElementById('btn-back-visuals').addEventListener('click', () => switchView(false));
document.getElementById('set-nick').addEventListener('input', (e) => { tempState.nickname = e.target.value; prevNick.innerText = e.target.value; });
document.getElementById('set-bio').addEventListener('input', (e) => { tempState.bio = e.target.value; prevBio.innerText = e.target.value; });

const setupGrid = (id, key, callback) => {
    document.getElementById(id).addEventListener('click', (e) => {
        const item = e.target.closest('[data-val]');
        if(!item) return;
        document.querySelectorAll(`#${id} [data-val]`).forEach(el => el.classList.remove('selected', 'active'));
        item.classList.add(item.classList.contains('fx-btn') ? 'active' : 'selected');
        const val = item.dataset.val;
        tempState[key] = val;
        if(callback) callback(val);
    });
};
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

document.getElementById('btn-save-settings').addEventListener('click', async () => {
    const btn = document.getElementById('btn-save-settings');
    btn.innerText = "Сохраняем...";
    try {
        await ChatService.updateUserProfile(currentUser.uid, tempState);
        currentProfile = { ...currentProfile, ...tempState };
        updateSidebarUI(currentProfile);
        if(mainAvatarRenderer) mainAvatarRenderer.updateImage(currentProfile.avatar);
        btn.innerText = "Сохранено!";
        setTimeout(() => { btn.innerText = "Сохранить изменения"; modalSettings.classList.remove('open'); }, 800);
    } catch (e) { console.error(e); btn.innerText = "Ошибка"; }
});

document.getElementById('btn-logout-modal').addEventListener('click', async () => {
    await AuthService.logout();
    window.location.href = "index.html";
});

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
