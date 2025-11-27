import { state } from './state.js';
import { db } from '../../firebase-config.js'; // Путь на уровень выше
import { doc, updateDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { signOut, getAuth } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { AvatarRenderer } from '../avatar-renderer.js';
import { updateSidebarUI } from './sidebar.js';

const modal = document.getElementById('profile-modal');
const settingsBtn = document.getElementById('btn-settings');
const sidebarAvatar = document.getElementById('sidebar-avatar-wrap');
let previewRenderer = null;
let tempProfile = {};

export function initSettings() {
    settingsBtn.addEventListener('click', openSettings);
    sidebarAvatar.addEventListener('click', openSettings);
    document.getElementById('btn-close-modal').addEventListener('click', () => modal.style.display = 'none');
    
    // Кнопка сохранения
    document.getElementById('btn-save-profile').addEventListener('click', saveProfile);
    
    // Кнопка выхода
    const auth = getAuth();
    document.getElementById('btn-logout-settings').addEventListener('click', () => {
        signOut(auth).then(() => window.location.href = "index.html");
    });
    // Кнопка выхода в хедере (если есть)
    const headerLogout = document.getElementById('btn-logout');
    if(headerLogout) headerLogout.addEventListener('click', () => {
        signOut(auth).then(() => window.location.href = "index.html");
    });

    // Инициализация кликов по элементам настроек
    initUIListeners();
}

function openSettings() {
    modal.style.display = 'flex';
    tempProfile = { ...state.userProfile }; // Копия

    document.getElementById('input-nickname').value = tempProfile.nickname;
    document.getElementById('input-bio').value = tempProfile.bio;
    document.getElementById('preview-nickname').innerText = tempProfile.nickname;

    updateUIState();
    
    // WebGL Превью
    if (!previewRenderer && document.getElementById('preview-avatar-container')) {
        previewRenderer = new AvatarRenderer('preview-avatar-container', tempProfile.avatar, tempProfile.effect);
    } else if (previewRenderer) {
        previewRenderer.updateImage(tempProfile.avatar);
        previewRenderer.setEffect(tempProfile.effect);
    }
    
    // Загрузка сетки картинок
    renderAvatarGrid();
}

function initUIListeners() {
    // Статус
    document.querySelectorAll('.status-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            tempProfile.status = btn.dataset.status;
            updateUIState();
        });
    });
    // Шейдеры
    document.querySelectorAll('.shader-card').forEach(card => {
        card.addEventListener('click', () => {
            tempProfile.effect = card.dataset.val;
            updateUIState();
            if(previewRenderer) previewRenderer.setEffect(tempProfile.effect);
        });
    });
}

function renderAvatarGrid() {
    const grid = document.getElementById('avatar-grid');
    grid.innerHTML = "";
    state.localAvatars.forEach(url => {
        const div = document.createElement('div');
        div.className = 'avatar-option';
        div.style.backgroundImage = `url('${url}')`;
        if(url === tempProfile.avatar) div.classList.add('selected');
        
        div.addEventListener('click', () => {
            tempProfile.avatar = url;
            updateUIState();
            if(previewRenderer) previewRenderer.updateImage(url);
        });
        grid.appendChild(div);
    });
}

function updateUIState() {
    // Обновляем кнопки статуса
    document.querySelectorAll('.status-btn').forEach(b => b.classList.toggle('selected', b.dataset.status === tempProfile.status));
    // Обновляем шейдеры
    document.querySelectorAll('.shader-card').forEach(c => c.classList.toggle('selected', c.dataset.val === tempProfile.effect));
    // Обновляем аватарки
    document.querySelectorAll('.avatar-option').forEach(a => {
        // decodeURI нужен, если в имени файла пробелы
        const url = a.style.backgroundImage.slice(5, -2); // достаем url из css
        a.classList.toggle('selected', decodeURI(url).includes(tempProfile.avatar));
    });
}

async function saveProfile() {
    const newNick = document.getElementById('input-nickname').value.trim();
    if(!newNick) return alert("Имя не может быть пустым");

    tempProfile.nickname = newNick;
    tempProfile.bio = document.getElementById('input-bio').value.trim();

    // Обновляем глобальный стейт
    state.userProfile = { ...tempProfile };
    updateSidebarUI();

    // Сохраняем в БД
    await updateDoc(doc(db, "users", state.currentUser.uid), state.userProfile);
    modal.style.display = 'none';
}
