import { ChatService } from "../services/database.js";

export class ChatUI {
    constructor(currentUser, profile) {
        this.currentUser = currentUser;
        this.profile = profile;
        this.container = document.getElementById("chat-messages-area");
        this.input = document.getElementById("msg-input");
        this.sendBtn = document.getElementById("send-btn");
        
        this.currentRoomId = "general";
        this.currentRoomName = "Общий холл";
        
        this.setupListeners();
    }

    setupListeners() {
        this.sendBtn.addEventListener("click", () => this.sendMessage());
        this.input.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
    }

    loadRoom(roomId, roomName) {
        this.currentRoomId = roomId;
        this.currentRoomName = roomName;
        
        // Анимация заголовка
        const titleEl = document.getElementById("room-title");
        titleEl.style.opacity = 0;
        setTimeout(() => {
            titleEl.innerText = "# " + roomName;
            titleEl.style.opacity = 1;
        }, 200);

        this.container.innerHTML = '<div style="text-align:center; padding:20px; color:#555;">Загрузка сообщений...</div>';
        
        if (this.unsubscribe) this.unsubscribe();

        this.unsubscribe = ChatService.subscribeToMessages(roomId, (messages) => {
            this.renderMessages(messages);
        });
    }

    renderMessages(messages) {
        this.container.innerHTML = "";
        
        if(messages.length === 0) {
            this.container.innerHTML = '<div style="text-align:center; padding:40px; color:#555;">Тишина...<br>Напиши первым!</div>';
            return;
        }

        messages.forEach(msg => {
            const isMe = msg.senderEmail === this.currentUser.email;
            
            const row = document.createElement("div");
            row.className = `message-row ${isMe ? "me" : "them"}`;
            
            // Формируем HTML сообщения
            const html = `
                ${!isMe ? `<div class="avatar" style="background-image: url('${msg.senderAvatar || "avatars/Ari LoL.png"}')"></div>` : ''}
                
                <div class="bubble-wrapper">
                    ${!isMe ? `<div class="name">${msg.sender}</div>` : ''}
                    <div class="bubble">
                        <div class="text">${this.escapeHtml(msg.text)}</div>
                        <div class="time">${new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                    </div>
                </div>
            `;
            
            row.innerHTML = html;
            this.container.appendChild(row);
        });

        // Скролл вниз
        this.container.scrollTop = this.container.scrollHeight;
    }

    async sendMessage() {
        const text = this.input.value.trim();
        if (!text) return;

        await ChatService.sendMessage({
            text,
            sender: this.profile.nickname,
            senderEmail: this.currentUser.email,
            senderAvatar: this.profile.avatar,
            room: this.currentRoomId
        });

        this.input.value = "";
    }

    escapeHtml(text) {
        if (!text) return text;
        return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
}
