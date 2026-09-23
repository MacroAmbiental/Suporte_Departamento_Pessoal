import { useMemo, useState } from "react";
import { useDomainData } from "@/hooks/useDomainData";
import { useAuth } from "@/hooks/useAuth";
import { todayISO } from "@/utils/format";
import type { TimekeepingFilters } from "@/modules/timekeeping/types";
import { useMonthlyTimeRecords } from "@/modules/timekeeping/hooks/useMonthlyTimeRecords";
import { employeeProcessModalityLabel, processModalities } from "@/modules/employees/experience";
import type {
  Employee,
  EmployeeComplement,
  EmployeeStatus,
  TimeRecord,
} from "@/types/domain";

export const initialTimekeepingFilters: TimekeepingFilters = {
  companyIds: [],
  departmentIds: [],
  sectorIds: [],
  realTeamIds: [],
  dayTeamIds: [],
  employeeIds: [],
  cpfValues: [],
  statuses: [],
  terminationModes: [],
  date: todayISO(),
  search: "",
};

function compareText(a: string, b: string) {
  return a.localeCompare(b, "pt-BR", { sensitivity: "base", numeric: true });
}

function sortOptions<T extends { label: string }>(options: T[]) {
  return [...options].sort((a, b) => compareText(a.label || "", b.label || ""));
}

const historicalEmployeeComplement: EmployeeComplement = {
  email: "",
  emergencyContact: "",
  transportVoucher: false,
  mealVoucher: false,
  foodVoucher: false,
  healthPlan: false,
  dentalPlan: false,
  customBenefits: {},
  notes: "",
};

function historicalEmployeeFromTimeRecord(record: TimeRecord): Employee {
  return {
    id: record.employeeId,
    companyId: record.companyId,
    groupId: record.groupId || "",
    departmentId: record.departmentId || "",
    sectorId: record.sectorId || "",
    subsectorId: record.subsectorId || "",
    teamId: record.realTeamId || record.dayTeamId || "",
    isTeamLead: false,
    registration: "",
    name: record.employeeName || "Funcionário removido",
    cpf: "",
    phone: "",
    role: record.functionName || "",
    position: "",
    workSchedule: "",
    workScheduleDays: [],
    weeklyHours: 0,
    salary: 0,
    admissionDate: record.date,
    status: "active",
    complement: { ...historicalEmployeeComplement },
    registrationData: {
      historicalTimekeepingOnly: "true",
    },
    createdAt: record.updatedAt || record.date,
    updatedAt: record.updatedAt || record.date,
  };
}

export function employeeEffectiveStatusForDate(
  employee: Employee,
  date: string,
): EmployeeStatus {
  if (!date) return employee.status;
  const registrationData = employee.registrationData || {};
  const reactivationDate = String(
    registrationData.scheduledReactivationDate ||
      registrationData.reactivationEffectiveDate ||
      "",
  );
  if (reactivationDate && date >= reactivationDate) return "active";

  const deactivationDate = String(
    registrationData.scheduledDeactivationDate ||
      registrationData.deactivationEffectiveDate ||
      registrationData.noticeEndDate ||
      registrationData.noticeDate ||
      registrationData.terminationDate ||
      registrationData.dismissalDate ||
      "",
  );
  if (deactivationDate && (date > deactivationDate || (date === deactivationDate && registrationData.terminationWorkedOnDeactivationDate !== "true"))) return "terminated";
  if (deactivationDate && date === deactivationDate && registrationData.terminationWorkedOnDeactivationDate === "true") return "active";
  if (employee.status === "terminated" && deactivationDate && date < deactivationDate)
    return "active";

  return employee.status;
}

