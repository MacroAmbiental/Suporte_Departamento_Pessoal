import { useMemo } from "react";
import type { DocumentAlert, Employee, EmployeeDocument } from "@/types/domain";

type UseSelectedEmployeeDocumentsParams = {
  employees: Employee[];
  employeeDocuments: EmployeeDocument[];
  documentAlerts: DocumentAlert[];
  filteredEmployees: Employee[];
  selectedEmployeeId: string;
};

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

  const activeAlertCount = useMemo(() => (
    documentAlerts.filter((alert) => selectedDocumentIds.has(alert.documentId) && alert.status !== "completed").length
  ), [documentAlerts, selectedDocumentIds]);

  return {
    effectiveEmployeeId,
    selectedEmployee,
    selectedDocuments,
    activeAlertCount,
  };
}
