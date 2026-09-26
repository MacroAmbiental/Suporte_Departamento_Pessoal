import type { Employee, TimeRecord, TimekeepingColumn, TimekeepingDayTable, WorkScheduleDay } from "@/types/domain";
import { employeeKindOf } from "@/common/utils/employeeKind";
import { isEmployeeTerminated } from "@/modules/employees/utils/employeeStatus";
import { formatDate } from "@/utils/format";
import { AlertTriangle, ChartColumn, ChartPie, HeartPulse, Stethoscope } from "lucide-react";

export const absenceStatuses = new Set(["absence_confirmed"]);
export const settingsColumnKey = "__timekeeping_calculation_settings";
export const defaultUsefulMinutesByWeekday: Record<string, number> = {
  "1": 600,
  "2": 600,
  "3": 600,
  "4": 600,
  "5": 539,
  "6": 0,
  "0": 0,
};
export const absenceTypeLabels: Record<string, string> = {
  confirmed: "Falta Confirmada",
  certificate: "Atestado",
  leave: "Afastado",
  vacation: "Férias",
  dayOff: "Folga",
  license: "Licença",
};
export const absenceTypeColors: Record<string, string> = {
  confirmed: "#d94f5c",
  certificate: "#ec6b35",
  leave: "#b86843",
  vacation: "#8a66be",
  dayOff: "#718497",
  license: "#089677",
};
export const cidPieColors = ["#1f95ed", "#099164", "#ec6b35", "#7d5ab6", "#d94f5c", "#16899a", "#d59a22", "#718497"];
export const hrControlFiltersStorageKey = "hr-control-filters-v1";
export const monitoringPageSize = 10;
// Card preferences stay in component state. Only the explicit shared default is persisted.
export type CardId = "employees" | "absences" | "certificates" | "combined" | "dayOffs" | "planned" | "worked" | "absenteeism" | "loss";
export type HrMetricTrend = { label: string; caption: string; title: string; tone: "good" | "bad" | "neutral" };
export type SettingsCardId = Exclude<CardId, "worked">;
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
export const cardChoiceFields: CardChoiceField[] = ["kinds", "statuses", "types", "leaveReasons", "licenses", "dayOffDays", "plannedWeekdays"];
export type CardSettings = Record<SettingsCardId, CardPreferences>;
export type MonthlyChartId = "monthlyCount" | "monthlyPercent";
export type MonthlyChartPreferences = Pick<CardPreferences, "types" | "leaveReasons" | "licenses" | "dayOffDays">;
export type MonthlyChartSettings = Record<MonthlyChartId, MonthlyChartPreferences>;
export const monthlyChartIds: MonthlyChartId[] = ["monthlyCount", "monthlyPercent"];
export const cardIds: SettingsCardId[] = ["employees", "absences", "certificates", "combined", "dayOffs", "planned", "absenteeism", "loss"];
export const leaveReasons = [
  "Incapacidade Temporária", "Incapacidade Temporária acidentário", "Afastamento por invalidez",
];
export const licenseReasons = [
  "Licença-maternidade", "Licença-paternidade", "Licença-gala (casamento)", "Licença-luto (nojo)",
  "Licença para doação de sangue", "Licença para alistamento eleitoral", "Licença para serviço militar",
  "Licença para convocação judicial (jurado / mesário)", "Licença para acompanhamento médico de filho (até 6 anos)",
  "Licença para acompanhamento médico de esposa/companheira gestante",
  "Licença para realização de exames preventivos de câncer",
  "Licença por incapacidade temporária (doença ou acidente de trabalho - primeiros 15 dias)",
  "Licença por aborto não criminoso",
];
export const absenceLabels: Record<string, string> = {
  leave: "Afastado", certificate: "Atestado", confirmed: "Falta", vacation: "Férias", dayOff: "Folga", license: "Licença",
};
export const monthlyTypeColors: Record<string, string> = {
  confirmed: "#1f95ed", certificate: "#1b2ca8", leave: "#b86843", vacation: "#8a66be", dayOff: "#718497", license: "#089677",
};
export const weekdayOptions = [
  { value: "1", label: "Segunda-feira" }, { value: "2", label: "Terça-feira" },
  { value: "3", label: "Quarta-feira" }, { value: "4", label: "Quinta-feira" },
  { value: "5", label: "Sexta-feira" }, { value: "6", label: "Sábado" },
  { value: "0", label: "Domingo" },
];
export const defaultCardSettings: CardSettings = Object.fromEntries(cardIds.map((id) => [id, {
  kinds: ["contract", "company", "diarist"], statuses: ["active", "leave"], totalSystem: false,
  types: id === "absences" ? ["confirmed"] : id === "certificates" ? ["certificate"]
    : id === "dayOffs" ? ["dayOff"] : ["confirmed", "certificate"],
  leaveReasons: [...leaveReasons, "Não especificado"], licenses: [...licenseReasons, "Não especificado"],
  dayOffDays: ["1", "2", "3", "4", "5"],
  plannedWeekdays: ["1", "2", "3", "4", "5"],
  absenteeismBase: "period",
}])) as CardSettings;
export const defaultMonthlyChartSettings: MonthlyChartSettings = Object.fromEntries(monthlyChartIds.map((id) => [id, {
  types: ["confirmed", "certificate"],
  leaveReasons: [...leaveReasons, "Não especificado"],
  licenses: [...licenseReasons, "Não especificado"],
  dayOffDays: ["1", "2", "3", "4", "5"],
}])) as MonthlyChartSettings;
export function sanitizeMonthlyChartSettings(value: unknown): MonthlyChartSettings {
  const source = value && typeof value === "object" ? value as Partial<MonthlyChartSettings> : {};
  return Object.fromEntries(monthlyChartIds.map((id) => {
    const item = source[id];
    const defaults = defaultMonthlyChartSettings[id];
    return [id, Object.fromEntries((Object.keys(defaults) as Array<keyof MonthlyChartPreferences>).map((key) => [
      key, Array.isArray(item?.[key]) ? item[key].filter((entry): entry is string => typeof entry === "string" &&
        (key !== "types" || entry in absenceLabels)) : [...defaults[key]],
    ]))];
  })) as MonthlyChartSettings;
}
export function sanitizeCardSettings(value: unknown): CardSettings {
  const source = value && typeof value === "object" ? value as Partial<CardSettings> : {};
  return Object.fromEntries(cardIds.map((id) => {
    const item = source[id];
    const defaults = defaultCardSettings[id];
    const arrays = Object.fromEntries(cardChoiceFields.map((key) => [
      key, Array.isArray(item?.[key]) ? item[key].filter((entry): entry is string => typeof entry === "string") : [...defaults[key]],
    ]));
    return [id, { ...arrays, totalSystem: Boolean(item?.totalSystem ?? defaults.totalSystem), absenteeismBase: item?.absenteeismBase === "planned" || item?.absenteeismBase === "worked"
      ? item.absenteeismBase : "period" }];
  })) as CardSettings;
}
export function recordSubtype(record: TimeRecord) {
  const fields = record.customFields || {};
  return String(fields.absenceSubtype || fields.leaveType || fields.licenseType || fields.absenceReason || fields.reason || "").trim();
}
export function cardRecordType(record: TimeRecord): string | null {
  if (record.status === "medical_certificate") return "certificate";
  if (record.status === "absence_confirmed") return "confirmed";
  if (record.status === "vacation") return "vacation";
  if (record.status === "day_off") return "dayOff";
  if (record.status === "leave") {
    const detail = recordSubtype(record).toLocaleLowerCase("pt-BR");
    return detail.includes("licen") ? "license" : "leave";
  }
  return null;
}
export function matchesCardRecord(record: TimeRecord, settings: MonthlyChartPreferences) {
  const type = cardRecordType(record);
  if (!type || !settings.types.includes(type)) return false;
  if (type === "dayOff" && !settings.dayOffDays.includes(String(parseLocalDate(record.date).getDay()))) return false;
  if (type === "leave" || type === "license") {
    const subtype = recordSubtype(record);
    const choices = type === "leave" ? settings.leaveReasons : settings.licenses;
    return choices.includes(subtype || "Não especificado");
  }
  return true;
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

export type HrView = "general" | "overtime" | "absenceTypes" | "absenceMonitoring" | "cids";
export type HrAnalysisScope = "group" | "company";
export type AbsenceType = keyof typeof absenceTypeLabels;
export type MonitoringRiskFilter = "all" | "recurrence" | "alert" | "abandonment";

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

export const microScreens: Array<{ key: HrView; label: string; icon: typeof ChartColumn }> = [
  { key: "general", label: "Geral", icon: ChartPie },
  { key: "overtime", label: "H extra", icon: ChartColumn },
  { key: "absenceTypes", label: "Tipos de Faltas", icon: HeartPulse },
  { key: "absenceMonitoring", label: "Monitoramento", icon: AlertTriangle },
  { key: "cids", label: "CID's", icon: Stethoscope },
];

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

export function readHrControlFiltersCache(): Partial<HrControlFiltersCache> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(hrControlFiltersStorageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Partial<HrControlFiltersCache>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

export function writeHrControlFiltersCache(value: HrControlFiltersCache) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(hrControlFiltersStorageKey, JSON.stringify(value));
  } catch {
    // Ignore storage write failures.
  }
}

