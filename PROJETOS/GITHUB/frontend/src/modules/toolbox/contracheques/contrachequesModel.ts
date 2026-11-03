import type { PositionedLine } from "../pdfText";
import { A4, type Box, type LayoutPage, type PdfLayoutFile, type Placement } from "../pdfTools";
import { semAcentos, semelhanca } from "../names";

// Contracheques e comprovantes: junta cada contracheque com o comprovante de
// transferência do mesmo funcionário, casando só pelo nome. Mesmas regras do
// programa "Juntador de PDFs" (motor_pdf.py, reconstruído do executável).
// ATENÇÃO: ainda não validado com comprovantes reais de banco.

const CONECTORES = new Set(["DO", "DE", "DOS", "DA", "E", "DAS"]);
const TERMOS_QUE_NAO_SAO_NOME = new Set([
  "FERIAS", "FALTAS", "ASSISTENCIAL", "AMBIENTAL", "EXTRAS", "LTDA", "HORAS",
  "MACRO", "TRANSPORTE", "CBO", "OPERACAO", "FILIAL", "COMPROVANTE",
  "MENSALISTA", "SANEAMENTO", "ABONO", "RECEBEDOR", "PAGADOR",
  "TRANSFERENCIA", "AUTENTICACAO", "CONTRIBUICAO", "VALE", "DEBITADA",
  "VALOR", "FUNCIONARIO", "ADIANTAMENTO", "MEDICA", "NOME", "DESCONTO",
  "ASSISTENCIA", "AGENCIA", "CREDITADA", "ENGENHARIA", "CONTA",
  "DEPARTAMENTO", "SALARIO", "CODIGO",
]);
const FRASES_CABECALHO_COMPROVANTE = ["COMPROVANTE DE OPERACAO", "COMPROVANTE DE TRANSFERENCIA", "COMPROVANTE DE PAGAMENTO", "COMPROVANTE PIX"];
const FRASES_SECAO_CREDITADA = ["DADOS DA CONTA CREDITADA", "DADOS DA CONTA A SER CREDITADA", "DADOS DO RECEBEDOR", "DADOS DO FAVORECIDO", "DADOS DO BENEFICIARIO"];
const FRASES_RODAPE_IGNORADO = ["EM CASO DE DUVIDAS", "RECLAMACOES INFORMACOES E CANCELAMENTOS", "OUVIDORIA", "DEFICIENTE AUDITIVO", "FALE CONOSCO", "CORTAR AQUI"];
const MARGEM_ACIMA_CABECALHO = 78;
const MARGEM_ACIMA_SECAO_CREDITADA = 175;
const MARGEM = 8;
const ESPACO_ENTRE_DOCUMENTOS = 6;
export const LIMIAR_NOME_PADRAO = 0.82;
const MARGEM_AMBIGUIDADE = 0.025;
const EMPRESA_CABECALHO_CONTRACHEQUE = "MACRO AMBIENTAL SERVICO E ENGENHARIA LTDA";

export type Modo = "uma_pagina" | "duas_paginas";
export type Layout = "nome_do_recebedor" | "conta_creditada" | "nao_identificado";

export interface DocumentoPessoa {
  arquivo: PdfLayoutFile;
  pagina: number; // começa em 0
  nome: string;
  nomeNormalizado: string;
  tipo: "contracheque" | "comprovante";
  recorte: Box | null;
  layout: Layout | "";
  indiceNaPagina: number; // começa em 1
}

export type Falha = { tipo: string; arquivo: string; pagina: number; itemNaPagina: number; problema: string };

// ---------------------------------------------------------------------------
// Texto

