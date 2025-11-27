import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    collection, addDoc, query, where, orderBy, onSnapshot, 
    doc, deleteDoc, updateDoc, getDoc, setDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
// Подключаем наш 3D рендер
import { AvatarRenderer } from './js/avatar-renderer.js';

// ПЕРЕМЕННЫЕ
let currentUser = null;
let currentRoom = "general";
let unsubscribeMessages = null;
let contextMenuMsgId = null;
let avatarRenderer = null;

// --- СПИСОК ТВОИХ АВАТАРОК ---
// Важно: Пути должны быть точными. Если папка avatars лежит рядом с index.html
const myLocalAvatars = [
    "avatars/Ari LoL.png",
    "avatars/Lead_Horizon_Katana.jpg",
    "avatars/igra_Alice_6439.jpg",
    "avatars/kiriki.jpg"
];

// Данные профиля (По умолчанию берем первую картинку из твоего списка)
let userProfile = {
    avatar: myLocalAvatars[0], 
    nickname: "",
    bio: "В сети",
    frame: "",
    effect: "liquid"
};

// 1. ВХОД
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        const userDocRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userDocRef);

        if (userSnap.exists()) {
            const data = userSnap.data();
            userProfile = { ...userProfile, ...data };
        } else {
            const namePart = user.email.split('@')[0];
            userProfile.nickname = namePart.charAt(0).toUpperCase() + namePart.slice(1);
            await setDoc(userDocRef, { ...userProfile, email: user.email });
        }

        // Инициализируем WebGL аватар
        if (!avatarRenderer) {
            // Проверяем, существует ли контейнер перед созданием
            if(document.getElementById('webgl-avatar-container')) {
                avatarRenderer = new AvatarRenderer(
                    'webgl-avatar-container', 
                    userProfile.avatar, 
                    userProfile.effect || 'liquid'
                );
            }
        }

        updateSidebarUI();
        loadMessages(currentRoom);
        initAvatarGrid(); // Загружаем твои картинки в настройки
    } else {
        window.location.href = "index.html";
    }
});

// Обновление сайдбара
function updateSidebarUI() {
    const nameEl = document.getElementById('user-display');
    const statusEl = document.getElementById('user-status');

    // Обновляем WebGL
    if(avatarRenderer) {
        avatarRenderer.updateImage(userProfile.avatar);
        avatarRenderer.setEffect(userProfile.effect);
    }
    // На случай, если WebGL не загрузился, можно обновлять и обычный фон (если он есть)
    // const avatarEl = document.getElementById('my-avatar');
    // if(avatarEl) avatarEl.style.backgroundImage = `url('${userProfile.avatar}')`;

    nameEl.innerText = userProfile.nickname || "Без имени";
    statusEl.innerText = userProfile.bio;
}

// 2. ОКНО НАСТРОЕК
const modal = document.getElementById('profile-modal');
const closeBtn = document.getElementById('btn-close-modal');
const settingsBtn = document.getElementById('btn-settings');
const saveBtn = document.getElementById('btn-save-profile');
const sidebarAvatar = document.getElementById('sidebar-avatar-wrap');
const previewAvatar = document.getElementById('preview-avatar');

let tempFrame = "";
let tempEffect = "";

function openSettings() {
    modal.style.display = 'flex';
    document.getElementById('input-nickname').value = userProfile.nickname;
    document.getElementById('input-bio').value = userProfile.bio;
    
    tempFrame = userProfile.frame;
    tempEffect = userProfile.effect || 'liquid';
    
    updatePreview();
    
    // Выделяем активные кнопки
    selectFeature('effect-selector', tempEffect);
    // selectFeature('frame-selector', tempFrame); // Если вернешь рамки
    
    // Подсветка выбранной аватарки
    document.querySelectorAll('.avatar-option').forEach(opt => {
        opt.classList.remove('selected');
        // Сравниваем URL, но учитываем кодировку пробелов (Ari%20LoL vs Ari LoL)
        if(decodeURI(opt.dataset.url) === decodeURI(userProfile.avatar)) {
            opt.classList.add('selected');
        }
    });
}

