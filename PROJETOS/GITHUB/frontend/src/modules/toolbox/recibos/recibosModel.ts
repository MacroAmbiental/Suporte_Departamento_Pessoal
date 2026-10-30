import type { PdfFile } from "../pdfTools";
import { normalizarCpf, normalizarNome, semAcentos, semelhanca } from "../names";

// Regras do antigo "Juntador de Recibos e Equipes v2" (motor.py).

export interface DocumentoFuncionario {
  nome: string;
  cpf: string;
  competencia: string;
  paginas: number[];
}

export type StatusRecibo = "PRONTO" | "COMPETÊNCIA DIVERGENTE" | "SEM ADIANTAMENTO" | "SEM PAGAMENTO";

export interface Correspondencia {
  chave: string;
  nome: string;
  cpf: string;
  competenciaPagamento: string;
  competenciaAdiantamento: string;
  paginasPagamento: number[];
  paginasAdiantamento: number[];
  status: StatusRecibo;
}

const PADROES_NOME = [
  /Nome\s+do\s+Funcion[aá]rio[^\n]*\n\s*(?:\n\s*)?\d+\s+(.+?)\s{2,}\d{6}\b/i,
  /\bEmpr\.:\s*\d+\s+(.+?)\s+Situa[cç][aã]o:/i,
  /\bFuncion[aá]rio\s*:\s*([^\n]+)/i,
  /\bEmpregado\s*:\s*(?:\d+\s*-?\s*)?([^\n]+)/i,
  /\bNome\s*:\s*\n?\s*([^\n]+)/i,
  /\bColaborador\s*:\s*([^\n]+)/i,
];

const PADROES_COMPETENCIA = [
  /\bCompet[eê]ncia\s*:\s*(\d{2}[/-]\d{4})/i,
  /\bRefer[eê]ncia\s*:\s*(\d{2}[/-]\d{4})/i,
  /\bM[eê]s\s*\/\s*Ano\s*:\s*(\d{2}[/-]\d{4})/i,
  /\bPer[ií]odo\s*:\s*(\d{2}[/-]\d{4})/i,
];

const MESES: Record<string, string> = {
  JANEIRO: "01", FEVEREIRO: "02", MARCO: "03", ABRIL: "04", MAIO: "05", JUNHO: "06",
  JULHO: "07", AGOSTO: "08", SETEMBRO: "09", OUTUBRO: "10", NOVEMBRO: "11", DEZEMBRO: "12",
};

const CPF_RE = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;

// O texto vem com as colunas separadas por 3 espaços: o nome termina na primeira coluna.
function primeiraColuna(texto: string) {
  return texto.split(/\s{3,}/)[0];
}

function identificarNome(texto: string) {
  for (const padrao of PADROES_NOME) {
    const encontrado = padrao.exec(texto);
    if (!encontrado) continue;
    const nome = primeiraColuna(encontrado[1]).replace(/\s+/g, " ").trim().replace(/^[\s:-]+|[\s:-]+$/g, "");
    // Evita capturar cabeçalhos inteiros em modelos com NOME: vazio.
    const palavras = normalizarNome(nome).split(" ").filter(Boolean).length;
    if (palavras >= 2 && palavras <= 12 && !/\d/.test(nome)) return nome;
  }
  return "";
}

function identificarCompetencia(texto: string, anterior: string) {
  for (const padrao of PADROES_COMPETENCIA) {
    const encontrado = padrao.exec(texto);
    if (encontrado) return encontrado[1].replace("-", "/");
  }
  const extenso = /\b(Janeiro|Fevereiro|Mar[cç]o|Abril|Maio|Junho|Julho|Agosto|Setembro|Outubro|Novembro|Dezembro)\s+de\s+(\d{4})\b/i.exec(texto);
  const mes = extenso ? MESES[semAcentos(extenso[1]).toUpperCase()] : "";
  return mes ? `${mes}/${extenso![2]}` : anterior;
}