export function useTimekeepingModel() {
  const domainData = useDomainData();
  const { can } = useAuth();
  const [filters, setFilters] = useState<TimekeepingFilters>(initialTimekeepingFilters);
  const { records: monthlyTimeRecords, loading: timeRecordsLoading } = useMonthlyTimeRecords(filters.date);
  const data = useMemo(() => ({
    ...domainData,
    timeRecords: monthlyTimeRecords,
    loading: domainData.loading || timeRecordsLoading,
  }), [domainData, monthlyTimeRecords, timeRecordsLoading]);

  const canCreateTimekeeping = can("timekeeping", "create");
  const canEditTimekeeping = can("timekeeping", "edit");
  const canDeleteTimekeeping = can("timekeeping", "delete");

  const employeesForTimekeeping = useMemo(() => {
    const employeesById = new Map(
      data.employees.map((employee) => [employee.id, employee]),
    );
    data.timeRecords.forEach((record) => {
      if (filters.date && record.date !== filters.date) return;
      if (employeesById.has(record.employeeId)) return;
      employeesById.set(record.employeeId, historicalEmployeeFromTimeRecord(record));
    });
    return Array.from(employeesById.values());
  }, [data.employees, data.timeRecords, filters.date]);

  const employeeById = useMemo(
    () => new Map(employeesForTimekeeping.map((employee) => [employee.id, employee])),
    [employeesForTimekeeping],
  );
  const recordEmployeeIdsForSelectedDate = useMemo(
    () =>
      new Set(
        data.timeRecords
          .filter((record) => !filters.date || record.date === filters.date)
          .map((record) => record.employeeId),
      ),
    [data.timeRecords, filters.date],
  );

  const filterSets = useMemo(() => {
    const terminationModeValues = new Set((filters.terminationModes || []).map((value) => {
      const normalized = String(value || "");
      return normalized in processModalities ? processModalities[normalized as keyof typeof processModalities] : normalized;
    }));
    return {
      companies: new Set(filters.companyIds), departments: new Set(filters.departmentIds), sectors: new Set(filters.sectorIds),
      realTeams: new Set(filters.realTeamIds), dayTeams: new Set(filters.dayTeamIds), employees: new Set(filters.employeeIds),
      cpfs: new Set(filters.cpfValues), statuses: new Set(filters.statuses), terminationModes: terminationModeValues,
      teams: new Set([...filters.realTeamIds, ...filters.dayTeamIds]), search: filters.search.trim().toLowerCase(),
    };
  }, [filters.companyIds, filters.departmentIds, filters.sectorIds, filters.realTeamIds, filters.dayTeamIds, filters.employeeIds, filters.cpfValues, filters.statuses, filters.terminationModes, filters.search]);

  const filteredRecords = useMemo(() => data.timeRecords.filter((record) => {
    const employee = employeeById.get(record.employeeId);
    const searchText = `${employee?.name || ""} ${employee?.cpf || ""} ${record.status}`.toLowerCase();
    return (
      (!filterSets.companies.size || filterSets.companies.has(record.companyId))
      && (!filterSets.departments.size || filterSets.departments.has(employee?.departmentId || ""))
      && (!filterSets.sectors.size || filterSets.sectors.has(employee?.sectorId || ""))
      && (!filterSets.realTeams.size || filterSets.realTeams.has(record.realTeamId || ""))
      && (!filterSets.dayTeams.size || filterSets.dayTeams.has(record.dayTeamId || ""))
      && (!filterSets.employees.size || filterSets.employees.has(record.employeeId))
      && (!filterSets.cpfs.size || filterSets.cpfs.has(employee?.cpf?.trim() || ""))
      && (!filterSets.statuses.size || filterSets.statuses.has(record.status))
      && (!filterSets.search || searchText.includes(filterSets.search))
      && (!filters.date || record.date === filters.date)
    );
  }), [data.timeRecords, employeeById, filterSets, filters.date]);

  const filteredEmployees = useMemo(() => employeesForTimekeeping.filter((employee) => {
    const effectiveStatus = employeeEffectiveStatusForDate(employee, filters.date);
    const belongsToSelectedDate = effectiveStatus !== "terminated"
      || recordEmployeeIdsForSelectedDate.has(employee.id);
    const admittedForSelectedDate = !employee.admissionDate
      || !filters.date
      || employee.admissionDate <= filters.date;

    return (
      belongsToSelectedDate
      && admittedForSelectedDate
      && (!filterSets.companies.size || filterSets.companies.has(employee.companyId))
      && (!filterSets.departments.size || filterSets.departments.has(employee.departmentId))
      && (!filterSets.sectors.size || filterSets.sectors.has(employee.sectorId))
      && (!filterSets.statuses.size || filterSets.statuses.has(effectiveStatus))
      && (!filterSets.terminationModes.size || filterSets.terminationModes.has(employeeProcessModalityLabel(employee, filters.date)))
      && (!filterSets.teams.size || filterSets.teams.has(employee.teamId ?? ""))
      && (!filterSets.employees.size || filterSets.employees.has(employee.id))
      && (!filterSets.cpfs.size || filterSets.cpfs.has(employee.cpf?.trim() || ""))
      && (!filterSets.search || employee.name.toLowerCase().includes(filterSets.search))
    );
  }), [employeesForTimekeeping, recordEmployeeIdsForSelectedDate, filterSets, filters.date]);

  const employeeOptions = useMemo(
    () => sortOptions(employeesForTimekeeping.map((item) => ({ value: item.id, label: item.name }))),
    [employeesForTimekeeping],
  );
  const cpfOptions = useMemo(
    () => sortOptions(Array.from(new Set(data.employees.map((item) => item.cpf?.trim() || ""))).filter(Boolean).map((cpf) => ({ value: cpf, label: cpf }))),
    [data.employees],
  );

  return {
    data,
    canCreateTimekeeping,
    canEditTimekeeping,
    canDeleteTimekeeping,
    filters,
    setFilters,
    filteredRecords,
    filteredEmployees,
    employeeOptions,
    cpfOptions,
  };
}

export type TimekeepingModel = ReturnType<typeof useTimekeepingModel>;
