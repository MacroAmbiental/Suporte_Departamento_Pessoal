import { useMemo, useState } from "react";
import { useDomainData } from "@/hooks/useDomainData";
import { useAuth } from "@/hooks/useAuth";
import type { Employee } from "@/types/domain";

function normalizeFilterValue(value?: string) {
  return String(value || "").trim().toLocaleLowerCase("pt-BR");
}

export function useEmployeesModel() {
  const data = useDomainData();
  const { can } = useAuth();

  const canCreateEmployees = can("employees", "create");
  const canEditEmployees = can("employees", "edit");
  const canDeleteEmployees = can("employees", "delete");

  const [filters, setFilters] = useState({
    companyIds: [] as string[],
    departmentIds: [] as string[],
    sectorIds: [] as string[],
    subsectorIds: [] as string[],
    teamIds: [] as string[],
    roleValues: [] as string[],
    employeeIds: [] as string[],
    cpfValues: [] as string[],
    usernameValues: [] as string[],
    statuses: [] as string[],
    search: "",
  });

  const systemUserByEmployeeId = useMemo(() => new Map(
    data.systemUsers.filter((systemUser) => systemUser.employeeId).map((systemUser) => [systemUser.employeeId as string, systemUser]),
  ), [data.systemUsers]);

  const teamById = useMemo(() => new Map(
    data.teams.map((team) => [team.id, team]),
  ), [data.teams]);

  const filteredEmployees = useMemo(() => data.employees.filter((employee) => {
    const login = systemUserByEmployeeId.get(employee.id);
    const team = employee.teamId ? teamById.get(employee.teamId) : undefined;
    const searchText = `${employee.name} ${employee.registration} ${employee.cpf} ${employee.role} ${employee.position} ${team?.name || ""} ${login?.username || ""}`.toLowerCase();
    return (
      (!filters.companyIds.length || filters.companyIds.includes(employee.companyId))
      && (!filters.departmentIds.length || filters.departmentIds.includes(employee.departmentId))
      && (!filters.sectorIds.length || filters.sectorIds.includes(employee.sectorId))
      && (!filters.subsectorIds.length || filters.subsectorIds.includes(employee.subsectorId ?? ""))
      && (!filters.teamIds.length || filters.teamIds.includes(employee.teamId ?? ""))
      && (!filters.roleValues.length || filters.roleValues.includes(normalizeFilterValue(employee.role)))
      && (!filters.employeeIds.length || filters.employeeIds.includes(employee.id))
      && (!filters.cpfValues.length || filters.cpfValues.includes(employee.cpf?.trim() || ""))
      && (!filters.usernameValues.length || filters.usernameValues.includes(login?.username || ""))
      && (!filters.statuses.length || filters.statuses.includes(employee.status))
      && (!filters.search || searchText.includes(filters.search.toLowerCase()))
    );
  }), [data.employees, filters, systemUserByEmployeeId, teamById]);

  return {
    data,
    canCreateEmployees,
    canEditEmployees,
    canDeleteEmployees,
    filters,
    setFilters,
    filteredEmployees,
  };
}

export type EmployeesModel = ReturnType<typeof useEmployeesModel>;
