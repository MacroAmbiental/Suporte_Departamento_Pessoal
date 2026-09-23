import type { Employee } from "@/types/domain";

// Mesma classificação usada na listagem: cadastros antigos sem tipo são contrato.
export function isContractEmployee(employee: Employee) {
  const kind = employee.registrationData?.employeeKind;
  return kind !== "company" && kind !== "diarist";
}

export function canUseTerminationMode(employee: Employee, mode: string) {
  return !isContractEmployee(employee) || mode === "suspension" || mode === "contract_end";
}

export const contractTerminationRestriction = "Funcionários de contrato permitem somente Suspensão ou Término de contrato.";
