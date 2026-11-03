import type { PdfFile } from "../pdfTools";
import { normalizarNome, semAcentos, semelhanca } from "../names";

// Conferência de folha e ponto: Extrato Mensal (Domínio) x Cartão Ponto (Secullum).
// Mesmas regras do programa em Python (comparador_folha/motor.py, v11.1).

const CONECTORES = new Set(["DA", "DAS", "DE", "DO", "DOS", "E"]);
const HORARIO = String.raw`\d{1,3}[:,.]\d{2}`;
const EVENTOS_EXTRATO = {
  he50: new RegExp(String.raw`\b150\s+HORA(?:S)?\s+EXTRA(?:S)?\s+50%\s+(${HORARIO})`, "i"),
  he75: new RegExp(String.raw`\b205\s+HORA(?:S)?\s+EXTRA(?:S)?\s+75%\s+(${HORARIO})`, "i"),
  he120: new RegExp(String.raw`\b300\s+HORA(?:S)?\s+EXTRA(?:S)?\s+120%\s+(${HORARIO})`, "i"),
};

export const CARGOS_COM_INSALUBRIDADE_40 = [
  "AUXILIAR DE OBRAS",
  "BOMBEIRO HIDRAULICO",
  "PEDREIRO",
  "AUXILIAR DE SERRALHERIA",
  "SERRALHEIRO",
  "MECANICO",
  "SOLDADOR",
];
export const CARGO_COM_PERICULOSIDADE = "OPERADOR DE ROLO";

export type Ocorrencia = { data: string; dia: string; tipo: "FALTA" | "ATESTADO" | "OUTRA"; descricao: string };

export interface RegistroFolha {
  nome: string;
  cpf: string;
  empresa: string;
  cargo: string;
  he50: number | null;
  he75: number | null;
  he120: number | null;
  faltas: number | null;
  liquido: number | null;
  competencia: string;
  temInsalubridade40: boolean;
  temPericulosidade: boolean;
  pagina: number;
}

export interface RegistroPonto {
  nome: string;
  cpf: string;
  funcao: string;
  periodo: string;
  he50: number | null;
  he75: number | null;
  he120: number | null;
  faltas: number | null;
  faltasHoras: number | null;
  normais: number | null;
  carga: number | null;
  dsr: number | null;
  ocorrencias: Ocorrencia[];
  pagina: number;
}

export type Situacao = "CORRETO" | "ARREDONDAMENTO" | "DIVERGENTE" | "NÃO ENCONTRADO" | "SOMENTE NO PONTO";
export const SITUACOES: Situacao[] = ["CORRETO", "ARREDONDAMENTO", "DIVERGENTE", "NÃO ENCONTRADO", "SOMENTE NO PONTO"];

export interface Comparacao {
  chave: string;
  nomeExtrato: string;
  nomePonto: string;
  cpf: string;
  extrato50: number | null;
  ponto50: number | null;
  diferenca50: number | null;
  extrato75: number | null;
  ponto75: number | null;
  diferenca75: number | null;
  extrato120: number | null;
  ponto120: number | null;
  diferenca120: number | null;
  faltasExtrato: number | null;
  faltasPonto: number | null;
  diferencaFaltas: number | null;
  situacao: Situacao;
  cargo: string;
  motivo: string;
  notaNome: number;
  paginaExtrato: number;
  paginaPonto: number;
}

/** "02:10", "2,10" ou "2.10" em minutos. */
export function minutos(horario: string | undefined | null) {
  const achou = /^\s*(\d{1,3})[:,.](\d{2})\s*$/.exec(horario || "");
  return achou ? Number(achou[1]) * 60 + Number(achou[2]) : null;
}

