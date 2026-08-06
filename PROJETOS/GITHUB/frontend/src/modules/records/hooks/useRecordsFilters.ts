import { useCallback, useEffect, useMemo, useState } from "react";
import type { Company, CompanyGroup, CompanyGroupCompany, Department, Employee, Sector, Subsector } from "@/types/domain";
import type { RecordsFiltersState } from "@/modules/records/types";

export function createEmptyRecordsFilters(defaultGroupId = ""): RecordsFiltersState {
  return {
    groupIds: defaultGroupId ? [defaultGroupId] : [],
    companyIds: [],
    departmentIds: [],
    sectorIds: [],
    subsectorIds: [],
    employeeIds: [],
    cpfValues: [],
    search: "",
  };
}

type UseRecordsFiltersParams = {
  employees: Employee[];
  companies: Company[];
  companyGroups: CompanyGroup[];
  companyGroupCompanies: CompanyGroupCompany[];
  departments: Department[];
  sectors: Sector[];
  subsectors: Subsector[];
};

export function useRecordsFilters({
  employees,
  companies,
  companyGroups,
  companyGroupCompanies,
  departments,
  sectors,
  subsectors,
}: UseRecordsFiltersParams) {
  const groupOptions = useMemo(() => (
    companyGroups
      .filter((group) => group.active !== false)
      .map((group) => ({ value: group.id, label: group.name }))
      .sort((left, right) => left.label.localeCompare(right.label, "pt-BR", { sensitivity: "base", numeric: true }))
  ), [companyGroups]);
  const defaultGroupId = useMemo(() => {
    const macroGroup = groupOptions.find((group) => {
      const normalized = group.label
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase();
      return normalized.includes("grupo macro") || normalized.includes("macro");
    });
    return macroGroup?.value || groupOptions[0]?.value || "";
  }, [groupOptions]);
  const [filters, setFilters] = useState<RecordsFiltersState>(() => createEmptyRecordsFilters(defaultGroupId));
  const [defaultGroupInitialized, setDefaultGroupInitialized] = useState(Boolean(defaultGroupId));
  const groupCompanyIds = useMemo(() => {
    if (!filters.groupIds.length) return [] as string[];
    const selectedGroups = new Set(filters.groupIds);
    return Array.from(new Set(
      companyGroupCompanies
        .filter((relation) => selectedGroups.has(relation.groupId))
        .map((relation) => relation.companyId),
    ));
  }, [companyGroupCompanies, filters.groupIds]);
  const filteredCompanyOptions = useMemo(() => {
    const allowedCompanyIds = new Set(groupCompanyIds);
    return companies
      .filter((company) => !filters.groupIds.length || allowedCompanyIds.has(company.id))
      .map((company) => ({ value: company.id, label: company.name }))
      .sort((left, right) => left.label.localeCompare(right.label, "pt-BR", { sensitivity: "base", numeric: true }));
  }, [companies, filters.groupIds.length, groupCompanyIds]);
  const effectiveCompanyIds = useMemo(() => {
    if (filters.groupIds.length && filters.companyIds.length) {
      const allowedByGroup = new Set(groupCompanyIds);
      return filters.companyIds.filter((companyId) => allowedByGroup.has(companyId));
    }
    if (filters.companyIds.length) return filters.companyIds;
    if (filters.groupIds.length) return groupCompanyIds;
    return [] as string[];
  }, [filters.companyIds, filters.groupIds.length, groupCompanyIds]);
  const hasCompanyScope = Boolean(filters.groupIds.length || filters.companyIds.length);

  useEffect(() => {
    if (defaultGroupInitialized || !defaultGroupId) return;
    setFilters((current) => (
      current.groupIds.length
        ? current
        : { ...current, groupIds: [defaultGroupId], companyIds: [], departmentIds: [], sectorIds: [], subsectorIds: [] }
    ));
    setDefaultGroupInitialized(true);
  }, [defaultGroupId, defaultGroupInitialized]);

  useEffect(() => {
    const validGroupIds = new Set(groupOptions.map((group) => group.value));
    setFilters((current) => {
      const nextGroupIds = current.groupIds.filter((groupId) => validGroupIds.has(groupId));
      if (
        nextGroupIds.length === current.groupIds.length &&
        nextGroupIds.every((groupId, index) => groupId === current.groupIds[index])
      ) {
        return current;
      }
      return { ...current, groupIds: nextGroupIds, companyIds: [], departmentIds: [], sectorIds: [], subsectorIds: [] };
    });
  }, [groupOptions]);

  const filteredEmployees = useMemo(() => employees.filter((employee) => {
    const haystack = `${employee.name} ${employee.registration} ${employee.cpf || ""} ${employee.role} ${employee.position || ""}`.toLowerCase();
    const search = filters.search.trim().toLowerCase();

    return (!hasCompanyScope || effectiveCompanyIds.includes(employee.companyId))
      && (!filters.departmentIds.length || filters.departmentIds.includes(employee.departmentId))
      && (!filters.sectorIds.length || filters.sectorIds.includes(employee.sectorId))
      && (!filters.subsectorIds.length || filters.subsectorIds.includes(employee.subsectorId || ""))
      && (!filters.employeeIds.length || filters.employeeIds.includes(employee.id))
      && (!filters.cpfValues.length || filters.cpfValues.includes(employee.cpf || ""))
      && (!search || haystack.includes(search));
  }), [effectiveCompanyIds, employees, filters, hasCompanyScope]);

  const departmentOptions = useMemo(() => (
    departments
      .filter((department) => !hasCompanyScope || effectiveCompanyIds.includes(department.companyId))
      .map((department) => ({ value: department.id, label: department.name }))
  ), [departments, effectiveCompanyIds, hasCompanyScope]);

  const sectorOptions = useMemo(() => (
    sectors
      .filter((sector) => !hasCompanyScope || effectiveCompanyIds.includes(sector.companyId))
      .filter((sector) => !filters.departmentIds.length || filters.departmentIds.includes(sector.departmentId))
      .map((sector) => ({ value: sector.id, label: sector.name }))
  ), [effectiveCompanyIds, filters.departmentIds, hasCompanyScope, sectors]);

  const subsectorOptions = useMemo(() => (
    subsectors
      .filter((subsector) => !hasCompanyScope || effectiveCompanyIds.includes(subsector.companyId))
      .filter((subsector) => !filters.departmentIds.length || filters.departmentIds.includes(subsector.departmentId))
      .filter((subsector) => !filters.sectorIds.length || filters.sectorIds.includes(subsector.sectorId))
      .map((subsector) => ({ value: subsector.id, label: subsector.name }))
  ), [effectiveCompanyIds, filters.departmentIds, filters.sectorIds, hasCompanyScope, subsectors]);

  const employeeOptions = useMemo(() => (
    employees.map((employee) => ({ value: employee.id, label: employee.name }))
  ), [employees]);

  const cpfOptions = useMemo(() => (
    Array.from(new Set(employees.map((employee) => employee.cpf?.trim() || ""))).filter(Boolean).map((cpf) => ({ value: cpf, label: cpf }))
  ), [employees]);
  const groupFilterIsDefault = filters.groupIds.length === (defaultGroupId ? 1 : 0)
    && (!defaultGroupId || filters.groupIds[0] === defaultGroupId);

  const hasActiveFilters = Boolean(
    !groupFilterIsDefault
    || filters.companyIds.length
    || filters.departmentIds.length
    || filters.sectorIds.length
    || filters.subsectorIds.length
    || filters.employeeIds.length
    || filters.cpfValues.length
    || filters.search.trim(),
  );

  const setGroupIds = useCallback((groupIds: string[]) => {
    setFilters((current) => ({ ...current, groupIds, companyIds: [], departmentIds: [], sectorIds: [], subsectorIds: [] }));
  }, []);

  const setCompanyIds = useCallback((companyIds: string[]) => {
    setFilters((current) => ({ ...current, companyIds, departmentIds: [], sectorIds: [], subsectorIds: [] }));
  }, []);

  const setDepartmentIds = useCallback((departmentIds: string[]) => {
    setFilters((current) => ({ ...current, departmentIds, sectorIds: [], subsectorIds: [] }));
  }, []);

  const setSectorIds = useCallback((sectorIds: string[]) => {
    setFilters((current) => ({ ...current, sectorIds, subsectorIds: [] }));
  }, []);

  const setSubsectorIds = useCallback((subsectorIds: string[]) => {
    setFilters((current) => ({ ...current, subsectorIds }));
  }, []);

  const setEmployeeIds = useCallback((employeeIds: string[]) => {
    setFilters((current) => ({ ...current, employeeIds }));
  }, []);

  const setCpfValues = useCallback((cpfValues: string[]) => {
    setFilters((current) => ({ ...current, cpfValues }));
  }, []);

  const setSearch = useCallback((search: string) => {
    setFilters((current) => ({ ...current, search }));
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(createEmptyRecordsFilters(defaultGroupId));
  }, [defaultGroupId]);

  return {
    filters,
    filteredEmployees,
    groupOptions,
    companyOptions: filteredCompanyOptions,
    departmentOptions,
    sectorOptions,
    subsectorOptions,
    employeeOptions,
    cpfOptions,
    hasActiveFilters,
    resetFilters,
    setGroupIds,
    setCompanyIds,
    setDepartmentIds,
    setSectorIds,
    setSubsectorIds,
    setEmployeeIds,
    setCpfValues,
    setSearch,
  };
}
