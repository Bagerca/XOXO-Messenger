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

// Данные профиля (по умолчанию)
let userProfile = {
    avatar: "https://api.dicebear.com/7.x/bottts/svg?seed=new",
    nickname: "",
    bio: "В сети",
    gender: "secret"
};

// --- 1. ВХОД И ЗАГРУЗКА ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        
        // Загружаем данные из базы
        const userDocRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userDocRef);

        if (userSnap.exists()) {
            const data = userSnap.data();
            userProfile = { ...userProfile, ...data }; // Объединяем
        } else {
            // Если новый - создаем запись
            const namePart = user.email.split('@')[0];
            userProfile.nickname = namePart.charAt(0).toUpperCase() + namePart.slice(1);
            await setDoc(userDocRef, { ...userProfile, email: user.email });
        }

        updateSidebarUI();
        loadMessages(currentRoom);
        initAvatarGrid(); // Генерируем картинки для настроек
    } else {
        window.location.href = "index.html";
    }
});

function updateSidebarUI() {
    const avatarEl = document.getElementById('my-avatar');
    const nameEl = document.getElementById('user-display');
    const statusEl = document.getElementById('user-status');

    avatarEl.style.backgroundImage = `url('${userProfile.avatar}')`;
    nameEl.innerText = userProfile.nickname || "Без имени";
    statusEl.innerText = userProfile.bio;
}

// --- 2. НАСТРОЙКИ ПРОФИЛЯ ---
const modal = document.getElementById('profile-modal');
const closeBtn = document.getElementById('btn-close-modal');
const settingsBtn = document.getElementById('btn-settings');
const saveBtn = document.getElementById('btn-save-profile');
const sidebarAvatar = document.getElementById('sidebar-avatar-wrap');

// Открытие окна
function openSettings() {
    modal.style.display = 'flex';
    
    // Заполняем поля текущими данными
    document.getElementById('input-nickname').value = userProfile.nickname;
    document.getElementById('input-bio').value = userProfile.bio;
    document.getElementById('preview-avatar').style.backgroundImage = `url('${userProfile.avatar}')`;
    
    // Выбор пола
    document.querySelectorAll('.gender-option').forEach(opt => {
        opt.classList.toggle('selected', opt.dataset.value === userProfile.gender);
    });

    // Выбор аватара (подсветка текущего если есть в списке)
    document.querySelectorAll('.avatar-option').forEach(opt => {
        opt.classList.remove('selected');
        if(opt.dataset.url === userProfile.avatar) opt.classList.add('selected');
    });
}

settingsBtn.addEventListener('click', openSettings);
sidebarAvatar.addEventListener('click', openSettings); // Клик по аватарке тоже открывает

closeBtn.addEventListener('click', () => { modal.style.display = 'none'; });

// Выбор пола
document.querySelectorAll('.gender-option').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.gender-option').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
    });
});

// Сохранение
saveBtn.addEventListener('click', async () => {
    // Собираем данные
    const newNick = document.getElementById('input-nickname').value.trim();
    const newBio = document.getElementById('input-bio').value.trim();
    const genderEl = document.querySelector('.gender-option.selected');
    const newGender = genderEl ? genderEl.dataset.value : 'secret';
    // Аватар берется из выбранного в сетке, либо остается старым

    if (newNick) {
        userProfile.nickname = newNick;
        userProfile.bio = newBio;
        userProfile.gender = newGender;
        // userProfile.avatar уже обновлен при клике на сетку
        
        // Обновляем UI
        updateSidebarUI();
        
        // Сохраняем в базу
        const userDocRef = doc(db, "users", currentUser.uid);
        await updateDoc(userDocRef, { 
            nickname: userProfile.nickname,
            bio: userProfile.bio,
            gender: userProfile.gender,
            avatar: userProfile.avatar
        });
        
        modal.style.display = 'none';
    } else {
        alert("Имя не может быть пустым!");
    }
});

// Генерация сетки аватарок (DiceBear API)
function initAvatarGrid() {
    const grid = document.getElementById('avatar-grid');
    grid.innerHTML = "";
    
    // Стили аватарок
    const styles = ['adventurer', 'avataaars', 'big-smile', 'bottts', 'fun-emoji', 'lorelei', 'notionists'];
    
    for (let i = 0; i < 15; i++) {
        // Случайный стиль и сид
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
            // Обновляем превью и переменную
            document.getElementById('preview-avatar').style.backgroundImage = `url('${url}')`;
            userProfile.avatar = url;
        });
        
        grid.appendChild(div);
    }
}


// --- 3. ЧАТ И СООБЩЕНИЯ ---
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
    
    // Используем аватар из сообщения или заглушку
    const avatarUrl = msg.senderAvatar || "https://api.dicebear.com/7.x/initials/svg?seed=" + msg.sender;

    div.innerHTML = `
        <div class="msg-avatar" style="background-image: url('${avatarUrl}')"></div>
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
            sender: userProfile.nickname, // Используем НИКНЕЙМ
            senderEmail: currentUser.email,
            senderAvatar: userProfile.avatar, // Текущая аватарка
            room: currentRoom,
            createdAt: Date.now()
        });
        input.value = "";
    } catch (e) {
        console.error("Ошибка:", e);
    }
}

// Утилиты
function escapeHtml(text) {
    if(!text) return text;
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const contextMenu = document.getElementById('context-menu');
function openContextMenu(e, id) {
    e.preventDefault();
    contextMenuMsgId = id;
    contextMenu.style.top = `${e.clientY}px`;
    contextMenu.style.left = `${e.clientX}px`;
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

// Навигация
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
