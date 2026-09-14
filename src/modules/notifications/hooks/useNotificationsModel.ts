import { useMemo, useState } from "react";
import { useDomainData } from "@/hooks/useDomainData";
import { useAuth } from "@/hooks/useAuth";

export function useNotificationsModel() {
  const data = useDomainData();
  const { can } = useAuth();
  const notifications = "notifications" in data && Array.isArray(data.notifications) ? data.notifications : [];

  const canCreateNotifications = can("notifications", "create");
  const canEditNotifications = can("notifications", "edit");
  const canDeleteNotifications = can("notifications", "delete");

  const [filters, setFilters] = useState({
    search: "",
    employeeIds: [] as string[],
  });

  const filteredNotifications = useMemo(() => {
    return notifications.filter((notification) => {
      const searchText = `${notification.title} ${notification.description}`.toLowerCase();
      return (
        (!filters.search || searchText.includes(filters.search.toLowerCase()))
        && (!filters.employeeIds.length || filters.employeeIds.includes(notification.employeeId))
      );
    });
  }, [notifications, filters]);

  return {
    data,
    canCreateNotifications,
    canEditNotifications,
    canDeleteNotifications,
    filters,
    setFilters,
    filteredNotifications,
  };
}

export type NotificationsModel = ReturnType<typeof useNotificationsModel>;
