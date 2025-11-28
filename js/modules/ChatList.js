import { ChatService } from "../services/database.js";

export class ChatList {
    constructor(currentUser, chatUI, roomsContainer) {
        this.currentUser = currentUser;
        this.chatUI = chatUI;
        this.container = roomsContainer;
        
        this.localRooms = [];
        this.localCategories = [];
        this.collapsedCategories = new Set();
        this.roomsState = {}; 
        this.isInitialLoad = true;

        this.draggedType = null; 
        this.draggedId = null;   

        // Кэш для пользователей DM (чтобы не мерцало при перерисовке)
        this.dmUsersCache = {}; 

        this.ctxMenu = document.getElementById('context-menu');
        this.targetElementData = null;

        this.initContextMenu();
        this.requestNotificationPermission();

        document.addEventListener('room-selected', (e) => {
            this.markAsRead(e.detail.id);
        });

        ChatService.subscribeToCategories((cats) => {
            this.localCategories = cats;
            this.render();
            this.updateCategorySelect();
        });

        ChatService.subscribeToRooms((rooms) => {
            this.localRooms = rooms;
            this.checkNewMessages();
            this.render();
            this.isInitialLoad = false;
        });

        this.initRootDropZone();
    }

    // --- CONTEXT MENU ---
    initContextMenu() {
        document.addEventListener('click', () => this.hideContextMenu());
        document.addEventListener('contextmenu', (e) => {
            if (!e.target.closest('.room-item') && !e.target.closest('.category-header')) {
                this.hideContextMenu();
            }
        });
        document.getElementById('ctx-open').onclick = () => this.handleCtxAction('open');
        document.getElementById('ctx-read').onclick = () => this.handleCtxAction('read');
        document.getElementById('ctx-edit-room').onclick = () => this.handleCtxAction('edit-room');
        document.getElementById('ctx-move-room').onclick = () => this.handleCtxAction('move-room');
        document.getElementById('ctx-rename-cat').onclick = () => this.handleCtxAction('rename-cat');
        document.getElementById('ctx-leave-room').onclick = () => this.handleCtxAction('leave-room');
        document.getElementById('ctx-delete-room').onclick = () => this.handleCtxAction('delete-room');
        document.getElementById('ctx-delete-cat').onclick = () => this.handleCtxAction('delete-cat');
    }

    showContextMenu(e, type, data) {
        e.preventDefault();
        this.targetElementData = { type, ...data };

        const isOwner = data.ownerId === this.currentUser.uid;
        const setDisplay = (id, show) => document.getElementById(id).style.display = show ? 'flex' : 'none';

        if (type === 'room') {
            setDisplay('ctx-open', true);
            setDisplay('ctx-read', true);
            
            // Если DM, то нельзя редактировать как обычную группу
            const isDM = data.type === 'dm';
            
            setDisplay('ctx-edit-room', isOwner && !isDM);
            setDisplay('ctx-move-room', !isDM); 
            setDisplay('ctx-delete-room', isOwner && !isDM);
            setDisplay('ctx-leave-room', !isOwner && !isDM); 
            
            setDisplay('ctx-rename-cat', false);
            setDisplay('ctx-delete-cat', false);
        } else if (type === 'category') {
            setDisplay('ctx-open', false); setDisplay('ctx-read', false); setDisplay('ctx-edit-room', false);
            setDisplay('ctx-move-room', false); setDisplay('ctx-leave-room', false); setDisplay('ctx-delete-room', false);
            setDisplay('ctx-rename-cat', true); setDisplay('ctx-delete-cat', true);
        }

        this.ctxMenu.style.display = 'flex';
        let x = e.clientX, y = e.clientY;
        if (x + this.ctxMenu.offsetWidth > window.innerWidth) x -= this.ctxMenu.offsetWidth;
        if (y + this.ctxMenu.offsetHeight > window.innerHeight) y -= this.ctxMenu.offsetHeight;
        this.ctxMenu.style.left = `${x}px`; this.ctxMenu.style.top = `${y}px`;
        this.ctxMenu.classList.add('active');
    }

    hideContextMenu() { this.ctxMenu.style.display = 'none'; this.ctxMenu.classList.remove('active'); this.targetElementData = null; }

    handleCtxAction(action) {
        const data = this.targetElementData;
        if (!data) return;
        if (action === 'open') document.dispatchEvent(new CustomEvent('room-selected', { detail: data }));
        else if (action === 'read') this.markAsRead(data.id);
        else if (action === 'edit-room') { /* Логика открытия модалки через глобальную переменную */ window.editingRoomId = data.id; document.getElementById('edit-room-name').value = data.name; document.getElementById('edit-room-avatar').value = data.avatar; document.getElementById('edit-room-modal').classList.add('open'); }
        else if (action === 'delete-room') { if(confirm("Удалить?")) ChatService.deleteRoom(data.id); }
        else if (action === 'delete-cat') { if(confirm("Удалить?")) ChatService.deleteCategory(data.id); }
        // ... (остальные можно добавить по аналогии)
        this.hideContextMenu();
    }

