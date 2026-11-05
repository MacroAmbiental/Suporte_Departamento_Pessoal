import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { conferirBloqueio, idsContadores, ipDaChamada, registrarFalha } from "./entrarDP";
import { COLECAO_SEGREDOS, conferirSenha, dadosSegredoNovo, normalizeUsername, podeVerSenhas } from "./senhaCripto";

// 05/11/2026 (F3): com a senha fora do systemUsers, o navegador não confere
// mais senha nenhuma sozinho. Estas functions fazem isso no servidor.

if (!getApps().length) initializeApp();

async function usuarioDaSessao(request: CallableRequest<unknown>) {
  const uid = request.auth?.uid;
  if (!uid || request.auth?.token.dp !== true) {
    throw new HttpsError("unauthenticated", "Sessão expirada. Saia e entre de novo no sistema.");
  }
  const usuario = await getFirestore().collection("systemUsers").doc(uid).get();
  if (!usuario.exists || usuario.get("active") === false) {
    throw new HttpsError("permission-denied", "Usuário inativo ou inexistente.");
  }
  return usuario;
}

// "Confirmar senha" das ações protegidas (exportar com salário etc.): confere
// a senha de quem está logado. Erros contam no mesmo limite do login.
export const conferirSenhaDP = onCall({ region: "southamerica-east1" }, async (request) => {
  const usuario = await usuarioDaSessao(request);
  const senha = typeof (request.data as { password?: unknown })?.password === "string" ? (request.data as { password: string }).password : "";
  if (!senha || senha.length > 200) return { ok: false };

  const username = normalizeUsername(String(usuario.get("username") ?? ""));
  const ids = idsContadores(username, ipDaChamada(request));
  await conferirBloqueio(ids);

  const db = getFirestore();
  const segredo = await db.collection(COLECAO_SEGREDOS).doc(usuario.id).get();
  const conferencia = await conferirSenha(usuario, segredo, senha);
  if (!conferencia.ok) {
    await registrarFalha(ids, username);
    return { ok: false };
  }
  if (conferencia.atualizar) await db.collection(COLECAO_SEGREDOS).doc(usuario.id).set(await dadosSegredoNovo(senha), { merge: true });
  return { ok: true };
});

// "Ver senha" de outro login: só para os ids de DP_VER_SENHAS. Cada consulta
// fica registrada em senhaConsultas (também fechada para o navegador).
export const verSenhaDP = onCall({ region: "southamerica-east1" }, async (request) => {
  const usuario = await usuarioDaSessao(request);
  if (!podeVerSenhas(usuario.id)) throw new HttpsError("permission-denied", "Seu login não pode ver senhas.");

  const alvoId = String((request.data as { userId?: unknown })?.userId ?? "");
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(alvoId)) throw new HttpsError("invalid-argument", "Login inválido.");

  const db = getFirestore();
  const [alvo, segredo] = await db.getAll(db.collection("systemUsers").doc(alvoId), db.collection(COLECAO_SEGREDOS).doc(alvoId));
  if (!alvo.exists) throw new HttpsError("not-found", "Login não encontrado.");
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
