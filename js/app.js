import { AuthService } from "./services/auth.js";
import { ChatService } from "./services/database.js";
import { AvatarRenderer } from "./core/avatar.js";
import { ChatUI } from "./ui/chat-ui.js";

// Глобальные переменные
let currentUser = null;
let currentProfile = null;
let chatUI = null;
let mainAvatarRenderer = null;
let previewAvatarRenderer = null;
let tempState = {}; 

// Элементы
const roomsListContainer = document.getElementById('rooms-list-container');
const btnHome = document.getElementById('btn-home');
const btnSaved = document.getElementById('btn-saved');
const roomTitle = document.getElementById('room-title');
const roomDesc = document.getElementById('room-desc');
const btnEditRoom = document.getElementById('btn-edit-room');

// Модалка Создания
const modalCreate = document.getElementById('create-room-modal');
const btnOpenCreate = document.getElementById('btn-create-room-toggle');
const btnCancelCreate = document.getElementById('btn-cancel-create');
const btnConfirmCreate = document.getElementById('btn-confirm-create');
const radiosType = document.getElementsByName('roomType');

// Модалка Редактирования
const modalEdit = document.getElementById('edit-room-modal');
const btnCancelEdit = document.getElementById('btn-cancel-edit');
const btnConfirmEdit = document.getElementById('btn-confirm-edit');
let editingRoomId = null;

// Настройки профиля
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
    if (!user) { window.location.href = "index.html"; return; }
    currentUser = user;
    currentProfile = await ChatService.getProfile(user.uid, user.email);

    // 1. Чат
    chatUI = new ChatUI(user, currentProfile);
    enterRoom("general", "Общий холл", "Открытый чат");

    // 2. Аватар
    mainAvatarRenderer = new AvatarRenderer("my-avatar-3d", currentProfile.avatar, { effect: currentProfile.effect || 'liquid' });
    updateSidebarUI(currentProfile);

    // 3. Комнаты
    ChatService.subscribeToRooms((rooms) => {
        renderGroupedRooms(rooms);
    });

    // 4. Превью для настроек
    previewAvatarRenderer = new AvatarRenderer("prev-avatar-3d", currentProfile.avatar, { effect: 'liquid', intensity: 0.5 });
});

function updateSidebarUI(profile) {
    document.getElementById("my-name").innerText = profile.nickname;
    document.getElementById("my-banner-bg").style.backgroundImage = profile.banner !== 'none' ? `url('${profile.banner}')` : 'none';
    document.getElementById("my-avatar-frame").className = `avatar-frame ${profile.frame || 'frame-none'}`;
    statusDot.className = `status-dot ${profile.status || 'online'}`;
    if(mainAvatarRenderer) mainAvatarRenderer.updateSettings({ effect: profile.effect || 'liquid' });
}

// ==========================================
// ЛОГИКА КОМНАТ И КАТЕГОРИЙ
// ==========================================

function renderGroupedRooms(rooms) {
    roomsListContainer.innerHTML = '';
    
    // 1. Фильтруем и Группируем
    const categories = {};
    
    rooms.forEach(room => {
        // Приватность: Если комната private, показываем только участникам (или владельцу)
        const isMember = room.members && room.members.includes(currentUser.uid);
        const isOwner = room.ownerId === currentUser.uid;
        
        // Если комната приватная, и мы не владелец и не участник -> скрываем
        if (room.type === 'private' && !isMember && !isOwner) return;

        // "General" мы рендерим отдельно как кнопку, пропускаем здесь
        if (room.id === 'general') return;

        const cat = room.category || "Разное";
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(room);
    });

    // 2. Рендерим
    // Сортируем названия категорий
    Object.keys(categories).sort().forEach(catName => {
        // Блок категории
        const catBlock = document.createElement('div');
        catBlock.className = 'category-block';
        
        const catTitle = document.createElement('div');
        catTitle.className = 'cat-title';
        catTitle.innerText = catName;
        catBlock.appendChild(catTitle);

        // Комнаты в категории
        categories[catName].forEach(room => {
            const btn = document.createElement('button');
            btn.className = 'room-item';
            if (chatUI.currentRoomId === room.id) btn.classList.add('active');

            // Аватар комнаты
            let avatarHtml = `<div class="room-avatar">#</div>`;
            if (room.avatar && room.avatar.startsWith('http')) {
                avatarHtml = `<div class="room-avatar" style="background-image: url('${room.avatar}')"></div>`;
            }

            btn.innerHTML = `
                ${avatarHtml}
                <div class="room-info">
                    <span class="room-name">${room.name}</span>
                    <span class="room-meta">${room.type === 'private' ? '🔒 Приватный' : 'Публичный'}</span>
                </div>
            `;
            
            btn.addEventListener('click', () => {
                enterRoom(room.id, room.name, room.type === 'private' ? 'Закрытая группа' : 'Публичная группа', room.ownerId);
            });

            catBlock.appendChild(btn);
        });

        roomsListContainer.appendChild(catBlock);
    });
}

