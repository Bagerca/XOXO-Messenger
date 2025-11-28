import { AuthService } from "./services/auth.js";
import { ChatService } from "./services/database.js";
import { AvatarRenderer } from "./core/avatar.js";
import { ChatUI } from "./ui/chat-ui.js";

// --- ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ ---
let currentUser = null;
let currentProfile = null;
let chatUI = null;
let mainAvatarRenderer = null;
let previewAvatarRenderer = null;
let tempState = {}; 

// Локальный кэш данных
let localRooms = [];
let localCategories = [];

// Drag & Drop State
let draggedRoomId = null;

// Элементы UI
const roomsListContainer = document.getElementById('rooms-list-container');
const btnHome = document.getElementById('btn-home');
const btnSaved = document.getElementById('btn-saved');
const roomTitle = document.getElementById('room-title');
const roomDesc = document.getElementById('room-desc');
const btnEditRoom = document.getElementById('btn-edit-room');

// Меню "Создать"
const btnCreateMenu = document.getElementById('btn-create-menu');
const dropdown = document.getElementById('create-dropdown');
const optCreateCat = document.getElementById('opt-create-cat');
const optCreateRoom = document.getElementById('opt-create-room');

// Модалки
const modalCreateRoom = document.getElementById('create-room-modal');
const modalCreateCat = document.getElementById('create-cat-modal');
const modalEdit = document.getElementById('edit-room-modal');
const modalSettings = document.getElementById('settings-modal');
const modalPass = document.getElementById('password-modal');

// Настройки профиля
const statusPopup = document.getElementById('status-popup');
const statusDot = document.getElementById('current-status-dot');
const prevNick = document.getElementById('prev-nick');
const prevBio = document.getElementById('prev-bio');
const prevBanner = document.getElementById('prev-banner');
const prevFrame = document.getElementById('prev-frame');
const viewMain = document.getElementById('view-main');
const viewVisuals = document.getElementById('view-visuals');

// Элементы входа в приватный чат
let pendingRoomData = null; // Данные комнаты, которую пытаемся открыть
const inpJoinPass = document.getElementById('join-room-pass');

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
    enterRoom("general", "Общий холл", "Открытый чат");

    // 2. Инит Аватара
    mainAvatarRenderer = new AvatarRenderer("my-avatar-3d", currentProfile.avatar, {
        effect: currentProfile.effect || 'liquid',
        intensity: 0.3
    });
    updateSidebarUI(currentProfile);
    
    // 3. Превью для настроек
    previewAvatarRenderer = new AvatarRenderer("prev-avatar-3d", currentProfile.avatar, {
        effect: 'liquid', intensity: 0.5
    });

    // 4. Подписка на Категории
    ChatService.subscribeToCategories((cats) => {
        localCategories = cats;
        renderCategoriesAndRooms();
        updateCategorySelect();
    });

    // 5. Подписка на Комнаты
    ChatService.subscribeToRooms((rooms) => {
        localRooms = rooms;
        renderCategoriesAndRooms();
    });
});

function updateSidebarUI(profile) {
    document.getElementById("my-name").innerText = profile.nickname;
    document.getElementById("my-banner-bg").style.backgroundImage = profile.banner !== 'none' ? `url('${profile.banner}')` : 'none';
    document.getElementById("my-avatar-frame").className = `avatar-frame ${profile.frame || 'frame-none'}`;
    document.getElementById("current-status-dot").className = `status-dot ${profile.status || 'online'}`;
    if(mainAvatarRenderer) mainAvatarRenderer.updateSettings({ effect: profile.effect || 'liquid' });
}

// ==========================================
// ЛОГИКА РЕНДЕРИНГА И ПЕРЕТАСКИВАНИЯ (DnD)
// ==========================================

function renderCategoriesAndRooms() {
    roomsListContainer.innerHTML = '';
    
    // 1. Сортируем комнаты по ID категории
    const roomsByCat = { 'uncategorized': [] };
    localCategories.forEach(c => roomsByCat[c.id] = []);

    localRooms.forEach(room => {
        // Пропускаем General (он закреплен)
        if (room.id === 'general') return;

        // Фильтр Приватности:
        // Если приватная, то показываем только владельцу или участнику
        const isMember = room.members && room.members.includes(currentUser.uid);
        const isOwner = room.ownerId === currentUser.uid;
        if (room.type === 'private' && !isMember && !isOwner) return;

        // Кладем в нужную категорию
        const catId = room.categoryId && roomsByCat[room.categoryId] ? room.categoryId : 'uncategorized';
        roomsByCat[catId].push(room);
    });

    // 2. Рендерим Категории
    localCategories.forEach(cat => {
        renderCategoryBlock(cat.id, cat.name, roomsByCat[cat.id]);
        delete roomsByCat[cat.id]; // Убираем из списка, чтобы не дублировать
    });

    // 3. Рендерим "Без категории" (только если там что-то есть)
    if(roomsByCat['uncategorized'].length > 0) {
        renderCategoryBlock('uncategorized', 'Разное', roomsByCat['uncategorized']);
    }
}

