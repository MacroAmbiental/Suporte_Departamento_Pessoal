import type { Employee, TimeRecord } from "@/types/domain";
import { employeeKindOf } from "@/common/utils/employeeKind";
import { isEmployeeTerminated } from "@/modules/employees/utils/employeeStatus";

export type HrView = "general" | "overtime" | "absenceTypes" | "absenceMonitoring" | "cids";
export type HrAnalysisScope = "group" | "company";
export type AbsenceType = "confirmed" | "certificate" | "leave" | "vacation" | "dayOff" | "license";
export type MonitoringRiskFilter = "all" | "recurrence" | "alert" | "abandonment";

export type CardId = "employees" | "absences" | "certificates" | "combined" | "dayOffs" | "planned" | "worked" | "absenteeism" | "loss";
export type SettingsCardId = Exclude<CardId, "worked">;
export type HrMetricTrend = { label: string; caption: string; title: string; tone: "good" | "bad" | "neutral" };

export type CardPreferences = {
  kinds: string[];
  statuses: string[];
  totalSystem: boolean;
  types: string[];
  leaveReasons: string[];
  licenses: string[];
  dayOffDays: string[];
  plannedWeekdays: string[];
  absenteeismBase: "period" | "worked" | "planned";
};

export type CardChoiceField = Exclude<keyof CardPreferences, "absenteeismBase" | "totalSystem">;
export type CardSettings = Record<SettingsCardId, CardPreferences>;
export type MonthlyChartId = "monthlyCount" | "monthlyPercent";
export type MonthlyChartPreferences = Pick<CardPreferences, "types" | "leaveReasons" | "licenses" | "dayOffDays">;
export type MonthlyChartSettings = Record<MonthlyChartId, MonthlyChartPreferences>;

export type ChartRow = {
  label: string;
  value: number;
  detail?: string;
  color?: string;
};

export type DualChartRow = {
  label: string;
  primary: number;
  secondary: number;
};

export type MonthChartRow = {
  key: string;
  label: string;
  byType: Record<string, number>;
  missedDays: number;
  workedDays: number;
  percent: number;
};

export type CidCategoryRow = {
  category: string;
  count: number;
  cids: Array<{ label: string; count: number }>;
};

export type CidEmployeeEntry = {
  employeeId: string;
  employeeName: string;
  category: string;
  date: string;
  cidLabel: string;
};

export type CidPieRow = ChartRow & {
  category: string;
  employees: CidEmployeeEntry[];
};

export type UnjustifiedAbsenceRun = {
  employeeId: string;
  employeeName: string;
  startDate: string;
  endDate: string;
  days: number;
  recurringAbsencesInMonth: number;
};

export type ClassifiedAbsence = {
  type: AbsenceType;
  label: string;
};

export type HrDetailFilterSets = {
  employeeIds: Set<string>;
  functionKeys: Set<string>;
  cpfValues: Set<string>;
  departmentIds: Set<string>;
  sectorIds: Set<string>;
  subsectorIds: Set<string>;
};

export type HrControlFiltersCache = {
  activeView: HrView;
  startDate: string;
  endDate: string;
  periodMode: "currentMonth" | "custom";
  analysisScope: HrAnalysisScope;
  selectedGroupId: string;
  companyIds: string[];
  teamIds: string[];
  employeeIds: string[];
  functionKeys: string[];
  cpfValues: string[];
  departmentIds: string[];
  sectorIds: string[];
  subsectorIds: string[];
  weekKey: string;
  absenceTypeFilters: string[];
  cidCategoryFilters: string[];
  selectedCidLabel: string;
  monitoringPage: number;
};

export type HrTimekeepingSettings = {
  usefulMinutesByWeekday: Record<string, number>;
  holidays: string[];
};

export function isHrView(value: unknown): value is HrView {
  return value === "general" || value === "overtime" || value === "absenceTypes" || value === "absenceMonitoring" || value === "cids";
}

export function isHrAnalysisScope(value: unknown): value is HrAnalysisScope {
  return value === "group" || value === "company";
}

export function monitoringRiskMatches(run: UnjustifiedAbsenceRun, filter: MonitoringRiskFilter) {
  if (filter === "recurrence") return run.days >= 3 && run.days < 10;
  if (filter === "alert") return run.days >= 10 && run.days < 30;
  if (filter === "abandonment") return run.days >= 30;
  return true;
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export function asStringArray(value: unknown) {
  return Array.isArray(value) ? value.map((item) => String(item || "").trim()).filter(Boolean) : [];
}

export function employeeStatusForCard(employee: Employee): "active" | "leave" | "terminated" {
  return isEmployeeTerminated(employee) ? "terminated" : employee.status === "leave" ? "leave" : "active";
}

export function matchesEmployeeKindSelection(kinds: string[], employee?: Employee) {
  if (!kinds.length) return false;
  return Boolean(employee) && kinds.includes(employeeKindOf(employee));
}

export function countEmployeeRegistryMatches(kinds: string[], statuses: string[], employee: Employee) {
  const status = employeeStatusForCard(employee);
  return matchesEmployeeKindSelection(kinds, employee) && statuses.includes(status);
}

export function recordSubtype(record: TimeRecord) {
  const fields = record.customFields || {};
  return String(fields.absenceSubtype || fields.leaveType || fields.licenseType || fields.absenceReason || fields.reason || "").trim();
}
