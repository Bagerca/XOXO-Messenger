import { ChatService } from "../services/database.js";

export class ChatList {
    constructor(currentUser, chatUI, roomsContainer) {
        this.currentUser = currentUser;
        this.chatUI = chatUI;
        this.container = roomsContainer;
        
        this.localRooms = [];
        this.localCategories = [];
        
        // Хранилище свернутых категорий
        this.collapsedCategories = new Set();
        
        // Для отслеживания новых сообщений (чтобы не орать при F5)
        this.roomsState = {}; 
        this.isInitialLoad = true; // Флаг первой загрузки

        this.draggedType = null; 
        this.draggedId = null;   

        // Запрашиваем разрешение на уведомления сразу
        this.requestNotificationPermission();

        // Слушаем вход в комнату -> помечаем прочитанным
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
            this.checkNewMessages(); // Проверяем на новые сообщения
            this.render();
            this.isInitialLoad = false; // Первая загрузка прошла
        });

        this.initRootDropZone();
    }

    // --- УВЕДОМЛЕНИЯ ---
    requestNotificationPermission() {
        if ("Notification" in window && Notification.permission !== "granted") {
            Notification.requestPermission();
        }
    }

    sendSystemNotification(title, body, icon) {
        if (Notification.permission === "granted") {
            const notif = new Notification(title, {
                body: body,
                icon: icon || "logo.svg", // Твой логотип
                silent: false
            });
            
            // При клике на уведомление открываем окно браузера
            notif.onclick = () => {
                window.focus();
                notif.close();
            };
        }
    }

    checkNewMessages() {
        this.localRooms.forEach(room => {
            const prevTime = this.roomsState[room.id] || 0;
            const newTime = room.lastMessageAt || 0;
            const isActive = this.chatUI.currentRoomId === room.id;

            // Если время изменилось И это не первая загрузка И мы не в этом чате
            if (newTime > prevTime && !this.isInitialLoad && !isActive) {
                
                // Проверяем, что сообщение не от нас самих (опционально)
                // Но у нас в списке комнат нет инфы о последнем авторе, 
                // поэтому уведомляем о факте изменения.
                
                this.sendSystemNotification(
                    `Сообщение в ${room.name}`, 
                    "Новое сообщение", 
                    room.avatar || "logo.svg"
                );
                
                // Звук (опционально, можно добавить mp3 файл)
                // const audio = new Audio('sound.mp3'); audio.play();
            }

            // Обновляем состояние
            this.roomsState[room.id] = newTime;
        });
    }

    // --- ПРОЧИТАННОСТЬ ---
    markAsRead(roomId) {
        localStorage.setItem(`xoxo_lastRead_${roomId}`, Date.now());
        this.render(); 
    }

    // --- РЕНДЕРИНГ (Остается прежним с небольшими правками для бейджа) ---
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

        // Логика зеленого кружка
        const lastRead = localStorage.getItem(`xoxo_lastRead_${room.id}`) || 0;
        const lastMsg = room.lastMessageAt || 0;
        // Показываем кружок, если есть новое сообщение И мы не в чате
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
            // Убираем бейдж визуально сразу
            const badge = btn.querySelector('.unread-badge');
            if(badge) badge.remove();
            
            document.dispatchEvent(new CustomEvent('room-selected', { detail: room }));
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
        
        const roomsContainer = document.createElement('div');
        roomsContainer.className = 'category-rooms';
        rooms.forEach(room => roomsContainer.appendChild(this.createRoomElement(room)));

        catContainer.appendChild(header);
        catContainer.appendChild(roomsContainer);

        // Drag & Drop logic for Categories
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
            const isAbove = catContainer.classList.contains('drop-above');
            this.clearVisuals(catContainer);
            if (!this.draggedId) return;

            if (this.draggedType === 'room') {
                const room = this.localRooms.find(r => r.id === this.draggedId);
                if (room && room.categoryId !== cat.id) {
                    await ChatService.updateRoom(this.draggedId, { categoryId: cat.id });
                }
            } else if (this.draggedType === 'category' && this.draggedId !== cat.id) {
                const srcCat = this.localCategories.find(c => c.id === this.draggedId);
                // Простая смена order (Swap)
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
