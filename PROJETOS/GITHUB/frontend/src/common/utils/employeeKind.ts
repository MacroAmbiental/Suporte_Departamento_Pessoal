import type { Employee } from "../../types/domain";

export type EmployeeKind = "contract" | "company" | "diarist";

// Keep Firestore's existing codes. Older employee records without a code are
// contract employees, as in the Employees list and termination rules.
export const employeeKindLabels: Record<EmployeeKind, string> = {
  contract: "Funcionário - Contrato",
  company: "Funcionário - CLT",
  diarist: "Diarista",
};

export function employeeKindOf(employee?: Employee): EmployeeKind {
  const kind = employee?.registrationData?.employeeKind ||
    (employee as Employee & { employeeKind?: string } | undefined)?.employeeKind;
  return kind === "company" || kind === "diarist" ? kind : "contract";
}
