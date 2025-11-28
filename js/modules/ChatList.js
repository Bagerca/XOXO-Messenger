import { ChatService } from "../services/database.js";

export class ChatList {
    constructor(currentUser, chatUI, roomsContainer) {
        this.currentUser = currentUser;
        this.chatUI = chatUI;
        this.container = roomsContainer;
        this.localRooms = [];
        this.localCategories = [];
        this.draggedRoomId = null;

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
        this.container.innerHTML = '';
        
        // 1. Сортируем: отдельно рутовые чаты, отдельно категории
        const rootRooms = [];
        const roomsByCat = {};
        
        // Инициализируем массивы для категорий
        this.localCategories.forEach(c => roomsByCat[c.id] = []);

        this.localRooms.forEach(room => {
            if (room.id === 'general') return; 

            // Фильтр приватности
            const isMember = room.members && room.members.includes(this.currentUser.uid);
            const isOwner = room.ownerId === this.currentUser.uid;
            if (room.type === 'private' && !isMember && !isOwner) return;

            // Если категория не задана или 'uncategorized' или 'root' -> в корень
            if (!room.categoryId || room.categoryId === 'uncategorized' || room.categoryId === 'root') {
                rootRooms.push(room);
            } else if (roomsByCat[room.categoryId]) {
                roomsByCat[room.categoryId].push(room);
            } else {
                // Если категория была удалена, кидаем в корень
                rootRooms.push(room);
            }
        });

        // 2. Сначала рендерим РУТОВЫЕ чаты (вне категорий)
        if (rootRooms.length > 0) {
            const rootContainer = document.createElement('div');
            rootContainer.className = 'root-rooms-list';
            rootRooms.forEach(room => {
                rootContainer.appendChild(this.createRoomElement(room));
            });
            this.container.appendChild(rootContainer);
        }

        // 3. Рендерим Категории
        this.localCategories.forEach(cat => {
            this.renderCategoryBlock(cat.id, cat.name, roomsByCat[cat.id]);
        });
    }

    // Создание DOM элемента чата
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
        
        // Click
        btn.addEventListener('click', () => {
            document.dispatchEvent(new CustomEvent('room-selected', { detail: room }));
        });

        // Drag Start
        btn.addEventListener('dragstart', (e) => {
            this.draggedRoomId = room.id;
            e.dataTransfer.effectAllowed = "move";
            e.target.style.opacity = '0.5';
            // Чтобы дроп-зоны знали, что мы тащим
            this.container.classList.add('dragging-active');
        });

        // Drag End
        btn.addEventListener('dragend', (e) => {
            e.target.style.opacity = '1';
            this.draggedRoomId = null;
            this.container.classList.remove('dragging-active');
            // Убираем подсветку со всех зон
            this.container.classList.remove('drag-over-root');
            document.querySelectorAll('.category-container').forEach(el => el.classList.remove('drag-over'));
        });

        return btn;
    }

    renderCategoryBlock(catId, catName, rooms) {
        const catContainer = document.createElement('div');
        catContainer.className = 'category-container';
        catContainer.dataset.catId = catId;

        const header = document.createElement('div');
        header.className = 'category-header';
        header.innerHTML = `<span class="cat-arrow">▼</span> ${catName}`;
        header.addEventListener('click', () => catContainer.classList.toggle('collapsed'));
        
        const roomsContainer = document.createElement('div');
        roomsContainer.className = 'category-rooms';

        rooms.forEach(room => {
            roomsContainer.appendChild(this.createRoomElement(room));
        });

        catContainer.appendChild(header);
        catContainer.appendChild(roomsContainer);

        // --- Drop Zone: Внутрь категории ---
        catContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation(); // Чтобы не всплывало до рута
            catContainer.classList.add('drag-over');
        });

        catContainer.addEventListener('dragleave', (e) => {
            catContainer.classList.remove('drag-over');
        });
        
        catContainer.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            catContainer.classList.remove('drag-over');
            
            if (!this.draggedRoomId) return;
            const room = this.localRooms.find(r => r.id === this.draggedRoomId);
            
            // Если перемещаем в ЭТУ категорию
            if (room && room.categoryId !== catId) {
                await ChatService.updateRoom(this.draggedRoomId, { categoryId: catId });
            }
        });

        this.container.appendChild(catContainer);
    }

    // --- Drop Zone: КОРЕНЬ (Вне категорий) ---
    initRootDropZone() {
        this.container.addEventListener('dragover', (e) => {
            e.preventDefault();
            // Если навели на сам контейнер списка (пустое место), а не на категорию
            if (e.target === this.container || e.target.classList.contains('root-rooms-list')) {
                this.container.classList.add('drag-over-root');
            }
        });

        this.container.addEventListener('dragleave', (e) => {
            if (e.target === this.container) {
                this.container.classList.remove('drag-over-root');
            }
        });

        this.container.addEventListener('drop', async (e) => {
            e.preventDefault();
            this.container.classList.remove('drag-over-root');

            // Проверяем, куда упало. Если упало прямо в контейнер (мимо категорий) -> значит в корень
            const targetIsCategory = e.target.closest('.category-container');
            
            if (!targetIsCategory && this.draggedRoomId) {
                const room = this.localRooms.find(r => r.id === this.draggedRoomId);
                // Если комната была в категории, делаем её рутовой
                if (room && room.categoryId !== 'root') {
                    await ChatService.updateRoom(this.draggedRoomId, { categoryId: 'root' });
                }
            }
        });
    }

    updateCategorySelect() {
        const sel = document.getElementById('new-room-category-select');
        if(!sel) return;
        sel.innerHTML = '<option value="root">Без категории</option>'; // root по дефолту
        this.localCategories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat.id;
            opt.innerText = cat.name;
            sel.appendChild(opt);
        });
    }
}
