import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { exigirPermissaoDP } from "./permissaoDP";
// Credenciais ficam nos SECRETS do Functions (nunca no código/frontend).
const SECULLUM_USERNAME = defineSecret("SECULLUM_USERNAME");
const SECULLUM_PASSWORD = defineSecret("SECULLUM_PASSWORD");
const SECULLUM_BANK_ID = defineSecret("SECULLUM_BANK_ID");
const AUTH_URL = "https://autenticador.secullum.com.br";
const BASE_URL = "https://pontowebintegracaoexterna.secullum.com.br";
const CLIENT_ID = "3";
async function getToken(): Promise<string> {
  const body = new URLSearchParams({
    grant_type: "password",
    username: SECULLUM_USERNAME.value(),
    password: SECULLUM_PASSWORD.value(),
    client_id: CLIENT_ID,
  });
  const resp = await fetch(`${AUTH_URL}/Token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body,
  });
  if (!resp.ok) {
    throw new HttpsError(
      "unavailable",
      `Falha na autenticação com o Secullum (${resp.status}).`,
    );
  }
  const data = (await resp.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new HttpsError("unavailable", "Secullum não retornou token.");
  }
  return data.access_token;
}
async function apiGet<T>(
  path: string,
  token: string,
  params: Record<string, string>,
): Promise<T> {
  const url = new URL(`${BASE_URL}${path}`);
  Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const resp = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      secullumidbancoselecionado: SECULLUM_BANK_ID.value(),
      Accept: "application/json",
      "Accept-Language": "pt-BR",
    },
  });
  if (!resp.ok) {
    throw new HttpsError("unavailable", `Secullum retornou ${resp.status}.`);
  }
  return (await resp.json()) as T;
}
async function apiPost(
  path: string,
  token: string,
  body: Record<string, unknown>,
): Promise<{ ok: boolean; status: number; data: unknown; raw: string }> {
  const resp = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      secullumidbancoselecionado: SECULLUM_BANK_ID.value(),
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-Language": "pt-BR",
    },
    body: JSON.stringify(body),
  });
  const raw = await resp.text();
  let data: unknown = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch (_e) {
    data = null;
  }
  return { ok: resp.ok, status: resp.status, data, raw };
}
// Extrai uma mensagem amigável do corpo de erro do Secullum.
function extractSecullumError(data: unknown, raw: string): string {
  if (Array.isArray(data)) {
    const msgs = data
      .map((e) => {
        const obj = e as Record<string, unknown>;
        return (obj?.Message ?? obj?.message) as string | undefined;
      })
      .filter(Boolean);
    if (msgs.length) return msgs.join(" ");
  }
  const obj = data as Record<string, unknown> | null;
  if (obj?.Message) return String(obj.Message);
  if (obj?.message) return String(obj.message);
  if (raw && raw.trim()) return raw.trim().slice(0, 300);
  return "Não foi possível registrar a jornada no Secullum.";
}
const onlyDigits = (v: unknown) => String(v ?? "").replace(/\D/g, "");
const toNum = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
// Extrai HH:mm de "HH:mm", "HH-mm", ISO datetime ou "dd/MM/yyyy HH:mm".
function normalizeHora(v: unknown): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  let timePart = s;
  if (s.includes("T")) timePart = s.split("T")[1] || "";
  else if (s.includes(" ")) timePart = s.split(" ").pop() || "";
  const m = timePart.match(/^(\d{1,2})[:-](\d{2})/);
  if (m) return `${m[1].padStart(2, "0")}:${m[2]}`;
  const m2 = s.match(/\b(\d{1,2}):(\d{2})\b/);
  if (m2) return `${m2[1].padStart(2, "0")}:${m2[2]}`;
  return "";
}
// Mapeia a Origem do Secullum (FonteDados) para o código de cor da UI.
// Enum Origem: 0 Desconhecido, 1 RelogioPonto, 2 IncluidoManualmente, 3 PreAssinalado,
// 4 Checkin, 5 CentralFuncionarioWeb, 6 CentralFuncionarioApp, 7 AppOffline, 8 IntegracaoExterna.
function classifyOrigem(origem: number | null): string {
  switch (origem) {
    case 8:
      return "api";
    case 2:
      return "manual";
    case 3:
      return "automatico";
    case 4:
    case 6:
    case 7:
      return "celular";
    case 1:
    case 5:
      return "computador";
    default:
      return "secullum";
  }
}
// Acesso case-insensitive a um campo do objeto retornado pela API.
function pickField(row: Record<string, unknown>, keys: string[]): unknown {
  const lower: Record<string, unknown> = {};
  for (const k of Object.keys(row)) lower[k.toLowerCase()] = row[k];
  for (const key of keys) {
    const v = lower[key.toLowerCase()];
    if (v !== undefined && v !== null && v !== "") return v;
  }
  return undefined;
}
type Func = Record<string, unknown>;
type Batida = Record<string, unknown>;
type FonteRow = Record<string, unknown>;
/**
 * Callable: recebe { data: "YYYY-MM-DD" } e devolve as batidas do dia
 * já relacionadas ao funcionário (com CPF) — os 4 horários por CPF.
 */
export const obterBatidasSecullum = onCall(
  {
    region: "southamerica-east1",
    secrets: [
      SECULLUM_USERNAME,
      SECULLUM_PASSWORD,
      SECULLUM_BANK_ID,
    ],
  },
  async (request) => {
    const data = (
      request.data as { data?: string } | undefined
    )?.data;
    if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      throw new HttpsError(
        "invalid-argument",
        "Informe 'data' no formato YYYY-MM-DD.",
      );
    }
    const token = await getToken();
    // Consulta funcionários.
    const funcs = await apiGet<Func[]>(
      "/IntegracaoExterna/Funcionarios",
      token,
      {},
    );
    const byId = new Map<unknown, Func>();
    (funcs || []).forEach((f) => {
      byId.set(f.Id, f);
    });
    // Consulta batidas da data selecionada.
    const batidas = await apiGet<Batida[]>(
      "/IntegracaoExterna/Batidas",
      token,
      {
        dataInicio: data,
        dataFim: data,
      },
    );
    // =====================================================
    // DIAGNÓSTICO 1 - ESTRUTURA DOS CAMPOS
    // =====================================================
    if (Array.isArray(batidas)) {
      const campos = [
        ...new Set(
          batidas.flatMap((registro) =>
            Object.keys(registro),
          ),
        ),
      ].sort();
      console.log("[SECULLUM_SCHEMA_DIAGNOSTICO]", {
        data,
        quantidadeRegistros: batidas.length,
        camposDisponiveis: campos,
        camposRelacionados: campos.filter((campo) =>
          /neutro|compensad|folga|ajuste|dia|observ/i.test(
            campo,
          ),
        ),
      });
    }
    // =====================================================
    // DIAGNÓSTICO 2 - VALORES DE NEUTRO / COMPENSADO / FOLGA
    // =====================================================
    // Registra apenas quantidades, sem CPF,
    // nomes ou horários dos funcionários.
    const distribuir = (campo: string) => {
      const contagem = {
        verdadeiro: 0,
        falso: 0,
        nulo: 0,
        outro: 0,
      };
      for (const registro of batidas || []) {
        const valor = registro[campo];
        if (valor === true) {
          contagem.verdadeiro++;
        } else if (valor === false) {
          contagem.falso++;
        } else if (valor == null) {
          contagem.nulo++;
        } else {
          contagem.outro++;
        }
      }
      return contagem;
    };
    console.log("[SECULLUM_NEUTRO_DIAGNOSTICO]", {
      data,
      total: (batidas || []).length,
      neutro: distribuir("Neutro"),
      compensado: distribuir("Compensado"),
      folga: distribuir("Folga"),
    });
    // =====================================================
    // CONSULTA FONTE DE DADOS
    // =====================================================
    let fontes: FonteRow[] = [];
    try {
      fontes = await apiGet<FonteRow[]>(
        "/IntegracaoExterna/FonteDados",
        token,
        {
          dataInicio: data,
          dataFim: data,
        },
      );
    } catch (fonteError) {
      console.error(
        "[Secullum] FonteDados falhou:",
        (fonteError as Error)?.message,
      );
      fontes = [];
    }
    // =====================================================
    // DIAGNÓSTICO 3 - ESTRUTURA FONTE DE DADOS
    // =====================================================
    console.log("[SECULLUM_FONTE_DADOS_DIAGNOSTICO]", {
      data,
      quantidadeRegistros: fontes.length,
      camposDisponiveis: [
        ...new Set(
          fontes.flatMap((registro) =>
            Object.keys(registro),
          ),
        ),
      ].sort(),
    });
    // =====================================================
    // IDENTIFICAÇÃO DA ORIGEM DAS MARCAÇÕES
    // =====================================================
    const fonteByCpf = new Map<
      string,
      Array<{ hora: string; code: string }>
    >();
    (fontes || []).forEach((row) => {
      const cpf = onlyDigits(
        pickField(row, [
          "Cpf",
          "FuncionarioCpf",
          "CpfFuncionario",
        ]),
      );
      if (!cpf) return;
      const hora = normalizeHora(
        pickField(row, [
          "Hora",
          "DataHora",
          "HoraMarcacao",
          "Horario",
        ]),
      );
      if (!hora) return;
      const code = classifyOrigem(
        toNum(pickField(row, ["Origem"])),
      );
      const list = fonteByCpf.get(cpf) || [];
      list.push({ hora, code });
      fonteByCpf.set(cpf, list);
    });
    // =====================================================
    // RETORNO PARA O REACT - LÓGICA PRESERVADA
    // =====================================================
    return (batidas || []).map((b) => {
      const f = (
        byId.get(b.FuncionarioId) || {}
      ) as Func;
      const cpfDigits = onlyDigits(f.Cpf);
      const fonteList =
        fonteByCpf.get(cpfDigits) || [];
      const originFor = (val: unknown): string => {
        const hora = normalizeHora(val);
        if (!hora) return "";
        const match = fonteList.find(
          (x) => x.hora === hora,
        );
        if (match) return match.code;
        // Marcações sem origem correspondente
        // continuam classificadas como automáticas.
        return "automatico";
      };
      return {
        funcionarioId: b.FuncionarioId ?? null,
        nome: f.Nome ?? null,
        cpf: f.Cpf ?? null,
        cpfDigits,
        numeroFolha: f.NumeroFolha ?? null,
        possuiFoto: f.PossuiFoto ?? null,
        data: b.Data ?? null,
        neutro: typeof b.Neutro === "boolean" ? b.Neutro : null,
        compensado: typeof b.Compensado === "boolean" ? b.Compensado : null,
        entrada1: b.Entrada1 ?? "",
        saida1: b.Saida1 ?? "",
        entrada2: b.Entrada2 ?? "",
        saida2: b.Saida2 ?? "",
        entrada3: b.Entrada3 ?? "",
        saida3: b.Saida3 ?? "",
        origem: {
          entrada1: originFor(b.Entrada1),
          saida1: originFor(b.Saida1),
          entrada2: originFor(b.Entrada2),
          saida2: originFor(b.Saida2),
        },
        programado: {
          entrada1: b.MemoriaEntrada1 ?? "",
          saida1: b.MemoriaSaida1 ?? "",
          entrada2: b.MemoriaEntrada2 ?? "",
          saida2: b.MemoriaSaida2 ?? "",
        },
      };
    });
  },
);
/**
 * Callable: envia uma batida da Macro Ambiental para o Secullum (produção).
 * POST /IntegracaoExterna/CartaoPonto/Manual — insere/edita 1 coluna.
 */
export const enviarBatidaSecullum = onCall(
  { region: "southamerica-east1", secrets: [SECULLUM_USERNAME, SECULLUM_PASSWORD, SECULLUM_BANK_ID] },
  async (request) => {
    // TODO: exigirPermissaoDP(request, "timekeeping", "edit") quando o Oficial
    // também abrir a sessão do entrarDP — hoje ele chama esta function sem sessão.
    const p = (request.data ?? {}) as {
      cpf?: string;
      data?: string;
      coluna?: string;
      hora?: string;
      motivo?: string;
    };
    const cpf = onlyDigits(p.cpf);
    if (!cpf) {
      throw new HttpsError("invalid-argument", "CPF do funcionário é obrigatório.");
    }
    if (!p.data || !/^\d{4}-\d{2}-\d{2}$/.test(p.data)) {
      throw new HttpsError("invalid-argument", "Informe 'data' no formato YYYY-MM-DD.");
    }
    if (!p.hora || !/^\d{1,2}:\d{2}$/.test(p.hora)) {
      throw new HttpsError("invalid-argument", "Informe 'hora' no formato HH:mm.");
    }
    const colunasValidas = [
      "Entrada1", "Saida1", "Entrada2", "Saida2", "Entrada3",
      "Saida3", "Entrada4", "Saida4", "Entrada5", "Saida5",
    ];
    if (!p.coluna || !colunasValidas.includes(p.coluna)) {
      throw new HttpsError("invalid-argument", "Coluna inválida.");
    }
    const token = await getToken();
    const res = await apiPost("/IntegracaoExterna/CartaoPonto/Manual", token, {
      Cpf: p.cpf,
      Coluna: p.coluna,
      Data: p.data,
      Hora: p.hora,
      Motivo: p.motivo || "Via API MACRO",
    });
    if (!res.ok) {
      throw new HttpsError(
        "failed-precondition",
        extractSecullumError(res.data, res.raw),
      );
    }
    return { ok: true, coluna: p.coluna, hora: p.hora, retorno: res.data ?? null };
  },
);
/**
 * Preparação de teste SEM ESCRITA para Secullum Neutro.
 * Copie este bloco para frontend/functions/src/index.ts, que já importa
 * onCall e HttpsError de firebase-functions/v2/https.
 *
 * NÃO enviar CartaoPonto/Manual: essa operação é de edição/inclusão de batidas,
 * não há contrato confirmado para edição de Neutro por funcionário/data.
 *
 * A função valida a intenção de escrita e retorna um plano auditável.
 * Uma futura implementação real exigirá endpoint/contrato oficial, leitura
 * prévia do registro, autorização robusta e confirmação explícita.
 */
export const prepararAlteracaoNeutroSecullum = onCall(
  { region: "southamerica-east1" },
  async (request) => {
    // As chamadas anteriores à API usaram auth=MISSING nos logs.
    // Esta operação sensível exige sessão Firebase Auth E claim específico.
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "Autenticação Firebase necessária para testar alteração no Secullum.");
    }
    if (request.auth.token.secullumNeutroWrite !== true) {
      throw new HttpsError("permission-denied", "Usuário sem autorização de alteração de Neutro no Secullum.");
    }
    const data = request.data as Record<string, unknown> | null;
    const cpf = String(data?.cpf ?? "").replace(/\D/g, "");
    const dia = String(data?.data ?? "");
    const neutro = data?.neutro;
    const confirmar = data?.confirmar === true;
    if (cpf.length !== 11 || !/^\d{4}-\d{2}-\d{2}$/.test(dia) || typeof neutro !== "boolean") {
      throw new HttpsError("invalid-argument", "Informe CPF com 11 dígitos, data AAAA-MM-DD e neutro booleano.");
    }
    // Não registra CPF em logs e não chama o Secullum.
    return {
      mode: "dry-run",
      ok: true,
      enviado: false,
      motivo: "Não existe endpoint confirmado para atualizar Neutro individual no Secullum.",
      dados: { data: dia, neutro, cpfFinal: cpf.slice(-2) },
      confirmacaoSolicitada: confirmar,
    };
  },
);
/**
 * Confere Neutro/Compensado do funcionário 169 em 26/10/2026.
 * IMPORTANTE: somente leitura. NÃO altera o Secullum.
 * Segurança: exige Firebase Authentication e claim administrativa específica.
 */
export const conferirFlagsSecullumTeste = onCall(
  {
    region: "southamerica-east1",
    secrets: [SECULLUM_USERNAME, SECULLUM_PASSWORD, SECULLUM_BANK_ID],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError("unauthenticated", "É necessária uma sessão Firebase Auth válida.");
    }
    if (request.auth.token.secullumNeutroWrite !== true) {
      throw new HttpsError("permission-denied", "Permissão secullumNeutroWrite necessária.");
    }
    const input = (request.data ?? {}) as Record<string, unknown>;
    const cpf = String(input.cpf ?? "").replace(/\D/g, "");
    const data = String(input.data ?? "");
    const neutro = input.neutro;
    const compensado = input.compensado;
    if (!/^\d{11}$/.test(cpf) || data !== "2026-10-26") {
      throw new HttpsError("invalid-argument", "Informe um CPF válido e a data do teste (2026-10-26).");
    }
    if (typeof neutro !== "boolean" || typeof compensado !== "boolean") {
      throw new HttpsError("invalid-argument", "Informe neutro e compensado como booleanos.");
    }
    const token = await getToken();
    const funcionarios = await apiGet<Array<Record<string, unknown>>>(
      "/IntegracaoExterna/Funcionarios", token, {},
    );
    const f = funcionarios.find((item) => String(item.Cpf ?? "").replace(/\D/g, "") === cpf);
    if (!f) {
      return { ok: true, modo: "somente-leitura", vinculado: false, precisaPost: false, enviado: false };
    }
    if (String(f.Id) !== "169") {
      throw new HttpsError("permission-denied", "Teste restrito ao funcionário autorizado no Secullum.");
    }
    const registros = await apiGet<Array<Record<string, unknown>>>(
      "/IntegracaoExterna/Batidas", token, { dataInicio: data, dataFim: data },
    );
    const coincidentes = registros.filter((item) => String(item.FuncionarioId) === String(f.Id));
    if (coincidentes.length !== 1) {
      return {
        ok: false, modo: "somente-leitura", vinculado: true, enviado: false,
        motivo: "Nenhum ou mais de um registro encontrado para o dia. Não é seguro atualizar.",
      };
    }
    const registro = coincidentes[0];
    if (typeof registro.Neutro !== "boolean" || typeof registro.Compensado !== "boolean") {
      throw new HttpsError("failed-precondition", "Secullum não retornou as duas flags booleanas.");
    }
    const diferencas = {
      neutro: registro.Neutro !== neutro,
      compensado: registro.Compensado !== compensado,
    };
    console.info("[SECULLUM_FLAGS_TESTE]", {
      data, funcionarioId: String(f.Id),
      precisaPost: diferencas.neutro || diferencas.compensado,
      campos: Object.keys(diferencas).filter((k) => diferencas[k as keyof typeof diferencas]),
      enviado: false,
    });
    return {
      ok: true, modo: "somente-leitura", vinculado: true,
      atual: { neutro: registro.Neutro, compensado: registro.Compensado },
      desejado: { neutro, compensado }, diferencas,
      precisaPost: diferencas.neutro || diferencas.compensado,
      enviado: false,
      motivo: "A API de Integração Externa não documenta atualização dessas flags. Nenhum POST foi efetuado.",
    };
  },
);
export const diagnosticarAcessoInternoSecullum = onCall(
  {
    region: "southamerica-east1",
    secrets: [
      SECULLUM_USERNAME,
      SECULLUM_PASSWORD,
      SECULLUM_BANK_ID,
    ],
  },
  async (request) => {
    if (!request.auth) {
      throw new HttpsError(
        "unauthenticated",
        "É necessária autenticação Firebase."
      );
    }
    if (request.auth.token.secullumNeutroWrite !== true) {
      throw new HttpsError(
        "permission-denied",
        "Usuário sem autorização para o diagnóstico."
      );
    }
    const token = await getToken();
    const url =
      "https://pontoweb.secullum.com.br" +
      "/Batidas/169/2026-10-26/2026-10-26";
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        secullumidbancoselecionado: SECULLUM_BANK_ID.value(),
        Accept: "application/json",
      },
    });
    const texto = await response.text();
    let dados: unknown = null;
    if (response.ok) {
      try {
        dados = JSON.parse(texto);
      } catch {
        throw new HttpsError(
          "failed-precondition",
          "API interna retornou resposta que não é JSON."
        );
      }
    }
    const objeto =
      dados !== null && typeof dados === "object" && !Array.isArray(dados)
        ? (dados as Record<string, unknown>)
        : null;
    const registros: Record<string, unknown>[] = Array.isArray(dados)
      ? dados
      : Array.isArray(objeto?.lista)
        ? (objeto.lista as Record<string, unknown>[])
        : [];
    if (!Array.isArray(dados) && !Array.isArray(objeto?.lista)) {
      throw new HttpsError(
        "failed-precondition",
        "API interna não retornou uma lista de registros válida."
      );
    }
    const registro = registros.find(
      (item: Record<string, unknown>) =>
        Number(item.FuncionarioId) === 169 &&
        String(item.Data ?? "").startsWith("2026-10-26")
    );
    console.info("[SECULLUM_AUTH_DIAGNOSTICO]", {
      httpStatus: response.status,
      registroEncontrado: Boolean(registro),
    });
    return {
      ok: response.ok,
      httpStatus: response.status,
      modo: "somente-leitura",
      enviado: false,
      registroEncontrado: Boolean(registro),
      registro: registro
        ? {
          id: registro.Id,
          funcionarioId: registro.FuncionarioId,
          data: registro.Data,
          neutro: registro.Neutro,
          compensado: registro.Compensado,
          possuiVersao: Boolean(registro.Versao),
        }
        : null,
    };
  }
);
/**
 * Simulação da alteração de Neutro e Compensado.
 * NÃO executa POST.
 * Restrito ao usuário técnico, funcionário 169 e dia 26/10/2026.
 */
export const simularAlteracaoFlagsSecullum = onCall(
  {
    region: "southamerica-east1",
    secrets: [
      SECULLUM_USERNAME,
      SECULLUM_PASSWORD,
      SECULLUM_BANK_ID,
    ],
  },
  async (request) => {
    const UID_TESTE = "TkdbEBo0WPcVFGM8AsMiDWuaCqG3";
    const FUNCIONARIO_ID = 169;
    const REGISTRO_ID = 502837;
    const DIA = "2026-10-26";
    // Permissão dupla: UID específico e custom claim.
    if (
      !request.auth ||
      request.auth.uid !== UID_TESTE ||
      request.auth.token.secullumNeutroWrite !== true
    ) {
      throw new HttpsError(
        "permission-denied",
        "Usuário não autorizado para este teste."
      );
    }
    const token = await getToken();
    const url =
      `https://pontoweb.secullum.com.br/Batidas/` +
      `${FUNCIONARIO_ID}/${DIA}/${DIA}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        secullumidbancoselecionado: SECULLUM_BANK_ID.value(),
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      throw new HttpsError(
        "unavailable",
        `Consulta Secullum retornou HTTP ${response.status}.`
      );
    }
    const dados: unknown = await response.json();
    const objeto =
      dados !== null &&
        typeof dados === "object" &&
        !Array.isArray(dados)
        ? (dados as Record<string, unknown>)
        : null;
    const lista: unknown =
      Array.isArray(dados) ? dados : objeto?.lista;
    if (!Array.isArray(lista)) {
      throw new HttpsError(
        "failed-precondition",
        "Formato de lista inválido no Secullum."
      );
    }
    const registros = lista as Record<string, unknown>[];
    const encontrados = registros.filter(
      (r) =>
        Number(r.Id) === REGISTRO_ID &&
        Number(r.FuncionarioId) === FUNCIONARIO_ID &&
        String(r.Data ?? "").startsWith(DIA)
    );
    if (encontrados.length !== 1) {
      throw new HttpsError(
        "failed-precondition",
        "Registro ausente ou duplicado."
      );
    }
    const atual = encontrados[0];
    if (
      typeof atual.Neutro !== "boolean" ||
      typeof atual.Compensado !== "boolean" ||
      typeof atual.Versao !== "string" ||
      !atual.Versao
    ) {
      throw new HttpsError(
        "failed-precondition",
        "Registro sem flags ou Versao válidas."
      );
    }
    // Simulação em memória: não modifica o objeto original.
    const preparado = {
      ...atual,
      Neutro: true,
      Compensado: true,
    };
    const camposAlterados = (["Neutro", "Compensado"] as const).filter(
      (campo) => !Object.is(preparado[campo], atual[campo])
    );
    const camposEsperados = [
      "Neutro",
      "Compensado",
    ];
    const alteracoesValidas = camposAlterados.every(
      (campo) => camposEsperados.includes(campo)
    );
    if (!alteracoesValidas) {
      throw new HttpsError(
        "failed-precondition",
        "A simulação detectou alterações inesperadas."
      );
    }
    console.info("[SECULLUM_FLAGS_DRY_RUN]", {
      funcionarioId: FUNCIONARIO_ID,
      data: DIA,
      camposAlterados,
      enviado: false,
    });
    return {
      ok: true,
      modo: "dry-run",
      enviado: false,
      funcionarioId: FUNCIONARIO_ID,
      registroId: REGISTRO_ID,
      data: DIA,
      atual: {
        neutro: atual.Neutro,
        compensado: atual.Compensado,
      },
      desejado: {
        neutro: preparado.Neutro,
        compensado: preparado.Compensado,
      },
      possuiVersao: true,
      quantidadeCamposOriginais: Object.keys(atual).length,
      camposAlterados,
      payloadPreparado: true,
      observacao:
        "Simulação concluída. Nenhum POST foi enviado.",
    };
  }
);
/**
 * TESTE ISOLADO: gravação de flags no Secullum via endpoint interno não documentado.
 * Não vincular ao botão Salvar dia do mês nem disponibilizar a usuários comuns.
 * Somente o funcionário 169, registro 502837, em 26/10/2026.
 */
export const atualizarFlagsSecullumTeste = onCall(
  {
    region: "southamerica-east1",
    secrets: [SECULLUM_USERNAME, SECULLUM_PASSWORD, SECULLUM_BANK_ID],
  },
  async (request) => {
    if (
      request.auth?.uid !== "TkdbEBo0WPcVFGM8AsMiDWuaCqG3" ||
      request.auth?.token.secullumNeutroWrite !== true
    ) {
      throw new HttpsError("permission-denied", "Usuário técnico não autorizado.");
    }
    const funcionarioId = 169;
    const registroId = 502837;
    const data = "2026-10-26";
    const token = await getToken();
    const base = "https://pontoweb.secullum.com.br";
    const getUrl = `${base}/Batidas/${funcionarioId}/${data}/${data}`;
    const headers = {
      Authorization: `Bearer ${token}`,
      secullumidbancoselecionado: SECULLUM_BANK_ID.value(),
      Accept: "application/json",
    };
    const lerRegistro = async (): Promise<Record<string, unknown>> => {
      const resposta = await fetch(getUrl, { method: "GET", headers });
      if (!resposta.ok) {
        throw new HttpsError("unavailable", `GET do Secullum: HTTP ${resposta.status}.`);
      }
      let dados: unknown;
      try {
        dados = await resposta.json();
      } catch {
        throw new HttpsError("failed-precondition", "GET não retornou JSON válido.");
      }
      const raiz = dados && typeof dados === "object" && !Array.isArray(dados)
        ? dados as Record<string, unknown> : null;
      const lista: unknown = Array.isArray(dados) ? dados : raiz?.lista;
      if (!Array.isArray(lista)) {
        throw new HttpsError("failed-precondition", "GET não retornou lista válida.");
      }
      const encontrados = lista.filter((item: unknown) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return false;
        const r = item as Record<string, unknown>;
        return Number(r.Id) === registroId && Number(r.FuncionarioId) === funcionarioId &&
          String(r.Data ?? "").startsWith(data);
      }) as Record<string, unknown>[];
      if (encontrados.length !== 1) {
        throw new HttpsError("failed-precondition", "Registro de teste ausente ou duplicado.");
      }
      const registro = encontrados[0];
      if (typeof registro.Neutro !== "boolean" ||
        typeof registro.Compensado !== "boolean" ||
        typeof registro.Versao !== "string" || !registro.Versao ||
        Object.keys(registro).length < 80) {
        throw new HttpsError("failed-precondition", "Registro incompleto ou sem versão/flags.");
      }
      return registro;
    };

    const atual = await lerRegistro();
    const preparado: Record<string, unknown> = { ...atual, Neutro: true, Compensado: true };
    const alterados = (["Neutro", "Compensado"] as const).filter(
      (campo) => !Object.is(atual[campo], preparado[campo])
    );
    const resumo = {
      funcionarioId, registroId, data,
      atual: { neutro: atual.Neutro, compensado: atual.Compensado },
      desejado: { neutro: true, compensado: true },
      possuiVersao: true,
      camposRecebidos: Object.keys(atual).length,
      camposAlterados: alterados,
    };
    const entrada = request.data as Record<string, unknown> | null;
    // A confirmação precisa identificar a operação exata. Sem ela, é só leitura.
    const confirmar = entrada?.confirmar === true &&
      entrada?.confirmacao === "GRAVAR-169-2026-10-26-NEUTRO-COMPENSADO";
    if (!confirmar) {
      return {
        ok: true, modo: "previsualizacao", enviado: false, ...resumo,
        aviso: "Nenhum POST realizado. Para gravar é necessária confirmação explícita."
      };
    }
    // Impede alterar um registro cujas flags já mudaram desde o último teste.
    if (atual.Neutro !== false || atual.Compensado !== false) {
      throw new HttpsError("failed-precondition", "Estado atual diferente de false/false: POST cancelado.");
    }
    // Validação de alterações locais: somente as duas flags podem diferir.
    const demaisIguais = Object.keys(atual).every((campo) =>
      campo === "Neutro" || campo === "Compensado" ||
      Object.is(atual[campo], preparado[campo])
    );
    if (!demaisIguais || alterados.length !== 2) {
      throw new HttpsError("failed-precondition", "Payload contém alterações inesperadas.");
    }
    // ENDPOINT INTERNO: uma única tentativa; nunca repetir automaticamente.
    let post: Response;
    try {
      post = await fetch(`${base}/Batidas?origem=cartao+ponto`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify([preparado]),
      });
    } catch {
      throw new HttpsError("unavailable", "POST sem resposta conclusiva. Confira no Secullum antes de repetir.");
    }
    if (!post.ok) {
      throw new HttpsError("failed-precondition", `POST interno retornou HTTP ${post.status}. Não repetir sem conferir.`);
    }
    // Verificação independente: sucesso HTTP não significa persistência.
    const depois = await lerRegistro();
    const alteracoesColaterais = Object.keys(atual).filter((campo) => {
      if (campo === "Neutro" || campo === "Compensado" || campo === "Versao") return false;
      return JSON.stringify(atual[campo]) !== JSON.stringify(depois[campo]);
    });
    const flagsPersistidas = depois.Neutro === true && depois.Compensado === true;
    console.info("[SECULLUM_FLAGS_POST_TESTE]", {
      funcionarioId, registroId, data, httpStatus: post.status,
      flagsPersistidas, camposDiferentes: alteracoesColaterais,
    });
    return {
      ok: flagsPersistidas && alteracoesColaterais.length === 0,
      modo: "post-controlado",
      enviado: true,
      httpStatus: post.status,
      ...resumo,
      confirmado: { neutro: depois.Neutro, compensado: depois.Compensado },
      flagsPersistidas,
      alteracoesColaterais,
      aviso: flagsPersistidas && alteracoesColaterais.length === 0
        ? "Gravação confirmada pelo GET posterior."
        : "Verificação divergente. NÃO repetir o POST; conferir o registro no Secullum.",
    };
  }
);

/**
 * Atualização de flags por CPF/data para integração com o Controle de Ponto.
 * PILOTO RESTRITO: somente o usuário técnico autorizado.
 * Não disponibilizar a usuários comuns até existir RBAC de produção auditado.
 */
export const atualizarFlagsSecullum = onCall(
  {
    region: "southamerica-east1",
    secrets: [SECULLUM_USERNAME, SECULLUM_PASSWORD, SECULLUM_BANK_ID],
  },
  async (request) => {
    // Sessão do DP (entrarDP) + permissão de editar o Controle de Ponto
    // (antes: só a conta técnica de teste).
    await exigirPermissaoDP(request, "timekeeping", "edit");
    const entrada = (request.data ?? {}) as Record<string, unknown>;
    const cpf = onlyDigits(entrada.cpf);
    const data = entrada.data;
    const neutro = entrada.neutro;
    const compensado = entrada.compensado;
    if (cpf.length !== 11 || typeof data !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(data) ||
      !Number.isFinite(Date.parse(`${data}T12:00:00Z`)) ||
      new Date(`${data}T12:00:00Z`).toISOString().slice(0, 10) !== data ||
      typeof neutro !== "boolean" || typeof compensado !== "boolean") {
      throw new HttpsError("invalid-argument", "Informe CPF, data válida e as duas flags booleanas.");
    }
    const token = await getToken();
    const funcionarios = await apiGet<Array<Record<string, unknown>>>(
      "/IntegracaoExterna/Funcionarios", token, {},
    );
    if (!Array.isArray(funcionarios)) {
      throw new HttpsError("failed-precondition", "Lista de funcionários inválida.");
    }
    const vinculados = funcionarios.filter((f) => onlyDigits(f.Cpf) === cpf);
    if (vinculados.length !== 1 || !Number.isSafeInteger(Number(vinculados[0].Id))) {
      throw new HttpsError("failed-precondition", "CPF não corresponde a um único funcionário no Secullum.");
    }
    const funcionarioId = Number(vinculados[0].Id);
    const base = "https://pontoweb.secullum.com.br";
    const headers = {
      Authorization: `Bearer ${token}`,
      secullumidbancoselecionado: SECULLUM_BANK_ID.value(),
      Accept: "application/json",
    };
    const url = `${base}/Batidas/${funcionarioId}/${data}/${data}`;
    const lerRegistro = async (): Promise<Record<string, unknown>> => {
      const resposta = await fetch(url, { method: "GET", headers });
      if (!resposta.ok) {
        throw new HttpsError("unavailable", `GET do Secullum retornou HTTP ${resposta.status}.`);
      }
      let dados: unknown;
      try {
        dados = await resposta.json();
      } catch {
        throw new HttpsError("failed-precondition", "GET do Secullum sem JSON válido.");
      }
      const raiz = dados && typeof dados === "object" && !Array.isArray(dados)
        ? dados as Record<string, unknown> : null;
      const lista: unknown = Array.isArray(dados) ? dados : raiz?.lista;
      if (!Array.isArray(lista)) {
        throw new HttpsError("failed-precondition", "Resposta do Secullum sem lista válida.");
      }
      const encontrados = lista.filter((item: unknown) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return false;
        const registro = item as Record<string, unknown>;
        return Number(registro.FuncionarioId) === funcionarioId &&
          String(registro.Data ?? "").startsWith(data);
      }) as Record<string, unknown>[];
      if (encontrados.length !== 1) {
        throw new HttpsError("failed-precondition", "Dia não possui um registro único no Secullum.");
      }
      const registro = encontrados[0];
      if ((registro.Id === null || registro.Id === undefined || !Number.isSafeInteger(Number(registro.Id)) || Number(registro.Id) < 0) ||
        !(registro.Versao === null || (typeof registro.Versao === "string" && registro.Versao.length > 0)) ||
        typeof registro.Neutro !== "boolean" ||
        typeof registro.Compensado !== "boolean" ||
        Object.keys(registro).length < 80) {
        throw new HttpsError("failed-precondition", "Registro incompleto para atualização segura.");
      }
      return registro;
    };
    const antes = await lerRegistro();
    const registroId = Number(antes.Id);
    const alterados = (["Neutro", "Compensado"] as const).filter((campo) =>
      !Object.is(antes[campo], campo === "Neutro" ? neutro : compensado)
    );
    if (alterados.length === 0) {
      return {
        ok: true, modo: "sem-alteracao", enviado: false, funcionarioId, registroId, data,
        flagsPersistidas: true, alteracoesColaterais: [],
        confirmado: { neutro: antes.Neutro, compensado: antes.Compensado },
      };
    }
    const preparado: Record<string, unknown> = { ...antes, Neutro: neutro, Compensado: compensado };
    const somenteFlags = Object.keys(antes).every((campo) =>
      campo === "Neutro" || campo === "Compensado" ||
      JSON.stringify(antes[campo]) === JSON.stringify(preparado[campo])
    );
    if (!somenteFlags) {
      throw new HttpsError("failed-precondition", "Payload altera campos além das flags.");
    }
    // Endpoint interno, não documentado. Nunca realizar retry automático.
    let post: Response;
    try {
      post = await fetch(`${base}/Batidas?origem=cartao+ponto`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify([preparado]),
      });
    } catch {
      throw new HttpsError("unavailable", "POST sem resultado conclusivo. Conferir no Secullum antes de repetir.");
    }
    if (!post.ok) {
      throw new HttpsError("failed-precondition", `POST retornou HTTP ${post.status}. Conferir antes de repetir.`);
    }
    let depois: Record<string, unknown>;
    try {
      depois = await lerRegistro();
    } catch {
      throw new HttpsError("unavailable", "POST enviado, mas GET posterior falhou. Conferir manualmente antes de repetir.");
    }
    const alteracoesColaterais = Object.keys(antes).filter((campo) =>
      campo !== "Neutro" && campo !== "Compensado" && campo !== "Versao" && campo !== "Id" &&
      JSON.stringify(antes[campo]) !== JSON.stringify(depois[campo])
    );
    const flagsPersistidas = depois.Neutro === neutro && depois.Compensado === compensado;
    // Id pode passar de zero para positivo quando o Secullum persiste um registro virtual.
    // Nunca aceitar mudança de identidade/data nem alterações nos horários.
    if (Number(depois.FuncionarioId) !== funcionarioId || !String(depois.Data ?? "").startsWith(data)) {
      throw new HttpsError("failed-precondition", "Identidade do registro mudou após POST. Verificação manual obrigatória.");
    }
    console.info("[SECULLUM_FLAGS_POST_PILOTO]", {
      funcionarioId, registroId, data, flagsPersistidas,
      alteracoesColaterais, httpStatus: post.status,
    });
    return {
      ok: flagsPersistidas && alteracoesColaterais.length === 0,
      modo: "post-piloto", enviado: true, httpStatus: post.status,
      funcionarioId, registroId, data, flagsPersistidas, alteracoesColaterais,
      confirmado: { neutro: depois.Neutro, compensado: depois.Compensado },
    };
  }
);

/**
 * Diagnóstico somente leitura: Secullum funcionário 169, dia 30/10/2026.
 * Não grava flags, batidas ou Firestore. Exige a identidade técnica do piloto.
 * Endpoint interno não documentado, exclusivamente para este teste.
 */
export const consultarFlagsSecullum30OutTeste = onCall(
  {
    region: "southamerica-east1",
    secrets: [SECULLUM_USERNAME, SECULLUM_PASSWORD, SECULLUM_BANK_ID],
  },
  async (request) => {
    if (
      request.auth?.uid !== "TkdbEBo0WPcVFGM8AsMiDWuaCqG3" ||
      request.auth?.token.secullumNeutroWrite !== true
    ) {
      throw new HttpsError("permission-denied", "Identidade técnica de teste necessária.");
    }

    const funcionarioId = 169;
    const data = "2026-10-30";
    const token = await getToken();
    const url = `https://pontoweb.secullum.com.br/Batidas/${funcionarioId}/${data}/${data}`;
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        secullumidbancoselecionado: SECULLUM_BANK_ID.value(),
        Accept: "application/json",
      },
    });
    if (!response.ok) {
      throw new HttpsError("unavailable", `GET do Secullum retornou HTTP ${response.status}.`);
    }
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new HttpsError("failed-precondition", "GET do Secullum não retornou JSON válido.");
    }
    const object = payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>) : null;
    const lista = Array.isArray(payload) ? payload : object?.lista;
    if (!Array.isArray(lista)) {
      throw new HttpsError("failed-precondition", "GET do Secullum não retornou lista.");
    }
    const correspondentes = lista.filter((item: unknown) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return false;
      const registro = item as Record<string, unknown>;
      return Number(registro.FuncionarioId) === funcionarioId &&
        String(registro.Data ?? "").startsWith(data);
    }) as Record<string, unknown>[];
    if (correspondentes.length > 1) {
      throw new HttpsError("failed-precondition", "Mais de um registro para o funcionário/data.");
    }
    const registro = correspondentes[0];
    if (registro && (typeof registro.Neutro !== "boolean" ||
      typeof registro.Compensado !== "boolean")) {
      throw new HttpsError("failed-precondition", "Flags ausentes ou inválidas no registro.");
    }
    return {
      ok: true,
      modo: "somente-leitura",
      enviado: false,
      data,
      funcionarioId,
      encontrado: Boolean(registro),
      quantidadeRegistros: correspondentes.length,
      registroId: registro ? Number(registro.Id) : null,
      neutro: registro ? registro.Neutro : null,
      compensado: registro ? registro.Compensado : null,
      possuiVersao: registro ? Boolean(registro.Versao) : false,
    };
  },
);


