import { ChatService } from "../services/database.js";

export class RightSidebar {
    constructor(currentUser) {
        this.currentUser = currentUser;
        
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
        this.btnToggle.addEventListener('click', () => { this.el.classList.toggle('closed'); });
        this.btnToggleMedia.addEventListener('click', () => { this.mediaGrid.classList.toggle('collapsed'); });
    }

    async loadRoom(room) {
        this.currentRoom = room;
        
        // Значения по умолчанию
        let displayName = room.name;
        let displayAvatar = room.avatar;
        let typeText = room.type === 'private' ? 'Закрытая группа' : 'Публичная группа';

        // --- ЛОГИКА ДЛЯ DM ---
        if (room.type === 'dm') {
            typeText = 'Личная переписка';
            const otherId = room.members.find(uid => uid !== this.currentUser.uid);
            
            if (otherId) {
                // Пытаемся получить данные
                const otherUser = await ChatService.getUser(otherId);
                if (otherUser) {
                    displayName = otherUser.nickname;
                    displayAvatar = otherUser.avatar;
                }
            } else {
                displayName = "Сохраненное";
            }
        }
        
        if (room.id === 'general') {
             typeText = 'Все пользователи';
             displayName = "Общий холл";
        }

        // Рендер
        this.roomName.innerText = displayName;
        this.roomType.innerText = typeText;
        
        if (displayAvatar && displayAvatar.startsWith('http')) {
            this.roomAvatar.style.backgroundImage = `url('${displayAvatar}')`;
            this.roomAvatar.innerText = "";
        } else {
            this.roomAvatar.style.backgroundImage = "none";
            this.roomAvatar.innerText = "#";
        }

        // Участники
        // Если DM или General - логика немного отличается
        if (room.id === 'general' || !room.members) {
            this.loadAllUsers();
        } else {
            this.loadMembers(room.members);
        }

        // Медиа
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
            
            const bannerStyle = (user.banner && user.banner !== 'none') ? `background-image: url('${user.banner}');` : '';
            const avatarUrl = user.avatar || 'avatars/Ari LoL.png';
            
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
            
            // Клик по карточке открывает личку (DM)
            card.style.cursor = "pointer";
            card.addEventListener('click', async () => {
                if (user.uid === this.currentUser.uid) return;
                
                card.style.opacity = "0.5";
                try {
                    const dmRoom = await ChatService.getOrCreateDirectChat(this.currentUser.uid, user.uid);
                    // Передаем виртуальные данные, чтобы UI сразу обновился
                    dmRoom.virtualName = user.nickname;
                    dmRoom.virtualAvatar = user.avatar;
                    
                    document.dispatchEvent(new CustomEvent('room-selected', { detail: dmRoom }));
                    if (window.innerWidth < 1000) this.el.classList.add('closed');
                } catch (e) {
                    console.error(e);
                } finally {
                    card.style.opacity = "1";
                }
            });
            
            this.membersList.appendChild(card);
        });
    }

    renderMedia(messages) {
        this.mediaGrid.innerHTML = '';
        const images = [];
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
