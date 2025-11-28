import { ChatService } from "../services/database.js";

export class ChatArea {
    constructor(currentUser, profile) {
        this.currentUser = currentUser;
        this.profile = profile;
        this.container = document.getElementById("chat-messages-area");
        
        // Новые элементы редактора
        this.richInput = document.getElementById("rich-input");
        this.sendBtn = document.getElementById("send-btn");
        this.fileInput = document.getElementById("editor-file-input");
        this.btnTriggerImg = document.getElementById("btn-trigger-img");
        
        // Кнопки тулбара
        this.toolbarBtns = document.querySelectorAll('.toolbar-btn[data-cmd]');
        this.btnSpoiler = document.getElementById("btn-spoiler");

        this.titleEl = document.getElementById("room-title");
        this.descEl = document.getElementById("room-desc");
        
        this.currentRoomId = "general";
        
        this.setupListeners();
    }

    setupListeners() {
        // Отправка
        this.sendBtn.addEventListener("click", () => this.sendMessage());
        
        // Enter для отправки (Shift+Enter для переноса)
        this.richInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // 1. Форматирование текста (B, I, Align)
        this.toolbarBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault(); // Чтобы не терять фокус
                const cmd = btn.dataset.cmd;
                document.execCommand(cmd, false, null);
                this.richInput.focus();
                btn.classList.toggle('active'); // Визуально
            });
        });

        // 2. Спойлер (Оборачиваем выделение в span.spoiler)
        this.btnSpoiler.addEventListener('click', (e) => {
            e.preventDefault();
            this.wrapSelection('span', 'spoiler');
        });

        // 3. Вставка картинки
        this.btnTriggerImg.addEventListener('click', () => this.fileInput.click());
        
        this.fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if(file) this.insertImageToEditor(file);
            this.fileInput.value = "";
        });
    }

    // Вспомогательная функция для оборачивания (Спойлер)
    wrapSelection(tag, className) {
        const selection = window.getSelection();
        if (!selection.rangeCount) return;
        
        const range = selection.getRangeAt(0);
        const selectedText = range.toString();
        
        if (selectedText.length > 0) {
            const span = document.createElement(tag);
            if(className) span.className = className;
            span.textContent = selectedText;
            
            range.deleteContents();
            range.insertNode(span);
        }
    }

    // Вставка картинки в редактор (курсор)
    async insertImageToEditor(file) {
        if (file.size > 1024 * 1024) return alert("Файл > 1 МБ");
        
        const base64 = await this.toBase64(file);
        
        // Используем execCommand для вставки HTML в позицию курсора
        // Это самый надежный способ вставить именно туда, где каретка
        const imgHtml = `<img src="${base64}">`;
        this.richInput.focus();
        document.execCommand('insertHTML', false, imgHtml);
        document.execCommand('insertHTML', false, '<br>'); // Перенос строки после фото
    }

    toBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
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
        this.unsubscribe = ChatService.subscribeToMessages(roomId, (messages) => this.renderMessages(messages));
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
            
            // Санитизация (Очистка) HTML, но разрешаем наши теги
            const safeContent = this.sanitizeHTML(msg.text);

            const html = `
                ${!isMe ? `<div class="avatar" style="background-image: url('${msg.senderAvatar || "avatars/Ari LoL.png"}')"></div>` : ''}
                <div class="bubble-wrapper">
                    ${!isMe ? `<div class="name">${msg.sender}</div>` : ''}
                    <div class="bubble">
                        <div class="content">${safeContent}</div>
                        <div class="time">${new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                    </div>
                </div>
            `;
            row.innerHTML = html;
            
            // Добавляем обработчик клика на спойлеры
            row.querySelectorAll('.spoiler').forEach(sp => {
                sp.addEventListener('click', () => sp.classList.toggle('revealed'));
            });

            // Обработчик клика на картинки (открыть в полном размере)
            row.querySelectorAll('img').forEach(img => {
                if(!img.closest('.avatar')) { // Не аватарки
                    img.onclick = () => {
                        const w = window.open("");
                        w.document.write(`<img src="${img.src}" style="max-width:100%">`);
                    };
                }
            });

            this.container.appendChild(row);
        });
        this.container.scrollTop = this.container.scrollHeight;
    }

    async sendMessage() {
        // Берем innerHTML, так как там теги <b>, <img> и т.д.
        const content = this.richInput.innerHTML.trim();
        
        // Проверка на пустоту (с учетом HTML тегов)
        if (!content || content === '<br>') return;

        await ChatService.sendMessage({
            text: content, // Отправляем HTML
            type: 'rich',  // Тип контента
            sender: this.profile.nickname,
            senderEmail: this.currentUser.email,
            senderAvatar: this.profile.avatar,
            room: this.currentRoomId
        });

        this.richInput.innerHTML = "";
    }

    // Простая защита от XSS, но разрешаем стили
    sanitizeHTML(html) {
        // Разрешаем только определенные теги
        const allowedTags = ['b', 'i', 'u', 'div', 'br', 'span', 'img'];
        
        // Создаем временный элемент
        const temp = document.createElement('div');
        temp.innerHTML = html;

        // Рекурсивная очистка
        const clean = (node) => {
            for (let i = 0; i < node.childNodes.length; i++) {
                const child = node.childNodes[i];
                if (child.nodeType === 1) { // Element
                    const tagName = child.tagName.toLowerCase();
                    if (!allowedTags.includes(tagName)) {
                        // Если тег запрещен, заменяем его на текст или удаляем
                        // В данном случае просто удаляем скрипты и прочее
                        child.remove();
                        i--;
                    } else {
                        // Очищаем атрибуты (разрешаем src и class)
                        const attrs = [...child.attributes];
                        for (const attr of attrs) {
                            if (!['src', 'class', 'style'].includes(attr.name)) {
                                child.removeAttribute(attr.name);
                            }
                            // Анти-скрипт в src
                            if (attr.name === 'src' && attr.value.startsWith('javascript:')) {
                                child.removeAttribute('src');
                            }
                        }
                        clean(child);
                    }
                }
            }
        };
        
        clean(temp);
        return temp.innerHTML;
    }
}
