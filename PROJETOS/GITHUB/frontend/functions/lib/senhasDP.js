"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.migrarSenhasDP = exports.verSenhaDP = exports.conferirSenhaDP = void 0;
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
// F3b (05/11/2026): tira password / passwordHash de TODOS os systemUsers e
// guarda no systemUserSecrets. executar=false só conta (nada é gravado).
// Só para os logins de DP_VER_SENHAS. Pode rodar de novo sem problema.
exports.migrarSenhasDP = (0, https_1.onCall)({ region: "southamerica-east1", timeoutSeconds: 300 }, async (request) => {
    const quem = await usuarioDaSessao(request);
    if (!(0, senhaCripto_1.podeVerSenhas)(quem.id))
        throw new https_1.HttpsError("permission-denied", "Seu login não pode rodar a migração de senhas.");
    const executar = request.data?.executar === true;
    const db = (0, firestore_1.getFirestore)();
    const usuarios = await db.collection("systemUsers").get();
    const segredos = new Map((await db.collection(senhaCripto_1.COLECAO_SEGREDOS).get()).docs.map((doc) => [doc.id, doc]));
    const contagem = { logins: usuarios.size, comSenhaNoCadastro: 0, comSenhaEmTexto: 0, soHashAntigo: 0, jaTinhamSegredo: 0, ficamSemSenhaParaVer: 0 };
    const escritas = [];
    for (const usuario of usuarios.docs) {
        const texto = String(usuario.get("password") ?? "");
        const hash = String(usuario.get("passwordHash") ?? "");
        if (!texto && !hash)
            continue;
        contagem.comSenhaNoCadastro += 1;
        if (texto)
            contagem.comSenhaEmTexto += 1;
        else
            contagem.soHashAntigo += 1;
        const segredo = segredos.get(usuario.id);
        const scryptAtual = String(segredo?.get("scrypt") ?? "");
        if (segredo?.exists && (scryptAtual || segredo.get("legacyHash")))
            contagem.jaTinhamSegredo += 1;
        let dadosSegredo = null;
        if (scryptAtual) {
            // Já migrado (login novo): só guarda o texto se for a mesma senha.
            if (texto && !segredo?.get("password") && await (0, senhaCripto_1.conferirScrypt)(texto, scryptAtual))
                dadosSegredo = { password: texto };
        }
        else if (texto) {
            dadosSegredo = await (0, senhaCripto_1.dadosSegredoNovo)(texto);
        }
        else if (!segredo?.get("legacyHash")) {
            dadosSegredo = { legacyHash: hash, updatedAt: new Date().toISOString() };
        }
        const vaiTerTexto = Boolean(texto || segredo?.get("password"));
        if (!vaiTerTexto)
            contagem.ficamSemSenhaParaVer += 1;
        if (dadosSegredo)
            escritas.push({ ref: db.collection(senhaCripto_1.COLECAO_SEGREDOS).doc(usuario.id), dados: dadosSegredo });
        escritas.push({ ref: usuario.ref, dados: { password: firestore_1.FieldValue.delete(), passwordHash: firestore_1.FieldValue.delete() } });
    }
    if (executar) {
        // O segredo de cada login é gravado antes da limpeza dele; se cair no
        // meio, rodar de novo termina o serviço.
        for (let inicio = 0; inicio < escritas.length; inicio += 400) {
            const lote = db.batch();
            escritas.slice(inicio, inicio + 400).forEach(({ ref, dados }) => lote.set(ref, dados, { merge: true }));
            await lote.commit();
        }
        console.log("migrarSenhasDP executada", { por: quem.id, ...contagem });
    }
    return { executado: executar, ...contagem };
});
//# sourceMappingURL=senhasDP.js.map