function renderCategoryBlock(catId, catName, rooms) {
    // Контейнер
    const catContainer = document.createElement('div');
    catContainer.className = 'category-container';
    catContainer.dataset.catId = catId; // ID категории для Drop зоны

    // Заголовок (Сворачивание)
    const header = document.createElement('div');
    header.className = 'category-header';
    header.innerHTML = `<span class="cat-arrow">▼</span> ${catName}`;
    header.addEventListener('click', () => catContainer.classList.toggle('collapsed'));
    
    // Список комнат
    const roomsContainer = document.createElement('div');
    roomsContainer.className = 'category-rooms';

    rooms.forEach(room => {
        const btn = document.createElement('div'); // div вместо button для корректного DnD
        btn.className = 'room-item';
        btn.draggable = true; // РАЗРЕШАЕМ ПЕРЕТАСКИВАНИЕ
        btn.dataset.roomId = room.id;
        
        if (chatUI.currentRoomId === room.id) btn.classList.add('active');

        // Аватарка комнаты
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
        
        // Клик - Вход в комнату
        btn.addEventListener('click', (e) => {
            enterRoom(room.id, room.name, room.type === 'private' ? 'Закрытая группа' : 'Публичная группа', room.ownerId, room.type, room.password);
        });

        // --- Drag Start ---
        btn.addEventListener('dragstart', (e) => {
            draggedRoomId = room.id;
            e.dataTransfer.effectAllowed = "move";
            e.target.style.opacity = '0.5';
        });

        // --- Drag End ---
        btn.addEventListener('dragend', (e) => {
            e.target.style.opacity = '1';
            draggedRoomId = null;
        });

        roomsContainer.appendChild(btn);
    });

    catContainer.appendChild(header);
    catContainer.appendChild(roomsContainer);

    // --- Drop Zone (Категория) ---
    catContainer.addEventListener('dragover', (e) => {
        e.preventDefault(); // Обязательно для Drop
        catContainer.classList.add('drag-over');
    });

    catContainer.addEventListener('dragleave', () => {
        catContainer.classList.remove('drag-over');
    });

    catContainer.addEventListener('drop', async (e) => {
        e.preventDefault();
        catContainer.classList.remove('drag-over');
        
        if (!draggedRoomId) return;

        const targetCatId = catId; // ID категории, куда бросили

        // Проверяем, изменилась ли категория
        const room = localRooms.find(r => r.id === draggedRoomId);
        if (room && room.categoryId !== targetCatId) {
            // Обновляем в Firebase
            await ChatService.updateRoom(draggedRoomId, { categoryId: targetCatId });
        }
    });

    roomsListContainer.appendChild(catContainer);
}

// Логика Входа
function enterRoom(id, name, desc = "", ownerId = null, type = 'public', password = "") {
    
    // Если приватная и мы не владелец -> просим пароль
    if (type === 'private' && ownerId !== currentUser.uid) {
        // Здесь можно добавить проверку массива members, но пока упростим до пароля
        // Если уже вводили пароль в этой сессии, можно пускать. Но пока просим всегда.
        openPasswordModal({ id, name, desc, ownerId, type, password });
        return;
    }
    
    performEnterRoom(id, name, desc, ownerId);
}

function performEnterRoom(id, name, desc, ownerId) {
    // UI: Сброс активности
    btnHome.classList.remove('active');
    btnSaved.classList.remove('active');
    document.querySelectorAll('.room-item').forEach(b => b.classList.remove('active'));

    // UI: Установка активности
    if (id === 'general') {
        btnHome.classList.add('active');
        if(btnEditRoom) btnEditRoom.style.display = 'none';
    } else if (id === currentUser.uid) { // Избранное
        btnSaved.classList.add('active');
        if(btnEditRoom) btnEditRoom.style.display = 'none';
    } else {
        // Ищем элемент в списке и подсвечиваем
        // (Так как список перерисовывается, ищем по data-roomId)
        // Но при перерисовке renderCategoriesAndRooms сам поставит active класс на основе chatUI.currentRoomId
        
        // Кнопка редактирования (только владелец)
        if (ownerId === currentUser.uid) {
            if(btnEditRoom) {
                btnEditRoom.style.display = 'block';
                editingRoomId = id;
            }
        } else {
            if(btnEditRoom) btnEditRoom.style.display = 'none';
        }
    }

    chatUI.loadRoom(id, name);
    if(roomDesc) roomDesc.innerText = desc;
}

