"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.verSenhaDP = exports.conferirSenhaDP = void 0;
const app_1 = require("firebase-admin/app");
const firestore_1 = require("firebase-admin/firestore");
const https_1 = require("firebase-functions/v2/https");
const entrarDP_1 = require("./entrarDP");
const senhaCripto_1 = require("./senhaCripto");
// 05/11/2026 (F3): com a senha fora do systemUsers, o navegador não confere
// mais senha nenhuma sozinho. Estas functions fazem isso no servidor.
if (!(0, app_1.getApps)().length)
    (0, app_1.initializeApp)();
async function usuarioDaSessao(request) {
    const uid = request.auth?.uid;
    if (!uid || request.auth?.token.dp !== true) {
        throw new https_1.HttpsError("unauthenticated", "Sessão expirada. Saia e entre de novo no sistema.");
    }
    const usuario = await (0, firestore_1.getFirestore)().collection("systemUsers").doc(uid).get();
    if (!usuario.exists || usuario.get("active") === false) {
        throw new https_1.HttpsError("permission-denied", "Usuário inativo ou inexistente.");
    }
    return usuario;
}
// "Confirmar senha" das ações protegidas (exportar com salário etc.): confere
// a senha de quem está logado. Erros contam no mesmo limite do login.
exports.conferirSenhaDP = (0, https_1.onCall)({ region: "southamerica-east1" }, async (request) => {
    const usuario = await usuarioDaSessao(request);
    const senha = typeof request.data?.password === "string" ? request.data.password : "";
    if (!senha || senha.length > 200)
        return { ok: false };
    const username = (0, senhaCripto_1.normalizeUsername)(String(usuario.get("username") ?? ""));
    const ids = (0, entrarDP_1.idsContadores)(username, (0, entrarDP_1.ipDaChamada)(request));
    await (0, entrarDP_1.conferirBloqueio)(ids);
    const db = (0, firestore_1.getFirestore)();
    const segredo = await db.collection(senhaCripto_1.COLECAO_SEGREDOS).doc(usuario.id).get();
    const conferencia = await (0, senhaCripto_1.conferirSenha)(usuario, segredo, senha);
    if (!conferencia.ok) {
        await (0, entrarDP_1.registrarFalha)(ids, username);
        return { ok: false };
    }
    if (conferencia.atualizar)
        await db.collection(senhaCripto_1.COLECAO_SEGREDOS).doc(usuario.id).set(await (0, senhaCripto_1.dadosSegredoNovo)(senha), { merge: true });
    return { ok: true };
});
// "Ver senha" de outro login: só para os ids de DP_VER_SENHAS. Cada consulta
// fica registrada em senhaConsultas (também fechada para o navegador).
exports.verSenhaDP = (0, https_1.onCall)({ region: "southamerica-east1" }, async (request) => {
    const usuario = await usuarioDaSessao(request);
    if (!(0, senhaCripto_1.podeVerSenhas)(usuario.id))
        throw new https_1.HttpsError("permission-denied", "Seu login não pode ver senhas.");
    const alvoId = String(request.data?.userId ?? "");
    if (!/^[A-Za-z0-9_-]{1,200}$/.test(alvoId))
        throw new https_1.HttpsError("invalid-argument", "Login inválido.");
    const db = (0, firestore_1.getFirestore)();
    const [alvo, segredo] = await db.getAll(db.collection("systemUsers").doc(alvoId), db.collection(senhaCripto_1.COLECAO_SEGREDOS).doc(alvoId));
    if (!alvo.exists)
        throw new https_1.HttpsError("not-found", "Login não encontrado.");
    const senha = String(segredo.get("password") ?? "") || String(alvo.get("password") ?? "");
    await db.collection("senhaConsultas").add({
        quemId: usuario.id,
        quem: String(usuario.get("username") ?? ""),
        deId: alvoId,
        de: String(alvo.get("username") ?? ""),
        encontrou: Boolean(senha),
        em: new Date().toISOString(),
    });
    return { senha: senha || null };
});
// F3b (05/11/2026): a migração (migrarSenhasDP) rodou uma vez em produção
// (27 logins) e foi apagada; está no histórico do git (commit 4d54ac0).
//# sourceMappingURL=senhasDP.js.map