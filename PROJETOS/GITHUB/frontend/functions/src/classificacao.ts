import { createHmac, timingSafeEqual } from "node:crypto";
import { createHash } from "node:crypto";
import { FieldValue, getFirestore, Timestamp } from "firebase-admin/firestore";
import { onCall, HttpsError, type CallableRequest } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { exigirPermissaoDP } from "./permissaoDP";
import { ipDaChamada } from "./entrarDP";

// Link público de solicitação de mudança de função (POP-RH-06), no lugar do
// Google Forms. Protegido por um código de 6 números que muda sozinho a cada 15
// minutos (como o código de app de banco): o RH/DP vê o código no sistema e passa
// para quem vai pedir. Só o servidor calcula e confere o código.
//
// 06/11/2026 (segurança item 6): era 4 números com UM contador de erros para
// todo mundo, lido e gravado sem trava (palpites em paralelo passavam do limite
// e qualquer um bloqueava o link de todos). Agora: 6 números; contadores em
// transação; 5 erros por endereço (IP) e 50 erros no geral em 15 min bloqueiam
// por 15 min. Contadores em loginAttempts (coleção fechada para o navegador).

const CODIGO_SECRET = defineSecret("CLASSIFICACAO_TOKEN_SECRET");
const JANELA_SEGUNDOS = 15 * 60;
const LIMITE_IP = 5;
const LIMITE_GERAL = 50;
const JANELA_MS = 15 * 60 * 1000;
const BLOQUEIO_MS = 15 * 60 * 1000;
const DIGITOS = 6;
const REGIAO = "southamerica-east1";
export const CLASSIFICACAO_COLECAO = "classificationCases";
const COLECAO_TENTATIVAS = "loginAttempts";
const DOC_GERAL = "classif_geral";

function janelaAtual(agora = Date.now()) {
  return Math.floor(agora / 1000 / JANELA_SEGUNDOS);
}

function codigoDaJanela(janela: number) {
  const hmac = createHmac("sha256", CODIGO_SECRET.value()).update(`classificacao:${janela}`).digest();
  return String(hmac.readUInt32BE(0) % 10 ** DIGITOS).padStart(DIGITOS, "0");
}

