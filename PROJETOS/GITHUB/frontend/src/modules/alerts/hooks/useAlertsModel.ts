import { useMemo, useState } from "react";
import { useDomainData } from "@/hooks/useDomainData";
import { useAuth } from "@/hooks/useAuth";

export function useAlertsModel() {
  const data = useDomainData();
  const { can } = useAuth();

  const canCreateAlerts = can("notifications", "create");
  const canEditAlerts = can("notifications", "edit");
  const canDeleteAlerts = can("notifications", "delete");

  const [filters, setFilters] = useState({
    search: "",
    employeeIds: [] as string[],
  });

  const filteredAlerts = useMemo(() => {
    return data.documentAlerts.filter((alert) => {
      const searchText = `${alert.title} ${alert.description}`.toLowerCase();
      return (
        (!filters.search || searchText.includes(filters.search.toLowerCase()))
        && (!filters.employeeIds.length || filters.employeeIds.includes(alert.employeeId))
      );
    });
  }, [data.documentAlerts, filters]);

  return {
    data,
    canCreateAlerts,
    canEditAlerts,
    canDeleteAlerts,
    filters,
    setFilters,
    filteredAlerts,
  };
}

export type AlertsModel = ReturnType<typeof useAlertsModel>;
