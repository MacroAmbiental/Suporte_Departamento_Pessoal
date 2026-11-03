import { normalizarNome, semelhanca } from "../names";
import { formatarMinutos, type Comparacao, type RegistroFolha, type RegistroPonto } from "./conferenciaModel";

// "Relatório completo do ponto" e "Relação de pagamentos" do programa em Python
// (comparador_folha/app.py v11.1), com as mesmas regras.

const soDigitos = (texto: string) => (texto || "").replace(/\D/g, "");
// Ordem por nome igual à do Python (comparação simples de texto, sem regras de idioma).
const porNomeNormalizado = (a: string, b: string) => { const x = normalizarNome(a); const y = normalizarNome(b); return x < y ? -1 : x > y ? 1 : 0; };
type Celula = { v: string | number; t: "s" | "n"; s?: Record<string, unknown>; z?: string };
const texto = (v: string | number | null | undefined, s?: Record<string, unknown>): Celula =>
  v === null || v === undefined || v === "" ? { v: "", t: "s", s } : { v, t: typeof v === "number" ? "n" : "s", s };

// ---------------------------------------------------------------------------
// Relatório completo do ponto

/** Funcionários do ponto que aparecem nas linhas visíveis da conferência (por CPF ou nome). */
export function pontoDasLinhas(ponto: RegistroPonto[], linhas: Comparacao[]) {
  const cpfs = new Set(linhas.map((linha) => soDigitos(linha.cpf)).filter(Boolean));
  const nomes = new Set(linhas.map((linha) => normalizarNome(linha.nomePonto || linha.nomeExtrato)).filter(Boolean));
  return ponto.filter((registro) => (registro.cpf && cpfs.has(soDigitos(registro.cpf))) || nomes.has(normalizarNome(registro.nome)));
}

export async function exportarRelatorioPonto(ponto: RegistroPonto[], linhas: Comparacao[], periodo: string) {
  const XLSX = await import("xlsx-js-style");
  const motivoPorCpf = new Map<string, string>();
  const motivoPorNome = new Map<string, string>();
  linhas.forEach((linha) => {
    const cpf = soDigitos(linha.cpf);
    const nome = normalizarNome(linha.nomePonto || linha.nomeExtrato);
    if (cpf) motivoPorCpf.set(cpf, linha.motivo);
    if (nome) motivoPorNome.set(nome, linha.motivo);
  });

  const resumo: (string | number | null)[][] = [[
    "Funcionário", "CPF", "Função", "Período", "Motivo da divergência", "Faltas (dias)",
    "Dias faltosos", "Atestados (dias)", "Dias com atestado",
    "Outras ocorrências", "Faltas (horas)", "Horas normais",
    "Extra 50%", "Extra 75%", "Extra 120%", "Carga", "DSR", "Página",
  ]];
  const detalhes: (string | number | null)[][] = [["Funcionário", "CPF", "Data", "Dia", "Tipo", "Descrição", "Página"]];

  [...ponto].sort((a, b) => porNomeNormalizado(a.nome, b.nome)).forEach((registro) => {
    const faltas = registro.ocorrencias.filter((o) => o.tipo === "FALTA");
    const atestados = registro.ocorrencias.filter((o) => o.tipo === "ATESTADO");
    const outras = registro.ocorrencias.filter((o) => o.tipo === "OUTRA");
    const motivo = motivoPorCpf.get(soDigitos(registro.cpf)) ?? motivoPorNome.get(normalizarNome(registro.nome)) ?? "";
    resumo.push([
      registro.nome, registro.cpf, registro.funcao, registro.periodo, motivo,
      faltas.length, faltas.map((o) => o.data).join(", "),
      atestados.length, atestados.map((o) => o.data).join(", "),
      outras.map((o) => `${o.data}: ${o.descricao}`).join("; "),
      formatarMinutos(registro.faltasHoras), formatarMinutos(registro.normais),
      formatarMinutos(registro.he50), formatarMinutos(registro.he75), formatarMinutos(registro.he120),
      formatarMinutos(registro.carga), formatarMinutos(registro.dsr), registro.pagina,
    ]);
    registro.ocorrencias.forEach((o) => detalhes.push([registro.nome, registro.cpf, o.data, o.dia, o.tipo, o.descricao, registro.pagina]));
  });

  const cabecalho = { fill: { fgColor: { rgb: "1F4E78" } }, font: { color: { rgb: "FFFFFF" }, bold: true }, alignment: { horizontal: "center", vertical: "center" } };
  const corpo = { alignment: { vertical: "top", wrapText: true } };
  function aba(linhas: (string | number | null)[][], larguras: Record<number, number>) {
    const sheet = XLSX.utils.aoa_to_sheet(linhas.map((linha, i) => linha.map((v) => texto(v, i === 0 ? cabecalho : corpo))));
    const colunas = linhas[0].length;
    sheet["!cols"] = Array.from({ length: colunas }, (_, c) => {
      if (larguras[c]) return { wch: larguras[c] };
      const maior = Math.max(...linhas.slice(0, 150).map((linha) => String(linha[c] ?? "").length));
      return { wch: Math.min(Math.max(maior + 2, 12), 42) };
    });
    sheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(1, linhas.length - 1), c: colunas - 1 } }) };
    return sheet;
  }
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, aba(resumo, { 0: 40, 4: 60, 9: 55 }), "Resumo por funcionário");
  XLSX.utils.book_append_sheet(book, aba(detalhes, { 0: 40, 5: 45 }), "Ocorrências por dia");
  const sufixo = /(\d{2})\/(\d{2})\/(\d{4})\s*até\s*(\d{2})\/(\d{2})\/(\d{4})/i.exec(periodo);
  XLSX.writeFile(book, `relatorio_completo_folha_ponto${sufixo ? `_${sufixo[3]}-${sufixo[2]}-${sufixo[1]}_a_${sufixo[6]}-${sufixo[5]}-${sufixo[4]}` : ""}.xlsx`);
}

