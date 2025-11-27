import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    collection, addDoc, query, where, orderBy, onSnapshot, 
    doc, deleteDoc, updateDoc, getDoc, setDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { AvatarRenderer } from './js/avatar-renderer.js';

let currentUser = null;
let currentRoom = "general";
let unsubscribeMessages = null;
let contextMenuMsgId = null;

// Два рендера: один для сайдбара, другой для превью в настройках
let sidebarRenderer = null;
let previewRenderer = null;

const myLocalAvatars = [
    "avatars/Ari LoL.png",
    "avatars/Lead_Horizon_Katana.jpg",
    "avatars/igra_Alice_6439.jpg",
    "avatars/kiriki.jpg"
];

let userProfile = {
    avatar: myLocalAvatars[0], 
    nickname: "",
    bio: "В сети",
    effect: "liquid",
    status: "online" // online, busy, offline
};

// 1. ВХОД
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        const userDocRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userDocRef);

        if (userSnap.exists()) {
            userProfile = { ...userProfile, ...userSnap.data() };
        } else {
            const namePart = user.email.split('@')[0];
            userProfile.nickname = namePart.charAt(0).toUpperCase() + namePart.slice(1);
            await setDoc(userDocRef, { ...userProfile, email: user.email });
        }

        // Рендер сайдбара
        if (!sidebarRenderer && document.getElementById('webgl-avatar-container')) {
            sidebarRenderer = new AvatarRenderer(
                'webgl-avatar-container', 
                userProfile.avatar, 
                userProfile.effect
            );
        }

        updateSidebarUI();
        loadMessages(currentRoom);
        initAvatarGrid();
    } else {
        window.location.href = "index.html";
    }
});

function updateSidebarUI() {
    const nameEl = document.getElementById('user-display');
    const statusEl = document.getElementById('user-status');
    const dotEl = document.getElementById('sidebar-status-dot');

    if(sidebarRenderer) {
        sidebarRenderer.updateImage(userProfile.avatar);
        sidebarRenderer.setEffect(userProfile.effect);
    }
    
    nameEl.innerText = userProfile.nickname || "Без имени";
    statusEl.innerText = userProfile.bio;
    
    // Цвет точки
    dotEl.dataset.status = userProfile.status;
}

// 2. ОКНО НАСТРОЕК
const modal = document.getElementById('profile-modal');
const settingsBtn = document.getElementById('btn-settings');
const sidebarAvatar = document.getElementById('sidebar-avatar-wrap');

let tempProfile = { ...userProfile };

function openSettings() {
    modal.style.display = 'flex';
    tempProfile = { ...userProfile }; // Копия для редактирования

    // Заполняем поля
    document.getElementById('input-nickname').value = tempProfile.nickname;
    document.getElementById('input-bio').value = tempProfile.bio;
    document.getElementById('preview-nickname').innerText = tempProfile.nickname || "Никнейм";

    // Активируем кнопки
    updateStatusButtons(tempProfile.status);
    updateEffectButtons(tempProfile.effect);
    updateAvatarSelection(tempProfile.avatar);

    // Инициализируем или обновляем ПРЕВЬЮ рендер
    if (!previewRenderer && document.getElementById('preview-avatar-container')) {
        previewRenderer = new AvatarRenderer(
            'preview-avatar-container',
            tempProfile.avatar,
            tempProfile.effect
        );
    } else if (previewRenderer) {
        previewRenderer.updateImage(tempProfile.avatar);
        previewRenderer.setEffect(tempProfile.effect);
    }
    
    // Точка превью
    document.getElementById('preview-status-dot').style.background = getStatusColor(tempProfile.status);
}

function getStatusColor(status) {
    if(status === 'busy') return 'var(--status-busy)';
    if(status === 'offline') return 'var(--status-offline)';
    return 'var(--status-online)';
}

// --- ЛОГИКА ИНТЕРФЕЙСА НАСТРОЕК ---

// Статус
document.querySelectorAll('.status-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        tempProfile.status = btn.dataset.status;
        updateStatusButtons(tempProfile.status);
        document.getElementById('preview-status-dot').style.background = getStatusColor(tempProfile.status);
    });
});
function updateStatusButtons(active) {
    document.querySelectorAll('.status-btn').forEach(b => {
        b.classList.toggle('selected', b.dataset.status === active);
    });
}

// Шейдеры
document.querySelectorAll('.shader-card').forEach(card => {
    card.addEventListener('click', () => {
        tempProfile.effect = card.dataset.val;
        updateEffectButtons(tempProfile.effect);
        if(previewRenderer) previewRenderer.setEffect(tempProfile.effect);
    });
});
function updateEffectButtons(active) {
    document.querySelectorAll('.shader-card').forEach(c => {
        c.classList.toggle('selected', c.dataset.val === active);
    });
}

