import NoticeReductionFields from "./NoticeReductionFields";
import { noticeSpecialty, validNoticeReduction } from "../noticeSpecialty";
import { useState } from "react";
import { X, Save, CalendarClock, Zap, FileText, UserRound, ShieldAlert } from "lucide-react";
import type { Employee } from "@/types/domain";
import { useAuth } from "@/hooks/useAuth";
import { useDomainData } from "@/hooks/useDomainData";
import { todayISO, formatDate } from "@/utils/format";
import { terminationModes, type TerminationMode } from "../experience";

import "./scheduleDeactivation.css";
import { processEntryDate } from "../processEntryDate";
import { isInExperience } from "../experience";

const modeDetails = {
  indemnified: { icon: FileText, description: "Defina a saída efetiva com aviso indenizado." },
  employee: { icon: UserRound, description: "Informe o início do aviso e a data de saída." },
  quick: { icon: Zap, description: "Desative hoje, após confirmar a ação." },
};

export default function ScheduleDeactivationModal({ employee, onClose }: { employee: Employee; onClose: () => void }) {
  const data = useDomainData();
  const { can, user } = useAuth();
  const [applyReduction, setApplyReduction] = useState(employee.registrationData?.noticeReductionApplies === "true" || employee.registrationData?.terminationMode === "employer");
  const [reduction, setReduction] = useState(employee.registrationData?.noticeReduction || "");
  const [mode, setMode] = useState<TerminationMode | "">("");
  const [date, setDate] = useState(employee.registrationData?.scheduledDeactivationDate || "");
  const [start, setStart] = useState(todayISO());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [riskConfirmed, setRiskConfirmed] = useState(false);
  const today = todayISO();
  const effectiveDate = mode === "quick" ? today : date;
  const needsConfirmation = mode === "quick";
  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (saving || !mode || !effectiveDate || (needsConfirmation && !riskConfirmed) || !can("employees", "edit")) return;
    const current = data.employees.find((item) => item.id === employee.id);
    if (!current || current.registrationData?.dismissalApprovedAt || current.status === "terminated") { setError("O cadastro foi alterado. Feche e abra novamente o agendamento."); return; }
    if (effectiveDate < today || effectiveDate < employee.admissionDate || (["employee", "employer", "indemnified"].includes(mode) && (!start || start < employee.admissionDate || date < start))) { setError("Confira as datas: a saída não pode anteceder hoje, a admissão ou o início do aviso."); return; }
    if (!validNoticeReduction(mode, reduction, start, date)) { setError("Selecione a reducao e confira se os sete dias cabem no periodo do aviso."); return; }
    setSaving(true); setError("");
    try {
      const now = new Date().toISOString();
      await data.upsertEmployee({ ...current, status: effectiveDate <= today ? "terminated" : current.status, registrationData: { ...current.registrationData, processStartedAt: processEntryDate(current, isInExperience(current, today)) || now, terminationMode: mode, terminationRiskConfirmedAt: needsConfirmation && riskConfirmed ? now : "", terminationRiskConfirmedBy: needsConfirmation && riskConfirmed ? user?.id || "" : "", scheduledDeactivationDate: effectiveDate, deactivationEffectiveDate: effectiveDate, deactivationScheduledAt: now, deactivationCompletedDate: effectiveDate <= today ? today : "", noticeEndDate: (mode === "employee" || (mode === "indemnified" && applyReduction)) ? date : "", noticeDate: (mode === "employee" || (mode === "indemnified" && applyReduction)) ? date : "", noticeScheduledAt: (mode === "employee" || (mode === "indemnified" && applyReduction)) ? now : "", noticeCompletedDate: "", ...noticeSpecialty(mode, reduction, start, date), noticeReductionApplies: (["employee", "indemnified"].includes(mode) && applyReduction) ? "true" : "false", scheduledReactivationDate: "", reactivationEffectiveDate: "", reactivationScheduledAt: "", reactivationCompletedDate: "" }, updatedAt: now });
      onClose();
    } catch { setError("Não foi possível concluir o agendamento. Os anexos já salvos foram preservados; tente novamente."); }
    finally { setSaving(false); }
  }
  return <div className="modal-backdrop deactivation-backdrop">
    <form className="modal-panel deactivation-modal" role="dialog" aria-modal="true" aria-labelledby="schedule-deactivation-title" onSubmit={save}>
      <div className="modal-header"><span className="deactivation-heading-icon"><CalendarClock size={24} /></span><div><h2 id="schedule-deactivation-title">Agendar desligamento do Funcionário</h2><p>{employee.name}</p><small>Escolha como deseja encerrar o vínculo.</small></div><button type="button" className="icon-button" disabled={saving} onClick={onClose} aria-label="Fechar"><X size={18} /></button></div>
      <fieldset disabled={saving} className="deactivation-body">
                <div><h3 className="deactivation-section-title">Modalidade de desativação</h3><div className="deactivation-options" role="radiogroup" aria-label="Modalidade de desativação">
          {Object.entries(terminationModes).map(([value, label]) => {
            const detail = modeDetails[value as TerminationMode];
            const Icon = detail.icon;
            return <label key={value} className={`deactivation-option${mode === value ? " is-selected" : ""}${value === "quick" ? " is-quick" : ""}`}>
              <input type="radio" name="termination-mode" value={value} checked={mode === value} required onChange={() => { setMode(value as TerminationMode); setRiskConfirmed(false); setError(""); }} />
              <Icon size={21} /><span><strong>{label}</strong><small>{detail.description}</small></span>
            </label>;
          })}
        </div></div>
        {["employee", "employer", "indemnified"].includes(mode) && <label className="field">Início do aviso<input type="date" required min={employee.admissionDate} value={start} onChange={(event) => setStart(event.target.value)} /></label>}
        {mode && mode !== "quick" && <label className="field">Data de desativação / saída do controle de ponto<input type="date" required min={today} value={date} onChange={(event) => { setDate(event.target.value); setRiskConfirmed(false); }} /></label>}
    {(mode === "employee" || mode === "indemnified") && <NoticeReductionFields value={reduction} onChange={setReduction} end={date} applies={applyReduction} onAppliesChange={setApplyReduction} />}
        {mode === "quick" && <div className="deactivation-quick-summary"><ShieldAlert size={22} /><div><strong>Desativação imediata em {formatDate(today)}</strong><p>Ao confirmar, o funcionário ficará inativo e deixará de aparecer no controle de ponto a partir de hoje. Esta ação substitui qualquer agendamento anterior.</p><label className="deactivation-confirmation"><input type="checkbox" checked={riskConfirmed} onChange={(event) => setRiskConfirmed(event.target.checked)} />Confirmo a desativação de {employee.name} hoje e estou ciente de que o desligamento pode gerar multa ou indenização.</label></div></div>}
        {mode === "indemnified" && <p className="muted">A data informada é a saída efetiva. A projeção do aviso indenizado deve ser conferida pelo RH e não corresponde a um período trabalhado.</p>}
        {error && <p role="alert">{error}</p>}
      </fieldset>
      <div className="modal-footer"><button type="button" className="btn btn-secondary" disabled={saving} onClick={onClose}>Cancelar</button><button type="submit" className={`btn btn-primary${mode === "quick" ? " deactivation-submit-quick" : ""}`} disabled={saving || !mode || !effectiveDate || (needsConfirmation && !riskConfirmed)}><Save size={16} />{saving ? "Salvando..." : mode === "quick" ? "Desativar agora" : "Confirmar agendamento"}</button></div>
    </form>
  </div>;
}






