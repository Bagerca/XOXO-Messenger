import { AuthService } from "./services/auth.js";

const loginBtn = document.getElementById('btn-login');
const errorMsg = document.getElementById('error-msg');
const loginInput = document.getElementById('login-input');
const passInput = document.getElementById('password-input');

// Функция входа
async function handleLogin() {
    const login = loginInput.value.trim();
    const password = passInput.value;

    errorMsg.innerText = "";

    if (!login || !password) {
        errorMsg.innerText = "Заполни все поля!";
        return;
    }

    loginBtn.innerText = "Входим...";
    loginBtn.disabled = true;

    try {
        // AuthService сам добавит @xoxo.com, если ты использовал код из прошлого ответа
        await AuthService.login(login, password);
        // Если успех, Firebase сработает в app.js, но здесь мы просто перекинем
        window.location.href = "chat.html";
    } catch (error) {
        console.error(error);
        loginBtn.innerText = "Войти в систему";
        loginBtn.disabled = false;

        if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found') {
            errorMsg.innerText = "Неверный логин или пароль";
        } else if (error.code === 'auth/invalid-email') {
             errorMsg.innerText = "Некорректный формат логина";
        } else {
            errorMsg.innerText = "Ошибка: " + error.code;
        }
    }
}

// Слушаем клик
loginBtn.addEventListener('click', handleLogin);

// Слушаем Enter в полях
passInput.addEventListener('keydown', (e) => {
    if(e.key === 'Enter') handleLogin();
});
