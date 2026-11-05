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
//
// 05/11/2026: limite de tentativas (contra adivinhar senha no chute).
// - Por usuário: 5 erros em 15 min → bloqueado por 15 min.
// - Por endereço de internet (IP): 30 erros em 15 min → bloqueado por 15 min
//   (pega quem testa muitos usuários diferentes; o escritório inteiro sai pelo
//   mesmo IP, por isso o limite é mais alto).
// Durante o bloqueio nem a senha certa entra. Acertar a senha zera o contador
// do usuário. Contadores na coleção loginAttempts (só a function grava).
if (!(0, app_1.getApps)().length)
    (0, app_1.initializeApp)();
const JANELA_MS = 15 * 60 * 1000;
const BLOQUEIO_MS = 15 * 60 * 1000;
const LIMITE_USUARIO = 5;
const LIMITE_IP = 30;
const COLECAO = "loginAttempts";
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
function ipDaChamada(request) {
    const encaminhado = String(request.rawRequest?.headers?.["x-forwarded-for"] ?? "").split(",")[0].trim();
    return encaminhado || request.rawRequest?.ip || "desconhecido";
}
// Id do doc: usuário em claro (já normalizado, só letras); IP com hash para
// não guardar o endereço.
function idsContadores(username, ip) {
    return {
        usuario: `u_${username}`,
        ip: `ip_${(0, crypto_1.createHash)("sha256").update(ip, "utf8").digest("hex").slice(0, 32)}`,
    };
}
function lerContador(dados) {
    return {
        falhas: Number(dados?.falhas ?? 0),
        inicio: dados?.inicio?.toMillis() ?? 0,
        bloqueadoAte: dados?.bloqueadoAte?.toMillis() ?? 0,
    };
}
function mensagemBloqueio(ate, agora) {
    const minutos = Math.max(1, Math.ceil((ate - agora) / 60000));
    return `Muitas tentativas de login erradas. Tente de novo em ${minutos} minuto${minutos === 1 ? "" : "s"}.`;
}
async function conferirBloqueio(ids) {
    const db = (0, firestore_1.getFirestore)();
    const [usuario, ip] = await db.getAll(db.collection(COLECAO).doc(ids.usuario), db.collection(COLECAO).doc(ids.ip));
    const agora = Date.now();
    const ate = Math.max(lerContador(usuario.data()).bloqueadoAte, lerContador(ip.data()).bloqueadoAte);
    if (ate > agora)
        throw new https_1.HttpsError("resource-exhausted", mensagemBloqueio(ate, agora));
}
async function registrarFalha(ids, username) {
    const db = (0, firestore_1.getFirestore)();
    const refs = [
        { ref: db.collection(COLECAO).doc(ids.usuario), limite: LIMITE_USUARIO, tipo: "usuario" },
        { ref: db.collection(COLECAO).doc(ids.ip), limite: LIMITE_IP, tipo: "ip" },
    ];
    await db.runTransaction(async (tx) => {
        const snaps = await Promise.all(refs.map(({ ref }) => tx.get(ref)));
        const agora = Date.now();
        refs.forEach(({ ref, limite, tipo }, index) => {
            const atual = lerContador(snaps[index].data());
            const janelaNova = agora - atual.inicio > JANELA_MS;
            const falhas = janelaNova ? 1 : atual.falhas + 1;
            const inicio = janelaNova ? agora : atual.inicio;
            const bloqueia = falhas >= limite;
            tx.set(ref, {
                tipo,
                ...(tipo === "usuario" ? { username } : {}),
                falhas: bloqueia ? 0 : falhas,
                inicio: firestore_1.Timestamp.fromMillis(bloqueia ? agora : inicio),
                bloqueadoAte: bloqueia ? firestore_1.Timestamp.fromMillis(agora + BLOQUEIO_MS) : snaps[index].get("bloqueadoAte") ?? null,
                ultimaFalha: firestore_1.FieldValue.serverTimestamp(),
            });
        });
    });
}
exports.entrarDP = (0, https_1.onCall)({ region: "southamerica-east1" }, async (request) => {
    const entrada = (request.data ?? {});
    const username = normalizeUsername(typeof entrada.username === "string" ? entrada.username : "");
    const password = typeof entrada.password === "string" ? entrada.password : "";
    if (!username || !password || password.length > 200) {
        throw new https_1.HttpsError("invalid-argument", "Informe usuário e senha.");
    }
    const ids = idsContadores(username, ipDaChamada(request));
    await conferirBloqueio(ids);
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
        await registrarFalha(ids, username);
        throw new https_1.HttpsError("permission-denied", "Usuário ou senha inválidos.");
    }
    await (0, firestore_1.getFirestore)().collection(COLECAO).doc(ids.usuario).delete().catch(() => undefined);
    const token = await (0, auth_1.getAuth)().createCustomToken(candidato.id, { dp: true });
    return { token };
});
//# sourceMappingURL=entrarDP.js.map