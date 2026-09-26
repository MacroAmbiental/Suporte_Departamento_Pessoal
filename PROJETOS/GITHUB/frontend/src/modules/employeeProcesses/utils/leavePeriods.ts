import type { Employee } from "@/types/domain";

export type LeaveEntryKind = "suspension" | "leave" | "license";

export type LeaveEntry = {
  kind: LeaveEntryKind;
  label: string;
  start: string;
  end: string;
  reason: string;
};

export function employeeLeaveEntries(employee: Employee | null | undefined): LeaveEntry[] {
  if (!employee) return [];
  const fields = employee.registrationData || {};
  const entries: LeaveEntry[] = [];

  const suspensionStart = String(fields.suspensionStartDate || "");
  const suspensionEnd = String(fields.suspensionEndDate || "");
  if (suspensionStart && suspensionEnd) {
    entries.push({
      kind: "suspension",
      label: "Suspensão",
      start: suspensionStart,
      end: suspensionEnd,
      reason: String(fields.suspensionReason || "—"),
    });
  }

  const leaveStart = String(fields.leaveStartDate || "");
  const leaveEnd = String(fields.leaveEndDate || "");
  if (leaveStart && leaveEnd) {
    entries.push({
      kind: "leave",
      label: String(fields.leaveType || "Afastamento"),
      start: leaveStart,
      end: leaveEnd,
      reason: String(fields.leaveReason || fields.absenceReason || "—"),
    });
  }

  const licenseStart = String(fields.licenseStartDate || "");
  const licenseEnd = String(fields.licenseEndDate || "");
  if (licenseStart && licenseEnd) {
    entries.push({
      kind: "license",
      label: String(fields.licenseType || "Licença"),
      start: licenseStart,
      end: licenseEnd,
      reason: String(fields.licenseReason || fields.absenceReason || "—"),
    });
  }

  return entries
    .filter((entry) => entry.start && entry.end)
    .sort((left, right) => left.start.localeCompare(right.start));
}

export function employeeLeaveEntryForDate(employee: Employee | null | undefined, date: string): LeaveEntry | undefined {
  if (!date || !employee) return undefined;
  return employeeLeaveEntries(employee).find((entry) => entry.start <= date && date <= entry.end);
}

export function isEmployeeLeaveOnDate(employee: Employee | null | undefined, date: string): boolean {
  return Boolean(employeeLeaveEntryForDate(employee, date));
}
