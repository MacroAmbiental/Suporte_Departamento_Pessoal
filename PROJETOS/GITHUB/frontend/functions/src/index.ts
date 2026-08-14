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

const onlyDigits = (v: unknown) => String(v ?? "").replace(/\D/g, "");

type Func = Record<string, unknown>;
type Batida = Record<string, unknown>;

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

    return (batidas || []).map((b) => {
      const f = (byId.get(b.FuncionarioId) || {}) as Func;
      return {
        funcionarioId: b.FuncionarioId ?? null,
        nome: f.Nome ?? null,
        cpf: f.Cpf ?? null,
        cpfDigits: onlyDigits(f.Cpf),
        numeroFolha: f.NumeroFolha ?? null,
        possuiFoto: f.PossuiFoto ?? null,
        data: b.Data ?? null,
        entrada1: b.Entrada1 ?? "",
        saida1: b.Saida1 ?? "",
        entrada2: b.Entrada2 ?? "",
        saida2: b.Saida2 ?? "",
        entrada3: b.Entrada3 ?? "",
        saida3: b.Saida3 ?? "",
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