/**
 * Consulta complementar SOMENTE DE LEITURA para as flags dos CPFs da pagina atual.
 * A API externa omite registros virtuais (Id=0) de datas sem batidas; a consulta
 * interna pode devolver Neutro/Compensado mesmo nesses casos.
 * Nao cria registros, nao atualiza batidas e nao executa POST no Secullum.
 * Piloto: resposta minima, no maximo 15 CPFs por chamada.
 */
export const consultarFlagsSecullumPagina = onCall(
  {
    region: "southamerica-east1",
    secrets: [SECULLUM_USERNAME, SECULLUM_PASSWORD, SECULLUM_BANK_ID],
  },
  async (request) => {
    const entrada = (request.data ?? {}) as { data?: unknown; cpfs?: unknown };
    const dia = entrada.data;
    const rawCpfs = entrada.cpfs;
    if (typeof dia !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dia) ||
      !Number.isFinite(Date.parse(`${dia}T12:00:00Z`)) ||
      new Date(`${dia}T12:00:00Z`).toISOString().slice(0, 10) !== dia ||
      !Array.isArray(rawCpfs) || rawCpfs.length < 1 || rawCpfs.length > 15 ||
      rawCpfs.some((cpf) => typeof cpf !== "string" || !/^\d{11}$/.test(cpf))) {
      throw new HttpsError("invalid-argument", "Informe data valida e de 1 a 15 CPFs com 11 digitos.");
    }
    const cpfs = [...new Set(rawCpfs as string[])];
    const token = await getToken();
    const funcionarios = await apiGet<Array<Record<string, unknown>>>(
      "/IntegracaoExterna/Funcionarios", token, {},
    );
    if (!Array.isArray(funcionarios)) {
      throw new HttpsError("unavailable", "Lista de funcionarios invalida.");
    }
    const idsPorCpf = new Map<string, number[]>();
    for (const funcionario of funcionarios) {
      const cpf = onlyDigits(funcionario.Cpf);
      const id = Number(funcionario.Id);
      if (!cpf || !Number.isSafeInteger(id) || id <= 0) continue;
      const ids = idsPorCpf.get(cpf) ?? [];
      ids.push(id);
      idsPorCpf.set(cpf, ids);
    }
    const consultar = async (cpf: string) => {
      const ids = idsPorCpf.get(cpf) ?? [];
      if (ids.length !== 1) return { cpfDigits: cpf, encontrado: false };
      const funcionarioId = ids[0];
      const url = `https://pontoweb.secullum.com.br/Batidas/${funcionarioId}/${dia}/${dia}`;
      try {
        const resposta = await fetch(url, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${token}`,
            secullumidbancoselecionado: SECULLUM_BANK_ID.value(),
            Accept: "application/json",
          },
        });
        if (!resposta.ok) return { cpfDigits: cpf, encontrado: false };
        const corpo: unknown = await resposta.json();
        const raiz = corpo && typeof corpo === "object" && !Array.isArray(corpo)
          ? corpo as Record<string, unknown> : null;
        const lista: unknown = Array.isArray(corpo) ? corpo : raiz?.lista;
        if (!Array.isArray(lista)) return { cpfDigits: cpf, encontrado: false };
        const registros = lista.filter((item): item is Record<string, unknown> => {
          if (!item || typeof item !== "object" || Array.isArray(item)) return false;
          const row = item as Record<string, unknown>;
          return Number(row.FuncionarioId) === funcionarioId &&
            String(row.Data ?? "").startsWith(dia);
        });
        if (registros.length !== 1) return { cpfDigits: cpf, encontrado: false };
        const row = registros[0];
        if (typeof row.Neutro !== "boolean" || typeof row.Compensado !== "boolean") {
          return { cpfDigits: cpf, encontrado: false };
        }
        return {
          cpfDigits: cpf, encontrado: true,
          neutro: row.Neutro as boolean,
          compensado: row.Compensado as boolean,
        };
      } catch {
        return { cpfDigits: cpf, encontrado: false };
      }
    };
    // Tres pedidos simultaneos para evitar sobrecarga no endpoint interno.
    const resultados: Awaited<ReturnType<typeof consultar>>[] = [];
    for (let i = 0; i < cpfs.length; i += 3) {
      resultados.push(...await Promise.all(cpfs.slice(i, i + 3).map(consultar)));
    }
    return { ok: true, modo: "somente-leitura", data: dia, resultados };
  },
);


/**
 * Previsualizacao de POST para o funcionario ID 169, com data selecionavel.
 * Retorna somente informacoes minimas; nao altera Secullum.
 * Nao enviar payload de registro completo ao browser.
 */
export const consultarFlagsSecullumPostPiloto = onCall(
  {
    region: "southamerica-east1",
    secrets: [SECULLUM_USERNAME, SECULLUM_PASSWORD, SECULLUM_BANK_ID],
  },
  async (request) => {
    if (request.auth?.uid !== "TkdbEBo0WPcVFGM8AsMiDWuaCqG3" ||
      request.auth?.token.secullumNeutroWrite !== true) {
      throw new HttpsError("permission-denied", "Conta tecnica nao autorizada.");
    }
    const dia = (request.data as { data?: unknown } | null)?.data;
    if (typeof dia !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(dia) ||
      !Number.isFinite(Date.parse(`${dia}T12:00:00Z`)) ||
      new Date(`${dia}T12:00:00Z`).toISOString().slice(0, 10) !== dia) {
      throw new HttpsError("invalid-argument", "Data invalida.");
    }
    const token = await getToken();
    const resposta = await fetch(`https://pontoweb.secullum.com.br/Batidas/169/${dia}/${dia}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        secullumidbancoselecionado: SECULLUM_BANK_ID.value(),
        Accept: "application/json",
      },
    });
    if (!resposta.ok) throw new HttpsError("unavailable", `GET do Secullum retornou HTTP ${resposta.status}.`);
    const payload: unknown = await resposta.json();
    const obj = payload && typeof payload === "object" && !Array.isArray(payload)
      ? payload as Record<string, unknown> : null;
    const lista: unknown = Array.isArray(payload) ? payload : obj?.lista;
    if (!Array.isArray(lista)) throw new HttpsError("failed-precondition", "Resposta sem lista.");
    const registros = lista.filter((item): item is Record<string, unknown> => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return false;
      const reg = item as Record<string, unknown>;
      return Number(reg.FuncionarioId) === 169 && String(reg.Data ?? "").startsWith(dia);
    });
    if (registros.length !== 1) {
      return {
        ok: true, data: dia, encontrado: false, quantidadeRegistros: registros.length,
        podePost: false, motivo: "Registro ausente ou ambiguo."
      };
    }
    const reg = registros[0];
    const id = Number(reg.Id);
    const versaoValida = typeof reg.Versao === "string" && reg.Versao.length > 0;
    const camposValidos = typeof reg.Neutro === "boolean" && typeof reg.Compensado === "boolean";
    const completo = Object.keys(reg).length >= 80;
    const podePost = Number.isSafeInteger(id) && id >= 0 &&
      (reg.Versao === null || versaoValida) && camposValidos && completo;
    return {
      ok: true, data: dia, encontrado: true, quantidadeRegistros: 1,
      funcionarioId: 169, registroId: id, possuiVersao: versaoValida,
      camposRecebidos: Object.keys(reg).length,
      neutro: camposValidos ? reg.Neutro as boolean : null,
      compensado: camposValidos ? reg.Compensado as boolean : null,
      podePost,
      motivo: podePost ? "Registro completo elegivel para teste controlado (inclui Id=0)." :
        "Registro incompleto, sem flags ou com identificador invalido. POST bloqueado.",
    };
  },
);