function numeroBrasileiro(texto: string | undefined) {
  if (!texto) return null;
  const valor = Number(texto.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(valor) ? valor : null;
}

export function formatarMinutos(valor: number | null | undefined) {
  if (valor === null || valor === undefined) return "";
  const sinal = valor < 0 ? "-" : "";
  const absoluto = Math.abs(valor);
  return `${sinal}${String(Math.floor(absoluto / 60)).padStart(2, "0")}:${String(absoluto % 60).padStart(2, "0")}`;
}

function nomeSemConectores(texto: string) {
  return normalizarNome(texto).split(" ").filter((parte) => parte && !CONECTORES.has(parte)).join(" ");
}

export function motivoAdicionalObrigatorio(registro: RegistroFolha) {
  const cargo = normalizarNome(registro.cargo);
  if (!cargo) return "";
  if (CARGOS_COM_INSALUBRIDADE_40.some((exigido) => cargo.startsWith(exigido)) && !registro.temInsalubridade40) {
    return `Cargo ${registro.cargo} sem INSALUBRIDADE 40% no extrato`;
  }
  if (cargo.startsWith(CARGO_COM_PERICULOSIDADE) && !registro.temPericulosidade) {
    return `Cargo ${registro.cargo} sem PERICULOSIDADE no extrato`;
  }
  return "";
}

// ---------------------------------------------------------------------------
// Extrato Mensal (Domínio)

// Nome comprido encosta em "Situação:" sem espaço (o Python cortava o nome ali).
const MARCADOR_EXTRATO = /Empr\.:\s*\d+\s+(.+?)\s*Situa[cç][aã]o:\s*[^\n]+?CPF:\s*([\d.-]+)/gi;
// Resumos do serviço/empresa no fim de algumas páginas não pertencem ao último funcionário.
const INICIO_RESUMO = /^\s*(?:Resumo\s+por\s+Rubricas(?:\s+do\s+Servi[cç]o)?|Resumo\s+do\s+Servi[cç]o|Totais?\s+(?:do\s+)?Servi[cç]o|Resumo\s+Geral)\s*$/im;

export function extrairExtrato(pdf: PdfFile): RegistroFolha[] {
  const registros: RegistroFolha[] = [];
  pdf.pages.forEach((texto, indice) => {
    const competencia = /Compet[eê]ncia:\s*(\d{2}\/\d{4})/i.exec(texto)?.[1] || "";
    const empresa = /\bEmpresa:\s*(?:\d+\s*-\s*)?(.+?)\s{2,}P[aá]gina:/i.exec(texto)?.[1].trim() || "";
    const encontrados = Array.from(texto.matchAll(MARCADOR_EXTRATO));
    encontrados.forEach((encontrado, posicao) => {
      const inicio = encontrado.index ?? 0;
      const fim = posicao + 1 < encontrados.length ? encontrados[posicao + 1].index ?? texto.length : texto.length;
      let bloco = texto.slice(inicio, fim);
      const resumo = INICIO_RESUMO.exec(bloco);
      if (resumo) bloco = bloco.slice(0, resumo.index);

      const falta = /\bFALTAS\s*-\s*DIAS\s+(\d+(?:[,.]\d+)?)/i.exec(bloco);
      registros.push({
        nome: encontrado[1].trim(),
        cpf: encontrado[2].trim(),
        empresa,
        cargo: /\bCargo:\s*(?:\d+\s+)?(.+?)\s+C\.B\.O:/i.exec(bloco)?.[1].trim() || "",
        he50: minutos(EVENTOS_EXTRATO.he50.exec(bloco)?.[1]),
        he75: minutos(EVENTOS_EXTRATO.he75.exec(bloco)?.[1]),
        he120: minutos(EVENTOS_EXTRATO.he120.exec(bloco)?.[1]),
        faltas: falta ? Math.trunc(Number(falta[1].replace(",", "."))) : null,
        liquido: numeroBrasileiro(/\bL[ií]quido:\s*([\d.]+,\d{2})/i.exec(bloco)?.[1]),
        competencia,
        temInsalubridade40: /\bINSALUBRIDADE\s+40%/i.test(bloco),
        temPericulosidade: /\bPERICULOSIDADE\b/i.test(bloco),
        pagina: indice + 1,
      });
    });
  });
  return registros;
}

// ---------------------------------------------------------------------------
// Cartão Ponto (Secullum): uma página por funcionário.

const H = `(${HORARIO})`;
// Ordem das colunas do TOTAIS no layout de referência: atraso/faltas, normais, 50%, 75%, 120%, carga, DSR.
const TOTAIS = new RegExp(String.raw`\bTOTAIS\s+${H}\s+${H}\s+${H}\s+${H}\s+${H}\s+${H}\s+${H}`, "i");

function ocorrenciasDaPagina(texto: string): Ocorrencia[] {
  const saida: Ocorrencia[] = [];
  for (const linha of texto.split("\n")) {
    const achou = /^\s*(\d{2}\/\d{2}\/\d{4})\s*-\s*([A-Za-zÀ-ÿ]{3})\s*(.*)$/.exec(linha);
    if (!achou) continue;
    const descricao = achou[3].replace(/\s+/g, " ").trim();
    // Linha normal só tem batidas/horas; letras indicam ocorrência (FALTA, AT.MED, FOLGA...).
    const semHorarios = descricao.replace(new RegExp(`${HORARIO}[^\\s]*`, "g"), " ");
    let evento = semHorarios.replace(/[^A-Za-zÀ-ÿ. ]/g, " ").replace(/\s+/g, " ").trim().replace(/^[ .]+|[ .]+$/g, "");
    if (!evento) continue;
    const partes = evento.split(" ");
    if (partes.length && new Set(partes.map((parte) => parte.toUpperCase())).size === 1) evento = partes[0];
    const normalizado = semAcentos(evento).toUpperCase();
    const tipo = normalizado.includes("FALTA") ? "FALTA"
      : ["AT.MED", "ATEST", "MEDIC"].some((parte) => normalizado.includes(parte)) ? "ATESTADO" : "OUTRA";
    saida.push({ data: achou[1], dia: achou[2], tipo, descricao: evento });
  }
  return saida;
}

export function extrairPonto(pdf: PdfFile): RegistroPonto[] {
  const registros: RegistroPonto[] = [];
  pdf.pages.forEach((texto, indice) => {
    const nome = /\bNOME:\s*\n\s*([^\n]+)/i.exec(texto);
    const totais = TOTAIS.exec(texto);
    if (!nome || !totais) return;
    const cpf = /\bCPF:\s*(?:[^\n]*\n)?\s*\d{2}\/\d{2}\/\d{4}\s+([\d.-]+)/i.exec(texto);
    const ocorrencias = ocorrenciasDaPagina(texto);
    const linhasFalta = ocorrencias.filter((ocorrencia) => ocorrencia.tipo === "FALTA").length;
    const linhaFuncao = /\bFUNÇÃO:\s*\n([^\n]+)/i.exec(texto)?.[1] || "";
    const partesFuncao = linhaFuncao.split(/\s{2,}/).map((parte) => parte.trim()).filter(Boolean);
    registros.push({
      nome: nome[1].trim(),
      cpf: cpf ? cpf[1].trim() : "",
      funcao: partesFuncao[partesFuncao.length - 1] || "",
      periodo: /Per[ií]odo:\s*([^\n.]+)/i.exec(texto)?.[1].trim() || "",
      he50: minutos(totais[3]),
      he75: minutos(totais[4]),
      he120: minutos(totais[5]),
      faltas: linhasFalta || null,
      faltasHoras: minutos(totais[1]),
      normais: minutos(totais[2]),
      carga: minutos(totais[6]),
      dsr: minutos(totais[7]),
      ocorrencias,
      pagina: indice + 1,
    });
  });
  return registros;
}

// ---------------------------------------------------------------------------
// Comparação

function notaNome(a: string, b: string) {
  const a1 = nomeSemConectores(a);
  const b1 = nomeSemConectores(b);
  if (a1 === b1) return 1;
  if (a1.includes(b1) || b1.includes(a1)) return 0.97;
  return semelhanca(a1, b1);
}

function diferenca(a: number | null, b: number | null) {
  return (b ?? 0) - (a ?? 0);
}

export function comparar(extrato: RegistroFolha[], ponto: RegistroPonto[], toleranciaMinutos = 5, limiarNome = 0.82): Comparacao[] {
  const usados = new Set<number>();
  const resultado: Comparacao[] = [];
  const porCpf = new Map<string, number>();
  ponto.forEach((registro, indice) => {
    const cpf = registro.cpf.replace(/\D/g, "");
    if (registro.cpf) porCpf.set(cpf, indice);
  });

  extrato.forEach((folha, posicao) => {
    const motivos: string[] = [];
    const adicional = motivoAdicionalObrigatorio(folha);
    if (adicional) motivos.push(adicional);
    let indice = porCpf.get(folha.cpf.replace(/\D/g, ""));
    let nota = indice !== undefined ? 1 : 0;
    if (indice === undefined) {
      // Mesmo desempate do Python: maior nota e, no empate, o maior índice.
      let melhor: [number, number] | null = null;
      ponto.forEach((registro, i) => {
        if (usados.has(i)) return;
        const candidato: [number, number] = [notaNome(folha.nome, registro.nome), i];
        if (!melhor || candidato[0] > melhor[0] || (candidato[0] === melhor[0] && candidato[1] > melhor[1])) melhor = candidato;
      });
      if (melhor) {
        nota = melhor[0];
        if (nota >= limiarNome) indice = melhor[1];
      }
    }

    let registroPonto: RegistroPonto | null = null;
    let situacao: Situacao;
    if (indice === undefined) {
      motivos.push("Funcionário não localizado no ponto");
      situacao = adicional ? "DIVERGENTE" : "NÃO ENCONTRADO";
    } else {
      registroPonto = ponto[indice];
      usados.add(indice);
      const diffs = [
        Math.abs(diferenca(folha.he50, registroPonto.he50)),
        Math.abs(diferenca(folha.he75, registroPonto.he75)),
        Math.abs(diferenca(folha.he120, registroPonto.he120)),
      ];
      const faltaDiff = Math.abs(diferenca(folha.faltas, registroPonto.faltas));
      ["50%", "75%", "120%"].forEach((nomeHora, i) => {
        if (diffs[i] > toleranciaMinutos) motivos.push(`Hora extra ${nomeHora} divergente`);
      });
      if (faltaDiff !== 0) motivos.push("Quantidade de faltas divergente");
      if (adicional) situacao = "DIVERGENTE";
      else if (diffs.every((d) => d === 0) && faltaDiff === 0) situacao = "CORRETO";
      else if (diffs.every((d) => d <= toleranciaMinutos) && faltaDiff === 0) situacao = "ARREDONDAMENTO";
      else situacao = "DIVERGENTE";
    }

    resultado.push({
      chave: `e${posicao}`,
      nomeExtrato: folha.nome,
      nomePonto: registroPonto?.nome || "",
      cpf: folha.cpf,
      extrato50: folha.he50,
      ponto50: registroPonto?.he50 ?? null,
      diferenca50: diferenca(folha.he50, registroPonto?.he50 ?? null),
      extrato75: folha.he75,
      ponto75: registroPonto?.he75 ?? null,
      diferenca75: diferenca(folha.he75, registroPonto?.he75 ?? null),
      extrato120: folha.he120,
      ponto120: registroPonto?.he120 ?? null,
      diferenca120: diferenca(folha.he120, registroPonto?.he120 ?? null),
      faltasExtrato: folha.faltas,
      faltasPonto: registroPonto?.faltas ?? null,
      diferencaFaltas: diferenca(folha.faltas, registroPonto?.faltas ?? null),
      situacao,
      cargo: folha.cargo,
      motivo: motivos.join("; "),
      notaNome: nota,
      paginaExtrato: folha.pagina,
      paginaPonto: registroPonto?.pagina ?? 0,
    });
  });

  ponto.forEach((registro, i) => {
    if (usados.has(i)) return;
    resultado.push({
      chave: `p${i}`,
      nomeExtrato: "",
      nomePonto: registro.nome,
      cpf: registro.cpf,
      extrato50: null, ponto50: registro.he50, diferenca50: null,
      extrato75: null, ponto75: registro.he75, diferenca75: null,
      extrato120: null, ponto120: registro.he120, diferenca120: null,
      faltasExtrato: null, faltasPonto: registro.faltas, diferencaFaltas: null,
      situacao: "SOMENTE NO PONTO",
      cargo: "",
      motivo: "Funcionário consta somente no ponto",
      notaNome: 0,
      paginaExtrato: 0,
      paginaPonto: registro.pagina,
    });
  });
  return resultado;
}

/** Período do Cartão Ponto ("21/09/2026 até 20/10/2026") mais frequente. */
export function periodoDoPonto(ponto: RegistroPonto[]) {
  const contagem = new Map<string, number>();
  ponto.forEach((registro) => registro.periodo && contagem.set(registro.periodo, (contagem.get(registro.periodo) || 0) + 1));
  return Array.from(contagem).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
}

export function competenciaDoExtrato(extrato: RegistroFolha[]) {
  return extrato.find((registro) => registro.competencia)?.competencia || "";
}

