import ProcessModalityEditor from "../components/ProcessModalityEditor";
import ProcessModelsModal from "../components/ProcessModelsModal";
import ProcessHistoryCard from "../components/ProcessHistoryCard";
import { archiveEmployeeProcess, historyId, processCompletion } from "../utils/processHistory";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarClock, RotateCcw } from "lucide-react";
import { useDomainData } from "@/hooks/useDomainData";
import { securePath } from "@/services/secureRoutes";
import { formatDate, todayISO } from "@/utils/format";
import ExperienceTracking from "../components/ExperienceTracking";
import TerminationSettlementAlert from "../components/TerminationSettlementAlert";
import { experienceAlerts, experienceEndingToday, needsExperienceFollowup, isInExperience, terminationModes, type TerminationMode } from "../utils/experience";
import { openEmployeeDocumentFile, uploadEmployeeDocumentFile } from "@/services/documentStorage";
import EmployeesPagination from "@/modules/employees/components/EmployeesPagination";
import "./employeeProcesses.css";
import { useAuth } from "@/hooks/useAuth";
import ProcessDrawer from "../components/ProcessDrawer";
import { processEntryDate } from "../utils/processEntryDate";
import type { Employee } from "@/types/domain";

const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");


export default function EmployeeProcesses() {
  const data = useDomainData();
  const { employees, companies, employeeDocuments, loading } = data;
  const { can } = useAuth();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingNotes, setSavingNotes] = useState<string | null>(null);
  const [noteMessage, setNoteMessage] = useState("");
  const [search, setSearch] = useState("");
  const [modality, setModality] = useState("");
  const [status, setStatus] = useState("");
  const [attachmentError, setAttachmentError] = useState("");
  const [modelUploading, setModelUploading] = useState(false);
  const [modelDocsOpen, setModelDocsOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [today, setToday] = useState(todayISO);
  const [experienceFilter, setExperienceFilter] = useState("");
  const [settlementFilter, setSettlementFilter] = useState("");
  useEffect(() => { const timer = window.setInterval(() => setToday(todayISO()), 60000); return () => window.clearInterval(timer); }, []);
  const enrollmentPending = useRef(new Set<string>());
  useEffect(() => {
    if (loading || !can("employees", "edit")) return;
    for (const employee of employees) {
      if (!isInExperience(employee, today) || employee.registrationData?.processStartedAt || employee.registrationData?.experienceConfirmedAt || enrollmentPending.current.has(employee.id)) continue;
      enrollmentPending.current.add(employee.id);
      void data.upsertEmployee({ ...employee, registrationData: { ...employee.registrationData, processStartedAt: processEntryDate(employee, true), experienceAlertDays: employee.registrationData?.experienceAlertDays || "7" }, updatedAt: new Date().toISOString() })
        .catch(() => { enrollmentPending.current.delete(employee.id); setNoteMessage("Não foi possível registrar o acompanhamento da experiência. Tente novamente ao reabrir a tela."); });
    }
  }, [employees, loading, can, today, data]);
  const archiving = useRef(false);
  const [archiveError, setArchiveError] = useState("");
  const [archiveRetry, setArchiveRetry] = useState(0);
  useEffect(() => {
    if (loading || !can("employees", "edit") || archiving.current) return;
    const archived = new Set(data.employeeProcessHistory.map((item) => item.id));
    const pending = employees.filter((employee) => processCompletion(employee, today) && !archived.has(historyId(employee)));
    if (!pending.length) return;
    archiving.current = true;
    void (async () => {
      try { for (const employee of pending) await archiveEmployeeProcess(employee); setArchiveError(""); }
      catch { setArchiveError("Não foi possível arquivar todos os processos. Tente novamente; os dados de origem foram preservados."); }
      finally { archiving.current = false; }
    })();
  }, [employees, data.employeeProcessHistory, loading, can, today, archiveRetry]);
  const processes = useMemo(() => employees.flatMap((employee) => {
    const registration = employee.registrationData || {};
    const start = registration.noticeStartDate || "";
    const noticeEnd = registration.noticeEndDate || registration.noticeDate || "";
    const end = registration.scheduledDeactivationDate || registration.deactivationEffectiveDate || noticeEnd;
    const experience = needsExperienceFollowup(employee, today);
    const savedMode = registration.terminationMode as TerminationMode | undefined;
    const hasNotice = Boolean(start || noticeEnd || registration.noticeScheduledAt);
    if (!experience && !hasNotice && !end && !registration.deactivationScheduledAt && !registration.deactivationCompletedDate) return [];
    const settlementPending = Boolean(registration.terminationSettlementDueDate) && registration.terminationSettlementPaid !== "true";
    const completed = employee.status === "terminated" || Boolean(end && end <= today);
    if (completed) return [];
    return [{
      employee,
      start,
      enteredAt: processEntryDate(employee, experience),
      end,
      experience,
      modality: savedMode && terminationModes[savedMode] ? terminationModes[savedMode] : hasNotice ? "Aviso prévio" : experience && !end ? "Contrato de experiência" : "Desativação rápida",
      status: "Em andamento",
      company: companies.find((company) => company.id === employee.companyId)?.name || "—",
      observation: hasNotice ? (start && start > today ? "Aguardando início do aviso prévio." : "Aviso prévio em andamento.") : "Aguardando a data agendada para desativação.",
    }];
  }).sort((a, b) => a.employee.name.localeCompare(b.employee.name, "pt-BR")), [employees, companies, today]);
  const selected = processes.find((process) => process.employee.id === selectedId);
  async function saveNotes(employee: Employee) {
    if (!can("employees", "edit") || savingNotes || drafts[employee.id] === undefined) return;
    const current = data.employees.find((item) => item.id === employee.id);
    if (!current || current.registrationData?.dismissalApprovedAt) return;
    const value = drafts[employee.id];
    setSavingNotes(employee.id); setNoteMessage("");
    try {
      await data.upsertEmployee({ ...current, registrationData: { ...current.registrationData, processNotes: value, processStartedAt: processEntryDate(current, isInExperience(current, today)) }, updatedAt: new Date().toISOString() });
      setDrafts((previous) => { const next = { ...previous }; if (next[employee.id] === value) delete next[employee.id]; return next; });
      setNoteMessage("Observações salvas.");
    } catch { setNoteMessage("Não foi possível salvar. O texto foi preservado para tentar novamente."); }
    finally { setSavingNotes(null); }
  }

  async function handleModelDocumentUpload(event: React.ChangeEvent<HTMLInputElement>, modelModality: string) {
    if (!event.target.files?.length || modelUploading || !can("employees", "edit")) return;
    setModelUploading(true);
    const files = Array.from(event.target.files);
    event.target.value = "";
    try {
      const now = new Date().toISOString();
      const folder = `Modelos utilizados / ${modelModality}`;
      await Promise.all(files.map(async (file) => {
        const fileUrl = await uploadEmployeeDocumentFile("modelos-utilizados", file);
        await data.upsertEmployeeDocument({
          id: `modelos-utilizados-${crypto.randomUUID()}`,
          companyId: "",
          groupId: "",
          departmentId: "",
          sectorId: "",
          subsectorId: "",
          employeeId: "",
          name: file.name,
          kind: "file",
          folderPath: folder,
          fileUrl,
          size: `${Math.max(1, Math.round(file.size / 1024))} KB`,
          expirationDate: "",
          active: true,
          createdAt: now,
          updatedAt: now,
        });
      }));
      setAttachmentError("");
    } catch {
      setAttachmentError("Não foi possível anexar os modelos utilizados. Tente novamente.");
    } finally { setModelUploading(false); }
  }
  function notesEditor(employee: Employee) {
    const saved = employee.registrationData?.processNotes || "";
    const value = drafts[employee.id] ?? saved;
    const editable = can("employees", "edit") && !employee.registrationData?.dismissalApprovedAt;
    return <div className="process-notes" onDoubleClick={(event) => event.stopPropagation()}>
      <textarea aria-label={`Observações de ${employee.name}`} placeholder="Escreva as observações do processo..." value={value} readOnly={!editable} onChange={(event) => setDrafts((previous) => ({ ...previous, [employee.id]: event.target.value }))} rows={3} />
      {editable && value !== saved && <button className="btn btn-secondary" type="button" disabled={Boolean(savingNotes)} onClick={() => void saveNotes(employee)}>{savingNotes === employee.id ? "Salvando..." : "Salvar observações"}</button>}
    </div>;
  }
  const filtered = useMemo(() => processes.filter((process) => (!modality || process.modality === modality)
    && (!status || process.status === status)
    && (!experienceFilter || (process.experience && (
      experienceFilter === "today"
        ? experienceEndingToday(process.employee, today)
        : experienceAlerts(process.employee, today).some((alert) => !alert.acknowledged && (experienceFilter === "overdue" ? alert.remaining < 0 : alert.remaining >= 0 && alert.remaining <= 7))
    )))
    && (!settlementFilter || (() => {
      const fields = process.employee.registrationData || {};
      const due = fields.terminationSettlementDueDate || "";
      const remaining = due ? Math.round((Date.parse(`${due}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000) : Number.NaN;
      if (!["indemnified", "employee", "employer", "without_cause", "resignation"].includes(fields.terminationMode || "") || fields.terminationSettlementPaid === "true" || !due) return false;
      return settlementFilter === "all" || (settlementFilter === "today" && remaining === 0) || (settlementFilter === "upcoming" && remaining >= 1 && remaining <= 3) || (settlementFilter === "overdue" && remaining < 0);
    })())
    && normalize(`${process.employee.name} ${process.employee.cpf} ${process.employee.registration} ${process.company}`).includes(normalize(search.trim()))), [processes, modality, status, search, experienceFilter, settlementFilter, today]);
  const modelDocuments = employeeDocuments.filter((document) => !document.employeeId && document.active !== false && document.folderPath.startsWith("Modelos utilizados /"));
  function openEmployeeRecordFolder(employee: Employee) {
    const url = new URL(securePath("records"), window.location.origin);
    url.searchParams.set("employeeId", employee.id);
    window.open(url.toString(), "_blank");
  }
  const totalPages = Math.max(1, Math.ceil(filtered.length / 10));
  const currentPage = Math.min(page, totalPages);
  const pageOffset = (currentPage - 1) * 10;
  const visibleProcesses = filtered.slice(pageOffset, pageOffset + 10);
  // Keep the stored page valid when a realtime update removes the last page.
  if (page !== currentPage) setPage(currentPage);
  const summaries = [
    { label: "Total de processos", count: processes.length, tone: "blue" },
    { label: "Em andamento", count: processes.filter((p) => p.status === "Em andamento").length, tone: "blue" },
    { label: "Histórico", count: data.employeeProcessHistory.length, tone: "green" },
    { label: "Vencendo hoje", count: employees.filter((employee) => experienceEndingToday(employee, today)).length, tone: "yellow" },
  ];
  return (
    <section className="employee-processes">
      <header>
        <div className="muted"><Link to={securePath("employees")}>Funcionários</Link> / Processo de Funcionário</div>
        <h1 className="page-title">Processo de Funcionário</h1>
        <p className="muted">Acompanhe os funcionários em aviso prévio e os processos de desativação.</p>
      </header>
      <div className="employee-process-summary">
        {summaries.map((summary) => <article key={summary.label} className="employee-process-card"><span><i className={summary.tone} />{summary.label}</span><strong>{loading ? "—" : summary.count}</strong></article>)}
      </div>
      <p className="muted">Admissões recentes entram automaticamente no acompanhamento de 60 dias. Confira o tipo de desligamento e o prazo do contrato. Os marcos de 30 e 60 dias são lembretes, não renovações nem garantia de isenção de multa.</p>
      {noteMessage && <p role="status">{noteMessage}</p>}
      {attachmentError && <p role="alert">{attachmentError}</p>}
      <div className="employee-process-list">
        <div className="employee-process-header-actions">
          <button type="button" className="btn btn-secondary" onClick={() => { setSelectedId(null); setModelDocsOpen(true); }}>Modelos utilizados</button>
        </div>
        <div className="employee-process-filters">
          <input aria-label="Pesquisar funcionário, CPF, matrícula ou empresa" placeholder="Pesquisar funcionário, CPF ou empresa..." value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} />
          <select aria-label="Tipo de desligamento" value={modality} onChange={(event) => { setModality(event.target.value); setPage(1); }}><option value="">Todos os tipos de desligamento</option><option>Aviso prévio</option><option>Contrato de experiência</option>{Array.from(new Set(Object.values(terminationModes).filter((label) => label !== "Desativação rápida"))).map((label) => <option key={label}>{label}</option>)}</select>
          <select aria-label="Status do processo" value={status} onChange={(event) => { setStatus(event.target.value); setPage(1); }}><option value="">Todos os status</option><option>Em andamento</option></select>
          <button type="button" className="btn btn-secondary" onClick={() => { setSearch(""); setModality(""); setStatus(""); setExperienceFilter(""); setSettlementFilter(""); setPage(1); }}><RotateCcw size={14} /> Limpar filtros</button>
        </div>
        <div className="experience-filter-tabs" role="group" aria-label="Filtrar alertas de experiência">
          <strong>Alertas de experiência</strong>
          {[{ value: "today", label: "Término de experiência hoje" }, { value: "upcoming", label: "Vence em até 7 dias" }].map((filter) => <button key={filter.value} type="button" className={`btn btn-secondary${experienceFilter === filter.value ? " is-selected" : ""}`} aria-pressed={experienceFilter === filter.value} onClick={() => { setExperienceFilter((current) => current === filter.value ? "" : filter.value); setPage(1); }}>{filter.label}</button>)}
        </div>
        <div className="experience-filter-tabs" role="group" aria-label="Filtrar alertas de aviso prévio do empregado e indenizado">
          <strong>Alertas de aviso prévio (empregado e indenizado)</strong>
          {[{ value: "today", label: "Vencimento hoje" }, { value: "upcoming", label: "Vence em 3 dias" }, { value: "overdue", label: "Vencidos" }].map((filter) => <button key={filter.value} type="button" className={`btn btn-secondary${settlementFilter === filter.value ? " is-selected" : ""}`} aria-pressed={settlementFilter === filter.value} onClick={() => { setSettlementFilter((current) => current === filter.value ? "" : filter.value); setPage(1); }}>{filter.label}</button>)}
        </div>
        <div className="employee-process-table-wrap" tabIndex={0} role="region" aria-label="Processos de funcionários; role horizontalmente para visualizar todas as colunas">
          <table className="data-table">
            <thead><tr><th>Funcionário</th><th>Empresa</th><th>Tipo de desligamento</th><th>Status</th><th>Inicio do processo</th><th>Desativação</th><th>Alerta / Continuidade</th><th>Detalhe do desligamento</th><th>Observações</th></tr></thead>
            <tbody>
              {!loading && visibleProcesses.map((process) => <tr key={process.employee.id} onDoubleClick={(event) => { if (!(event.target as HTMLElement).closest("button, textarea, input, select, a")) { event.stopPropagation(); setSelectedId(process.employee.id); } }}>
                <td><div className="employee-process-person"><span className="employee-process-avatar">{process.employee.name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join("")}</span><div><button type="button" className="process-open-button" onClick={() => setSelectedId(process.employee.id)}>{process.employee.name}</button><small className="muted">{process.employee.cpf || "CPF não informado"}</small></div></div></td>
                <td>{process.company}</td><td><span className={`badge ${process.modality === "Contrato de experiência" ? "badge-experience" : process.modality === "Aviso prévio" ? "badge-warning" : "badge-danger"}`}>{process.modality}</span></td>
                <td><span className={`badge ${process.status === "Concluído" ? "badge-success" : "badge-info"}`}>{process.status}</span></td>
                <td>{process.enteredAt ? formatDate(process.enteredAt.slice(0, 10)) : "—"}</td><td>{process.end ? formatDate(process.end) : "—"}</td><td className="experience-action-cell">{process.experience ? <ExperienceTracking key={`${process.employee.id}-${process.employee.registrationData?.experienceAlertDays || 7}`} employee={process.employee} today={today} compact /> : <TerminationSettlementAlert employee={process.employee} today={today} />}</td><td>{[process.employee.registrationData?.dismissalVariant, process.employee.registrationData?.dismissalInitiative].filter(Boolean).join(" · ") || process.employee.registrationData?.dismissalType || "—"}</td><td>{notesEditor(process.employee)}</td>
              </tr>)}
              {(loading || !filtered.length) && <tr><td colSpan={9} className="employee-process-empty"><CalendarClock size={28} /><p>{loading ? "Carregando processos..." : processes.length ? "Nenhum processo corresponde aos filtros selecionados." : "Nenhum funcionário com aviso prévio ou desativação registrada."}</p></td></tr>}
            </tbody>
          </table>
        </div>
        <footer aria-live="polite">
          {loading ? <span className="muted">Carregando...</span> : filtered.length ? <EmployeesPagination totalItems={filtered.length} pageStart={pageOffset + 1} pageEnd={Math.min(pageOffset + 10, filtered.length)} currentPage={currentPage} totalPages={totalPages} onPageChange={setPage} /> : <span className="muted">Nenhum processo para exibir.</span>}
        </footer>
      </div>
      {archiveError && <p role="alert">{archiveError} <button type="button" className="btn btn-secondary" onClick={() => setArchiveRetry((value) => value + 1)}>Tentar novamente</button></p>}
      <ProcessHistoryCard />
      {modelDocsOpen && <ProcessModelsModal documents={modelDocuments} busy={modelUploading} editable={can("employees", "edit")} error={attachmentError} onClose={() => setModelDocsOpen(false)} onUpload={(event, modality) => void handleModelDocumentUpload(event, modality)} onOpen={(document) => void openEmployeeDocumentFile(document.fileUrl, document.name).catch(() => setAttachmentError("Falha ao abrir o modelo."))} />}

      {selected && <ProcessDrawer name={selected.employee.name} onClose={() => setSelectedId(null)}>
        <dl className="process-details-grid">
          {[["Empresa", selected.company], ["CPF", selected.employee.cpf], ["Tipo de desligamento", selected.modality], ["Status", selected.status], ["Inicio do processo", selected.enteredAt ? formatDate(selected.enteredAt.slice(0, 10)) : "Não registrado"], ["Admissão", formatDate(selected.employee.admissionDate)], ["Último dia do aviso", formatDate(selected.employee.registrationData?.noticeEndDate || selected.employee.registrationData?.noticeProjectionEndDate || "")], ["Data-base da rescisão", formatDate(selected.employee.registrationData?.terminationSettlementCalculationDate || "")], ["Total de dias de aviso", selected.employee.registrationData?.noticeTotalDays || "—"], ["Fim da projeção do aviso", formatDate(selected.employee.registrationData?.noticeProjectionEndDate || "")], ["Inicio do aviso", selected.start ? formatDate(selected.start) : "-"], ["Desativação", selected.end ? formatDate(selected.end) : "-"]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "-"}</dd></div>)}
        </dl>
        {selected.experience && <section><h3>Acompanhamento da experiência</h3><ExperienceTracking key={`${selected.employee.id}-${selected.employee.registrationData?.experienceAlertDays || 7}`} employee={selected.employee} today={today} /></section>}
        {selected.employee.registrationData?.noticeReduction && <section><h3>Redução do aviso</h3><p>{selected.employee.registrationData.noticeReduction === "hours" ? "2 horas diárias" : "7 dias corridos finais"}</p>{selected.employee.registrationData.noticeLeaveStartDate && <p>Dispensa: {formatDate(selected.employee.registrationData.noticeLeaveStartDate)} a {formatDate(selected.employee.registrationData.noticeLeaveEndDate || "")}</p>}</section>}
        <ProcessModalityEditor key={selected.employee.id} employee={selected.employee} />
        <section><h3>Observações</h3>{notesEditor(selected.employee)}</section>
        <section>
          <h3>Anexar Documento</h3>
          <button type="button" className="btn btn-primary" onClick={() => openEmployeeRecordFolder(selected.employee)}>
            Anexar Documento
          </button>
        </section>
        {noteMessage && <p role="status">{noteMessage}</p>}
        {attachmentError && <p role="alert">{attachmentError}</p>}
      </ProcessDrawer>}
    </section>
  );
}












