import type { Employee } from "@/types/domain";

export const SUSPENSION_MAX_DOCUMENTS = 2;

export function isEmployeeSuspendedOnDate(employee: Employee, date: string) {
  const fields = employee.registrationData || {};
  const start = String(fields.suspensionStartDate || "");
  const end = String(fields.suspensionEndDate || "");

  if (employee.status === "terminated" || !start || !end || !date) return false;
  return start <= date && date <= end;
}

export function suspensionDays(start: string, end: string) {
  if (!start || !end || end < start) return 0;
  return Math.floor((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86400000) + 1;
}
