import { useMemo, useState } from "react";
import { Upload, X } from "lucide-react";
import ModalPortal from "@/modules/shared/ModalPortal";
import { useDomainData } from "@/hooks/useDomainData";
import { isEmployeeTerminated } from "@/modules/employees/utils/employeeStatus";
import type { Employee } from "@/types/domain";

// Importa o CSV de contas da Kesh (Nome;CPF/CNPJ;...;Status PaymentAccount;Número da conta;...)
// para a "Conta de pagamento (salário)" da ficha. Casa só por CPF; nada é gravado sem confirmar.

const BANCO_KESH = "KESH";
const TIPO_KESH = "Conta de pagamento";

type LinhaKesh = { nome: string; cpf: string; conta: string; status: string };
type Situacao = "nova" | "muda" | "igual" | "semConta" | "naoAchado";
type Item = LinhaKesh & { situacao: Situacao; funcionario?: Employee; contaAtual?: string };

const situacoes: Record<Situacao, { titulo: string; cor: string }> = {
  nova: { titulo: "Conta nova", cor: "#166534" },
  muda: { titulo: "Troca a conta atual", cor: "#b45309" },
  igual: { titulo: "Já está igual", cor: "#475569" },
  semConta: { titulo: "Sem conta na Kesh", cor: "#991b1b" },
  naoAchado: { titulo: "CPF não achado no DP", cor: "#991b1b" },
};

const soDigitos = (texto: string) => (texto || "").replace(/\D/g, "");
const cpfChave = (texto: string) => {
  const d = soDigitos(texto);
  return d ? d.padStart(11, "0") : "";
};
const chaveCabecalho = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function lerCsvKesh(texto: string): LinhaKesh[] {
  const linhas = texto.replace(/^﻿/, "").split(/\r?\n/).filter((linha) => linha.trim());
  if (!linhas.length) return [];
  const cabecalho = linhas[0].split(";").map(chaveCabecalho);
  const coluna = (...nomes: string[]) => cabecalho.findIndex((c) => nomes.includes(c));
  const iNome = coluna("nome");
  const iCpf = coluna("cpf/cnpj", "cpf");
  const iConta = coluna("numero da conta", "conta");
  const iStatus = coluna("status paymentaccount");
  if (iCpf < 0 || iConta < 0) throw new Error("O arquivo não tem as colunas CPF/CNPJ e Número da conta.");
  return linhas.slice(1).map((linha) => {
    const c = linha.split(";");
    return { nome: (c[iNome] || "").trim(), cpf: (c[iCpf] || "").trim(), conta: soDigitos(c[iConta] || ""), status: iStatus >= 0 ? (c[iStatus] || "").trim() : "" };
  });
}

