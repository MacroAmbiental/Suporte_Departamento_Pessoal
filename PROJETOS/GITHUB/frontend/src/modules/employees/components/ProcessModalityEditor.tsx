import NoticeReductionFields from "./NoticeReductionFields";
import { noticeSpecialty, validNoticeReduction } from "../noticeSpecialty";
import { useState } from "react";
import { ExternalLink } from "lucide-react";
import type { Employee } from "@/types/domain";
import { useDomainData } from "@/hooks/useDomainData";
import { useAuth } from "@/hooks/useAuth";
import { securePath } from "@/services/secureRoutes";
import { formatDate, todayISO } from "@/utils/format";
import { processEntryDate } from "../processEntryDate";
import { isInExperience, terminationModes } from "../experience";
const modes = { ...terminationModes, experience: "Contrato de Experiência" };
export default function ProcessModalityEditor({ employee }: { employee: Employee }) {
  const data = useDomainData();
  const { can, user } = useAuth();
  const fields = employee.registrationData || {};
  const [applyReduction, setApplyReduction] = useState(employee.registrationData?.noticeReductionApplies === "true" || employee.registrationData?.terminationMode === "employer");
  const [reduction, setReduction] = useState(employee.registrationData?.noticeReduction || "");
  const [mode, setMode] = useState("");
  const [date, setDate] = useState(fields.scheduledDeactivationDate || fields.deactivationEffectiveDate || fields.noticeEndDate || fields.noticeDate || "");
  const [start, setStart] = useState(fields.noticeStartDate || todayISO());
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const hasNotice = ["employee", "employer", "indemnified"].includes(fields.terminationMode || "");

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
    const current = data.employees.find((item) => item.id === employee.id);
    if (!current || current.status === "terminated" || current.registrationData?.dismissalApprovedAt) { setMessage("Este processo não permite alteração."); return; }
    const today = todayISO();
    const end = mode === "quick" ? today : mode === "experience" ? "" : date;
    if (mode !== "experience" && (!end || end < today || end < current.admissionDate || (["employee", "employer", "indemnified"].includes(mode) && (!start || start < current.admissionDate || start > end)))) { setMessage("Confira as datas do processo."); return; }
    if ((mode === "quick" || mode === "experience") && !confirmed) return;
    if (!validNoticeReduction(mode, reduction, start, date)) { setMessage("Selecione a reducao e confira se os sete dias cabem no periodo do aviso."); return; }
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
        noticeEndDate: (mode === "employee" || mode === "employer") ? end : "", noticeDate: (mode === "employee" || mode === "employer") ? end : "", noticeScheduledAt: (mode === "employee" || mode === "employer") ? now : "", noticeCompletedDate: "", ...noticeSpecialty(mode, reduction, start, date), noticeReductionApplies: (["employee", "indemnified"].includes(mode) && applyReduction) ? "true" : "false",
        scheduledReactivationDate: "", reactivationEffectiveDate: "",
        ...(mode === "experience" ? { experienceConfirmedAt: "", experienceConfirmedBy: "", employmentContractType: "experience" } : {}),
        terminationRiskConfirmedAt: confirmed ? now : "", terminationRiskConfirmedBy: confirmed ? user?.id || "" : "",
      }, updatedAt: now });
      setMode(""); setConfirmed(false); setMessage("Modalidade atualizada.");
    } catch { setMessage("Não foi possível atualizar a modalidade. Tente novamente."); }
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
          noticeDate: "",
          noticeScheduledAt: "",
          noticeCompletedDate: today,
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
    { label: "Modalidade", value: fields.terminationMode ? (modes[fields.terminationMode as keyof typeof modes] || "Aviso prévio") : "Aviso prévio do empregado" },
    { label: "Status", value: processStatus, type: "badge" },
    { label: "Início do processo", value: fields.processStartedAt ? formatDate(fields.processStartedAt) : "-" },
    { label: "Admissão", value: employee.admissionDate ? formatDate(employee.admissionDate) : "-" },
    { label: "Início do aviso", value: fields.noticeStartDate ? formatDate(fields.noticeStartDate) : "-" },
    { label: "Desativação", value: fields.scheduledDeactivationDate || fields.deactivationEffectiveDate ? formatDate(fields.scheduledDeactivationDate || fields.deactivationEffectiveDate || "") : "-" },
  ];

  return (
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
            <h3>Alterar modalidade</h3>
            <p>Selecione a nova modalidade para o processo.</p>
          </div>
        </div>

        <div className="process-form-grid">
          <label className="field process-field">
            <span>Nova modalidade</span>
            <select required value={mode} onChange={(event) => { setMode(event.target.value); setConfirmed(false); setMessage(""); }}>
              <option value="">Selecione a modalidade</option>
              {Object.entries(modes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        </div>

        {[
          "employee",
          "employer",
          "indemnified",
        ].includes(mode) && (
          <div className="process-form-grid two-columns">
            <label className="field process-field">
              <span>Início do aviso</span>
              <input type="date" required value={start} onChange={(event) => setStart(event.target.value)} />
            </label>
            <label className="field process-field">
              <span>Data de desativação</span>
              <input type="date" required min={todayISO()} value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
          </div>
        )}

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

        {(mode === "employee" || mode === "indemnified") && (
          <NoticeReductionFields value={reduction} onChange={setReduction} end={date} applies={applyReduction} onAppliesChange={setApplyReduction} />
        )}

        <button className="btn btn-primary process-save-button" type="submit" disabled={!mode || busy || ((mode === "quick" || mode === "experience") && !confirmed)}>
          {busy ? "Salvando..." : "Salvar modalidade"}
        </button>

        {hasNotice && employee.status !== "terminated" && (
          <div className="process-action-row">
            <button className="btn btn-secondary process-action-button" type="button" disabled={busy} onClick={() => void tearNotice()}>
              Cancelar aviso prévio
            </button>
            <button className="btn btn-secondary process-action-button" type="button" disabled={busy} onClick={() => void failNotice()}>
              Não cumpriu o aviso
            </button>
          </div>
        )}

        {message && <p className="process-status-message" role="status">{message}</p>}
      </div>
    </form>
  );
}

