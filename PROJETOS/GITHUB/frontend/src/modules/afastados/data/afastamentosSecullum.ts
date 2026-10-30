import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp } from "@/services/firebase";
import { exigirSessaoServidor } from "@/services/firebaseSession";

// Afastamentos por período lançados no Secullum (function listarAfastamentosSecullum).

export type AfastamentoSecullum = {
  cpf: string;
  nome: string;
  inicio: string;
  fim: string;
  justificativa: string;
  motivo: string;
};

export async function listarAfastamentosSecullum(userId: string | undefined, dataInicio: string, dataFim: string) {
  if (!firebaseApp) throw new Error("Firebase nao inicializado.");
  await exigirSessaoServidor(userId);
  const callable = httpsCallable<{ dataInicio: string; dataFim: string }, { afastamentos: AfastamentoSecullum[]; campos: string[] }>(
    getFunctions(firebaseApp, "southamerica-east1"),
    "listarAfastamentosSecullum",
    { timeout: 60000 },
  );
  return (await callable({ dataInicio, dataFim })).data;
}

const chave = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/[^A-Z0-9]+/g, "");

/** Tipo do DP sugerido pelo nome da justificativa do Secullum ("" = escolher na tela). */
export function tipoSugerido(justificativa: string): string {
  const texto = chave(justificativa);
  if (!texto) return "";
  if (texto.includes("FERIAS")) return "ferias";
  if (texto.startsWith("DEM")) return "demissao";
  if (texto.startsWith("AT") && (texto.includes("MED") || texto.includes("EST"))) return "Atestado médico";
  if (texto.includes("ACID")) return "Incapacidade Temporária acidentário";
  if (texto.includes("INVALID")) return "Afastamento por invalidez";
  if (texto.includes("INSS") || texto.includes("AUXILIO") || texto.includes("DOENCA")) return "Incapacidade Temporária";
  // AFASTOU no Secullum é o afastamento genérico (não previdenciário).
  if (texto.includes("AFAST")) return "Outro afastamento";
  if (texto.includes("MATERN")) return "Licença-maternidade";
  if (texto.includes("PATERN")) return "Licença-paternidade";
  return "";
}

const INSS_LABELS = ["Incapacidade Temporária", "Incapacidade Temporária acidentário", "Afastamento por invalidez"];

/** Justificativa do Secullum para um tipo do DP (de-para combinado com o DP em 30/10/2026). */
export function justificativaDoTipo(kind: string, label: string) {
  if (kind === "certificate") return "AT.MED";
  if (INSS_LABELS.includes(label)) return "INSS";
  return "AFASTOU"; // Outro afastamento e licenças (o Secullum não tem justificativa de licença)
}

type SincronizarInput = {
  acao: "lancar" | "apagar" | "alterar";
  cpf: string;
  inicio: string;
  fim: string;
  novoInicio?: string;
  novoFim?: string;
  justificativa: string;
  motivo?: string;
};

export async function sincronizarAfastamentoSecullum(userId: string | undefined, input: SincronizarInput) {
  if (!firebaseApp) throw new Error("Firebase nao inicializado.");
  await exigirSessaoServidor(userId);
  const callable = httpsCallable<SincronizarInput, { ok: boolean }>(
    getFunctions(firebaseApp, "southamerica-east1"),
    "sincronizarAfastamentoSecullum",
    { timeout: 70000 },
  );
  await callable(input);
}
