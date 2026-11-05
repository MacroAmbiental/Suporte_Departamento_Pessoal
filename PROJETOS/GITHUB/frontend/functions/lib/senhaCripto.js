"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.COLECAO_SEGREDOS = void 0;
exports.normalizeUsername = normalizeUsername;
exports.hashLegado = hashLegado;
exports.iguais = iguais;
exports.gerarScrypt = gerarScrypt;
exports.conferirSenha = conferirSenha;
exports.dadosSegredoNovo = dadosSegredoNovo;
exports.podeVerSenhas = podeVerSenhas;
const crypto_1 = require("crypto");
// Senhas do DP (05/11/2026, F3).
// - Coleção systemUserSecrets/{id do systemUsers}: só as functions leem e
//   gravam (regras fecham para o navegador).
//     scrypt: hash forte com sal (é o que confere o login);
//     password: a senha em texto, só para a tela "Ver senha" (function
//       verSenhaDP, liberada só para os logins de DP_VER_SENHAS);
//     legacyHash: sha256 antigo, quando não há senha em texto para converter.
// - Enquanto a migração (F3b) não roda, os campos antigos passwordHash /
//   password do systemUsers continuam valendo como reserva.
exports.COLECAO_SEGREDOS = "systemUserSecrets";
const scrypt = (senha, sal, tamanho, opcoes) => new Promise((resolve, reject) => {
    (0, crypto_1.scrypt)(senha, sal, tamanho, opcoes, (erro, chave) => (erro ? reject(erro) : resolve(chave)));
});
const N = 16384, R = 8, P = 1, TAMANHO = 64;
// Mesmas regras de services/accessControl.ts (normalizeUsername/hashPassword).
function normalizeUsername(username) {
    return username
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toUpperCase()
        .replace(/[^A-Z]/g, "")
        .slice(0, 7);
}
function hashLegado(password) {
    return (0, crypto_1.createHash)("sha256").update(`macro-dp:${password}`, "utf8").digest("hex");
}
function iguais(a, b) {
    const bufferA = Buffer.from(a, "utf8");
    const bufferB = Buffer.from(b, "utf8");
    return bufferA.length === bufferB.length && (0, crypto_1.timingSafeEqual)(bufferA, bufferB);
}
async function gerarScrypt(senha) {
    const sal = (0, crypto_1.randomBytes)(16);
    const chave = await scrypt(senha, sal, TAMANHO, { N, r: R, p: P });
    return `scrypt$${N}$${R}$${P}$${sal.toString("base64")}$${chave.toString("base64")}`;
}
async function conferirScrypt(senha, guardado) {
    const [tipo, n, r, p, sal, chave] = guardado.split("$");
    if (tipo !== "scrypt" || !sal || !chave)
        return false;
    const esperado = Buffer.from(chave, "base64");
    const calculado = await scrypt(senha, Buffer.from(sal, "base64"), esperado.length, { N: Number(n), r: Number(r), p: Number(p) });
    return calculado.length === esperado.length && (0, crypto_1.timingSafeEqual)(calculado, esperado);
}
// Confere a senha do login. "atualizar" = acertou por um formato antigo e
// vale gravar o scrypt (e a senha em texto) no systemUserSecrets.
async function conferirSenha(usuario, segredo, senha) {
    const guardado = String(segredo?.get("scrypt") ?? "");
    if (guardado)
        return { ok: await conferirScrypt(senha, guardado), atualizar: false };
    const legados = [String(segredo?.get("legacyHash") ?? ""), String(usuario.get("passwordHash") ?? "")].filter(Boolean);
    const textos = [String(segredo?.get("password") ?? ""), String(usuario.get("password") ?? "")].filter(Boolean);
    const hash = hashLegado(senha);
    const ok = legados.some((valor) => iguais(valor, hash)) || textos.some((valor) => iguais(valor, senha));
    return { ok, atualizar: ok };
}
async function dadosSegredoNovo(senha) {
    return { scrypt: await gerarScrypt(senha), password: senha, updatedAt: new Date().toISOString() };
}
// Quem pode ver a senha dos outros: ids do systemUsers em DP_VER_SENHAS
// (functions/.env), separados por vírgula.
function podeVerSenhas(uid) {
    if (!uid)
        return false;
    return String(process.env.DP_VER_SENHAS ?? "").split(",").map((id) => id.trim()).filter(Boolean).includes(uid);
}
//# sourceMappingURL=senhaCripto.js.map