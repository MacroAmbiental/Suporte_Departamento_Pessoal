import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { HttpsError, type CallableRequest } from "firebase-functions/v2/https";

// Confere, no servidor, quem chamou a function: precisa da sessão aberta pelo
// entrarDP (uid = id do systemUsers) e, no momento da chamada, de usuário
// ativo com a ação pedida na tela (ou administrador). Mesma regra de
// userHasPermission em services/accessControl.ts.

if (!getApps().length) initializeApp();

export async function exigirPermissaoDP(
  request: CallableRequest<unknown>,
  screen: string,
  action: string,
): Promise<string> {
  const uid = request.auth?.uid;
  if (!uid || request.auth?.token.dp !== true) {
    throw new HttpsError("unauthenticated", "Sessão expirada. Saia e entre de novo no sistema.");
  }

  const db = getFirestore();
  const usuario = await db.collection("systemUsers").doc(uid).get();
  if (!usuario.exists || usuario.get("active") === false) {
    throw new HttpsError("permission-denied", "Usuário inativo ou inexistente.");
  }
  if (usuario.get("isAdmin") === true) return uid;

  const permissoes = await db.collection("systemPermissions")
    .where("userId", "==", uid)
    .where("screen", "==", screen)
    .get();
  const permitido = permissoes.docs.some((doc) => {
    const actions = doc.get("actions");
    return Array.isArray(actions) && (actions.includes("manage") || actions.includes(action));
  });
  if (!permitido) {
    throw new HttpsError("permission-denied", "Sem permissão para esta ação.");
  }
  return uid;
}