function enterRoom(id, name, desc = "", ownerId = null) {
    // UI Активность
    if(btnHome) btnHome.classList.remove('active');
    if(btnSaved) btnSaved.classList.remove('active');
    document.querySelectorAll('.room-item').forEach(b => b.classList.remove('active'));

    if (id === 'general') {
        if(btnHome) btnHome.classList.add('active');
        if(btnEditRoom) btnEditRoom.style.display = 'none';
    } else if (id === currentUser.uid) { // Избранное
        if(btnSaved) btnSaved.classList.add('active');
        if(btnEditRoom) btnEditRoom.style.display = 'none';
    } else {
        // Кнопка редактирования (только для владельца)
        if (ownerId === currentUser.uid) {
            if(btnEditRoom) {
                btnEditRoom.style.display = 'block';
                editingRoomId = id;
            }
        } else {
            if(btnEditRoom) btnEditRoom.style.display = 'none';
        }
    }

    // Загрузка
    chatUI.loadRoom(id, name);
    if(roomDesc) roomDesc.innerText = desc;
}

// КЛИКИ ПО ЗАКРЕПЛЕННЫМ
btnHome.addEventListener('click', () => enterRoom("general", "Общий холл", "Открытый чат"));
btnSaved.addEventListener('click', () => {
    // Сохраненные сообщения: используем ID пользователя как ID комнаты
    enterRoom(currentUser.uid, "Избранное", "Личные заметки");
});


// ==========================================
// СОЗДАНИЕ ГРУППЫ
// ==========================================
btnOpenCreate.addEventListener('click', () => {
    modalCreate.classList.add('open');
});
btnCancelCreate.addEventListener('click', () => modalCreate.classList.remove('open'));

// Хинт для приватности
Array.from(radiosType).forEach(r => {
    r.addEventListener('change', (e) => {
        const hint = document.getElementById('private-hint');
        if(hint) hint.style.display = e.target.value === 'private' ? 'block' : 'none';
    });
});

btnConfirmCreate.addEventListener('click', async () => {
    const name = document.getElementById('new-room-name').value.trim();
    const cat = document.getElementById('new-room-cat').value.trim();
    const avatar = document.getElementById('new-room-avatar').value.trim();
    const checkedRadio = document.querySelector('input[name="roomType"]:checked');
    const type = checkedRadio ? checkedRadio.value : 'public';

    if (!name) return alert("Введите название");

    btnConfirmCreate.innerText = "Создаем...";
    try {
        await ChatService.createRoom({
            name, category: cat, avatar, type
        }, currentUser.uid);
        modalCreate.classList.remove('open');
    } catch(e) { console.error(e); } 
    finally { btnConfirmCreate.innerText = "Создать"; }
});


// ==========================================
// РЕДАКТИРОВАНИЕ ГРУППЫ (Владелец)
// ==========================================
btnEditRoom.addEventListener('click', () => {
    modalEdit.classList.add('open');
});
btnCancelEdit.addEventListener('click', () => modalEdit.classList.remove('open'));

btnConfirmEdit.addEventListener('click', async () => {
    const newName = document.getElementById('edit-room-name').value.trim();
    const newAvatar = document.getElementById('edit-room-avatar').value.trim();

    if (!editingRoomId) return;

    const updateData = {};
    if (newName) updateData.name = newName;
    if (newAvatar) updateData.avatar = newAvatar;

    if (Object.keys(updateData).length > 0) {
        await ChatService.updateRoom(editingRoomId, updateData);
        // Обновляем заголовок сразу
        if(newName) document.getElementById('room-title').innerText = "# " + newName;
    }
    modalEdit.classList.remove('open');
});


// ==========================================
// НАСТРОЙКИ ПРОФИЛЯ
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
