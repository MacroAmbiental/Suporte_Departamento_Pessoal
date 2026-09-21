import { useState } from "react";
import { History } from "lucide-react";
import { useDomainData } from "@/hooks/useDomainData";
import { formatDate } from "@/utils/format";
import { openEmployeeDocumentFile } from "@/services/documentStorage";
import EmployeesPagination from "./EmployeesPagination";
import ProcessDrawer from "./ProcessDrawer";
export default function ProcessHistoryCard() {
  const { employeeProcessHistory } = useDomainData();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [fineRiskOnly, setFineRiskOnly] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const selected = employeeProcessHistory.find((item) => item.id === selectedId);
  const isFineRisk = (item: typeof employeeProcessHistory[number]) => {
    const fields = item.employee.registrationData || {};
    const dueDate = fields.terminationSettlementDueDate || "";
    const paidAt = fields.terminationSettlementPaidAt || "";
    return fields.terminationMode === "indemnified" && Boolean(dueDate) && (fields.terminationSettlementPaid !== "true" || paidAt.slice(0, 10) > dueDate);
  };
  const fineRiskCount = employeeProcessHistory.filter(isFineRisk).length;
  const rows = employeeProcessHistory.filter((item) => `${item.employee.name} ${item.employee.cpf} ${item.company} ${item.modality}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")) && (!fineRiskOnly || isFineRisk(item))).sort((a, b) => b.completedAt.localeCompare(a.completedAt));
  const pages = Math.max(1, Math.ceil(rows.length / 10));
  const current = Math.min(page, pages);
  const offset = (current - 1) * 10;
  return <section className="employee-process-list">
    <header className="process-history-heading"><div><h2><History size={22} /> Histórico de processos</h2><p className="muted">{employeeProcessHistory.length} processos arquivados. Informações preservadas no encerramento.</p></div><div className="process-history-actions"><button type="button" className={`btn btn-secondary${fineRiskOnly ? " is-selected" : ""}`} aria-pressed={fineRiskOnly} onClick={() => { setFineRiskOnly((active) => !active); setPage(1); }}>Passível de multa ({fineRiskCount})</button><input aria-label="Pesquisar histórico de processos" placeholder="Pesquisar no histórico..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></div></header>
    <div className="employee-process-table-wrap"><table className="data-table"><thead><tr><th>Funcionário</th><th>Empresa</th><th>Modalidade</th><th>Inicio do processo</th><th>Conclusão</th><th>Observações</th></tr></thead><tbody>
      {rows.slice(offset, offset + 10).map((item) => <tr key={item.id} onDoubleClick={(event) => { event.stopPropagation(); setSelectedId(item.id); }}><td><button className="process-open-button" type="button" onClick={() => setSelectedId(item.id)}>{item.employee.name}</button></td><td>{item.company}</td><td>{item.modality}{isFineRisk(item) && <><br /><span className="badge badge-danger">Passível de multa</span></>}</td><td>{item.enteredAt ? formatDate(item.enteredAt.slice(0, 10)) : "Não registrado"}</td><td>{formatDate(item.completedAt.slice(0, 10))}</td><td style={{ whiteSpace: "pre-wrap" }}>{item.notes || "—"}</td></tr>)}
      {!rows.length && <tr><td colSpan={6} className="employee-process-empty">Nenhum processo no histórico para exibir.</td></tr>}
    </tbody></table></div>
    <footer><EmployeesPagination totalItems={rows.length} pageStart={offset + 1} pageEnd={Math.min(offset + 10, rows.length)} currentPage={current} totalPages={pages} onPageChange={setPage} /></footer>
    {selected && <ProcessDrawer name={selected.employee.name} onClose={() => { setSelectedId(null); setError(""); }}>
      <span className="badge badge-success">{selected.employee.registrationData?.experienceConfirmedAt ? "Contratação definitiva · Histórico" : "Concluído · Histórico"}</span>
      {isFineRisk(selected) && <p><span className="badge badge-danger">Passível de multa</span> Pagamento da indenização pendente ou registrado após o prazo de 10 dias.</p>}
      <dl className="process-details-grid">{[["Empresa", selected.company], ["CPF", selected.employee.cpf], ["Matrícula", selected.employee.registration], ["Cargo", selected.employee.role], ["Modalidade", selected.modality], ["Admissão", formatDate(selected.employee.admissionDate)], ["Inicio do processo", selected.enteredAt ? formatDate(selected.enteredAt.slice(0, 10)) : "Não registrado"], ["Conclusão", formatDate(selected.completedAt.slice(0, 10))], ["Início do aviso", formatDate(selected.employee.registrationData?.noticeStartDate || "")], ["Desativação", formatDate(selected.employee.registrationData?.deactivationEffectiveDate || selected.employee.registrationData?.scheduledDeactivationDate || "")], ["Arquivado em", formatDate(selected.archivedAt.slice(0, 10))]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "—"}</dd></div>)}</dl>
      {selected.employee.registrationData?.noticeReduction && <section><h3>Redução do aviso</h3><p>{selected.employee.registrationData.noticeReduction === "hours" ? "2 horas diárias" : "7 dias corridos finais"}</p></section>}
      <section><h3>Observações</h3><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{selected.notes || "Nenhuma observação registrada."}</p></section>
      <section><h3>Anexos preservados</h3>{selected.documents.length ? selected.documents.map((document) => <button key={document.id} className="btn btn-secondary" type="button" onClick={() => void openEmployeeDocumentFile(document.fileUrl, document.name).catch(() => setError("Não foi possível abrir este arquivo."))}>{document.name}</button>) : <p>Nenhum anexo registrado.</p>}</section>
      {error && <p role="alert">{error}</p>}
    </ProcessDrawer>}
  </section>;
}


