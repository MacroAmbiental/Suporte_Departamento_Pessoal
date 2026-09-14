import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import { getAnalytics, isSupported, type Analytics } from "firebase/analytics";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";
import { getStorage, type FirebaseStorage } from "firebase/storage";

const env = import.meta.env;

export const isFirebaseConfigured = Boolean(
  env.VITE_FIREBASE_API_KEY
    && env.VITE_FIREBASE_AUTH_DOMAIN
    && env.VITE_FIREBASE_PROJECT_ID
    && env.VITE_FIREBASE_APP_ID,
);

const firebaseConfig: FirebaseOptions = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: env.VITE_FIREBASE_APP_ID,
  measurementId: env.VITE_FIREBASE_MEASUREMENT_ID,
};

function initializeFirebaseApp(): FirebaseApp {
  return getApps().length ? getApp() : initializeApp(firebaseConfig);
}

function initializeFirebaseFirestore(app: FirebaseApp): Firestore {
  try {
    return initializeFirestore(app, {
      localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("already been called")) {
      return getFirestore(app);
    }

    throw error;
  }
}

export const firebaseApp: FirebaseApp | null = isFirebaseConfigured
  ? initializeFirebaseApp()
  : null;

// O cache persistente evita baixar novamente as mesmas coleções em cada recarga
// e compartilha o cache entre abas do mesmo navegador.
export const firestore: Firestore | null = firebaseApp
  ? initializeFirebaseFirestore(firebaseApp)
  : null;

export const storage: FirebaseStorage | null = firebaseApp ? getStorage(firebaseApp) : null;

export const analyticsPromise: Promise<Analytics | null> = firebaseApp
  ? isSupported().then((supported) => (supported ? getAnalytics(firebaseApp) : null)).catch(() => null)
  : Promise.resolve(null);