function updatePreview() {
    // В превью показываем просто картинку (без тяжелого WebGL, чтобы не лагало)
    previewAvatar.style.backgroundImage = `url('${userProfile.avatar}')`;
    previewAvatar.className = `current-avatar-preview avatar ${tempFrame}`;
}

function selectFeature(containerId, activeVal) {
    const container = document.getElementById(containerId);
    if(container) {
        container.querySelectorAll('.feature-opt').forEach(opt => {
            opt.classList.toggle('selected', opt.dataset.val === activeVal);
        });
    }
}

// Слушатель кликов по эффектам
const effectSelector = document.getElementById('effect-selector');
if(effectSelector) {
    effectSelector.addEventListener('click', (e) => {
        if(e.target.classList.contains('feature-opt')) {
            tempEffect = e.target.dataset.val;
            selectFeature('effect-selector', tempEffect);
            // Можно сразу показать в основном меню для вау-эффекта
            if(avatarRenderer) avatarRenderer.setEffect(tempEffect);
        }
    });
}

settingsBtn.addEventListener('click', openSettings);
if(sidebarAvatar) sidebarAvatar.addEventListener('click', openSettings);
closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });

// СОХРАНЕНИЕ
saveBtn.addEventListener('click', async () => {
    const newNick = document.getElementById('input-nickname').value.trim();
    const newBio = document.getElementById('input-bio').value.trim();

    if (newNick) {
        userProfile.nickname = newNick;
        userProfile.bio = newBio;
        userProfile.effect = tempEffect;
        
        updateSidebarUI();
        
        const userDocRef = doc(db, "users", currentUser.uid);
        await updateDoc(userDocRef, { 
            nickname: userProfile.nickname, 
            bio: userProfile.bio,
            avatar: userProfile.avatar,
            effect: userProfile.effect
        });
        
        modal.style.display = 'none';
    } else {
        alert("Введи имя!");
    }
});

// --- ГЕНЕРАЦИЯ СЕТКИ ИЗ ТВОИХ ФАЙЛОВ ---
function initAvatarGrid() {
    const grid = document.getElementById('avatar-grid');
    grid.innerHTML = "";
    
    myLocalAvatars.forEach(url => {
        const div = document.createElement('div');
        div.className = 'avatar-option';
        // Кавычки нужны, чтобы пробелы в именах файлов не ломали CSS
        div.style.backgroundImage = `url('${url}')`; 
        div.dataset.url = url;
        
        div.addEventListener('click', () => {
            document.querySelectorAll('.avatar-option').forEach(opt => opt.classList.remove('selected'));
            div.classList.add('selected');
            userProfile.avatar = url;
            updatePreview();
            // Сразу обновляем WebGL в сайдбаре, чтобы видно было красоту
            if(avatarRenderer) avatarRenderer.updateImage(url);
        });
        
        grid.appendChild(div);
    });
}


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
    const msgId = docSnap.id;
    const isMe = msg.senderEmail === currentUser.email;

    const div = document.createElement('div');
    div.className = `message ${isMe ? 'my-message' : 'other-message'}`;
    if (isMe) div.addEventListener('contextmenu', (e) => openContextMenu(e, msgId));

    const date = new Date(msg.createdAt);
    const time = `${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;
    
    // Аватарка собеседника (обычная картинка, без WebGL для производительности)
    const avatarUrl = msg.senderAvatar || myLocalAvatars[0];
    
    // Достаем эффекты (если сохраняли рамки)
    const msgFrame = msg.senderFrame || "";

    div.innerHTML = `
        <div class="msg-avatar avatar ${msgFrame}" style="background-image: url('${avatarUrl}')"></div>
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
            room: currentRoom,
            createdAt: Date.now()
        });
        input.value = "";
    } catch (e) {
        console.error("Error:", e);
    }
}

// Утилиты
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
document.getElementById('btn-logout').addEventListener('click', () => {
    signOut(auth).then(() => window.location.href = "index.html");
});
