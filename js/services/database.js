import { db } from "../config.js";
import { 
    collection, addDoc, query, where, orderBy, onSnapshot, doc, getDoc, setDoc, updateDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export const ChatService = {
    // --- ПРОФИЛИ ---
    getProfile: async (uid, email) => {
        const ref = doc(db, "users", uid);
        const snap = await getDoc(ref);
        if (snap.exists()) return snap.data();
        
        const defaultProfile = {
            nickname: email.split('@')[0],
            avatar: "avatars/Ari LoL.png",
            intensity: 0.3, status: "online", bio: "В сети", effect: 'liquid', frame: 'frame-none', banner: 'none'
        };
        await setDoc(ref, defaultProfile);
        return defaultProfile;
    },

    updateUserProfile: async (uid, data) => {
        const ref = doc(db, "users", uid);
        await updateDoc(ref, data);
    },

    // --- КАТЕГОРИИ ---
    createCategory: async (name) => {
        await addDoc(collection(db, "categories"), {
            name: name,
            order: Date.now(), 
            createdAt: Date.now()
        });
    },

    updateCategory: async (catId, data) => {
        const ref = doc(db, "categories", catId);
        await updateDoc(ref, data);
    },

    subscribeToCategories: (callback) => {
        const q = query(collection(db, "categories"), orderBy("order", "asc"));
        return onSnapshot(q, (snapshot) => {
            const cats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(cats);
        });
    },

    // --- КОМНАТЫ ---
    createRoom: async (data, creatorUid) => {
        await addDoc(collection(db, "rooms"), {
            name: data.name,
            type: data.type, 
            password: data.password || "",
            categoryId: data.categoryId || "root", 
            avatar: data.avatar || "", 
            ownerId: creatorUid,
            members: [creatorUid],
            createdAt: Date.now(),
            lastMessageAt: Date.now() // Инициализируем время для сортировки/уведомлений
        });
    },

    updateRoom: async (roomId, data) => {
        const ref = doc(db, "rooms", roomId);
        await updateDoc(ref, data);
    },

    subscribeToRooms: (callback) => {
        const q = query(collection(db, "rooms"), orderBy("createdAt", "asc"));
        return onSnapshot(q, (snapshot) => {
            const rooms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(rooms);
        });
    },

    // --- СООБЩЕНИЯ ---
    subscribeToMessages: (roomId, callback) => {
        const q = query(collection(db, "messages"), where("room", "==", roomId), orderBy("createdAt", "asc"));
        return onSnapshot(q, (snapshot) => {
            const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(messages);
        });
    },

    // Обновленный метод отправки
    sendMessage: async (msgData) => {
        // 1. Создаем сообщение
        await addDoc(collection(db, "messages"), {
            ...msgData,
            createdAt: Date.now()
        });

        // 2. Обновляем метку времени в комнате (для уведомлений)
        // Проверяем, что это не личные сообщения (у них ID = UID пользователя, обычно длинный, но на всякий случай)
        // В текущей реализации ID комнат от Firebase длинные, а "Избранное" = UID юзера.
        // Чтобы "Избранное" тоже апалось, можно убрать проверку или адаптировать логику.
        // Сейчас обновляем только реальные комнаты из коллекции rooms.
        if (msgData.room && msgData.room !== 'general') {
            try {
                // Пытаемся обновить документ комнаты. Если это "Избранное" (нет в rooms), Firebase выдаст ошибку, которую мы подавим.
                // Либо можно проверить существование, но updateDoc просто упадет если дока нет.
                const roomRef = doc(db, "rooms", msgData.room);
                await updateDoc(roomRef, { 
                    lastMessageAt: Date.now() 
                });
            } catch (e) {
                // Игнорируем, если пишем в "Избранное" или комнату, которой нет в коллекции rooms
            }
        }
    }
};
