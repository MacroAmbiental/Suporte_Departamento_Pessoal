import type { Employee } from "@/types/domain";
// Historical records use the scheduling timestamp; never substitute the notice start.
export function processEntryDate(employee: Employee, experience: boolean) {
  const fields = employee.registrationData || {};
  if (fields.processStartedAt) return fields.processStartedAt;
  const scheduled = [fields.noticeScheduledAt, fields.deactivationScheduledAt].filter(Boolean).sort()[0];
  if (scheduled) return scheduled;
  if (experience && employee.admissionDate) return [employee.admissionDate, employee.createdAt?.slice(0, 10) || ""].sort().at(-1) || "";
  return "";
}
