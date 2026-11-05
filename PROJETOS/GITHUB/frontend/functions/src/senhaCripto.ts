import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual, type ScryptOptions } from "crypto";
import type { DocumentSnapshot } from "firebase-admin/firestore";

// Senhas do DP (05/11/2026, F3).
// - Coleção systemUserSecrets/{id do systemUsers}: só as functions leem e
//   gravam (regras fecham para o navegador).
//     scrypt: hash forte com sal (é o que confere o login);
//     password: a senha em texto, só para a tela "Ver senha" (function
//       verSenhaDP, liberada só para os logins de DP_VER_SENHAS);
//     legacyHash: sha256 antigo, quando não há senha em texto para converter.
// - Enquanto a migração (F3b) não roda, os campos antigos passwordHash /
//   password do systemUsers continuam valendo como reserva.

export const COLECAO_SEGREDOS = "systemUserSecrets";

const scrypt = (senha: string, sal: Buffer, tamanho: number, opcoes: ScryptOptions) => new Promise<Buffer>((resolve, reject) => {
  scryptCallback(senha, sal, tamanho, opcoes, (erro, chave) => (erro ? reject(erro) : resolve(chave)));
});

const N = 16384, R = 8, P = 1, TAMANHO = 64;

// Mesmas regras de services/accessControl.ts (normalizeUsername/hashPassword).
export function normalizeUsername(username: string): string {
  return username
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z]/g, "")
    .slice(0, 7);
}

export function hashLegado(password: string): string {
  return createHash("sha256").update(`macro-dp:${password}`, "utf8").digest("hex");
}

export function iguais(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "utf8");
  const bufferB = Buffer.from(b, "utf8");
  return bufferA.length === bufferB.length && timingSafeEqual(bufferA, bufferB);
}

export async function gerarScrypt(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const chave = await scrypt(senha, sal, TAMANHO, { N, r: R, p: P });
  return `scrypt$${N}$${R}$${P}$${sal.toString("base64")}$${chave.toString("base64")}`;
}

export async function conferirScrypt(senha: string, guardado: string): Promise<boolean> {
  const [tipo, n, r, p, sal, chave] = guardado.split("$");
  if (tipo !== "scrypt" || !sal || !chave) return false;
  const esperado = Buffer.from(chave, "base64");
  const calculado = await scrypt(senha, Buffer.from(sal, "base64"), esperado.length, { N: Number(n), r: Number(r), p: Number(p) });
  return calculado.length === esperado.length && timingSafeEqual(calculado, esperado);
}

// Confere a senha do login. "atualizar" = acertou por um formato antigo e
// vale gravar o scrypt (e a senha em texto) no systemUserSecrets.
export async function conferirSenha(
  usuario: DocumentSnapshot,
  segredo: DocumentSnapshot | undefined,
  senha: string,
): Promise<{ ok: boolean; atualizar: boolean }> {
  const guardado = String(segredo?.get("scrypt") ?? "");
  if (guardado) return { ok: await conferirScrypt(senha, guardado), atualizar: false };

  const legados = [String(segredo?.get("legacyHash") ?? ""), String(usuario.get("passwordHash") ?? "")].filter(Boolean);
  const textos = [String(segredo?.get("password") ?? ""), String(usuario.get("password") ?? "")].filter(Boolean);
  const hash = hashLegado(senha);
  const ok = legados.some((valor) => iguais(valor, hash)) || textos.some((valor) => iguais(valor, senha));
  return { ok, atualizar: ok };
}

export async function dadosSegredoNovo(senha: string) {
  return { scrypt: await gerarScrypt(senha), password: senha, updatedAt: new Date().toISOString() };
}

// Quem pode ver a senha dos outros: ids do systemUsers em DP_VER_SENHAS
// (functions/.env), separados por vírgula.
export function podeVerSenhas(uid: string | undefined): boolean {
  if (!uid) return false;
  return String(process.env.DP_VER_SENHAS ?? "").split(",").map((id) => id.trim()).filter(Boolean).includes(uid);
}
