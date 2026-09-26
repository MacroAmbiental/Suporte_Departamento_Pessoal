import type { Employee } from "@/types/domain";
import { employeeKindOf } from "@/common/utils/employeeKind";

// Mesma classificação usada na listagem: cadastros antigos sem tipo são contrato.
export function isContractEmployee(employee: Employee) {
  return employeeKindOf(employee) === "contract";
}

export function canUseTerminationMode(employee: Employee, mode: string) {
  return !isContractEmployee(employee) || mode === "suspension" || mode === "contract_end";
}

export const contractTerminationRestriction = "Para Funcionário - Contrato, somente Suspensão ou Término de contrato estão disponíveis.";
