import { useMemo } from "react";
import type { DocumentAlert, Employee, EmployeeDocument } from "@/types/domain";

type UseSelectedEmployeeDocumentsParams = {
  employees: Employee[];
  employeeDocuments: EmployeeDocument[];
  documentAlerts: DocumentAlert[];
  filteredEmployees: Employee[];
  selectedEmployeeId: string;
};

export function isRecordsDismissalEmployee(employee?: Employee | null) {
  if (!employee) return false;

  const fields = employee.registrationData || {};
  const hasScheduledDismissal = Boolean(
    fields.terminationMode
    || fields.noticeStartDate
    || fields.noticeScheduledAt
    || fields.noticeEndDate
    || fields.noticeDate
    || fields.scheduledDeactivationDate
    || fields.deactivationEffectiveDate
    || fields.deactivationScheduledAt,
  );

  return employee.status === "terminated" || (hasScheduledDismissal && !fields.dismissalApprovedAt && !fields.dismissalCancelledAt);
}

export function isDismissalInProgressEmployee(employee?: Employee | null) {
  return isRecordsDismissalEmployee(employee) && !Boolean(employee?.registrationData?.dismissalApprovedAt);
}

export function isDismissalArchivedEmployee(employee?: Employee | null) {
  return Boolean(employee && employee.status === "terminated" && Boolean(employee.registrationData?.dismissalApprovedAt));
}

export function useSelectedEmployeeDocuments({
  employees,
  employeeDocuments,
  documentAlerts,
  filteredEmployees,
  selectedEmployeeId,
}: UseSelectedEmployeeDocumentsParams) {
  const effectiveEmployeeId = useMemo(() => {
    if (selectedEmployeeId && filteredEmployees.some((employee) => employee.id === selectedEmployeeId)) {
      return selectedEmployeeId;
    }

    return filteredEmployees[0]?.id || "";
  }, [filteredEmployees, selectedEmployeeId]);

  const selectedEmployee = useMemo(() => (
    employees.find((employee) => employee.id === effectiveEmployeeId)
  ), [effectiveEmployeeId, employees]);

  const selectedDocuments = useMemo(() => (
    selectedEmployee
      ? employeeDocuments.filter((document) => document.employeeId === selectedEmployee.id)
      : []
  ), [employeeDocuments, selectedEmployee]);

  const selectedDocumentIds = useMemo(() => new Set(selectedDocuments.map((document) => document.id)), [selectedDocuments]);

  const activeAlertCount = useMemo(() => {
    if (isDismissalArchivedEmployee(selectedEmployee)) {
      return 0;
    }

    return documentAlerts.filter((alert) => selectedDocumentIds.has(alert.documentId) && alert.status !== "completed").length;
  }, [documentAlerts, selectedDocumentIds, selectedEmployee]);

  return {
    effectiveEmployeeId,
    selectedEmployee,
    selectedDocuments,
    activeAlertCount,
  };
}
