import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { 
    collection, addDoc, query, where, orderBy, onSnapshot, 
    doc, deleteDoc, updateDoc, getDoc, setDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

// --- ПЕРЕМЕННЫЕ ---
let currentUser = null;
let currentRoom = "general"; // Комната по умолчанию
let unsubscribeMessages = null; // Чтобы отключать прослушку старой комнаты
let contextMenuMsgId = null; // ID сообщения, на которое нажали ПКМ
let myAvatar = "https://ui-avatars.com/api/?background=b000e6&color=fff&name=?"; // Заглушка

// --- 1. ПРОВЕРКА ВХОДА И ЗАГРУЗКА ПРОФИЛЯ ---
onAuthStateChanged(auth, async (user) => {
    if (user) {
        currentUser = user;
        
        // Получаем имя из email (test@xoxo.com -> Test)
        const namePart = user.email.split('@')[0];
        const formattedName = namePart.charAt(0).toUpperCase() + namePart.slice(1);
        
        // Загружаем профиль пользователя из базы (если есть аватарка)
        const userDocRef = doc(db, "users", user.uid);
        const userSnap = await getDoc(userDocRef);

        if (userSnap.exists()) {
            const data = userSnap.data();
            myAvatar = data.avatar || myAvatar;
        } else {
            // Если пользователя нет в базе users, создаем его
            await setDoc(userDocRef, {
                email: user.email,
                avatar: myAvatar
            });
        }

        // Обновляем интерфейс слева (Профиль)
        document.getElementById('user-display').innerText = formattedName;
        updateMyAvatarUI(myAvatar);

        // Загружаем сообщения первой комнаты
        loadMessages(currentRoom);
    } else {
        window.location.href = "index.html";
    }
});

function updateMyAvatarUI(url) {
    const avatarEl = document.getElementById('my-avatar');
    avatarEl.style.backgroundImage = `url('${url}')`;
    avatarEl.innerText = ""; // Убираем вопросительный знак
}

// --- 2. ПЕРЕКЛЮЧЕНИЕ КОМНАТ ---
const channelBtns = document.querySelectorAll('.channel-item');
const roomTitle = document.getElementById('current-room-name');

channelBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        // Убираем активность у всех
        channelBtns.forEach(b => b.classList.remove('active'));
        // Ставим активность нажатой
        btn.classList.add('active');

        // Меняем комнату
        const newRoom = btn.getAttribute('data-room');
        if (newRoom !== currentRoom) {
            currentRoom = newRoom;
            roomTitle.innerText = btn.innerText.replace('# ', ''); // Меням заголовок
            loadMessages(currentRoom); // Перезагружаем чат
        }
    });
});

// --- 3. ЗАГРУЗКА СООБЩЕНИЙ ---
function loadMessages(room) {
    const chatWindow = document.getElementById('chat-window');
    
    // Если уже слушали другую комнату - отключаемся
    if (unsubscribeMessages) {
        unsubscribeMessages();
    }

    // Запрос: сообщения ТОЛЬКО этой комнаты
    const q = query(
        collection(db, "messages"), 
        where("room", "==", room),
        orderBy("createdAt")
    );

    unsubscribeMessages = onSnapshot(q, (snapshot) => {
        chatWindow.innerHTML = ""; // Чистим чат
        
        snapshot.forEach((docSnap) => {
            renderMessage(docSnap, chatWindow);
        });

        // Скролл вниз
        chatWindow.scrollTop = chatWindow.scrollHeight;
    });
}