    // --- RENDER ---
    requestNotificationPermission() { if ("Notification" in window && Notification.permission !== "granted") Notification.requestPermission(); }
    sendSystemNotification(title, body, icon) { if (Notification.permission === "granted") { const n = new Notification(title, { body, icon }); n.onclick = () => window.focus(); } }
    
    checkNewMessages() {
        this.localRooms.forEach(room => {
            const prev = this.roomsState[room.id] || 0;
            if (room.lastMessageAt > prev && !this.isInitialLoad && this.chatUI.currentRoomId !== room.id) {
                this.sendSystemNotification(`Сообщение в ${room.name}`, "Новое сообщение", room.avatar || "logo.svg");
            }
            this.roomsState[room.id] = room.lastMessageAt || 0;
        });
    }

    markAsRead(roomId) { localStorage.setItem(`xoxo_lastRead_${roomId}`, Date.now()); this.render(); }

    render() {
        const scrollPos = this.container.scrollTop;
        this.container.innerHTML = '';
        
        const rootRooms = [];
        const roomsByCat = {};
        this.localCategories.forEach(c => roomsByCat[c.id] = []);

        this.localRooms.forEach(room => {
            if (room.id === 'general') return; 
            const isMember = room.members && room.members.includes(this.currentUser.uid);
            const isOwner = room.ownerId === this.currentUser.uid;
            
            // Показываем комнату, если мы участник, владелец, или это не приватная группа.
            // Для DM - обязательно быть участником.
            if (room.type === 'dm' && !isMember) return;
            if (room.type === 'private' && !isMember && !isOwner) return;

            const catId = room.categoryId && roomsByCat[room.categoryId] ? room.categoryId : 'uncategorized';
            if (catId === 'uncategorized') rootRooms.push(room);
            else roomsByCat[catId].push(room);
        });

        if (rootRooms.length > 0) {
            const rootContainer = document.createElement('div');
            rootContainer.className = 'root-rooms-list';
            rootRooms.forEach(room => rootContainer.appendChild(this.createRoomElement(room)));
            this.container.appendChild(rootContainer);
        }

        this.localCategories.forEach(cat => {
            this.renderCategoryBlock(cat, roomsByCat[cat.id]);
        });

        this.container.scrollTop = scrollPos;
    }

    createRoomElement(room) {
        const btn = document.createElement('div');
        btn.className = 'room-item';
        btn.draggable = true;
        btn.dataset.roomId = room.id;
        
        const isActive = this.chatUI.currentRoomId === room.id;
        if (isActive) {
            btn.classList.add('active');
            localStorage.setItem(`xoxo_lastRead_${room.id}`, Date.now());
        }

        const lastRead = localStorage.getItem(`xoxo_lastRead_${room.id}`) || 0;
        const lastMsg = room.lastMessageAt || 0;
        const hasUnread = !isActive && (lastMsg > lastRead);
        
        // --- DM Logic ---
        let displayName = room.name;
        let displayAvatarUrl = room.avatar;
        let typeLabel = room.type === 'private' ? '🔒 Приватный' : 'Публичный';

        if (room.type === 'dm') {
            typeLabel = 'Личное';
            // Находим собеседника
            const otherId = room.members.find(uid => uid !== this.currentUser.uid);
            if (otherId) {
                if (this.dmUsersCache[otherId]) {
                    displayName = this.dmUsersCache[otherId].nickname;
                    displayAvatarUrl = this.dmUsersCache[otherId].avatar;
                } else {
                    displayName = "Загрузка...";
                    ChatService.getUser(otherId).then(user => {
                        if (user) {
                            this.dmUsersCache[otherId] = user;
                            // Динамическое обновление элемента
                            const nameEl = btn.querySelector('.room-name');
                            const avaEl = btn.querySelector('.room-avatar');
                            if(nameEl) nameEl.innerText = user.nickname;
                            if(avaEl) avaEl.style.backgroundImage = `url('${user.avatar || 'avatars/Ari LoL.png'}')`;
                        }
                    });
                }
            } else {
                displayName = "Сохраненное";
            }
        }

        let avatarHtml = `<div class="room-avatar">#</div>`;
        if (displayAvatarUrl && displayAvatarUrl.startsWith('http')) {
            avatarHtml = `<div class="room-avatar" style="background-image: url('${displayAvatarUrl}')"></div>`;
        } else if (room.type === 'dm') {
             avatarHtml = `<div class="room-avatar" style="background-image: url('avatars/Ari LoL.png')"></div>`;
        }
        
        const badgeHtml = hasUnread ? `<div class="unread-badge"></div>` : '';

        btn.innerHTML = `
            ${avatarHtml}
            <div class="room-info">
                <span class="room-name">${displayName}</span>
                <span class="room-meta">${typeLabel}</span>
            </div>
            ${badgeHtml}
        `;
        
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); 
            const badge = btn.querySelector('.unread-badge');
            if(badge) badge.remove();
            
