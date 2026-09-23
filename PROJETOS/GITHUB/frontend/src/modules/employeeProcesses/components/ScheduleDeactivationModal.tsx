import { isContractEmployee, canUseTerminationMode, contractTerminationRestriction } from "../utils/terminationPermissions";
import "../../shared/modalScroll";
import NoticeEntitlementSummary from "./NoticeEntitlementSummary";
import { terminationDates } from "../utils/terminationDates";
import NoticeReductionFields from "./NoticeReductionFields";
import { noticeSpecialty, validNoticeReduction } from "../utils/noticeSpecialty";
import TerminationExitFields from "./TerminationExitFields";
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
import { addDays, experienceMilestones, needsExperienceFollowup, terminationModes, dismissalModeOptions, dismissalVariants, dismissalInitiatives, type TerminationMode } from "../utils/experience";
import { isEmployeeSuspendedOnDate, SUSPENSION_MAX_DOCUMENTS, suspensionDays } from "../utils/suspension";
import { uploadEmployeeDocumentFile } from "@/services/documentStorage";

import "./scheduleDeactivation.css";
import { processEntryDate } from "../utils/processEntryDate";
import { isInExperience } from "../utils/experience";
import { justCauseReasons, parseJustCauseReasons } from "../utils/justCauseReasons";
import MultiSelect from "@/common/components/MultiSelect";

const modeDetails = {
  without_cause: { icon: FileText, description: "Escolha entre aviso indenizado ou trabalhado." },
  for_cause: { icon: ShieldAlert, description: "Dispensa por justa causa." },
  resignation: { icon: UserRound, description: "Escolha como será cumprido o aviso." },
  contract_end: { icon: CalendarDays, description: "Informe se ocorreu no prazo ou antecipadamente e por iniciativa de quem." },
  abandonment: { icon: AlertTriangle, description: "Abandono de emprego." },
  quick: { icon: Zap, description: "Desligamento na experiência, conforme a data escolhida." },
  suspension: { icon: PauseCircle, description: "Afaste o funcionário sem encerrar o vínculo." },
} as const;

const experienceDismissalTypes = ["Demissão sem justa causa", "Rescisão indireta", "Demissão por justa causa", "Pedido de demissão", "Demissão consensual"] as const;

type DeactivationMode = (typeof dismissalModeOptions)[number] | "quick";
type FormMode = DeactivationMode | "suspension";

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

