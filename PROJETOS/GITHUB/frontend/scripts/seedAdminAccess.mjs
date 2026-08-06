import process from "node:process";
import { createHash } from "node:crypto";
import { initializeApp } from "firebase/app";
import { doc, getFirestore, writeBatch } from "firebase/firestore";

const firebaseConfig = {
  apiKey: process.env.VITE_FIREBASE_API_KEY || "AIzaSyDxss90AlvYWvhlUPIlWlHjZf01N6qOW1g",
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN || "macro-ambiental.firebaseapp.com",
  projectId: process.env.VITE_FIREBASE_PROJECT_ID || "macro-ambiental",
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET || "macro-ambiental.firebasestorage.app",
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "539160683374",
  appId: process.env.VITE_FIREBASE_APP_ID || "1:539160683374:web:ebbc79e4e1a4d4d944d77f",
  measurementId: process.env.VITE_FIREBASE_MEASUREMENT_ID || "G-J387E86S8S",
};

const screens = [
  "dashboard",
  "companies",
  "records",
  "employees",
  "benefits",
  "timekeeping",
  "talentBank",
  "notifications",
  "permissions",
];
const actions = ["view", "create", "edit", "delete", "manage"];

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Informe a variável ${name}.`);
  return value;
}

function normalizeUsername(username) {
  return username.trim().toLowerCase();
}

function slug(value) {
  return normalizeUsername(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function initialsFromName(name, username) {
  const source = name.trim() || username.trim();
  const parts = source.split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : source.slice(0, 2)).toUpperCase();
}

function hashPassword(password) {
  return createHash("sha256").update(`macro-dp:${password}`).digest("hex");
}

function clean(value) {
  return JSON.parse(JSON.stringify(value));
}

async function main() {
  const name = requiredEnv("ADMIN_NAME");
  const username = normalizeUsername(requiredEnv("ADMIN_USERNAME"));
  const password = requiredEnv("ADMIN_PASSWORD");
  const now = new Date().toISOString();
  const passwordHash = hashPassword(password);
  const userId = `user-${slug(username)}`;
  const accessKeyId = `access-key-${slug(username)}-admin`;

  const app = initializeApp(firebaseConfig);
  const db = getFirestore(app);
  const batch = writeBatch(db);

  const systemUser = {
    id: userId,
    username,
    name,
    role: "Administrador",
    position: "TI",
    initials: initialsFromName(name, username),
    passwordHash,
    active: true,
    isAdmin: true,
    createdAt: now,
    updatedAt: now,
  };

  const accessKey = {
    id: accessKeyId,
    name: `Chave de acesso - ${name}`,
    keyHash: passwordHash,
    purpose: "admin",
    active: true,
    createdByUserId: userId,
    createdAt: now,
    updatedAt: now,
  };

  batch.set(doc(db, "systemUsers", userId), clean(systemUser), { merge: true });
  batch.set(doc(db, "accessKeys", accessKeyId), clean(accessKey), { merge: true });

  for (const screen of screens) {
    batch.set(doc(db, "systemPermissions", `${userId}-${screen}`), clean({
      id: `${userId}-${screen}`,
      userId,
      screen,
      actions,
      updatedAt: now,
    }), { merge: true });
  }

  await batch.commit();

  console.log("Administrador e chave de acesso gravados no Firestore.");
  console.log(`Projeto: ${firebaseConfig.projectId}`);
  console.log(`Usuário: ${username}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
