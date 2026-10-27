import { getAuth, signInWithCustomToken, signOut } from "firebase/auth";
import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp } from "@/services/firebase";

// Sessão do Firebase Auth aberta pela function "entrarDP", que confere
// usuário e senha no servidor. O login da tela não depende dela: se falhar,
// o sistema segue como antes (só o que exige a sessão fica indisponível).

export async function iniciarSessaoServidor(username: string, password: string): Promise<void> {
  if (!firebaseApp) return;
  const entrar = httpsCallable<{ username: string; password: string }, { token: string }>(
    getFunctions(firebaseApp, "southamerica-east1"),
    "entrarDP",
  );
  const { data } = await entrar({ username, password });
  await signInWithCustomToken(getAuth(firebaseApp), data.token);
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
