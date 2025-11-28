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
    }

    render() {
        this.container.innerHTML = '';
        
        // Группировка
        const roomsByCat = { 'uncategorized': [] };
        this.localCategories.forEach(c => roomsByCat[c.id] = []);

        this.localRooms.forEach(room => {
            if (room.id === 'general') return; // General отдельно

            // Фильтр приватности
            const isMember = room.members && room.members.includes(this.currentUser.uid);
            const isOwner = room.ownerId === this.currentUser.uid;
            if (room.type === 'private' && !isMember && !isOwner) return;

            const catId = room.categoryId && roomsByCat[room.categoryId] ? room.categoryId : 'uncategorized';
            roomsByCat[catId].push(room);
        });

        // Рендер категорий
        this.localCategories.forEach(cat => {
            this.renderCategoryBlock(cat.id, cat.name, roomsByCat[cat.id]);
            delete roomsByCat[cat.id];
        });

        // Рендер "Без категории"
        if(roomsByCat['uncategorized'].length > 0) {
            this.renderCategoryBlock('uncategorized', 'Разное', roomsByCat['uncategorized']);
        }
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
            
            // Вход в комнату (через глобальный эмиттер или напрямую)
            btn.addEventListener('click', () => {
                // Вызываем метод в app.js через CustomEvent или просто используем chatUI если логика простая
                // Но лучше дернуть метод родителя. Для простоты сейчас используем window.enterRoom, 
                // который мы экспортируем из app.js, или передадим callback.
                // В этом варианте мы просто диспатчим событие на document
                document.dispatchEvent(new CustomEvent('room-selected', { detail: room }));
            });

            // Drag Events
            btn.addEventListener('dragstart', (e) => {
                this.draggedRoomId = room.id;
                e.dataTransfer.effectAllowed = "move";
                e.target.style.opacity = '0.5';
            });
            btn.addEventListener('dragend', (e) => {
                e.target.style.opacity = '1';
                this.draggedRoomId = null;
            });

            roomsContainer.appendChild(btn);
        });

        catContainer.appendChild(header);
        catContainer.appendChild(roomsContainer);

        // Drop Zone
        catContainer.addEventListener('dragover', (e) => { e.preventDefault(); catContainer.classList.add('drag-over'); });
        catContainer.addEventListener('dragleave', () => catContainer.classList.remove('drag-over'));
        
        catContainer.addEventListener('drop', async (e) => {
            e.preventDefault();
            catContainer.classList.remove('drag-over');
            if (!this.draggedRoomId) return;
            
            const room = this.localRooms.find(r => r.id === this.draggedRoomId);
            if (room && room.categoryId !== catId) {
                await ChatService.updateRoom(this.draggedRoomId, { categoryId: catId });
            }
        });

        this.container.appendChild(catContainer);
    }

    updateCategorySelect() {
        const sel = document.getElementById('new-room-category-select');
        if(!sel) return;
        sel.innerHTML = '<option value="uncategorized">Без категории</option>';
        this.localCategories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat.id;
            opt.innerText = cat.name;
            sel.appendChild(opt);
        });
    }
}
