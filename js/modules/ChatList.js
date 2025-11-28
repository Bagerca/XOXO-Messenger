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

        // Элементы контекстного меню
        this.ctxMenu = document.getElementById('context-menu');
        this.targetElementData = null; // Данные элемента, на котором вызвали меню

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

    // --- CONTEXT MENU LOGIC ---
    initContextMenu() {
        // Скрытие меню при клике в любом месте
        document.addEventListener('click', () => this.hideContextMenu());
        document.addEventListener('contextmenu', (e) => {
            // Если клик не по нашему элементу, скрываем
            if (!e.target.closest('.room-item') && !e.target.closest('.category-header')) {
                this.hideContextMenu();
            }
        });

        // Обработчики кнопок меню
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

        // Показываем/скрываем пункты в зависимости от типа и прав
        const isOwner = data.ownerId === this.currentUser.uid;
        
        const setDisplay = (id, show) => document.getElementById(id).style.display = show ? 'flex' : 'none';

        if (type === 'room') {
            setDisplay('ctx-open', true);
            setDisplay('ctx-read', true);
            setDisplay('ctx-edit-room', isOwner);
            setDisplay('ctx-move-room', isOwner); // Только владелец может перемещать? Или все? Пусть пока владелец.
            setDisplay('ctx-delete-room', isOwner);
            setDisplay('ctx-leave-room', !isOwner);
            
            setDisplay('ctx-rename-cat', false);
            setDisplay('ctx-delete-cat', false);
        } else if (type === 'category') {
            setDisplay('ctx-open', false);
            setDisplay('ctx-read', false);
            setDisplay('ctx-edit-room', false);
            setDisplay('ctx-move-room', false);
            setDisplay('ctx-leave-room', false);
            setDisplay('ctx-delete-room', false);

            setDisplay('ctx-rename-cat', true);
            setDisplay('ctx-delete-cat', true);
        }

        // Позиционирование
        this.ctxMenu.style.display = 'flex'; // Сначала показываем, чтобы получить размеры
        
        let x = e.clientX;
        let y = e.clientY;
        
        // Коррекция, чтобы не вылезало за экран
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
        this.targetElementData = null;
    }

    handleCtxAction(action) {
        const data = this.targetElementData;
        if (!data) return;

        if (action === 'open') {
            document.dispatchEvent(new CustomEvent('room-selected', { detail: data }));
        }
        else if (action === 'read') {
            this.markAsRead(data.id);
        }
        else if (action === 'edit-room') {
            // Открываем существующую модалку редактирования
            // Нужно передать ID в глобальную область или вызвать логику из app.js
            window.editingRoomId = data.id; // Хак для связи с app.js
            document.getElementById('edit-room-name').value = data.name;
            document.getElementById('edit-room-avatar').value = data.avatar;
            document.getElementById('edit-room-modal').classList.add('open');
        }
        else if (action === 'delete-room') {
            if(confirm(`Удалить группу "${data.name}"?`)) {
                ChatService.deleteRoom(data.id);
            }
        }
        else if (action === 'leave-room') {
            if(confirm(`Покинуть группу "${data.name}"?`)) {
                ChatService.leaveRoom(data.id, this.currentUser.uid);
            }
        }
        else if (action === 'delete-cat') {
            if(confirm(`Удалить категорию "${data.name}"? Все чаты переместятся в общий список.`)) {
                ChatService.deleteCategory(data.id);
            }
        }
        else if (action === 'move-room') {
            this.openMoveRoomModal(data.id);
        }
        else if (action === 'rename-cat') {
            this.openRenameCatModal(data.id, data.name);
        }

        this.hideContextMenu();
    }

    // Вспомогательные методы для модалок
    openMoveRoomModal(roomId) {
        const modal = document.getElementById('move-room-modal');
        const select = document.getElementById('move-room-select');
        const btnConfirm = document.getElementById('btn-confirm-move');
        const btnCancel = document.getElementById('btn-cancel-move');

        // Заполняем селект
        select.innerHTML = '<option value="root">Без категории</option>';
        this.localCategories.forEach(cat => {
            select.innerHTML += `<option value="${cat.id}">${cat.name}</option>`;
        });

        modal.classList.add('open');

        const confirmHandler = async () => {
            const catId = select.value;
            await ChatService.updateRoom(roomId, { categoryId: catId });
            modal.classList.remove('open');
            cleanup();
        };
        const cancelHandler = () => { modal.classList.remove('open'); cleanup(); };

        function cleanup() {
            btnConfirm.removeEventListener('click', confirmHandler);
            btnCancel.removeEventListener('click', cancelHandler);
        }

        btnConfirm.addEventListener('click', confirmHandler);
        btnCancel.addEventListener('click', cancelHandler);
    }

    openRenameCatModal(catId, currentName) {
        const modal = document.getElementById('rename-cat-modal');
        const input = document.getElementById('rename-cat-input');
        const btnConfirm = document.getElementById('btn-confirm-rename-cat');
        const btnCancel = document.getElementById('btn-cancel-rename-cat');

        input.value = currentName;
        modal.classList.add('open');
        input.focus();

        const confirmHandler = async () => {
            const newName = input.value.trim();
            if (newName) {
                await ChatService.updateCategory(catId, { name: newName });
            }
            modal.classList.remove('open');
            cleanup();
        };
        const cancelHandler = () => { modal.classList.remove('open'); cleanup(); };

        function cleanup() {
            btnConfirm.removeEventListener('click', confirmHandler);
            btnCancel.removeEventListener('click', cancelHandler);
        }

        btnConfirm.addEventListener('click', confirmHandler);
        btnCancel.addEventListener('click', cancelHandler);
    }

    // --- EXISTING LOGIC (Render, Drag, Notifications) ---
    requestNotificationPermission() {
        if ("Notification" in window && Notification.permission !== "granted") {
            Notification.requestPermission();
        }
    }

    sendSystemNotification(title, body, icon) {
        if (Notification.permission === "granted") {
            const notif = new Notification(title, { body, icon: icon || "logo.svg", silent: false });
            notif.onclick = () => { window.focus(); notif.close(); };
        }
    }

    checkNewMessages() {
        this.localRooms.forEach(room => {
            const prevTime = this.roomsState[room.id] || 0;
            const newTime = room.lastMessageAt || 0;
            const isActive = this.chatUI.currentRoomId === room.id;
            if (newTime > prevTime && !this.isInitialLoad && !isActive) {
                this.sendSystemNotification(`Сообщение в ${room.name}`, "Новое сообщение", room.avatar || "logo.svg");
            }
            this.roomsState[room.id] = newTime;
        });
    }

    markAsRead(roomId) {
        localStorage.setItem(`xoxo_lastRead_${roomId}`, Date.now());
        this.render(); 
    }

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
            if (room.type === 'private' && !isMember && !isOwner) return;

            const catId = room.categoryId && roomsByCat[room.categoryId] ? room.categoryId : 'uncategorized';
            if (catId === 'uncategorized' && (!room.categoryId || room.categoryId === 'root' || room.categoryId === 'uncategorized')) {
                rootRooms.push(room);
            } else {
                roomsByCat[catId].push(room);
            }
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

        let avatarHtml = `<div class="room-avatar">#</div>`;
        if (room.avatar && room.avatar.startsWith('http')) {
            avatarHtml = `<div class="room-avatar" style="background-image: url('${room.avatar}')"></div>`;
        }

        const badgeHtml = hasUnread ? `<div class="unread-badge"></div>` : '';

        btn.innerHTML = `
            ${avatarHtml}
            <div class="room-info">
                <span class="room-name">${room.name}</span>
                <span class="room-meta">${room.type === 'private' ? '🔒 Приватный' : 'Публичный'}</span>
            </div>
            ${badgeHtml}
        `;
        
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); 
            const badge = btn.querySelector('.unread-badge');
            if(badge) badge.remove();
            document.dispatchEvent(new CustomEvent('room-selected', { detail: room }));
        });

        // ПРАВЫЙ КЛИК (CONTEXT MENU)
        btn.addEventListener('contextmenu', (e) => {
            this.showContextMenu(e, 'room', room);
        });

        // Drag handlers
        btn.addEventListener('dragstart', (e) => {
            e.stopPropagation();
            this.draggedType = 'room';
            this.draggedId = room.id;
            e.dataTransfer.effectAllowed = "move";
            e.target.style.opacity = '0.5';
            this.container.classList.add('dragging-room');
        });

        btn.addEventListener('dragend', (e) => {
            e.target.style.opacity = '1';
            this.clearDragState();
        });

        return btn;
    }

    renderCategoryBlock(cat, rooms) {
        const catContainer = document.createElement('div');
        catContainer.className = 'category-container';
        catContainer.dataset.catId = cat.id;
        catContainer.draggable = true; 

        if (this.collapsedCategories.has(cat.id)) {
            catContainer.classList.add('collapsed');
        }

        const header = document.createElement('div');
        header.className = 'category-header';
        header.innerHTML = `<span class="cat-arrow">▼</span> ${cat.name}`;
        
        header.addEventListener('click', () => {
            catContainer.classList.toggle('collapsed');
            if (catContainer.classList.contains('collapsed')) {
                this.collapsedCategories.add(cat.id);
            } else {
                this.collapsedCategories.delete(cat.id);
            }
        });

        // ПРАВЫЙ КЛИК ПО КАТЕГОРИИ
        header.addEventListener('contextmenu', (e) => {
            this.showContextMenu(e, 'category', cat);
        });
        
        const roomsContainer = document.createElement('div');
        roomsContainer.className = 'category-rooms';
        rooms.forEach(room => roomsContainer.appendChild(this.createRoomElement(room)));

        catContainer.appendChild(header);
        catContainer.appendChild(roomsContainer);

        // Drag & Drop logic
        catContainer.addEventListener('dragstart', (e) => {
            if (this.draggedType === 'room') return; 
            this.draggedType = 'category';
            this.draggedId = cat.id;
            e.dataTransfer.effectAllowed = "move";
            setTimeout(() => catContainer.classList.add('dragging'), 0);
            e.stopPropagation();
        });

        catContainer.addEventListener('dragend', () => {
            catContainer.classList.remove('dragging');
            this.clearDragState();
        });

        catContainer.addEventListener('dragover', (e) => {
            e.preventDefault(); e.stopPropagation();
            if (this.draggedType === 'room') {
                catContainer.classList.add('drag-over-insert');
            } else if (this.draggedType === 'category' && this.draggedId !== cat.id) {
                const rect = catContainer.getBoundingClientRect();
                const offset = e.clientY - rect.top;
                if (offset < rect.height / 2) {
                    catContainer.classList.add('drop-above'); catContainer.classList.remove('drop-below');
                } else {
                    catContainer.classList.add('drop-below'); catContainer.classList.remove('drop-above');
                }
            }
        });

        catContainer.addEventListener('dragleave', () => this.clearVisuals(catContainer));

        catContainer.addEventListener('drop', async (e) => {
            e.preventDefault(); e.stopPropagation();
            this.clearVisuals(catContainer);
            if (!this.draggedId) return;

            if (this.draggedType === 'room') {
                const room = this.localRooms.find(r => r.id === this.draggedId);
                if (room && room.categoryId !== cat.id) {
                    await ChatService.updateRoom(this.draggedId, { categoryId: cat.id });
                }
            } else if (this.draggedType === 'category' && this.draggedId !== cat.id) {
                const srcCat = this.localCategories.find(c => c.id === this.draggedId);
                const srcOrder = srcCat.order;
                const targetOrder = cat.order;
                await ChatService.updateCategory(srcCat.id, { order: targetOrder });
                await ChatService.updateCategory(cat.id, { order: srcOrder });
            }
        });

        this.container.appendChild(catContainer);
    }

    initRootDropZone() {
        this.container.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (this.draggedType === 'room' && !e.target.closest('.category-container')) {
                this.container.classList.add('drag-over-root');
            }
        });
        this.container.addEventListener('dragleave', () => this.container.classList.remove('drag-over-root'));
        this.container.addEventListener('drop', async (e) => {
            e.preventDefault();
            this.container.classList.remove('drag-over-root');
            if (this.draggedType === 'room' && this.draggedId && !e.target.closest('.category-container')) {
                const room = this.localRooms.find(r => r.id === this.draggedId);
                if (room && room.categoryId !== 'root') await ChatService.updateRoom(this.draggedId, { categoryId: 'root' });
            }
        });
    }

    clearVisuals(el) {
        el.classList.remove('drag-over-insert');
        el.classList.remove('drop-above');
        el.classList.remove('drop-below');
    }

    clearDragState() {
        this.draggedType = null;
        this.draggedId = null;
        this.container.classList.remove('dragging-room');
        document.querySelectorAll('.category-container').forEach(el => this.clearVisuals(el));
    }

    updateCategorySelect() {
        const sel = document.getElementById('new-room-category-select');
        if(!sel) return;
        sel.innerHTML = '<option value="root">Без категории</option>';
        this.localCategories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat.id;
            opt.innerText = cat.name;
            sel.appendChild(opt);
        });
    }
}