/** Agrupa as páginas de um PDF de recibos por funcionário (CPF ou, sem CPF, nome). */
export function extrairDocumentos(pdf: PdfFile): DocumentoFuncionario[] {
  const agrupados = new Map<string, DocumentoFuncionario>();
  let competenciaAnterior = "";
  let paginasSemTexto = 0;
  pdf.pages.forEach((texto, numero) => {
    if (!texto.trim()) {
      paginasSemTexto += 1;
      return;
    }
    const competencia = identificarCompetencia(texto, competenciaAnterior);
    if (competencia) competenciaAnterior = competencia;
    const cpfs = Array.from(new Set((texto.match(CPF_RE) || []).map(normalizarCpf).filter(Boolean)));
    const cpf = cpfs.length === 1 ? cpfs[0] : "";
    const nome = identificarNome(texto);
    const chave = cpf || normalizarNome(nome);
    if (!chave) return;
    const registro = agrupados.get(chave) || { nome, cpf, competencia, paginas: [] };
    if (nome && !registro.nome) registro.nome = nome;
    if (competencia && !registro.competencia) registro.competencia = competencia;
    registro.paginas.push(numero);
    agrupados.set(chave, registro);
  });
  if (!agrupados.size && paginasSemTexto) {
    throw new Error(`${pdf.name}: o PDF não tem texto pesquisável (pode estar digitalizado como imagem).`);
  }
  return Array.from(agrupados.values());
}

export function cruzarDocumentos(pagamentos: DocumentoFuncionario[], adiantamentos: DocumentoFuncionario[]): Correspondencia[] {
  const porCpf = new Map(adiantamentos.filter((r) => r.cpf).map((r) => [r.cpf, r]));
  const porNome = new Map(adiantamentos.filter((r) => r.nome).map((r) => [normalizarNome(r.nome), r]));
  const usados = new Set<DocumentoFuncionario>();
  const resultado: Correspondencia[] = pagamentos.map((pagamento) => {
    const adiantamento = (pagamento.cpf ? porCpf.get(pagamento.cpf) : undefined) || porNome.get(normalizarNome(pagamento.nome));
    let status: StatusRecibo = "PRONTO";
    if (!adiantamento) status = "SEM ADIANTAMENTO";
    else if (pagamento.competencia && adiantamento.competencia && pagamento.competencia !== adiantamento.competencia) status = "COMPETÊNCIA DIVERGENTE";
    if (adiantamento) usados.add(adiantamento);
    return {
      chave: pagamento.cpf || normalizarNome(pagamento.nome),
      nome: pagamento.nome || adiantamento?.nome || "",
      cpf: pagamento.cpf || adiantamento?.cpf || "",
      competenciaPagamento: pagamento.competencia,
      competenciaAdiantamento: adiantamento?.competencia || "",
      paginasPagamento: pagamento.paginas,
      paginasAdiantamento: adiantamento?.paginas || [],
      status,
    };
  });
  adiantamentos.filter((item) => !usados.has(item)).forEach((adiantamento) => resultado.push({
    chave: adiantamento.cpf || normalizarNome(adiantamento.nome),
    nome: adiantamento.nome,
    cpf: adiantamento.cpf,
    competenciaPagamento: "",
    competenciaAdiantamento: adiantamento.competencia,
    paginasPagamento: [],
    paginasAdiantamento: adiantamento.paginas,
    status: "SEM PAGAMENTO",
  }));
  return resultado.sort((a, b) => normalizarNome(a.nome).localeCompare(normalizarNome(b.nome)));
}

// ---------------------------------------------------------------------------
// Cartão-Ponto por equipe. A equipe vem do cadastro do DP (mesma regra do
// Controle de ponto), no lugar da planilha Ponto Diário do programa antigo.

export interface CartaoPonto {
  nome: string;
  cpf: string;
  pagina: number;
}

export interface PessoaDP {
  nome: string;
  cpf: string;
  equipe: string;
}

export type StatusCartao = "PRONTO" | "SEM EQUIPE NO DP" | "NÃO ENCONTRADO NO DP";

export interface CartaoEquipe {
  chave: string;
  nome: string;
  cpf: string;
  equipe: string;
  paginas: number[];
  status: StatusCartao;
}

export const SEM_EQUIPE = "SEM EQUIPE";