export { entrarDP } from "./entrarDP";

// SÓ LEITURA (27/10/2026): levantamento para o envio automático das
// situações do Ponto (falta, folga, férias, afastamento, atestado) ao
// Secullum. Devolve as justificativas cadastradas e, dos últimos dias, como
// justificativas/afastamentos aparecem — apenas contagens, sem nomes/CPF.
export const levantarJustificativasSecullum = onCall(
  { region: "southamerica-east1", secrets: [SECULLUM_USERNAME, SECULLUM_PASSWORD, SECULLUM_BANK_ID] },
  async (request) => {
    await exigirPermissaoDP(request, "timekeeping", "view");
    const token = await getToken();
    const hoje = new Date();
    const iso = (dias: number) => new Date(hoje.getTime() + dias * 86400000).toISOString().slice(0, 10);

    const justificativas = await apiGet<Array<Record<string, unknown>>>(
      "/IntegracaoExterna/Justificativas", token, {},
    );

    const contar = (mapa: Record<string, number>, chave: string) => {
      mapa[chave] = (mapa[chave] || 0) + 1;
    };

    const afastamentosPorTipo: Record<string, number> = {};
    let camposAfastamento: string[] = [];
    try {
      const afastamentos = await apiGet<Array<Record<string, unknown>>>(
        "/IntegracaoExterna/FuncionariosAfastamentos", token, { dataInicio: iso(-90), dataFim: iso(60) },
      );
      camposAfastamento = [...new Set((afastamentos || []).flatMap((a) => Object.keys(a)))].sort();
      for (const a of afastamentos || []) {
        const tipo = Object.entries(a)
          .filter(([k, v]) => /justific|motivo/i.test(k) && typeof v === "string" && v.trim())
          .map(([k, v]) => `${k}=${String(v).trim()}`)
          .join(" | ");
        contar(afastamentosPorTipo, tipo || "(sem justificativa/motivo)");
      }
    } catch (error) {
      afastamentosPorTipo["(erro ao consultar)"] = 1;
      console.warn("[LEVANTAMENTO] afastamentos", error);
    }

    // Batidas dos últimos 14 dias: valores que NÃO são horário (ex.: nome de
    // justificativa no lugar da batida) e campos com cara de justificativa.
    const valoresNaoHorario: Record<string, number> = {};
    let camposBatida: string[] = [];
    const batidas = await apiGet<Array<Record<string, unknown>>>(
      "/IntegracaoExterna/Batidas", token, { dataInicio: iso(-14), dataFim: iso(-1) },
    );
    camposBatida = [...new Set((batidas || []).flatMap((b) => Object.keys(b)))].sort();
    for (const b of batidas || []) {
      for (const [k, v] of Object.entries(b)) {
        if (typeof v !== "string" || !v.trim()) continue;
        if (!/entrada|saida|justific|afast|folga|observ|ocorr/i.test(k)) continue;
        if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(v.trim())) continue;
        contar(valoresNaoHorario, `${k.replace(/\d+$/, "")}=${v.trim()}`);
      }
    }

    return {
      justificativas: (justificativas || []).map((j) => ({
        nomeAbreviado: j.NomeAbreviado ?? j.nomeAbreviado,
        nomeCompleto: j.NomeCompleto ?? j.nomeCompleto,
        calcularComoFolga: j.CalcularComoFolga ?? j.calcularComoFolga,
        lancarComoHorasFalta: j.LancarComoHorasFalta ?? j.lancarComoHorasFalta,
        descontarDsr: j.DescontarDsr ?? j.descontarDsr,
        ajuste: j.Ajuste ?? j.ajuste,
        usarParaFerias: j.UsarJustificativaParaContagemDeFerias ?? j.usarJustificativaParaContagemDeFerias,
        desativada: j.Desativar ?? j.desativar,
      })),
      camposJustificativa: [...new Set((justificativas || []).flatMap((j) => Object.keys(j)))].sort(),
      afastamentosPorTipo,
      camposAfastamento,
      batidasAnalisadas: (batidas || []).length,
      camposBatida,
      valoresNaoHorario,
    };
  },
);

