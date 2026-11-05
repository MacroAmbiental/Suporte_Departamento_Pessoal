import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore, type DocumentSnapshot } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";

// Gravação de usuários, permissões e chaves de acesso do DP (05/11/2026, F2a).
// Antes o navegador gravava direto em systemUsers / systemPermissions /
// accessKeys, e qualquer usuário logado podia se dar isAdmin. Agora o site
// manda as mudanças para cá e esta função confere, no servidor:
// - quem chama tem sessão do DP (entrarDP), está ativo e tem acesso à tela
//   Permissões (manage, create, edit ou delete) — ou é administrador;
// - chaves de acesso (accessKeys): só administrador;
// - marcar alguém como administrador, ou mexer num usuário que já é
//   administrador (cadastro ou permissões): só administrador;
// - quem não é administrador não mexe nas próprias permissões.
// Depois que o Suporte e o Oficial usarem esta função, as regras do banco
// fecham a gravação direta nessas coleções (F2c).

if (!getApps().length) initializeApp();

const COLECOES = new Set(["systemUsers", "systemPermissions", "accessKeys"]);
const ACOES_TELA = ["manage", "create", "edit", "delete"];
const LIMITE = 2000;
const ID_VALIDO = /^[A-Za-z0-9_-]{1,200}$/;

type Mudanca =
  | { type: "set"; collection: string; item: Record<string, unknown> & { id: string } }
  | { type: "delete"; collection: string; id: string };

function lerMudancas(dados: unknown): Mudanca[] {
  const lista = (dados as { mutations?: unknown } | null)?.mutations;
  if (!Array.isArray(lista) || !lista.length) throw new HttpsError("invalid-argument", "Nenhuma alteração enviada.");
  if (lista.length > LIMITE) throw new HttpsError("invalid-argument", "Alterações demais de uma vez.");
  return lista.map((bruta) => {
    const mudanca = bruta as Record<string, unknown>;
    const collection = String(mudanca?.collection ?? "");
    if (!COLECOES.has(collection)) throw new HttpsError("invalid-argument", `Coleção não permitida: ${collection}.`);
    if (mudanca.type === "set") {
      const item = mudanca.item as Record<string, unknown> | undefined;
      if (!item || typeof item !== "object" || Array.isArray(item) || typeof item.id !== "string" || !ID_VALIDO.test(item.id)) {
        throw new HttpsError("invalid-argument", "Registro inválido.");
      }
      return { type: "set", collection, item: item as Record<string, unknown> & { id: string } };
    }
    if (mudanca.type === "delete") {
      const id = String(mudanca.id ?? "");
      if (!ID_VALIDO.test(id)) throw new HttpsError("invalid-argument", "Registro inválido.");
      return { type: "delete", collection, id };
    }
    throw new HttpsError("invalid-argument", "Tipo de alteração inválido.");
  });
}

const negar = (mensagem: string): never => {
  throw new HttpsError("permission-denied", mensagem);
};

