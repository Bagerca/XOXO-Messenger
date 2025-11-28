import { ChatService } from "../services/database.js";
import { AuthService } from "../services/auth.js";
import { AvatarRenderer } from "../core/avatar.js";

export class ProfileManager {
    constructor(currentUser, profileData) {
        this.currentUser = currentUser;
        this.profile = profileData;
        
        // 3D Renderers
        this.mainAvatar = new AvatarRenderer("my-avatar-3d", this.profile.avatar, { effect: this.profile.effect || 'liquid', intensity: 0.3 });
        this.previewAvatar = new AvatarRenderer("prev-avatar-3d", this.profile.avatar, { effect: this.profile.effect || 'liquid', intensity: 0.5 });
        
        this.tempState = { ...this.profile };
        this.initUI();
        this.updateSidebarUI();
    }

    initUI() {
        // Elements
        this.els = {
            modal: document.getElementById('settings-modal'),
            btnOpen: document.getElementById('btn-settings-toggle'),
            btnClose: document.getElementById('btn-close-modal'),
            btnSave: document.getElementById('btn-save-settings'),
            btnLogout: document.getElementById('btn-logout-modal'),
            statusPopup: document.getElementById('status-popup'),
            statusDot: document.getElementById('current-status-dot'),
            inpNick: document.getElementById('set-nick'),
            inpBio: document.getElementById('set-bio'),
            prevNick: document.getElementById('prev-nick'),
            prevBio: document.getElementById('prev-bio'),
            prevBanner: document.getElementById('prev-banner'),
            prevFrame: document.getElementById('prev-frame'),
            btnViewVisuals: document.getElementById('btn-edit-visuals'),
            btnViewMain: document.getElementById('btn-back-visuals'),
            viewMain: document.getElementById('view-main'),
            viewVisuals: document.getElementById('view-visuals')
        };

        // Listeners
        this.els.btnOpen.addEventListener('click', () => this.openSettings());
        this.els.btnClose.addEventListener('click', () => this.els.modal.classList.remove('open'));
        
        // Status
        this.els.statusDot.addEventListener('click', (e) => { e.stopPropagation(); this.els.statusPopup.classList.toggle('active'); });
        document.querySelectorAll('.status-option').forEach(opt => {
            opt.addEventListener('click', async () => {
                const status = opt.dataset.status;
                this.els.statusDot.className = `status-dot ${status}`;
                this.els.statusPopup.classList.remove('active');
                await ChatService.updateUserProfile(this.currentUser.uid, { status });
            });
        });
        document.addEventListener('click', (e) => {
            if (!this.els.statusPopup.contains(e.target) && e.target !== this.els.statusDot) this.els.statusPopup.classList.remove('active');
        });

        // Save & Logout
        this.els.btnSave.addEventListener('click', () => this.saveSettings());
        this.els.btnLogout.addEventListener('click', () => { AuthService.logout(); window.location.href = "index.html"; });

        // Inputs
        this.els.inpNick.addEventListener('input', (e) => { this.tempState.nickname = e.target.value; this.els.prevNick.innerText = e.target.value; });
        this.els.inpBio.addEventListener('input', (e) => { this.tempState.bio = e.target.value; this.els.prevBio.innerText = e.target.value; });

        // Views
        this.els.btnViewVisuals.addEventListener('click', () => this.switchView(true));
        this.els.btnViewMain.addEventListener('click', () => this.switchView(false));

        // Grids
        this.setupGrid('grid-avatars', 'avatar', (val) => this.previewAvatar.updateImage(val));
        this.setupGrid('grid-banners', 'banner', (val) => this.els.prevBanner.style.backgroundImage = val !== 'none' ? `url('${val}')` : 'none');
        this.setupGrid('list-frames', 'frame', (val) => this.els.prevFrame.className = `avatar-frame ${val}`);
        this.setupGrid('list-shaders', 'effect', (val) => this.previewAvatar.updateSettings({ effect: val }));
    }

    updateSidebarUI() {
        document.getElementById("my-name").innerText = this.profile.nickname;
        document.getElementById("my-status-text").innerText = this.profile.bio;
        document.getElementById("my-banner-bg").style.backgroundImage = this.profile.banner && this.profile.banner !== 'none' ? `url('${this.profile.banner}')` : 'none';
        document.getElementById("my-avatar-frame").className = `avatar-frame ${this.profile.frame || 'frame-none'}`;
        this.els.statusDot.className = `status-dot ${this.profile.status || 'online'}`;
        this.mainAvatar.updateSettings({ effect: this.profile.effect || 'liquid' });
    }

    openSettings() {
        this.els.modal.classList.add('open');
        this.switchView(false);
        this.tempState = { ...this.profile };
        this.els.inpNick.value = this.profile.nickname;
        this.els.inpBio.value = this.profile.bio;
        this.syncPreview(this.profile);
        this.highlightSelection('grid-avatars', this.profile.avatar);
        this.highlightSelection('grid-banners', this.profile.banner || 'none');
        this.highlightSelection('list-frames', this.profile.frame || 'frame-none');
        this.highlightSelection('list-shaders', this.profile.effect || 'liquid');
    }

    syncPreview(data) {
        this.els.prevNick.innerText = data.nickname;
        this.els.prevBio.innerText = data.bio;
        this.els.prevBanner.style.backgroundImage = data.banner && data.banner !== 'none' ? `url('${data.banner}')` : 'none';
        this.els.prevFrame.className = `avatar-frame ${data.frame || 'frame-none'}`;
        this.previewAvatar.updateImage(data.avatar);
        this.previewAvatar.updateSettings({ effect: data.effect });
    }

    async saveSettings() {
        this.els.btnSave.innerText = "Сохраняем...";
        try {
            await ChatService.updateUserProfile(this.currentUser.uid, this.tempState);
            this.profile = { ...this.profile, ...this.tempState };
            this.updateSidebarUI();
            this.mainAvatar.updateImage(this.profile.avatar);
            this.els.btnSave.innerText = "Сохранено!";
            setTimeout(() => { this.els.btnSave.innerText = "Сохранить изменения"; this.els.modal.classList.remove('open'); }, 800);
        } catch (e) { console.error(e); this.els.btnSave.innerText = "Ошибка"; }
    }

    switchView(toVisuals) {
        if(toVisuals) {
            gsap.to(this.els.viewMain, {x: -50, opacity: 0, pointerEvents: 'none', duration: 0.3});
            gsap.fromTo(this.els.viewVisuals, {x: 50, opacity: 0}, {x: 0, opacity: 1, pointerEvents: 'all', duration: 0.3, delay: 0.1});
        } else {
            gsap.to(this.els.viewVisuals, {x: 50, opacity: 0, pointerEvents: 'none', duration: 0.3});
            gsap.fromTo(this.els.viewMain, {x: -50, opacity: 0}, {x: 0, opacity: 1, pointerEvents: 'all', duration: 0.3, delay: 0.1});
        }
    }

    setupGrid(id, key, callback) {
        document.getElementById(id).addEventListener('click', (e) => {
            const item = e.target.closest('[data-val]');
            if(!item) return;
            this.highlightSelection(id, item.dataset.val);
            this.tempState[key] = item.dataset.val;
            if(callback) callback(item.dataset.val);
        });
    }

    highlightSelection(containerId, value) {
        document.querySelectorAll(`#${containerId} [data-val]`).forEach(el => {
            if(el.dataset.val === value) el.classList.add(el.classList.contains('fx-btn') ? 'active' : 'selected');
            else el.classList.remove('selected', 'active');
        });
    }
}
