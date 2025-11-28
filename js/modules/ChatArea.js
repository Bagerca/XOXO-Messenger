import { ChatService } from "../services/database.js";

export class ChatArea {
    constructor(currentUser, profile) {
        this.currentUser = currentUser;
        this.profile = profile;
        this.container = document.getElementById("chat-messages-area");
        
        // Элементы редактора (отправка)
        this.richInput = document.getElementById("rich-input");
        this.sendBtn = document.getElementById("send-btn");
        this.fileInput = document.getElementById("editor-file-input");
        this.btnTriggerImg = document.getElementById("btn-trigger-img");
        
        // Тулбар
        this.toolbarBtns = document.querySelectorAll('.toolbar-btn[data-cmd]');
        this.btnSpoiler = document.getElementById("btn-spoiler");

        this.titleEl = document.getElementById("room-title");
        this.descEl = document.getElementById("room-desc");
        
        this.currentRoomId = "general";

        // НОВОЕ: Элементы контекстного меню и модалки
        this.ctxMenu = document.getElementById("msg-context-menu");
        this.editModal = document.getElementById("edit-msg-modal");
        this.editInput = document.getElementById("edit-msg-input");
        this.targetMsgData = null; // Данные сообщения, по которому кликнули

        this.setupListeners();
        this.initContextMenu(); // НОВОЕ: Инициализация меню
    }

