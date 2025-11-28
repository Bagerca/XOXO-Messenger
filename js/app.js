import { AuthService } from "./services/auth.js";
import { ChatService } from "./services/database.js";
import { ChatArea } from "./modules/ChatArea.js";
import { ChatList } from "./modules/ChatList.js";
import { ProfileManager } from "./modules/Profile.js";
import { RightSidebar } from "./modules/RightSidebar.js";

// State
let currentUser = null;
let currentProfile = null;
let chatArea = null;
let chatList = null;
let profileManager = null;
let rightSidebar = null;

// Modals for creation
const btnCreateMenu = document.getElementById('btn-create-menu');
const dropdown = document.getElementById('create-dropdown');
const modalCreateRoom = document.getElementById('create-room-modal');
const modalCreateCat = document.getElementById('create-cat-modal');
const modalPass = document.getElementById('password-modal');
const btnEditRoom = document.getElementById('btn-edit-room');
const modalEdit = document.getElementById('edit-room-modal');

// Init
AuthService.monitor(async (user) => {
    if (!user) { window.location.href = "index.html"; return; }
    currentUser = user;
    currentProfile = await ChatService.getProfile(user.uid, user.email);

    // 1. Инициализация модулей
    chatArea = new ChatArea(user, currentProfile);
    chatList = new ChatList(user, chatArea, document.getElementById('rooms-list-container'));
    profileManager = new ProfileManager(user, currentProfile);
    rightSidebar = new RightSidebar(user); 

    // 2. Начальный вход (Общий холл)
    // Передаем объект, имитирующий комнату
    enterRoom({ id: "general", name: "Общий холл", type: "public", members: [] });

    // 3. Обработка кликов из ChatList (через EventBus)
    document.addEventListener('room-selected', (e) => {
        enterRoom(e.detail);
    });
});

// Logic to enter room (Handles password & Auto-join)
let pendingRoom = null;

function enterRoom(room) {
    const { id, name, type, password, ownerId, members } = room;
    // Определяем описание
    let desc = "";
    if (id === 'general') desc = "Открытый чат";
    else if (id === currentUser.uid) desc = "Личные заметки";
    else desc = type === 'private' ? 'Закрытая группа' : 'Публичная группа';

    // Проверка пароля (только если это приватная группа и мы не владелец и не участник)
    if (type === 'private' && ownerId !== currentUser.uid) {
        const amIMember = members && members.includes(currentUser.uid);
        if (!amIMember) {
            pendingRoom = { ...room, desc };
            modalPass.classList.add('open');
            document.getElementById('join-room-pass').value = "";
            return;
        }
    }
    
    performEnter(id, name, desc, ownerId, members);
}

async function performEnter(id, name, desc, ownerId, members) {
    // UI Updates
    document.getElementById('btn-home').classList.toggle('active', id === 'general');
    document.getElementById('btn-saved').classList.toggle('active', id === currentUser.uid);
    document.querySelectorAll('.room-item').forEach(b => b.classList.remove('active'));
    
    const activeItem = document.querySelector(`[data-room-id="${id}"]`);
    if(activeItem) activeItem.classList.add('active');

    // Кнопка редактирования только для владельца
    if(btnEditRoom) btnEditRoom.style.display = (ownerId === currentUser.uid) ? 'block' : 'none';
    if(ownerId === currentUser.uid) window.editingRoomId = id;

    // Загружаем область чата
    chatArea.loadRoom(id, name, desc);

    // АВТО-ВСТУПЛЕНИЕ:
    // Если это не General, не Избранное и меня нет в списке -> добавляем
    if (id !== 'general' && id !== currentUser.uid) {
        if (members && !members.includes(currentUser.uid)) {
            await ChatService.joinRoom(id, currentUser.uid);
            // Визуально добавляем, чтобы сразу обновить UI
            members.push(currentUser.uid);
        }
    }

    // Обновляем правую панель
    if(rightSidebar) {
        // Если General -> передаем null в members, чтобы Sidebar понял, что грузить всех
        // Если Избранное -> передаем только себя
        let membersToLoad = members;
        if (id === 'general') membersToLoad = null; 
        if (id === currentUser.uid) membersToLoad = [currentUser.uid];

        rightSidebar.loadRoom({
            id, name, type: (id === 'general' ? 'public' : 'custom'), avatar: '', members: membersToLoad
        });
    }
}

// Global Listeners (Navigation)
document.getElementById('btn-home').addEventListener('click', () => enterRoom({ id: "general", name: "Общий холл", members: [] }));
document.getElementById('btn-saved').addEventListener('click', () => enterRoom({ id: currentUser.uid, name: "Избранное", members: [] }));

// Menu & Modals Logic
btnCreateMenu.addEventListener('click', (e) => { e.stopPropagation(); dropdown.classList.toggle('open'); });
document.addEventListener('click', () => dropdown.classList.remove('open'));

// Create Category
document.getElementById('opt-create-cat').addEventListener('click', () => document.getElementById('create-cat-modal').classList.add('open'));
document.getElementById('btn-cancel-cat').addEventListener('click', () => document.getElementById('create-cat-modal').classList.remove('open'));
document.getElementById('btn-confirm-cat').addEventListener('click', async () => {
    const name = document.getElementById('new-cat-name').value.trim();
    if(name) {
        await ChatService.createCategory(name);
        document.getElementById('create-cat-modal').classList.remove('open');
    }
});

// Create Room
document.getElementById('opt-create-room').addEventListener('click', () => modalCreateRoom.classList.add('open'));
document.getElementById('btn-cancel-create').addEventListener('click', () => modalCreateRoom.classList.remove('open'));
document.getElementById('btn-confirm-create').addEventListener('click', async () => {
    const name = document.getElementById('new-room-name').value.trim();
    const catId = document.getElementById('new-room-category-select').value;
    const avatar = document.getElementById('new-room-avatar').value.trim();
    const type = document.querySelector('input[name="roomType"]:checked').value;
    const pass = document.getElementById('new-room-pass').value.trim();

    if(!name) return alert("Имя обязательно");
    if(type === 'private' && !pass) return alert("Нужен пароль");

    await ChatService.createRoom({ name, categoryId: catId, avatar, type, password: pass }, currentUser.uid);
    modalCreateRoom.classList.remove('open');
});

// Password Modal
document.getElementById('btn-cancel-pass').addEventListener('click', () => modalPass.classList.remove('open'));
document.getElementById('btn-confirm-pass').addEventListener('click', () => {
    const val = document.getElementById('join-room-pass').value;
    if(val === pendingRoom.password) {
        modalPass.classList.remove('open');
        // Повторный вызов с теми же данными
        performEnter(pendingRoom.id, pendingRoom.name, pendingRoom.desc, pendingRoom.ownerId, pendingRoom.members);
    } else {
        alert("Неверный пароль");
    }
});

// Edit Room
if(btnEditRoom) btnEditRoom.addEventListener('click', () => modalEdit.classList.add('open'));
document.getElementById('btn-cancel-edit').addEventListener('click', () => modalEdit.classList.remove('open'));
document.getElementById('btn-confirm-edit').addEventListener('click', async () => {
    const name = document.getElementById('edit-room-name').value;
    const avatar = document.getElementById('edit-room-avatar').value;
    if(window.editingRoomId) {
        await ChatService.updateRoom(window.editingRoomId, { name, avatar });
        modalEdit.classList.remove('open');
    }
});

// Radio toggle
document.getElementsByName('roomType').forEach(r => {
    r.addEventListener('change', (e) => {
        document.getElementById('room-pass-container').style.display = e.target.value === 'private' ? 'block' : 'none';
    });
});