// ---------------------------------------------------------------------------
// Relação de pagamentos

export type CadastroBancario = { nome: string; conta: string; banco: string; cpf: string };
export type RelacaoAnterior = { aba: string; cadastro: CadastroBancario[] };

const TERMOS_INVALIDOS = new Set(["AGENCIA", "BANCO", "CONTA", "CPF", "DADOS", "TITULAR", "CHAVE", "OBSERVACAO", "PENSAO", "TOTAL"]);

function valorCelula(valor: unknown) {
  if (valor === null || valor === undefined) return "";
  return String(valor).replace(/\.0$/, "").trim();
}

/**
 * Lê conta e banco de uma relação de pagamentos anterior (Excel). Usa só uma aba:
 * a que estava ativa quando o arquivo foi salvo; se ela não tiver o cabeçalho
 * NOME / CONTAS, as outras da última para a primeira.
 */
export async function lerRelacaoAnterior(file: File): Promise<RelacaoAnterior | null> {
  const XLSX = await import("xlsx");
  const book = XLSX.read(await file.arrayBuffer(), { type: "array" });
  // Aba ativa ao salvar: o SheetJS lê em Workbook.WBView[0].activeTab (fora das tipagens).
  const vista = (book.Workbook as { WBView?: { activeTab?: number }[] } | undefined)?.WBView?.[0];
  const ativa = book.SheetNames[Number(vista?.activeTab) || 0] || book.SheetNames[0];
  const ordem = [ativa, ...[...book.SheetNames].reverse().filter((nome) => nome !== ativa)];
  for (const nomeAba of ordem) {
    const linhas = XLSX.utils.sheet_to_json<unknown[]>(book.Sheets[nomeAba], { header: 1, raw: true, defval: null, blankrows: true });
    let inicio = -1;
    const indices: { nome?: number; conta?: number; banco?: number; cpf?: number } = {};
    for (let r = 0; r < Math.min(linhas.length, 15); r += 1) {
      const textos = (linhas[r] || []).map((v) => String(v ?? "").trim().toUpperCase());
      if (!textos.includes("NOME") || !textos.some((t) => t.includes("CONTAS"))) continue;
      textos.forEach((valor, i) => {
        if (valor === "NOME") indices.nome = i;
        else if (valor.includes("CONTA")) indices.conta = i;
        else if (valor === "BANCO") indices.banco = i;
        else if (valor === "CPF") indices.cpf = i;
      });
      inicio = r + 1;
      break;
    }
    if (inicio < 0 || indices.nome === undefined) continue;

    const cadastro = new Map<string, CadastroBancario>();
    for (const linha of linhas.slice(inicio)) {
      const nome = valorCelula(linha?.[indices.nome]);
      if (!nome) continue;
      const normalizado = normalizarNome(nome);
      const palavras = normalizado.split(" ").filter(Boolean);
      if (nome.includes(":") || /\d/.test(nome) || palavras.length < 2 || palavras.length > 12 || TERMOS_INVALIDOS.has(palavras[0])) continue;
      if (cadastro.has(normalizado)) continue;
      cadastro.set(normalizado, {
        nome,
        conta: indices.conta === undefined ? "" : valorCelula(linha?.[indices.conta]),
        banco: indices.banco === undefined ? "" : valorCelula(linha?.[indices.banco]),
        cpf: indices.cpf === undefined ? "" : valorCelula(linha?.[indices.cpf]),
      });
    }
    return { aba: nomeAba, cadastro: Array.from(cadastro.values()) };
  }
  return null;
}

