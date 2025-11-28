import { ChatService } from "../services/database.js";

export class ChatList {
    constructor(currentUser, chatUI, roomsContainer) {
        this.currentUser = currentUser;
        this.chatUI = chatUI;
        this.container = roomsContainer;
        
        this.localRooms = [];
        this.localCategories = [];
        
        // Хранилище ID свернутых категорий
        this.collapsedCategories = new Set();

        this.draggedType = null; 
        this.draggedId = null;   

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
            e.stopPropagation(); 
            document.dispatchEvent(new CustomEvent('room-selected', { detail: room }));
        });

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

        // ВОССТАНОВЛЕНИЕ СОСТОЯНИЯ: Если была свернута - добавляем класс
        if (this.collapsedCategories.has(cat.id)) {
            catContainer.classList.add('collapsed');
        }

        const header = document.createElement('div');
        header.className = 'category-header';
        header.innerHTML = `<span class="cat-arrow">▼</span> ${cat.name}`;
        
        // ОБНОВЛЕННЫЙ КЛИК: Сохраняем состояние в Set
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

        // --- DRAG CATEGORY START ---
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

        // --- DROP ZONE LOGIC ---
        catContainer.addEventListener('dragover', (e) => {
            e.preventDefault();
            e.stopPropagation();

            if (this.draggedType === 'room') {
                catContainer.classList.add('drag-over-insert');
            } 
            else if (this.draggedType === 'category' && this.draggedId !== cat.id) {
                // Вычисляем позицию мыши для отрисовки линии
                const rect = catContainer.getBoundingClientRect();
                const offset = e.clientY - rect.top;
                
                if (offset < rect.height / 2) {
                    catContainer.classList.add('drop-above');
                    catContainer.classList.remove('drop-below');
                } else {
                    catContainer.classList.add('drop-below');
                    catContainer.classList.remove('drop-above');
                }
            }
        });

        catContainer.addEventListener('dragleave', () => {
            this.clearVisuals(catContainer);
        });

        catContainer.addEventListener('drop', async (e) => {
            e.preventDefault();
            e.stopPropagation();
            
            // Запоминаем, куда хотели бросить (сверху или снизу), так как clearVisuals сотрет классы
            const isAbove = catContainer.classList.contains('drop-above');
            this.clearVisuals(catContainer);

            if (!this.draggedId) return;

            // 1. Бросили ЧАТ -> Вставляем в категорию
            if (this.draggedType === 'room') {
                const room = this.localRooms.find(r => r.id === this.draggedId);
                if (room && room.categoryId !== cat.id) {
                    await ChatService.updateRoom(this.draggedId, { categoryId: cat.id });
                }
            }
            // 2. Бросили КАТЕГОРИЮ
            else if (this.draggedType === 'category' && this.draggedId !== cat.id) {
                const srcCat = this.localCategories.find(c => c.id === this.draggedId);
                const targetCat = cat;
                
                // Простой свап (для MVP). 
                // В идеале тут нужен пересчет индексов на основе isAbove / !isAbove
                const srcOrder = srcCat.order;
                const targetOrder = targetCat.order;

                await ChatService.updateCategory(srcCat.id, { order: targetOrder });
                await ChatService.updateCategory(targetCat.id, { order: srcOrder });
            }
        });

        this.container.appendChild(catContainer);
    }

    initRootDropZone() {
        this.container.addEventListener('dragover', (e) => {
            e.preventDefault();
            if (this.draggedType === 'room') {
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

            if (this.draggedType === 'room' && this.draggedId) {
                if (!e.target.closest('.category-container')) {
                    const room = this.localRooms.find(r => r.id === this.draggedId);
                    if (room && room.categoryId !== 'root') {
                        await ChatService.updateRoom(this.draggedId, { categoryId: 'root' });
                    }
                }
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
