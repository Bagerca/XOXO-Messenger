import { state } from './state.js';
import { db } from '../../firebase-config.js';
import { 
    collection, addDoc, query, where, orderBy, onSnapshot, 
    doc, deleteDoc, updateDoc, getDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let unsubscribeMessages = null;
let replyingTo = null;
let editingMsgId = null;

// Инициализация (вешаем слушатели)
export function initChat() {
    const sendBtn = document.getElementById('send-btn');
    const input = document.getElementById('msg-input');
    
    sendBtn.addEventListener('click', handleSend);
    input.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSend(); });
    
    document.getElementById('cancel-reply').addEventListener('click', cancelReply);
    
    // ГЛОБАЛЬНЫЕ ФУНКЦИИ (чтобы работали onclick в HTML)
    window.triggerReply = triggerReply;
    window.triggerEdit = triggerEdit;
    window.triggerDelete = triggerDelete;
    window.triggerReaction = triggerReaction;
    window.triggerForward = triggerForward;
}

// Загрузка сообщений
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
        chatWindow.scrollTop = chatWindow.scrollHeight;
    });
}

// Создание HTML одного сообщения
function appendMessage(id, msg, container) {
    const isMe = msg.senderEmail === state.currentUser.email;
    const date = new Date(msg.createdAt);
    const time = `${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;
    
    // Аватарка (если нет, берем заглушку из стейта)
    const avatarUrl = msg.senderAvatar || state.localAvatars[0];

    const div = document.createElement('div');
    div.id = `msg-${id}`;
    div.className = `message ${isMe ? 'my-message' : 'other-message'}`;

    div.innerHTML = `
        <div class="msg-avatar avatar ${msg.senderFrame || ''} ${msg.senderEffect || ''}" 
             style="background-image: url('${avatarUrl}')"></div>
        
        <div class="msg-content">
            ${msg.replyTo ? `
                <div class="reply-context">
                    <div class="reply-avatar-mini" style="background-image: url('${msg.replyTo.avatar}')"></div>
                    <span class="reply-name">${escapeHtml(msg.replyTo.sender)}</span>
                    <span style="opacity:0.7; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width: 150px;">
                        ${escapeHtml(msg.replyTo.text)}
                    </span>
                </div>
            ` : ''}

            <div class="msg-header">
                <span class="msg-sender">${escapeHtml(msg.sender)}</span>
                <span class="msg-time">${time}</span>
                ${msg.isEdited ? '<span class="msg-edited">(изм.)</span>' : ''}
            </div>

            <div class="msg-text" id="text-${id}">${escapeHtml(msg.text)}</div>
            
            <div class="reactions-row" id="reacts-${id}">
                ${renderReactionsHTML(id, msg.reactions)}
            </div>
        </div>

        <div class="msg-actions">
            <div class="action-btn" onclick="window.triggerReply('${id}')" title="Ответить">↩️</div>
            <div class="action-btn" onclick="window.triggerReaction('${id}', '❤️')" title="Лайк">❤️</div>
            <div class="action-btn" onclick="window.triggerReaction('${id}', '😂')" title="Смешно">😂</div>
            
            ${isMe ? `
                <div class="action-btn" onclick="window.triggerEdit('${id}')" title="Изменить">✏️</div>
                <div class="action-btn delete" onclick="window.triggerDelete('${id}')" title="Удалить">🗑️</div>
            ` : ''}
             <div class="action-btn" onclick="window.triggerForward('${id}')" title="Переслать">⏩</div>
        </div>
    `;
    container.appendChild(div);
}

// Обновление без перерисовки (для лайков и редактирования)
function updateMessageDOM(id, msg) {
    const textEl = document.getElementById(`text-${id}`);
    const reactsEl = document.getElementById(`reacts-${id}`);
    
    if (textEl) {
        textEl.innerText = msg.text;
        // Добавляем пометку (изм), если её нет
        if(msg.isEdited && !textEl.parentNode.querySelector('.msg-edited')) {
            const header = textEl.parentNode.querySelector('.msg-header');
            header.insertAdjacentHTML('beforeend', '<span class="msg-edited">(изм.)</span>');
        }
    }
    if (reactsEl) {
        reactsEl.innerHTML = renderReactionsHTML(id, msg.reactions);
    }
}

// Генерация HTML реакций
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
                    <span>${users.length}</span>
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

// --- ТРИГГЕРЫ (ФУНКЦИИ ДЕЙСТВИЙ) ---

async function triggerReply(id) {
    const docSnap = await getDoc(doc(db, "messages", id));
    if (docSnap.exists()) {
        const msg = docSnap.data();
        replyingTo = { id, sender: msg.sender, text: msg.text, avatar: msg.senderAvatar };
        document.getElementById('reply-bar').style.display = 'flex';
        document.getElementById('reply-to-name').innerText = msg.sender;
        document.getElementById('msg-input').focus();
    }
}

async function triggerEdit(id) {
    const docSnap = await getDoc(doc(db, "messages", id));
    if (docSnap.exists()) {
        const msg = docSnap.data();
        // Проверка: можно редактировать только свои
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
    if(docSnap.exists()) {
        const msg = docSnap.data();
        const input = document.getElementById('msg-input');
        input.value = `> Переслано от ${msg.sender}:\n${msg.text}`;
        input.focus();
    }
}

function cancelReply() {
    replyingTo = null;
    document.getElementById('reply-bar').style.display = 'none';
}

function escapeHtml(text) {
    if(!text) return text;
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
