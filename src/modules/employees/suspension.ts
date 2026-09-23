import type { Employee } from "@/types/domain";

export function isEmployeeSuspendedOnDate(employee: Employee, date: string) {
  const fields = employee.registrationData || {};
  const start = String(fields.suspensionStartDate || "");
  const end = String(fields.suspensionEndDate || "");
  return employee.status !== "terminated" && Boolean(start && end && date) && start <= date && date <= end;
}