function renderMessage(docSnap, container) {
    const msg = docSnap.data();
    const msgId = docSnap.id;
    const isMe = msg.senderEmail === currentUser.email;

    const div = document.createElement('div');
    div.className = `message ${isMe ? 'my-message' : 'other-message'}`;
    
    // Чтобы работало контекстное меню (ПКМ)
    if (isMe) {
        div.addEventListener('contextmenu', (e) => openContextMenu(e, msgId));
    }

    // Время
    const date = new Date(msg.createdAt);
    const time = `${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;

    // Аватарка отправителя
    const avatarUrl = msg.senderAvatar || "https://ui-avatars.com/api/?background=444&color=fff&name=" + msg.sender;

    div.innerHTML = `
        <div class="msg-avatar" style="background-image: url('${avatarUrl}'); background-size: cover;"></div>
        <div class="msg-content">
            <div class="msg-header">
                <span class="msg-sender">${msg.sender}</span>
                <span class="msg-time">${time}</span>
            </div>
            <div class="msg-text">${escapeHtml(msg.text)}</div>
        </div>
    `;

    container.appendChild(div);
}

// Защита от HTML-тегов (чтобы не взломали через сообщения)
function escapeHtml(text) {
    if(!text) return text;
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// --- 4. ОТПРАВКА СООБЩЕНИЯ ---
const input = document.getElementById('msg-input');
const sendBtn = document.getElementById('send-btn');

async function sendMessage() {
    const text = input.value.trim();
    if (!text) return;

    const namePart = currentUser.email.split('@')[0];
    const senderName = namePart.charAt(0).toUpperCase() + namePart.slice(1);

    try {
        await addDoc(collection(db, "messages"), {
            text: text,
            sender: senderName,
            senderEmail: currentUser.email,
            senderAvatar: myAvatar, // Сохраняем текущую аватарку в сообщение
            room: currentRoom,      // ВАЖНО: сохраняем комнату
            createdAt: Date.now()
        });
        input.value = "";
        input.focus();
    } catch (e) {
        console.error("Ошибка отправки:", e);
        alert("Не удалось отправить. Проверь консоль.");
    }
}

sendBtn.addEventListener('click', sendMessage);
input.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(); });


// --- 5. КОНТЕКСТНОЕ МЕНЮ (УДАЛЕНИЕ) ---
const contextMenu = document.getElementById('context-menu');
const deleteBtn = document.getElementById('btn-delete');
const editBtn = document.getElementById('btn-edit');

function openContextMenu(e, id) {
    e.preventDefault(); // Блокируем стандартное меню браузера
    contextMenuMsgId = id;
    
    // Позиция меню
    contextMenu.style.top = `${e.clientY}px`;
    contextMenu.style.left = `${e.clientX}px`;
    contextMenu.style.display = 'block';
}

// Закрыть меню при клике в любом месте
document.addEventListener('click', () => {
    contextMenu.style.display = 'none';
});

// Удаление
deleteBtn.addEventListener('click', async () => {
    if (contextMenuMsgId) {
        if(confirm("Удалить сообщение?")) {
            await deleteDoc(doc(db, "messages", contextMenuMsgId));
        }
    }
});

// Редактирование (простое)
editBtn.addEventListener('click', async () => {
    if (contextMenuMsgId) {
        const newText = prompt("Введите новый текст:");
        if (newText) {
            await updateDoc(doc(db, "messages", contextMenuMsgId), {
                text: newText
            });
        }
    }
});


// --- 6. ПРОФИЛЬ (СМЕНА АВАТАРКИ) ---
const settingsBtn = document.getElementById('btn-settings');
const modal = document.getElementById('profile-modal');
const closeModalBtn = document.getElementById('btn-close-modal');
const saveProfileBtn = document.getElementById('btn-save-profile');
const avatarInput = document.getElementById('avatar-input');

settingsBtn.addEventListener('click', () => {
    modal.style.display = 'flex'; // Показываем модалку
    avatarInput.value = myAvatar; // Подставляем текущую
});

closeModalBtn.addEventListener('click', () => {
    modal.style.display = 'none';
});

saveProfileBtn.addEventListener('click', async () => {
    const newUrl = avatarInput.value.trim();
    if (newUrl) {
        myAvatar = newUrl;
        updateMyAvatarUI(myAvatar);
        
        // Сохраняем в базу данных пользователя
        const userDocRef = doc(db, "users", currentUser.uid);
        await updateDoc(userDocRef, { avatar: myAvatar });
        
        modal.style.display = 'none';
    }
});

// --- 7. ВЫХОД ---
document.getElementById('btn-logout').addEventListener('click', () => {
    signOut(auth).then(() => window.location.href = "index.html");
});
