import { ChatService } from "../services/database.js";

export class RightSidebar {
    constructor(currentUser) {
        this.currentUser = currentUser;
        
        // Elements
        this.el = document.getElementById('right-sidebar');
        this.btnToggle = document.getElementById('btn-toggle-info');
        
        this.roomAvatar = document.getElementById('rs-room-avatar');
        this.roomName = document.getElementById('rs-room-name');
        this.roomType = document.getElementById('rs-room-type');
        
        this.mediaGrid = document.getElementById('rs-media-grid');
        this.btnToggleMedia = document.getElementById('btn-toggle-media');
        
        this.membersList = document.getElementById('rs-members-list');
        this.membersCount = document.getElementById('rs-members-count');

        this.currentRoom = null;
        
        this.init();
    }

    init() {
        // Toggle Sidebar
        this.btnToggle.addEventListener('click', () => {
            this.el.classList.toggle('closed');
        });

        // Toggle Media Section
        this.btnToggleMedia.addEventListener('click', () => {
            this.mediaGrid.classList.toggle('collapsed');
        });
    }

    async loadRoom(room) {
        this.currentRoom = room;
        
        // 1. Рендер инфо
        this.roomName.innerText = room.name;
        
        if (room.id === 'general') {
            this.roomType.innerText = 'Все пользователи';
        } else {
            this.roomType.innerText = room.type === 'private' ? 'Закрытая группа' : 'Публичная группа';
        }
        
        if (room.avatar && room.avatar.startsWith('http')) {
            this.roomAvatar.style.backgroundImage = `url('${room.avatar}')`;
            this.roomAvatar.innerText = "";
        } else {
            this.roomAvatar.style.backgroundImage = "none";
            this.roomAvatar.innerText = "#";
        }

        // 2. Загрузка участников
        // Если это GENERAL (в app.js мы передаем null для members в этом случае) -> грузим всех
        if (room.id === 'general' || !room.members) {
            this.loadAllUsers();
        } else {
            this.loadMembers(room.members);
        }

        // 3. Загрузка медиа (подписка)
        if (this.unsubMedia) this.unsubMedia();
        this.unsubMedia = ChatService.subscribeToMessages(room.id, (msgs) => {
            this.renderMedia(msgs);
        });
    }

    async loadAllUsers() {
        this.membersList.innerHTML = '<div style="text-align:center; color:#555; font-size:12px; padding:10px;">Загрузка всех...</div>';
        const users = await ChatService.getAllUsers();
        this.membersCount.innerText = `(${users.length})`;
        this.renderMembersHTML(users);
    }

    async loadMembers(memberIds) {
        this.membersList.innerHTML = '<div style="text-align:center; color:#555; font-size:12px; padding:10px;">Загрузка...</div>';
        this.membersCount.innerText = `(${memberIds.length})`;

        const users = await ChatService.getUsersByIds(memberIds);
        this.renderMembersHTML(users);
    }

    renderMembersHTML(users) {
        this.membersList.innerHTML = '';
        users.forEach(user => {
            const card = document.createElement('div');
            card.className = 'member-card';
            
            // Баннер (если есть)
            const bannerStyle = (user.banner && user.banner !== 'none') ? `background-image: url('${user.banner}');` : '';
            
            // Аватар
            const avatarUrl = user.avatar || 'avatars/Ari LoL.png';
            
            // Эффект (иконка)
            let effectIcon = '';
            if(user.effect === 'glitch') effectIcon = '⚡';
            if(user.effect === 'pixel') effectIcon = '👾';
            if(user.effect === 'liquid') effectIcon = '💧';

            card.innerHTML = `
                <div class="member-banner-bg" style="${bannerStyle}"></div>
                <div class="member-avatar-box">
                    <div class="member-img" style="background-image: url('${avatarUrl}')"></div>
                    <div class="frame-mini ${user.frame || 'frame-none'}"></div>
                    <div class="status-mini ${user.status || 'offline'}"></div>
                </div>
                <div class="member-info">
                    <span class="member-name">${user.nickname}</span>
                    <span class="member-bio">${user.bio || '...'}</span>
                </div>
                <div class="shader-icon" title="Shader: ${user.effect}">${effectIcon}</div>
            `;
            
            this.membersList.appendChild(card);
        });
    }

    renderMedia(messages) {
        this.mediaGrid.innerHTML = '';
        const images = [];

        // Парсим сообщения на наличие картинок
        messages.forEach(msg => {
            if (msg.text && msg.text.includes('<img')) {
                const temp = document.createElement('div');
                temp.innerHTML = msg.text;
                const imgs = temp.querySelectorAll('img');
                imgs.forEach(img => images.push(img.src));
            }
        });

        if (images.length === 0) {
            this.mediaGrid.innerHTML = '<div style="grid-column:1/-1; text-align:center; color:#444; font-size:11px;">Нет медиа</div>';
            return;
        }

        // Показываем последние 9 (новые сверху, значит берем с конца, если массив отсортирован по дате по возрастанию)
        // В ChatService мы сортируем 'asc' (старые сверху), значит reverse() нужен
        [...images].reverse().slice(0, 9).forEach(src => {
            const el = document.createElement('div');
            el.className = 'rs-media-item';
            el.style.backgroundImage = `url('${src}')`;
            el.onclick = () => {
                const w = window.open("");
                w.document.write(`<body style="background:#000; margin:0; display:flex; justify-content:center; align-items:center; height:100vh;"><img src="${src}" style="max-height:90vh; max-width:90vw;"></body>`);
            };
            this.mediaGrid.appendChild(el);
        });
    }
}
