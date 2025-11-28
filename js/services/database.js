import { db } from "../config.js";
import { 
    collection, addDoc, query, where, orderBy, onSnapshot, doc, getDoc, setDoc, updateDoc 
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export const ChatService = {
    // Получить профиль или создать дефолтный
    getProfile: async (uid, email) => {
        const ref = doc(db, "users", uid);
        const snap = await getDoc(ref);
        
        if (snap.exists()) return snap.data();
        
        const defaultProfile = {
            nickname: email.split('@')[0],
            avatar: "avatars/Ari LoL.png",
            intensity: 0.3,
            status: "online",
            bio: "В сети"
        };
        await setDoc(ref, defaultProfile);
        return defaultProfile;
    },

    // НОВАЯ ФУНКЦИЯ: Обновление профиля
    updateUserProfile: async (uid, data) => {
        const ref = doc(db, "users", uid);
        await updateDoc(ref, data);
    },

    // Слушать сообщения (Realtime)
    subscribeToMessages: (room, callback) => {
        const q = query(
            collection(db, "messages"),
            where("room", "==", room),
            orderBy("createdAt", "asc")
        );
        return onSnapshot(q, (snapshot) => {
            const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(messages);
        });
    },

    // Отправить сообщение
    sendMessage: async (msgData) => {
        await addDoc(collection(db, "messages"), {
            ...msgData,
            createdAt: Date.now()
        });
    }
};
