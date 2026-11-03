import { useMemo, useState } from "react";
import { AlertTriangle, ClipboardList, FileSpreadsheet, Wallet } from "lucide-react";
import { readPdf } from "../pdfTools";
import { normalizarNome } from "../names";
import {
  SITUACOES,
  comparar,
  competenciaDoExtrato,
  extrairExtrato,
  extrairPonto,
  formatarMinutos,
  periodoDoPonto,
  type Comparacao,
  type RegistroFolha,
  type RegistroPonto,
  type Situacao,
} from "./conferenciaModel";
import { exportarConferencia } from "./conferenciaExport";
import { exportarRelacao, exportarRelatorioPonto, lerRelacaoAnterior, montarRelacao, pontoDasLinhas } from "./conferenciaRelatorios";

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}

const statusClass: Record<Situacao, string> = {
  CORRETO: "is-ok",
  ARREDONDAMENTO: "is-warn",
  DIVERGENTE: "is-bad",
  "NÃO ENCONTRADO": "",
  "SOMENTE NO PONTO": "is-info",
};

function FileField({ label, hint, accept = "application/pdf,.pdf", onChange }: { label: string; hint?: string; accept?: string; onChange: (file: File | null) => void }) {
  return (
    <label className="toolbox-file">
      <span>{label}</span>
      <input type="file" accept={accept} onChange={(event) => onChange(event.target.files?.[0] || null)} />
      {hint ? <small>{hint}</small> : null}
    </label>
  );
}

/** Competência "09/2026" x período do ponto "21/08/2026 até 20/09/2026": o fim do período cai no mês da competência. */
function periodoConfere(competencia: string, periodo: string) {
  const fim = /até\s*(\d{2})\/(\d{2})\/(\d{4})/i.exec(periodo);
  if (!competencia || !fim) return true;
  return `${fim[2]}/${fim[3]}` === competencia;
}

