import type { Resultado } from "./contrachequesModel";

// Relatório em Excel: as mesmas listas que o programa antigo gravava em CSV, uma aba cada.

export async function exportarRelatorioContracheques(resultado: Resultado) {
  const XLSX = await import("xlsx-js-style");
  const cabecalho = { fill: { fgColor: { rgb: "1F4E78" } }, font: { color: { rgb: "FFFFFF" }, bold: true }, alignment: { horizontal: "center" } };
  const book = XLSX.utils.book_new();
  function aba(nome: string, titulos: string[], linhas: (string | number)[][]) {
    const sheet = XLSX.utils.aoa_to_sheet([titulos.map((t) => ({ v: t, t: "s", s: cabecalho })), ...linhas]);
    sheet["!cols"] = titulos.map((t, c) => ({ wch: Math.min(Math.max(t.length + 2, ...linhas.slice(0, 200).map((l) => String(l[c] ?? "").length + 2), 10), 50) }));
    sheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(1, linhas.length), c: titulos.length - 1 } }) };
    XLSX.utils.book_append_sheet(book, sheet, nome);
  }
  aba("PDFs gerados", ["Nome", "Contracheques", "Comprovantes"], resultado.pessoas.map((p) => [p.nome, p.contracheques.length, p.comprovantes.length]));
  aba("Correspondências de nomes", ["Nome no comprovante", "Nome no contracheque", "Nota", "Página comprovante", "Item na página", "Layout", "Arquivo comprovante"],
    resultado.correspondencias.map((c) => [c.nomeComprovante, c.nomeContracheque, Number(c.nota.toFixed(3)), c.pagina, c.itemNaPagina, c.layout, c.arquivo]));
  aba("Comprovante sem contracheque", ["Nome no comprovante", "Página", "Item na página", "Layout", "Arquivo", "Melhor nota", "Problema"],
    resultado.comprovantesSemContracheque.map((c) => [c.nomeComprovante, c.pagina, c.itemNaPagina, c.layout, c.arquivo, Number(c.melhorNota.toFixed(3)), c.problema]));
  aba("Contracheque sem comprovante", ["Nome", "Páginas"], resultado.semComprovante.map((p) => [p.nome, p.contracheques.length]));
  aba("Páginas sem nome", ["Tipo", "Arquivo", "Página", "Item na página", "Problema"], resultado.falhas.map((f) => [f.tipo, f.arquivo, f.pagina, f.itemNaPagina, f.problema]));
  XLSX.writeFile(book, "contracheques_e_comprovantes_relatorio.xlsx");
}
