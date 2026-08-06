import { createContext, useContext, type ReactNode } from "react";
import { useBenefitsModel, type BenefitsModel } from "@/modules/benefits/hooks/useBenefitsModel";

const BenefitsContext = createContext<BenefitsModel | undefined>(undefined);

export function BenefitsProvider({ children }: { children: ReactNode }) {
  const value = useBenefitsModel();

  return <BenefitsContext.Provider value={value}>{children}</BenefitsContext.Provider>;
}

export function useBenefitsContext() {
  const context = useContext(BenefitsContext);

  if (!context) {
    throw new Error("useBenefitsContext deve ser usado dentro de BenefitsProvider");
  }

  return context;
}
