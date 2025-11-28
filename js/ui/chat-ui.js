import { ChatService } from "../services/database.js";

export class ChatUI {
    constructor(currentUser, profile) {
        this.currentUser = currentUser;
        this.profile = profile;
        this.container = document.getElementById("chat-messages-area");
        this.input = document.getElementById("msg-input");
        this.sendBtn = document.getElementById("send-btn");
        this.currentRoom = "general";
        
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

    loadRoom(roomName) {
        this.currentRoom = roomName;
        document.getElementById("room-title").innerText = "# " + roomName;
        this.container.innerHTML = ""; // Очистка
        
        // Отписываемся от старой комнаты если была
        if (this.unsubscribe) this.unsubscribe();

        // Подписываемся на новую
        this.unsubscribe = ChatService.subscribeToMessages(roomName, (messages) => {
            this.renderMessages(messages);
        });
    }

    renderMessages(messages) {
        this.container.innerHTML = "";
        
        messages.forEach(msg => {
            const isMe = msg.senderEmail === this.currentUser.email;
            
            // Создаем элементы через DOM API (безопаснее и чище)
            const row = document.createElement("div");
            row.className = `message-row ${isMe ? "me" : "them"}`;
            
            // HTML внутрянка
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
            room: this.currentRoom
        });

        this.input.value = "";
    }

    escapeHtml(text) {
        if (!text) return text;
        return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
}
