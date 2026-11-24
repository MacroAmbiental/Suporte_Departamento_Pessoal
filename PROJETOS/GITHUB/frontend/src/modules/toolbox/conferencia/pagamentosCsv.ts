import type { LinhaRelacao } from "./conferenciaRelatorios";

// CSV de pagamentos da KESH (modelo upload-payments-linked-account, confirmado pelo
// financeiro em 24/11/2026 — antes achávamos que era do Itaú). Só entram contas KESH
// com número; o resto (outros bancos, PIX, sem conta) fica de fora para pagar à parte.
// NUMERO_DA_AGENCIA vai vazio (conta Kesh não tem agência). TIPO_DE_PAGAMENTO é
// preenchido na importação dentro da Kesh; a tela permite já mandar um valor.

const CABECALHO = ["VALOR_A_PAGAR", "NOME_DO_BENEFICIARIO", "CPF/CNPJ_DO_BENEFICIARIO", "NUMERO_DA_AGENCIA", "NUMERO_DA_CONTA", "TIPO_DE_PAGAMENTO"];

export type ForaDoCsv = { nome: string; valor: number; conta: string; banco: string; motivo: string };

const semAcento = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "");

export function montarPagamentosCsv(linhas: LinhaRelacao[], tipoPagamento = "") {
  const dentro: { linha: LinhaRelacao; conta: string }[] = [];
  const fora: ForaDoCsv[] = [];
  for (const linha of linhas) {
    if (linha.valor === null || linha.valor <= 0) continue; // INATIVO: nada a pagar
    const base = { nome: linha.nome, valor: linha.valor, conta: linha.conta, banco: linha.banco };
    const banco = semAcento(linha.banco || "").toUpperCase();
    if (!linha.conta && !linha.banco) { fora.push({ ...base, motivo: "Sem conta cadastrada" }); continue; }
    if (!banco.includes("KESH")) { fora.push({ ...base, motivo: `Banco não é Kesh (${linha.banco || "vazio"})` }); continue; }
    const conta = (linha.conta || "").replace(/\D/g, "");
    if (!conta) { fora.push({ ...base, motivo: "Conta Kesh sem número" }); continue; }
    dentro.push({ linha, conta });
  }

  const tipo = semAcento(tipoPagamento).replace(/;/g, " ").trim().toUpperCase();
  const linhasCsv = [CABECALHO.join(";")];
  for (const { linha, conta } of dentro) {
    const cpf = linha.cpf.replace(/\D/g, "");
    linhasCsv.push([
      (linha.valor as number).toFixed(2).replace(".", ","),
      semAcento(linha.nome).replace(/;/g, " ").trim(),
      cpf ? cpf.padStart(11, "0") : "",
      "",
      conta,
      tipo,
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