// Situação do Ponto → justificativa do Secullum (de-para combinado com o DP em
// 28/10/2026). DSR, feriado, presente e falta pendente não vão: o Secullum já
// calcula sozinho ou a situação ainda não é definitiva.
const JUSTIFICATIVA_POR_STATUS: Record<string, string> = {
  day_off: "FOLGA",
  absence_confirmed: "FALTA",
  medical_certificate: "AT.MED",
};
// Só dias a partir da entrada no ar: lançamentos anteriores nunca são mexidos.
const INICIO_JUSTIFICATIVAS_SECULLUM = "2026-10-29";

type ResultadoJustificativa = {
  cpf: string;
  enviados: number[];
  removidos: number[];
  jaEstavam: number[];
  conflitos: Array<{ grupo: number; valor: string }>;
  semRegistro?: boolean;
  erro?: string;
  conferido: boolean | null;
};

/**
 * Callable: lança FOLGA / FALTA / AT.MED no cartão ponto de um dia e tira a
 * anterior quando o DP corrige a situação.
 * Recebe { data, itens: [{ cpf, status, anterior, grupos }] }: status = situação
 * nova, anterior = a que estava salva no DP, grupos = metades sem horário batido
 * no DP (1 = Entrada1/Saida1, 2 = Entrada2/Saida2).
 * Antes de gravar lê o dia no Secullum: metade já com a mesma justificativa é
 * pulada (repetir é seguro), só sai a justificativa anterior exata e metade com
 * outro conteúdo não é tocada (conflito).
 */
