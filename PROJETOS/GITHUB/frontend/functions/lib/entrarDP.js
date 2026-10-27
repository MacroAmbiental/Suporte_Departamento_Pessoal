"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.entrarDP = void 0;
const crypto_1 = require("crypto");
const app_1 = require("firebase-admin/app");
const auth_1 = require("firebase-admin/auth");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
// Login do DP conferido no servidor (27/10/2026).
// O login da tela continua conferindo no navegador como sempre; esta função
// confere de novo aqui e devolve um token do Firebase Auth com uid = id do
// systemUsers. É a base para as functions (Secullum) e, depois, as regras do
// Firestore saberem quem está chamando.
if (!(0, app_1.getApps)().length)
    (0, app_1.initializeApp)();
// Mesmas regras de services/accessControl.ts (normalizeUsername/hashPassword).
function normalizeUsername(username) {
    return username
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toUpperCase()
        .replace(/[^A-Z]/g, "")
        .slice(0, 7);
}
function hashPassword(password) {
    return (0, crypto_1.createHash)("sha256").update(`macro-dp:${password}`, "utf8").digest("hex");
}
function iguais(a, b) {
    const bufferA = Buffer.from(a, "utf8");
    const bufferB = Buffer.from(b, "utf8");
    return bufferA.length === bufferB.length && (0, crypto_1.timingSafeEqual)(bufferA, bufferB);
}
exports.entrarDP = (0, https_1.onCall)({ region: "southamerica-east1" }, async (request) => {
    const entrada = (request.data ?? {});
    const username = normalizeUsername(typeof entrada.username === "string" ? entrada.username : "");
    const password = typeof entrada.password === "string" ? entrada.password : "";
    if (!username || !password || password.length > 200) {
        throw new https_1.HttpsError("invalid-argument", "Informe usuário e senha.");
    }
    const snapshot = await (0, firestore_1.getFirestore)()
        .collection("systemUsers")
        .where("username", "==", username)
        .limit(2)
        .get();
    const candidato = snapshot.docs.find((doc) => (normalizeUsername(String(doc.get("username") ?? "")) === username && doc.get("active") !== false));
    const passwordHash = String(candidato?.get("passwordHash") ?? "");
    const senhaLegada = String(candidato?.get("password") ?? "");
    const valido = Boolean(candidato) && ((passwordHash !== "" && iguais(passwordHash, hashPassword(password)))
        || (senhaLegada !== "" && iguais(senhaLegada, password)));
    if (!candidato || !valido) {
        throw new https_1.HttpsError("permission-denied", "Usuário ou senha inválidos.");
    }
    const token = await (0, auth_1.getAuth)().createCustomToken(candidato.id, { dp: true });
    return { token };
});
//# sourceMappingURL=entrarDP.js.map