export const gravarAcessosDP = onCall({ region: "southamerica-east1" }, async (request) => {
  const uid = request.auth?.uid;
  if (!uid || request.auth?.token.dp !== true) {
    throw new HttpsError("unauthenticated", "Sessão expirada. Saia e entre de novo no sistema.");
  }
  const mudancas = lerMudancas(request.data);
  const db = getFirestore();

  // Quem está chamando, como está no banco agora.
  const chamador = await db.collection("systemUsers").doc(uid).get();
  if (!chamador.exists || chamador.get("active") === false) negar("Usuário inativo ou inexistente.");
  const ehAdmin = chamador.get("isAdmin") === true;
  if (!ehAdmin) {
    const acesso = await db.collection("systemPermissions").where("userId", "==", uid).where("screen", "==", "permissions").get();
    const pode = acesso.docs.some((doc) => {
      const actions = doc.get("actions");
      return Array.isArray(actions) && actions.some((action) => ACOES_TELA.includes(action));
    });
    if (!pode) negar("Sem permissão para alterar usuários e acessos.");
  }

  // Lê de uma vez os registros atuais que a conferência precisa.
  const refs = new Map<string, FirebaseFirestore.DocumentReference>();
  const pedir = (colecao: string, id: string) => refs.set(`${colecao}/${id}`, db.collection(colecao).doc(id));
  for (const mudanca of mudancas) {
    if (mudanca.collection === "accessKeys") continue;
    const id = mudanca.type === "set" ? mudanca.item.id : mudanca.id;
    pedir(mudanca.collection, id);
    if (mudanca.type === "set" && mudanca.collection === "systemPermissions" && typeof mudanca.item.userId === "string" && ID_VALIDO.test(mudanca.item.userId)) {
      pedir("systemUsers", mudanca.item.userId);
    }
  }
  const atuais = new Map<string, DocumentSnapshot>();
  const todasRefs = [...refs.values()];
  for (let inicio = 0; inicio < todasRefs.length; inicio += 300) {
    const lidos = await db.getAll(...todasRefs.slice(inicio, inicio + 300));
    lidos.forEach((doc) => atuais.set(doc.ref.path, doc));
  }
  // Permissões apagadas: falta ler o usuário dono.
  const donosFaltando = new Set<string>();
  for (const mudanca of mudancas) {
    if (mudanca.type !== "delete" || mudanca.collection !== "systemPermissions") continue;
    const dono = atuais.get(`systemPermissions/${mudanca.id}`)?.get("userId");
    if (typeof dono === "string" && ID_VALIDO.test(dono) && !atuais.has(`systemUsers/${dono}`)) donosFaltando.add(dono);
  }
  if (donosFaltando.size) {
    const lidos = await db.getAll(...[...donosFaltando].map((id) => db.collection("systemUsers").doc(id)));
    lidos.forEach((doc) => atuais.set(doc.ref.path, doc));
  }
  const usuarioEhAdmin = (id: unknown) => typeof id === "string" && atuais.get(`systemUsers/${id}`)?.get("isAdmin") === true;

  if (!ehAdmin) {
    for (const mudanca of mudancas) {
      if (mudanca.collection === "accessKeys") negar("Só administrador altera chaves de acesso.");

      if (mudanca.collection === "systemUsers") {
        const id = mudanca.type === "set" ? mudanca.item.id : mudanca.id;
        if (usuarioEhAdmin(id)) negar("Só administrador altera um usuário administrador.");
        if (mudanca.type === "set" && mudanca.item.isAdmin === true) negar("Só administrador cria um administrador.");
      }

      if (mudanca.collection === "systemPermissions") {
        const donoAtual = atuais.get(`systemPermissions/${mudanca.type === "set" ? mudanca.item.id : mudanca.id}`)?.get("userId");
        const donos = [donoAtual, mudanca.type === "set" ? mudanca.item.userId : undefined].filter((dono) => dono !== undefined);
        if (donos.some(usuarioEhAdmin)) negar("Só administrador altera os acessos de um administrador.");
        if (donos.includes(uid)) negar("Você não pode alterar os seus próprios acessos. Peça a um administrador.");
      }
    }
  }

  // Formato mínimo das permissões (o id é sempre <usuário>-<tela>).
  for (const mudanca of mudancas) {
    if (mudanca.type !== "set" || mudanca.collection !== "systemPermissions") continue;
    const { id, userId, screen, actions } = mudanca.item;
    if (typeof userId !== "string" || typeof screen !== "string" || id !== `${userId}-${screen}`
      || !Array.isArray(actions) || actions.some((action) => typeof action !== "string")) {
      throw new HttpsError("invalid-argument", "Permissão em formato inválido.");
    }
  }

  for (let inicio = 0; inicio < mudancas.length; inicio += 450) {
    const lote = db.batch();
    mudancas.slice(inicio, inicio + 450).forEach((mudanca) => {
      if (mudanca.type === "set") lote.set(db.collection(mudanca.collection).doc(mudanca.item.id), mudanca.item, { merge: true });
      else lote.delete(db.collection(mudanca.collection).doc(mudanca.id));
    });
    await lote.commit();
  }
  return { ok: true, gravados: mudancas.length };
});
