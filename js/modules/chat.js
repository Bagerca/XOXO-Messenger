/* --- js/modules/chat.js (Частичная замена) --- */

// ... (импорты остаются)

// Глобальная переменная для отслеживания предыдущего сообщения
let lastMessage = null;

export function initChat() {
    const sendBtn = document.getElementById('send-btn');
    const input = document.getElementById('msg-input'); // Теперь это textarea
    
    // Авто-высота для textarea
    input.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
        if(this.value === '') this.style.height = 'auto';
    });

    sendBtn.addEventListener('click', handleSend);
    input.addEventListener('keydown', (e) => { 
        if (e.key === 'Enter' && !e.shiftKey) { // Shift+Enter для переноса строки
            e.preventDefault();
            handleSend();
        }
    });

    // ... (остальные листнеры: reply, edit и т.д.)
}

export function loadMessages(room) {
    const chatWindow = document.getElementById('chat-window');
    
    // Сброс при смене комнаты
    if (unsubscribeMessages) unsubscribeMessages();
    chatWindow.innerHTML = "";
    lastMessage = null; // Сбрасываем трекер

    const q = query(collection(db, "messages"), where("room", "==", room), orderBy("createdAt"));

    unsubscribeMessages = onSnapshot(q, (snapshot) => {
        // Умная перерисовка: 
        // В идеале нужен Diff алгоритм, но для простоты мы очищаем и перерисовываем всё при инициализации,
        // а новые сообщения добавляем в конец.
        
        // В рамках этого примера (чтобы работала группировка "на лету"),
        // проще всего очищать окно при больших изменениях, но Firebase snapshot
        // дает нам docChanges.
        
        // Для MVP ре-рендеринг списка при инициализации:
        if(snapshot.docChanges().length > 1) { 
             chatWindow.innerHTML = ""; 
             lastMessage = null;
        }

        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                renderMessageSmart(change.doc.id, change.doc.data(), chatWindow);
            }
            // Modified и Removed требуют поиска по ID и сложнее с группировкой,
            // пока оставим простую логику обновления текста.
            if (change.type === "modified") updateMessageDOM(change.doc.id, change.doc.data());
            if (change.type === "removed") document.getElementById(`msg-row-${change.doc.id}`)?.remove();
        });
        
        // Скролл вниз
        setTimeout(() => chatWindow.scrollTop = chatWindow.scrollHeight, 50);
    });
}

function renderMessageSmart(id, msg, container) {
    const isMe = msg.senderEmail === state.currentUser.email;
    
    // Логика группировки
    let isGroupStart = true;
    let isGroupEnd = true; // Пока считаем, что это последнее (новое)
    
    // Если есть предыдущее сообщение
    if (lastMessage) {
        const timeDiff = msg.createdAt - lastMessage.createdAt;
        const isSameUser = msg.senderEmail === lastMessage.senderEmail;
        
        // Если тот же юзер и прошло меньше 2 минут
        if (isSameUser && timeDiff < 120000) {
            isGroupStart = false;
            
            // Находим предыдущий DOM элемент и убираем у него класс group-end
            const prevRow = document.getElementById(`msg-row-${lastMessage.id}`);
            if (prevRow) prevRow.classList.remove('group-end');
        }
    }

    // Создаем DOM
    const row = document.createElement('div');
    row.id = `msg-row-${id}`;
    row.className = `message-row ${isMe ? 'right' : 'left'} ${isGroupStart ? 'group-start' : ''} group-end`;
    
    const date = new Date(msg.createdAt);
    const timeStr = `${date.getHours().toString().padStart(2,'0')}:${date.getMinutes().toString().padStart(2,'0')}`;
    const avatarUrl = msg.senderAvatar || state.localAvatars[0];

    // HTML Структура
    row.innerHTML = `
        <!-- Колонка с аватаром (слева) -->
        <div class="avatar-column">
            <div class="msg-avatar" style="background-image: url('${avatarUrl}')" title="${msg.sender}"></div>
        </div>

        <!-- Контент -->
        <div class="msg-content-wrapper">
            ${(!isMe && isGroupStart) ? `<div class="msg-sender-name">${escapeHtml(msg.sender)}</div>` : ''}
            
            <div class="msg-bubble" id="bubble-${id}">
                
                <!-- Ответ (Reply) -->
                ${msg.replyTo ? `
                    <div class="reply-attachment" onclick="scrollToMessage('${msg.replyTo.id}')">
                        <div class="reply-name">${escapeHtml(msg.replyTo.sender)}</div>
                        <div class="reply-text">${escapeHtml(msg.replyTo.text)}</div>
                    </div>
                ` : ''}

                <!-- Текст -->
                <span id="text-${id}">${escapeHtml(msg.text)}</span>
                
                <!-- Время внутри пузыря -->
                <span class="msg-time-inline">
                    ${msg.isEdited ? '<span style="margin-right:4px">✎</span>' : ''}
                    ${timeStr}
                </span>
            </div>

            <!-- Реакции -->
            <div class="reactions-row" id="reacts-${id}" style="margin-left: 0; justify-content: ${isMe ? 'flex-end' : 'flex-start'}">
                ${renderReactionsHTML(id, msg.reactions)}
            </div>
        </div>

        <!-- Меню действий (скрыто, появляется при наведении) -->
        <div class="msg-actions">
            <!-- Кнопки те же, что и были -->
             <div class="action-btn" onclick="window.triggerReaction('${id}', '❤️')">❤️</div>
             <div class="action-btn" onclick="window.triggerReply('${id}')">${ICONS.reply}</div>
             ${isMe ? `<div class="action-btn" onclick="window.triggerEdit('${id}')">${ICONS.edit}</div>` : ''}
        </div>
    `;

    container.appendChild(row);
    
    // Обновляем "последнее сообщение"
    lastMessage = { ...msg, id: id };
}

// ... (handleSend нужно обновить, чтобы сбрасывать высоту textarea)
async function handleSend() {
    const input = document.getElementById('msg-input');
    const text = input.value.trim();
    if (!text) return;

    // ... (старая логика отправки) ...
    
    // Сброс высоты
    input.value = "";
    input.style.height = 'auto';
}
