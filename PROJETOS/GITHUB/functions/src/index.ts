import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";

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
  { secrets: [SECULLUM_USERNAME, SECULLUM_PASSWORD, SECULLUM_BANK_ID] },
  async (request) => {
    const data = (request.data as { data?: string } | undefined)?.data;
    if (!data || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
      throw new HttpsError(
        "invalid-argument",
        "Informe 'data' no formato YYYY-MM-DD.",
      );
    }

    const token = await getToken();

    const funcs = await apiGet<Func[]>(
      "/IntegracaoExterna/Funcionarios",
      token,
      {},
    );
    const byId = new Map<unknown, Func>();
    (funcs || []).forEach((f) => byId.set(f.Id, f));

    const batidas = await apiGet<Batida[]>(
      "/IntegracaoExterna/Batidas",
      token,
      { dataInicio: data, dataFim: data },
    );

    // Origem das marcações (celular/computador/manual/automático) via FonteDados.
    let fontes: FonteRow[] = [];
    try {
      fontes = await apiGet<FonteRow[]>(
        "/IntegracaoExterna/FonteDados",
        token,
        { dataInicio: data, dataFim: data },
      );
    } catch (fonteError) {
      console.error(
        "[Secullum] FonteDados falhou:",
        (fonteError as Error)?.message,
      );
      fontes = [];
    }
    // Log para diagnóstico (visível em `firebase functions:log`).
    console.log(
      "[Secullum] FonteDados",
      JSON.stringify({
        data,
        count: Array.isArray(fontes) ? fontes.length : 0,
        sample: Array.isArray(fontes) ? fontes.slice(0, 3) : fontes,
      }),
    );

    // Monta, por CPF, a lista de marcações {hora, code} a partir do FonteDados.
    const fonteByCpf = new Map<string, Array<{ hora: string; code: string }>>();
    (fontes || []).forEach((row) => {
      const cpf = onlyDigits(
        pickField(row, ["Cpf", "FuncionarioCpf", "CpfFuncionario"]),
      );
      if (!cpf) return;
      const hora = normalizeHora(
        pickField(row, ["Hora", "DataHora", "HoraMarcacao", "Horario"]),
      );
      if (!hora) return;
      const code = classifyOrigem(toNum(pickField(row, ["Origem"])));
      const list = fonteByCpf.get(cpf) || [];
      list.push({ hora, code });
      fonteByCpf.set(cpf, list);
    });

    return (batidas || []).map((b) => {
      const f = (byId.get(b.FuncionarioId) || {}) as Func;
      const cpfDigits = onlyDigits(f.Cpf);
      const fonteList = fonteByCpf.get(cpfDigits) || [];
      const originFor = (val: unknown): string => {
        const hora = normalizeHora(val);
        if (!hora) return "";
        const match = fonteList.find((x) => x.hora === hora);
        if (match) return match.code;
        // Sem marcação de origem correspondente → origem não identificada (neutro).
        return "secullum";
      };
      return {
        funcionarioId: b.FuncionarioId ?? null,
        nome: f.Nome ?? null,
        cpf: f.Cpf ?? null,
        cpfDigits,
        numeroFolha: f.NumeroFolha ?? null,
        possuiFoto: f.PossuiFoto ?? null,
        data: b.Data ?? null,
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
  { secrets: [SECULLUM_USERNAME, SECULLUM_PASSWORD, SECULLUM_BANK_ID] },
  async (request) => {
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