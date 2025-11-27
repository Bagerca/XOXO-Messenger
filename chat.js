import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    collection, addDoc, query, where, orderBy, onSnapshot, 
    doc, deleteDoc, updateDoc, getDoc, setDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// ПЕРЕМЕННЫЕ
let currentUser = null;
let currentRoom = "general";
let unsubscribeMessages = null;
let contextMenuMsgId = null;

// Данные профиля
let userProfile = {
    avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=new",
    nickname: "",
    bio: "В сети",
    frame: "",        // Класс рамки
    effect: ""        // Класс эффекта
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

        updateSidebarUI();
        loadMessages(currentRoom);
        initAvatarGrid();
    } else {
        window.location.href = "index.html";
    }
});

// Обновление сайдбара
function updateSidebarUI() {
    const avatarEl = document.getElementById('my-avatar');
    const nameEl = document.getElementById('user-display');
    const statusEl = document.getElementById('user-status');

    avatarEl.style.backgroundImage = `url('${userProfile.avatar}')`;
    nameEl.innerText = userProfile.nickname || "Без имени";
    statusEl.innerText = userProfile.bio;
    
    // Сбрасываем классы и ставим новые (рамка + эффект)
    avatarEl.className = `avatar ${userProfile.frame} ${userProfile.effect}`;
}

// 2. ОКНО НАСТРОЕК
const modal = document.getElementById('profile-modal');
const closeBtn = document.getElementById('btn-close-modal');
const settingsBtn = document.getElementById('btn-settings');
const saveBtn = document.getElementById('btn-save-profile');
const sidebarAvatar = document.getElementById('sidebar-avatar-wrap');
const previewAvatar = document.getElementById('preview-avatar');

// Временные переменные для предпросмотра
let tempFrame = "";
let tempEffect = "";

function openSettings() {
    modal.style.display = 'flex';
    document.getElementById('input-nickname').value = userProfile.nickname;
    document.getElementById('input-bio').value = userProfile.bio;
    
    tempFrame = userProfile.frame;
    tempEffect = userProfile.effect;
    
    updatePreview();
    
    // Выделяем кнопки
    selectFeature('frame-selector', tempFrame);
    selectFeature('effect-selector', tempEffect);
    
    // Аватарки
    document.querySelectorAll('.avatar-option').forEach(opt => {
        opt.classList.remove('selected');
        if(opt.dataset.url === userProfile.avatar) opt.classList.add('selected');
    });
}

function updatePreview() {
    previewAvatar.style.backgroundImage = `url('${userProfile.avatar}')`;
    // Применяем классы к превью
    previewAvatar.className = `current-avatar-preview avatar ${tempFrame} ${tempEffect}`;
}

// Утилита для кнопок выбора
function selectFeature(containerId, activeVal) {
    const container = document.getElementById(containerId);
    container.querySelectorAll('.feature-opt').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.val === activeVal);
    });
}

// Логика кликов по кнопкам рамок/эффектов
document.getElementById('frame-selector').addEventListener('click', (e) => {
    if(e.target.classList.contains('feature-opt')) {
        tempFrame = e.target.dataset.val;
        selectFeature('frame-selector', tempFrame);
        updatePreview();
    }
});
document.getElementById('effect-selector').addEventListener('click', (e) => {
    if(e.target.classList.contains('feature-opt')) {
        tempEffect = e.target.dataset.val;
        selectFeature('effect-selector', tempEffect);
        updatePreview();
    }
});


settingsBtn.addEventListener('click', openSettings);
sidebarAvatar.addEventListener('click', openSettings);
closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });

// СОХРАНЕНИЕ
saveBtn.addEventListener('click', async () => {
    const newNick = document.getElementById('input-nickname').value.trim();
    const newBio = document.getElementById('input-bio').value.trim();

    if (newNick) {
        userProfile.nickname = newNick;
        userProfile.bio = newBio;
        userProfile.frame = tempFrame;
        userProfile.effect = tempEffect;
        // Аватар обновляется сразу по клику в сетке
        
        updateSidebarUI();
        
        const userDocRef = doc(db, "users", currentUser.uid);
        await updateDoc(userDocRef, { 
            nickname: userProfile.nickname, 
            bio: userProfile.bio,
            avatar: userProfile.avatar,
            frame: userProfile.frame,
            effect: userProfile.effect
        });
        
        modal.style.display = 'none';
    } else {
        alert("Введи имя!");
    }
});

function initAvatarGrid() {
    const grid = document.getElementById('avatar-grid');
    grid.innerHTML = "";
    const styles = ['adventurer', 'avataaars', 'big-smile', 'bottts', 'fun-emoji', 'lorelei'];
    
    for (let i = 0; i < 15; i++) {
        const style = styles[Math.floor(Math.random() * styles.length)];
        const seed = Math.random().toString(36).substring(7);
        const url = `https://api.dicebear.com/7.x/${style}/svg?seed=${seed}`;
        
        const div = document.createElement('div');
        div.className = 'avatar-option';
        div.style.backgroundImage = `url('${url}')`;
        div.dataset.url = url;
        
        div.addEventListener('click', () => {
            document.querySelectorAll('.avatar-option').forEach(opt => opt.classList.remove('selected'));
            div.classList.add('selected');
            userProfile.avatar = url;
            updatePreview();
        });
        grid.appendChild(div);
    }
}


// 3. ЧАТ (ОТОБРАЖЕНИЕ СООБЩЕНИЙ С РАМКАМИ)
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
    
    const avatarUrl = msg.senderAvatar || "https://api.dicebear.com/7.x/initials/svg?seed=" + msg.sender;
    
    // Достаем рамку и эффект из сообщения (если они там есть)
    const msgFrame = msg.senderFrame || "";
    const msgEffect = msg.senderEffect || "";

    div.innerHTML = `
        <div class="msg-avatar avatar ${msgFrame} ${msgEffect}" style="background-image: url('${avatarUrl}')"></div>
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
            
            // ВАЖНО: Прикрепляем к сообщению текущую рамку и эффект
            senderFrame: userProfile.frame,
            senderEffect: userProfile.effect,
            
            room: currentRoom,
            createdAt: Date.now()
        });
        input.value = "";
    } catch (e) {
        console.error("Error:", e);
    }
}

// Утилиты остаются теми же...
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
