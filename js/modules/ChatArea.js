import { ChatService } from "../services/database.js";

export class ChatArea {
    constructor(currentUser, profile) {
        this.currentUser = currentUser;
        this.profile = profile;
        this.container = document.getElementById("chat-messages-area");
        
        // Editor
        this.richInput = document.getElementById("rich-input");
        this.sendBtn = document.getElementById("send-btn");
        this.fileInput = document.getElementById("editor-file-input");
        this.btnTriggerImg = document.getElementById("btn-trigger-img");
        this.toolbarBtns = document.querySelectorAll('.toolbar-btn[data-cmd]');
        this.btnSpoiler = document.getElementById("btn-spoiler");

        this.titleEl = document.getElementById("room-title");
        this.descEl = document.getElementById("room-desc");
        
        // Pinned
        this.pinnedBar = document.getElementById("pinned-messages-bar");
        this.pinnedPreview = document.getElementById("pinned-msg-preview");
        this.pinnedContentBox = document.getElementById("pinned-content-text");
        this.btnUnpinCurrent = document.getElementById("btn-unpin-current");
        
        // Context Menu & Modals
        this.ctxMenu = document.getElementById("msg-context-menu");
        this.editModal = document.getElementById("edit-msg-modal");
        this.editInput = document.getElementById("edit-msg-input");
        this.forwardModal = document.getElementById("forward-modal");
        this.forwardList = document.getElementById("forward-list");
        
        // LIGHTBOX ELEMENTS
        this.lb = document.getElementById("media-lightbox");
        this.lbImg = document.getElementById("lb-img");
        this.lbSender = document.getElementById("lb-sender");
        this.lbTime = document.getElementById("lb-time");
        this.lbCaption = document.getElementById("lb-caption");
        
        this.targetMsgData = null;
        this.currentRoomId = "general";
        
        // Gallery State
        this.galleryImages = []; 
        this.currentImageIndex = 0;

        this.setupListeners();
        this.initContextMenu();
        this.initLightbox(); 
    }