export default function ScheduleDeactivationModal({ employee, initialQuickDismissal, initialSuspension = false, onClose }: { employee: Employee; initialQuickDismissal?: "quick" | "warning"; initialSuspension?: boolean; onClose: () => void }) {
  const data = useDomainData();
  const { can, user } = useAuth();
  const today = todayISO();
  const contractEmployee = isContractEmployee(employee);
  const experienceProcessActive = !contractEmployee && needsExperienceFollowup(employee, today);
  const experienceEndDate = useMemo(
    () => experienceProcessActive ? experienceMilestones(employee).find((item) => item.days === 60)?.date || "" : "",
    [employee, experienceProcessActive],
  );
  const [applyReduction, setApplyReduction] = useState(employee.registrationData?.noticeReductionApplies === "true");
  const [reduction, setReduction] = useState(employee.registrationData?.noticeReduction || "");
  const [cltModeUnlocked, setCltModeUnlocked] = useState(false);
  const [mode, setMode] = useState<FormMode | "">(initialSuspension ? "suspension" : initialQuickDismissal && contractEmployee ? "contract_end" : initialQuickDismissal && experienceProcessActive ? "quick" : "");
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
  const [variant, setVariant] = useState("");
  const [initiative, setInitiative] = useState("");
  const [justCauseReasonValues, setJustCauseReasonValues] = useState(() => parseJustCauseReasons(employee.registrationData?.dismissalJustCauseReasons));
  const [dismissalNotes, setDismissalNotes] = useState(employee.registrationData?.dismissalDescription || "");
  const [experienceDismissalType, setExperienceDismissalType] = useState(employee.registrationData?.dismissalType || "");
  const [dismissalDocuments, setDismissalDocuments] = useState<File[]>([]);
  const promptedDateRef = useRef("");
  const settlementPaid = employee.registrationData?.terminationSettlementPaid === "true" ? "true" : "false";
  const cltModesLockedDuringExperience = Boolean(initialQuickDismissal && experienceProcessActive) && !cltModeUnlocked;
  const quickModeLocked = cltModeUnlocked;
  const needsConfirmation = mode === "quick";
  const { workedNotice, resignationWorked, indemnifiedNotice, effectiveDate, lastNoticeDate, calculationDate, serviceYears, additionalDays, noticeDays, indemnifiedDays, projectionEndDate: projectionEnd } = terminationDates(mode, variant, date, start, employee.admissionDate);
  const noticeMode = workedNotice ? "employee" : "quick";
  const needsVariant = mode === "without_cause" || mode === "resignation" || mode === "contract_end";

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

    if (!canUseTerminationMode(current, mode)) { setError(contractTerminationRestriction); return; }

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

    const requiresDismissalDetails = Boolean(mode);
    if (!mode || !effectiveDate || !workedOnDate || (needsConfirmation && !riskConfirmed)) return;
    if (needsVariant && !variant) { setError("Selecione a opção deste desligamento."); return; }
    if (mode === "contract_end" && !initiative) { setError("Informe se o término foi pela empresa ou pelo empregado."); return; }
    if (mode === "without_cause" && (workedNotice || indemnifiedNotice) && !noticeDays) { setError("Confira a admissão e a data do desligamento para calcular o aviso proporcional."); return; }
    if (mode === "for_cause" && !justCauseReasonValues.length) { setError("Selecione ao menos um motivo para a demissão por justa causa."); return; }
    if (mode === "quick" && !experienceDismissalType) { setError("Selecione o tipo de demissão na experiência."); return; }
    if (effectiveDate < employee.admissionDate || (mode === "quick" && effectiveDate > today) || (workedNotice && (!start || start < employee.admissionDate || effectiveDate < start))) { setError("Confira as datas: a saída não pode anteceder a admissão e a desativação rápida não pode ser futura."); return; }
    if (!validNoticeReduction(mode === "without_cause" && workedNotice ? "employee" : "quick", reduction, start, effectiveDate)) { setError("Selecione a redução e confira se os sete dias cabem no período do aviso."); return; }
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

      current.registrationData = { ...current.registrationData, dismissalJustCauseReasons: mode === "for_cause" ? JSON.stringify(justCauseReasonValues) : "[]" };
      await data.upsertEmployee({ ...current, status: effectiveDate <= today ? "terminated" : current.status, registrationData: { ...current.registrationData, processStartedAt: processEntryDate(current, isInExperience(current, today)) || now, terminationMode: mode, terminationRiskConfirmedAt: needsConfirmation && riskConfirmed ? now : "", terminationRiskConfirmedBy: needsConfirmation && riskConfirmed ? user?.id || "" : "", terminationWorkedOnDeactivationDate: workedOnDate, terminationSettlementDueDate: addDays(effectiveDate, 10), terminationSettlementCalculationDate: calculationDate, noticeProjectionEndDate: projectionEnd, noticeTotalDays: String(noticeDays), noticeAdditionalDays: String(additionalDays), noticeIndemnifiedDays: String(indemnifiedDays), noticeServiceYears: serviceYears === null ? "" : String(serviceYears), terminationSettlementPaid: settlementPaid, terminationSettlementPaidAt: settlementPaid === "true" ? now : "", terminationSettlementPaidBy: settlementPaid === "true" ? user?.id || "" : "", scheduledDeactivationDate: effectiveDate, deactivationEffectiveDate: effectiveDate, deactivationScheduledAt: now, deactivationCompletedDate: effectiveDate <= today ? today : "", noticeEndDate: workedNotice ? lastNoticeDate : "", noticeDate: workedNotice ? lastNoticeDate : "", noticeScheduledAt: workedNotice ? now : "", noticeCompletedDate: "", ...noticeSpecialty(noticeMode, mode === "without_cause" ? reduction : "", start, lastNoticeDate), noticeReductionApplies: mode === "without_cause" && workedNotice && applyReduction ? "true" : "false", dismissalType: mode === "quick" ? experienceDismissalType : terminationModes[mode as TerminationMode] || "", dismissalVariant: needsVariant ? variant : "", dismissalInitiative: mode === "contract_end" ? initiative : "", dismissalDescription: requiresDismissalDetails ? dismissalNotes.trim() : "", dismissalCreatedDocumentIds: JSON.stringify(nextDismissalCreatedIds), dismissalSelectedDocumentIds: JSON.stringify(nextDismissalSelectedIds), dismissalCreatedDocumentNames: JSON.stringify(Array.from(new Set(uploadedDismissalDocumentNames))), scheduledReactivationDate: "", reactivationEffectiveDate: "", reactivationScheduledAt: "", reactivationCompletedDate: "" }, updatedAt: now });
      onClose();
    } catch { setError("Não foi possível concluir o agendamento. Os anexos já salvos foram preservados; tente novamente."); }
    finally { setSaving(false); }
  }

  const optionEntries: Array<[FormMode, string]> = [
    ...dismissalModeOptions.map((key) => [key, terminationModes[key]] as [FormMode, string]),
    ...(experienceProcessActive && !quickModeLocked ? [["quick", terminationModes.quick] as [FormMode, string]] : []),
    ["suspension", "Suspensão"],
  ];

  const isSuspension = mode === "suspension";
  const requiresDismissalDetails = Boolean(mode) && mode !== "suspension";

  return createPortal(<div className="modal-backdrop deactivation-backdrop employee-schedule-backdrop">
    <form className="modal-panel deactivation-modal employee-schedule-modal" role="dialog" aria-modal="true" aria-labelledby="schedule-deactivation-title" onSubmit={save}>
      <div className="modal-header"><span className="deactivation-heading-icon"><CalendarClock size={24} /></span><div><h2 id="schedule-deactivation-title">{isSuspension ? "Registrar suspensão do Funcionário" : "Agendar desligamento do Funcionário"}</h2><p>{employee.name}</p><small>{isSuspension ? "Defina o período, o motivo e os responsáveis pelo afastamento." : "Escolha como deseja encerrar o vínculo."}</small></div><button type="button" className="icon-button" disabled={saving} onClick={onClose} aria-label="Fechar"><X size={18} /></button></div>
      <fieldset disabled={saving} className="deactivation-body">
        <div>
          <h3 className="deactivation-section-title">Tipo de desligamento</h3>
          {contractEmployee && <p className="muted">{contractTerminationRestriction}</p>}
          <div className="deactivation-options" role="radiogroup" aria-label="Tipo de desligamento">
            {optionEntries.map(([value, label]) => {
              const detail = modeDetails[value as keyof typeof modeDetails];
              const Icon = detail.icon;
              const contractBlocked = !canUseTerminationMode(employee, value);
              const locked = contractBlocked || (value === "quick" ? quickModeLocked : value === "suspension" || (contractEmployee && value === "contract_end") ? false : cltModesLockedDuringExperience);
              return <label key={value} className={`deactivation-option${mode === value ? " is-selected" : ""}${value === "quick" ? " is-quick" : ""}${value === "suspension" ? " is-suspension" : ""}${locked ? " is-locked" : ""}`} aria-disabled={locked}>
                <input type="radio" name="termination-mode" value={value} checked={mode === value} required disabled={locked} onChange={() => { if (locked) return; setMode(value); setVariant(""); setInitiative(""); setRiskConfirmed(false); setError(""); }} />
                <Icon size={21} /><span><strong>{label}</strong><small>{detail.description}</small>{contractBlocked && <small className="deactivation-option-lock-note">Bloqueado para funcionário de contrato.</small>}{locked && value === "quick" && cltModeUnlocked && <small className="deactivation-option-lock-note">Bloqueado para desligamentos após a experiência.</small>}</span>
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
            {mode && <div className="deactivation-date-layout has-side-details">
              <div className="deactivation-date-section">
                <div className="deactivation-date-heading"><div><h3 className="deactivation-section-title">Data do desligamento</h3><p className="muted">Selecione a data efetiva.{experienceProcessActive ? " O marco final da experiência aparece no aviso ao lado." : ""}</p></div><CalendarDays size={22} /></div>
                <div className={`deactivation-calendar-card${experienceProcessActive ? "" : " is-inline-card"}`}>
                  <div className="deactivation-calendar-topline is-compact">
                    <label className="field deactivation-native-date"><span>{workedNotice ? "Último dia do aviso / desligamento" : "Data selecionada"}</span><input type="date" required min={employee.admissionDate} max={mode === "quick" ? today : undefined} value={effectiveDate} readOnly={workedNotice} onChange={(event) => handleNativeDateChange(event.target.value)} /></label>
                    {experienceProcessActive && <div className="deactivation-experience-marker"><AlertTriangle size={17} /><div><strong>Fim da experiência</strong><span>{formatDate(experienceEndDate)}</span></div></div>}
                  </div>
                </div>
                {selectedDateBeforeEnd && <div className="deactivation-date-alert is-warning"><AlertTriangle size={18} /><div><strong>Antes do fim da experiência</strong><p>A rescisão antecipada de contrato por prazo determinado pode gerar indenização nos termos do art. 479 da CLT e outros efeitos rescisórios conforme a hipótese.</p></div></div>}
                {selectedDateAtEnd && <div className="deactivation-date-alert is-success"><ShieldAlert size={18} /><div><strong>Data de término da experiência</strong><p>No término regular do contrato de experiência, o MTE informa que não há aviso prévio nem multa de 40% sobre o FGTS; são devidas as verbas proporcionais cabíveis.</p></div></div>}
                {experienceProcessActive && selectedDateAfterEnd && cltModeUnlocked && <div className="deactivation-date-alert is-clt"><ShieldAlert size={18} /><div><strong>Desligamento após a experiência</strong><p>Como o vínculo continuou após o fim da experiência, o contrato passa a ser por prazo indeterminado. Siga uma das tipos de desligamento CLT abaixo.</p></div></div>}
              </div>
              <TerminationExitFields calculationDate={needsVariant && !variant ? undefined : calculationDate} date={effectiveDate} workedOnDate={workedOnDate} onWorkedOnDateChange={setWorkedOnDate} compact />
            </div>}

            {needsVariant && <label className="field"><span>{mode === "contract_end" ? "Situação do contrato" : "Tipo de aviso"}</span><select required value={variant} onChange={(event) => setVariant(event.target.value)}><option value="">Selecione</option>{dismissalVariants[mode as keyof typeof dismissalVariants].map((item) => <option key={item} value={item}>{item}</option>)}</select></label>}
            {mode === "contract_end" && <label className="field"><span>Iniciativa</span><select required value={initiative} onChange={(event) => setInitiative(event.target.value)}><option value="">Selecione</option>{dismissalInitiatives.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>}
            {mode === "for_cause" && <div className="field is-wide-field"><span>Motivos da justa causa</span><MultiSelect label="Motivos da justa causa" options={[...justCauseReasons]} value={justCauseReasonValues} onChange={setJustCauseReasonValues} placeholder="Selecione um ou mais motivos" searchPlaceholder="Buscar motivo" /><small className="muted">A desídia pode incluir violações de normas trabalhistas, como o respeito ao intervalo intrajornada.</small></div>}
            {workedNotice && <label className="field">Primeiro dia do aviso<input type="date" required min={employee.admissionDate} value={start} onChange={(event) => setStart(event.target.value)} /></label>}
            {resignationWorked && <p className="muted">Aviso de 30 dias corridos, incluindo o primeiro dia informado. Último dia: <strong>{formatDate(lastNoticeDate)}</strong>.</p>}
            {mode === "resignation" && variant && !workedNotice && <p className="muted">Cumprimento dispensado pela empresa. Informe a data do desligamento; não haverá período de aviso trabalhado.</p>}
            {mode === "without_cause" && (workedNotice || indemnifiedNotice) && <NoticeEntitlementSummary years={serviceYears} total={noticeDays} additional={additionalDays} indemnified={indemnifiedDays} projection={projectionEnd} worked={workedNotice} />}
            {mode === "without_cause" && workedNotice && <NoticeReductionFields value={reduction} onChange={setReduction} end={effectiveDate} applies={applyReduction} onAppliesChange={setApplyReduction} />}
            {requiresDismissalDetails && <div className="suspension-documents-card">
              <div><h3 className="deactivation-section-title">Dados da demissão</h3><p className="muted">Inclua observações e documentos, se necessário.</p></div>
              {mode === "quick" && <label className="field"><span>Tipo de demissão na experiência</span><select required value={experienceDismissalType} onChange={(event) => setExperienceDismissalType(event.target.value)}><option value="">Selecione</option>{experienceDismissalTypes.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>}
              <label className="field is-wide-field"><span>Observações da demissão</span><textarea rows={4} maxLength={2000} placeholder="Descreva o contexto da demissão, ocorrências relevantes e referências úteis." value={dismissalNotes} onChange={(event) => setDismissalNotes(event.target.value)} /></label>
              <label className="suspension-upload-button"><Upload size={17} /><span>Anexar documento</span><input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg" multiple onChange={handleDismissalFiles} /></label>
              {dismissalDocuments.length ? <div className="suspension-document-list">{dismissalDocuments.map((file, index) => <div className="suspension-document-item" key={`${file.name}-${file.lastModified}-${index}`}><FileText size={17} /><div><strong>{file.name}</strong><small>{formatFileSize(file.size)}</small></div><button type="button" className="icon-button" aria-label={`Remover ${file.name}`} onClick={() => setDismissalDocuments((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={16} /></button></div>)}</div> : <p className="suspension-no-documents">Nenhum documento anexado.</p>}
            </div>}
            {mode === "quick" && <div className="deactivation-quick-summary"><ShieldAlert size={22} /><div><strong>Desativação rápida em {formatDate(effectiveDate)}</strong><p>{experienceProcessActive && initialQuickDismissal === "warning" ? "A data escolhida é anterior ao fim do contrato de experiência e pode gerar indenização pela rescisão antecipada, conforme o art. 479 da CLT." : "Ao confirmar, o funcionário ficará inativo e deixará de aparecer no controle de ponto a partir da data informada. Esta ação substitui qualquer agendamento anterior."}</p><label className="deactivation-confirmation"><input type="checkbox" checked={riskConfirmed} onChange={(event) => setRiskConfirmed(event.target.checked)} />Confirmo a desativação de {employee.name} e estou ciente dos efeitos rescisórios aplicáveis à data escolhida.</label></div></div>}
            {mode === "without_cause" && variant === "Aviso prévio indenizado" && <p className="muted">O aviso indenizado não possui período trabalhado nem redução de jornada.</p>}
            {!mode && cltModeUnlocked && <div className="deactivation-clt-next-step"><strong>Experiência encerrada</strong><p>Selecione um tipo de desligamento CLT para continuar o processo de desligamento.</p></div>}
          </>
        )}
        {error && <p role="alert">{error}</p>}
      </fieldset>
      <div className="modal-footer"><button type="button" className="btn btn-secondary" disabled={saving} onClick={onClose}>Cancelar</button><button type="submit" className={`btn btn-primary${mode === "quick" ? " deactivation-submit-quick" : isSuspension ? " deactivation-submit-suspension" : ""}`} disabled={saving || (isSuspension ? !suspensionStartDate || !suspensionEndDate || !suspensionReason.trim() || !suspensionCoordinatorId || suspensionEndDate < suspensionStartDate : !mode || !effectiveDate || !workedOnDate || (needsConfirmation && !riskConfirmed) || (needsVariant && !variant) || (mode === "contract_end" && !initiative) || (mode === "quick" && !experienceDismissalType) || (indemnifiedNotice && (!projectionEnd || projectionEnd < effectiveDate)))}><Save size={16} />{saving ? "Salvando..." : isSuspension ? "Confirmar suspensão" : mode === "quick" ? "Desativar agora" : "Confirmar agendamento"}</button></div>

      {experienceProcessActive && cltConfirmationOpen && !isSuspension && <div className="experience-clt-confirmation-backdrop">
        <div className="experience-clt-confirmation" role="dialog" aria-modal="true" aria-labelledby="experience-clt-confirmation-title">
          <div className="experience-clt-confirmation-icon"><AlertTriangle size={24} /></div>
          <h2 id="experience-clt-confirmation-title">Desligar funcionário após experiencia?</h2>
          <p>A data selecionada ({formatDate(candidateDate)}) é posterior ao fim da experiência ({formatDate(experienceEndDate)}).</p>
          <p>Como o funcionário permaneceu após o prazo, o vínculo passa a ser por prazo indeterminado e o desligamento deve seguir as regras do contrato CLT.</p>
          <div className="experience-clt-confirmation-note">Ao confirmar, a <strong>Desativação rápida</strong> será bloqueada e as demais tipos de desligamento ficarão disponíveis.</div>
          <div className="experience-clt-confirmation-actions"><button type="button" className="btn btn-secondary" onClick={cancelAfterExperience}>Não</button><button type="button" className="btn btn-primary" onClick={confirmAfterExperience}>Sim, seguir como CLT</button></div>
        </div>
      </div>}
    </form>
  </div>, document.body);
}
