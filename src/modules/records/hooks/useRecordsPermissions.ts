import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import type { RecordsPermissions } from "@/modules/records/types";

export function useRecordsPermissions(): RecordsPermissions {
  const { can } = useAuth();

  return useMemo(() => ({
    canViewRecords: can("records", "view"),
    canCreateDocuments: can("records", "create"),
    canEditDocuments: can("records", "edit"),
    canDeleteDocuments: can("records", "delete"),
    canCreateAlerts: can("notifications", "create"),
    canEditAlerts: can("notifications", "edit"),
    canManageStandardDocuments: can("records", "edit"),
  }), [can]);
}