// Аватарки
function initAvatarGrid() {
    const grid = document.getElementById('avatar-grid');
    grid.innerHTML = "";
    myLocalAvatars.forEach(url => {
        const div = document.createElement('div');
        div.className = 'avatar-option';
        div.style.backgroundImage = `url('${url}')`; 
        div.addEventListener('click', () => {
            tempProfile.avatar = url;
            updateAvatarSelection(url);
            if(previewRenderer) previewRenderer.updateImage(url);
        });
        grid.appendChild(div);
    });
}
function updateAvatarSelection(activeUrl) {
    document.querySelectorAll('.avatar-option').forEach(opt => {
        // Сравнение URL (decodeURI для пробелов)
        const isMatch = opt.style.backgroundImage.includes(encodeURI(activeUrl)) || opt.style.backgroundImage.includes(activeUrl);
        opt.classList.toggle('selected', isMatch);
    });
}

// Кнопки открытия/закрытия
settingsBtn.addEventListener('click', openSettings);
sidebarAvatar.addEventListener('click', openSettings);
document.getElementById('btn-close-modal').addEventListener('click', () => { modal.style.display = 'none'; });

// СОХРАНЕНИЕ
document.getElementById('btn-save-profile').addEventListener('click', async () => {
    const newNick = document.getElementById('input-nickname').value.trim();
    if (!newNick) return alert("Имя обязательно!");

    tempProfile.nickname = newNick;
    tempProfile.bio = document.getElementById('input-bio').value.trim();

    // Применяем изменения
    userProfile = { ...tempProfile };
    updateSidebarUI();

    // Сохраняем в Firebase
    await updateDoc(doc(db, "users", currentUser.uid), userProfile);
    
    modal.style.display = 'none';
});

// ВЫХОД
document.getElementById('btn-logout-settings').addEventListener('click', () => {
    signOut(auth).then(() => window.location.href = "index.html");
});


// 3. ЧАТ
function loadMessages(room) {
    const chatWindow = document.getElementById('chat-window');
    if (unsubscribeMessages) unsubscribeMessages();
    const q = query(collection(db, "messages"), where("room", "==", room), orderBy("createdAt"));

    unsubscribeMessages = onSnapshot(q, (snapshot) => {
        chatWindow.innerHTML = "";
        snapshot.forEach((docSnap) => renderMessage(docSnap, chatWindow));
        chatWindow.scrollTop = chatWindow.scrollHeight;
    });
}

function renderMessage(docSnap, container) {
    const msg = docSnap.data();
    const isMe = msg.senderEmail === currentUser.email;

    const div = document.createElement('div');
    div.className = `message ${isMe ? 'my-message' : 'other-message'}`;
    if (isMe) div.addEventListener('contextmenu', (e) => openContextMenu(e, docSnap.id));

    const date = new Date(msg.createdAt);
    const time = `${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;
    
    // Получаем цвет статуса собеседника (из сохраненного в сообщении или дефолт)
    // В идеале статус нужно брать в реальном времени из users, но пока берем сохраненный для простоты
    let statusColor = 'var(--status-online)'; // fallback

    div.innerHTML = `
        <div class="msg-avatar" style="background-image: url('${msg.senderAvatar || myLocalAvatars[0]}')">
             <!-- Можно добавить точку статуса в аватар сообщения, если нужно -->
        </div>
        <div class="msg-content">
            <div class="msg-header">
                <span class="msg-sender">${escapeHtml(msg.sender)}</span>
                <span class="msg-time">${time}</span>
            </div>
            <div class="msg-text">${escapeHtml(msg.text)}</div>
        </div>
    `;
    container.appendChild(div);
}

// ОТПРАВКА
const input = document.getElementById('msg-input');
document.getElementById('send-btn').addEventListener('click', sendMessage);
input.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });

async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;

    try {
        await addDoc(collection(db, "messages"), {
            text: text,
            sender: userProfile.nickname,
            senderEmail: currentUser.email,
            senderAvatar: userProfile.avatar,
            senderEffect: userProfile.effect,
            senderStatus: userProfile.status, // Сохраняем статус в сообщении
            room: currentRoom,
            createdAt: Date.now()
        });
        input.value = "";
    } catch (e) {
        console.error("Error:", e);
    }
}

function escapeHtml(text) {
    if(!text) return text;
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
const contextMenu = document.getElementById('context-menu');
function openContextMenu(e, id) {
    e.preventDefault(); contextMenuMsgId = id;
    contextMenu.style.top = `${e.clientY}px`; contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.display = 'block';
}
document.addEventListener('click', () => { contextMenu.style.display = 'none'; });
document.getElementById('btn-delete').addEventListener('click', async () => {
    if (contextMenuMsgId && confirm("Удалить?")) await deleteDoc(doc(db, "messages", contextMenuMsgId));
});
document.getElementById('btn-edit').addEventListener('click', async () => {
    if (contextMenuMsgId) {
        const newText = prompt("Новый текст:");
        if (newText) await updateDoc(doc(db, "messages", contextMenuMsgId), { text: newText });
    }
});
document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const newRoom = btn.dataset.room;
        if (newRoom !== currentRoom) {
            currentRoom = newRoom;
            document.getElementById('current-room-name').innerText = btn.querySelector('span').innerText;
            loadMessages(currentRoom);
        }
    });
});
