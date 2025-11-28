import { db } from "../config.js";
import { 
    collection, addDoc, query, where, orderBy, onSnapshot, doc, getDoc, setDoc, updateDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

export const ChatService = {
    // --- ПРОФИЛИ ---
    getProfile: async (uid, email) => {
        const ref = doc(db, "users", uid);
        const snap = await getDoc(ref);
        if (snap.exists()) return snap.data();
        
        const defaultProfile = {
            nickname: email.split('@')[0], avatar: "avatars/Ari LoL.png",
            intensity: 0.3, status: "online", bio: "В сети", effect: 'liquid', frame: 'frame-none', banner: 'none'
        };
        await setDoc(ref, defaultProfile);
        return defaultProfile;
    },

    updateUserProfile: async (uid, data) => {
        const ref = doc(db, "users", uid);
        await updateDoc(ref, data);
    },

    // --- КАТЕГОРИИ (НОВОЕ) ---
    createCategory: async (name, order) => {
        await addDoc(collection(db, "categories"), {
            name: name,
            order: order || Date.now(), // Для сортировки
            createdAt: Date.now()
        });
    },

    subscribeToCategories: (callback) => {
        const q = query(collection(db, "categories"), orderBy("order", "asc"));
        return onSnapshot(q, (snapshot) => {
            const cats = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(cats);
        });
    },

    // --- КОМНАТЫ ---
    
    // Создание (теперь принимает categoryId)
    createRoom: async (data, creatorUid) => {
        await addDoc(collection(db, "rooms"), {
            name: data.name,
            type: data.type, 
            password: data.password || "",
            categoryId: data.categoryId || "uncategorized", // ID категории
            avatar: data.avatar || "", 
            ownerId: creatorUid,
            members: [creatorUid],
            createdAt: Date.now()
        });
    },

    // Обновление комнаты (для редактирования и ПЕРЕТАСКИВАНИЯ)
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

    sendMessage: async (msgData) => {
        await addDoc(collection(db, "messages"), { ...msgData, createdAt: Date.now() });
    }
};
