import { createHmac, timingSafeEqual } from "node:crypto";
import { getFirestore } from "firebase-admin/firestore";
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { exigirPermissaoDP } from "./permissaoDP";

// Link público de solicitação de mudança de função (POP-RH-06), no lugar do
// Google Forms. Protegido por um código de 4 números que muda sozinho a cada 15
// minutos (como o código de app de banco): o RH/DP vê o código no sistema e passa
// para quem vai pedir. Só o servidor calcula e confere o código.

const CODIGO_SECRET = defineSecret("CLASSIFICACAO_TOKEN_SECRET");
const JANELA_SEGUNDOS = 15 * 60;
const MAX_FALHAS = 5;
const BLOQUEIO_MS = 15 * 60 * 1000;
const REGIAO = "southamerica-east1";
export const CLASSIFICACAO_COLECAO = "classificationCases";
const TENTATIVAS_DOC = "_seguranca/classificacaoTentativas";

function janelaAtual(agora = Date.now()) {
  return Math.floor(agora / 1000 / JANELA_SEGUNDOS);
}

function codigoDaJanela(janela: number) {
  const hmac = createHmac("sha256", CODIGO_SECRET.value()).update(`classificacao:${janela}`).digest();
  return String(hmac.readUInt32BE(0) % 10000).padStart(4, "0");
}

