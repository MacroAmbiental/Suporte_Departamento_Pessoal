import { useMemo, useState } from "react";
import { Download, Printer } from "lucide-react";
import { useDomainData } from "@/hooks/useDomainData";
import { timekeepingTeamStructure } from "@/modules/timekeeping/utils/teamStructure";
import { buildPdf, downloadBlob, openBlob, readPdf, safeFileName, type PdfFile } from "../pdfTools";
import { formatarCpf, normalizarNome } from "../names";
import {
  SEM_EQUIPE,
  cruzarCartaoEquipes,
  cruzarDocumentos,
  extrairCartaoPonto,
  extrairDocumentos,
  resumirEquipes,
  type CartaoEquipe,
  type Correspondencia,
  type PessoaDP,
} from "./recibosModel";

type Aba = "recibos" | "cartao";

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}

function FileField({ label, file, onChange }: { label: string; file: File | null; onChange: (file: File | null) => void }) {
  return (
    <label className="toolbox-file">
      <span>{label}</span>
      <input type="file" accept="application/pdf,.pdf" title={file?.name} onChange={(event) => onChange(event.target.files?.[0] || null)} />
    </label>
  );
}

const statusClass: Record<string, string> = {
  PRONTO: "is-ok",
  "COMPETÊNCIA DIVERGENTE": "is-warn",
  "SEM ADIANTAMENTO": "is-warn",
  "SEM PAGAMENTO": "is-warn",
  "SEM EQUIPE NO DP": "is-warn",
  "NÃO ENCONTRADO NO DP": "is-bad",
};

function StatusTag({ status }: { status: string }) {
  return <span className={`toolbox-status ${statusClass[status] || ""}`}>{status}</span>;
}

// ---------------------------------------------------------------------------
// Pagamento + adiantamento: um PDF com os dois recibos de cada funcionário escolhido.

