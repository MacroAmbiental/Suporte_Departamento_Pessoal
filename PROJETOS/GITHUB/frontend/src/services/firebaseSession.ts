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

export async function encerrarSessaoServidor(): Promise<void> {
  if (!firebaseApp) return;
  await signOut(getAuth(firebaseApp));
}
