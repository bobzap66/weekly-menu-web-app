import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCrvc0wFdvPpICniQ9NQr5X7He_swfpkD8",
  authDomain: "weekly-menu-ec4f6.firebaseapp.com",
  projectId: "weekly-menu-ec4f6",
  storageBucket: "weekly-menu-ec4f6.firebasestorage.app",
  messagingSenderId: "782715215038",
  appId: "1:782715215038:web:dc5a7e25e2c05dfee712ef",
  measurementId: "G-DGJFX5WT08",
};

export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);
export const db = getFirestore(firebaseApp);