function PagamentoAdiantamento() {
  const [pagamentoFile, setPagamentoFile] = useState<File | null>(null);
  const [adiantamentoFile, setAdiantamentoFile] = useState<File | null>(null);
  const [pdfs, setPdfs] = useState<{ pagamento: PdfFile; adiantamento: PdfFile } | null>(null);
  const [linhas, setLinhas] = useState<Correspondencia[]>([]);
  const [selecionados, setSelecionados] = useState<Set<string>>(new Set());
  const [busca, setBusca] = useState("");
  const [progresso, setProgresso] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  async function ler() {
    if (!pagamentoFile || !adiantamentoFile) return;
    setOcupado(true);
    setErro("");
    try {
      const pagamento = await readPdf(pagamentoFile, setProgresso);
      const adiantamento = await readPdf(adiantamentoFile, setProgresso);
      const resultado = cruzarDocumentos(extrairDocumentos(pagamento), extrairDocumentos(adiantamento));
      setPdfs({ pagamento, adiantamento });
      setLinhas(resultado);
      setSelecionados(new Set(resultado.filter((linha) => linha.status === "PRONTO").map((linha) => linha.chave)));
      setProgresso(resultado.length ? `${resultado.length} funcionário(s) encontrados.` : "Nenhum funcionário identificado nos PDFs.");
    } catch (reason) {
      setErro(`Não foi possível ler os PDFs: ${errorMessage(reason)}`);
      setProgresso("");
    } finally {
      setOcupado(false);
    }
  }

  const visiveis = useMemo(() => {
    const termo = normalizarNome(busca);
    const digitos = busca.replace(/\D/g, "");
    return linhas.filter((linha) => !busca.trim() || normalizarNome(linha.nome).includes(termo) || (digitos && linha.cpf.includes(digitos)) || linha.status.includes(busca.trim().toUpperCase()));
  }, [linhas, busca]);
  const contagem = useMemo(() => {
    const mapa = new Map<string, number>();
    linhas.forEach((linha) => mapa.set(linha.status, (mapa.get(linha.status) || 0) + 1));
    return Array.from(mapa);
  }, [linhas]);
  const escolhidos = linhas.filter((linha) => selecionados.has(linha.chave));
  const todosVisiveisMarcados = visiveis.length > 0 && visiveis.every((linha) => selecionados.has(linha.chave));

  function alternar(chave: string) {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      if (novo.has(chave)) novo.delete(chave);
      else novo.add(chave);
      return novo;
    });
  }

  function alternarVisiveis() {
    setSelecionados((atual) => {
      const novo = new Set(atual);
      visiveis.forEach((linha) => (todosVisiveisMarcados ? novo.delete(linha.chave) : novo.add(linha.chave)));
      return novo;
    });
  }

  async function gerar(destino: "baixar" | "imprimir") {
    if (!pdfs || !escolhidos.length) return;
    setOcupado(true);
    setErro("");
    try {
      const blob = await buildPdf(escolhidos.flatMap((linha) => [
        { source: pdfs.pagamento, pages: linha.paginasPagamento },
        { source: pdfs.adiantamento, pages: linha.paginasAdiantamento },
      ]));
      if (destino === "imprimir") openBlob(blob);
      else {
        const competencia = escolhidos.find((linha) => linha.competenciaPagamento)?.competenciaPagamento || "";
        downloadBlob(blob, `Recibos_pagamento_adiantamento${competencia ? `_${safeFileName(competencia)}` : ""}.pdf`);
      }
    } catch (reason) {
      setErro(`Não foi possível gerar o PDF: ${errorMessage(reason)}`);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <div className="toolbox-panel">
      <div className="toolbox-files">
        <FileField label="PDF de pagamento" file={pagamentoFile} onChange={setPagamentoFile} />
        <FileField label="PDF de adiantamento" file={adiantamentoFile} onChange={setAdiantamentoFile} />
        <button className="btn btn-primary" type="button" disabled={ocupado || !pagamentoFile || !adiantamentoFile} onClick={() => void ler()}>
          {ocupado && !linhas.length ? "Lendo..." : "Ler funcionários"}
        </button>
      </div>
      {progresso ? <p className="toolbox-progress">{progresso}</p> : null}
      {erro ? <p className="toolbox-error">{erro}</p> : null}

      {linhas.length ? (
        <>
          <div className="toolbox-summary">
            {contagem.map(([status, total]) => <span key={status}><StatusTag status={status} /> {total}</span>)}
          </div>
          <div className="toolbox-actions">
            <input type="search" placeholder="Buscar nome, CPF ou situação" value={busca} onChange={(event) => setBusca(event.target.value)} />
            <span className="toolbox-count">{escolhidos.length} selecionado(s)</span>
            <button className="btn btn-secondary" type="button" disabled={ocupado || !escolhidos.length} onClick={() => void gerar("imprimir")}><Printer size={16} /> Abrir para imprimir</button>
            <button className="btn btn-primary" type="button" disabled={ocupado || !escolhidos.length} onClick={() => void gerar("baixar")}><Download size={16} /> Baixar PDF</button>
          </div>
          <div className="toolbox-table-wrap">
            <table className="toolbox-table">
              <thead>
                <tr>
                  <th><input type="checkbox" aria-label="Marcar todos" checked={todosVisiveisMarcados} onChange={alternarVisiveis} /></th>
                  <th>Funcionário</th>
                  <th>CPF</th>
                  <th>Competência</th>
                  <th>Páginas</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((linha) => (
                  <tr key={linha.chave} onClick={() => alternar(linha.chave)}>
                    <td><input type="checkbox" aria-label={`Marcar ${linha.nome}`} checked={selecionados.has(linha.chave)} onChange={() => alternar(linha.chave)} onClick={(event) => event.stopPropagation()} /></td>
                    <td>{linha.nome || "(sem nome)"}</td>
                    <td>{formatarCpf(linha.cpf)}</td>
                    <td>{linha.competenciaPagamento === linha.competenciaAdiantamento || !linha.competenciaAdiantamento ? linha.competenciaPagamento : `${linha.competenciaPagamento || "—"} / ${linha.competenciaAdiantamento}`}</td>
                    <td>{linha.paginasPagamento.length} + {linha.paginasAdiantamento.length}</td>
                    <td><StatusTag status={linha.status} /></td>
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

// ---------------------------------------------------------------------------
// Cartão-Ponto por equipe: um PDF por equipe, com a equipe atual do cadastro do DP.

function CartaoPorEquipe() {
  const data = useDomainData();
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [pdf, setPdf] = useState<PdfFile | null>(null);
  const [registros, setRegistros] = useState<CartaoEquipe[]>([]);
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set());
  const [progresso, setProgresso] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const pessoas = useMemo<PessoaDP[]>(() => {
    const { teams, employeeTeamId } = timekeepingTeamStructure(data);
    const nomeEquipe = new Map(teams.map((team) => [team.id, team.name]));
    // Ativos primeiro: quem saiu no mês também tem cartão.
    return [...data.employees, ...data.dismissedEmployees]
      .sort((a, b) => Number(a.status === "terminated") - Number(b.status === "terminated"))
      .map((employee) => ({ nome: employee.name, cpf: employee.cpf, equipe: nomeEquipe.get(employeeTeamId(employee)) || "" }));
  }, [data]);

  async function identificar() {
    if (!arquivo) return;
    setOcupado(true);
    setErro("");
    try {
      const lido = await readPdf(arquivo, setProgresso);
      const cartoes = extrairCartaoPonto(lido);
      if (!cartoes.length) throw new Error("nenhum funcionário encontrado. Confira se é o PDF do Cartão-Ponto do Secullum.");
      const resultado = cruzarCartaoEquipes(cartoes, pessoas);
      setPdf(lido);
      setRegistros(resultado);
      setMarcadas(new Set(resultado.map((registro) => registro.equipe)));
      setProgresso(`${resultado.length} funcionário(s) em ${new Set(resultado.map((r) => r.equipe)).size} equipe(s).`);
    } catch (reason) {
      setErro(`Não foi possível ler o Cartão-Ponto: ${errorMessage(reason)}`);
      setProgresso("");
    } finally {
      setOcupado(false);
    }
  }

  const equipes = useMemo(() => resumirEquipes(registros), [registros]);
  const pendentes = registros.filter((registro) => registro.status !== "PRONTO");
  const escolhidas = equipes.filter((equipe) => marcadas.has(equipe.equipe));

  function pdfDaEquipe(itens: CartaoEquipe[]) {
    return buildPdf(itens.map((item) => ({ source: pdf!, pages: item.paginas })));
  }

  async function gerar(lista: typeof equipes, destino: "baixar" | "imprimir") {
    if (!pdf || !lista.length) return;
    setOcupado(true);
    setErro("");
    try {
      for (const equipe of lista) {
        const blob = await pdfDaEquipe(equipe.itens);
        if (destino === "imprimir") openBlob(blob);
        else downloadBlob(blob, `Cartao_Ponto_${safeFileName(equipe.equipe)}.pdf`);
        // Intervalo curto: o navegador perde downloads disparados todos de uma vez.
        if (lista.length > 1) await new Promise((resolve) => setTimeout(resolve, 400));
      }
    } catch (reason) {
      setErro(`Não foi possível gerar o PDF: ${errorMessage(reason)}`);
    } finally {
      setOcupado(false);
    }
  }

  function alternar(equipe: string) {
    setMarcadas((atual) => {
      const novo = new Set(atual);
      if (novo.has(equipe)) novo.delete(equipe);
      else novo.add(equipe);
      return novo;
    });
  }

  return (
    <div className="toolbox-panel">
      <p className="toolbox-hint">A equipe de cada funcionário vem do cadastro do DP (a mesma do Controle de ponto). Não precisa mais da planilha Ponto Diário.</p>
      <div className="toolbox-files">
        <FileField label="PDF do Cartão-Ponto" file={arquivo} onChange={setArquivo} />
        <button className="btn btn-primary" type="button" disabled={ocupado || !arquivo || !pessoas.length} onClick={() => void identificar()}>
          {ocupado && !registros.length ? "Lendo..." : "Identificar equipes"}
        </button>
      </div>
      {!pessoas.length ? <p className="toolbox-progress">Carregando funcionários do DP...</p> : null}
      {progresso ? <p className="toolbox-progress">{progresso}</p> : null}
      {erro ? <p className="toolbox-error">{erro}</p> : null}

      {equipes.length ? (
        <>
          <div className="toolbox-actions">
            <span className="toolbox-count">{escolhidas.length} equipe(s) marcada(s)</span>
            <button className="btn btn-primary" type="button" disabled={ocupado || !escolhidas.length} onClick={() => void gerar(escolhidas, "baixar")}><Download size={16} /> Baixar PDFs das marcadas</button>
          </div>
          <div className="toolbox-table-wrap">
            <table className="toolbox-table">
              <thead>
                <tr>
                  <th><input type="checkbox" aria-label="Marcar todas" checked={escolhidas.length === equipes.length} onChange={() => setMarcadas(escolhidas.length === equipes.length ? new Set() : new Set(equipes.map((e) => e.equipe)))} /></th>
                  <th>Equipe</th>
                  <th>Funcionários</th>
                  <th>Páginas</th>
                  <th aria-label="Ações" />
                </tr>
              </thead>
              <tbody>
                {equipes.map((equipe) => (
                  <tr key={equipe.equipe} className={equipe.equipe === SEM_EQUIPE ? "is-alert" : ""}>
                    <td><input type="checkbox" aria-label={`Marcar ${equipe.equipe}`} checked={marcadas.has(equipe.equipe)} onChange={() => alternar(equipe.equipe)} /></td>
                    <td>{equipe.equipe}</td>
                    <td>{equipe.funcionarios}</td>
                    <td>{equipe.paginas}</td>
                    <td className="toolbox-row-actions">
                      <button className="btn btn-secondary" type="button" title="Abrir para imprimir" disabled={ocupado} onClick={() => void gerar([equipe], "imprimir")}><Printer size={15} /></button>
                      <button className="btn btn-secondary" type="button" title="Baixar PDF" disabled={ocupado} onClick={() => void gerar([equipe], "baixar")}><Download size={15} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {pendentes.length ? (
            <details className="toolbox-pending">
              <summary>{pendentes.length} funcionário(s) sem equipe ou não encontrados no DP (ficam em "{SEM_EQUIPE}")</summary>
              <table className="toolbox-table">
                <thead><tr><th>Funcionário no cartão</th><th>CPF</th><th>Situação</th></tr></thead>
                <tbody>
                  {pendentes.map((registro) => (
                    <tr key={registro.chave}><td>{registro.nome}</td><td>{formatarCpf(registro.cpf)}</td><td><StatusTag status={registro.status} /></td></tr>
                  ))}
                </tbody>
              </table>
            </details>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

export default function JuntarRecibos() {
  const [aba, setAba] = useState<Aba>("recibos");
  return (
    <div className="toolbox-tool">
      <div className="toolbox-tabs" role="tablist">
        <button type="button" role="tab" aria-selected={aba === "recibos"} className={aba === "recibos" ? "is-active" : ""} onClick={() => setAba("recibos")}>Pagamento + adiantamento</button>
        <button type="button" role="tab" aria-selected={aba === "cartao"} className={aba === "cartao" ? "is-active" : ""} onClick={() => setAba("cartao")}>Cartão-Ponto por equipe</button>
      </div>
      {/* As duas abas ficam montadas para não perder o que já foi lido ao trocar. */}
      <div hidden={aba !== "recibos"}><PagamentoAdiantamento /></div>
      <div hidden={aba !== "cartao"}><CartaoPorEquipe /></div>
    </div>
  );
}
