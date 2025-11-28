import { db } from "../config.js";
import { 
    collection, addDoc, query, where, orderBy, onSnapshot, doc, getDoc, setDoc, updateDoc, deleteDoc, arrayRemove, getDocs, writeBatch, arrayUnion
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

    // Получить массив конкретных пользователей (для групп)
    getUsersByIds: async (userIds) => {
        if (!userIds || userIds.length === 0) return [];
        
        // В продакшене лучше разбивать на чанки по 10 для запроса 'in', 
        // но для MVP используем Promise.all с getDoc
        const promises = userIds.map(uid => getDoc(doc(db, "users", uid)));
        const snapshots = await Promise.all(promises);
        
        return snapshots.map(snap => {
            if (snap.exists()) return { uid: snap.id, ...snap.data() };
            return { uid: snap.id, nickname: "Неизвестный", avatar: "", status: "offline", frame: "frame-none" };
        });
    },

    // НОВОЕ: Получить ВСЕХ пользователей (для Общего холла)
    getAllUsers: async () => {
        const snapshot = await getDocs(collection(db, "users"));
        return snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
    },

    // --- КАТЕГОРИИ ---
    createCategory: async (name) => {
        await addDoc(collection(db, "categories"), {
            name: name, order: Date.now(), createdAt: Date.now()
        });
    },

    updateCategory: async (catId, data) => {
        const ref = doc(db, "categories", catId);
        await updateDoc(ref, data);
    },

    deleteCategory: async (catId) => {
        const q = query(collection(db, "rooms"), where("categoryId", "==", catId));
        const snapshot = await getDocs(q);
        const batch = writeBatch(db);

        snapshot.forEach(doc => {
            batch.update(doc.ref, { categoryId: "root" });
        });

        const catRef = doc(db, "categories", catId);
        batch.delete(catRef);

        await batch.commit();
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
            name: data.name, type: data.type, password: data.password || "",
            categoryId: data.categoryId || "root", avatar: data.avatar || "", 
            ownerId: creatorUid, members: [creatorUid], createdAt: Date.now(),
            lastMessageAt: Date.now()
        });
    },

    updateRoom: async (roomId, data) => {
        const ref = doc(db, "rooms", roomId);
        await updateDoc(ref, data);
    },

    deleteRoom: async (roomId) => {
        await deleteDoc(doc(db, "rooms", roomId));
    },

    leaveRoom: async (roomId, userId) => {
        const ref = doc(db, "rooms", roomId);
        await updateDoc(ref, {
            members: arrayRemove(userId)
        });
    },

    // НОВОЕ: Вступить в комнату (добавить себя в members)
    joinRoom: async (roomId, userId) => {
        const ref = doc(db, "rooms", roomId);
        await updateDoc(ref, {
            members: arrayUnion(userId)
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
        const q = query(collection(db, "messages"), where("room", "==", roomId), orderBy("createdAt", "asc"));
        return onSnapshot(q, (snapshot) => {
            const messages = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(messages);
        });
    },

    sendMessage: async (msgData) => {
        await addDoc(collection(db, "messages"), { ...msgData, createdAt: Date.now() });
        if (msgData.room && msgData.room !== 'general') {
            try {
                const roomRef = doc(db, "rooms", msgData.room);
                await updateDoc(roomRef, { lastMessageAt: Date.now() });
            } catch (e) {}
        }
    },

    updateMessage: async (msgId, data) => {
        const ref = doc(db, "messages", msgId);
        await updateDoc(ref, data);
    },

    deleteMessage: async (msgId) => {
        const ref = doc(db, "messages", msgId);
        await deleteDoc(ref);
    }
};