            // Передаем в app.js актуальные данные (виртуальные)
            if (room.type === 'dm') {
                 const otherId = room.members.find(uid => uid !== this.currentUser.uid);
                 const cached = this.dmUsersCache[otherId];
                 if(cached) {
                     room.virtualName = cached.nickname;
                     room.virtualAvatar = cached.avatar;
                 }
            }
            document.dispatchEvent(new CustomEvent('room-selected', { detail: room }));
        });

        btn.addEventListener('contextmenu', (e) => this.showContextMenu(e, 'room', room));
        btn.addEventListener('dragstart', (e) => {
            e.stopPropagation(); this.draggedType = 'room'; this.draggedId = room.id;
            e.dataTransfer.effectAllowed = "move"; e.target.style.opacity = '0.5';
            this.container.classList.add('dragging-room');
        });
        btn.addEventListener('dragend', (e) => { e.target.style.opacity = '1'; this.clearDragState(); });

        return btn;
    }

    renderCategoryBlock(cat, rooms) {
        const catContainer = document.createElement('div'); catContainer.className = 'category-container'; catContainer.dataset.catId = cat.id; catContainer.draggable = true;
        if (this.collapsedCategories.has(cat.id)) catContainer.classList.add('collapsed');
        const header = document.createElement('div'); header.className = 'category-header'; header.innerHTML = `<span class="cat-arrow">▼</span> ${cat.name}`;
        header.addEventListener('click', () => { catContainer.classList.toggle('collapsed'); if (catContainer.classList.contains('collapsed')) this.collapsedCategories.add(cat.id); else this.collapsedCategories.delete(cat.id); });
        header.addEventListener('contextmenu', (e) => this.showContextMenu(e, 'category', cat));
        const roomsContainer = document.createElement('div'); roomsContainer.className = 'category-rooms';
        rooms.forEach(room => roomsContainer.appendChild(this.createRoomElement(room)));
        catContainer.appendChild(header); catContainer.appendChild(roomsContainer);
        
        catContainer.addEventListener('dragstart', (e) => { if (this.draggedType === 'room') return; this.draggedType = 'category'; this.draggedId = cat.id; e.stopPropagation(); });
        catContainer.addEventListener('dragover', (e) => { e.preventDefault(); e.stopPropagation(); if(this.draggedType==='room') catContainer.classList.add('drag-over-insert'); });
        catContainer.addEventListener('dragleave', () => this.clearVisuals(catContainer));
        catContainer.addEventListener('drop', async (e) => { e.preventDefault(); e.stopPropagation(); this.clearVisuals(catContainer); if(this.draggedType === 'room' && this.draggedId) { await ChatService.updateRoom(this.draggedId, { categoryId: cat.id }); }});
        
        this.container.appendChild(catContainer);
    }

    initRootDropZone() { 
        this.container.addEventListener('dragover', (e) => { e.preventDefault(); if (this.draggedType === 'room' && !e.target.closest('.category-container')) this.container.classList.add('drag-over-root'); });
        this.container.addEventListener('dragleave', () => this.container.classList.remove('drag-over-root'));
        this.container.addEventListener('drop', async (e) => { e.preventDefault(); this.container.classList.remove('drag-over-root'); if (this.draggedType === 'room') await ChatService.updateRoom(this.draggedId, { categoryId: 'root' }); });
    }
    clearVisuals(el) { el.classList.remove('drag-over-insert'); }
    clearDragState() { this.draggedType = null; this.draggedId = null; this.container.classList.remove('dragging-room'); document.querySelectorAll('.category-container').forEach(el => this.clearVisuals(el)); }
    updateCategorySelect() {
        const sel = document.getElementById('new-room-category-select'); if(!sel) return; sel.innerHTML = '<option value="root">Без категории</option>';
        this.localCategories.forEach(cat => { const opt = document.createElement('option'); opt.value = cat.id; opt.innerText = cat.name; sel.appendChild(opt); });
    }
}
