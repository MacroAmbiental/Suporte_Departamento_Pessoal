import NoticeReductionFields from "./NoticeReductionFields";
import { noticeSpecialty, validNoticeReduction } from "../noticeSpecialty";
import TerminationExitFields from "./TerminationExitFields";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  X,
  Save,
  CalendarClock,
  Zap,
  FileText,
  UserRound,
  ShieldAlert,
  CalendarDays,
  AlertTriangle,
  PauseCircle,
  Upload,
  Trash2,
} from "lucide-react";
import type { Employee, EmployeeDocument } from "@/types/domain";
import { useAuth } from "@/hooks/useAuth";
import { useDomainData } from "@/hooks/useDomainData";
import { todayISO, formatDate } from "@/utils/format";
import { addDays, experienceMilestones, needsExperienceFollowup, terminationModes, type TerminationMode } from "../experience";
import { isEmployeeSuspendedOnDate, SUSPENSION_MAX_DOCUMENTS, suspensionDays } from "../suspension";
import { uploadEmployeeDocumentFile } from "@/services/documentStorage";

import "./scheduleDeactivation.css";
import { processEntryDate } from "../processEntryDate";
import { isInExperience } from "../experience";

const modeDetails = {
  indemnified: { icon: FileText, description: "Defina a saída efetiva com aviso indenizado." },
  employee: { icon: UserRound, description: "Informe o início do aviso e a data de saída." },
  quick: { icon: Zap, description: "Desative hoje, após confirmar a ação." },
  suspension: { icon: PauseCircle, description: "Afaste o funcionário por um período determinado, sem encerrar o vínculo." },
} as const;

const dismissalTypeOptions = [
  "Demissão sem justa causa",
  "Rescisão indireta",
  "Demissão por justa causa",
  "Pedido de demissão",
  "Demissão consensual",
] as const;

type DeactivationMode = TerminationMode | "suspension";

function normalizeCoordinatorRole(value: string) {
  return value.trim().toLocaleLowerCase("pt-BR");
}