    setupListeners() {
        // Отправка
        this.sendBtn.addEventListener("click", () => this.sendMessage());
        
        this.richInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Тулбар
        this.toolbarBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault(); 
                const cmd = btn.dataset.cmd;
                document.execCommand(cmd, false, null);
                this.richInput.focus();
                btn.classList.toggle('active'); 
            });
        });

        this.btnSpoiler.addEventListener('click', (e) => {
            e.preventDefault();
            this.wrapSelection('span', 'spoiler');
        });

        this.btnTriggerImg.addEventListener('click', () => this.fileInput.click());
        
        this.fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if(file) this.insertImageToEditor(file);
            this.fileInput.value = "";
        });

        // НОВОЕ: Слушатели модального окна редактирования
        document.getElementById('btn-cancel-edit-msg').addEventListener('click', () => {
            this.editModal.classList.remove('open');
            this.targetMsgData = null;
        });

        document.getElementById('btn-save-edit-msg').addEventListener('click', async () => {
            if (this.targetMsgData) {
                const newContent = this.editInput.innerHTML; // Берем HTML
                if (newContent.trim()) {
                    await ChatService.updateMessage(this.targetMsgData.id, { 
                        text: newContent,
                        isEdited: true 
                    });
                }
            }
            this.editModal.classList.remove('open');
        });
    }

    // НОВОЕ: Логика контекстного меню
    initContextMenu() {
        // Скрытие меню при клике
        document.addEventListener('click', () => this.hideContextMenu());
        document.addEventListener('contextmenu', (e) => {
            if (!e.target.closest('.message-row')) {
                this.hideContextMenu();
            }
        });

        // Обработчик ПКМ по сообщению
        this.container.addEventListener('contextmenu', (e) => {
            const row = e.target.closest('.message-row');
            if (!row) return;

            e.preventDefault();
            
            // Получаем данные из data-атрибутов (мы их добавим в renderMessages)
            const msgData = JSON.parse(decodeURIComponent(row.dataset.msg));
            this.showContextMenu(e, msgData);
        });

        // Обработчики кнопок меню
        document.getElementById('ctx-msg-copy').onclick = () => this.handleAction('copy');
        document.getElementById('ctx-msg-pin').onclick = () => this.handleAction('pin');
        document.getElementById('ctx-msg-edit').onclick = () => this.handleAction('edit');
        document.getElementById('ctx-msg-delete').onclick = () => this.handleAction('delete');
    }

    // НОВОЕ: Показать меню
    showContextMenu(e, msgData) {
        this.targetMsgData = msgData;
        const isMe = msgData.senderEmail === this.currentUser.email;

        // Показываем/скрываем пункты в зависимости от прав
        const editBtn = document.getElementById('ctx-msg-edit');
        const delBtn = document.getElementById('ctx-msg-delete');
        
        // Редактировать и удалить может только автор
        editBtn.style.display = isMe ? 'flex' : 'none';
        delBtn.style.display = isMe ? 'flex' : 'none';

        this.ctxMenu.style.display = 'flex';
        
        // Позиционирование (чтобы не улетало за экран)
        let x = e.clientX;
        let y = e.clientY;
        const menuW = this.ctxMenu.offsetWidth || 200;
        const menuH = this.ctxMenu.offsetHeight || 150;

        if (x + menuW > window.innerWidth) x -= menuW;
        if (y + menuH > window.innerHeight) y -= menuH;

        this.ctxMenu.style.left = `${x}px`;
        this.ctxMenu.style.top = `${y}px`;
        this.ctxMenu.classList.add('active');
    }

    hideContextMenu() {
        this.ctxMenu.style.display = 'none';
        this.ctxMenu.classList.remove('active');
    }

    // НОВОЕ: Обработка действий
    async handleAction(action) {
        if (!this.targetMsgData) return;
        const { id, text, isPinned } = this.targetMsgData;

        switch (action) {
            case 'copy':
                // Создаем временный элемент, чтобы скопировать чистый текст (без HTML тегов, если нужно)
                // Или копируем как есть. Для мессенджера лучше копировать текст.
                const tempDiv = document.createElement("div");
                tempDiv.innerHTML = text;
                const cleanText = tempDiv.textContent || tempDiv.innerText || "";
                navigator.clipboard.writeText(cleanText).then(() => {
                   // Можно добавить тост "Скопировано"
                });
                break;

            case 'delete':
                if (confirm("Удалить это сообщение?")) {
                    await ChatService.deleteMessage(id);
                }
                break;

            case 'pin':
                await ChatService.updateMessage(id, { isPinned: !isPinned });
                break;

            case 'edit':
                this.editInput.innerHTML = text; // Загружаем текущий HTML
                this.editModal.classList.add('open');
                this.editInput.focus();
                // Ставим курсор в конец (опционально)
                break;
        }
        this.hideContextMenu();
    }

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

    async insertImageToEditor(file) {
        if (file.size > 1024 * 1024) return alert("Файл > 1 МБ");
        const base64 = await this.toBase64(file);
        const imgHtml = `<img src="${base64}">`;
        this.richInput.focus();
        document.execCommand('insertHTML', false, imgHtml);
        document.execCommand('insertHTML', false, '<br>');
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
            
            // НОВОЕ: Сохраняем данные сообщения в DOM для контекстного меню
            // encodeURIComponent нужен, чтобы спецсимволы в тексте не сломали JSON
            row.dataset.msg = encodeURIComponent(JSON.stringify(msg));

            const safeContent = this.sanitizeHTML(msg.text);
            const time = new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            
            // НОВОЕ: Добавили класс 'pinned' если msg.isPinned
            // НОВОЕ: Добавили метку (изменено)
            const editedMark = msg.isEdited ? '<span style="font-size:9px; opacity:0.6; margin-left:4px;">(ред.)</span>' : '';

            const html = `
                ${!isMe ? `<div class="avatar" style="background-image: url('${msg.senderAvatar || "avatars/Ari LoL.png"}')"></div>` : ''}
                <div class="bubble-wrapper">
                    ${!isMe ? `<div class="name">${msg.sender}</div>` : ''}
                    <div class="bubble ${msg.isPinned ? 'pinned' : ''}">
                        <div class="content">${safeContent}</div>
                        <div class="time">
                            ${time} ${editedMark}
                        </div>
                    </div>
                </div>
            `;
            row.innerHTML = html;
            
            row.querySelectorAll('.spoiler').forEach(sp => {
                sp.addEventListener('click', () => sp.classList.toggle('revealed'));
            });

            row.querySelectorAll('img').forEach(img => {
                if(!img.closest('.avatar')) { 
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
        const content = this.richInput.innerHTML.trim();
        if (!content || content === '<br>') return;

        await ChatService.sendMessage({
            text: content, 
            type: 'rich', 
            sender: this.profile.nickname,
            senderEmail: this.currentUser.email,
            senderAvatar: this.profile.avatar,
            room: this.currentRoomId,
            isPinned: false, // НОВОЕ поле по умолчанию
            isEdited: false  // НОВОЕ поле по умолчанию
        });

        this.richInput.innerHTML = "";
    }

    sanitizeHTML(html) {
        const allowedTags = ['b', 'i', 'u', 'div', 'br', 'span', 'img', 'font', 'strike']; // добавил пару тегов
        const temp = document.createElement('div');
        temp.innerHTML = html;

        const clean = (node) => {
            for (let i = 0; i < node.childNodes.length; i++) {
                const child = node.childNodes[i];
                if (child.nodeType === 1) { 
                    const tagName = child.tagName.toLowerCase();
                    if (!allowedTags.includes(tagName)) {
                        child.remove();
                        i--;
                    } else {
                        const attrs = [...child.attributes];
                        for (const attr of attrs) {
                            if (!['src', 'class', 'style'].includes(attr.name)) {
                                child.removeAttribute(attr.name);
                            }
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
