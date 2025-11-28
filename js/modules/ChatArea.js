import { ChatService } from "../services/database.js";

export class ChatArea {
    constructor(currentUser, profile) {
        this.currentUser = currentUser;
        this.profile = profile;
        this.container = document.getElementById("chat-messages-area");
        
        // Элементы редактора
        this.richInput = document.getElementById("rich-input");
        this.sendBtn = document.getElementById("send-btn");
        this.fileInput = document.getElementById("editor-file-input");
        this.btnTriggerImg = document.getElementById("btn-trigger-img");
        this.toolbarBtns = document.querySelectorAll('.toolbar-btn[data-cmd]');
        this.btnSpoiler = document.getElementById("btn-spoiler");

        this.titleEl = document.getElementById("room-title");
        this.descEl = document.getElementById("room-desc");
        
        // Меню и Модалки (Новое)
        this.ctxMenu = document.getElementById('msg-context-menu');
        this.modalEdit = document.getElementById('edit-msg-modal');
        this.inputEdit = document.getElementById('edit-msg-input');
        
        this.currentRoomId = "general";
        this.targetMsgData = null; // Сообщение, на которое кликнули ПКМ

        this.setupListeners();
        this.initContextMenu();
    }

    setupListeners() {
        this.sendBtn.addEventListener("click", () => this.sendMessage());
        
        this.richInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Форматирование
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
    }

    // --- CONTEXT MENU LOGIC (NEW) ---
    initContextMenu() {
        // Скрытие меню
        document.addEventListener('click', () => this.hideContextMenu());
        document.addEventListener('contextmenu', (e) => {
            if (!e.target.closest('.bubble')) this.hideContextMenu();
        });

        // Кнопки меню
        document.getElementById('ctx-msg-copy').onclick = () => this.actionCopy();
        document.getElementById('ctx-msg-delete').onclick = () => this.actionDelete();
        document.getElementById('ctx-msg-pin').onclick = () => this.actionPin();
        document.getElementById('ctx-msg-edit').onclick = () => this.actionEdit();
        document.getElementById('ctx-msg-reply').onclick = () => alert("Функция ответа в разработке");

        // Модалка редактирования
        document.getElementById('btn-cancel-edit-msg').onclick = () => this.modalEdit.classList.remove('open');
        document.getElementById('btn-confirm-edit-msg').onclick = () => this.saveEditedMessage();
    }

    showContextMenu(e, msg) {
        e.preventDefault();
        this.targetMsgData = msg;

        const isOwner = msg.senderEmail === this.currentUser.email;
        
        // Показываем/скрываем кнопки владельца
        const setDisplay = (id, show) => document.getElementById(id).style.display = show ? 'flex' : 'none';
        
        setDisplay('ctx-msg-edit', isOwner);
        setDisplay('ctx-msg-delete', isOwner);
        
        // Позиционирование
        this.ctxMenu.style.display = 'flex';
        let x = e.clientX;
        let y = e.clientY;
        
        const menuWidth = this.ctxMenu.offsetWidth;
        const menuHeight = this.ctxMenu.offsetHeight;
        
        if (x + menuWidth > window.innerWidth) x -= menuWidth;
        if (y + menuHeight > window.innerHeight) y -= menuHeight;

        this.ctxMenu.style.left = `${x}px`;
        this.ctxMenu.style.top = `${y}px`;
        this.ctxMenu.classList.add('active');
    }

    hideContextMenu() {
        this.ctxMenu.style.display = 'none';
        this.ctxMenu.classList.remove('active');
    }

    // Действия меню
    actionCopy() {
        if (!this.targetMsgData) return;
        // Копируем чистый текст (без HTML тегов) или HTML по желанию
        // Создаем временный элемент чтобы получить innerText
        const temp = document.createElement("div");
        temp.innerHTML = this.targetMsgData.text;
        navigator.clipboard.writeText(temp.innerText);
    }

    async actionDelete() {
        if (!this.targetMsgData) return;
        if (confirm("Удалить это сообщение?")) {
            await ChatService.deleteMessage(this.targetMsgData.id);
        }
    }

    async actionPin() {
        if (!this.targetMsgData) return;
        // Инвертируем состояние
        const newState = !this.targetMsgData.isPinned;
        await ChatService.updateMessage(this.targetMsgData.id, { isPinned: newState });
    }

    actionEdit() {
        if (!this.targetMsgData) return;
        this.inputEdit.innerHTML = this.targetMsgData.text; // Загружаем текущий HTML
        this.modalEdit.classList.add('open');
    }

    async saveEditedMessage() {
        if (!this.targetMsgData) return;
        const newText = this.inputEdit.innerHTML.trim();
        
        if (newText && newText !== this.targetMsgData.text) {
            await ChatService.updateMessage(this.targetMsgData.id, {
                text: newText,
                isEdited: true
            });
        }
        this.modalEdit.classList.remove('open');
    }

    // --- STANDARD LOGIC ---

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
            
            // Если закреплено
            if (msg.isPinned) row.classList.add('pinned');

            const safeContent = this.sanitizeHTML(msg.text);
            
            // Метка "изменено"
            const editedHtml = msg.isEdited ? `<span class="edited-label">(изм.)</span>` : '';
            // Иконка пина
            const pinIcon = msg.isPinned ? `<div class="pin-icon">📌</div>` : '';

            const html = `
                ${!isMe ? `<div class="avatar" style="background-image: url('${msg.senderAvatar || "avatars/Ari LoL.png"}')"></div>` : ''}
                <div class="bubble-wrapper">
                    ${!isMe ? `<div class="name">${msg.sender}</div>` : ''}
                    <div class="bubble">
                        ${pinIcon}
                        <div class="content">${safeContent}</div>
                        <div class="time">
                            ${new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            ${editedHtml}
                        </div>
                    </div>
                </div>
            `;
            row.innerHTML = html;
            
            // Спойлеры и картинки
            row.querySelectorAll('.spoiler').forEach(sp => sp.addEventListener('click', () => sp.classList.toggle('revealed')));
            row.querySelectorAll('img').forEach(img => {
                if(!img.closest('.avatar')) {
                    img.onclick = () => { const w = window.open(""); w.document.write(`<img src="${img.src}" style="max-width:100%">`); };
                }
            });

            // ПРАВЫЙ КЛИК ПО ПУЗЫРЮ (BUBBLE)
            const bubble = row.querySelector('.bubble');
            bubble.addEventListener('contextmenu', (e) => {
                this.showContextMenu(e, msg);
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
            isPinned: false, // Default
            isEdited: false  // Default
        });

        this.richInput.innerHTML = "";
    }

    sanitizeHTML(html) {
        const allowedTags = ['b', 'i', 'u', 'div', 'br', 'span', 'img'];
        const temp = document.createElement('div');
        temp.innerHTML = html;
        const clean = (node) => {
            for (let i = 0; i < node.childNodes.length; i++) {
                const child = node.childNodes[i];
                if (child.nodeType === 1) { 
                    const tagName = child.tagName.toLowerCase();
                    if (!allowedTags.includes(tagName)) { child.remove(); i--; } 
                    else {
                        const attrs = [...child.attributes];
                        for (const attr of attrs) {
                            if (!['src', 'class', 'style'].includes(attr.name)) child.removeAttribute(attr.name);
                            if (attr.name === 'src' && attr.value.startsWith('javascript:')) child.removeAttribute('src');
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
