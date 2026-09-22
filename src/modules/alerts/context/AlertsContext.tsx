import { createContext, useContext, type ReactNode } from "react";
import { useAlertsModel, type AlertsModel } from "@/modules/alerts/hooks/useAlertsModel";

const AlertsContext = createContext<AlertsModel | undefined>(undefined);

export function AlertsProvider({ children }: { children: ReactNode }) {
  const value = useAlertsModel();

  return <AlertsContext.Provider value={value}>{children}</AlertsContext.Provider>;
}

export function useAlertsContext() {
  const context = useContext(AlertsContext);

  if (!context) {
    throw new Error("useAlertsContext deve ser usado dentro de AlertsProvider");
  }

  return context;
}
