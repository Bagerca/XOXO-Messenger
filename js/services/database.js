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
            intensity: 0.3,
            status: "online",
            bio: "В сети",
            effect: 'liquid',
            frame: 'frame-none',
            banner: 'none'
        };
        await setDoc(ref, defaultProfile);
        return defaultProfile;
    },

    updateUserProfile: async (uid, data) => {
        const ref = doc(db, "users", uid);
        await updateDoc(ref, data);
    },

    // --- КОМНАТЫ (ОБНОВЛЕНО) ---
    // Теперь принимает тип и пароль
    createRoom: async (name, type, password, createdBy) => {
        await addDoc(collection(db, "rooms"), {
            name: name,
            type: type, // 'public' или 'private'
            password: password || "", 
            createdAt: Date.now(),
            createdBy: createdBy
        });
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
        const target = roomId || "general";
        const q = query(collection(db, "messages"), where("room", "==", target), orderBy("createdAt", "asc"));
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
