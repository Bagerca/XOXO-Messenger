import { ChatService } from "../services/database.js";

export class ChatArea {
    constructor(currentUser, profile) {
        this.currentUser = currentUser;
        this.profile = profile;
        this.container = document.getElementById("chat-messages-area");
        this.input = document.getElementById("msg-input");
        this.sendBtn = document.getElementById("send-btn");
        
        // Элементы для фото
        this.fileInput = document.getElementById("file-input");
        this.attachBtn = document.getElementById("btn-attach");

        this.titleEl = document.getElementById("room-title");
        this.descEl = document.getElementById("room-desc");
        
        this.currentRoomId = "general";
        
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

        // Клик по скрепке
        if(this.attachBtn && this.fileInput) {
            this.attachBtn.addEventListener("click", () => {
                this.fileInput.click();
            });

            // Выбор файла
            this.fileInput.addEventListener("change", (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.handleFileUpload(file);
                }
                this.fileInput.value = ""; 
            });
        }
    }

    loadRoom(roomId, roomName, desc = "") {
        this.currentRoomId = roomId;
        
        this.titleEl.style.opacity = 0;
        setTimeout(() => {
            this.titleEl.innerText = roomId === this.currentUser.uid ? "Избранное" : "# " + roomName;
            this.descEl.innerText = desc;
            this.titleEl.style.opacity = 1;
        }, 200);

        this.container.innerHTML = '<div style="text-align:center; padding:20px; color:#555;">Загрузка...</div>';
        
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
            
            // Рендер контента: текст или картинка
            let messageContent = '';
            if (msg.type === 'image') {
                messageContent = `<img src="${msg.text}" class="chat-image" onclick="window.open(this.src)" alt="image">`;
            } else {
                messageContent = this.escapeHtml(msg.text);
            }

            const html = `
                ${!isMe ? `<div class="avatar" style="background-image: url('${msg.senderAvatar || "avatars/Ari LoL.png"}')"></div>` : ''}
                <div class="bubble-wrapper">
                    ${!isMe ? `<div class="name">${msg.sender}</div>` : ''}
                    <div class="bubble">
                        <div class="content">${messageContent}</div>
                        <div class="time">${new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                    </div>
                </div>
            `;
            row.innerHTML = html;
            this.container.appendChild(row);
        });

        this.container.scrollTop = this.container.scrollHeight;
    }

    async sendMessage() {
        const text = this.input.value.trim();
        if (!text) return;

        await ChatService.sendMessage({
            text: text,
            type: 'text',
            sender: this.profile.nickname,
            senderEmail: this.currentUser.email,
            senderAvatar: this.profile.avatar,
            room: this.currentRoomId
        });

        this.input.value = "";
    }

    // Обработка файла (Base64)
    async handleFileUpload(file) {
        // Проверка размера (1 МБ)
        if (file.size > 1024 * 1024) {
            alert("Файл слишком большой! Максимум 1 МБ.");
            return;
        }

        const base64 = await this.toBase64(file);
        
        await ChatService.sendMessage({
            text: base64, // Код картинки
            type: 'image',
            sender: this.profile.nickname,
            senderEmail: this.currentUser.email,
            senderAvatar: this.profile.avatar,
            room: this.currentRoomId
        });
    }

    toBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    }

    escapeHtml(text) {
        if (!text) return text;
        return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }
}
