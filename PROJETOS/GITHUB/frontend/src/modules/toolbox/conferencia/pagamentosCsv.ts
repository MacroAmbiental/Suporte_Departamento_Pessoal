import type { LinhaRelacao } from "./conferenciaRelatorios";

// CSV de pagamentos no layout pedido pelo financeiro (upload-payments-linked-account):
// só contas ITAÚ com agência e conta; o resto (PIX, outros bancos, sem conta) fica de fora.

const CABECALHO = ["VALOR_A_PAGAR", "NOME_DO_BENEFICIARIO", "CPF/CNPJ_DO_BENEFICIARIO", "NUMERO_DA_AGENCIA", "NUMERO_DA_CONTA", "TIPO_DE_PAGAMENTO"];

// Texto da coluna TIPO_DE_PAGAMENTO conforme o que está escrito em CONTAS.
export const TIPOS_PAGAMENTO = {
  corrente: "CONTA CORRENTE",
  salario: "CONTA SALARIO",
  poupanca: "POUPANCA",
} as const;

export type ContaItau = { agencia: string; conta: string; tipo: string };
export type ForaDoCsv = { nome: string; valor: number; conta: string; banco: string; motivo: string };

const semAcento = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "");

function tipoDaSigla(sigla: string) {
  const s = sigla.toUpperCase().replace(/\s/g, "");
  if (s === "C/S") return TIPOS_PAGAMENTO.salario;
  if (s === "C/P" || s === "C/CP") return TIPOS_PAGAMENTO.poupanca;
  return TIPOS_PAGAMENTO.corrente; // C/C, CC, C/CC, C
}

/**
 * Lê "AG:4293 C/S: 69437-0", "AG: 9288 C: 74775-2", "AG:8666 C/S: 42022 2", "AG:0870 C/C:776309"...
 * Conta com dígito separado por espaço ou traço sai como "42022-2"; sem separador, sai como está.
 */
export function lerContaItau(texto: string): ContaItau | null {
  const limpo = (texto || "").replace(/ /g, " ").trim();
  const m = limpo.match(/^AG\s*:?\s*(\d{3,5})\s+(?:OP\s*:?\s*\d+\s+)?(C\/CC|C\/CP|C\/C|C\/S|C\/P|CC|C)\s*:?\s*(\d[\d\s.-]*\d|\d)\s*$/i);
  if (!m) return null;
  const partes = m[3].split(/[\s.-]+/).filter(Boolean);
  let conta: string;
  if (partes.length === 1) conta = partes[0];
  else if (partes.length === 2 && partes[1].length === 1) conta = `${partes[0]}-${partes[1]}`;
  else return null;
  return { agencia: m[1], conta, tipo: tipoDaSigla(m[2]) };
}

export function montarPagamentosCsv(linhas: LinhaRelacao[]) {
  const dentro: { linha: LinhaRelacao; conta: ContaItau }[] = [];
  const fora: ForaDoCsv[] = [];
  for (const linha of linhas) {
    if (linha.valor === null || linha.valor <= 0) continue; // INATIVO: nada a pagar
    const base = { nome: linha.nome, valor: linha.valor, conta: linha.conta, banco: linha.banco };
    const banco = semAcento(linha.banco || "").toUpperCase();
    if (!linha.conta && !linha.banco) { fora.push({ ...base, motivo: "Sem conta cadastrada" }); continue; }
    if (!banco.includes("ITAU")) { fora.push({ ...base, motivo: `Banco não é Itaú (${linha.banco || "vazio"})` }); continue; }
    const conta = lerContaItau(linha.conta);
    if (!conta) { fora.push({ ...base, motivo: "Agência/conta não reconhecida" }); continue; }
    dentro.push({ linha, conta });
  }

  const linhasCsv = [CABECALHO.join(";")];
  for (const { linha, conta } of dentro) {
    const cpf = linha.cpf.replace(/\D/g, "");
    linhasCsv.push([
      (linha.valor as number).toFixed(2).replace(".", ","),
      semAcento(linha.nome).replace(/;/g, " ").trim(),
      cpf ? cpf.padStart(11, "0") : "",
      conta.agencia,
      conta.conta,
      conta.tipo,
    ].join(";"));
  }
  const total = dentro.reduce((soma, item) => soma + (item.linha.valor as number), 0);
  return { csv: `${linhasCsv.join("\r\n")}\r\n`, quantidade: dentro.length, total, fora, semCpf: dentro.filter((d) => !d.linha.cpf.replace(/\D/g, "")).length };
}

export function baixarCsv(csv: string, nomeArquivo: string) {
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
