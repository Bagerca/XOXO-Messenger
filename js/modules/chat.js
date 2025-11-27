import { state } from './state.js';
import { db } from '../../firebase-config.js';
import { 
    collection, addDoc, query, where, orderBy, onSnapshot, 
    doc, deleteDoc, updateDoc, getDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

let unsubscribeMessages = null;
let replyingTo = null;
let editingMsgId = null;

// --- ИКОНКИ (SVG) ---
const ICONS = {
    reply: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>`,
    edit: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`,
    trash: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>`,
    forward: `<svg viewBox="0 0 24 24" fill="currentColor"><path d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>`
};

export function initChat() {
    const sendBtn = document.getElementById('send-btn');
    const input = document.getElementById('msg-input');
    sendBtn.addEventListener('click', handleSend);
    input.addEventListener('keypress', (e) => { if (e.key === 'Enter') handleSend(); });
    document.getElementById('cancel-reply').addEventListener('click', cancelReply);
    
    // Global hooks
    window.triggerReply = triggerReply;
    window.triggerEdit = triggerEdit;
    window.triggerDelete = triggerDelete;
    window.triggerReaction = triggerReaction;
    window.triggerForward = triggerForward;
}

export function loadMessages(room) {
    const chatWindow = document.getElementById('chat-window');
    chatWindow.innerHTML = ""; 
    if (unsubscribeMessages) unsubscribeMessages();

    const q = query(collection(db, "messages"), where("room", "==", room), orderBy("createdAt"));

    unsubscribeMessages = onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            const msgData = change.doc.data();
            const msgId = change.doc.id;
            if (change.type === "added") appendMessage(msgId, msgData, chatWindow);
            if (change.type === "modified") updateMessageDOM(msgId, msgData);
            if (change.type === "removed") document.getElementById(`msg-${msgId}`)?.remove();
        });
        chatWindow.scrollTop = chatWindow.scrollHeight;
    });
}

function appendMessage(id, msg, container) {
    const isMe = msg.senderEmail === state.currentUser.email;
    const date = new Date(msg.createdAt);
    const time = `${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;
    const avatarUrl = msg.senderAvatar || state.localAvatars[0];

    const div = document.createElement('div');
    div.id = `msg-${id}`;
    div.className = `message ${isMe ? 'my-message' : 'other-message'}`;

    div.innerHTML = `
        <div class="msg-avatar avatar ${msg.senderFrame || ''} ${msg.senderEffect || ''}" 
             style="background-image: url('${avatarUrl}')"></div>
        
        <div class="msg-content">
            
            <div class="msg-header">
                <span class="msg-sender">${escapeHtml(msg.sender)}</span>
                <span class="msg-time">${time}</span>
                ${msg.isEdited ? '<span class="msg-edited">(изм.)</span>' : ''}
            </div>

            ${msg.replyTo ? `
                <div class="reply-context">
                    <span class="reply-name">${escapeHtml(msg.replyTo.sender)}</span>
                    <span class="reply-text-preview">${escapeHtml(msg.replyTo.text)}</span>
                </div>
            ` : ''}

            <div class="msg-text" id="text-${id}">${escapeHtml(msg.text)}</div>
            
            <div class="reactions-row" id="reacts-${id}">
                ${renderReactionsHTML(id, msg.reactions)}
            </div>
        </div>

        <!-- Toolbar -->
        <div class="msg-actions">
            <div class="action-btn" onclick="window.triggerReply('${id}')" title="Ответить">${ICONS.reply}</div>
            <div class="action-btn" onclick="window.triggerReaction('${id}', '❤️')" title="Лайк">❤️</div>
            <div class="action-btn" onclick="window.triggerReaction('${id}', '🔥')" title="Огонь">🔥</div>
            
            ${isMe ? `
                <div class="action-btn" onclick="window.triggerEdit('${id}')" title="Изменить">${ICONS.edit}</div>
                <div class="action-btn delete" onclick="window.triggerDelete('${id}')" title="Удалить">${ICONS.trash}</div>
            ` : ''}
             <div class="action-btn" onclick="window.triggerForward('${id}')" title="Переслать">${ICONS.forward}</div>
        </div>
    `;
    container.appendChild(div);
}

function updateMessageDOM(id, msg) {
    const textEl = document.getElementById(`text-${id}`);
    const reactsEl = document.getElementById(`reacts-${id}`);
    
    if (textEl) {
        textEl.innerText = msg.text;
        if(msg.isEdited && !textEl.parentNode.querySelector('.msg-edited')) {
            textEl.parentNode.querySelector('.msg-header').insertAdjacentHTML('beforeend', '<span class="msg-edited">(изм.)</span>');
        }
    }
    if (reactsEl) reactsEl.innerHTML = renderReactionsHTML(id, msg.reactions);
}

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
                    <span style="font-weight:bold; opacity:0.8;">${users.length}</span>
                </div>
            `;
        }
    }
    return html;
}

// LOGIC
async function handleSend() {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text) return;

    if (editingMsgId) {
        await updateDoc(doc(db, "messages", editingMsgId), { text: text, isEdited: true });
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
    } catch (e) { console.error(e); }
}

async function triggerReply(id) {
    const docSnap = await getDoc(doc(db, "messages", id));
    if (docSnap.exists()) {
        const msg = docSnap.data();
        replyingTo = { id, sender: msg.sender, text: msg.text };
        
        const bar = document.getElementById('reply-bar');
        bar.style.display = 'flex';
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
    if(confirm("Удалить сообщение?")) await deleteDoc(doc(db, "messages", id));
}

async function triggerReaction(id, emoji) {
    const msgRef = doc(db, "messages", id);
    const docSnap = await getDoc(msgRef);
    if(docSnap.exists()) {
        const data = docSnap.data();
        let reacts = data.reactions || {};
        let users = reacts[emoji] || [];
        if(users.includes(state.currentUser.uid)) users = users.filter(uid => uid !== state.currentUser.uid);
        else users.push(state.currentUser.uid);
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
    document.getElementById('main-input-box').classList.remove('editing');
    editingMsgId = null;
}

function escapeHtml(text) {
    if(!text) return text;
    return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