export default function ConferenciaFolhaPonto() {
  const [extratoFile, setExtratoFile] = useState<File | null>(null);
  const [pontoFile, setPontoFile] = useState<File | null>(null);
  const [tolerancia, setTolerancia] = useState(5);
  const [relacaoFile, setRelacaoFile] = useState<File | null>(null);
  const [dados, setDados] = useState<{ extrato: RegistroFolha[]; ponto: RegistroPonto[] } | null>(null);
  const [aviso, setAviso] = useState("");
  const [busca, setBusca] = useState("");
  const [situacao, setSituacao] = useState<Situacao | "TODOS">("TODOS");
  const [progresso, setProgresso] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  // Trocar um arquivo apaga o resultado: nada de exportar dados de um PDF que já não está escolhido.
  function trocar(setter: (file: File | null) => void) {
    return (file: File | null) => {
      setter(file);
      setDados(null);
      setProgresso("");
      setAviso("");
    };
  }

  async function processar() {
    if (!extratoFile && !pontoFile) return;
    setOcupado(true);
    setErro("");
    setAviso("");
    try {
      const extrato = extratoFile ? extrairExtrato(await readPdf(extratoFile, setProgresso)) : [];
      if (extratoFile && !extrato.length) throw new Error("nenhum funcionário no extrato. Confira se é o Extrato Mensal do Domínio.");
      const ponto = pontoFile ? extrairPonto(await readPdf(pontoFile, setProgresso)) : [];
      if (pontoFile && !ponto.length) throw new Error("nenhum funcionário no Cartão Ponto. Confira se é o Cartão Ponto do Secullum.");
      setDados({ extrato, ponto });
      setProgresso(extratoFile && pontoFile ? `Concluído: ${extrato.length} no extrato e ${ponto.length} no ponto.`
        : extratoFile ? `Extrato lido: ${extrato.length} funcionários. Use "Relação de pagamentos".`
          : `Cartão Ponto lido: ${ponto.length} funcionários. Use "Relatório completo do ponto".`);
    } catch (reason) {
      setDados(null);
      setErro(`Não foi possível ler os PDFs: ${errorMessage(reason)}`);
      setProgresso("");
    } finally {
      setOcupado(false);
    }
  }

  // Recalcula na hora quando a tolerância muda (a leitura dos PDFs não se repete).
  const comparando = Boolean(dados?.extrato.length && dados.ponto.length);
  const resultados = useMemo<Comparacao[]>(() => (dados && comparando ? comparar(dados.extrato, dados.ponto, tolerancia) : []), [dados, comparando, tolerancia]);
  const competencia = dados ? competenciaDoExtrato(dados.extrato) : "";
  const periodo = dados ? periodoDoPonto(dados.ponto) : "";

  const contagem = useMemo(() => {
    const mapa = new Map<Situacao, number>(SITUACOES.map((s) => [s, 0]));
    resultados.forEach((linha) => mapa.set(linha.situacao, (mapa.get(linha.situacao) || 0) + 1));
    return mapa;
  }, [resultados]);

  const visiveis = useMemo(() => {
    const termo = normalizarNome(busca);
    const digitos = busca.replace(/\D/g, "");
    return resultados.filter((linha) => (situacao === "TODOS" || linha.situacao === situacao) && (!busca.trim()
      || normalizarNome(`${linha.nomeExtrato} ${linha.nomePonto}`).includes(termo)
      || (digitos.length >= 3 && linha.cpf.replace(/\D/g, "").includes(digitos))));
  }, [resultados, busca, situacao]);

  const cards: { titulo: string; valor: number; classe: string; filtro: Situacao | "TODOS" }[] = [
    { titulo: "Funcionários", valor: resultados.length, classe: "", filtro: "TODOS" },
    { titulo: "Corretos", valor: contagem.get("CORRETO") || 0, classe: "is-ok", filtro: "CORRETO" },
    { titulo: "Arredondamento", valor: contagem.get("ARREDONDAMENTO") || 0, classe: "is-warn", filtro: "ARREDONDAMENTO" },
    { titulo: "Divergentes", valor: contagem.get("DIVERGENTE") || 0, classe: "is-bad", filtro: "DIVERGENTE" },
    { titulo: "Não encontrados", valor: contagem.get("NÃO ENCONTRADO") || 0, classe: "", filtro: "NÃO ENCONTRADO" },
    { titulo: "Somente no ponto", valor: contagem.get("SOMENTE NO PONTO") || 0, classe: "is-info", filtro: "SOMENTE NO PONTO" },
  ];

  async function exportar() {
    if (!visiveis.length) return;
    try {
      await exportarConferencia(visiveis, competencia);
    } catch (reason) {
      setErro(`Não foi possível gerar o Excel: ${errorMessage(reason)}`);
    }
  }

  // Sem extrato, vai o ponto inteiro; com a conferência, só quem está nos filtros da tela.
  async function relatorioPonto() {
    if (!dados?.ponto.length) return;
    const registros = comparando ? pontoDasLinhas(dados.ponto, visiveis) : dados.ponto;
    if (!registros.length) {
      setErro("Nenhum funcionário do ponto corresponde aos filtros atuais.");
      return;
    }
    setErro("");
    try {
      await exportarRelatorioPonto(registros, comparando ? visiveis : [], periodo);
      setAviso(`Relatório do ponto gerado com ${registros.length} funcionário(s)${comparando ? " conforme os filtros da tela" : ""}.`);
    } catch (reason) {
      setErro(`Não foi possível gerar o relatório do ponto: ${errorMessage(reason)}`);
    }
  }

  async function relacaoPagamentos() {
    if (!dados?.extrato.length) return;
    setErro("");
    try {
      const anterior = relacaoFile ? await lerRelacaoAnterior(relacaoFile) : null;
      if (relacaoFile && !anterior) throw new Error("a planilha anterior não tem o cabeçalho NOME / CONTAS nas primeiras 15 linhas.");
      const linhas = montarRelacao(dados.extrato, anterior);
      await exportarRelacao(linhas, competencia);
      const comConta = linhas.filter((linha) => linha.conta || linha.banco).length;
      setAviso(`Relação gerada com ${linhas.length} funcionário(s). ${anterior
        ? `Conta/banco encontrados para ${comConta} (aba "${anterior.aba}" da relação anterior).`
        : "Conta e banco ficaram vazios porque nenhuma relação anterior foi escolhida."}`);
    } catch (reason) {
      setErro(`Não foi possível gerar a relação de pagamentos: ${errorMessage(reason)}`);
    }
  }

  return (
    <div className="toolbox-panel">
      <p className="toolbox-hint">
        Com o Extrato Mensal (Domínio) e o Cartão Ponto (Secullum) do mesmo mês, compara por CPF e, se não achar, pelo nome.
        Só o extrato (inclusive o de adiantamento) gera a relação de pagamentos; só o Cartão Ponto gera o relatório do ponto.
      </p>
      <div className="toolbox-files">
        <FileField label="Extrato Mensal (PDF)" onChange={trocar(setExtratoFile)} />
        <FileField label="Cartão Ponto (PDF)" onChange={trocar(setPontoFile)} />
        <FileField
          label="Relação anterior (Excel, opcional)"
          hint="Só para trazer conta e banco. O valor sempre vem do extrato."
          accept=".xlsx,.xlsm,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={setRelacaoFile}
        />
        <label className="toolbox-file conf-tolerancia">
          <span>Tolerância (minutos)</span>
          <input type="number" min={0} max={60} value={tolerancia} onChange={(event) => setTolerancia(Math.max(0, Math.min(60, Number(event.target.value) || 0)))} />
        </label>
        <button className="btn btn-primary" type="button" disabled={ocupado || (!extratoFile && !pontoFile)} onClick={() => void processar()}>
          {ocupado ? "Lendo..." : extratoFile && pontoFile ? "Comparar" : "Ler PDF"}
        </button>
      </div>
      {progresso ? <p className="toolbox-progress">{progresso}</p> : null}
      {erro ? <p className="toolbox-error">{erro}</p> : null}
      {aviso ? <p className="conf-ok">{aviso}</p> : null}

      {dados ? (
        <div className="toolbox-actions">
          <button className="btn btn-secondary" type="button" disabled={!dados.extrato.length} onClick={() => void relacaoPagamentos()}
            title={dados.extrato.length ? "Nome, valor líquido, conta, banco, CPF, empresa e status" : "Precisa do Extrato Mensal"}>
            <Wallet size={16} /> Relação de pagamentos
          </button>
          <button className="btn btn-secondary" type="button" disabled={!dados.ponto.length} onClick={() => void relatorioPonto()}
            title={dados.ponto.length ? "Resumo por funcionário + ocorrências por dia" : "Precisa do Cartão Ponto"}>
            <ClipboardList size={16} /> Relatório completo do ponto
          </button>
        </div>
      ) : null}

      {dados && comparando ? (
        <>
          {!periodoConfere(competencia, periodo) ? (
            <p className="conf-aviso">
              <AlertTriangle size={16} /> O extrato é da competência <strong>{competencia}</strong>, mas o Cartão Ponto é de <strong>{periodo}</strong>. Confira se escolheu os arquivos do mesmo mês: as diferenças abaixo podem ser só por isso.
            </p>
          ) : (
            <p className="toolbox-hint">Extrato: competência {competencia || "—"} · Cartão Ponto: {periodo || "—"}</p>
          )}
          <div className="conf-cards">
            {cards.map((card) => (
              <button
                type="button"
                key={card.titulo}
                className={`conf-card ${card.classe} ${situacao === card.filtro ? "is-active" : ""}`}
                onClick={() => setSituacao(card.filtro)}
              >
                <small>{card.titulo}</small>
                <strong>{card.valor}</strong>
              </button>
            ))}
          </div>
          <div className="toolbox-actions">
            <input type="search" placeholder="Pesquisar nome ou CPF" value={busca} onChange={(event) => setBusca(event.target.value)} />
            <select value={situacao} onChange={(event) => setSituacao(event.target.value as Situacao | "TODOS")}>
              <option value="TODOS">Todas as situações</option>
              {SITUACOES.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
            <span className="toolbox-count">{visiveis.length} linha(s)</span>
            <button className="btn btn-primary" type="button" disabled={!visiveis.length} onClick={() => void exportar()}>
              <FileSpreadsheet size={16} /> Exportar conferência
            </button>
          </div>
          <div className="toolbox-table-wrap">
            <table className="toolbox-table conf-table">
              <thead>
                <tr>
                  <th>Funcionário</th>
                  <th>Extrato 50%</th><th>Ponto 50%</th><th>Dif. 50%</th>
                  <th>Extrato 75%</th><th>Ponto 75%</th><th>Dif. 75%</th>
                  <th>Extrato 120%</th><th>Ponto 120%</th><th>Dif. 120%</th>
                  <th>Faltas extrato</th><th>Faltas ponto</th>
                  <th>Situação</th>
                  <th>Cargo</th>
                  <th>Motivo da divergência</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((linha) => (
                  <tr key={linha.chave}>
                    <td title={linha.nomePonto && linha.nomePonto !== linha.nomeExtrato ? `No ponto: ${linha.nomePonto}` : undefined}>{linha.nomeExtrato || linha.nomePonto}</td>
                    <td>{formatarMinutos(linha.extrato50)}</td><td>{formatarMinutos(linha.ponto50)}</td><Dif valor={linha.diferenca50} tolerancia={tolerancia} />
                    <td>{formatarMinutos(linha.extrato75)}</td><td>{formatarMinutos(linha.ponto75)}</td><Dif valor={linha.diferenca75} tolerancia={tolerancia} />
                    <td>{formatarMinutos(linha.extrato120)}</td><td>{formatarMinutos(linha.ponto120)}</td><Dif valor={linha.diferenca120} tolerancia={tolerancia} />
                    <td>{linha.faltasExtrato ?? ""}</td><td>{linha.faltasPonto ?? ""}</td>
                    <td><span className={`toolbox-status ${statusClass[linha.situacao]}`}>{linha.situacao}</span></td>
                    <td>{linha.cargo}</td>
                    <td className="conf-motivo">{linha.motivo}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Dif({ valor, tolerancia }: { valor: number | null; tolerancia: number }) {
  if (valor === null || valor === 0) return <td className="conf-dif">{valor === 0 ? "00:00" : ""}</td>;
  return <td className={`conf-dif ${Math.abs(valor) > tolerancia ? "is-bad" : "is-warn"}`}>{formatarMinutos(valor)}</td>;
}
