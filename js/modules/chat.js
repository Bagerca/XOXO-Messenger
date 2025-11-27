import { state } from './state.js';
import { db } from '../../firebase-config.js';
import { 
    collection, addDoc, query, where, orderBy, onSnapshot, 
    doc, deleteDoc, updateDoc, getDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let unsubscribeMessages = null;
let replyingTo = null;
let editingMsgId = null;

// SVG Иконки для кнопок
const ICONS = {
    reply: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>`,
    edit: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`,
    trash: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`,
    forward: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`
};

// --- ИНИЦИАЛИЗАЦИЯ ---
export function initChat() {
    const sendBtn = document.getElementById('send-btn');
    const input = document.getElementById('msg-input');
    
    sendBtn.addEventListener('click', handleSend);
    input.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSend(); });
    
    document.getElementById('cancel-reply').addEventListener('click', cancelReply);
    
    // Глобальные функции для onclick в HTML
    window.triggerReply = triggerReply;
    window.triggerEdit = triggerEdit;
    window.triggerDelete = triggerDelete;
    window.triggerReaction = triggerReaction;
    window.triggerForward = triggerForward;
}

// --- ЗАГРУЗКА СООБЩЕНИЙ ---
export function loadMessages(room) {
    const chatWindow = document.getElementById('chat-window');
    chatWindow.innerHTML = ""; 
    
    if (unsubscribeMessages) unsubscribeMessages();

    const q = query(collection(db, "messages"), where("room", "==", room), orderBy("createdAt"));

    unsubscribeMessages = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            const msgData = change.doc.data();
            const msgId = change.doc.id;

            if (change.type === "added") {
                appendMessage(msgId, msgData, chatWindow);
            }
            if (change.type === "modified") {
                updateMessageDOM(msgId, msgData);
            }
            if (change.type === "removed") {
                const el = document.getElementById(`msg-${msgId}`);
                if (el) el.remove();
            }
        });
        // Скролл вниз
        chatWindow.scrollTop = chatWindow.scrollHeight;
    });
}

