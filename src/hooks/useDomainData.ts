import { useContext } from "react";
import { DomainDataContext } from "@/app/providers/DomainDataProvider";

export function useDomainData() {
  const context = useContext(DomainDataContext);

  if (!context) {
    throw new Error("useDomainData deve ser usado dentro de DomainDataProvider");
  }

  return context;
}
