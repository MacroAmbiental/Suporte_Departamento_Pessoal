import { createContext, useContext, type ReactNode } from "react";
import { useEmployeesModel, type EmployeesModel } from "@/modules/employees/hooks/useEmployeesModel";

const EmployeesContext = createContext<EmployeesModel | undefined>(undefined);

export function EmployeesProvider({ children }: { children: ReactNode }) {
  const value = useEmployeesModel();

  return <EmployeesContext.Provider value={value}>{children}</EmployeesContext.Provider>;
}

export function useEmployeesContext() {
  const context = useContext(EmployeesContext);

  if (!context) {
    throw new Error("useEmployeesContext deve ser usado dentro de EmployeesProvider");
  }

  return context;
}
