import { auth } from "../config.js";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";

export const AuthService = {
    login: async (login, password) => {
        const email = login + "@xoxo.com";
        return await signInWithEmailAndPassword(auth, email, password);
    },
    logout: async () => {
        return await signOut(auth);
    },
    monitor: (callback) => {
        onAuthStateChanged(auth, callback);
    },
    getCurrentUser: () => auth.currentUser
};
