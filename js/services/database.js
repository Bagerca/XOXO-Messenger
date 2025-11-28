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

    // --- КОМНАТЫ (ОБНОВЛЕНО) ---
    
    // Создание комнаты с категорией и аватаром
    createRoom: async (data, creatorUid) => {
        await addDoc(collection(db, "rooms"), {
            name: data.name,
            type: data.type, // 'public' или 'private'
            password: data.password || "", // Для совместимости (можно убрать если строго по приглашениям)
            category: data.category || "Разное",
            avatar: data.avatar || "", // URL картинки или css класс
            ownerId: creatorUid,
            members: [creatorUid], // Создатель сразу участник
            createdAt: Date.now()
        });
    },

    // Обновление комнаты (для владельца)
    updateRoom: async (roomId, data) => {
        const ref = doc(db, "rooms", roomId);
        await updateDoc(ref, data);
    },

    // Подписка на комнаты (фильтрацию сделаем на клиенте или через сложные запросы)
    // Firebase плохо умеет "OR" запросы в realtime, поэтому берем все, а фильтруем в app.js
    subscribeToRooms: (callback) => {
        const q = query(collection(db, "rooms"), orderBy("createdAt", "asc"));
        return onSnapshot(q, (snapshot) => {
            const rooms = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(rooms);
        });
    },

    // --- СООБЩЕНИЯ ---
    subscribeToMessages: (roomId, callback) => {
        // roomId может быть ID комнаты или ID пользователя (для Избранного)
        const q = query(collection(db, "messages"), where("room", "==", roomId), orderBy("createdAt", "asc"));
        return onSnapshot(q, (snapshot) => {
            const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(messages);
        });
    },

    sendMessage: async (msgData) => {
        await addDoc(collection(db, "messages"), {
            ...msgData,
            createdAt: Date.now()
        });
    }
};
