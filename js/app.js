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

// Элементы UI
const modalSettings = document.getElementById('settings-modal');
const modalCreateRoom = document.getElementById('create-room-modal');
const statusPopup = document.getElementById('status-popup');
const statusDot = document.getElementById('current-status-dot');

// Элементы комнат
const roomsListContainer = document.getElementById('rooms-list-container');
const btnCreateRoom = document.getElementById('btn-create-room-toggle');
const inputRoomName = document.getElementById('new-room-name');
const btnConfirmCreate = document.getElementById('btn-confirm-create');
const btnCancelCreate = document.getElementById('btn-cancel-create');

// Элементы превью в модалке настроек
const prevNick = document.getElementById('prev-nick');
const prevBio = document.getElementById('prev-bio');
const prevBanner = document.getElementById('prev-banner');
const prevFrame = document.getElementById('prev-frame');

// Views настроек
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
    chatUI = new ChatUI(user, currentProfile);
    chatUI.loadRoom("general", "Общий холл");

    // 2. Инит Аватара (Главный в сайдбаре)
    mainAvatarRenderer = new AvatarRenderer("my-avatar-3d", currentProfile.avatar, {
        effect: currentProfile.effect || 'liquid',
        intensity: 0.3
    });

    // 3. Заполнение UI сайдбара
    updateSidebarUI(currentProfile);

    // 4. Инит Аватара в Модалке Настроек
    previewAvatarRenderer = new AvatarRenderer("prev-avatar-3d", currentProfile.avatar, {
        effect: currentProfile.effect || 'liquid',
        intensity: 0.5
    });

    // 5. Подписка на список комнат
    ChatService.subscribeToRooms((rooms) => {
        renderRoomsList(rooms);
    });
});

function updateSidebarUI(profile) {
    document.getElementById("my-name").innerText = profile.nickname;
    document.getElementById("my-status-text").innerText = profile.bio;
    document.getElementById("my-banner-bg").style.backgroundImage = 
        profile.banner && profile.banner !== 'none' ? `url('${profile.banner}')` : 'none';
    document.getElementById("my-avatar-frame").className = `avatar-frame ${profile.frame || 'frame-none'}`;
    statusDot.className = `status-dot ${profile.status || 'online'}`;
    
    if(mainAvatarRenderer) {
        mainAvatarRenderer.updateSettings({ effect: profile.effect || 'liquid' });
    }
}

// ==========================================
// ЛОГИКА КОМНАТ (НОВОЕ)
// ==========================================

function renderRoomsList(rooms) {
    // Сохраняем кнопку "Общий холл" и очищаем остальное
    const generalBtn = roomsListContainer.querySelector('[data-id="general"]');
    roomsListContainer.innerHTML = '';
    roomsListContainer.appendChild(generalBtn);

    rooms.forEach(room => {
        const btn = document.createElement('button');
        btn.className = 'room-btn';
        btn.innerText = `# ${room.name}`;
        btn.dataset.id = room.id;
        
        if(chatUI && chatUI.currentRoomId === room.id) btn.classList.add('active');

        btn.addEventListener('click', () => {
            switchRoom(room.id, room.name);
        });

        roomsListContainer.appendChild(btn);
    });
}

function switchRoom(roomId, roomName) {
    document.querySelectorAll('.room-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = document.querySelector(`.room-btn[data-id="${roomId}"]`);
    if(activeBtn) activeBtn.classList.add('active');

    chatUI.loadRoom(roomId, roomName);
}

// Клик по "Общему холлу"
document.querySelector('[data-id="general"]').addEventListener('click', () => {
    switchRoom("general", "Общий холл");
});

// Открытие модалки создания
btnCreateRoom.addEventListener('click', () => {
    modalCreateRoom.classList.add('open');
    inputRoomName.value = "";
    inputRoomName.focus();
});
const closeCreateModal = () => modalCreateRoom.classList.remove('open');
btnCancelCreate.addEventListener('click', closeCreateModal);

// Создание комнаты
btnConfirmCreate.addEventListener('click', async () => {
    const name = inputRoomName.value.trim();
    if(!name) return;

    btnConfirmCreate.innerText = "...";
    try {
        await ChatService.createRoom(name, currentUser.email);
        closeCreateModal();
    } catch(e) {
        console.error(e);
        alert("Ошибка создания комнаты");
    } finally {
        btnConfirmCreate.innerText = "Создать";
    }
});


// ==========================================
// ЛОГИКА НАСТРОЕК ПРОФИЛЯ
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

document.getElementById('set-nick').addEventListener('input', (e) => {
    tempState.nickname = e.target.value;
    prevNick.innerText = e.target.value;
});
document.getElementById('set-bio').addEventListener('input', (e) => {
    tempState.bio = e.target.value;
    prevBio.innerText = e.target.value;
});

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
        setTimeout(() => {
            btn.innerText = "Сохранить изменения";
            modalSettings.classList.remove('open');
        }, 800);
    } catch (e) {
        console.error(e);
        btn.innerText = "Ошибка сохранения";
    }
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
