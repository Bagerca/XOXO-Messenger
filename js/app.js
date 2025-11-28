import { AuthService } from "./services/auth.js";
import { ChatService } from "./services/database.js";
import { AvatarRenderer } from "./core/avatar.js";
import { ChatUI } from "./ui/chat-ui.js";

console.log("🚀 App initializing...");

AuthService.monitor(async (user) => {
    if (!user) {
        window.location.href = "index.html";
        return;
    }

    console.log("✅ Logged in:", user.email);
    
    // 1. Получаем данные пользователя
    const profile = await ChatService.getProfile(user.uid, user.email);
    
    // 2. Инициализируем UI
    const chatUI = new ChatUI(user, profile);
    chatUI.loadRoom("general");

    // 3. Инициализируем Аватар в сайдбаре
    new AvatarRenderer("my-avatar-3d", profile.avatar);

    // 4. Заполняем имя
    document.getElementById("my-name").innerText = profile.nickname;
});
