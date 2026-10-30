import type { Employee } from "@/types/domain";

export type LeaveEntryKind = "suspension" | "leave" | "license" | "certificate";

export type LeaveEntry = {
  kind: LeaveEntryKind;
  label: string;
  start: string;
  end: string;
  reason: string;
  /** Só nos períodos da aba Afastados (lista); os campos antigos do cadastro não têm. */
  periodId?: string;
};

// Períodos lançados na aba Afastados: vários por funcionário (INSS, atestado de
// vários dias, licença). Ficam no cadastro como texto JSON porque registrationData
// só guarda texto; assim ponto, etiquetas e férias leem tudo pelo mesmo caminho.
export const LEAVE_PERIODS_FIELD = "leavePeriods";

export type LeavePeriod = {
  id: string;
  kind: Exclude<LeaveEntryKind, "suspension">;
  label: string;
  start: string;
  end: string;
  reason: string;
  cid?: string;
  /** "secullum" quando veio do botão Importar da aba Afastados. */
  origin?: "secullum";
  /** "lancado" = o mesmo período está no Secullum; "sem-cpf" = funcionário fora do Secullum. */
  secullum?: "lancado" | "sem-cpf";
  createdAt: string;
  createdBy: string;
  updatedAt: string;
};

export function readLeavePeriods(employee: Employee | null | undefined): LeavePeriod[] {
  const raw = employee?.registrationData?.[LEAVE_PERIODS_FIELD];
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => item && item.id && item.start && item.end) : [];
  } catch {
    return [];
  }
}

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

  readLeavePeriods(employee).forEach((period) => entries.push({
    kind: period.kind,
    label: period.label,
    start: period.start,
    end: period.end,
    reason: period.reason || "—",
    periodId: period.id,
  }));

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