export function compareText(left: string, right: string) {
  return left.localeCompare(right, "pt-BR", { sensitivity: "base", numeric: true });
}

export function sortOptions<T extends { label: string }>(options: T[]) {
  return [...options].sort((left, right) => compareText(left.label, right.label));
}

export function normalizeSearch(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function normalizeCpf(value?: string) {
  return String(value || "").replace(/\D/g, "");
}

export function employeeFunctionLabel(employee?: Employee) {
  return employee?.role?.trim() || employee?.position?.trim() || "Sem fun\u00e7\u00e3o";
}

export function parseLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

export function toISODate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function localTodayISO() {
  return toISODate(new Date());
}

export function monthStartISO(value: string) {
  return `${value.slice(0, 7)}-01`;
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export function dateRange(startDate: string, endDate: string) {
  if (!startDate || !endDate || startDate > endDate) return [] as string[];

  const dates: string[] = [];
  for (let current = parseLocalDate(startDate); current <= parseLocalDate(endDate); current = addDays(current, 1)) {
    dates.push(toISODate(current));
  }
  return dates;
}

export function countCalendarDaysBetween(start: string, end: string, weekdays: string[], holidays: Set<string>) {
  const selectedWeekdays = new Set(weekdays);
  return dateRange(start, end)
    .filter((date) => selectedWeekdays.has(String(dateToWeekdayIndex(date))) && !holidays.has(date)).length;
}

export function countCalendarDaysInYear(year: number, weekdays: string[], holidays: Set<string>) {
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return 0;
  return countCalendarDaysBetween(`${year}-01-01`, `${year}-12-31`, weekdays, holidays);
}

export function weekStartISO(value: string) {
  const date = parseLocalDate(value);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return toISODate(date);
}



export function dateToWeekdayIndex(value: string) {
  return parseLocalDate(value).getDay();
}

export const weekDayAliases: Record<number, string[]> = {
  0: ["domingo", "dom", "sun"],
  1: ["segunda", "seg", "monday", "mon"],
  2: ["terca", "terça", "ter", "tuesday", "tue"],
  3: ["quarta", "qua", "wednesday", "wed"],
  4: ["quinta", "qui", "thursday", "thu"],
  5: ["sexta", "sex", "friday", "fri"],
  6: ["sabado", "sábado", "sab", "sat"],
};

export type HrTimekeepingSettings = {
  usefulMinutesByWeekday: Record<string, number>;
  holidays: string[];
};

export function parseJson<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function readHrTimekeepingSettings(value?: string): HrTimekeepingSettings {
  const parsed = parseJson<Partial<HrTimekeepingSettings>>(value, {});
  const usefulMinutesByWeekday = {
    ...defaultUsefulMinutesByWeekday,
    ...(parsed.usefulMinutesByWeekday || {}),
  };

  return {
    usefulMinutesByWeekday: Object.fromEntries(
      Object.entries(usefulMinutesByWeekday).map(([weekday, minutes]) => [weekday, Number(minutes) || 0]),
    ),
    holidays: Array.isArray(parsed.holidays)
      ? Array.from(new Set(parsed.holidays.map((holiday) => String(holiday).trim()).filter(Boolean)))
      : [],
  };
}

export function buildHrTimekeepingSettingsByCompanyId(columns: TimekeepingColumn[]) {
  const settingsByCompanyId = new Map<string, HrTimekeepingSettings>();
  columns
    .filter((column) => column.key === settingsColumnKey && column.active !== false)
    .forEach((column) => {
      settingsByCompanyId.set(column.companyId || "", readHrTimekeepingSettings(column.formula));
    });
  return settingsByCompanyId;
}

export function settingsForCompany(companyId: string | undefined, settingsByCompanyId: Map<string, HrTimekeepingSettings>) {
  return (companyId ? settingsByCompanyId.get(companyId) : undefined)
    || settingsByCompanyId.get("")
    || { usefulMinutesByWeekday: defaultUsefulMinutesByWeekday, holidays: [] };
}

export function dayMatchesDate(dayName: string, date: string) {
  const normalized = normalizeSearch(dayName);
  const aliases = weekDayAliases[dateToWeekdayIndex(date)] || [];
  return aliases.some((alias) => normalized === normalizeSearch(alias) || normalized.startsWith(normalizeSearch(alias)));
}

export function scheduleForDate(employee: Employee, date: string): WorkScheduleDay | undefined {
  return employee.workScheduleDays?.filter((day) => day.enabled).find((day) => dayMatchesDate(day.day, date));
}

export function timeToMinutes(value?: string) {
  if (!value) return null;
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

export function hasCompleteSchedule(schedule?: WorkScheduleDay) {
  return Boolean(
    schedule?.enabled &&
    schedule.start &&
    schedule.end &&
    timeToMinutes(schedule.start) != null &&
    timeToMinutes(schedule.end) != null,
  );
}

export function scheduleDailyWorkMinutes(schedule?: WorkScheduleDay) {
  if (!hasCompleteSchedule(schedule) || !schedule) return null;
  const start = timeToMinutes(schedule.start);
  let end = timeToMinutes(schedule.end);
  if (start == null || end == null) return null;
  if (end < start) end += 24 * 60;

  let breakMinutes = 0;
  const breakStart = timeToMinutes(schedule.breakStart);
  let breakEnd = timeToMinutes(schedule.breakEnd);
  if (breakStart != null && breakEnd != null) {
    if (breakEnd < breakStart) breakEnd += 24 * 60;
    breakMinutes = Math.max(0, breakEnd - breakStart);
  }

  return Math.max(0, end - start - breakMinutes);
}

export function hasRegisteredSchedule(employee: Employee) {
  return Boolean(employee.workScheduleDays?.some((day) => hasCompleteSchedule(day)));
}

export function isUsefulSavedWorkday(
  employee: Employee,
  date: string,
  settingsByCompanyId: Map<string, HrTimekeepingSettings>,
) {
  const settings = settingsForCompany(employee.companyId, settingsByCompanyId);
  if (settings.holidays.includes(date)) return false;
  if (hasRegisteredSchedule(employee)) return (scheduleDailyWorkMinutes(scheduleForDate(employee, date)) || 0) > 0;
  return Number(settings.usefulMinutesByWeekday[String(dateToWeekdayIndex(date))] || 0) > 0;
}

export function weekLabel(start: string, end: string) {
  return `${formatDate(start)} a ${formatDate(end)}`;
}

export function weekOptionsForRange(startDate: string, endDate: string) {
  const weeks = new Map<string, { start: string; end: string }>();

  dateRange(startDate, endDate).forEach((date) => {
    const start = weekStartISO(date);
    const current = weeks.get(start) || { start: date, end: date };
    weeks.set(start, {
      start: current.start < date ? current.start : date,
      end: current.end > date ? current.end : date,
    });
  });

  return Array.from(weeks.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([value, range], index) => ({
      value,
      label: `Semana ${String(index + 1).padStart(2, "0")} (${weekLabel(range.start, range.end)})`,
    }));
}

export function monthKey(date: string) {
  return date.slice(0, 7);
}

export function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(year, (month || 1) - 1, 1);
  return date.toLocaleDateString("pt-BR", { month: "short", year: "numeric" }).replace(".", "");
}

export function monthChartLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  return `${new Date(year, month - 1, 1).toLocaleDateString("pt-BR", { month: "short" }).replace(".", "")}/${String(year).slice(-2)}`;
}

export function formatInteger(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Number(value || 0));
}

