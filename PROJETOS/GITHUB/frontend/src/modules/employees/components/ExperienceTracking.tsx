import { useState } from "react";
import type { Employee } from "@/types/domain";
import { useDomainData } from "@/hooks/useDomainData";
import { useAuth } from "@/hooks/useAuth";
import { experienceAlerts } from "../experience";
import { formatDate, todayISO } from "@/utils/format";
export default function ExperienceTracking({ employee, today = todayISO(), compact = false }: { employee: Employee; today?: string; compact?: boolean }) {
  const data = useDomainData();
  const { can, user } = useAuth();
  const savedDays = Number(employee.registrationData?.experienceAlertDays || 7);
  const [days, setDays] = useState(savedDays);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const milestones = experienceAlerts(employee, today);
  const displayedMilestones = compact ? milestones.filter((item) => item.alert) : milestones;
  async function save(milestoneDays?: number) {
    if (!can("employees", "edit") || busy || !Number.isInteger(days) || days < 1 || days > 30) return;
    const current = data.employees.find((item) => item.id === employee.id);
    if (!current || current.registrationData?.dismissalApprovedAt || current.status === "terminated" || current.registrationData?.experienceConfirmedAt) return;
    const milestone = experienceAlerts(current, today).find((item) => item.days === milestoneDays);
    if (milestoneDays && (!milestone?.alert || current.registrationData?.scheduledDeactivationDate || current.registrationData?.deactivationEffectiveDate)) return;
    setBusy(true); setMessage("");
    try {
      const now = new Date().toISOString();
      const fields = { ...current.registrationData };
      if (milestoneDays) {
        fields[`experienceContinued${milestoneDays}At`] = now;
        fields[`experienceContinued${milestoneDays}By`] = user?.id || "";
        if (milestoneDays === 60) {
          fields.experienceConfirmedAt = now;
          fields.experienceConfirmedBy = user?.id || "";
          fields.employmentContractType = "indefinite";
        }
      } else fields.experienceAlertDays = String(days);
      await data.upsertEmployee({ ...current, registrationData: fields, updatedAt: now });
      setMessage(milestoneDays ? milestoneDays === 60 ? "Contratação definitiva registrada." : "Continuidade registrada. Alerta deste marco encerrado." : "Antecedência salva para os dois marcos.");
    } catch { setMessage("Não foi possível concluir. Confira os dados e tente novamente."); }
    finally { setBusy(false); }
  }
  return <div className={compact ? "experience-tracking-compact" : "experience-tracking"}>
    {displayedMilestones.map((milestone) => {
      const statusClass = milestone.acknowledged ? "is-ok" : milestone.overdue ? "is-danger" : milestone.alert ? "is-warning" : "is-muted";
      const statusText = milestone.acknowledged ? "Continuidade confirmada" : milestone.remaining < 0 ? `Vencido há ${Math.abs(milestone.remaining)} dia(s)` : milestone.remaining === 0 ? "Vence hoje" : `Faltam ${milestone.remaining} dia(s)`;
      const milestoneLabel = `${milestone.days / 30}º marco (${milestone.days} dias)`;
      return <div key={milestone.days} className="experience-tracking-item">
        <div className="experience-tracking-item-main">
          <span className="experience-tracking-item-label">{milestoneLabel}</span>
          <span className="experience-tracking-item-date">{formatDate(milestone.date)}</span>
        </div>
        <div className="experience-tracking-item-side">
          <span className={`experience-tracking-item-status ${statusClass}`}>{statusText}</span>
          {milestone.alert && can("employees", "edit") && !employee.registrationData?.dismissalApprovedAt && <button type="button" className="btn btn-secondary" disabled={busy || Boolean(employee.registrationData?.scheduledDeactivationDate || employee.registrationData?.deactivationEffectiveDate)} onClick={() => void save(milestone.days)}>Continuar</button>}
        </div>
      </div>;
    })}
    {compact && !displayedMilestones.length && <small className="muted">Sem alerta pendente</small>}
    {!compact && <small className="muted">A antecedência vale para os dois marcos. No último, continuar registra a contratação definitiva. Havendo desligamento agendado, revise-o antes de continuar.</small>}
    {!compact && can("employees", "edit") && !employee.registrationData?.dismissalApprovedAt && <div className="experience-tracking-config"><label>Antecedência (dias)</label><input aria-label={`Antecedência do alerta de ${employee.name}`} type="number" min={1} max={30} value={days} disabled={busy} onChange={(event) => setDays(Number(event.target.value))} /><button className="btn btn-secondary" type="button" disabled={busy || !Number.isInteger(days) || days < 1 || days > 30 || days === savedDays} onClick={() => void save()}>{busy ? "Salvando..." : "Salvar"}</button></div>}
    {message && <small role="status">{message}</small>}
  </div>;
}