export function normalizar(texto: string) {
  return semAcentos(texto).toUpperCase().replace(/[^A-Z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function limparPontas(texto: string) {
  return texto.replace(/^[ \-:;,.\t]+|[ \-:;,.\t]+$/g, "");
}

function limparNome(texto: string) {
  let nome = (texto || "").trim().replace(/\s+/g, " ");
  nome = nome.replace(/^\d{1,10}\s+/, "");
  nome = nome.replace(/\s+\d{5,8}(?:\s+\d+){0,4}\s*$/, "");
  return limparPontas(nome.trim());
}

function limparNomeCampoComprovante(texto: string) {
  const rotulo = /\s+(?=(?:ag[eê]ncia|conta(?:\s+corrente)?|valor|cpf|cnpj|institui[cç][aã]o|banco|chave|informa[cç][oõ]es|transfer[eê]ncia|autentica[cç][aã]o|dados)\s*:?)/i;
  const corte = rotulo.exec(texto || "");
  return limparNome(corte ? (texto || "").slice(0, corte.index) : texto || "");
}

function pareceNome(texto: string) {
  const palavras = normalizar(limparNome(texto)).split(" ").filter(Boolean);
  if (palavras.length < 2 || palavras.length > 12) return false;
  if (palavras.filter((p) => !CONECTORES.has(p)).length < 2) return false;
  if (palavras.some((p) => /^\d+$/.test(p))) return false;
  return !palavras.some((p) => TERMOS_QUE_NAO_SAO_NOME.has(p));
}

/** "JOAO DA SILVA" -> "Joao da Silva" (nome do arquivo de saída). */
export function nomeParaArquivo(nome: string) {
  const texto = nome.toLowerCase().split(/\s+/).filter(Boolean)
    .map((palavra, i) => (i > 0 && CONECTORES.has(normalizar(palavra)) ? palavra : palavra.charAt(0).toUpperCase() + palavra.slice(1)))
    .join(" ");
  return texto.replace(/[\\/:*?"<>|]/g, "").trim();
}

function valoresUnicosProximos(valores: number[], distanciaMinima = 24) {
  const resultado: number[] = [];
  [...valores].sort((a, b) => a - b).forEach((valor) => {
    if (!resultado.length || valor - resultado[resultado.length - 1] >= distanciaMinima) resultado.push(valor);
  });
  return resultado;
}

const PADRAO_CONTRACHEQUE = /^\s*\d{1,8}\s+(.+?)\s+\d{5,8}\s+\d+\s+\d+\s*$/;

export function extrairNomeContracheque(texto: string) {
  const linhas = texto.split("\n").map((linha) => linha.replace(/\s+$/, "")).slice(0, 18);
  for (const linha of linhas) {
    const achou = PADRAO_CONTRACHEQUE.exec(linha);
    if (!achou) continue;
    const candidato = limparNome(achou[1]);
    if (pareceNome(candidato)) return candidato;
  }
  return null;
}

export function extrairNomeComprovante(texto: string): { nome: string | null; layout: Layout } {
  const linhas = texto.split("\n").map((linha) => linha.trim()).filter(Boolean);

  // 1) "Nome do recebedor: FULANO" na mesma linha
  const rotulosDiretos = [/nome\s+do\s+recebedor\s*:\s*(.+?)\s*$/i, /nome\s+do\s+favorecido\s*:\s*(.+?)\s*$/i, /benefici[aá]rio\s*:\s*(.+?)\s*$/i, /destinat[aá]rio\s*:\s*(.+?)\s*$/i];
  for (const linha of linhas) {
    for (const rotulo of rotulosDiretos) {
      const achou = rotulo.exec(linha);
      if (!achou) continue;
      const candidato = limparNomeCampoComprovante(achou[1]);
      if (pareceNome(candidato)) return { nome: candidato, layout: "nome_do_recebedor" };
    }
  }

  // 2) seção "Dados da conta creditada": "Nome:" nas 11 linhas seguintes
  const secoes = linhas.flatMap((linha, i) => {
    const n = normalizar(linha);
    return n.includes("DADOS DA CONTA CREDITADA") || n.includes("DADOS DA CONTA A SER CREDITADA") || n.includes("DADOS DO BENEFICIARIO") ? [i] : [];
  });
  for (const inicio of secoes) {
    for (const linha of linhas.slice(inicio + 1, inicio + 12)) {
      const n = normalizar(linha);
      if (["INFORMACOES FORNECIDAS", "TRANSFERENCIA EFETUADA", "TRANSFERENCIA REALIZADA", "AUTENTICACAO"].some((m) => n.includes(m))) break;
      const achou = /\bnome\s*:\s*(.+?)\s*$/i.exec(linha);
      if (!achou) continue;
      const candidato = limparNomeCampoComprovante(achou[1]);
      if (pareceNome(candidato)) return { nome: candidato, layout: "conta_creditada" };
    }
    // 2b) mesma seção com as linhas coladas
    const trecho = linhas.slice(inicio, inicio + 12).join(" ");
    const achou = /\bnome\s*:\s*(.+?)(?=\s+(?:ag[eê]ncia|conta(?:\s+corrente)?|valor|cpf|cnpj|informa[cç][oõ]es|transfer[eê]ncia|autentica[cç][aã]o)\s*:|$)/i.exec(trecho);
    if (!achou) continue;
    const candidato = limparNomeCampoComprovante(achou[1]);
    if (pareceNome(candidato)) return { nome: candidato, layout: "conta_creditada" };
  }

  // 3) texto inteiro numa linha (PIX)
  const umaLinha = texto.replace(/\s+/g, " ");
  const achou = /nome\s+do\s+recebedor\s*:\s*(.+?)(?=\s+(?:chave|cpf|cnpj|institui[cç][aã]o|ag[eê]ncia|dados\s+da\s+transa[cç][aã]o)\b)/i.exec(umaLinha);
  if (achou) {
    const candidato = limparNomeCampoComprovante(achou[1]);
    if (pareceNome(candidato)) return { nome: candidato, layout: "nome_do_recebedor" };
  }
  return { nome: null, layout: "nao_identificado" };
}

// ---------------------------------------------------------------------------
// Recortes

const normalizada = (linha: PositionedLine) => normalizar(linha.text);
const paginaInteira = (pagina: LayoutPage): Box => ({ x0: 0, y0: 0, x1: pagina.width, y1: pagina.height });

/** Linhas cuja caixa encosta no recorte (como o clip do PyMuPDF). */
function linhasNoRecorte(pagina: LayoutPage, recorte: Box) {
  return pagina.lines.filter((l) => l.y1 > recorte.y0 && l.y0 < recorte.y1 && l.x1 > recorte.x0 && l.x0 < recorte.x1);
}

export function detectarSegmentosComprovantes(pagina: LayoutPage): Box[] {
  const linhas = pagina.lines;
  const cabecalhos = valoresUnicosProximos(linhas.filter((l) => FRASES_CABECALHO_COMPROVANTE.some((f) => normalizada(l).includes(f))).map((l) => l.y0));
  const secoes = valoresUnicosProximos(linhas.filter((l) => FRASES_SECAO_CREDITADA.some((f) => normalizada(l).includes(f))).map((l) => l.y0));
  let ancoras: number[];
  let margemAcima: number;
  if (cabecalhos.length >= 2) {
    ancoras = cabecalhos;
    margemAcima = MARGEM_ACIMA_CABECALHO;
  } else if (secoes.length >= 2) {
    ancoras = secoes;
    margemAcima = MARGEM_ACIMA_SECAO_CREDITADA;
  } else {
    return [paginaInteira(pagina)];
  }
  const inicios = ancoras.map((y) => Math.max(0, y - margemAcima));
  const separadores = linhas.filter((l) => normalizada(l).includes("CORTAR AQUI"));
  const segmentos: Box[] = [];
  let inicio = 0;
  for (let i = 1; i < ancoras.length; i += 1) {
    const anterior = ancoras[i - 1];
    const atual = ancoras[i];
    const noIntervalo = separadores.filter((l) => anterior < l.y0 && l.y0 < atual);
    let fim: number;
    let proximo: number;
    if (noIntervalo.length) {
      const meio = (anterior + atual) / 2;
      const separador = noIntervalo.reduce((melhor, l) => (Math.abs((l.y0 + l.y1) / 2 - meio) < Math.abs((melhor.y0 + melhor.y1) / 2 - meio) ? l : melhor));
      fim = Math.max(inicio + 20, separador.y0 - 2);
      proximo = Math.min(pagina.height - 20, separador.y1 + 2);
    } else {
      fim = Math.max(inicio + 20, inicios[i]);
      proximo = fim;
    }
    segmentos.push({ x0: 0, y0: inicio, x1: pagina.width, y1: Math.min(fim, pagina.height) });
    inicio = proximo;
  }
  segmentos.push({ x0: 0, y0: inicio, x1: pagina.width, y1: pagina.height });
  return segmentos.filter((s) => s.y1 - s.y0 >= 40);
}

/** Encolhe o recorte por baixo até o último texto útil (+12 pt). */
export function ajustarRecorteComprovante(pagina: LayoutPage, segmento: Box): Box {
  let limite = segmento.y0;
  for (const linha of linhasNoRecorte(pagina, segmento)) {
    const texto = normalizada(linha);
    if (!texto || FRASES_RODAPE_IGNORADO.some((f) => texto.includes(f)) || /^\d+$/.test(texto)) continue;
    limite = Math.max(limite, Math.min(linha.y1, segmento.y1));
  }
  if (limite <= segmento.y0 + 10) return { ...segmento };
  return { ...segmento, y1: Math.min(segmento.y1, limite + 12) };
}

/** Só a via de cima do contracheque, quando a página tem duas vias iguais. */
export function retanguloContracheque(pagina: LayoutPage, duasVias: boolean): Box {
  if (!duasVias) return paginaInteira(pagina);
  const inicios = [...new Set(pagina.lines.filter((l) => normalizada(l).includes(EMPRESA_CABECALHO_CONTRACHEQUE)).map((l) => l.y0))].sort((a, b) => a - b);
  const limite = inicios.length >= 2 ? Math.max(1, inicios[1] - 4) : pagina.height * 0.49;
  return { x0: 0, y0: 0, x1: pagina.width, y1: limite };
}

// ---------------------------------------------------------------------------
// Leitura dos arquivos

function textoDoRecorte(pagina: LayoutPage, recorte: Box) {
  return linhasNoRecorte(pagina, recorte).map((l) => l.text).join("\n");
}

export function indexarContracheques(arquivos: PdfLayoutFile[]) {
  const documentos: DocumentoPessoa[] = [];
  const falhas: Falha[] = [];
  for (const arquivo of arquivos) {
    arquivo.pages.forEach((pagina, numero) => {
      const nome = extrairNomeContracheque(pagina.lines.map((l) => l.text).join("\n"));
      if (!nome) {
        falhas.push({ tipo: "contracheque", arquivo: arquivo.name, pagina: numero + 1, itemNaPagina: 1, problema: "nome não identificado" });
        return;
      }
      documentos.push({ arquivo, pagina: numero, nome, nomeNormalizado: normalizar(nome), tipo: "contracheque", recorte: null, layout: "", indiceNaPagina: 1 });
    });
  }
  return { documentos, falhas };
}

export function indexarComprovantes(arquivos: PdfLayoutFile[]) {
  const documentos: DocumentoPessoa[] = [];
  const falhas: Falha[] = [];
  for (const arquivo of arquivos) {
    arquivo.pages.forEach((pagina, numero) => {
      detectarSegmentosComprovantes(pagina).forEach((segmento, posicao) => {
        const indice = posicao + 1;
        const { nome, layout } = extrairNomeComprovante(textoDoRecorte(pagina, segmento));
        if (!nome) {
          falhas.push({ tipo: "comprovante", arquivo: arquivo.name, pagina: numero + 1, itemNaPagina: indice, problema: "nome não identificado no recorte" });
          return;
        }
        documentos.push({ arquivo, pagina: numero, nome, nomeNormalizado: normalizar(nome), tipo: "comprovante", recorte: ajustarRecorteComprovante(pagina, segmento), layout, indiceNaPagina: indice });
      });
    });
  }
  return { documentos, falhas };
}

// ---------------------------------------------------------------------------
// Casamento por nome

export function pontuacaoNome(nomeComprovante: string, nomeContracheque: string) {
  const a = normalizar(nomeComprovante);
  const b = normalizar(nomeContracheque);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.startsWith(b) || b.startsWith(a)) {
    const menor = Math.min(a.length, b.length);
    const maior = Math.max(a.length, b.length);
    if (menor >= 12) return 0.98 + 0.02 * (menor / maior);
  }
  const palavrasA = a.split(" ");
  const palavrasB = b.split(" ");
  const conjuntoA = new Set(palavrasA);
  const conjuntoB = new Set(palavrasB);
  const comuns = [...conjuntoA].filter((p) => conjuntoB.has(p)).length;
  const coberturaMenor = comuns / Math.min(conjuntoA.size, conjuntoB.size);
  const coberturaMaior = comuns / Math.max(conjuntoA.size, conjuntoB.size);
  const ultimoA = palavrasA[palavrasA.length - 1];
  const ultimoB = palavrasB[palavrasB.length - 1];
  let bonus = 0;
  if (palavrasA[0] === palavrasB[0]) bonus += 0.04;
  if (ultimoA === ultimoB || ultimoA.startsWith(ultimoB) || ultimoB.startsWith(ultimoA)) bonus += 0.04;
  return Math.min(1, semelhanca(a, b) * 0.62 + coberturaMenor * 0.25 + coberturaMaior * 0.13 + bonus);
}

export function localizarNomeContracheque(nomeComprovante: string, nomesContracheque: string[], limiar: number) {
  // Mesma ordem do Python: maior nota; no empate, nome "maior" no texto primeiro.
  const resultados = nomesContracheque.map((nome) => ({ nota: pontuacaoNome(nomeComprovante, nome), nome }))
    .sort((x, y) => y.nota - x.nota || (y.nome > x.nome ? 1 : y.nome < x.nome ? -1 : 0));
  if (!resultados.length) return { nome: null as string | null, nota: 0, ambiguo: false };
  const [melhor, segundo] = resultados;
  if (melhor.nota < limiar) return { nome: null, nota: melhor.nota, ambiguo: false };
  if (segundo && melhor.nota - segundo.nota < MARGEM_AMBIGUIDADE) return { nome: null, nota: melhor.nota, ambiguo: true };
  return { nome: melhor.nome, nota: melhor.nota, ambiguo: false };
}

const ordemDocumento = (a: DocumentoPessoa, b: DocumentoPessoa) =>
  (a.arquivo.name < b.arquivo.name ? -1 : a.arquivo.name > b.arquivo.name ? 1 : 0) || a.pagina - b.pagina || a.indiceNaPagina - b.indiceNaPagina;

export interface Pessoa {
  chave: string;
  nome: string;
  contracheques: DocumentoPessoa[];
  comprovantes: DocumentoPessoa[];
}

export interface Correspondencia { nomeComprovante: string; nomeContracheque: string; nota: number; pagina: number; itemNaPagina: number; layout: string; arquivo: string }
export interface ComprovanteSemContracheque { nomeComprovante: string; pagina: number; itemNaPagina: number; layout: string; arquivo: string; melhorNota: number; problema: string }

export interface Resultado {
  pessoas: Pessoa[]; // com contracheque e comprovante: geram PDF
  semComprovante: Pessoa[];
  comprovantesSemContracheque: ComprovanteSemContracheque[];
  correspondencias: Correspondencia[];
  falhas: Falha[];
  totalContracheques: number;
  totalComprovantes: number;
}

export function cruzar(contracheques: PdfLayoutFile[], comprovantes: PdfLayoutFile[], limiar = LIMIAR_NOME_PADRAO): Resultado {
  // Ordem dos arquivos como no Python (lista de caminhos ordenada).
  const porNome = (a: PdfLayoutFile, b: PdfLayoutFile) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);
  const cc = indexarContracheques([...contracheques].sort(porNome));
  const cp = indexarComprovantes([...comprovantes].sort(porNome));

  const grupos = new Map<string, DocumentoPessoa[]>();
  cc.documentos.forEach((doc) => grupos.set(doc.nomeNormalizado, [...(grupos.get(doc.nomeNormalizado) || []), doc]));
  grupos.forEach((docs) => docs.sort(ordemDocumento));
  const nomes = Array.from(grupos.values()).map((docs) => docs[0].nome);

  const comprovantesPorNome = new Map<string, DocumentoPessoa[]>();
  const correspondencias: Correspondencia[] = [];
  const comprovantesSemContracheque: ComprovanteSemContracheque[] = [];
  for (const comprovante of cp.documentos) {
    const { nome, nota, ambiguo } = localizarNomeContracheque(comprovante.nome, nomes, limiar);
    const base = { pagina: comprovante.pagina + 1, itemNaPagina: comprovante.indiceNaPagina, layout: comprovante.layout, arquivo: comprovante.arquivo.name };
    if (!nome) {
      comprovantesSemContracheque.push({ nomeComprovante: comprovante.nome, ...base, melhorNota: nota, problema: ambiguo ? "correspondência ambígua" : "contracheque não localizado" });
      continue;
    }
    const chave = normalizar(nome);
    comprovantesPorNome.set(chave, [...(comprovantesPorNome.get(chave) || []), comprovante]);
    correspondencias.push({ nomeComprovante: comprovante.nome, nomeContracheque: nome, nota, ...base });
  }

  const pessoas: Pessoa[] = [];
  const semComprovante: Pessoa[] = [];
  [...grupos.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).forEach(([chave, docs]) => {
    const pessoa = { chave, nome: docs[0].nome, contracheques: docs, comprovantes: (comprovantesPorNome.get(chave) || []).sort(ordemDocumento) };
    (pessoa.comprovantes.length ? pessoas : semComprovante).push(pessoa);
  });

  return {
    pessoas,
    semComprovante,
    comprovantesSemContracheque,
    correspondencias,
    falhas: [...cc.falhas, ...cp.falhas],
    totalContracheques: cc.documentos.length,
    totalComprovantes: cp.documentos.length,
  };
}

// ---------------------------------------------------------------------------
// Montagem das páginas de saída (A4)

function recorteDoItem(item: DocumentoPessoa, duasVias: boolean): Box {
  const pagina = item.arquivo.pages[item.pagina];
  if (item.recorte) return item.recorte;
  if (item.tipo === "contracheque") return retanguloContracheque(pagina, duasVias);
  return paginaInteira(pagina);
}

const colocar = (item: DocumentoPessoa, target: Box, duasVias: boolean): Placement => ({ source: item.arquivo, page: item.pagina, clip: recorteDoItem(item, duasVias), target });

/** Páginas do PDF de uma pessoa: lista de páginas A4, cada uma com os pedaços a desenhar. */
export function paginasDaPessoa(pessoa: Pessoa, modo: Modo, duasVias: boolean): Placement[][] {
  if (modo === "duas_paginas") {
    const alvo = { x0: MARGEM, y0: MARGEM, x1: A4.width - MARGEM, y1: A4.height - MARGEM };
    return [...pessoa.contracheques, ...pessoa.comprovantes].map((item) => [colocar(item, alvo, duasVias)]);
  }
  const alturaSuperior = A4.height * 0.48;
  const superior = { x0: MARGEM, y0: MARGEM, x1: A4.width - MARGEM, y1: alturaSuperior - ESPACO_ENTRE_DOCUMENTOS / 2 };
  const inferior = { x0: MARGEM, y0: alturaSuperior + ESPACO_ENTRE_DOCUMENTOS / 2, x1: A4.width - MARGEM, y1: A4.height - MARGEM };
  const total = Math.max(pessoa.contracheques.length, pessoa.comprovantes.length);
  return Array.from({ length: total }, (_, i) => [
    ...(pessoa.contracheques[i] ? [colocar(pessoa.contracheques[i], superior, duasVias)] : []),
    ...(pessoa.comprovantes[i] ? [colocar(pessoa.comprovantes[i], inferior, duasVias)] : []),
  ]);
}
