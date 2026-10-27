"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exigirPermissaoDP = exigirPermissaoDP;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
// Confere, no servidor, quem chamou a function: precisa da sessão aberta pelo
// entrarDP (uid = id do systemUsers) e, no momento da chamada, de usuário
// ativo com a ação pedida na tela (ou administrador). Mesma regra de
// userHasPermission em services/accessControl.ts.
if (!(0, app_1.getApps)().length)
    (0, app_1.initializeApp)();
async function exigirPermissaoDP(request, screen, action) {
    const uid = request.auth?.uid;
    if (!uid || request.auth?.token.dp !== true) {
        throw new https_1.HttpsError("unauthenticated", "Sessão expirada. Saia e entre de novo no sistema.");
    }
    const db = (0, firestore_1.getFirestore)();
    const usuario = await db.collection("systemUsers").doc(uid).get();
    if (!usuario.exists || usuario.get("active") === false) {
        throw new https_1.HttpsError("permission-denied", "Usuário inativo ou inexistente.");
    }
    if (usuario.get("isAdmin") === true)
        return uid;
    const permissoes = await db.collection("systemPermissions")
        .where("userId", "==", uid)
        .where("screen", "==", screen)
        .get();
    const permitido = permissoes.docs.some((doc) => {
        const actions = doc.get("actions");
        return Array.isArray(actions) && (actions.includes("manage") || actions.includes(action));
    });
    if (!permitido) {
        throw new https_1.HttpsError("permission-denied", "Sem permissão para esta ação.");
    }
    return uid;
}
//# sourceMappingURL=permissaoDP.js.map