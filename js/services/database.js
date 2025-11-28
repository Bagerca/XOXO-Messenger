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

    getUsersByIds: async (userIds) => {
        if (!userIds || userIds.length === 0) return [];
        const promises = userIds.map(uid => getDoc(doc(db, "users", uid)));
        const snapshots = await Promise.all(promises);
        return snapshots.map(snap => {
            if (snap.exists()) return { uid: snap.id, ...snap.data() };
            return { uid: snap.id, nickname: "Неизвестный", avatar: "", status: "offline", frame: "frame-none" };
        });
    },

    getAllUsers: async () => {
        const snapshot = await getDocs(collection(db, "users"));
        return snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
    },

    // --- КАТЕГОРИИ ---
    createCategory: async (name) => {
        await addDoc(collection(db, "categories"), { name: name, order: Date.now(), createdAt: Date.now() });
    },
    updateCategory: async (catId, data) => { await updateDoc(doc(db, "categories", catId), data); },
    deleteCategory: async (catId) => {
        const q = query(collection(db, "rooms"), where("categoryId", "==", catId));
        const snapshot = await getDocs(q);
        const batch = writeBatch(db);
        snapshot.forEach(doc => { batch.update(doc.ref, { categoryId: "root" }); });
        batch.delete(doc(db, "categories", catId));
        await batch.commit();
    },
    subscribeToCategories: (callback) => {
        const q = query(collection(db, "categories"), orderBy("order", "asc"));
        return onSnapshot(q, (snapshot) => {
            callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
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
    updateRoom: async (roomId, data) => { await updateDoc(doc(db, "rooms", roomId), data); },
    deleteRoom: async (roomId) => { await deleteDoc(doc(db, "rooms", roomId)); },
    leaveRoom: async (roomId, userId) => { await updateDoc(doc(db, "rooms", roomId), { members: arrayRemove(userId) }); },
    joinRoom: async (roomId, userId) => { await updateDoc(doc(db, "rooms", roomId), { members: arrayUnion(userId) }); },
    
    subscribeToRooms: (callback) => {
        const q = query(collection(db, "rooms"), orderBy("createdAt", "asc"));
        return onSnapshot(q, (snapshot) => {
            callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
    },

    // НОВОЕ: Личные чаты (Direct Messages)
    getOrCreateDirectChat: async (myUid, otherUid) => {
        // ID чата = два UID отсортированных по алфавиту
        const uids = [myUid, otherUid].sort();
        const chatId = `${uids[0]}_${uids[1]}`;

        const ref = doc(db, "rooms", chatId);
        const snap = await getDoc(ref);

        if (snap.exists()) {
            return { id: snap.id, ...snap.data() };
        } else {
            const otherUserSnap = await getDoc(doc(db, "users", otherUid));
            const otherUserData = otherUserSnap.exists() ? otherUserSnap.data() : { nickname: "User" };

            const roomData = {
                name: otherUserData.nickname, 
                type: 'dm',
                members: uids,
                createdAt: Date.now(),
                lastMessageAt: Date.now(),
                avatar: otherUserData.avatar || '',
                categoryId: 'root',
                isDM: true
            };
            await setDoc(ref, roomData);
            return { id: chatId, ...roomData };
        }
    },

    // НОВОЕ: Получить мои комнаты (для пересылки)
    getMyRooms: async (uid) => {
        const q = query(collection(db, "rooms"), where("members", "array-contains", uid));
        const snap = await getDocs(q);
        return snap.docs.map(d => ({id: d.id, ...d.data()}));
    },

    // --- СООБЩЕНИЯ ---
    subscribeToMessages: (roomId, callback) => {
        const q = query(collection(db, "messages"), where("room", "==", roomId), orderBy("createdAt", "asc"));
        return onSnapshot(q, (snapshot) => {
            callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
        });
    },
    sendMessage: async (msgData) => {
        await addDoc(collection(db, "messages"), { ...msgData, createdAt: Date.now() });
        if (msgData.room && msgData.room !== 'general') {
            try { await updateDoc(doc(db, "rooms", msgData.room), { lastMessageAt: Date.now() }); } catch (e) {}
        }
    },
    updateMessage: async (msgId, data) => { await updateDoc(doc(db, "messages", msgId), data); },
    deleteMessage: async (msgId) => { await deleteDoc(doc(db, "messages", msgId)); }
};