// --- СОЗДАНИЕ HTML СООБЩЕНИЯ ---
function appendMessage(id, msg, container) {
    const isMe = msg.senderEmail === state.currentUser.email;
    const date = new Date(msg.createdAt);
    const time = `${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;
    
    // Аватарка (берем из сообщения или дефолтную локальную)
    const avatarUrl = msg.senderAvatar || state.localAvatars[0];

    const div = document.createElement('div');
    div.id = `msg-${id}`;
    div.className = `message ${isMe ? 'my-message' : 'other-message'}`;

    div.innerHTML = `
        <!-- Аватарка (с эффектами если есть) -->
        <div class="msg-avatar avatar ${msg.senderFrame || ''} ${msg.senderEffect || ''}" 
             style="background-image: url('${avatarUrl}')"></div>
        
        <div class="msg-content">
            
            <!-- Заголовок: Имя и Время -->
            <div class="msg-header">
                <span class="msg-sender">${escapeHtml(msg.sender)}</span>
                <span class="msg-time">${time}</span>
                ${msg.isEdited ? '<span class="msg-edited">(изм.)</span>' : ''}
            </div>

            <!-- Пузырь с контентом -->
            <div class="msg-bubble">
                <!-- Вложенный ответ -->
                ${msg.replyTo ? `
                    <div class="reply-preview">
                        <div>
                            <div class="reply-preview-name">${escapeHtml(msg.replyTo.sender)}</div>
                            <div class="reply-preview-text">${escapeHtml(msg.replyTo.text)}</div>
                        </div>
                    </div>
                ` : ''}

                <!-- Текст сообщения -->
                <span id="text-${id}">${escapeHtml(msg.text)}</span>
            </div>
            
            <!-- Реакции под пузырем -->
            <div class="reactions-row" id="reacts-${id}">
                ${renderReactionsHTML(id, msg.reactions)}
            </div>
        </div>

        <!-- Меню действий (Toolbar) -->
        <div class="msg-actions">
            <div class="action-btn" onclick="window.triggerReply('${id}')" title="Ответить">${ICONS.reply}</div>
            <div class="action-btn" onclick="window.triggerReaction('${id}', '❤️')" title="Лайк">❤️</div>
            <div class="action-btn" onclick="window.triggerReaction('${id}', '😂')" title="Смешно">😂</div>
            
            ${isMe ? `
                <div class="action-btn" onclick="window.triggerEdit('${id}')" title="Изменить">${ICONS.edit}</div>
                <div class="action-btn delete" onclick="window.triggerDelete('${id}')" title="Удалить">${ICONS.trash}</div>
            ` : ''}
             <div class="action-btn" onclick="window.triggerForward('${id}')" title="Переслать">${ICONS.forward}</div>
        </div>
    `;
    container.appendChild(div);
}

// --- ОБНОВЛЕНИЕ СУЩЕСТВУЮЩЕГО СООБЩЕНИЯ ---
function updateMessageDOM(id, msg) {
    const textEl = document.getElementById(`text-${id}`);
    const reactsEl = document.getElementById(`reacts-${id}`);
    
    // Обновляем текст
    if (textEl) {
        textEl.innerText = msg.text;
        // Если появилась пометка (изм.), добавляем её
        if(msg.isEdited && !textEl.closest('.msg-content').querySelector('.msg-edited')) {
            const header = textEl.closest('.msg-content').querySelector('.msg-header');
            header.insertAdjacentHTML('beforeend', '<span class="msg-edited">(изм.)</span>');
        }
    }
    // Обновляем реакции
    if (reactsEl) {
        reactsEl.innerHTML = renderReactionsHTML(id, msg.reactions);
    }
}

// Генерация кнопок реакций
function renderReactionsHTML(msgId, reactions) {
    if (!reactions) return '';
    let html = '';
    for (const [emoji, users] of Object.entries(reactions)) {
        if (users.length > 0) {
            const iReacted = users.includes(state.currentUser.uid);
            html += `
                <div class="reaction-pill ${iReacted ? 'active' : ''}" 
                     onclick="window.triggerReaction('${msgId}', '${emoji}')">
                    <span>${emoji}</span>
                    <span style="opacity:0.8; font-weight:600;">${users.length}</span>
                </div>
            `;
        }
    }
    return html;
}

// --- ЛОГИКА ОТПРАВКИ ---
async function handleSend() {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text) return;

    // Редактирование
    if (editingMsgId) {
        await updateDoc(doc(db, "messages", editingMsgId), {
            text: text,
            isEdited: true
        });
        editingMsgId = null;
        document.getElementById('main-input-box').classList.remove('editing');
        input.value = "";
        return;
    }

    // Новое сообщение
    try {
        const msgData = {
            text: text,
            sender: state.userProfile.nickname,
            senderEmail: state.currentUser.email,
            senderAvatar: state.userProfile.avatar,
            senderEffect: state.userProfile.effect,
            senderStatus: state.userProfile.status,
            room: state.currentRoom,
            createdAt: Date.now(),
            reactions: {}
        };

        // Если это ответ
        if (replyingTo) {
            msgData.replyTo = replyingTo;
            cancelReply();
        }

        await addDoc(collection(db, "messages"), msgData);
        input.value = "";
    } catch (e) {
        console.error("Ошибка отправки:", e);
    }
}

// --- ТРИГГЕРЫ ДЕЙСТВИЙ ---

async function triggerReply(id) {
    const docSnap = await getDoc(doc(db, "messages", id));
    if (docSnap.exists()) {
        const msg = docSnap.data();
        replyingTo = { id: id, sender: msg.sender, text: msg.text, avatar: msg.senderAvatar };
        
        // Показываем панель
        document.getElementById('reply-bar').style.display = 'flex';
        document.getElementById('reply-to-name').innerText = msg.sender;
        document.getElementById('msg-input').focus();
    }
}

async function triggerEdit(id) {
    const docSnap = await getDoc(doc(db, "messages", id));
    if (docSnap.exists()) {
        const msg = docSnap.data();
        if(msg.senderEmail !== state.currentUser.email) return;

        editingMsgId = id;
        const input = document.getElementById('msg-input');
        input.value = msg.text;
        input.focus();
        
        document.getElementById('main-input-box').classList.add('editing');
    }
}

async function triggerDelete(id) {
    if(confirm("Удалить сообщение?")) {
        await deleteDoc(doc(db, "messages", id));
    }
}

async function triggerReaction(id, emoji) {
    const msgRef = doc(db, "messages", id);
    const docSnap = await getDoc(msgRef);
    if(docSnap.exists()) {
        const data = docSnap.data();
        let reacts = data.reactions || {};
        let users = reacts[emoji] || [];

        if(users.includes(state.currentUser.uid)) {
            users = users.filter(uid => uid !== state.currentUser.uid); // Убрать
        } else {
            users.push(state.currentUser.uid); // Добавить
        }

        reacts[emoji] = users;
        await updateDoc(msgRef, { reactions: reacts });
    }
}

async function triggerForward(id) {
    const docSnap = await getDoc(doc(db, "messages", id));
    if (docSnap.exists()) {
        const msg = docSnap.data();
        const input = document.getElementById('msg-input');
        input.value = `> Переслано от ${msg.sender}:\n${msg.text}`;
        input.focus();
    }
}

function cancelReply() {
    replyingTo = null;
    document.getElementById('reply-bar').style.display = 'none';
    document.getElementById('main-input-box').classList.remove('editing');
    editingMsgId = null;
    document.getElementById('msg-input').value = ""; // Очищаем поле при отмене (опционально)
}

function escapeHtml(text) {
    if(!text) return text;
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