// КЛИКИ ПО ЗАКРЕПЛЕННЫМ
btnHome.addEventListener('click', () => enterRoom("general", "Общий холл", "Открытый чат"));
btnSaved.addEventListener('click', () => {
    // Избранное: используем UID пользователя как ID комнаты
    performEnterRoom(currentUser.uid, "Избранное", "Личные заметки");
});


// ==========================================
// УПРАВЛЕНИЕ МЕНЮ И СОЗДАНИЕМ
// ==========================================

// Открыть/Закрыть меню "+"
btnCreateMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('open');
});
document.addEventListener('click', () => dropdown.classList.remove('open'));

// 1. Создать Категорию
optCreateCat.addEventListener('click', () => {
    document.getElementById('create-cat-modal').classList.add('open');
});
document.getElementById('btn-cancel-cat').addEventListener('click', () => document.getElementById('create-cat-modal').classList.remove('open'));

document.getElementById('btn-confirm-cat').addEventListener('click', async () => {
    const name = document.getElementById('new-cat-name').value.trim();
    if(name) {
        await ChatService.createCategory(name);
        document.getElementById('create-cat-modal').classList.remove('open');
        document.getElementById('new-cat-name').value = "";
    }
});

// 2. Создать Группу
optCreateRoom.addEventListener('click', () => {
    modalCreateRoom.classList.add('open');
});
document.getElementById('btn-cancel-create').addEventListener('click', () => modalCreateRoom.classList.remove('open'));

// Обновление списка категорий в селекте
function updateCategorySelect() {
    const sel = document.getElementById('new-room-category-select');
    if(!sel) return;
    sel.innerHTML = '<option value="uncategorized">Без категории</option>';
    localCategories.forEach(cat => {
        const opt = document.createElement('option');
        opt.value = cat.id;
        opt.innerText = cat.name;
        sel.appendChild(opt);
    });
}

document.getElementById('btn-confirm-create').addEventListener('click', async () => {
    const name = document.getElementById('new-room-name').value.trim();
    const catId = document.getElementById('new-room-category-select').value;
    const avatar = document.getElementById('new-room-avatar').value.trim();
    const type = document.querySelector('input[name="roomType"]:checked').value;
    const pass = document.getElementById('new-room-pass').value.trim();

    if (!name) return alert("Введите название группы");
    if (type === 'private' && !pass) return alert("Придумайте пароль");

    try {
        await ChatService.createRoom({
            name, categoryId: catId, avatar, type, password: pass
        }, currentUser.uid);
        modalCreateRoom.classList.remove('open');
        // Очистка полей
        document.getElementById('new-room-name').value = "";
        document.getElementById('new-room-avatar').value = "";
        document.getElementById('new-room-pass').value = "";
    } catch(e) { console.error(e); } 
});

// Показ поля пароля
const radios = document.getElementsByName('roomType');
Array.from(radios).forEach(r => {
    r.addEventListener('change', (e) => {
        const passContainer = document.getElementById('room-pass-container');
        if(passContainer) passContainer.style.display = e.target.value === 'private' ? 'block' : 'none';
    });
});


// ==========================================
// ПРОВЕРКА ПАРОЛЯ
// ==========================================
function openPasswordModal(roomData) {
    pendingRoomData = roomData;
    modalPass.classList.add('open');
    inpJoinPass.value = "";
    setTimeout(() => inpJoinPass.focus(), 100);
}

document.getElementById('btn-cancel-pass').addEventListener('click', () => {
    modalPass.classList.remove('open');
    pendingRoomData = null;
});

document.getElementById('btn-confirm-pass').addEventListener('click', () => {
    const entered = inpJoinPass.value.trim();
    if (entered === pendingRoomData.password) {
        modalPass.classList.remove('open');
        performEnterRoom(pendingRoomData.id, pendingRoomData.name, "Закрытая группа", pendingRoomData.ownerId);
    } else {
        alert("Неверный пароль!");
        inpJoinPass.value = "";
    }
});


// ==========================================
// РЕДАКТИРОВАНИЕ КОМНАТЫ
// ==========================================
if(btnEditRoom) {
    btnEditRoom.addEventListener('click', () => {
        modalEdit.classList.add('open');
    });
}
document.getElementById('btn-cancel-edit').addEventListener('click', () => modalEdit.classList.remove('open'));
document.getElementById('btn-confirm-edit').addEventListener('click', async () => {
    const newName = document.getElementById('edit-room-name').value.trim();
    const newAvatar = document.getElementById('edit-room-avatar').value.trim();

    if (editingRoomId) {
        const updateData = {};
        if (newName) updateData.name = newName;
        if (newAvatar) updateData.avatar = newAvatar;
        
        if (Object.keys(updateData).length > 0) {
            await ChatService.updateRoom(editingRoomId, updateData);
            if(newName) roomTitle.innerText = "# " + newName;
        }
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
