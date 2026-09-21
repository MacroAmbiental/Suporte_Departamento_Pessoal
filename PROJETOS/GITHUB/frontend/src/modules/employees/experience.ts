import type { Employee } from "@/types/domain";
export const terminationModes = { indemnified: "Aviso prévio indenizado", employee: "Aviso prévio do empregado", quick: "Desativação rápida" } as const;
export const processModalities = {
  ...terminationModes,
  suspension: "Suspensão",
  notice: "Aviso prévio",
  experience: "Contrato de experiência",
} as const;
export const EXPERIENCE_MILESTONES = [30, 60] as const;
export const EXPERIENCE_DURATION_DAYS = 60;
export type TerminationMode = keyof typeof terminationModes;

export function employeeProcessModalityLabel(employee: Employee, date: string) {
  const fields = employee.registrationData || {};
  const mode = String(fields.terminationMode || "");
  const end = String(fields.noticeEndDate || fields.scheduledDeactivationDate || fields.deactivationEffectiveDate || "");
  const label = processModalities[mode as keyof typeof processModalities];

  if (employee.status === "terminated") return "";
  if (mode === "suspension") return fields.suspensionStartDate && fields.suspensionEndDate && fields.suspensionStartDate <= date && date <= fields.suspensionEndDate ? "Suspensão" : "";
  if (label && (!end || date <= end)) return label;
  if ((fields.noticeStartDate || fields.noticeScheduledAt) && (!end || (date >= String(fields.noticeStartDate || fields.noticeScheduledAt) && date < end))) return "Aviso prévio";
  if ((fields.scheduledDeactivationDate || fields.deactivationEffectiveDate) && !mode && !fields.noticeStartDate) return "Desativação rápida";
  if (isInExperience(employee, date)) return "Contrato de experiência";
  return "";
}
export function addDays(date: string, days: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "";
  const value = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(value.getTime())) return "";
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
export function experienceMilestones(employee: Employee) {
  return EXPERIENCE_MILESTONES.map((days) => ({ days, date: addDays(employee.admissionDate, days - 1) }));
}
export function isInExperience(employee: Employee, today: string) {
  const end = addDays(employee.admissionDate, EXPERIENCE_DURATION_DAYS - 1);
  return employee.status !== "terminated" && employee.registrationData?.employeeKind !== "diarist" && Boolean(end) && employee.admissionDate <= today && today <= end;
}
export function experienceWindow(employee: Employee, today: string, leadDays = 7) {
  const milestone = experienceMilestones(employee).find((item) => item.date >= today);
  return milestone ? { ...milestone, start: addDays(milestone.date, -leadDays) } : null;
}

export function experienceAlerts(employee: Employee, today: string) {
  const raw = Number(employee.registrationData?.experienceAlertDays || 7);
  const leadDays = Number.isInteger(raw) && raw >= 1 && raw <= 30 ? raw : 7;
  return experienceMilestones(employee).map((milestone) => {
    const remaining = Math.round((Date.parse(`${milestone.date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86400000);
    const acknowledged = milestone.days === 60 ? Boolean(employee.registrationData?.experienceConfirmedAt) : Boolean(employee.registrationData?.[`experienceContinued${milestone.days}At`]);
    return { ...milestone, remaining, acknowledged, alert: !acknowledged && remaining <= leadDays, overdue: !acknowledged && remaining < 0 };
  });
}
export function experienceEndingToday(employee: Employee, today: string) {
  if (!needsExperienceFollowup(employee, today)) return false;
  return experienceAlerts(employee, today).some((milestone) => milestone.days === EXPERIENCE_DURATION_DAYS && milestone.remaining === 0 && !milestone.acknowledged);
}

export function experienceTerminationAction(dismissalDate: string, milestoneEndDate: string, includeDetail = false) {
  if (!dismissalDate || !milestoneEndDate) return includeDetail ? "" : "normal";
  const dismissal = Date.parse(`${dismissalDate}T12:00:00Z`);
  const milestone = Date.parse(`${milestoneEndDate}T12:00:00Z`);

  if (dismissal === milestone) return includeDetail ? "Desligamento rápido: a data do desligamento coincide com o fim do marco; abre o modal de desligamento em modo rápido." : "quick";
  if (dismissal < milestone) {
    const detail = "Desligamento antes do fim do contrato de experiência: a rescisão antecipada pelo empregador pode gerar indenização prevista no Art. 479 da CLT, conforme a hipótese.";
    return includeDetail ? detail : "warning";
  }
  return includeDetail ? "Desligamento após o fim do marco." : "normal";
}

export function needsExperienceFollowup(employee: Employee, today: string) {
  const fields = employee.registrationData || {};
  if (fields.experienceConfirmedAt || employee.status === "terminated" || fields.employeeKind === "diarist" || !employee.admissionDate || employee.admissionDate > today) return false;
  return isInExperience(employee, today) || Boolean(fields.processStartedAt && !fields.terminationMode && !fields.scheduledDeactivationDate && !fields.deactivationEffectiveDate);
}