function formatFileSize(size: number) {
  if (!size) return "0 KB";
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function documentKindForFile(file: File) {
  return file.type === "application/pdf" ? "pdf" : "file";
}

export default function ScheduleDeactivationModal({ employee, initialQuickDismissal, onClose }: { employee: Employee; initialQuickDismissal?: "quick" | "warning"; onClose: () => void }) {
  const data = useDomainData();
  const { can, user } = useAuth();
  const today = todayISO();
  const experienceProcessActive = needsExperienceFollowup(employee, today);
  const experienceEndDate = useMemo(
    () => experienceProcessActive ? experienceMilestones(employee).find((item) => item.days === 60)?.date || "" : "",
    [employee.admissionDate, experienceProcessActive],
  );
  const [applyReduction, setApplyReduction] = useState(employee.registrationData?.noticeReductionApplies === "true" || employee.registrationData?.terminationMode === "employer");
  const [reduction, setReduction] = useState(employee.registrationData?.noticeReduction || "");
  const [cltModeUnlocked, setCltModeUnlocked] = useState(false);
  const [mode, setMode] = useState<DeactivationMode | "">(initialQuickDismissal && experienceProcessActive ? "quick" : "");
  const [date, setDate] = useState(employee.registrationData?.scheduledDeactivationDate || today);
  const [start, setStart] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [riskConfirmed, setRiskConfirmed] = useState(false);
  const [workedOnDate, setWorkedOnDate] = useState(employee.registrationData?.terminationWorkedOnDeactivationDate || "false");
  const [cltConfirmationOpen, setCltConfirmationOpen] = useState(false);
  const [candidateDate, setCandidateDate] = useState("");
  const [suspensionStartDate, setSuspensionStartDate] = useState(employee.registrationData?.suspensionStartDate || today);
  const [suspensionEndDate, setSuspensionEndDate] = useState(employee.registrationData?.suspensionEndDate || today);
  const [suspensionReason, setSuspensionReason] = useState(employee.registrationData?.suspensionReason || "");
  const [suspensionCoordinatorId, setSuspensionCoordinatorId] = useState(employee.registrationData?.suspensionCoordinatorEmployeeId || "");
  const [suspensionDocuments, setSuspensionDocuments] = useState<File[]>([]);
  const [dismissalType, setDismissalType] = useState(employee.registrationData?.dismissalType || "");
  const [dismissalNotes, setDismissalNotes] = useState(employee.registrationData?.dismissalDescription || "");
  const [dismissalDocuments, setDismissalDocuments] = useState<File[]>([]);
  const promptedDateRef = useRef("");
  const settlementPaid = employee.registrationData?.terminationSettlementPaid === "true" ? "true" : "false";
  const cltModesLockedDuringExperience = Boolean(initialQuickDismissal && experienceProcessActive) && !cltModeUnlocked;
  const quickModeLocked = cltModeUnlocked;
  const effectiveDate = date;
  const needsConfirmation = mode === "quick";

  const coordinatorOptions = useMemo(() => {
    const coordinatorIds = new Set(
      (data.sectors || [])
        .map((sector) => sector.coordinatorEmployeeId)
        .filter(Boolean),
    );
    const activeEmployees = data.employees.filter((item) => item.status === "active" && item.id !== employee.id);
    return activeEmployees.filter((item) => {
      const role = normalizeCoordinatorRole(String(item.role || item.position || ""));
      return role.includes("coordenador") || coordinatorIds.has(item.id);
    });
  }, [data.employees, data.sectors, employee.id]);


  useEffect(() => {
    if (!experienceProcessActive || !initialQuickDismissal || cltModeUnlocked || !experienceEndDate || date <= experienceEndDate) return;
    if (promptedDateRef.current === date) return;
    promptedDateRef.current = date;
    setCandidateDate(date);
    setCltConfirmationOpen(true);
  }, [date, experienceEndDate, initialQuickDismissal, cltModeUnlocked, experienceProcessActive]);

  function selectDate(nextDate: string) {
    if (!nextDate || nextDate < employee.admissionDate) return;
    if (mode === "quick" && nextDate > today) return;
    if (experienceProcessActive && !cltModeUnlocked && experienceEndDate && nextDate > experienceEndDate) {
      setCandidateDate(nextDate);
      setCltConfirmationOpen(true);
      return;
    }
    setDate(nextDate);
    setRiskConfirmed(false);
    setError("");
  }

  function handleNativeDateChange(nextDate: string) {
    if (!nextDate) return;
    selectDate(nextDate);
  }

  function confirmAfterExperience() {
    if (!candidateDate) return;
    setDate(candidateDate);
    setCltModeUnlocked(true);
    setMode("");
    setRiskConfirmed(false);
    setCltConfirmationOpen(false);
    setError("");
  }

  function cancelAfterExperience() {
    setCltConfirmationOpen(false);
    setCandidateDate("");
  }

  function handleSuspensionFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(event.target.files || []);
    if (!incoming.length) return;
    const available = Math.max(0, SUSPENSION_MAX_DOCUMENTS - suspensionDocuments.length);
    const selected = incoming.slice(0, available).filter((file) => file.type === "application/pdf" || file.type.startsWith("image/"));
    if (selected.length < incoming.slice(0, available).length) setError("A suspensão aceita apenas arquivos PDF ou imagens.");
    if (incoming.length > available) setError(`É permitido anexar no máximo ${SUSPENSION_MAX_DOCUMENTS} documentos na suspensão.`);
    setSuspensionDocuments((current) => [...current, ...selected]);
    event.target.value = "";
  }

  function handleDismissalFiles(event: React.ChangeEvent<HTMLInputElement>) {
    const incoming = Array.from(event.target.files || []);
    if (!incoming.length) return;
    setDismissalDocuments((current) => [...current, ...incoming]);
    event.target.value = "";
  }

  const selectedCoordinator = coordinatorOptions.find((item) => item.id === suspensionCoordinatorId);
  const suspensionDuration = suspensionDays(suspensionStartDate, suspensionEndDate);
  const selectedDateBeforeEnd = experienceProcessActive && Boolean(experienceEndDate && date < experienceEndDate);
  const selectedDateAtEnd = experienceProcessActive && Boolean(experienceEndDate && date === experienceEndDate);
  const selectedDateAfterEnd = experienceProcessActive && Boolean(experienceEndDate && date > experienceEndDate);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving || !can("employees", "edit")) return;
    const current = data.employees.find((item) => item.id === employee.id);
    if (!current || current.registrationData?.dismissalApprovedAt || current.status === "terminated") { setError("O cadastro foi alterado. Feche e abra novamente o agendamento."); return; }

    if (mode === "suspension") {
      if (!suspensionStartDate || !suspensionEndDate || suspensionEndDate < suspensionStartDate) { setError("Informe um período válido para a suspensão."); return; }
      if (suspensionStartDate < current.admissionDate) { setError("A suspensão não pode começar antes da admissão."); return; }
      if (!suspensionReason.trim()) { setError("Informe o motivo da suspensão."); return; }
      if (!suspensionCoordinatorId) { setError("Selecione o coordenador responsável."); return; }

      setSaving(true); setError("");
      try {
        const now = new Date().toISOString();
        const uploadedDocuments: EmployeeDocument[] = [];
        const company = data.companies.find((item) => item.id === current.companyId);
        const department = data.departments.find((item) => item.id === current.departmentId);
        const sector = data.sectors.find((item) => item.id === current.sectorId);
        const subsector = data.subsectors.find((item) => item.id === current.subsectorId);
        const folderPath = [company?.name, department?.name, sector?.name, subsector?.name, current.name, "Suspensões"].filter(Boolean).join(" / ");

        for (const file of suspensionDocuments) {
          const fileUrl = await uploadEmployeeDocumentFile(current.id, file);
          const savedDocument = await data.upsertEmployeeDocument({
            companyId: current.companyId,
            groupId: current.groupId || "",
            departmentId: current.departmentId,
            sectorId: current.sectorId,
            subsectorId: current.subsectorId || "",
            employeeId: current.id,
            name: `Suspensão - ${file.name}`,
            kind: documentKindForFile(file),
            folderPath,
            fileUrl,
            size: formatFileSize(file.size),
            realizedDate: "",
            expirationDate: "",
            active: true,
            createdAt: now,
            attachmentDate: now,
            updatedAt: now,
          });
          uploadedDocuments.push(savedDocument);
        }

        const nextFields = {
          ...(current.registrationData || {}),
          suspensionStartDate,
          suspensionEndDate,
          suspensionReason: suspensionReason.trim(),
          suspensionCoordinatorEmployeeId: suspensionCoordinatorId,
          suspensionCoordinatorName: selectedCoordinator?.name || "",
          suspensionScheduledAt: now,
          suspensionScheduledBy: user?.id || "",
          suspensionDocumentIds: JSON.stringify(uploadedDocuments.map((item) => item.id)),
          suspensionDocumentNames: JSON.stringify(uploadedDocuments.map((item) => item.name)),
          suspensionStatus: suspensionStartDate <= today && today <= suspensionEndDate ? "active" : "scheduled",
        };

        await data.upsertEmployee({
          ...current,
          status: current.status,
          registrationData: nextFields,
          updatedAt: now,
        });
        onClose();
      } catch {
        setError("Não foi possível salvar a suspensão. Verifique os documentos e tente novamente.");
      } finally {
        setSaving(false);
      }
      return;
    }

    const requiresDismissalDetails = ["employee", "indemnified", "quick"].includes(mode);
    if (!mode || !effectiveDate || !workedOnDate || (needsConfirmation && !riskConfirmed)) return;
    if (requiresDismissalDetails && !dismissalType) { setError("Selecione o tipo de demissão."); return; }
    if (effectiveDate < employee.admissionDate || (mode === "quick" && effectiveDate > today) || (["employee", "employer", "indemnified"].includes(mode) && (!start || start < employee.admissionDate || date < start))) { setError("Confira as datas: a saída não pode anteceder a admissão e a desativação rápida não pode ser futura."); return; }
    if (!validNoticeReduction(mode, reduction, start, date)) { setError("Selecione a redução e confira se os sete dias cabem no período do aviso."); return; }
    setSaving(true); setError("");
    try {
      const now = new Date().toISOString();

      let uploadedDismissalDocumentIds: string[] = [];
      let uploadedDismissalDocumentNames: string[] = [];

      if (requiresDismissalDetails && dismissalDocuments.length) {
        const company = data.companies.find((item) => item.id === current.companyId);
        const department = data.departments.find((item) => item.id === current.departmentId);
        const sector = data.sectors.find((item) => item.id === current.sectorId);
        const subsector = data.subsectors.find((item) => item.id === current.subsectorId);
        const folderPath = [company?.name, department?.name, sector?.name, subsector?.name, current.name, "Documentos de demissão"].filter(Boolean).join(" / ");

        for (const file of dismissalDocuments) {
          const fileUrl = await uploadEmployeeDocumentFile(current.id, file);
          const savedDocument = await data.upsertEmployeeDocument({
            companyId: current.companyId,
            groupId: current.groupId || "",
            departmentId: current.departmentId,
            sectorId: current.sectorId,
            subsectorId: current.subsectorId || "",
            employeeId: current.id,
            name: `Demissão - ${file.name}`,
            kind: documentKindForFile(file),
            folderPath,
            fileUrl,
            size: formatFileSize(file.size),
            realizedDate: "",
            expirationDate: "",
            active: true,
            createdAt: now,
            attachmentDate: now,
            updatedAt: now,
          });
          uploadedDismissalDocumentIds.push(savedDocument.id);
          uploadedDismissalDocumentNames.push(savedDocument.name);
        }
      }

      let previousDismissalCreatedIds: string[] = [];
      let previousDismissalSelectedIds: string[] = [];
      try {
        const saved = JSON.parse(current.registrationData?.dismissalCreatedDocumentIds || "[]") as string[];
        previousDismissalCreatedIds = Array.isArray(saved) ? saved.filter(Boolean) : [];
      } catch {
        previousDismissalCreatedIds = [];
      }
      try {
        const saved = JSON.parse(current.registrationData?.dismissalSelectedDocumentIds || "[]") as string[];
        previousDismissalSelectedIds = Array.isArray(saved) ? saved.filter(Boolean) : [];
      } catch {
        previousDismissalSelectedIds = [];
      }

      const nextDismissalCreatedIds = Array.from(new Set([...previousDismissalCreatedIds, ...uploadedDismissalDocumentIds]));
      const nextDismissalSelectedIds = Array.from(new Set([...previousDismissalSelectedIds, ...uploadedDismissalDocumentIds]));

      await data.upsertEmployee({ ...current, status: effectiveDate <= today ? "terminated" : current.status, registrationData: { ...current.registrationData, processStartedAt: processEntryDate(current, isInExperience(current, today)) || now, terminationMode: mode, terminationRiskConfirmedAt: needsConfirmation && riskConfirmed ? now : "", terminationRiskConfirmedBy: needsConfirmation && riskConfirmed ? user?.id || "" : "", terminationWorkedOnDeactivationDate: workedOnDate, terminationSettlementDueDate: addDays(effectiveDate, 10), terminationSettlementPaid: settlementPaid, terminationSettlementPaidAt: settlementPaid === "true" ? now : "", terminationSettlementPaidBy: settlementPaid === "true" ? user?.id || "" : "", scheduledDeactivationDate: effectiveDate, deactivationEffectiveDate: effectiveDate, deactivationScheduledAt: now, deactivationCompletedDate: effectiveDate <= today ? today : "", noticeEndDate: mode === "employee" ? date : "", noticeDate: mode === "employee" ? date : "", noticeScheduledAt: mode === "employee" ? now : "", noticeCompletedDate: "", ...noticeSpecialty(mode, reduction, start, date), noticeReductionApplies: mode === "employee" && applyReduction ? "true" : "false", dismissalType: requiresDismissalDetails ? dismissalType : "", dismissalDescription: requiresDismissalDetails ? dismissalNotes.trim() : "", dismissalCreatedDocumentIds: JSON.stringify(nextDismissalCreatedIds), dismissalSelectedDocumentIds: JSON.stringify(nextDismissalSelectedIds), dismissalCreatedDocumentNames: JSON.stringify(Array.from(new Set(uploadedDismissalDocumentNames))), scheduledReactivationDate: "", reactivationEffectiveDate: "", reactivationScheduledAt: "", reactivationCompletedDate: "" }, updatedAt: now });
      onClose();
    } catch { setError("Não foi possível concluir o agendamento. Os anexos já salvos foram preservados; tente novamente."); }
    finally { setSaving(false); }
  }

  const optionEntries: Array<[DeactivationMode, string]> = [
    ...(Object.entries(terminationModes) as Array<[TerminationMode, string]>),
    ["suspension", "Suspensão"],
  ];

  const isSuspension = mode === "suspension";
  const requiresDismissalDetails = mode === "employee" || mode === "indemnified" || mode === "quick";

  return <div className="modal-backdrop deactivation-backdrop">
    <form className="modal-panel deactivation-modal" role="dialog" aria-modal="true" aria-labelledby="schedule-deactivation-title" onSubmit={save}>
      <div className="modal-header"><span className="deactivation-heading-icon"><CalendarClock size={24} /></span><div><h2 id="schedule-deactivation-title">{isSuspension ? "Registrar suspensão do Funcionário" : "Agendar desligamento do Funcionário"}</h2><p>{employee.name}</p><small>{isSuspension ? "Defina o período, o motivo e os responsáveis pelo afastamento." : "Escolha como deseja encerrar o vínculo."}</small></div><button type="button" className="icon-button" disabled={saving} onClick={onClose} aria-label="Fechar"><X size={18} /></button></div>
      <fieldset disabled={saving} className="deactivation-body">
        <div>
          <h3 className="deactivation-section-title">Modalidade de desativação</h3>
          <div className="deactivation-options" role="radiogroup" aria-label="Modalidade de desativação">
            {optionEntries.map(([value, label]) => {
              const detail = modeDetails[value];
              const Icon = detail.icon;
              const locked = value === "quick" ? quickModeLocked : value === "suspension" ? false : cltModesLockedDuringExperience;
              return <label key={value} className={`deactivation-option${mode === value ? " is-selected" : ""}${value === "quick" ? " is-quick" : ""}${value === "suspension" ? " is-suspension" : ""}${locked ? " is-locked" : ""}`} aria-disabled={locked}>
                <input type="radio" name="termination-mode" value={value} checked={mode === value} required disabled={locked} onChange={() => { if (locked) return; setMode(value); setRiskConfirmed(false); setError(""); }} />
                <Icon size={21} /><span><strong>{label}</strong><small>{detail.description}</small>{locked && value === "quick" && cltModeUnlocked && <small className="deactivation-option-lock-note">Bloqueado para desligamentos após a experiência.</small>}</span>
              </label>;
            })}
          </div>
        </div>

        {isSuspension ? (
          <>
            <div className="suspension-period-card">
              <div className="deactivation-date-heading"><div><h3 className="deactivation-section-title">Período da suspensão</h3><p className="muted">Informe a data de início e a data de término do afastamento.</p></div><CalendarDays size={22} /></div>
              <div className="suspension-period-grid">
                <label className="field"><span>Início da suspensão</span><input type="date" required min={employee.admissionDate} value={suspensionStartDate} onChange={(event) => setSuspensionStartDate(event.target.value)} /></label>
                <label className="field"><span>Fim da suspensão</span><input type="date" required min={suspensionStartDate || employee.admissionDate} value={suspensionEndDate} onChange={(event) => setSuspensionEndDate(event.target.value)} /></label>
              </div>
              {suspensionDuration > 0 && <p className="suspension-period-summary">Período selecionado: <strong>{suspensionDuration} {suspensionDuration === 1 ? "dia" : "dias"}</strong>.</p>}
              {isEmployeeSuspendedOnDate(employee, suspensionStartDate) && <div className="deactivation-date-alert is-warning"><AlertTriangle size={18} /><div><strong>Já existe uma suspensão neste período</strong><p>Ajuste as datas para não sobrepor uma suspensão já cadastrada.</p></div></div>}
            </div>

            <div className="suspension-form-grid">
              <label className="field is-wide-field"><span>Motivo da suspensão</span><textarea required rows={4} maxLength={1000} placeholder="Descreva o motivo da suspensão e as orientações necessárias." value={suspensionReason} onChange={(event) => setSuspensionReason(event.target.value)} /></label>
              <label className="field"><span>Coordenador responsável</span><select required value={suspensionCoordinatorId} onChange={(event) => setSuspensionCoordinatorId(event.target.value)}><option value="">{coordinatorOptions.length ? "Selecione" : "Nenhum coordenador cadastrado"}</option>{coordinatorOptions.map((item) => <option key={item.id} value={item.id}>{item.name}{item.role || item.position ? ` — ${item.role || item.position}` : ""}</option>)}</select></label>
            </div>

            <div className="suspension-documents-card">
              <div><h3 className="deactivation-section-title">Documentos da suspensão</h3><p className="muted">Anexe até {SUSPENSION_MAX_DOCUMENTS} arquivos em PDF ou imagem.</p></div>
              <label className="suspension-upload-button"><Upload size={17} /><span>Anexar documento</span><input type="file" accept=".pdf,application/pdf,image/*" multiple disabled={suspensionDocuments.length >= SUSPENSION_MAX_DOCUMENTS} onChange={handleSuspensionFiles} /></label>
              {suspensionDocuments.length ? <div className="suspension-document-list">{suspensionDocuments.map((file, index) => <div className="suspension-document-item" key={`${file.name}-${file.lastModified}-${index}`}><FileText size={17} /><div><strong>{file.name}</strong><small>{formatFileSize(file.size)} · {file.type === "application/pdf" ? "PDF" : "Imagem"}</small></div><button type="button" className="icon-button" aria-label={`Remover ${file.name}`} onClick={() => setSuspensionDocuments((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={16} /></button></div>)}</div> : <p className="suspension-no-documents">Nenhum documento anexado.</p>}
            </div>
          </>
        ) : (
          <>
            <div className={`deactivation-date-layout${mode ? " has-side-details" : ""}`}>
              <div className="deactivation-date-section">
                <div className="deactivation-date-heading"><div><h3 className="deactivation-section-title">Data do desligamento</h3><p className="muted">Selecione a data efetiva.{experienceProcessActive ? " O marco final da experiência aparece no aviso ao lado." : ""}</p></div><CalendarDays size={22} /></div>
                <div className={`deactivation-calendar-card${experienceProcessActive ? "" : " is-inline-card"}`}>
                  <div className="deactivation-calendar-topline is-compact">
                    <label className="field deactivation-native-date"><span>Data selecionada</span><input type="date" required min={employee.admissionDate} max={mode === "quick" ? today : undefined} value={date} onChange={(event) => handleNativeDateChange(event.target.value)} /></label>
                    {experienceProcessActive && <div className="deactivation-experience-marker"><AlertTriangle size={17} /><div><strong>Fim da experiência</strong><span>{formatDate(experienceEndDate)}</span></div></div>}
                  </div>
                </div>
                {selectedDateBeforeEnd && <div className="deactivation-date-alert is-warning"><AlertTriangle size={18} /><div><strong>Antes do fim da experiência</strong><p>A rescisão antecipada de contrato por prazo determinado pode gerar indenização nos termos do art. 479 da CLT e outros efeitos rescisórios conforme a hipótese.</p></div></div>}
                {selectedDateAtEnd && <div className="deactivation-date-alert is-success"><ShieldAlert size={18} /><div><strong>Data de término da experiência</strong><p>No término regular do contrato de experiência, o MTE informa que não há aviso prévio nem multa de 40% sobre o FGTS; são devidas as verbas proporcionais cabíveis.</p></div></div>}
                {experienceProcessActive && selectedDateAfterEnd && cltModeUnlocked && <div className="deactivation-date-alert is-clt"><ShieldAlert size={18} /><div><strong>Desligamento após a experiência</strong><p>Como o vínculo continuou após o fim da experiência, o contrato passa a ser por prazo indeterminado. Siga uma das modalidades de desligamento CLT abaixo.</p></div></div>}
              </div>
              {mode && <TerminationExitFields date={effectiveDate} workedOnDate={workedOnDate} onWorkedOnDateChange={setWorkedOnDate} compact />}
            </div>

            {mode && mode !== "quick" && <label className="field">Início do aviso<input type="date" required min={employee.admissionDate} value={start} onChange={(event) => setStart(event.target.value)} /></label>}
            {mode === "employee" && <NoticeReductionFields value={reduction} onChange={setReduction} end={date} applies={applyReduction} onAppliesChange={setApplyReduction} />}
            {requiresDismissalDetails && <div className="suspension-documents-card">
              <div><h3 className="deactivation-section-title">Dados da demissão</h3><p className="muted">Informe o tipo de demissão, observações e anexe documentos comprobatórios.</p></div>
              <label className="field"><span>Tipo de demissão</span><select required value={dismissalType} onChange={(event) => setDismissalType(event.target.value)}><option value="">Selecione</option>{dismissalTypeOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
              <label className="field is-wide-field"><span>Observações da demissão</span><textarea rows={4} maxLength={2000} placeholder="Descreva o contexto da demissão, ocorrências relevantes e referências úteis." value={dismissalNotes} onChange={(event) => setDismissalNotes(event.target.value)} /></label>
              <label className="suspension-upload-button"><Upload size={17} /><span>Anexar documento</span><input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" multiple onChange={handleDismissalFiles} /></label>
              {dismissalDocuments.length ? <div className="suspension-document-list">{dismissalDocuments.map((file, index) => <div className="suspension-document-item" key={`${file.name}-${file.lastModified}-${index}`}><FileText size={17} /><div><strong>{file.name}</strong><small>{formatFileSize(file.size)}</small></div><button type="button" className="icon-button" aria-label={`Remover ${file.name}`} onClick={() => setDismissalDocuments((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={16} /></button></div>)}</div> : <p className="suspension-no-documents">Nenhum documento anexado.</p>}
            </div>}
            {mode === "quick" && <div className="deactivation-quick-summary"><ShieldAlert size={22} /><div><strong>Desativação rápida em {formatDate(effectiveDate)}</strong><p>{experienceProcessActive && initialQuickDismissal === "warning" ? "A data escolhida é anterior ao fim do contrato de experiência e pode gerar indenização pela rescisão antecipada, conforme o art. 479 da CLT." : "Ao confirmar, o funcionário ficará inativo e deixará de aparecer no controle de ponto a partir da data informada. Esta ação substitui qualquer agendamento anterior."}</p><label className="deactivation-confirmation"><input type="checkbox" checked={riskConfirmed} onChange={(event) => setRiskConfirmed(event.target.checked)} />Confirmo a desativação de {employee.name} e estou ciente dos efeitos rescisórios aplicáveis à data escolhida.</label></div></div>}
            {mode === "indemnified" && <p className="muted">O aviso indenizado não possui período trabalhado nem redução de jornada.</p>}
            {!mode && cltModeUnlocked && <div className="deactivation-clt-next-step"><strong>Experiência encerrada</strong><p>Selecione uma modalidade CLT para continuar o processo de desligamento.</p></div>}
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </fieldset>
      <div className="modal-footer"><button type="button" className="btn btn-secondary" disabled={saving} onClick={onClose}>Cancelar</button><button type="submit" className={`btn btn-primary${mode === "quick" ? " deactivation-submit-quick" : isSuspension ? " deactivation-submit-suspension" : ""}`} disabled={saving || (isSuspension ? !suspensionStartDate || !suspensionEndDate || !suspensionReason.trim() || !suspensionCoordinatorId || suspensionEndDate < suspensionStartDate : !mode || !effectiveDate || !workedOnDate || (needsConfirmation && !riskConfirmed) || (requiresDismissalDetails && !dismissalType))}><Save size={16} />{saving ? "Salvando..." : isSuspension ? "Confirmar suspensão" : mode === "quick" ? "Desativar agora" : "Confirmar agendamento"}</button></div>

      {experienceProcessActive && cltConfirmationOpen && !isSuspension && <div className="experience-clt-confirmation-backdrop">
        <div className="experience-clt-confirmation" role="dialog" aria-modal="true" aria-labelledby="experience-clt-confirmation-title">
          <div className="experience-clt-confirmation-icon"><AlertTriangle size={24} /></div>
          <h2 id="experience-clt-confirmation-title">Desligar funcionário após experiencia?</h2>
          <p>A data selecionada ({formatDate(candidateDate)}) é posterior ao fim da experiência ({formatDate(experienceEndDate)}).</p>
          <p>Como o funcionário permaneceu após o prazo, o vínculo passa a ser por prazo indeterminado e o desligamento deve seguir as regras do contrato CLT.</p>
          <div className="experience-clt-confirmation-note">Ao confirmar, a <strong>Desativação rápida</strong> será bloqueada e as demais modalidades ficarão disponíveis.</div>
          <div className="experience-clt-confirmation-actions"><button type="button" className="btn btn-secondary" onClick={cancelAfterExperience}>Não</button><button type="button" className="btn btn-primary" onClick={confirmAfterExperience}>Sim, seguir como CLT</button></div>
        </div>
      </div>}
    </form>
  </div>;
}
