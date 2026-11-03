import { formatarMinutos, type Comparacao, type Situacao } from "./conferenciaModel";

// Excel "Exportar conferência": mesmas colunas e cores do programa em Python.

const CABECALHOS = [
  "Funcionário extrato", "Funcionário ponto", "CPF",
  "Extrato 50%", "Ponto 50%", "Diferença 50%",
  "Extrato 75%", "Ponto 75%", "Diferença 75%",
  "Extrato 120%", "Ponto 120%", "Diferença 120%",
  "Faltas extrato", "Faltas ponto", "Diferença faltas",
  "Situação", "Cargo", "Motivo da divergência", "Correspondência do nome", "Página extrato", "Página ponto",
];
const LARGURAS = [38, 38, 18, 13, 13, 15, 13, 13, 15, 14, 13, 16, 16, 14, 18, 20, 30, 72, 22, 15, 15];
const COR: Record<Situacao, string> = {
  CORRETO: "DCFCE7",
  ARREDONDAMENTO: "FEF3C7",
  DIVERGENTE: "FEE2E2",
  "NÃO ENCONTRADO": "E5E7EB",
  "SOMENTE NO PONTO": "DBEAFE",
};

export async function exportarConferencia(linhas: Comparacao[], competencia: string) {
  const XLSX = await import("xlsx-js-style");
  const cabecalho = { fill: { fgColor: { rgb: "111827" } }, font: { color: { rgb: "FFFFFF" }, bold: true }, alignment: { horizontal: "center" } };
  const celula = (valor: string | number | null, cor: string, extra: Record<string, unknown> = {}) => (
    valor === null || valor === ""
      ? { v: "", t: "s", s: { fill: { fgColor: { rgb: cor } }, ...extra } }
      : { v: valor, t: typeof valor === "number" ? "n" : "s", s: { fill: { fgColor: { rgb: cor } }, ...extra } }
  );
  const rows = [
    CABECALHOS.map((titulo) => ({ v: titulo, t: "s", s: cabecalho })),
    ...linhas.map((r) => {
      const cor = COR[r.situacao] || "FFFFFF";
      return [
        r.nomeExtrato, r.nomePonto, r.cpf,
        formatarMinutos(r.extrato50), formatarMinutos(r.ponto50), formatarMinutos(r.diferenca50),
        formatarMinutos(r.extrato75), formatarMinutos(r.ponto75), formatarMinutos(r.diferenca75),
        formatarMinutos(r.extrato120), formatarMinutos(r.ponto120), formatarMinutos(r.diferenca120),
        r.faltasExtrato, r.faltasPonto, r.diferencaFaltas,
        r.situacao, r.cargo, r.motivo, Number(r.notaNome.toFixed(4)), r.paginaExtrato || null, r.paginaPonto || null,
      ].map((valor, coluna) => celula(valor, cor, coluna === 17 ? { alignment: { wrapText: true, vertical: "top" } } : {}));
    }),
  ];
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet["!cols"] = LARGURAS.map((wch) => ({ wch }));
  sheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: Math.max(1, linhas.length), c: CABECALHOS.length - 1 } }) };
  sheet["!freeze"] = { xSplit: 0, ySplit: 1 };
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Comparação");
  XLSX.writeFile(book, `conferencia_folha_ponto${competencia ? `_${competencia.replace("/", "-")}` : ""}.xlsx`);
}