    setupListeners() {
        this.sendBtn.addEventListener("click", () => this.sendMessage());
        this.richInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); this.sendMessage(); }
        });
        this.toolbarBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault(); 
                document.execCommand(btn.dataset.cmd, false, null);
                this.richInput.focus();
                btn.classList.toggle('active'); 
            });
        });
        this.btnSpoiler.addEventListener('click', (e) => { e.preventDefault(); this.wrapSelection('span', 'spoiler'); });
        this.btnTriggerImg.addEventListener('click', () => this.fileInput.click());
        this.fileInput.addEventListener('change', (e) => {
            if(e.target.files[0]) this.insertImageToEditor(e.target.files[0]);
            this.fileInput.value = "";
        });

        document.getElementById('btn-cancel-edit-msg').addEventListener('click', () => this.editModal.classList.remove('open'));
        document.getElementById('btn-save-edit-msg').addEventListener('click', () => this.saveEditedMessage());
        document.getElementById('btn-cancel-forward').addEventListener('click', () => this.forwardModal.classList.remove('open'));
        
        this.btnUnpinCurrent.addEventListener('click', async (e) => {
            e.stopPropagation();
            if(this.currentPinnedMsgId) {
                await ChatService.updateMessage(this.currentPinnedMsgId, { isPinned: false });
            }
        });
        
        this.pinnedContentBox.addEventListener('click', () => {
            if(this.currentPinnedMsgId) {
                const el = document.getElementById(`msg-${this.currentPinnedMsgId}`);
                if(el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    el.classList.add('highlight-anim');
                    setTimeout(() => el.classList.remove('highlight-anim'), 2000);
                }
            }
        });

        // НОВОЕ: Слушаем событие от RightSidebar
        document.addEventListener('request-lightbox', (e) => {
            const src = e.detail.src;
            // Ищем эту картинку в текущей галерее чата
            const idx = this.galleryImages.findIndex(img => img.src === src);
            if (idx !== -1) {
                this.openLightbox(idx);
            } else {
                // Если вдруг картинки нет в галерее (редкий случай рассинхрона), 
                // просто ничего не делаем или можно открыть одиночный просмотр (но лучше пока так)
                console.warn("Image not found in current chat gallery context");
            }
        });
    }

    // --- LIGHTBOX LOGIC ---
    initLightbox() {
        document.getElementById('lb-close').onclick = () => this.closeLightbox();
        document.querySelector('.lightbox-overlay').onclick = () => this.closeLightbox();
        document.getElementById('lb-prev').onclick = (e) => { e.stopPropagation(); this.changeImage(-1); };
        document.getElementById('lb-next').onclick = (e) => { e.stopPropagation(); this.changeImage(1); };

        document.addEventListener('keydown', (e) => {
            if (!this.lb.classList.contains('active')) return;
            if (e.key === "Escape") this.closeLightbox();
            if (e.key === "ArrowLeft") this.changeImage(-1);
            if (e.key === "ArrowRight") this.changeImage(1);
        });
    }

    openLightbox(index) {
        if(index < 0 || index >= this.galleryImages.length) return;
        this.currentImageIndex = index;
        this.updateLightboxUI();
        this.lb.classList.add('active');
    }

    closeLightbox() {
        this.lb.classList.remove('active');
    }

    changeImage(step) {
        let newIndex = this.currentImageIndex + step;
        if (newIndex < 0) newIndex = this.galleryImages.length - 1;
        if (newIndex >= this.galleryImages.length) newIndex = 0;
        this.currentImageIndex = newIndex;
        this.updateLightboxUI();
    }

    updateLightboxUI() {
        const data = this.galleryImages[this.currentImageIndex];
        if(!data) return;

        this.lbImg.style.opacity = 0.5;
        setTimeout(() => this.lbImg.style.opacity = 1, 150);

        this.lbImg.src = data.src;
        this.lbSender.innerText = data.sender;
        this.lbTime.innerText = new Date(data.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        
        const temp = document.createElement('div');
        temp.innerHTML = data.rawText;
        temp.querySelectorAll('img').forEach(img => img.remove());
        this.lbCaption.innerText = temp.innerText.trim() || "";
    }

    // --- RENDERING ---
    loadRoom(roomId, roomName, desc = "") {
        this.currentRoomId = roomId;
        this.currentPinnedMsgId = null;
        this.pinnedBar.style.display = 'none';

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
        this.galleryImages = [];

        const pinnedMsg = [...messages].reverse().find(m => m.isPinned);
        if (pinnedMsg) {
            this.currentPinnedMsgId = pinnedMsg.id;
            this.pinnedBar.style.display = 'flex';
            const temp = document.createElement('div');
            temp.innerHTML = pinnedMsg.text;
            this.pinnedPreview.innerText = temp.innerText.substring(0, 50) + (temp.innerText.length > 50 ? '...' : '');
        } else {
            this.pinnedBar.style.display = 'none';
            this.currentPinnedMsgId = null;
        }

        if(messages.length === 0) {
            this.container.innerHTML = '<div style="text-align:center; padding:40px; color:#555;">Тишина...<br>Напиши первым!</div>';
            return;
        }

        messages.forEach(msg => {
            const isMe = msg.senderEmail === this.currentUser.email;
            const row = document.createElement("div");
            row.className = `message-row ${isMe ? "me" : "them"}`;
            row.id = `msg-${msg.id}`;
            row.dataset.msg = encodeURIComponent(JSON.stringify(msg));

            const formattedContent = this.formatMessage(msg.text, msg);

            const time = new Date(msg.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
            const editedMark = msg.isEdited ? '<span style="font-size:9px; opacity:0.6;">(ред.)</span>' : '';
            const fwdMark = msg.type === 'forward' ? '<div style="font-size:10px; color:#aaa; margin-bottom:2px;">↩ Переслано</div>' : '';

            const html = `
                ${!isMe ? `<div class="avatar" style="background-image: url('${msg.senderAvatar || "avatars/Ari LoL.png"}')"></div>` : ''}
                <div class="bubble-wrapper">
                    ${!isMe ? `<div class="name">${msg.sender}</div>` : ''}
                    <div class="bubble">
                        ${fwdMark}
                        <div class="content">${formattedContent}</div>
                        <div class="time">${time} ${editedMark}</div>
                    </div>
                </div>
            `;
            row.innerHTML = html;
            
            row.querySelectorAll('.spoiler').forEach(sp => sp.addEventListener('click', () => sp.classList.toggle('revealed')));
            
            row.querySelectorAll('.media-item').forEach(item => {
                item.onclick = (e) => {
                    e.stopPropagation();
                    const idx = parseInt(item.getAttribute('data-idx'));
                    this.openLightbox(idx);
                };
            });

            row.querySelectorAll('img').forEach(img => {
                if(!img.closest('.avatar') && !img.closest('.media-item')) {
                    const idx = this.galleryImages.findIndex(x => x.src === img.src);
                    if(idx !== -1) img.onclick = () => this.openLightbox(idx);
                }
            });

            this.container.appendChild(row);
        });
        
        this.container.scrollTop = this.container.scrollHeight;
    }

    formatMessage(rawHtml, msgObj) {
        const temp = document.createElement('div');
        temp.innerHTML = rawHtml;

        const nodes = Array.from(temp.childNodes);
        let resultHtml = '';
        let imageGroup = []; 

        const flushImages = () => {
            if (imageGroup.length === 0) return;

            const startIndex = this.galleryImages.length;
            
            imageGroup.forEach(img => {
                this.galleryImages.push({
                    src: img.src,
                    sender: msgObj.sender,
                    time: msgObj.createdAt,
                    rawText: temp.innerText
                });
            });

            let gridHtml = `<div class="media-grid" data-count="${imageGroup.length}">`;
            imageGroup.forEach((img, i) => {
                gridHtml += `<div class="media-item" data-idx="${startIndex + i}" style="background-image: url('${img.src}')"><img src="${img.src}"></div>`;
            });
            gridHtml += `</div>`;
            
            resultHtml += gridHtml;
            imageGroup = []; 
        };

        nodes.forEach(node => {
            if (node.nodeName === 'IMG') {
                imageGroup.push(node);
            } 
            else {
                const isWhitespace = node.nodeType === 3 && !node.textContent.trim();
                const isBr = node.nodeName === 'BR';

                if ((isWhitespace || isBr) && imageGroup.length > 0) {
                    return; 
                }

                flushImages();

                if (node.nodeType === 3) {
                    if (node.textContent.trim()) {
                        resultHtml += `<div class="text-part">${this.sanitizeHTML(node.textContent)}</div>`;
                    }
                } else {
                    resultHtml += node.outerHTML;
                }
            }
        });

        flushImages();
        return resultHtml;
    }

    // --- CONTEXT MENU & ACTIONS ---
    initContextMenu() {
        document.addEventListener('click', () => this.hideContextMenu());
        document.addEventListener('contextmenu', (e) => {
            if (!e.target.closest('.message-row')) this.hideContextMenu();
        });
        this.container.addEventListener('contextmenu', (e) => {
            const row = e.target.closest('.message-row');
            if (!row) return;
            e.preventDefault();
            const msgData = JSON.parse(decodeURIComponent(row.dataset.msg));
            this.showContextMenu(e, msgData);
        });
        document.getElementById('ctx-msg-copy').onclick = () => this.handleAction('copy');
        document.getElementById('ctx-msg-pin').onclick = () => this.handleAction('pin');
        document.getElementById('ctx-msg-edit').onclick = () => this.handleAction('edit');
        document.getElementById('ctx-msg-delete').onclick = () => this.handleAction('delete');
        document.getElementById('ctx-msg-forward').onclick = () => this.handleAction('forward');
        document.getElementById('ctx-msg-reply').onclick = () => this.handleAction('reply');
    }

    showContextMenu(e, msgData) {
        this.targetMsgData = msgData;
        const isMe = msgData.senderEmail === this.currentUser.email;
        const setDisplay = (id, show) => document.getElementById(id).style.display = show ? 'flex' : 'none';
        setDisplay('ctx-msg-edit', isMe);
        setDisplay('ctx-msg-delete', isMe);
        const pinText = msgData.isPinned ? 'Открепить' : 'Закрепить';
        document.getElementById('ctx-msg-pin').lastChild.textContent = ` ${pinText}`;
        this.ctxMenu.style.display = 'flex';
        let x = e.clientX, y = e.clientY;
        const menuW = this.ctxMenu.offsetWidth || 180;
        const menuH = this.ctxMenu.offsetHeight || 200;
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

    async handleAction(action) {
        if (!this.targetMsgData) return;
        const { id, text, isPinned } = this.targetMsgData;
        switch (action) {
            case 'copy':
                const tempDiv = document.createElement("div");
                tempDiv.innerHTML = text;
                navigator.clipboard.writeText(tempDiv.innerText);
                break;
            case 'delete':
                if (confirm("Удалить сообщение?")) await ChatService.deleteMessage(id);
                break;
            case 'pin':
                await ChatService.updateMessage(id, { isPinned: !isPinned });
                break;
            case 'edit':
                this.editInput.innerHTML = text;
                this.editModal.classList.add('open');
                break;
            case 'forward':
                this.openForwardModal(text);
                break;
            case 'reply':
                const replyHTML = `<blockquote><div style="font-size:10px; opacity:0.7; border-left: 2px solid #8A2BE2; padding-left:5px; margin-bottom:5px;">${this.targetMsgData.sender}:<br>${text.substring(0, 50)}...</div></blockquote><br>`;
                this.richInput.focus();
                document.execCommand('insertHTML', false, replyHTML);
                break;
        }
        this.hideContextMenu();
    }
    
    async openForwardModal(msgContent) {
        this.forwardModal.classList.add('open');
        this.forwardList.innerHTML = '<div style="text-align:center; color:#777;">Загрузка чатов...</div>';
        const rooms = await ChatService.getMyRooms(this.currentUser.uid);
        this.forwardList.innerHTML = '';
        if(rooms.length === 0) {
             this.forwardList.innerHTML = '<div style="text-align:center;">Нет доступных чатов</div>';
             return;
        }
        rooms.forEach(room => {
            if(room.id === this.currentRoomId) return;
            const div = document.createElement('div');
            div.className = 'forward-item';
            div.innerHTML = `<div class="forward-avatar" style="background-image:url('${room.avatar || 'logo.svg'}')"></div> <span>${room.name}</span>`;
            div.onclick = async () => {
                if(confirm(`Переслать в "${room.name}"?`)) {
                    await ChatService.sendMessage({
                        text: msgContent,
                        type: 'forward',
                        sender: this.profile.nickname,
                        senderEmail: this.currentUser.email,
                        senderAvatar: this.profile.avatar,
                        room: room.id,
                        isPinned: false,
                        isEdited: false
                    });
                    this.forwardModal.classList.remove('open');
                    alert("Отправлено!");
                }
            };
            this.forwardList.appendChild(div);
        });
    }

    async saveEditedMessage() {
        if (this.targetMsgData) {
            const newContent = this.editInput.innerHTML;
            if (newContent.trim()) {
                await ChatService.updateMessage(this.targetMsgData.id, { text: newContent, isEdited: true });
            }
        }
        this.editModal.classList.remove('open');
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
            isPinned: false, 
            isEdited: false  
        });

        this.richInput.innerHTML = "";
    }

    sanitizeHTML(html) {
        const allowedTags = ['b', 'i', 'u', 'div', 'br', 'span', 'img', 'font', 'strike', 'blockquote']; 
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
}
