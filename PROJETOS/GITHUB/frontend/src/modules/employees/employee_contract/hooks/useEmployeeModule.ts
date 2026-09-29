import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import type { EmployeeModuleConfig } from "../types";

export const employeeModuleConfig: EmployeeModuleConfig = {
  kind: "contract",
  title: "Funcionários contratados",
  storageKey: "employee_contract",
};

export function useEmployeeModule() {
  const { can } = useAuth();
  return useMemo(() => ({
    ...employeeModuleConfig,
    canCreate: can("employees", "create"),
    canEdit: can("employees", "edit"),
    canDelete: can("employees", "delete"),
  }), [can]);
}
