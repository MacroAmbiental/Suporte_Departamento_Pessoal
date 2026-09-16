import { useMemo } from "react";
import type { Company, Department, DocumentAlert, Employee, EmployeeDocument } from "@/types/domain";
import type { CompanyFolderGroup } from "@/modules/records/types";

const fallbackCompanyId = "__without-company";

function isDismissalStateEmployee(employee?: Employee | null) {
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

function isDismissalArchivedEmployee(employee?: Employee | null) {
  return Boolean(employee && employee.status === "terminated" && Boolean(employee.registrationData?.dismissalApprovedAt));
}

type UseCompanyFolderGroupsParams = {
  employees: Employee[];
  companies: Company[];
  departments: Department[];
  employeeDocuments: EmployeeDocument[];
  documentAlerts: DocumentAlert[];
};

export function useCompanyFolderGroups({
  employees,
  companies,
  departments,
  employeeDocuments,
  documentAlerts,
}: UseCompanyFolderGroupsParams) {
  return useMemo(() => {
    const companyById = new Map(companies.map((company) => [company.id, company]));
    const departmentById = new Map(departments.map((department) => [department.id, department]));
    const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
    const activeAlertDocumentIds = new Set(
      documentAlerts
        .filter((alert) => alert.status !== "completed")
        .map((alert) => alert.documentId),
    );

    const documentStatsByEmployeeId = employeeDocuments.reduce<Map<string, {
      documentCount: number;
      documentsWithoutAlert: Array<{ id: string; name: string }>;
    }>>((acc, document) => {
      const employee = employeeById.get(document.employeeId);
      const current = acc.get(document.employeeId) || { documentCount: 0, documentsWithoutAlert: [] };
      current.documentCount += 1;

      if (!isDismissalStateEmployee(employee) && !activeAlertDocumentIds.has(document.id)) {
        current.documentsWithoutAlert.push({
          id: document.id,
          name: document.name || "Documento sem nome",
        });
      }

      acc.set(document.employeeId, current);
      return acc;
    }, new Map());

    const groups = employees.reduce<Map<string, CompanyFolderGroup>>((acc, employee) => {
      const company = companyById.get(employee.companyId);
      const companyId = company?.id || employee.companyId || fallbackCompanyId;
      const companyName = company?.name || "Sem empresa";
      const departmentName = departmentById.get(employee.departmentId)?.name || "-";
      const documentStats = documentStatsByEmployeeId.get(employee.id) || { documentCount: 0, documentsWithoutAlert: [] };
      const documentsWithoutAlert = [...documentStats.documentsWithoutAlert]
        .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
      const documentCount = documentStats.documentCount;
      const missingAlertCount = isDismissalStateEmployee(employee) || isDismissalArchivedEmployee(employee) ? 0 : documentsWithoutAlert.length;
      const group = acc.get(companyId) || {
        id: companyId,
        companyName,
        employeeCount: 0,
        documentCount: 0,
        missingAlertCount: 0,
        employees: [],
      };

      group.employeeCount += 1;
      group.documentCount += documentCount;
      group.missingAlertCount += missingAlertCount;
      group.employees.push({
        employee,
        companyName,
        departmentName,
        documentCount,
        missingAlertCount,
        documentsWithoutAlert,
      });
      acc.set(companyId, group);
      return acc;
    }, new Map());

    return Array.from(groups.values())
      .map((group) => ({
        ...group,
        employees: [...group.employees].sort((a, b) => a.employee.name.localeCompare(b.employee.name, "pt-BR")),
      }))
      .sort((a, b) => a.companyName.localeCompare(b.companyName, "pt-BR"));
  }, [companies, departments, documentAlerts, employeeDocuments, employees]);
}