function mesmoCodigo(a: string, b: string) {
  return a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

const MSG_BLOQUEIO = "Muitas tentativas erradas. Aguarde 15 minutos e peça um código novo ao RH.";
const FORMATO_CODIGO = new RegExp(`^[0-9]{${DIGITOS}}$`);

function bloqueadoAte(dados: FirebaseFirestore.DocumentData | undefined) {
  return (dados?.bloqueadoAte as Timestamp | undefined)?.toMillis?.() ?? 0;
}

// Aceita o código atual e o anterior: quem recebeu no fim da janela ainda consegue enviar.
async function conferirCodigo(codigo: unknown, request: CallableRequest) {
  const db = getFirestore();
  const colecao = db.collection(COLECAO_TENTATIVAS);
  const ipHash = createHash("sha256").update(ipDaChamada(request), "utf8").digest("hex").slice(0, 32);
  const refs = [
    { ref: colecao.doc(`classif_ip_${ipHash}`), limite: LIMITE_IP, tipo: "classificacao-ip" },
    { ref: colecao.doc(DOC_GERAL), limite: LIMITE_GERAL, tipo: "classificacao-geral" },
  ];
  const agora = Date.now();
  const atuais = await db.getAll(...refs.map(({ ref }) => ref));
  if (atuais.some((snap) => bloqueadoAte(snap.data()) > agora)) throw new HttpsError("resource-exhausted", MSG_BLOQUEIO);

  const texto = String(codigo ?? "").trim();
  const janela = janelaAtual(agora);
  const valido = FORMATO_CODIGO.test(texto)
    && (mesmoCodigo(texto, codigoDaJanela(janela)) || mesmoCodigo(texto, codigoDaJanela(janela - 1)));
  if (valido) {
    // Acerto zera só o contador do próprio endereço (o geral segue a janela).
    if (Number(atuais[0].get("falhas") || 0)) await refs[0].ref.set({ falhas: 0 }, { merge: true });
    return;
  }

  // Erro: soma nos dois contadores numa transação (palpites em paralelo não escapam).
  const bloqueou = await db.runTransaction(async (tx) => {
    const snaps = await Promise.all(refs.map(({ ref }) => tx.get(ref)));
    const instante = Date.now();
    // Já bloqueado (palpite que chegou junto com o que bloqueou): não soma em
    // nada, senão um único endereço em rajada esgotaria o contador geral.
    if (snaps.some((snap) => bloqueadoAte(snap.data()) > instante)) return true;
    let algumBloqueio = false;
    refs.forEach(({ ref, limite, tipo }, index) => {
      const dados = snaps[index].data();
      const inicio = (dados?.inicio as Timestamp | undefined)?.toMillis?.() ?? 0;
      const janelaNova = instante - inicio > JANELA_MS;
      const falhas = (janelaNova ? 0 : Number(dados?.falhas || 0)) + 1;
      const bloqueia = falhas >= limite;
      if (bloqueia) algumBloqueio = true;
      tx.set(ref, {
        tipo,
        falhas: bloqueia ? 0 : falhas,
        inicio: Timestamp.fromMillis(janelaNova || bloqueia ? instante : inicio),
        bloqueadoAte: bloqueia ? Timestamp.fromMillis(instante + BLOQUEIO_MS) : null,
        ultimaFalha: FieldValue.serverTimestamp(),
      });
    });
    return algumBloqueio;
  });
  throw new HttpsError(bloqueou ? "resource-exhausted" : "permission-denied",
    bloqueou ? MSG_BLOQUEIO : "Código inválido ou vencido. Peça o código atual ao RH.");
}

// Lista enxuta de funcionários ativos para o solicitante escolher (só depois do código).
async function funcionariosAtivos() {
  const db = getFirestore();
  const [funcionarios, equipes, unidades, empresas, empresasDoGrupo, vinculos, alocacoes] = await Promise.all([
    db.collection("employees").where("status", "in", ["active", "leave"]).get(),
    db.collection("teams").get(),
    db.collection("companyGroupUnits").where("type", "==", "team").get(),
    db.collection("companies").get(),
    db.collection("companyGroupCompanies").get(),
    db.collection("companyGroupUnitLinks").where("sourceType", "==", "team").get(),
    db.collection("companyGroupEmployeeAssignments").get(),
  ]);
  const nomeEquipe = new Map<string, string>();
  equipes.docs.forEach((doc) => nomeEquipe.set(doc.id, String(doc.get("name") || "")));
  unidades.docs.forEach((doc) => nomeEquipe.set(doc.id, String(doc.get("name") || "")));
  const nomeEmpresa = new Map(empresas.docs.map((doc) => [doc.id, String(doc.get("name") || "")]));
  const grupoDaUnidade = new Map(unidades.docs.map((doc) => [doc.id, String(doc.get("groupId") || "")]));
  const grupoDaEmpresa = new Map(empresasDoGrupo.docs.map((doc) => [String(doc.get("companyId") || ""), String(doc.get("groupId") || "")]));
  const alocacao = new Map(alocacoes.docs.map((doc) => [`${doc.get("groupId")}:${doc.get("employeeId")}`, String(doc.get("teamUnitId") || "")]));

  // Mesma regra do Controle de ponto (timekeepingTeamStructure): a equipe atual
  // vem da estrutura de grupos; o teamId do cadastro é só o último recurso.
  function equipeAtual(doc: FirebaseFirestore.QueryDocumentSnapshot) {
    const companyId = String(doc.get("companyId") || "");
    const teamId = String(doc.get("teamId") || "");
    const groupId = String(doc.get("groupId") || "") || grupoDaEmpresa.get(companyId) || "";
    const chave = `${groupId}:${doc.id}`;
    if (alocacao.has(chave)) {
      const teamUnitId = alocacao.get(chave) || "";
      if (!teamUnitId) return "";
      if (grupoDaUnidade.get(teamUnitId) === groupId) return teamUnitId;
    }
    const vinculo = vinculos.docs.find((item) => item.get("companyId") === companyId && item.get("sourceId") === teamId
      && item.get("groupId") === groupId && grupoDaUnidade.has(String(item.get("groupUnitId") || "")));
    return String(vinculo?.get("groupUnitId") || "") || teamId;
  }

  return funcionarios.docs
    .map((doc) => ({
      id: doc.id,
      name: String(doc.get("name") || ""),
      team: nomeEquipe.get(equipeAtual(doc)) || "",
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
  await conferirCodigo((request.data as { codigo?: string } | undefined)?.codigo, request);
  return { funcionarios: await funcionariosAtivos() };
});

const texto = (valor: unknown, max = 500) => String(valor ?? "").trim().slice(0, max);
const lista = (valor: unknown, max = 30) => (Array.isArray(valor) ? valor.map((item) => texto(item, 200)).filter(Boolean).slice(0, max) : []);

// Público: recebe o pedido (as mesmas perguntas do Google Forms) e abre o caso.
export const enviarSolicitacaoClassificacao = onCall({ region: REGIAO, secrets: [CODIGO_SECRET] }, async (request) => {
  const dados = (request.data ?? {}) as Record<string, unknown>;
  await conferirCodigo(dados.codigo, request);

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
