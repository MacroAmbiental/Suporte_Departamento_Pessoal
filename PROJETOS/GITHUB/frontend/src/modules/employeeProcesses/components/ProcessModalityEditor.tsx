import ScheduleDeactivationModal from "./ScheduleDeactivationModal";
import { isContractEmployee, canUseTerminationMode, contractTerminationRestriction } from "../utils/terminationPermissions";
import NoticeEntitlementSummary from "./NoticeEntitlementSummary";
import { terminationDates } from "../utils/terminationDates";
import NoticeReductionFields from "./NoticeReductionFields";
import { noticeSpecialty, validNoticeReduction } from "../utils/noticeSpecialty";
import TerminationExitFields from "./TerminationExitFields";
import { useState } from "react";
import { ExternalLink } from "lucide-react";
import type { Employee } from "@/types/domain";
import { useDomainData } from "@/hooks/useDomainData";
import { useAuth } from "@/hooks/useAuth";
import { securePath } from "@/services/secureRoutes";
import { formatDate, todayISO } from "@/utils/format";
import { processEntryDate } from "../utils/processEntryDate";
import { addDays, isInExperience, terminationModes, dismissalModeOptions, dismissalVariants, dismissalInitiatives } from "../utils/experience";
import { justCauseReasons, parseJustCauseReasons } from "../utils/justCauseReasons";
import MultiSelect from "@/common/components/MultiSelect";
const modes = { ...terminationModes, experience: "Contrato de Experiência" };
export default function ProcessModalityEditor({ employee }: { employee: Employee }) {
  const data = useDomainData();
  const { can, user } = useAuth();
  const fields = employee.registrationData || {};
  const contractEmployee = isContractEmployee(employee);
  const [suspensionOpen, setSuspensionOpen] = useState(false);
  const [applyReduction, setApplyReduction] = useState(employee.registrationData?.noticeReductionApplies === "true");
  const [reduction, setReduction] = useState(employee.registrationData?.noticeReduction || "");
  const [mode, setMode] = useState("");
  const [variant, setVariant] = useState("");
  const [initiative, setInitiative] = useState("");
  const [justCauseReasonValues, setJustCauseReasonValues] = useState(() => parseJustCauseReasons(fields.dismissalJustCauseReasons));
  const [date, setDate] = useState(fields.scheduledDeactivationDate || fields.deactivationEffectiveDate || fields.noticeEndDate || fields.noticeDate || "");
  const [start, setStart] = useState(fields.noticeStartDate || todayISO());
  const [confirmed, setConfirmed] = useState(false);
  const [workedOnDate, setWorkedOnDate] = useState(fields.terminationWorkedOnDeactivationDate || "");
  const settlementPaid = fields.terminationSettlementPaid === "true" ? "true" : "false";
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const hasNotice = Boolean(fields.noticeStartDate || fields.noticeEndDate || fields.noticeScheduledAt);
  const { workedNotice, resignationWorked, indemnifiedNotice, effectiveDate, lastNoticeDate, calculationDate, serviceYears, additionalDays, noticeDays, indemnifiedDays, projectionEndDate: projectionEnd } = terminationDates(mode, variant, date, start, employee.admissionDate);
  const noticeMode = workedNotice ? "employee" : "quick";
  const needsVariant = mode === "without_cause" || mode === "resignation" || mode === "contract_end";

  function openEmployeePath() {
    const url = new URL(securePath("employees"), window.location.origin);
    url.searchParams.set("employeeId", employee.id);
    url.searchParams.set("modal", "deactivate");
    window.open(url.toString(), "_blank");
  }

  if (!can("employees", "edit")) return null;
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busy || !mode || !can("employees", "edit")) return;
    if ((needsVariant && !variant) || (mode === "contract_end" && !initiative)) { setMessage("Complete as opções do desligamento."); return; }
    if (mode === "for_cause" && !justCauseReasonValues.length) { setMessage("Selecione ao menos um motivo para a demissão por justa causa."); return; }
    const current = data.employees.find((item) => item.id === employee.id);
    if (!current || current.status === "terminated" || current.registrationData?.dismissalApprovedAt) { setMessage("Este processo não permite alteração."); return; }
    if (!canUseTerminationMode(current, mode)) { setMessage(contractTerminationRestriction); return; }
    const today = todayISO();
    const end = mode === "experience" ? "" : effectiveDate;
    if (mode === "without_cause" && (workedNotice || indemnifiedNotice) && !noticeDays) { setMessage("Confira a admissão e a data do desligamento para calcular o aviso proporcional."); return; }
    if (mode !== "experience" && (!end || end < today || end < current.admissionDate || (workedNotice && (!start || start < current.admissionDate || start > end)))) { setMessage("Confira as datas do processo."); return; }
    if ((mode === "quick" || mode === "experience") && !confirmed) return;
    if (mode !== "experience" && !workedOnDate) { setMessage("Informe se o funcionário trabalhou na data do desligamento."); return; }
    if (!validNoticeReduction(mode === "without_cause" && workedNotice ? "employee" : "quick", reduction, start, effectiveDate)) { setMessage("Selecione a reducao e confira se os sete dias cabem no periodo do aviso."); return; }
    setBusy(true); setMessage("");
    try {
      const now = new Date().toISOString();
      await data.upsertEmployee({ ...current, status: end && end <= today ? "terminated" : current.status, registrationData: {
        ...current.registrationData,
        dismissalCancelledAt: "",
        processStartedAt: processEntryDate(current, isInExperience(current, today)) || now,
        terminationMode: mode === "experience" ? "" : mode,
        processModalityChangedAt: now, processModalityChangedBy: user?.id || "",
        scheduledDeactivationDate: end, deactivationEffectiveDate: end, deactivationScheduledAt: end ? now : "", deactivationCompletedDate: end && end <= today ? today : "",
        terminationWorkedOnDeactivationDate: mode === "experience" ? "" : workedOnDate, terminationSettlementDueDate: mode === "experience" ? "" : addDays(end, 10), terminationSettlementCalculationDate: mode === "experience" ? "" : calculationDate, noticeProjectionEndDate: projectionEnd, noticeTotalDays: String(noticeDays), noticeAdditionalDays: String(additionalDays), noticeIndemnifiedDays: String(indemnifiedDays), noticeServiceYears: serviceYears === null ? "" : String(serviceYears), terminationSettlementPaid: mode === "experience" ? "" : settlementPaid, terminationSettlementPaidAt: settlementPaid === "true" ? now : "", terminationSettlementPaidBy: settlementPaid === "true" ? user?.id || "" : "", noticeEndDate: workedNotice ? end : "", noticeDate: workedNotice ? end : "", noticeScheduledAt: workedNotice ? now : "", noticeCompletedDate: "", ...noticeSpecialty(noticeMode, mode === "without_cause" ? reduction : "", start, lastNoticeDate), noticeReductionApplies: mode === "without_cause" && workedNotice && applyReduction ? "true" : "false", dismissalType: mode === "experience" ? "" : terminationModes[mode as keyof typeof terminationModes] || "", dismissalVariant: needsVariant ? variant : "", dismissalInitiative: mode === "contract_end" ? initiative : "",
        dismissalJustCauseReasons: mode === "for_cause" ? JSON.stringify(justCauseReasonValues) : "[]",
        scheduledReactivationDate: "", reactivationEffectiveDate: "",
        ...(mode === "experience" ? { experienceConfirmedAt: "", experienceConfirmedBy: "", employmentContractType: "experience" } : {}),
        terminationRiskConfirmedAt: confirmed ? now : "", terminationRiskConfirmedBy: confirmed ? user?.id || "" : "",
      }, updatedAt: now });
      setMode(""); setConfirmed(false); setMessage("Tipo de desligamento atualizado.");
    } catch { setMessage("Não foi possível atualizar o tipo de desligamento. Tente novamente."); }
    finally { setBusy(false); }
  }
  async function tearNotice() {
    if (busy || !hasNotice || !can("employees", "edit")) return;
    if (!window.confirm(`Deseja rasgar o aviso prévio de ${employee.name}? O processo de desligamento será cancelado e o funcionário voltará a ficar ativo.`)) return;

    const current = data.employees.find((item) => item.id === employee.id);
    if (!current || current.status === "terminated" || current.registrationData?.dismissalApprovedAt) { setMessage("Este processo não permite alteração."); return; }

    setBusy(true); setMessage("");
    try {
      const now = new Date().toISOString();
      await data.upsertEmployee({
        ...current,
        status: "active",
        registrationData: {
          ...current.registrationData,
          processStartedAt: "",
          terminationMode: "",
          terminationRiskConfirmedAt: "",
          terminationRiskConfirmedBy: "",
          scheduledDeactivationDate: "",
          deactivationEffectiveDate: "",
          deactivationScheduledAt: "",
          deactivationCompletedDate: "",
          noticeStartDate: "",
          noticeEndDate: "",
          noticeProjectionEndDate: "",
          noticeTotalDays: "", noticeAdditionalDays: "", noticeIndemnifiedDays: "", noticeServiceYears: "",
          terminationSettlementCalculationDate: "",
          noticeDate: "",
          noticeScheduledAt: "",
          noticeCompletedDate: "",
          noticeReduction: "",
          noticeReductionApplies: "false",
          noticeDailyReductionHours: "",
          noticeLeaveStartDate: "",
          noticeLeaveEndDate: "",
          dismissalSelectedDocumentIds: "[]",
          dismissalCreatedDocumentIds: "[]",
          dismissalAlertSnapshot: "",
          dismissalCancelledAt: now,
          processModalityChangedAt: now,
          processModalityChangedBy: user?.id || "",
        },
        updatedAt: now,
      });
      setMode(""); setConfirmed(false); setMessage("Aviso prévio cancelado. O funcionário voltou ao status ativo.");
    } catch {
      setMessage("Não foi possível cancelar o aviso prévio. Tente novamente.");
    } finally { setBusy(false); }
  }

  async function failNotice() {
    if (busy || !hasNotice || !can("employees", "edit")) return;
    if (!window.confirm(`Deseja marcar que ${employee.name} não cumpriu o aviso prévio? O funcionário será desativado hoje e o aviso será encerrado.`)) return;

    const current = data.employees.find((item) => item.id === employee.id);
    if (!current || current.status === "terminated" || current.registrationData?.dismissalApprovedAt) { setMessage("Este processo não permite alteração."); return; }

    if (isContractEmployee(current)) { setMessage(contractTerminationRestriction); return; }

    setBusy(true); setMessage("");
    try {
      const now = new Date().toISOString();
      const today = todayISO();
      await data.upsertEmployee({
        ...current,
        status: "terminated",
        registrationData: {
          ...current.registrationData,
          processStartedAt: current.registrationData?.processStartedAt || "",
          terminationMode: "",
          scheduledDeactivationDate: today,
          deactivationEffectiveDate: today,
          deactivationScheduledAt: now,
          deactivationCompletedDate: today,
          noticeStartDate: "",
          noticeEndDate: "",
          noticeProjectionEndDate: "",
          noticeTotalDays: "", noticeAdditionalDays: "", noticeIndemnifiedDays: "", noticeServiceYears: "",
          noticeDate: "",
          noticeScheduledAt: "",
          noticeCompletedDate: today,
          terminationSettlementCalculationDate: today,
          terminationSettlementDueDate: addDays(today, 10),
          noticeReduction: "",
          noticeReductionApplies: "false",
          noticeDailyReductionHours: "",
          noticeLeaveStartDate: "",
          noticeLeaveEndDate: "",
          dismissalSelectedDocumentIds: "[]",
          dismissalCreatedDocumentIds: "[]",
          dismissalAlertSnapshot: "",
          dismissalCancelledAt: "",
          processModalityChangedAt: now,
          processModalityChangedBy: user?.id || "",
        },
        updatedAt: now,
      });
      setMode(""); setConfirmed(false); setMessage("Funcionário desativado. O aviso prévio foi encerrado porque não foi cumprido.");
    } catch {
      setMessage("Não foi possível desativar o funcionário. Tente novamente.");
    } finally { setBusy(false); }
  }

  const processStatus = employee.status === "terminated" ? "Desativado" : "Em andamento";
  const processSummary = [
    { label: "Tipo de desligamento", value: fields.terminationMode ? (modes[fields.terminationMode as keyof typeof modes] || "Desligamento") : "Contrato de Experiência" },
    { label: "Status", value: processStatus, type: "badge" },
    { label: "Data-base da rescisão", value: fields.terminationSettlementCalculationDate ? formatDate(fields.terminationSettlementCalculationDate) : "—" },
    { label: "Início do processo", value: fields.processStartedAt ? formatDate(fields.processStartedAt) : "-" },
    { label: "Admissão", value: employee.admissionDate ? formatDate(employee.admissionDate) : "-" },
    { label: "Início do aviso", value: fields.noticeStartDate ? formatDate(fields.noticeStartDate) : "-" },
    { label: "Desativação", value: fields.scheduledDeactivationDate || fields.deactivationEffectiveDate ? formatDate(fields.scheduledDeactivationDate || fields.deactivationEffectiveDate || "") : "-" },
  ];

  return (
    <>
    <form className="process-editor" onSubmit={save}>
      <div className="process-summary-grid" aria-label="Resumo do processo de funcionamento">
        {processSummary.map((item) => (
          <div key={item.label} className="process-summary-item">
            <span className="process-summary-label">{item.label}</span>
            {item.type === "badge" ? (
              <span className="process-status-badge">{item.value}</span>
            ) : (
              <strong className="process-summary-value">{item.value}</strong>
            )}
          </div>
        ))}
      </div>

      <div className="process-edit-card">
        <div className="process-edit-header">
          <div className="process-edit-icon" aria-hidden="true">↺</div>
          <div>
            <h3>Alterar tipo de desligamento</h3>
            <p>{contractEmployee ? contractTerminationRestriction : "Selecione o novo tipo para o processo."}</p>
          </div>
        </div>

        <div className="process-form-grid">
          <label className="field process-field">
            <span>Novo tipo de desligamento</span>
            <select required value={mode} onChange={(event) => { if (event.target.value === "suspension") { setSuspensionOpen(true); return; } setMode(event.target.value); setVariant(""); setInitiative(""); setConfirmed(false); setMessage(""); }}>
              <option value="">Selecione o tipo</option>
              {dismissalModeOptions.map((value) => <option key={value} value={value} disabled={!canUseTerminationMode(employee, value)}>{terminationModes[value]}{!canUseTerminationMode(employee, value) ? " — Bloqueado para contrato" : ""}</option>)}
              <option value="suspension">Suspensão</option>
              <option value="experience" disabled={contractEmployee}>Contrato de Experiência{contractEmployee ? " — Bloqueado para contrato" : ""}</option>
            </select>
          </label>
        </div>

        {needsVariant && <label className="field process-field"><span>{mode === "contract_end" ? "Situação do contrato" : "Tipo de aviso"}</span><select required value={variant} onChange={(event) => setVariant(event.target.value)}><option value="">Selecione</option>{dismissalVariants[mode as keyof typeof dismissalVariants].map((item) => <option key={item} value={item}>{item}</option>)}</select></label>}
        {mode === "contract_end" && <label className="field process-field"><span>Iniciativa</span><select required value={initiative} onChange={(event) => setInitiative(event.target.value)}><option value="">Selecione</option>{dismissalInitiatives.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>}
        {mode === "for_cause" && <div className="field process-field"><span>Motivos da justa causa</span><MultiSelect label="Motivos da justa causa" options={[...justCauseReasons]} value={justCauseReasonValues} onChange={setJustCauseReasonValues} placeholder="Selecione um ou mais motivos" searchPlaceholder="Buscar motivo" /><small className="muted">A desídia pode incluir violações de normas trabalhistas, como o respeito ao intervalo intrajornada.</small></div>}
        {mode && mode !== "experience" && <div className="process-form-grid two-columns">
          {workedNotice && <label className="field process-field"><span>Primeiro dia do aviso</span><input type="date" required value={start} onChange={(event) => setStart(event.target.value)} /></label>}
          <label className="field process-field"><span>{workedNotice ? "Último dia do aviso / desligamento" : "Data de desativação"}</span><input type="date" required min={todayISO()} readOnly={workedNotice} value={effectiveDate} onChange={(event) => setDate(event.target.value)} /></label>
        </div>}

        {resignationWorked && <p className="muted">Aviso de 30 dias corridos, incluindo o primeiro dia informado. Último dia: <strong>{formatDate(lastNoticeDate)}</strong>.</p>}
        {mode === "resignation" && variant && !workedNotice && <p className="muted">Cumprimento dispensado pela empresa. Informe a data do desligamento; não haverá período de aviso trabalhado.</p>}
        {mode === "without_cause" && (workedNotice || indemnifiedNotice) && <NoticeEntitlementSummary years={serviceYears} total={noticeDays} additional={additionalDays} indemnified={indemnifiedDays} projection={projectionEnd} worked={workedNotice} />}

        {(mode === "quick" || mode === "experience") && (
          <label className="process-confirmation" htmlFor="process-confirmation">
            <input id="process-confirmation" type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
            <span>
              {mode === "quick"
                ? "Confirmo a desativação hoje e estou ciente de possíveis encargos do desligamento."
                : "Confirmo a troca para acompanhamento de experiência e o cancelamento do desligamento agendado. A troca não reinicia o prazo contado da admissão."}
            </span>
          </label>
        )}

        {mode === "without_cause" && workedNotice && (
          <NoticeReductionFields value={reduction} onChange={setReduction} end={effectiveDate} applies={applyReduction} onAppliesChange={setApplyReduction} />
        )}
        {mode && mode !== "experience" && <TerminationExitFields calculationDate={needsVariant && !variant ? undefined : calculationDate} date={effectiveDate} workedOnDate={workedOnDate} onWorkedOnDateChange={setWorkedOnDate} />}

        <button className="btn btn-primary process-save-button" type="submit" disabled={!mode || busy || ((mode === "quick" || mode === "experience") && !confirmed)}>
          {busy ? "Salvando..." : "Salvar tipo"}
        </button>

        {hasNotice && employee.status !== "terminated" && (
          <div className="process-action-row">
            <button className="btn btn-secondary process-action-button" type="button" disabled={busy} onClick={() => void tearNotice()}>
              Cancelar aviso prévio
            </button>
            <button className="btn btn-secondary process-action-button" type="button" disabled={busy || contractEmployee} onClick={() => void failNotice()}>
              Não cumpriu o aviso
            </button>
          </div>
        )}

        {message && <p className="process-status-message" role="status">{message}</p>}
      </div>
    </form>
    {suspensionOpen && <ScheduleDeactivationModal employee={employee} initialSuspension onClose={() => setSuspensionOpen(false)} />}
    </>
  );
}