export const enviarJustificativasSecullum = onCall(
  { region: "southamerica-east1", timeoutSeconds: 120, secrets: [SECULLUM_USERNAME, SECULLUM_PASSWORD, SECULLUM_BANK_ID] },
  async (request) => {
    await exigirPermissaoDP(request, "timekeeping", "edit");
    const p = (request.data ?? {}) as {
      data?: string;
      itens?: Array<{ cpf?: string; status?: string; anterior?: string; grupos?: number[] }>;
    };
    const data = p.data;
    if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      throw new HttpsError("invalid-argument", "Informe 'data' no formato YYYY-MM-DD.");
    }
    if (data < INICIO_JUSTIFICATIVAS_SECULLUM) {
      throw new HttpsError("failed-precondition", "Dias anteriores à integração não são lançados no Secullum.");
    }
    if (!Array.isArray(p.itens) || !p.itens.length || p.itens.length > 300) {
      throw new HttpsError("invalid-argument", "Lista de funcionários inválida.");
    }

    const token = await getToken();
    const funcs = await apiGet<Func[]>("/IntegracaoExterna/Funcionarios", token, {});
    const idPorCpf = new Map<string, unknown>();
    (funcs || []).forEach((f) => idPorCpf.set(onlyDigits(f.Cpf), f.Id));
    const lerDia = async () => {
      const batidas = await apiGet<Batida[]>("/IntegracaoExterna/Batidas", token, { dataInicio: data, dataFim: data });
      const porFuncionario = new Map<unknown, Batida>();
      (batidas || []).forEach((b) => porFuncionario.set(b.FuncionarioId, b));
      return porFuncionario;
    };
    const texto = (v: unknown) => String(v ?? "").trim();
    const metade = (b: Batida, g: number) => [texto(b[`Entrada${g}`]), texto(b[`Saida${g}`])].filter(Boolean);
    const apagarColuna = async (cpf: string, coluna: string): Promise<string | null> => {
      const resp = await fetch(`${BASE_URL}/IntegracaoExterna/CartaoPonto`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${token}`,
          secullumidbancoselecionado: SECULLUM_BANK_ID.value(),
          "Content-Type": "application/json",
          Accept: "application/json",
          "Accept-Language": "pt-BR",
        },
        body: JSON.stringify({ cpf, data, coluna, motivo: "Correção no Ponto do DP (Sistema Macro)" }),
      });
      if (resp.ok) return null;
      const raw = await resp.text();
      let corpo: unknown = null;
      try {
        corpo = raw ? JSON.parse(raw) : null;
      } catch (_e) {
        corpo = null;
      }
      return extractSecullumError(corpo, raw);
    };

    const antes = await lerDia();
    const resultados: ResultadoJustificativa[] = [];
    for (const item of p.itens) {
      const cpf = onlyDigits(item.cpf);
      const justificativa = JUSTIFICATIVA_POR_STATUS[String(item.status)];
      const anterior = JUSTIFICATIVA_POR_STATUS[String(item.anterior)];
      const resultado: ResultadoJustificativa = {
        cpf, enviados: [], removidos: [], jaEstavam: [], conflitos: [], conferido: null,
      };
      resultados.push(resultado);
      const grupos = justificativa ? [...new Set(item.grupos || [])].filter((g) => g === 1 || g === 2) : [];
      if (cpf.length !== 11 || (!grupos.length && !anterior)) {
        resultado.erro = "Dados inválidos para o Secullum.";
        continue;
      }
      const batida = antes.get(idPorCpf.get(cpf));
      if (!batida) {
        resultado.semRegistro = true;
        continue;
      }
      const vazias = new Set([1, 2].filter((g) => !metade(batida, g).length));

      // Correção: sai a justificativa anterior, só onde a metade tem exatamente
      // ela (horário batido ou outra justificativa ficam como estão).
      if (anterior && anterior !== justificativa) {
        for (const g of [1, 2]) {
          const atual = metade(batida, g);
          if (!atual.length || !atual.every((v) => v.toUpperCase() === anterior)) continue;
          for (const coluna of [`Entrada${g}`, `Saida${g}`]) {
            if (!texto(batida[coluna])) continue;
            const erro = await apagarColuna(cpf, coluna);
            if (erro) {
              resultado.erro = erro;
              break;
            }
          }
          if (resultado.erro) break;
          resultado.removidos.push(g);
          vazias.add(g);
        }
        if (resultado.erro) continue;
      }

      // Funcionário com uma metade só na escala (Memoria = horário programado):
      // não lança justificativa na metade que ele não trabalha.
      const programados = [1, 2].filter((g) => texto(batida[`MemoriaEntrada${g}`]) || texto(batida[`MemoriaSaida${g}`]));
      const alvo = programados.length ? grupos.filter((g) => programados.includes(g)) : grupos;
      for (const g of alvo) {
        const atual = metade(batida, g);
        if (vazias.has(g)) {
          const res = await apiPost("/IntegracaoExterna/CartaoPonto/Justificativa", token, {
            cpf, data, grupo: g, justificativa,
          });
          if (!res.ok) {
            resultado.erro = extractSecullumError(res.data, res.raw);
            break;
          }
          resultado.enviados.push(g);
        } else if (atual.every((v) => v.toUpperCase() === justificativa)) {
          resultado.jaEstavam.push(g);
        } else {
          resultado.conflitos.push({ grupo: g, valor: atual.join(" / ") });
        }
      }
    }

    // Conferência: relê o dia; a nova tem que aparecer nas metades enviadas e a
    // anterior não pode ter ficado nas metades de onde saiu.
    if (resultados.some((r) => r.enviados.length || r.removidos.length)) {
      const depois = await lerDia();
      for (const r of resultados) {
        if (!r.enviados.length && !r.removidos.length) continue;
        const item = p.itens.find((i) => onlyDigits(i.cpf) === r.cpf);
        const justificativa = JUSTIFICATIVA_POR_STATUS[String(item?.status)];
        const anterior = JUSTIFICATIVA_POR_STATUS[String(item?.anterior)];
        const batida = depois.get(idPorCpf.get(r.cpf));
        r.conferido = Boolean(batida &&
          r.enviados.every((g) => metade(batida, g).some((v) => v.toUpperCase().includes(justificativa))) &&
          r.removidos.every((g) => r.enviados.includes(g) ||
            !metade(batida, g).some((v) => v.toUpperCase() === anterior)));
      }
    }
    console.log("[JUSTIFICATIVAS_SECULLUM]", {
      data,
      uid: request.auth?.uid,
      itens: resultados.map((r) => ({ ...r, cpf: `***${r.cpf.slice(-3)}` })),
    });
    return { resultados };
  },
);
