import type { Employee } from "@/types/domain";

export const terminationModes = { indemnified: "Aviso prévio indenizado", employee: "Aviso prévio do empregado", quick: "Desativação rápida" } as const;
export const processModalities = { ...terminationModes, suspension: "Suspensão", notice: "Aviso prévio", experience: "Contrato de experiência" } as const;

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
  return isInExperience(employee, date) ? "Contrato de experiência" : "";
}

export function isInExperience(employee: Employee, today: string) {
  const value = new Date(`${employee.admissionDate}T12:00:00Z`);
  if (!Number.isFinite(value.getTime())) return false;
  value.setUTCDate(value.getUTCDate() + 59);
  const end = value.toISOString().slice(0, 10);
  return employee.status !== "terminated" && employee.registrationData?.employeeKind !== "diarist" && employee.admissionDate <= today && today <= end;
}
