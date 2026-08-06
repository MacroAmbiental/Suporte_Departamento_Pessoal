import { initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { getAnalytics, isSupported, type Analytics } from "firebase/analytics";
import {
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

const env = import.meta.env;
const fallbackConfig = {
  apiKey: "AIzaSyDxss90AlvYWvhlUPIlW1HjZf01N6qOW1g",
  authDomain: "macro-ambiental.firebaseapp.com",
  projectId: "macro-ambiental",
  storageBucket: "macro-ambiental.firebasestorage.app",
  messagingSenderId: "539160683374",
  appId: "1:539160683374:web:ebbc79e4e1a4d4d944d77f",
  measurementId: "G-J387E86S8S",
};

export const isFirebaseConfigured = Boolean(
  (env.VITE_FIREBASE_API_KEY || fallbackConfig.apiKey)
    && (env.VITE_FIREBASE_AUTH_DOMAIN || fallbackConfig.authDomain)
    && (env.VITE_FIREBASE_PROJECT_ID || fallbackConfig.projectId)
    && (env.VITE_FIREBASE_APP_ID || fallbackConfig.appId),
);

const firebaseConfig: FirebaseOptions = {
  apiKey: env.VITE_FIREBASE_API_KEY ?? fallbackConfig.apiKey,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN ?? fallbackConfig.authDomain,
  projectId: env.VITE_FIREBASE_PROJECT_ID ?? fallbackConfig.projectId,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET ?? fallbackConfig.storageBucket,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID ?? fallbackConfig.messagingSenderId,
  appId: env.VITE_FIREBASE_APP_ID ?? fallbackConfig.appId,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID ?? fallbackConfig.measurementId,
};

export const firebaseApp: FirebaseApp | null = isFirebaseConfigured
  ? initializeApp(firebaseConfig)
  : null;

// O cache persistente evita baixar novamente as mesmas coleções em cada recarga
// e compartilha o cache entre abas do mesmo navegador.
export const firestore: Firestore | null = firebaseApp
  ? initializeFirestore(firebaseApp, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    })
  : null;

export const storage: FirebaseStorage | null = firebaseApp ? getStorage(firebaseApp) : null;

export const analyticsPromise: Promise<Analytics | null> = firebaseApp
  ? isSupported().then((supported) => (supported ? getAnalytics(firebaseApp) : null)).catch(() => null)
  : Promise.resolve(null);
