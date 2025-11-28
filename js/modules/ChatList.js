import { ChatService } from "../services/database.js";

export class ChatList {
    constructor(currentUser, chatUI, roomsContainer) {
        this.currentUser = currentUser;
        this.chatUI = chatUI;
        this.container = roomsContainer;
        
        this.localRooms = [];
        this.localCategories = [];
        
        // Drag State
        this.draggedType = null; // 'room' | 'category'
        this.draggedId = null;   // ID перемещаемого элемента

        // Подписка на данные
        ChatService.subscribeToCategories((cats) => {
            this.localCategories = cats;
            this.render();
            this.updateCategorySelect();
        });

        ChatService.subscribeToRooms((rooms) => {
            this.localRooms = rooms;
            this.render();
        });

        this.initRootDropZone();
    }

    render() {
        // Сохраняем скролл, если был (чтобы не прыгало при ререндере)
        const scrollPos = this.container.scrollTop;
        this.container.innerHTML = '';
        
        // 1. Сортировка чатов
        const rootRooms = [];
        const roomsByCat = {};
        this.localCategories.forEach(c => roomsByCat[c.id] = []);

        this.localRooms.forEach(room => {
            if (room.id === 'general') return; 

            // Приватность
            const isMember = room.members && room.members.includes(this.currentUser.uid);
            const isOwner = room.ownerId === this.currentUser.uid;
            if (room.type === 'private' && !isMember && !isOwner) return;

            // Распределение
            const catId = room.categoryId;
            
            // Если категория существует, кладем туда
            if (catId && roomsByCat[catId]) {
                roomsByCat[catId].push(room);
            } else {
                // Иначе (root, uncategorized или удаленная категория) -> в корень
                rootRooms.push(room);
            }
        });

        // 2. Рендер Рутовых чатов (Вне категорий)
        if (rootRooms.length > 0) {
            const rootContainer = document.createElement('div');
            rootContainer.className = 'root-rooms-list';
            rootRooms.forEach(room => {
                rootContainer.appendChild(this.createRoomElement(room));
            });
            this.container.appendChild(rootContainer);
        }

        // 3. Рендер Категорий
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
        
        if (this.chatUI.currentRoomId === room.id) btn.classList.add('active');

        let avatarHtml = `<div class="room-avatar">#</div>`;
        if (room.avatar && room.avatar.startsWith('http')) {
            avatarHtml = `<div class="room-avatar" style="background-image: url('${room.avatar}')"></div>`;
        }

        btn.innerHTML = `
            ${avatarHtml}
            <div class="room-info">
                <span class="room-name">${room.name}</span>
                <span class="room-meta">${room.type === 'private' ? '🔒 Приватный' : 'Публичный'}</span>
            </div>
        `;
        
        btn.addEventListener('click', (e) => {
            e.stopPropagation(); // Чтобы клик по чату не сворачивал категорию случайно
            document.dispatchEvent(new CustomEvent('room-selected', { detail: room }));
        });

        // --- Drag Room ---
        btn.addEventListener('dragstart', (e) => {
            e.stopPropagation();
            this.draggedType = 'room';
            this.draggedId = room.id;
            e.dataTransfer.effectAllowed = "move";
            e.target.style.opacity = '0.5';
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
        // ДЕЛАЕМ КАТЕГОРИЮ ПЕРЕТАСКИВАЕМОЙ
        catContainer.draggable = true; 

        // Заголовок
        const header = document.createElement('div');
        header.className = 'category-header';
        header.innerHTML = `<span class="cat-arrow">▼</span> ${cat.name}`;
        
        // Сворачивание при клике на стрелку или текст
        header.addEventListener('click', (e) => {
            catContainer.classList.toggle('collapsed');
        });

        // Контейнер для комнат внутри категории
        const roomsContainer = document.createElement('div');
        roomsContainer.className = 'category-rooms';
        rooms.forEach(room => roomsContainer.appendChild(this.createRoomElement(room)));

        catContainer.appendChild(header);
        catContainer.appendChild(roomsContainer);

        // --- Drag Category Events ---
        catContainer.addEventListener('dragstart', (e) => {
            // Если тащим именно категорию (а не чат внутри неё, который всплыл событием)
            if (this.draggedType === 'room') return; // Если уже тащим комнату, категорию не трогаем

            this.draggedType = 'category';
            this.draggedId = cat.id;
            e.dataTransfer.effectAllowed = "move";
            catContainer.classList.add('dragging');
            e.stopPropagation();
        });

        catContainer.addEventListener('dragend', () => {
            catContainer.classList.remove('dragging');
            this.clearDragState();
        });

        // --- Drop Zone Logic (Принимает и комнаты, и другие категории) ---
        catContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (this.draggedType === 'room') {
                // Если тащим комнату -> показываем подсветку "вставить внутрь"
                catContainer.classList.add('drag-over-insert');
            } else if (this.draggedType === 'category' && this.draggedId !== cat.id) {
                // Если тащим другую категорию -> подсветка "поменять местами"
                catContainer.classList.add('drag-over-swap');
            }
        });

        catContainer.addEventListener('dragleave', () => {
            catContainer.classList.remove('drag-over-insert');
            catContainer.classList.remove('drag-over-swap');
        });

        catContainer.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            catContainer.classList.remove('drag-over-insert');
            catContainer.classList.remove('drag-over-swap');

            if (!this.draggedId) return;

            // 1. Бросили КОМНАТУ в категорию
            if (this.draggedType === 'room') {
                const room = this.localRooms.find(r => r.id === this.draggedId);
                if (room && room.categoryId !== cat.id) {
                    await ChatService.updateRoom(this.draggedId, { categoryId: cat.id });
                }
            }
            // 2. Бросили КАТЕГОРИЮ на категорию (Меняем местами порядок)
            else if (this.draggedType === 'category' && this.draggedId !== cat.id) {
                const srcCat = this.localCategories.find(c => c.id === this.draggedId);
                const targetCat = cat;
                
                // Простой обмен order
                const srcOrder = srcCat.order;
                const targetOrder = targetCat.order;

                // Обновляем обе категории
                await ChatService.updateCategory(srcCat.id, { order: targetOrder });
                await ChatService.updateCategory(targetCat.id, { order: srcOrder });
            }
        });

        this.container.appendChild(catContainer);
    }

    // --- Root Drop Zone (Пустое место в списке) ---
    initRootDropZone() {
        this.container.addEventListener('dragover', (e) => {
            e.preventDefault();
            
            // Реагируем только если тащим КОМНАТУ (категории в рут не кидаем, они и так там)
            if (this.draggedType === 'room') {
                // Проверяем, что мы не над категорией
                if (!e.target.closest('.category-container')) {
                    this.container.classList.add('drag-over-root');
                }
            }
        });

        this.container.addEventListener('dragleave', () => {
            this.container.classList.remove('drag-over-root');
        });

        this.container.addEventListener('drop', async (e) => {
            e.preventDefault();
            this.container.classList.remove('drag-over-root');

            // Если бросили КОМНАТУ в пустоту -> делаем её рутовой ('root')
            if (this.draggedType === 'room' && this.draggedId) {
                // Убедимся, что мы не попали случайно на категорию при всплытии
                if (!e.target.closest('.category-container')) {
                    const room = this.localRooms.find(r => r.id === this.draggedId);
                    if (room && room.categoryId !== 'root') {
                        await ChatService.updateRoom(this.draggedId, { categoryId: 'root' });
                    }
                }
            }
        });
    }

    clearDragState() {
        this.draggedType = null;
        this.draggedId = null;
        document.querySelectorAll('.drag-over-insert, .drag-over-swap, .drag-over-root').forEach(el => {
            el.classList.remove('drag-over-insert', 'drag-over-swap', 'drag-over-root');
        });
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
