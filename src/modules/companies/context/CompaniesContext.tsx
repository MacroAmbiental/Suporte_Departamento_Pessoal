import { createContext, useContext, type ReactNode } from "react";
import { useCompaniesModel, type CompaniesModel } from "@/modules/companies/hooks/useCompaniesModel";

const CompaniesContext = createContext<CompaniesModel | undefined>(undefined);

export function CompaniesProvider({ children }: { children: ReactNode }) {
  const value = useCompaniesModel();

  return <CompaniesContext.Provider value={value}>{children}</CompaniesContext.Provider>;
}

export function useCompaniesContext() {
  const context = useContext(CompaniesContext);

  if (!context) {
    throw new Error("useCompaniesContext deve ser usado dentro de CompaniesProvider");
  }

  return context;
}
