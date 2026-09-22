import { createContext, useContext, type ReactNode } from "react";
import { useNotificationsModel, type NotificationsModel } from "@/modules/notifications/hooks/useNotificationsModel";

const NotificationsContext = createContext<NotificationsModel | undefined>(undefined);

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const value = useNotificationsModel();

  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

export function useNotificationsContext() {
  const context = useContext(NotificationsContext);

  if (!context) {
    throw new Error("useNotificationsContext deve ser usado dentro de NotificationsProvider");
  }

  return context;
}
