import type { Employee } from "@/types/domain";
export function noticeWorkAdjustment(employee: Employee | undefined, date: string) {
  const fields = employee?.registrationData || {};
  const end = fields.noticeEndDate || fields.scheduledDeactivationDate || fields.deactivationEffectiveDate || "";
  if ((fields.terminationMode !== "employer" && fields.noticeReductionApplies !== "true") || !fields.noticeStartDate || !end || date < fields.noticeStartDate || date >= end) return "none";
  if (fields.noticeReduction === "hours") return "hours";
  if (fields.noticeReduction === "days" && fields.noticeLeaveStartDate && fields.noticeLeaveEndDate && date >= fields.noticeLeaveStartDate && date <= fields.noticeLeaveEndDate) return "leave";
  return "none";
}
export function noticeAdjustedMinutes(employee: Employee | undefined, date: string, minutes: number) {
  const adjustment = noticeWorkAdjustment(employee, date);
  return adjustment === "leave" ? 0 : adjustment === "hours" ? Math.max(0, minutes - 120) : minutes;
}
