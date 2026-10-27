import { createHash, timingSafeEqual } from "crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";

// Login do DP conferido no servidor (27/10/2026).
// O login da tela continua conferindo no navegador como sempre; esta função
// confere de novo aqui e devolve um token do Firebase Auth com uid = id do
// systemUsers. É a base para as functions (Secullum) e, depois, as regras do
// Firestore saberem quem está chamando.

if (!getApps().length) initializeApp();

// Mesmas regras de services/accessControl.ts (normalizeUsername/hashPassword).
function normalizeUsername(username: string): string {
  return username
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 7);
}

function hashPassword(password: string): string {
  return createHash("sha256").update(`macro-dp:${password}`, "utf8").digest("hex");
}

function iguais(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}

export const entrarDP = onCall({ region: "southamerica-east1" }, async (request) => {
  const entrada = (request.data ?? {}) as Record<string, unknown>;
  const username = normalizeUsername(typeof entrada.username === "string" ? entrada.username : "");
  const password = typeof entrada.password === "string" ? entrada.password : "";
  if (!username || !password || password.length > 200) {
    throw new HttpsError("invalid-argument", "Informe usuário e senha.");
  }

  const snapshot = await getFirestore()
    .collection("systemUsers")
    .where("username", "==", username)
    .limit(2)
    .get();
  const candidato = snapshot.docs.find((doc) => (
    normalizeUsername(String(doc.get("username") ?? "")) === username && doc.get("active") !== false
  ));

  const passwordHash = String(candidato?.get("passwordHash") ?? "");
  const senhaLegada = String(candidato?.get("password") ?? "");
  const valido = Boolean(candidato) && (
    (passwordHash !== "" && iguais(passwordHash, hashPassword(password)))
    || (senhaLegada !== "" && iguais(senhaLegada, password))
  );
  if (!candidato || !valido) {
    throw new HttpsError("permission-denied", "Usuário ou senha inválidos.");
  }

  const token = await getAuth().createCustomToken(candidato.id, { dp: true });
  return { token };
});