export type LinhaRelacao = { nome: string; valor: number | null; conta: string; banco: string; cpf: string; empresa: string; status: "ATIVO" | "INATIVO" };

const statusDe = (valor: number | null) => (valor !== null && valor !== 0 ? "ATIVO" : "INATIVO");

/**
 * Relação anterior = cadastro de nomes, contas e bancos (o valor nunca vem dela).
 * Valor e empresa vêm sempre do extrato atual; quem é novo no extrato também entra.
 */
export function montarRelacao(extrato: RegistroFolha[], anterior: RelacaoAnterior | null): LinhaRelacao[] {
  const registros = [...extrato].sort((a, b) => porNomeNormalizado(a.nome, b.nome));
  const porNome = new Map(registros.map((r) => [normalizarNome(r.nome), r]));
  const porCpf = new Map(registros.filter((r) => r.cpf).map((r) => [soDigitos(r.cpf), r]));
  const bancoPorNome = new Map<string, CadastroBancario>();
  const bancoPorCpf = new Map<string, CadastroBancario>();
  const usados = new Set<RegistroFolha>();
  const linhas: LinhaRelacao[] = [];

  for (const item of anterior?.cadastro || []) {
    const chave = normalizarNome(item.nome);
    if (item.conta || item.banco) {
      if (!bancoPorNome.has(chave)) bancoPorNome.set(chave, item);
      const cpf = soDigitos(item.cpf);
      if (cpf && !bancoPorCpf.has(cpf)) bancoPorCpf.set(cpf, item);
    }
    const cpf = soDigitos(item.cpf);
    let registro = (cpf && porCpf.get(cpf)) || porNome.get(chave);
    if (!registro && porNome.size) {
      let melhor: [number, RegistroFolha] | null = null;
      for (const [nomeAtual, candidato] of porNome) {
        const nota = chave.includes(nomeAtual) || nomeAtual.includes(chave) ? 0.98 : semelhanca(chave, nomeAtual);
        if (!melhor || nota > melhor[0]) melhor = [nota, candidato];
      }
      if (melhor && melhor[0] >= 0.86) registro = melhor[1];
    }
    if (registro) {
      usados.add(registro);
      linhas.push({ nome: registro.nome.toUpperCase(), valor: registro.liquido, conta: item.conta, banco: item.banco, cpf: registro.cpf || item.cpf, empresa: registro.empresa, status: statusDe(registro.liquido) });
    } else {
      linhas.push({ nome: item.nome.toUpperCase(), valor: null, conta: item.conta, banco: item.banco, cpf: item.cpf, empresa: "", status: "INATIVO" });
    }
  }

  for (const registro of registros) {
    if (usados.has(registro)) continue;
    const banco = bancoPorCpf.get(soDigitos(registro.cpf)) || bancoPorNome.get(normalizarNome(registro.nome));
    linhas.push({ nome: registro.nome.toUpperCase(), valor: registro.liquido, conta: banco?.conta || "", banco: banco?.banco || "", cpf: registro.cpf, empresa: registro.empresa, status: statusDe(registro.liquido) });
  }
  return linhas.sort((a, b) => porNomeNormalizado(a.nome, b.nome));
}

