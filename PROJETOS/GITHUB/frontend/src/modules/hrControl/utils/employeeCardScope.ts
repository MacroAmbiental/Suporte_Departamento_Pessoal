import type { Employee } from "../../../types/domain";
import { isEmployeeTerminated } from "@/modules/employees/utils/employeeStatus";

export function employeeMatchesBaseFilters(employee: Employee, companyIds: Set<string>,
  restrictCompanies: boolean, teamIds: Set<string>, endDate: string, includeTerminated = false) {
  return (includeTerminated || !isEmployeeTerminated(employee)) &&
    (!employee.admissionDate || employee.admissionDate <= endDate) &&
    (!restrictCompanies || companyIds.has(employee.companyId)) &&
    (!teamIds.size || teamIds.has(employee.teamId || ""));
}