// "NOME:" com o nome ao lado ou na linha de baixo. Quando o rótulo divide a linha
// com outros (ex.: "NOME:   FUNÇÃO:"), o nome é a coluna de mesma posição abaixo.
function nomeDoCartao(texto: string) {
  const linhas = texto.split("\n");
  const indice = linhas.findIndex((linha) => /\bNOME:/i.test(linha));
  if (indice < 0) return "";
  const colunas = linhas[indice].trim().split(/\s{3,}/);
  const coluna = Math.max(0, colunas.findIndex((item) => /\bNOME:/i.test(item)));
  const aoLado = colunas[coluna].replace(/^.*\bNOME:\s*/i, "").trim();
  if (aoLado && !aoLado.endsWith(":")) return aoLado;
  const abaixo = linhas.slice(indice + 1).find((linha) => linha.trim());
  if (!abaixo) return "";
  const valores = abaixo.trim().split(/\s{3,}/);
  return valores.length === colunas.length ? valores[coluna] : valores[0];
}

export function extrairCartaoPonto(pdf: PdfFile): CartaoPonto[] {
  const cartoes: CartaoPonto[] = [];
  pdf.pages.forEach((texto, pagina) => {
    const nome = nomeDoCartao(texto).replace(/\s+/g, " ").trim();
    if (!nome || /:$/.test(nome)) return;
    const cpf = normalizarCpf((texto.match(CPF_RE) || [])[0] || "");
    cartoes.push({ nome, cpf, pagina });
  });
  return cartoes;
}

/** Junta páginas do mesmo funcionário (cartão com mais de uma página) e acha a equipe no DP. */
export function cruzarCartaoEquipes(cartoes: CartaoPonto[], pessoas: PessoaDP[]): CartaoEquipe[] {
  const porCpf = new Map<string, PessoaDP>();
  const porNome = new Map<string, PessoaDP>();
  pessoas.forEach((pessoa) => {
    const cpf = normalizarCpf(pessoa.cpf);
    if (cpf && !porCpf.has(cpf)) porCpf.set(cpf, pessoa);
    const nome = normalizarNome(pessoa.nome);
    if (nome && !porNome.has(nome)) porNome.set(nome, pessoa);
  });
  const nomes = Array.from(porNome.keys());
  const agrupados = new Map<string, CartaoEquipe>();
  for (const cartao of cartoes) {
    const nome = normalizarNome(cartao.nome);
    let pessoa = (cartao.cpf && porCpf.get(cartao.cpf)) || porNome.get(nome);
    if (!pessoa && nome) {
      let melhor = { nota: 0, chave: "" };
      for (const candidato of nomes) {
        const nota = semelhanca(nome, candidato);
        if (nota > melhor.nota) melhor = { nota, chave: candidato };
      }
      if (melhor.nota >= 0.9) pessoa = porNome.get(melhor.chave);
    }
    const chave = cartao.cpf || nome;
    const existente = agrupados.get(chave);
    if (existente) {
      existente.paginas.push(cartao.pagina);
      continue;
    }
    agrupados.set(chave, {
      chave,
      nome: cartao.nome,
      cpf: cartao.cpf,
      equipe: pessoa?.equipe || SEM_EQUIPE,
      paginas: [cartao.pagina],
      status: !pessoa ? "NÃO ENCONTRADO NO DP" : pessoa.equipe ? "PRONTO" : "SEM EQUIPE NO DP",
    });
  }
  return Array.from(agrupados.values()).sort((a, b) => normalizarNome(a.equipe).localeCompare(normalizarNome(b.equipe)) || normalizarNome(a.nome).localeCompare(normalizarNome(b.nome)));
}

export function resumirEquipes(registros: CartaoEquipe[]) {
  const grupos = new Map<string, CartaoEquipe[]>();
  registros.forEach((registro) => grupos.set(registro.equipe, [...(grupos.get(registro.equipe) || []), registro]));
  return Array.from(grupos, ([equipe, itens]) => ({
    equipe,
    itens,
    funcionarios: itens.length,
    paginas: itens.reduce((total, item) => total + item.paginas.length, 0),
  })).sort((a, b) => (a.equipe === SEM_EQUIPE ? 1 : b.equipe === SEM_EQUIPE ? -1 : normalizarNome(a.equipe).localeCompare(normalizarNome(b.equipe))));
}
