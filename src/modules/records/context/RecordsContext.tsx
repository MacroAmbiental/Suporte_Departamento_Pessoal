import { createContext, useContext, type ReactNode } from "react";
import { useRecordsModel, type RecordsModel } from "@/modules/records/hooks/useRecordsModel";

const RecordsContext = createContext<RecordsModel | undefined>(undefined);

export function RecordsProvider({ children }: { children: ReactNode }) {
  const value = useRecordsModel();

  return (
    <RecordsContext.Provider value={value}>
      {children}
    </RecordsContext.Provider>
  );
}

export function useRecordsContext() {
  const context = useContext(RecordsContext);

  if (!context) {
    throw new Error("useRecordsContext deve ser usado dentro de RecordsProvider");
  }

  return context;
}
