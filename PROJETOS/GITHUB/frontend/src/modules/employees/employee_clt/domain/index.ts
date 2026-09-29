import type { Employee } from "@/types/domain";
import { employeeKindOf } from "@/common/utils/employeeKind";
import type { EmployeeModuleKind } from "../types";

export function isEmployeeInModule(employee: Employee, kind: EmployeeModuleKind) {
  return employeeKindOf(employee) === kind;
}
