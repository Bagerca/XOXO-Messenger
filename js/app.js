import { AuthService } from "./services/auth.js";
import { ChatService } from "./services/database.js";
import { ChatArea } from "./modules/ChatArea.js";
import { ChatList } from "./modules/ChatList.js";
import { ProfileManager } from "./modules/Profile.js";

// State
let currentUser = null;
let currentProfile = null;
let chatArea = null;
let chatList = null;
let profileManager = null;

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

    // 2. Начальный вход
    enterRoom("general", "Общий холл", "Открытый чат");

    // 3. Обработка кликов из ChatList (через EventBus)
    document.addEventListener('room-selected', (e) => {
        const room = e.detail;
        enterRoom(room.id, room.name, room.type === 'private' ? 'Закрытая группа' : 'Публичная группа', room.ownerId, room.type, room.password);
    });
});

// Logic to enter room (Handles password)
let pendingRoom = null;

function enterRoom(id, name, desc = "", ownerId = null, type = 'public', password = "") {
    // Check password
    if (type === 'private' && ownerId !== currentUser.uid) {
        pendingRoom = { id, name, desc, ownerId, password };
        modalPass.classList.add('open');
        document.getElementById('join-room-pass').value = "";
        return;
    }
    performEnter(id, name, desc, ownerId);
}

function performEnter(id, name, desc, ownerId) {
    // UI Updates
    document.getElementById('btn-home').classList.toggle('active', id === 'general');
    document.getElementById('btn-saved').classList.toggle('active', id === currentUser.uid);
    document.querySelectorAll('.room-item').forEach(b => b.classList.remove('active'));
    
    // Highlight sidebar item (rough logic as list rerenders)
    const activeItem = document.querySelector(`[data-room-id="${id}"]`);
    if(activeItem) activeItem.classList.add('active');

    // Show Edit button
    if(btnEditRoom) btnEditRoom.style.display = (ownerId === currentUser.uid) ? 'block' : 'none';
    if(ownerId === currentUser.uid) window.editingRoomId = id; // Global var for edit modal

    chatArea.loadRoom(id, name, desc);
}

// Global Listeners (Navigation)
document.getElementById('btn-home').addEventListener('click', () => enterRoom("general", "Общий холл", "Открытый чат"));
document.getElementById('btn-saved').addEventListener('click', () => enterRoom(currentUser.uid, "Избранное", "Личные заметки"));

// Menu & Modals Logic (Keep it here or move to a separate UIHelper)
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
        performEnter(pendingRoom.id, pendingRoom.name, pendingRoom.desc, pendingRoom.ownerId);
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