export default function ImportarContasPagamento({ onClose }: { onClose: () => void }) {
  const data = useDomainData();
  const [arquivo, setArquivo] = useState("");
  const [linhas, setLinhas] = useState<LinhaKesh[]>([]);
  const [erro, setErro] = useState("");
  const [filtro, setFiltro] = useState<Situacao | "semKesh">("nova");
  const [gravando, setGravando] = useState(false);
  const [gravados, setGravados] = useState<number | null>(null);

  const porCpf = useMemo(() => {
    const mapa = new Map<string, Employee[]>();
    for (const funcionario of data.employees) {
      const chave = cpfChave(funcionario.cpf);
      if (!chave) continue;
      mapa.set(chave, [...(mapa.get(chave) || []), funcionario]);
    }
    return mapa;
  }, [data.employees]);

  const itens = useMemo<Item[]>(() => linhas.map((linha) => {
    if (!linha.conta) return { ...linha, situacao: "semConta" };
    const candidatos = porCpf.get(cpfChave(linha.cpf)) || [];
    // Mesmo CPF em cadastro antigo desligado + atual: fica com o não desligado.
    const funcionario = candidatos.find((f) => !isEmployeeTerminated(f)) || candidatos[0];
    if (!funcionario) return { ...linha, situacao: "naoAchado" };
    const r = funcionario.registrationData || {};
    const contaAtual = r.paymentAccount || "";
    const igual = contaAtual === linha.conta && (r.paymentBank || "") === BANCO_KESH && (r.paymentAccountType || "") === TIPO_KESH;
    return { ...linha, funcionario, contaAtual, situacao: igual ? "igual" : contaAtual && contaAtual !== linha.conta ? "muda" : "nova" };
  }), [linhas, porCpf]);

  const semKesh = useMemo(() => {
    if (!linhas.length) return [];
    const cpfs = new Set(linhas.map((l) => cpfChave(l.cpf)));
    return data.employees
      .filter((f) => !isEmployeeTerminated(f) && f.status === "active" && !cpfs.has(cpfChave(f.cpf)))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [data.employees, linhas]);

  const contagem = (situacao: Situacao) => itens.filter((item) => item.situacao === situacao).length;
  const aGravar = itens.filter((item) => item.situacao === "nova" || item.situacao === "muda");

  async function abrir(file?: File) {
    if (!file) return;
    setErro("");
    setGravados(null);
    try {
      const lidas = lerCsvKesh(await file.text());
      if (!lidas.length) throw new Error("Nenhuma linha no arquivo.");
      setArquivo(file.name);
      setLinhas(lidas);
      setFiltro("nova");
    } catch (caught) {
      setLinhas([]);
      setArquivo("");
      setErro(caught instanceof Error ? caught.message : "Não foi possível ler o arquivo.");
    }
  }

  async function gravar() {
    if (!aGravar.length) return;
    setGravando(true);
    setErro("");
    try {
      const total = await data.saveEmployeesRegistrationFields(
        aGravar.map((item) => ({
          employeeId: (item.funcionario as Employee).id,
          fields: { paymentBank: BANCO_KESH, paymentAgency: "", paymentAccount: item.conta, paymentAccountType: TIPO_KESH },
        })),
        `Contas de pagamento importadas da Kesh (${arquivo}).`,
      );
      setGravados(total);
    } catch (caught) {
      setErro(caught instanceof Error ? caught.message : "Não foi possível gravar.");
    } finally {
      setGravando(false);
    }
  }

  const visiveis = filtro === "semKesh" ? [] : itens.filter((item) => item.situacao === filtro);

  return (
    <ModalPortal className="modal-backdrop" role="presentation">
      <div className="confirm-modal" role="dialog" aria-modal="true" aria-labelledby="importar-contas-titulo" style={{ width: "min(960px, 96vw)", maxHeight: "92vh", display: "flex", flexDirection: "column", gap: 12 }}>
        <div className="modal-header">
          <h2 id="importar-contas-titulo">Importar contas de pagamento (Kesh)</h2>
          <button className="icon-button" type="button" disabled={gravando} onClick={onClose} aria-label="Fechar"><X size={18} /></button>
        </div>
        <p className="muted">
          Escolha o CSV exportado da Kesh. O sistema casa cada linha pelo CPF e mostra o que vai mudar antes de gravar.
          Grava em "Conta de pagamento (salário)": Banco {BANCO_KESH}, Tipo "{TIPO_KESH}" e o número da conta.
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <label className="btn btn-secondary">
            <Upload size={16} /> {arquivo ? "Trocar arquivo" : "Escolher CSV"}
            <input hidden type="file" accept=".csv,text/csv" disabled={gravando} onChange={(event) => { void abrir(event.target.files?.[0]); event.target.value = ""; }} />
          </label>
          {arquivo ? <span className="muted">{arquivo} · {linhas.length} linha(s)</span> : null}
        </div>
        {erro ? <p className="form-error" role="alert">{erro}</p> : null}

        {linhas.length ? (
          <>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(Object.keys(situacoes) as Situacao[]).map((situacao) => (
                <button key={situacao} type="button" className={`btn ${filtro === situacao ? "btn-primary" : "btn-ghost"}`} onClick={() => setFiltro(situacao)}>
                  {situacoes[situacao].titulo}: {contagem(situacao)}
                </button>
              ))}
              <button type="button" className={`btn ${filtro === "semKesh" ? "btn-primary" : "btn-ghost"}`} onClick={() => setFiltro("semKesh")}>
                Ativos no DP fora do arquivo: {semKesh.length}
              </button>
            </div>
            <div style={{ overflow: "auto", flex: 1, minHeight: 160, border: "1px solid var(--border, #d8dee8)", borderRadius: 8 }}>
              <table className="data-table">
                <thead>
                  {filtro === "semKesh" ? (
                    <tr><th>Funcionário no DP</th><th>CPF</th><th>Conta atual</th></tr>
                  ) : (
                    <tr><th>Nome na Kesh</th><th>CPF</th><th>Funcionário no DP</th><th>Conta atual</th><th>Conta Kesh</th></tr>
                  )}
                </thead>
                <tbody>
                  {filtro === "semKesh"
                    ? semKesh.map((f) => (
                      <tr key={f.id}><td>{f.name}</td><td>{f.cpf}</td><td>{[f.registrationData?.paymentBank, f.registrationData?.paymentAccount].filter(Boolean).join(" ") || "—"}</td></tr>
                    ))
                    : visiveis.map((item, index) => (
                      <tr key={`${item.cpf}-${index}`}>
                        <td>{item.nome}</td>
                        <td>{item.cpf}</td>
                        <td>{item.funcionario ? `${item.funcionario.name}${isEmployeeTerminated(item.funcionario) ? " (desligado)" : ""}` : "—"}</td>
                        <td>{item.contaAtual || "—"}</td>
                        <td style={{ color: situacoes[item.situacao].cor, fontWeight: 600 }}>{item.conta || item.status || "—"}</td>
                      </tr>
                    ))}
                  {(filtro === "semKesh" ? !semKesh.length : !visiveis.length) ? <tr><td colSpan={5} className="muted">Ninguém nesta situação.</td></tr> : null}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        {gravados !== null ? <p role="status" style={{ color: "#166534", fontWeight: 600 }}>{gravados} conta(s) gravada(s). Use "Desfazer" no aviso se precisar voltar.</p> : null}
        <div className="form-actions">
          <button className="btn btn-ghost" type="button" disabled={gravando} onClick={onClose}>Fechar</button>
          <button className="btn btn-primary" type="button" disabled={gravando || !aGravar.length || gravados !== null} onClick={() => void gravar()}>
            {gravando ? "Gravando..." : `Gravar ${aGravar.length} conta(s)`}
          </button>
        </div>
      </div>
    </ModalPortal>
  );
}
