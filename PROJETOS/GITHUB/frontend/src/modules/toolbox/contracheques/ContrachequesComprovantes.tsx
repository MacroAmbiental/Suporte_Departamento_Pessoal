import { useMemo, useState } from "react";
import { Download, FileSpreadsheet, Printer } from "lucide-react";
import { composePdf, downloadBlob, openBlob, readPdfLayout, type PdfLayoutFile } from "../pdfTools";
import { normalizarNome } from "../names";
import { LIMIAR_NOME_PADRAO, cruzar, nomeParaArquivo, paginasDaPessoa, type Modo, type Pessoa, type Resultado } from "./contrachequesModel";
import { exportarRelatorioContracheques } from "./contrachequesExport";

function errorMessage(reason: unknown) {
  return reason instanceof Error ? reason.message : String(reason);
}

type Aba = "gerar" | "semComprovante" | "semContracheque" | "semNome";

export default function ContrachequesComprovantes() {
  const [contrachequeFiles, setContrachequeFiles] = useState<File[]>([]);
  const [comprovanteFiles, setComprovanteFiles] = useState<File[]>([]);
  const [duasVias, setDuasVias] = useState(true);
  const [modo, setModo] = useState<Modo>("uma_pagina");
  const [limiar, setLimiar] = useState(LIMIAR_NOME_PADRAO);
  const [lidos, setLidos] = useState<{ contracheques: PdfLayoutFile[]; comprovantes: PdfLayoutFile[] } | null>(null);
  const [aba, setAba] = useState<Aba>("gerar");
  const [busca, setBusca] = useState("");
  const [progresso, setProgresso] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  function trocar(setter: (files: File[]) => void) {
    return (files: FileList | null) => {
      setter(Array.from(files || []));
      setLidos(null);
      setProgresso("");
    };
  }

  async function processar() {
    if (!contrachequeFiles.length || !comprovanteFiles.length) return;
    setOcupado(true);
    setErro("");
    try {
      const contracheques: PdfLayoutFile[] = [];
      for (const file of contrachequeFiles) contracheques.push(await readPdfLayout(file, setProgresso));
      const comprovantes: PdfLayoutFile[] = [];
      for (const file of comprovanteFiles) comprovantes.push(await readPdfLayout(file, setProgresso));
      setLidos({ contracheques, comprovantes });
      setAba("gerar");
      setProgresso("");
    } catch (reason) {
      setLidos(null);
      setErro(`Não foi possível ler os PDFs: ${errorMessage(reason)}`);
      setProgresso("");
    } finally {
      setOcupado(false);
    }
  }

  // O limiar de nome recalcula na hora, sem ler os PDFs de novo.
  const resultado = useMemo<Resultado | null>(() => (lidos ? cruzar(lidos.contracheques, lidos.comprovantes, limiar) : null), [lidos, limiar]);
  const termo = normalizarNome(busca);
  const filtra = <T,>(lista: T[], nome: (item: T) => string) => (termo ? lista.filter((item) => normalizarNome(nome(item)).includes(termo)) : lista);

  async function gerarPdf(pessoas: Pessoa[], destino: "baixar" | "imprimir", nomeArquivo: string) {
    if (!pessoas.length) return;
    setOcupado(true);
    setErro("");
    try {
      const blob = await composePdf(pessoas.flatMap((pessoa) => paginasDaPessoa(pessoa, modo, duasVias)));
      if (destino === "imprimir") openBlob(blob);
      else downloadBlob(blob, nomeArquivo);
    } catch (reason) {
      setErro(`Não foi possível gerar o PDF: ${errorMessage(reason)}`);
    } finally {
      setOcupado(false);
    }
  }

  async function relatorio() {
    if (!resultado) return;
    try {
      await exportarRelatorioContracheques(resultado);
    } catch (reason) {
      setErro(`Não foi possível gerar o relatório: ${errorMessage(reason)}`);
    }
  }

  const pessoasVisiveis = resultado ? filtra(resultado.pessoas, (p) => p.nome) : [];
  const abas: { key: Aba; titulo: string; total: number; classe: string }[] = resultado ? [
    { key: "gerar", titulo: "PDFs a gerar", total: resultado.pessoas.length, classe: "is-ok" },
    { key: "semComprovante", titulo: "Contracheque sem comprovante", total: resultado.semComprovante.length, classe: "is-warn" },
    { key: "semContracheque", titulo: "Comprovante sem contracheque", total: resultado.comprovantesSemContracheque.length, classe: "is-bad" },
    { key: "semNome", titulo: "Páginas sem nome", total: resultado.falhas.length, classe: "" },
  ] : [];

  return (
    <div className="toolbox-panel">
      <p className="toolbox-hint">
        Escolha os PDFs de contracheque (Domínio) e os comprovantes de transferência do banco. A ligação é só pelo nome; vários comprovantes na mesma página são recortados sozinhos.
      </p>
      <p className="conf-aviso">Ferramenta nova: ainda não conferida com comprovantes reais do banco. Confira os primeiros PDFs gerados antes de enviar.</p>
      <div className="toolbox-files">
        <label className="toolbox-file">
          <span>Contracheques (PDF)</span>
          <input type="file" multiple accept="application/pdf,.pdf" onChange={(event) => trocar(setContrachequeFiles)(event.target.files)} />
          {contrachequeFiles.length > 1 ? <small>{contrachequeFiles.length} arquivos</small> : null}
        </label>
        <label className="toolbox-file">
          <span>Comprovantes do banco (PDF)</span>
          <input type="file" multiple accept="application/pdf,.pdf" onChange={(event) => trocar(setComprovanteFiles)(event.target.files)} />
          {comprovanteFiles.length > 1 ? <small>{comprovanteFiles.length} arquivos</small> : null}
        </label>
        <button className="btn btn-primary" type="button" disabled={ocupado || !contrachequeFiles.length || !comprovanteFiles.length} onClick={() => void processar()}>
          {ocupado && !lidos ? "Lendo..." : "Ler PDFs"}
        </button>
      </div>
      <div className="cc-opcoes">
        <label><input type="checkbox" checked={duasVias} onChange={(event) => setDuasVias(event.target.checked)} /> O contracheque tem duas vias iguais na mesma página (usar só a de cima)</label>
        <label>
          Formato
          <select value={modo} onChange={(event) => setModo(event.target.value as Modo)}>
            <option value="uma_pagina">Uma página: contracheque em cima e comprovante embaixo</option>
            <option value="duas_paginas">Duas páginas: cada documento numa página</option>
          </select>
        </label>
        <label>
          Correspondência mínima entre nomes: <strong>{limiar.toFixed(2)}</strong>
          <input type="range" min={0.7} max={1} step={0.01} value={limiar} onChange={(event) => setLimiar(Number(event.target.value))} />
        </label>
      </div>
      {progresso ? <p className="toolbox-progress">{progresso}</p> : null}
      {erro ? <p className="toolbox-error">{erro}</p> : null}

      {resultado ? (
        <>
          <p className="toolbox-hint">
            {resultado.totalContracheques} página(s) de contracheque e {resultado.totalComprovantes} comprovante(s) identificados.
          </p>
          <div className="conf-cards">
            {abas.map((item) => (
              <button type="button" key={item.key} className={`conf-card ${item.classe} ${aba === item.key ? "is-active" : ""}`} onClick={() => setAba(item.key)}>
                <small>{item.titulo}</small>
                <strong>{item.total}</strong>
              </button>
            ))}
          </div>
          <div className="toolbox-actions">
            <input type="search" placeholder="Buscar nome" value={busca} onChange={(event) => setBusca(event.target.value)} />
            <button className="btn btn-secondary" type="button" onClick={() => void relatorio()}><FileSpreadsheet size={16} /> Relatório (Excel)</button>
            {aba === "gerar" ? (
              <>
                <button className="btn btn-secondary" type="button" disabled={ocupado || !pessoasVisiveis.length} onClick={() => void gerarPdf(pessoasVisiveis, "imprimir", "")}>
                  <Printer size={16} /> Abrir todos para imprimir
                </button>
                <button className="btn btn-primary" type="button" disabled={ocupado || !pessoasVisiveis.length} onClick={() => void gerarPdf(pessoasVisiveis, "baixar", "Contracheques_e_comprovantes.pdf")}>
                  <Download size={16} /> Baixar todos em um PDF
                </button>
              </>
            ) : null}
          </div>

          <div className="toolbox-table-wrap">
            {aba === "gerar" ? (
              <table className="toolbox-table">
                <thead><tr><th>Funcionário</th><th>Contracheques</th><th>Comprovantes</th><th>Nome no comprovante</th><th /></tr></thead>
                <tbody>
                  {pessoasVisiveis.map((pessoa) => (
                    <tr key={pessoa.chave}>
                      <td>{pessoa.nome}</td>
                      <td>{pessoa.contracheques.length}</td>
                      <td>{pessoa.comprovantes.length}</td>
                      <td>{[...new Set(pessoa.comprovantes.map((c) => c.nome))].join(" · ")}</td>
                      <td className="toolbox-row-actions">
                        <button className="btn btn-secondary" type="button" title="Abrir para imprimir" disabled={ocupado} onClick={() => void gerarPdf([pessoa], "imprimir", "")}><Printer size={14} /></button>
                        <button className="btn btn-secondary" type="button" title="Baixar PDF" disabled={ocupado} onClick={() => void gerarPdf([pessoa], "baixar", `${nomeParaArquivo(pessoa.nome)}.pdf`)}><Download size={14} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : aba === "semComprovante" ? (
              <table className="toolbox-table">
                <thead><tr><th>Funcionário</th><th>Páginas de contracheque</th></tr></thead>
                <tbody>{filtra(resultado.semComprovante, (p) => p.nome).map((p) => <tr key={p.chave}><td>{p.nome}</td><td>{p.contracheques.length}</td></tr>)}</tbody>
              </table>
            ) : aba === "semContracheque" ? (
              <table className="toolbox-table">
                <thead><tr><th>Nome no comprovante</th><th>Problema</th><th>Melhor nota</th><th>Arquivo</th><th>Página</th><th>Item</th></tr></thead>
                <tbody>
                  {filtra(resultado.comprovantesSemContracheque, (c) => c.nomeComprovante).map((c) => (
                    <tr key={`${c.arquivo}-${c.pagina}-${c.itemNaPagina}`}>
                      <td>{c.nomeComprovante}</td><td>{c.problema}</td><td>{c.melhorNota.toFixed(3)}</td><td>{c.arquivo}</td><td>{c.pagina}</td><td>{c.itemNaPagina}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="toolbox-table">
                <thead><tr><th>Tipo</th><th>Arquivo</th><th>Página</th><th>Item</th><th>Problema</th></tr></thead>
                <tbody>
                  {resultado.falhas.map((f) => (
                    <tr key={`${f.tipo}-${f.arquivo}-${f.pagina}-${f.itemNaPagina}`}><td>{f.tipo}</td><td>{f.arquivo}</td><td>{f.pagina}</td><td>{f.itemNaPagina}</td><td>{f.problema}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
