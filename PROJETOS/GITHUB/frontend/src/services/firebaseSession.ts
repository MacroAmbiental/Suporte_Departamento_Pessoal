import { getAuth, onAuthStateChanged, signInWithCustomToken, signOut, type User as FirebaseUser } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp } from "@/services/firebase";

// Sessão do Firebase Auth aberta pela function "entrarDP", que confere
// usuário e senha no servidor. Desde 03/11/2026 o login depende dela: o banco
// do DP só aceita quem tem essa sessão (uid = id do systemUsers).

export const SERVIDOR_INDISPONIVEL = "Não foi possível conferir o login no servidor. Verifique a internet e tente de novo.";

// Recusa com mensagem própria para a tela (ex.: bloqueio por tentativas).
export class LoginRecusadoServidor extends Error {}

// true = sessão aberta; false = usuário/senha recusados pelo servidor.
// Outros erros (rede, servidor fora) são lançados com SERVIDOR_INDISPONIVEL.
export async function iniciarSessaoServidor(username: string, password: string): Promise<boolean> {
  if (!firebaseApp) throw new Error("Firebase não configurado.");
  const entrar = httpsCallable<{ username: string; password: string }, { token: string }>(
    getFunctions(firebaseApp, "southamerica-east1"),
    "entrarDP",
  );
  let token: string;
  try {
    ({ data: { token } } = await entrar({ username, password }));
  } catch (error) {
    const code = (error as { code?: string })?.code ?? "";
    if (code === "functions/permission-denied" || code === "functions/invalid-argument") return false;
    // Bloqueio por excesso de tentativas (05/11/2026): mostra a mensagem do servidor.
    if (code === "functions/resource-exhausted") {
      throw new LoginRecusadoServidor((error as { message?: string })?.message || "Muitas tentativas de login. Aguarde alguns minutos.");
    }
    console.error("Falha ao abrir a sessão no servidor.", error);
    throw new Error(SERVIDOR_INDISPONIVEL);
  }
  await signInWithCustomToken(getAuth(firebaseApp), token);
  return true;
}

// 06/11/2026: o backend Python (documentacao-dp.onrender.com) só aceita
// chamada com o token da sessão do DP no cabeçalho Authorization.
export async function cabecalhoSessaoDP(): Promise<Record<string, string>> {
  try {
    if (!firebaseApp) return {};
    const auth = getAuth(firebaseApp);
    await auth.authStateReady();
    const token = await auth.currentUser?.getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

// Uid da sessão já salva no navegador (espera o Firebase carregar).
export async function uidSessaoSalva(): Promise<string | null> {
  if (!firebaseApp) return null;
  const auth = getAuth(firebaseApp);
  await auth.authStateReady();
  return auth.currentUser?.uid ?? null;
}

export function observarSessao(callback: (user: FirebaseUser | null) => void): () => void {
  if (!firebaseApp) return () => undefined;
  return onAuthStateChanged(getAuth(firebaseApp), callback);
}

export const SESSAO_EXPIRADA = "Sessão expirada. Saia e entre de novo no sistema para gravar no Secullum.";

// Antes de uma ação que exige a sessão (functions do Secullum): ela precisa
// existir e ser do mesmo usuário logado na tela.
export async function exigirSessaoServidor(userId: string | undefined): Promise<void> {
  if (!firebaseApp) throw new Error("Firebase não configurado.");
  const auth = getAuth(firebaseApp);
  await auth.authStateReady();
  if (!userId || auth.currentUser?.uid !== userId) throw new Error(SESSAO_EXPIRADA);
}

export async function encerrarSessaoServidor(): Promise<void> {
  if (!firebaseApp) return;
  await signOut(getAuth(firebaseApp));
}

// 05/11/2026 (F3): senha só é conferida/mostrada no servidor.
const chamar = <I, O>(nome: string) => {
  if (!firebaseApp) throw new Error("Firebase não configurado.");
  return httpsCallable<I, O>(getFunctions(firebaseApp, "southamerica-east1"), nome);
};

// Confere a senha de quem está logado (ações protegidas, ex.: exportar com salário).
export async function conferirSenhaServidor(password: string): Promise<boolean> {
  try {
    const { data } = await chamar<{ password: string }, { ok: boolean }>("conferirSenhaDP")({ password });
    return data.ok === true;
  } catch (error) {
    const code = (error as { code?: string })?.code ?? "";
    if (code === "functions/resource-exhausted") throw new LoginRecusadoServidor((error as Error).message);
    throw error;
  }
}

// Só o login liberado no servidor (marca verSenhas na sessão) pode ver senhas.
export async function podeVerSenhas(): Promise<boolean> {
  if (!firebaseApp) return false;
  const auth = getAuth(firebaseApp);
  await auth.authStateReady();
  const token = await auth.currentUser?.getIdTokenResult();
  return token?.claims.verSenhas === true;
}

export async function verSenhaServidor(userId: string): Promise<string | null> {
  const { data } = await chamar<{ userId: string }, { senha: string | null }>("verSenhaDP")({ userId });
  return data.senha;
}

// "Trocar minha senha": o servidor confere a atual e grava a nova.
export async function trocarMinhaSenhaServidor(atual: string, nova: string): Promise<void> {
  try {
    await chamar<{ atual: string; nova: string }, { ok: boolean }>("trocarMinhaSenhaDP")({ atual, nova });
  } catch (error) {
    const message = (error as Error)?.message || "";
    throw new Error(message && message !== "internal" ? message : "Não foi possível trocar a senha. Tente de novo.");
  }
}
