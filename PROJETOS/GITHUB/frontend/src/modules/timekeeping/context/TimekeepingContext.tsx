import { createContext, useContext, type ReactNode } from "react";
import { useTimekeepingModel, type TimekeepingModel } from "@/modules/timekeeping/hooks/useTimekeepingModel";

const TimekeepingContext = createContext<TimekeepingModel | undefined>(undefined);

export function TimekeepingProvider({ children }: { children: ReactNode }) {
  const value = useTimekeepingModel();

  return <TimekeepingContext.Provider value={value}>{children}</TimekeepingContext.Provider>;
}

export function useTimekeepingContext() {
  const context = useContext(TimekeepingContext);

  if (!context) {
    throw new Error("useTimekeepingContext deve ser usado dentro de TimekeepingProvider");
  }

  return context;
}
