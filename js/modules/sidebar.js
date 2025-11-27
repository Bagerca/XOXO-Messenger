import { state } from './state.js';
import { loadMessages } from './chat.js';
import { AvatarRenderer } from '../avatar-renderer.js';

let sidebarRenderer = null;

export function initSidebar() {
    // Клики по комнатам
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const newRoom = btn.dataset.room;
            if (newRoom !== state.currentRoom) {
                state.currentRoom = newRoom;
                // Обновляем заголовок
                const roomName = btn.querySelector('span').innerText;
                document.getElementById('current-room-name').innerText = roomName;
                
                loadMessages(state.currentRoom);
            }
        });
    });

    // Инициализация WebGL аватара
    if (!sidebarRenderer && document.getElementById('webgl-avatar-container')) {
        sidebarRenderer = new AvatarRenderer(
            'webgl-avatar-container', 
            state.userProfile.avatar, 
            state.userProfile.effect
        );
    }
}

export function updateSidebarUI() {
    if(sidebarRenderer) {
        sidebarRenderer.updateImage(state.userProfile.avatar);
        sidebarRenderer.setEffect(state.userProfile.effect);
    }
    
    document.getElementById('user-display').innerText = state.userProfile.nickname || "Без имени";
    document.getElementById('user-status').innerText = state.userProfile.bio;
    document.getElementById('sidebar-status-dot').dataset.status = state.userProfile.status;
}
