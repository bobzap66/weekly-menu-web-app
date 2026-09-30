import { initializeApp } from "https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js";
import {
  getAuth,
  getIdToken,
  reload,
} from "https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js";
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

// Email verification changes on Firebase's servers, while an already-open browser
// can still hold an older ID token. Firestore rules authorize shared lists from
// the token's email_verified claim, so synchronize the user and token before any
// importing module starts its list queries.
await auth.authStateReady();
if (auth.currentUser) {
  try {
    await reload(auth.currentUser);
    if (auth.currentUser?.emailVerified) {
      await getIdToken(auth.currentUser, true);
    }
  } catch (error) {
    // Authentication should still be usable if a transient refresh fails. The
    // normal account UI can surface verification/retry actions afterward.
    console.warn("Could not refresh Firebase account state before startup.", error);
  }
}