const MESES: Record<string, string> = { "01": "JANEIRO", "02": "FEVEREIRO", "03": "MARÇO", "04": "ABRIL", "05": "MAIO", "06": "JUNHO", "07": "JULHO", "08": "AGOSTO", "09": "SETEMBRO", "10": "OUTUBRO", "11": "NOVEMBRO", "12": "DEZEMBRO" };

export async function exportarRelacao(linhas: LinhaRelacao[], competencia: string) {
  const XLSX = await import("xlsx-js-style");
  const [mes, ano] = competencia.split("/");
  const periodo = ano ? `${MESES[mes] || mes} ${ano}` : competencia;
  const borda = { top: { style: "thin", color: { rgb: "BFBFBF" } }, bottom: { style: "thin", color: { rgb: "BFBFBF" } }, left: { style: "thin", color: { rgb: "BFBFBF" } }, right: { style: "thin", color: { rgb: "BFBFBF" } } };
  const titulo = { font: { name: "Calibri", sz: 15, bold: true, color: { rgb: "000000" } }, alignment: { horizontal: "center", vertical: "center" } };
  const faixa = { fill: { fgColor: { rgb: "1F4E78" } }, font: { name: "Calibri", sz: 12, bold: true, color: { rgb: "FFFFFF" } }, alignment: { horizontal: "center", vertical: "center" } };
  const cabecalho = { fill: { fgColor: { rgb: "D9E1F2" } }, font: { name: "Calibri", sz: 11, bold: true }, alignment: { horizontal: "center" }, border: borda };
  const zebra = (i: number) => (i % 2 ? { fill: { fgColor: { rgb: "DCE6F1" } } } : {});

  const rows: Celula[][] = [
    [texto("RELAÇÃO DE PAGAMENTOS", titulo), ...Array(6).fill(texto("", titulo))],
    [texto(periodo, faixa), ...Array(6).fill(texto("", faixa))],
    ["NOME", "VALOR", "CONTAS", "BANCO", "CPF", "EMPRESA", "STATUS"].map((t) => texto(t, cabecalho)),
    ...linhas.map((l, i) => {
      const base = { ...zebra(i), border: borda };
      const ativo = l.status === "ATIVO";
      const valor: Celula = l.valor === null ? texto("", base) : { v: l.valor, t: "n", z: '"R$" #,##0.00', s: { ...base, numFmt: '"R$" #,##0.00', alignment: { horizontal: "right" } } };
      return [
        texto(l.nome, base), valor, texto(l.conta, base),
        texto(l.banco, { ...base, alignment: { horizontal: "center" } }),
        texto(l.cpf, { ...base, alignment: { horizontal: "center" } }),
        texto(l.empresa, base),
        texto(l.status, { border: borda, alignment: { horizontal: "center" }, font: { bold: true, color: { rgb: ativo ? "166534" : "991B1B" } }, fill: { fgColor: { rgb: ativo ? "DCFCE7" : "FEE2E2" } } }),
      ];
    }),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!merges"] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 6 } }, { s: { r: 1, c: 0 }, e: { r: 1, c: 6 } }];
  sheet["!cols"] = [45, 17, 30, 16, 19, 48, 14].map((wch) => ({ wch }));
  sheet["!rows"] = [{ hpt: 28 }, { hpt: 22 }];
  sheet["!autofilter"] = { ref: `A3:G${Math.max(4, linhas.length + 3)}` };
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Relação de pagamentos");
  XLSX.writeFile(book, `relacao_pagamentos_${competencia.replace("/", "_") || "extrato"}.xlsx`);
}
