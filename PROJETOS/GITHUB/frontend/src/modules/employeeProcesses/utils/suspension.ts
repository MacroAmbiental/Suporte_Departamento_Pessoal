import type { Employee } from "@/types/domain";
import { employeeLeaveEntryForDate } from "@/modules/employeeProcesses/utils/leavePeriods";

export const SUSPENSION_MAX_DOCUMENTS = 2;

export function isEmployeeSuspendedOnDate(employee: Employee, date: string) {
  if (employee.status === "terminated" || !date) return false;
  return Boolean(employeeLeaveEntryForDate(employee, date)?.kind === "suspension");
}

export function suspensionDays(start: string, end: string) {
  if (!start || !end || end < start) return 0;
  return Math.floor((Date.parse(`${end}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86400000) + 1;
}
