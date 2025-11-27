import { state } from './state.js';
import { db } from '../../firebase-config.js';
import { 
    collection, addDoc, query, where, orderBy, onSnapshot, 
    doc, deleteDoc, updateDoc, getDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let unsubscribeMessages = null;
let replyingTo = null;
let editingMsgId = null;
// Храним ID предыдущего сообщения в списке для группировки "на лету"
let lastRenderedMessage = null;

// SVG Иконки
const ICONS = {
    reply: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>`,
    edit: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`,
    trash: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`
};

// --- ИНИЦИАЛИЗАЦИЯ ---
export function initChat() {
    const sendBtn = document.getElementById('send-btn');
    const input = document.getElementById('msg-input');
    
    // Авто-высота Textarea
    input.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        if(this.value === '') this.style.height = 'auto'; // Сброс
    });

    // Обработка Shift+Enter vs Enter
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    });

    sendBtn.addEventListener('click', handleSend);
    document.getElementById('cancel-reply').addEventListener('click', cancelReply);
    
    // Глобальные функции
    window.triggerReply = triggerReply;
    window.triggerEdit = triggerEdit;
    window.triggerDelete = triggerDelete;
    window.triggerReaction = triggerReaction;
    window.scrollToMessage = scrollToMessage;
}

// --- ЗАГРУЗКА СООБЩЕНИЙ ---
export function loadMessages(room) {
    const chatWindow = document.getElementById('chat-window');
    
    if (unsubscribeMessages) unsubscribeMessages();
    chatWindow.innerHTML = "";
    lastRenderedMessage = null;

    const q = query(collection(db, "messages"), where("room", "==", room), orderBy("createdAt"));

    unsubscribeMessages = onSnapshot(q, (snapshot) => {
        // Если это первоначальная загрузка (много сообщений), очищаем всё
        if (snapshot.docChanges().length > 1) {
            chatWindow.innerHTML = "";
            lastRenderedMessage = null;
        }

        snapshot.docChanges().forEach((change) => {
            const msgData = change.doc.data();
            const msgId = change.doc.id;

            if (change.type === "added") {
                appendMessageSmart(msgId, msgData, chatWindow);
            }
            if (change.type === "modified") {
                updateMessageDOM(msgId, msgData);
            }
            if (change.type === "removed") {
                const el = document.getElementById(`msg-row-${msgId}`);
                if (el) el.remove();
            }
        });
        
        // Плавный скролл вниз
        setTimeout(() => {
            chatWindow.scrollTo({ top: chatWindow.scrollHeight, behavior: 'smooth' });
        }, 100);
    });
}

// --- РЕНДЕРИНГ СООБЩЕНИЯ (НОВЫЙ) ---
function appendMessageSmart(id, msg, container) {
    const isMe = msg.senderEmail === state.currentUser.email;
    const date = new Date(msg.createdAt);
    const timeStr = `${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;
    const avatarUrl = msg.senderAvatar || state.localAvatars[0];

    // Логика группировки
    let isGroupStart = true;
    
    // Проверяем предыдущее сообщение в DOM (или в памяти)
    if (lastRenderedMessage) {
        const timeDiff = msg.createdAt - lastRenderedMessage.createdAt;
        const isSameUser = msg.senderEmail === lastRenderedMessage.senderEmail;
        // Группируем если тот же юзер и прошло меньше 2 минут
        if (isSameUser && timeDiff < 120000) {
            isGroupStart = false;
            // У предыдущего сообщения убираем класс конца группы
            const prevRow = document.getElementById(`msg-row-${lastRenderedMessage.id}`);
            if (prevRow) prevRow.classList.remove('group-end');
        }
    }

    const row = document.createElement('div');
    row.id = `msg-row-${id}`;
    // group-end ставим по умолчанию, так как это пока последнее сообщение
    row.className = `message-row ${isMe ? 'right' : 'left'} ${isGroupStart ? 'group-start' : ''} group-end`;

    // Создаем HTML
    row.innerHTML = `
        <!-- Аватарка (видна только если group-end) -->
        <div class="avatar-column">
            <div class="msg-avatar" style="background-image: url('${avatarUrl}')" title="${msg.sender}"></div>
        </div>

        <div class="msg-content-wrapper">
            <!-- Имя показываем только в начале группы и только для чужих -->
            ${(!isMe && isGroupStart) ? `<div class="msg-sender-name">${escapeHtml(msg.sender)}</div>` : ''}
            
            <div class="msg-bubble" id="bubble-${id}">
                
                <!-- Вложенный ответ -->
                ${msg.replyTo ? `
                    <div class="reply-attachment" onclick="scrollToMessage('${msg.replyTo.id}')">
                        <div class="reply-name">${escapeHtml(msg.replyTo.sender)}</div>
                        <div class="reply-text">${escapeHtml(msg.replyTo.text)}</div>
                    </div>
                ` : ''}

                <!-- Текст и время -->
                <span id="text-${id}">${escapeHtml(msg.text)}</span>
                <span class="msg-time-inline">
                    ${msg.isEdited ? '<span style="opacity:0.7">✎</span> ' : ''}
                    ${timeStr}
                </span>
            </div>
            
            <!-- Реакции -->
            <div class="reactions-row" id="reacts-${id}" style="justify-content: ${isMe ? 'flex-end' : 'flex-start'}">
                ${renderReactionsHTML(id, msg.reactions)}
            </div>
        </div>

        <!-- Меню действий -->
        <div class="msg-actions">
            <div class="action-btn" onclick="window.triggerReply('${id}')" title="Ответить">${ICONS.reply}</div>
            <div class="action-btn" onclick="window.triggerReaction('${id}', '❤️')" title="Лайк">❤️</div>
            <div class="action-btn" onclick="window.triggerReaction('${id}', '😂')" title="Смешно">😂</div>
            
            ${isMe ? `
                <div class="action-btn" onclick="window.triggerEdit('${id}')" title="Изменить">${ICONS.edit}</div>
                <div class="action-btn delete" onclick="window.triggerDelete('${id}')" title="Удалить">${ICONS.trash}</div>
            ` : ''}
        </div>
    `;

    container.appendChild(row);
    
    // Обновляем ссылку на последнее сообщение
    lastRenderedMessage = { ...msg, id: id };
}

// --- ОБНОВЛЕНИЕ DOM ---
function updateMessageDOM(id, msg) {
    const textEl = document.getElementById(`text-${id}`);
    const reactsEl = document.getElementById(`reacts-${id}`);
    
    if (textEl) {
        textEl.innerText = msg.text;
        // Если стало отредактированным, добавим карандашик если его нет
        const bubble = textEl.closest('.msg-bubble');
        if (msg.isEdited && !bubble.innerHTML.includes('✎')) {
           bubble.querySelector('.msg-time-inline').insertAdjacentHTML('afterbegin', '<span style="opacity:0.7">✎</span> ');
        }
    }
    if (reactsEl) {
        reactsEl.innerHTML = renderReactionsHTML(id, msg.reactions);
    }
}

// Генерация HTML для реакций
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

// --- ОТПРАВКА ---
async function handleSend() {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text) return;

    // Сброс высоты поля
    input.style.height = 'auto';

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

    try {
        const msgData = {
            text: text,
            sender: state.userProfile.nickname,
            senderEmail: state.currentUser.email,
            senderAvatar: state.userProfile.avatar,
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

// --- ВСПОМОГАТЕЛЬНЫЕ ФУНКЦИИ ---

async function triggerReply(id) {
    const docSnap = await getDoc(doc(db, "messages", id));
    if (docSnap.exists()) {
        const msg = docSnap.data();
        replyingTo = { id: id, sender: msg.sender, text: msg.text };
        
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
        // Триггерим ресайз чтобы поле раскрылось
        input.dispatchEvent(new Event('input'));
        
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
            users = users.filter(uid => uid !== state.currentUser.uid);
        } else {
            users.push(state.currentUser.uid);
        }

        reacts[emoji] = users;
        await updateDoc(msgRef, { reactions: reacts });
    }
}

function cancelReply() {
    replyingTo = null;
    document.getElementById('reply-bar').style.display = 'none';
    document.getElementById('main-input-box').classList.remove('editing');
    editingMsgId = null;
    const input = document.getElementById('msg-input');
    input.value = "";
    input.style.height = 'auto';
}

function scrollToMessage(id) {
    const el = document.getElementById(`msg-row-${id}`);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Подсветка
        el.style.background = 'rgba(255,255,255,0.1)';
        setTimeout(() => el.style.background = '', 1000);
    } else {
        alert("Сообщение слишком старое и не загружено");
    }
}

function escapeHtml(text) {
    if(!text) return text;
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