function mesmoCodigo(a: string, b: string) {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// Aceita o código atual e o anterior: quem recebeu no fim da janela ainda consegue enviar.
// Erros contam para um bloqueio de 15 minutos depois de 5 tentativas.
async function conferirCodigo(codigo: unknown) {
  const db = getFirestore();
  const ref = db.doc(TENTATIVAS_DOC);
  const estado = (await ref.get()).data() || {};
  const agora = Date.now();
  if (Number(estado.bloqueadoAte || 0) > agora) {
    throw new HttpsError("resource-exhausted", "Muitas tentativas erradas. Aguarde 15 minutos e peça um código novo ao RH.");
  }
  const texto = String(codigo ?? "").trim();
  const janela = janelaAtual(agora);
  const valido = /^\d{4}$/.test(texto) && (mesmoCodigo(texto, codigoDaJanela(janela)) || mesmoCodigo(texto, codigoDaJanela(janela - 1)));
  if (!valido) {
    const falhas = Number(estado.falhas || 0) + 1;
    await ref.set(falhas >= MAX_FALHAS ? { falhas: 0, bloqueadoAte: agora + BLOQUEIO_MS } : { falhas, bloqueadoAte: 0 }, { merge: true });
    throw new HttpsError("permission-denied", "Código inválido ou vencido. Peça o código atual ao RH.");
  }
  if (estado.falhas) await ref.set({ falhas: 0, bloqueadoAte: 0 }, { merge: true });
}

// Lista enxuta de funcionários ativos para o solicitante escolher (só depois do código).
async function funcionariosAtivos() {
  const db = getFirestore();
  const [funcionarios, equipes, unidades, empresas] = await Promise.all([
    db.collection("employees").where("status", "in", ["active", "leave"]).get(),
    db.collection("teams").get(),
    db.collection("companyGroupUnits").where("type", "==", "team").get(),
    db.collection("companies").get(),
  ]);
  const nomeEquipe = new Map<string, string>();
  equipes.docs.forEach((doc) => nomeEquipe.set(doc.id, String(doc.get("name") || "")));
  unidades.docs.forEach((doc) => nomeEquipe.set(doc.id, String(doc.get("name") || "")));
  const nomeEmpresa = new Map(empresas.docs.map((doc) => [doc.id, String(doc.get("name") || "")]));
  return funcionarios.docs
    .map((doc) => ({
      id: doc.id,
      name: String(doc.get("name") || ""),
      team: nomeEquipe.get(String(doc.get("teamId") || "")) || "",
      role: String(doc.get("role") || ""),
      company: nomeEmpresa.get(String(doc.get("companyId") || "")) || "",
    }))
    .filter((item) => item.name)
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

// RH/DP: código atual para passar ao solicitante.
export const codigoClassificacao = onCall({ region: REGIAO, secrets: [CODIGO_SECRET] }, async (request) => {
  await exigirPermissaoDP(request, "classification", "view");
  const janela = janelaAtual();
  return { codigo: codigoDaJanela(janela), mudaEm: new Date((janela + 1) * JANELA_SEGUNDOS * 1000).toISOString() };
});

// Público: confere o código e devolve a lista de funcionários para o formulário.
export const conferirCodigoClassificacao = onCall({ region: REGIAO, secrets: [CODIGO_SECRET] }, async (request) => {
  await conferirCodigo((request.data as { codigo?: string } | undefined)?.codigo);
  return { funcionarios: await funcionariosAtivos() };
});

const texto = (valor: unknown, max = 500) => String(valor ?? "").trim().slice(0, max);
const lista = (valor: unknown, max = 30) => (Array.isArray(valor) ? valor.map((item) => texto(item, 200)).filter(Boolean).slice(0, max) : []);

// Público: recebe o pedido (as mesmas perguntas do Google Forms) e abre o caso.
export const enviarSolicitacaoClassificacao = onCall({ region: REGIAO, secrets: [CODIGO_SECRET] }, async (request) => {
  const dados = (request.data ?? {}) as Record<string, unknown>;
  await conferirCodigo(dados.codigo);

  const solicitante = texto(dados.solicitante, 120);
  const funcionarioId = texto(dados.funcionarioId, 120);
  const funcaoSolicitada = texto(dados.funcaoSolicitada, 120);
  const motivos = lista(dados.motivos);
  if (!solicitante || !funcionarioId || !funcaoSolicitada || !texto(dados.tempoNoCargo) || !texto(dados.jaDesempenha) || !texto(dados.haQuantoTempo) || !motivos.length) {
    throw new HttpsError("invalid-argument", "Preencha todas as perguntas obrigatórias.");
  }

  const db = getFirestore();
  const funcionario = await db.collection("employees").doc(funcionarioId).get();
  if (!funcionario.exists || funcionario.get("status") === "terminated") {
    throw new HttpsError("not-found", "Colaborador não encontrado entre os ativos.");
  }
  const agora = new Date();
  const prazo = new Date(agora.getTime() + 30 * 86400000).toISOString().slice(0, 10);
  const ref = db.collection(CLASSIFICACAO_COLECAO).doc();
  const sistema = { id: "link-publico", name: `${solicitante} (link)` };
  const batch = db.batch();
  batch.set(ref, {
    stage: "request",
    status: "open",
    employeeId: funcionario.id,
    employeeName: String(funcionario.get("name") || ""),
    companyId: String(funcionario.get("companyId") || ""),
    currentRole: String(funcionario.get("role") || ""),
    currentPosition: String(funcionario.get("position") || ""),
    request: {
      solicitante,
      equipe: texto(dados.equipe, 120),
      tempoNoCargo: texto(dados.tempoNoCargo, 60),
      funcaoSolicitada,
      jaDesempenha: texto(dados.jaDesempenha, 200),
      haQuantoTempo: texto(dados.haQuantoTempo, 60),
      motivos,
      informacaoAdicional: texto(dados.informacaoAdicional, 2000),
    },
    requestedAt: agora.toISOString(),
    dueDate: prazo,
    openedBy: sistema,
    updatedAt: agora.toISOString(),
  });
  batch.set(ref.collection("events").doc(), {
    stageFrom: "", stageTo: "request", notes: `Pedido enviado pelo link por ${solicitante}.`, createdAt: agora.toISOString(), createdBy: sistema,
  });
  await batch.commit();
  return { protocolo: ref.id.slice(0, 8).toUpperCase(), prazo };
});