export function formatDecimal(value: number, digits = 1) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value || 0));
}

export function formatCompact(value: number, digits = 0) {
  const number = Number(value || 0);
  if (Math.abs(number) >= 1000) return `${formatDecimal(number / 1000, digits)} Mil`;
  return formatInteger(number);
}

export function formatCurrencyCompact(value: number) {
  const number = Number(value || 0);
  if (Math.abs(number) >= 1000) return `R$ ${formatDecimal(number / 1000, 2)} Mil`;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(number);
}

export function formatHours(value: number) {
  return `${formatDecimal(value, value >= 100 ? 0 : 1)}h`;
}

export function formatPercent(value: number) {
  return `${formatDecimal(value, 2)}%`;
}

export function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;

  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

export function describePieSlice(centerX: number, centerY: number, radius: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(centerX, centerY, radius, endAngle);
  const end = polarToCartesian(centerX, centerY, radius, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

  return [
    `M ${centerX} ${centerY}`,
    `L ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArcFlag} 0 ${end.x} ${end.y}`,
    "Z",
  ].join(" ");
}

export function parseSecullumTimeToHours(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = String(value ?? "").trim();
  if (!text) return 0;
  const numeric = Number(text.replace(",", "."));
  if (Number.isFinite(numeric) && !text.includes(":")) return numeric;
  const [hour, minute] = text.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
  return hour + minute / 60;
}

export function overtimeHours(record: TimeRecord) {
  return Number(record.overtimeHours || 0) || parseSecullumTimeToHours(record.customFields?.extras);
}

export function isAbsenceRecord(record: TimeRecord) {
  return absenceStatuses.has(record.status);
}

export function classifyAbsence(record: TimeRecord): ClassifiedAbsence | null {
  if (record.status === "medical_certificate") {
    return { type: "certificate", label: absenceTypeLabels.certificate };
  }

  if (record.status === "absence_confirmed") {
    return { type: "confirmed", label: absenceTypeLabels.confirmed };
  }

  if (record.status === "leave") {
    const detail = recordSubtype(record).toLocaleLowerCase("pt-BR");
    return { type: detail.includes("licen") ? "license" : "leave", label: detail.includes("licen") ? absenceTypeLabels.license : absenceTypeLabels.leave };
  }

  if (record.status === "vacation") {
    return { type: "vacation", label: absenceTypeLabels.vacation };
  }

  if (record.status === "day_off") {
    return { type: "dayOff", label: absenceTypeLabels.dayOff };
  }

  return null;
}

export function recordCompanyId(record: TimeRecord, employee?: Employee) {
  return record.companyId || employee?.companyId || "";
}

export function recordDepartmentId(record: TimeRecord, employee?: Employee) {
  return record.departmentId || employee?.departmentId || "";
}

export function recordSectorId(record: TimeRecord, employee?: Employee) {
  return record.sectorId || employee?.sectorId || "";
}

export function recordSubsectorId(record: TimeRecord, employee?: Employee) {
  return record.subsectorId || employee?.subsectorId || "";
}

export function recordFunctionKey(record: TimeRecord, employee?: Employee) {
  return normalizeSearch(record.functionName || employeeFunctionLabel(employee));
}

export function recordDayTeamId(record: TimeRecord, employee?: Employee) {
  return record.dayTeamId || employee?.teamId || "";
}

export function recordDayTeamLabel(record: TimeRecord, employee: Employee | undefined, teamById: Map<string, { name: string }>) {
  const teamId = recordDayTeamId(record, employee);
  return record.dayTeamName || teamById.get(teamId)?.name || "Sem equipe";
}

export function employeeMatchesDetailFilters(employee: Employee, filters: HrDetailFilterSets) {
  return (
    (!filters.employeeIds.size || filters.employeeIds.has(employee.id)) &&
    (!filters.functionKeys.size || filters.functionKeys.has(normalizeSearch(employeeFunctionLabel(employee)))) &&
    (!filters.cpfValues.size || filters.cpfValues.has(normalizeCpf(employee.cpf))) &&
    (!filters.departmentIds.size || filters.departmentIds.has(employee.departmentId)) &&
    (!filters.sectorIds.size || filters.sectorIds.has(employee.sectorId)) &&
    (!filters.subsectorIds.size || filters.subsectorIds.has(employee.subsectorId || ""))
  );
}

export function recordMatchesDetailFilters(record: TimeRecord, employee: Employee | undefined, filters: HrDetailFilterSets) {
  const recordFunctionMatches = filters.functionKeys.has(recordFunctionKey(record, employee));
  const employeeFunctionMatches = employee ? filters.functionKeys.has(normalizeSearch(employeeFunctionLabel(employee))) : false;

  return (
    (!filters.employeeIds.size || filters.employeeIds.has(record.employeeId)) &&
    (!filters.functionKeys.size || recordFunctionMatches || employeeFunctionMatches) &&
    (!filters.cpfValues.size || filters.cpfValues.has(normalizeCpf(employee?.cpf))) &&
    (!filters.departmentIds.size || filters.departmentIds.has(recordDepartmentId(record, employee))) &&
    (!filters.sectorIds.size || filters.sectorIds.has(recordSectorId(record, employee))) &&
    (!filters.subsectorIds.size || filters.subsectorIds.has(recordSubsectorId(record, employee)))
  );
}

export function savedDayMatchesCompany(table: TimekeepingDayTable, companyIds: Set<string>, restrictCompanies: boolean) {
  if (!restrictCompanies) return true;
  if (!companyIds.size) return false;
  if (!table.companyIds?.length) return true;
  return table.companyIds.some((companyId) => companyIds.has(companyId));
}

export function savedDayMatchesCompanyId(table: TimekeepingDayTable, companyId: string) {
  if (!table.companyIds?.length) return true;
  return table.companyIds.includes(companyId);
}

export function absenceLossValue(record: TimeRecord, employee?: Employee) {
  return Number(employee?.salary || 0) / 30;
}

export function tooltipText(parts: Array<string | undefined | false>) {
  return parts.filter(Boolean).join("\n");
}


