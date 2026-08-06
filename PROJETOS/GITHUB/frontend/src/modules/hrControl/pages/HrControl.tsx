import {
  CalendarDays,
  ChartColumn,
  ChartPie,
  Clock,
  DollarSign,
  FileText,
  HeartPulse,
  Search,
  Stethoscope,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import ClearFiltersButton from "@/common/components/ClearFiltersButton";
import MultiSelect from "@/common/components/MultiSelect";
import { useDomainData } from "@/hooks/useDomainData";
import { cidDetailsFromValue } from "@/modules/timekeeping/data/cidCatalog";
import { loadTimekeepingDayTables } from "@/modules/timekeeping/data/timekeepingDayRepository";
import { loadTimeRecordsRange } from "@/modules/timekeeping/data/timeRecordsRepository";
import type { Employee, TimekeepingColumn, TimekeepingDayTable, TimeRecord, WorkScheduleDay } from "@/types/domain";
import { formatDate, todayISO } from "@/utils/format";

const absenceStatuses = new Set(["absence_confirmed"]);
const settingsColumnKey = "__timekeeping_calculation_settings";
const defaultUsefulMinutesByWeekday: Record<string, number> = {
  "1": 600,
  "2": 600,
  "3": 600,
  "4": 600,
  "5": 539,
  "6": 0,
  "0": 0,
};
const absenceTypeLabels = {
  certificate: "Faltas por Atestados",
  confirmed: "Falta Confirmada",
} as const;
const absenceTypeColors = {
  certificate: "#ec6b35",
  confirmed: "#d94f5c",
} as const;
const cidPieColors = ["#1f95ed", "#099164", "#ec6b35", "#7d5ab6", "#d94f5c", "#16899a", "#d59a22", "#718497"];
const manualStatusSelectedField = "__manual_status_selected";

type HrView = "general" | "overtime" | "absenceTypes" | "cids";
type HrAnalysisScope = "group" | "company";
type AbsenceType = keyof typeof absenceTypeLabels;

type ChartRow = {
  label: string;
  value: number;
  detail?: string;
  color?: string;
};

type DualChartRow = {
  label: string;
  primary: number;
  secondary: number;
};

type MonthChartRow = {
  key: string;
  label: string;
  absences: number;
  certificates: number;
  missedDays: number;
  workedDays: number;
  percent: number;
  overtime: number;
};

type CidCategoryRow = {
  category: string;
  count: number;
  cids: Array<{ label: string; count: number }>;
};

type CidEmployeeEntry = {
  employeeId: string;
  employeeName: string;
  category: string;
  date: string;
  cidLabel: string;
};

type CidPieRow = ChartRow & {
  category: string;
  employees: CidEmployeeEntry[];
};

type ClassifiedAbsence = {
  type: AbsenceType;
  label: string;
};

type HrDetailFilterSets = {
  employeeIds: Set<string>;
  functionKeys: Set<string>;
  cpfValues: Set<string>;
  departmentIds: Set<string>;
  sectorIds: Set<string>;
  subsectorIds: Set<string>;
};

const microScreens: Array<{ key: HrView; label: string; icon: typeof ChartColumn }> = [
  { key: "general", label: "Geral", icon: ChartPie },
  { key: "overtime", label: "H extra", icon: ChartColumn },
  { key: "absenceTypes", label: "Tipos de Faltas", icon: HeartPulse },
  { key: "cids", label: "CID's", icon: Stethoscope },
];

function compareText(left: string, right: string) {
  return left.localeCompare(right, "pt-BR", { sensitivity: "base", numeric: true });
}

function sortOptions<T extends { label: string }>(options: T[]) {
  return [...options].sort((left, right) => compareText(left.label, right.label));
}

function normalizeSearch(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normalizeCpf(value?: string) {
  return String(value || "").replace(/\D/g, "");
}

function employeeFunctionLabel(employee?: Employee) {
  return employee?.role?.trim() || employee?.position?.trim() || "Sem fun\u00e7\u00e3o";
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function toISODate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function yearStartISO(value: string) {
  return `${value.slice(0, 4)}-01-01`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function dateRange(startDate: string, endDate: string) {
  if (!startDate || !endDate || startDate > endDate) return [] as string[];

  const dates: string[] = [];
  for (let current = parseLocalDate(startDate); current <= parseLocalDate(endDate); current = addDays(current, 1)) {
    dates.push(toISODate(current));
  }
  return dates;
}

function weekStartISO(value: string) {
  const date = parseLocalDate(value);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return toISODate(date);
}

function isWeekendISODate(value: string) {
  const weekday = parseLocalDate(value).getDay();
  return weekday === 0 || weekday === 6;
}

function dateToWeekdayIndex(value: string) {
  return parseLocalDate(value).getDay();
}

const weekDayAliases: Record<number, string[]> = {
  0: ["domingo", "dom", "sun"],
  1: ["segunda", "seg", "monday", "mon"],
  2: ["terca", "terça", "ter", "tuesday", "tue"],
  3: ["quarta", "qua", "wednesday", "wed"],
  4: ["quinta", "qui", "thursday", "thu"],
  5: ["sexta", "sex", "friday", "fri"],
  6: ["sabado", "sábado", "sab", "sat"],
};

type HrTimekeepingSettings = {
  usefulMinutesByWeekday: Record<string, number>;
  holidays: string[];
};

function parseJson<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function readHrTimekeepingSettings(value?: string): HrTimekeepingSettings {
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

function buildHrTimekeepingSettingsByCompanyId(columns: TimekeepingColumn[]) {
  const settingsByCompanyId = new Map<string, HrTimekeepingSettings>();
  columns
    .filter((column) => column.key === settingsColumnKey && column.active !== false)
    .forEach((column) => {
      settingsByCompanyId.set(column.companyId || "", readHrTimekeepingSettings(column.formula));
    });
  return settingsByCompanyId;
}

function settingsForCompany(companyId: string | undefined, settingsByCompanyId: Map<string, HrTimekeepingSettings>) {
  return (companyId ? settingsByCompanyId.get(companyId) : undefined)
    || settingsByCompanyId.get("")
    || { usefulMinutesByWeekday: defaultUsefulMinutesByWeekday, holidays: [] };
}

function dayMatchesDate(dayName: string, date: string) {
  const normalized = normalizeSearch(dayName);
  const aliases = weekDayAliases[dateToWeekdayIndex(date)] || [];
  return aliases.some((alias) => normalized === normalizeSearch(alias) || normalized.startsWith(normalizeSearch(alias)));
}

function scheduleForDate(employee: Employee, date: string): WorkScheduleDay | undefined {
  return employee.workScheduleDays?.filter((day) => day.enabled).find((day) => dayMatchesDate(day.day, date));
}

function timeToMinutes(value?: string) {
  if (!value) return null;
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return null;
  return hour * 60 + minute;
}

function hasCompleteSchedule(schedule?: WorkScheduleDay) {
  return Boolean(
    schedule?.enabled &&
    schedule.start &&
    schedule.end &&
    timeToMinutes(schedule.start) != null &&
    timeToMinutes(schedule.end) != null,
  );
}

function scheduleDailyWorkMinutes(schedule?: WorkScheduleDay) {
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

function hasRegisteredSchedule(employee: Employee) {
  return Boolean(employee.workScheduleDays?.some((day) => hasCompleteSchedule(day)));
}

function isUsefulSavedWorkday(
  employee: Employee,
  date: string,
  settingsByCompanyId: Map<string, HrTimekeepingSettings>,
) {
  const settings = settingsForCompany(employee.companyId, settingsByCompanyId);
  if (settings.holidays.includes(date)) return false;
  if (hasRegisteredSchedule(employee)) return (scheduleDailyWorkMinutes(scheduleForDate(employee, date)) || 0) > 0;
  return Number(settings.usefulMinutesByWeekday[String(dateToWeekdayIndex(date))] || 0) > 0;
}

function weekLabel(start: string, end: string) {
  return `${formatDate(start)} a ${formatDate(end)}`;
}

function weekOptionsForRange(startDate: string, endDate: string) {
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

function monthKey(date: string) {
  return date.slice(0, 7);
}

function monthLabel(key: string) {
  const [year, month] = key.split("-").map(Number);
  const date = new Date(year, (month || 1) - 1, 1);
  return date.toLocaleDateString("pt-BR", { month: "short", year: "numeric" }).replace(".", "");
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 }).format(Number(value || 0));
}

function formatDecimal(value: number, digits = 1) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number(value || 0));
}

function formatCompact(value: number, digits = 0) {
  const number = Number(value || 0);
  if (Math.abs(number) >= 1000) return `${formatDecimal(number / 1000, digits)} Mil`;
  return formatInteger(number);
}

function formatCurrencyCompact(value: number) {
  const number = Number(value || 0);
  if (Math.abs(number) >= 1000) return `R$ ${formatDecimal(number / 1000, 2)} Mil`;
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(number);
}

function formatHours(value: number) {
  return `${formatDecimal(value, value >= 100 ? 0 : 1)}h`;
}

function formatPercent(value: number) {
  return `${formatDecimal(value, 2)}%`;
}

function polarToCartesian(centerX: number, centerY: number, radius: number, angleInDegrees: number) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180;

  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  };
}

function describePieSlice(centerX: number, centerY: number, radius: number, startAngle: number, endAngle: number) {
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

function parseSecullumTimeToHours(value: unknown) {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  const text = String(value ?? "").trim();
  if (!text) return 0;
  const numeric = Number(text.replace(",", "."));
  if (Number.isFinite(numeric) && !text.includes(":")) return numeric;
  const [hour, minute] = text.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return 0;
  return hour + minute / 60;
}

function overtimeHours(record: TimeRecord) {
  return Number(record.overtimeHours || 0) || parseSecullumTimeToHours(record.customFields?.extras);
}

function isAbsenceRecord(record: TimeRecord) {
  return absenceStatuses.has(record.status);
}

function isPointDayOffRecord(record: TimeRecord) {
  const statusLabel = normalizeSearch(String(record.customFields?.statusLabel || ""));
  const isDayOffStatus = record.status === "day_off" || statusLabel === "folga";
  if (!isDayOffStatus) return false;
  if (record.customFields?.[manualStatusSelectedField] === "true") return true;

  return !isWeekendISODate(record.date);
}

function classifyAbsence(record: TimeRecord): ClassifiedAbsence | null {
  if (record.status === "medical_certificate") {
    return { type: "certificate", label: absenceTypeLabels.certificate };
  }

  if (record.status === "absence_confirmed") {
    return { type: "confirmed", label: absenceTypeLabels.confirmed };
  }

  return null;
}

function recordCompanyId(record: TimeRecord, employee?: Employee) {
  return record.companyId || employee?.companyId || "";
}

function recordDepartmentId(record: TimeRecord, employee?: Employee) {
  return record.departmentId || employee?.departmentId || "";
}

function recordSectorId(record: TimeRecord, employee?: Employee) {
  return record.sectorId || employee?.sectorId || "";
}

function recordSubsectorId(record: TimeRecord, employee?: Employee) {
  return record.subsectorId || employee?.subsectorId || "";
}

function recordFunctionKey(record: TimeRecord, employee?: Employee) {
  return normalizeSearch(record.functionName || employeeFunctionLabel(employee));
}

function recordDayTeamId(record: TimeRecord, employee?: Employee) {
  return record.dayTeamId || employee?.teamId || "";
}

function recordDayTeamLabel(record: TimeRecord, employee: Employee | undefined, teamById: Map<string, { name: string }>) {
  const teamId = recordDayTeamId(record, employee);
  return record.dayTeamName || teamById.get(teamId)?.name || "Sem equipe";
}

function employeeMatchesBaseFilters(employee: Employee, companyIds: Set<string>, restrictCompanies: boolean, teamIds: Set<string>, endDate: string) {
  return (
    employee.status !== "terminated" &&
    (!employee.admissionDate || employee.admissionDate <= endDate) &&
    (!restrictCompanies || companyIds.has(employee.companyId)) &&
    (!teamIds.size || teamIds.has(employee.teamId || ""))
  );
}

function employeeMatchesDetailFilters(employee: Employee, filters: HrDetailFilterSets) {
  return (
    (!filters.employeeIds.size || filters.employeeIds.has(employee.id)) &&
    (!filters.functionKeys.size || filters.functionKeys.has(normalizeSearch(employeeFunctionLabel(employee)))) &&
    (!filters.cpfValues.size || filters.cpfValues.has(normalizeCpf(employee.cpf))) &&
    (!filters.departmentIds.size || filters.departmentIds.has(employee.departmentId)) &&
    (!filters.sectorIds.size || filters.sectorIds.has(employee.sectorId)) &&
    (!filters.subsectorIds.size || filters.subsectorIds.has(employee.subsectorId || ""))
  );
}

function recordMatchesDetailFilters(record: TimeRecord, employee: Employee | undefined, filters: HrDetailFilterSets) {
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

function savedDayMatchesCompany(table: TimekeepingDayTable, companyIds: Set<string>, restrictCompanies: boolean) {
  if (!restrictCompanies) return true;
  if (!companyIds.size) return false;
  if (!table.companyIds?.length) return true;
  return table.companyIds.some((companyId) => companyIds.has(companyId));
}

function savedDayMatchesCompanyId(table: TimekeepingDayTable, companyId: string) {
  if (!table.companyIds?.length) return true;
  return table.companyIds.includes(companyId);
}

function absenceLossValue(record: TimeRecord, employee?: Employee) {
  return Number(employee?.salary || 0) / 30;
}

function tooltipText(parts: Array<string | undefined | false>) {
  return parts.filter(Boolean).join("\n");
}

function HorizontalBarChart({
  rows,
  formatter = formatInteger,
}: {
  rows: ChartRow[];
  formatter?: (value: number) => string;
}) {
  const maxValue = Math.max(1, ...rows.map((row) => row.value));

  if (!rows.length) {
    return <div className="hr-empty-chart">Sem dados no período selecionado.</div>;
  }

  return (
    <div className="hr-bar-chart">
      {rows.map((row) => {
        const width = `${Math.max(4, (row.value / maxValue) * 100)}%`;
        const tooltip = tooltipText([
          row.label,
          `Valor: ${formatter(row.value)}`,
          row.detail,
        ]);
        return (
          <div
            className="hr-bar-row hr-has-tooltip"
            data-tooltip={tooltip}
            key={row.label}
            tabIndex={0}
            aria-label={tooltip}
          >
            <div className="hr-bar-label" title={row.label}>{row.label}</div>
            <div className="hr-bar-track" aria-label={`${row.label}: ${formatter(row.value)}`}>
              <span
                className="hr-bar-fill"
                style={{ "--hr-target-width": width, backgroundColor: row.color } as CSSProperties}
              />
            </div>
            <div className="hr-bar-value">{formatter(row.value)}</div>
            {row.detail ? <div className="hr-bar-detail">{row.detail}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

function DualBarChart({
  rows,
  primaryLabel,
  secondaryLabel,
}: {
  rows: DualChartRow[];
  primaryLabel: string;
  secondaryLabel: string;
}) {
  const maxValue = Math.max(1, ...rows.map((row) => Math.max(row.primary, row.secondary)));

  if (!rows.length) {
    return <div className="hr-empty-chart">Sem dados no período selecionado.</div>;
  }

  return (
    <div className="hr-dual-chart">
      <div className="hr-chart-legend">
        <span><i className="hr-dot is-primary" /> {primaryLabel}</span>
        <span><i className="hr-dot is-secondary" /> {secondaryLabel}</span>
      </div>
      {rows.map((row) => {
        const tooltip = tooltipText([
            row.label,
            `${primaryLabel}: ${formatInteger(row.primary)}`,
            `${secondaryLabel}: ${formatInteger(row.secondary)}`,
            `Total: ${formatInteger(row.primary + row.secondary)}`,
        ]);
        return (
        <div
          className="hr-dual-row hr-has-tooltip"
          data-tooltip={tooltip}
          key={row.label}
          tabIndex={0}
          aria-label={tooltip}
        >
          <strong title={row.label}>{row.label}</strong>
          <div className="hr-dual-bars">
            <span
              className="hr-dual-bar is-primary"
              style={{ "--hr-target-width": `${Math.max(4, (row.primary / maxValue) * 100)}%` } as CSSProperties}
            >
              {row.primary ? formatInteger(row.primary) : ""}
            </span>
            <span
              className="hr-dual-bar is-secondary"
              style={{ "--hr-target-width": `${Math.max(4, (row.secondary / maxValue) * 100)}%` } as CSSProperties}
            >
              {row.secondary ? formatInteger(row.secondary) : ""}
            </span>
          </div>
        </div>
        );
      })}
    </div>
  );
}

function PieSummary({ rows }: { rows: ChartRow[] }) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  let cursor = 0;
  const gradient = rows
    .map((row) => {
      const start = cursor;
      cursor += total ? (row.value / total) * 100 : 0;
      return `${row.color || "#8db3d3"} ${start}% ${cursor}%`;
    })
    .join(", ");

  if (!total) {
    return <div className="hr-empty-chart">Sem faltas ou atestados no período.</div>;
  }

  const pieTooltip = tooltipText([
    `Total: ${formatInteger(total)}`,
    ...rows.map((row) => `${row.label}: ${formatInteger(row.value)} (${formatPercent((row.value / total) * 100)})`),
  ]);

  return (
    <div className="hr-pie-layout">
      <div
        className="hr-pie hr-has-tooltip"
        data-tooltip={pieTooltip}
        style={{ background: `conic-gradient(${gradient})` }}
        tabIndex={0}
        aria-label={pieTooltip}
      >
        <span>{formatInteger(total)}</span>
      </div>
      <div className="hr-pie-legend">
        {rows.map((row) => {
          const tooltip = `${row.label}\n${formatInteger(row.value)} registro(s)\n${formatPercent((row.value / total) * 100)} do total`;
          return (
          <p
            className="hr-has-tooltip"
            data-tooltip={tooltip}
            key={row.label}
            tabIndex={0}
            aria-label={tooltip}
          >
            <i style={{ backgroundColor: row.color }} />
            <span>{row.label}</span>
            <strong>{formatInteger(row.value)} ({formatPercent((row.value / total) * 100)})</strong>
          </p>
          );
        })}
      </div>
    </div>
  );
}

function CidPieChart({
  rows,
  selectedLabel,
  onSelect,
}: {
  rows: CidPieRow[];
  selectedLabel: string;
  onSelect: (label: string) => void;
}) {
  const total = rows.reduce((sum, row) => sum + row.value, 0);
  let cursor = 0;

  if (!total) {
    return <div className="hr-empty-chart">Sem CIDs registrados nos atestados do periodo.</div>;
  }

  return (
    <div className="hr-cid-pie-layout">
      <div className="hr-cid-pie-stage">
        <svg viewBox="0 0 220 220" role="img" aria-label="CIDs registrados nos atestados">
          {rows.map((row) => {
            const startAngle = cursor;
            const angle = (row.value / total) * 360;
            const endAngle = cursor + angle;
            cursor = endAngle;
            const selected = row.label === selectedLabel;
            const tooltip = `${row.label}\n${formatInteger(row.value)} registro(s)\n${formatPercent((row.value / total) * 100)}`;

            if (rows.length === 1) {
              return (
                <circle
                  aria-label={tooltip}
                  className={`hr-cid-pie-slice ${selected ? "is-selected" : ""}`}
                  cx="110"
                  cy="110"
                  data-tooltip={tooltip}
                  fill={row.color}
                  key={row.label}
                  onClick={() => onSelect(row.label)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") onSelect(row.label);
                  }}
                  r="92"
                  role="button"
                  tabIndex={0}
                />
              );
            }

            return (
              <path
                aria-label={tooltip}
                className={`hr-cid-pie-slice ${selected ? "is-selected" : ""}`}
                d={describePieSlice(110, 110, 92, startAngle, endAngle)}
                data-tooltip={tooltip}
                fill={row.color}
                key={row.label}
                onClick={() => onSelect(row.label)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") onSelect(row.label);
                }}
                role="button"
                tabIndex={0}
              />
            );
          })}
          <circle cx="110" cy="110" fill="#fff" r="45" />
          <text className="hr-cid-pie-total" textAnchor="middle" x="110" y="106">{formatInteger(total)}</text>
          <text className="hr-cid-pie-caption" textAnchor="middle" x="110" y="126">atestados</text>
        </svg>
      </div>
      <div className="hr-cid-pie-legend">
        {rows.map((row) => (
          <button
            className={row.label === selectedLabel ? "is-selected" : ""}
            key={row.label}
            type="button"
            onClick={() => onSelect(row.label)}
          >
            <i style={{ backgroundColor: row.color }} />
            <span>{row.label}</span>
            <strong>{formatInteger(row.value)}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}

function MonthlyGroupedChart({ rows }: { rows: MonthChartRow[] }) {
  const maxValue = Math.max(1, ...rows.map((row) => Math.max(row.absences, row.certificates)));

  if (!rows.length) {
    return <div className="hr-empty-chart">Sem meses no período selecionado.</div>;
  }

  return (
    <div className="hr-month-chart">
      <div className="hr-chart-legend">
        <span><i className="hr-dot is-primary" /> Qtd Faltas</span>
        <span><i className="hr-dot is-secondary" /> Faltas por Atestados</span>
      </div>
      <div className="hr-month-columns">
        {rows.map((row) => {
          const tooltip = tooltipText([
            row.label,
            `Qtd Faltas: ${formatInteger(row.absences)}`,
            `Faltas por Atestados: ${formatInteger(row.certificates)}`,
            `Absenteísmo: ${formatPercent(row.percent)}`,
          ]);
          return (
          <div
            className="hr-month-group hr-has-tooltip"
            data-tooltip={tooltip}
            key={row.key}
            tabIndex={0}
            aria-label={tooltip}
          >
            <div className="hr-month-bars">
              <span
                className="hr-month-bar is-primary"
                style={{ "--hr-target-height": `${Math.max(3, (row.absences / maxValue) * 100)}%` } as CSSProperties}
              >
                {row.absences ? formatInteger(row.absences) : ""}
              </span>
              <span
                className="hr-month-bar is-secondary"
                style={{ "--hr-target-height": `${Math.max(3, (row.certificates / maxValue) * 100)}%` } as CSSProperties}
              >
                {row.certificates ? formatInteger(row.certificates) : ""}
              </span>
            </div>
            <strong>{row.label}</strong>
          </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthlyPercentChart({ rows }: { rows: MonthChartRow[] }) {
  const maxValue = Math.max(8, ...rows.map((row) => row.percent));

  if (!rows.length) {
    return <div className="hr-empty-chart">Sem meses no período selecionado.</div>;
  }

  return (
    <div className="hr-month-percent-chart">
      {rows.map((row) => {
        const tooltip = tooltipText([
          row.label,
          `Absenteísmo: ${formatPercent(row.percent)}`,
          `Faltas + atestados: ${formatInteger(row.missedDays)}`,
          `Dias trabalhados calculados: ${formatInteger(row.workedDays)}`,
          `Faltas confirmadas: ${formatInteger(row.absences)}`,
          `Atestados: ${formatInteger(row.certificates)}`,
        ]);
        return (
        <div
          className="hr-month-percent-column hr-has-tooltip"
          data-tooltip={tooltip}
          key={row.key}
          tabIndex={0}
          aria-label={tooltip}
        >
          <span style={{ "--hr-target-height": `${Math.max(4, (row.percent / maxValue) * 100)}%` } as CSSProperties}>
            {formatPercent(row.percent)}
          </span>
          <strong>{row.label}</strong>
        </div>
        );
      })}
    </div>
  );
}

export default function HrControl() {
  const data = useDomainData();
  const today = todayISO();
  const [activeView, setActiveView] = useState<HrView>("general");
  const [startDate, setStartDate] = useState(yearStartISO(today));
  const [endDate, setEndDate] = useState(today);
  const [analysisScope, setAnalysisScope] = useState<HrAnalysisScope>("group");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [companyIds, setCompanyIds] = useState<string[]>([]);
  const [teamIds, setTeamIds] = useState<string[]>([]);
  const [employeeIds, setEmployeeIds] = useState<string[]>([]);
  const [functionKeys, setFunctionKeys] = useState<string[]>([]);
  const [cpfValues, setCpfValues] = useState<string[]>([]);
  const [departmentIds, setDepartmentIds] = useState<string[]>([]);
  const [sectorIds, setSectorIds] = useState<string[]>([]);
  const [subsectorIds, setSubsectorIds] = useState<string[]>([]);
  const [weekKey, setWeekKey] = useState("all");
  const [absenceTypeFilters, setAbsenceTypeFilters] = useState<string[]>([]);
  const [cidCategoryFilters, setCidCategoryFilters] = useState<string[]>([]);
  const [selectedCidLabel, setSelectedCidLabel] = useState("");
  const [records, setRecords] = useState<TimeRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [savedDayTables, setSavedDayTables] = useState<TimekeepingDayTable[]>([]);
  const [savedDaysLoading, setSavedDaysLoading] = useState(false);
  const invalidRange = Boolean(startDate && endDate && startDate > endDate);

  const teamById = useMemo(
    () => new Map(data.teams.map((team) => [team.id, team])),
    [data.teams],
  );
  const employeeById = useMemo(
    () => new Map(data.employees.map((employee) => [employee.id, employee])),
    [data.employees],
  );
  const groupOptions = useMemo(
    () => sortOptions(data.companyGroups
      .filter((group) => group.active !== false)
      .map((group) => ({ value: group.id, label: group.name }))),
    [data.companyGroups],
  );
  const defaultGroupId = useMemo(() => {
    const macroGroup = groupOptions.find((group) => {
      const name = normalizeSearch(group.label);
      return name.includes("grupo macro") || name.includes("macro");
    });
    return macroGroup?.value || groupOptions[0]?.value || "";
  }, [groupOptions]);
  const selectedGroupCompanyIds = useMemo(
    () => data.companyGroupCompanies
      .filter((relation) => relation.groupId === selectedGroupId)
      .map((relation) => relation.companyId),
    [data.companyGroupCompanies, selectedGroupId],
  );
  const selectedCompanyScopeIds = analysisScope === "group" ? selectedGroupCompanyIds : companyIds;
  const restrictCompanyScope = analysisScope === "group" ? Boolean(selectedGroupId) : true;
  const selectedCompanyIds = useMemo(() => new Set(selectedCompanyScopeIds), [selectedCompanyScopeIds]);
  const selectedTeamIds = useMemo(() => new Set(teamIds), [teamIds]);
  const selectedDepartmentIds = useMemo(() => new Set(departmentIds), [departmentIds]);
  const selectedSectorIds = useMemo(() => new Set(sectorIds), [sectorIds]);
  const selectedSubsectorIds = useMemo(() => new Set(subsectorIds), [subsectorIds]);
  const detailFilterSets = useMemo<HrDetailFilterSets>(() => ({
    employeeIds: new Set(employeeIds),
    functionKeys: new Set(functionKeys),
    cpfValues: new Set(cpfValues),
    departmentIds: selectedDepartmentIds,
    sectorIds: selectedSectorIds,
    subsectorIds: selectedSubsectorIds,
  }), [cpfValues, employeeIds, functionKeys, selectedDepartmentIds, selectedSectorIds, selectedSubsectorIds]);
  const selectedAbsenceTypes = useMemo(() => new Set(absenceTypeFilters), [absenceTypeFilters]);
  const selectedCidCategories = useMemo(() => new Set(cidCategoryFilters), [cidCategoryFilters]);
  const timekeepingSettingsByCompanyId = useMemo(
    () => buildHrTimekeepingSettingsByCompanyId(data.timekeepingColumns),
    [data.timekeepingColumns],
  );

  const weekOptions = useMemo(
    () => (invalidRange ? [] : weekOptionsForRange(startDate, endDate)),
    [endDate, invalidRange, startDate],
  );
  const activeDates = useMemo(
    () =>
      dateRange(startDate, endDate)
        .filter((date) => weekKey === "all" || weekStartISO(date) === weekKey),
    [endDate, startDate, weekKey],
  );
  const activeDateSet = useMemo(() => new Set(activeDates), [activeDates]);
  const activeSavedDayTables = useMemo(() => (
    savedDayTables
      .filter((table) => activeDateSet.has(table.date))
      .filter((table) => savedDayMatchesCompany(table, selectedCompanyIds, restrictCompanyScope))
  ), [activeDateSet, restrictCompanyScope, savedDayTables, selectedCompanyIds]);
  const savedDaySet = useMemo(() => new Set(activeSavedDayTables.map((table) => table.date)), [activeSavedDayTables]);
  const savedTablesByDate = useMemo(() => {
    const map = new Map<string, TimekeepingDayTable[]>();
    activeSavedDayTables.forEach((table) => {
      const current = map.get(table.date) || [];
      current.push(table);
      map.set(table.date, current);
    });
    return map;
  }, [activeSavedDayTables]);
  const savedActiveDates = useMemo(
    () => activeDates.filter((date) => savedDaySet.has(date)),
    [activeDates, savedDaySet],
  );

  const companyOptions = useMemo(
    () => sortOptions(data.companies.map((company) => ({ value: company.id, label: company.name }))),
    [data.companies],
  );
  const scopedEmployeesForOptions = useMemo(
    () => data.employees.filter((employee) => employeeMatchesBaseFilters(employee, selectedCompanyIds, restrictCompanyScope, selectedTeamIds, endDate)),
    [data.employees, endDate, restrictCompanyScope, selectedCompanyIds, selectedTeamIds],
  );
  const departmentOptions = useMemo(
    () =>
      sortOptions(
        data.departments
          .filter((department) => department.active !== false)
          .filter((department) => !restrictCompanyScope || selectedCompanyIds.has(department.companyId))
          .map((department) => ({ value: department.id, label: department.name })),
      ),
    [data.departments, restrictCompanyScope, selectedCompanyIds],
  );
  const sectorOptions = useMemo(
    () =>
      sortOptions(
        data.sectors
          .filter((sector) => sector.active !== false)
          .filter((sector) => !restrictCompanyScope || selectedCompanyIds.has(sector.companyId))
          .filter((sector) => !selectedDepartmentIds.size || selectedDepartmentIds.has(sector.departmentId))
          .map((sector) => ({ value: sector.id, label: sector.name })),
      ),
    [data.sectors, restrictCompanyScope, selectedCompanyIds, selectedDepartmentIds],
  );
  const subsectorOptions = useMemo(
    () =>
      sortOptions(
        data.subsectors
          .filter((subsector) => subsector.active !== false)
          .filter((subsector) => !restrictCompanyScope || selectedCompanyIds.has(subsector.companyId))
          .filter((subsector) => !selectedDepartmentIds.size || selectedDepartmentIds.has(subsector.departmentId))
          .filter((subsector) => !selectedSectorIds.size || selectedSectorIds.has(subsector.sectorId))
          .map((subsector) => ({ value: subsector.id, label: subsector.name })),
      ),
    [data.subsectors, restrictCompanyScope, selectedCompanyIds, selectedDepartmentIds, selectedSectorIds],
  );
  const functionOptions = useMemo(() => {
    const byKey = new Map<string, string>();
    scopedEmployeesForOptions.forEach((employee) => {
      const label = employeeFunctionLabel(employee);
      const key = normalizeSearch(label);
      if (key && !byKey.has(key)) byKey.set(key, label);
    });
    return sortOptions(Array.from(byKey.entries()).map(([value, label]) => ({ value, label })));
  }, [scopedEmployeesForOptions]);
  const cpfOptions = useMemo(() => {
    const byCpf = new Map<string, string>();
    scopedEmployeesForOptions.forEach((employee) => {
      const label = employee.cpf?.trim() || "";
      const value = normalizeCpf(label);
      if (value && !byCpf.has(value)) byCpf.set(value, label);
    });
    return sortOptions(Array.from(byCpf.entries()).map(([value, label]) => ({ value, label })));
  }, [scopedEmployeesForOptions]);
  const employeeOptions = useMemo(
    () =>
      sortOptions(
        scopedEmployeesForOptions
          .filter((employee) => !selectedDepartmentIds.size || selectedDepartmentIds.has(employee.departmentId))
          .filter((employee) => !selectedSectorIds.size || selectedSectorIds.has(employee.sectorId))
          .filter((employee) => !selectedSubsectorIds.size || selectedSubsectorIds.has(employee.subsectorId || ""))
          .filter((employee) => !functionKeys.length || functionKeys.includes(normalizeSearch(employeeFunctionLabel(employee))))
          .filter((employee) => !cpfValues.length || cpfValues.includes(normalizeCpf(employee.cpf)))
          .map((employee) => ({ value: employee.id, label: employee.name })),
      ),
    [cpfValues, functionKeys, scopedEmployeesForOptions, selectedDepartmentIds, selectedSectorIds, selectedSubsectorIds],
  );
  const teamOptions = useMemo(
    () =>
      sortOptions(
        data.teams
          .filter((team) => !restrictCompanyScope || selectedCompanyIds.has(team.companyId))
          .map((team) => ({ value: team.id, label: team.name })),
      ),
    [data.teams, restrictCompanyScope, selectedCompanyIds],
  );
  const absenceTypeOptions = useMemo(
    () =>
      Object.entries(absenceTypeLabels).map(([value, label]) => ({
        value,
        label,
      })),
    [],
  );
  const availableTeamIds = useMemo(
    () => new Set(teamOptions.map((option) => option.value)),
    [teamOptions],
  );
  const availableEmployeeIds = useMemo(
    () => new Set(employeeOptions.map((option) => option.value)),
    [employeeOptions],
  );
  const availableFunctionKeys = useMemo(
    () => new Set(functionOptions.map((option) => option.value)),
    [functionOptions],
  );
  const availableCpfValues = useMemo(
    () => new Set(cpfOptions.map((option) => option.value)),
    [cpfOptions],
  );
  const availableDepartmentIds = useMemo(
    () => new Set(departmentOptions.map((option) => option.value)),
    [departmentOptions],
  );
  const availableSectorIds = useMemo(
    () => new Set(sectorOptions.map((option) => option.value)),
    [sectorOptions],
  );
  const availableSubsectorIds = useMemo(
    () => new Set(subsectorOptions.map((option) => option.value)),
    [subsectorOptions],
  );
  const hasActiveFilters = Boolean(
    analysisScope !== "group" ||
    (defaultGroupId ? selectedGroupId !== defaultGroupId : Boolean(selectedGroupId)) ||
    teamIds.length ||
    employeeIds.length ||
    functionKeys.length ||
    cpfValues.length ||
    departmentIds.length ||
    sectorIds.length ||
    subsectorIds.length ||
    weekKey !== "all" ||
    absenceTypeFilters.length ||
    cidCategoryFilters.length ||
    startDate !== yearStartISO(today) ||
    endDate !== today,
  );

  useEffect(() => {
    if (analysisScope !== "group") return;
    if (!groupOptions.length) {
      if (selectedGroupId) setSelectedGroupId("");
      return;
    }

    if (!selectedGroupId || !groupOptions.some((option) => option.value === selectedGroupId)) {
      setSelectedGroupId(defaultGroupId);
    }
  }, [analysisScope, defaultGroupId, groupOptions, selectedGroupId]);

  useEffect(() => {
    setTeamIds([]);
    setEmployeeIds([]);
    setFunctionKeys([]);
    setCpfValues([]);
    setDepartmentIds([]);
    setSectorIds([]);
    setSubsectorIds([]);
  }, [analysisScope, selectedGroupId, companyIds]);

  useEffect(() => {
    setTeamIds((current) => current.filter((teamId) => availableTeamIds.has(teamId)));
  }, [availableTeamIds]);

  useEffect(() => {
    setDepartmentIds((current) => current.filter((departmentId) => availableDepartmentIds.has(departmentId)));
  }, [availableDepartmentIds]);

  useEffect(() => {
    setSectorIds((current) => current.filter((sectorId) => availableSectorIds.has(sectorId)));
  }, [availableSectorIds]);

  useEffect(() => {
    setSubsectorIds((current) => current.filter((subsectorId) => availableSubsectorIds.has(subsectorId)));
  }, [availableSubsectorIds]);

  useEffect(() => {
    setFunctionKeys((current) => current.filter((functionKey) => availableFunctionKeys.has(functionKey)));
  }, [availableFunctionKeys]);

  useEffect(() => {
    setCpfValues((current) => current.filter((cpfValue) => availableCpfValues.has(cpfValue)));
  }, [availableCpfValues]);

  useEffect(() => {
    setEmployeeIds((current) => current.filter((employeeId) => availableEmployeeIds.has(employeeId)));
  }, [availableEmployeeIds]);

  useEffect(() => {
    if (weekKey !== "all" && !weekOptions.some((option) => option.value === weekKey)) {
      setWeekKey("all");
    }
  }, [weekKey, weekOptions]);

  useEffect(() => {
    if (activeView !== "absenceTypes") setAbsenceTypeFilters([]);
    if (activeView !== "cids") setCidCategoryFilters([]);
  }, [activeView]);

  useEffect(() => {
    if (invalidRange) {
      setRecords([]);
      setRecordsLoading(false);
      return undefined;
    }

    let active = true;
    setRecordsLoading(true);
    void loadTimeRecordsRange(startDate, endDate)
      .then((nextRecords) => {
        if (active) setRecords(nextRecords);
      })
      .catch((error) => {
        console.warn("Não foi possível carregar os dados de ponto para o Controle RH.", error);
        if (active) setRecords([]);
      })
      .finally(() => {
        if (active) setRecordsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [endDate, invalidRange, startDate]);

  useEffect(() => {
    if (invalidRange) {
      setSavedDayTables([]);
      setSavedDaysLoading(false);
      return undefined;
    }

    let active = true;
    setSavedDaysLoading(true);
    void loadTimekeepingDayTables(1000)
      .then((tables) => {
        if (active) setSavedDayTables(tables);
      })
      .catch((error) => {
        console.warn("Não foi possível carregar os dias de ponto salvos para o Controle RH.", error);
        if (active) setSavedDayTables([]);
      })
      .finally(() => {
        if (active) setSavedDaysLoading(false);
      });

    return () => {
      active = false;
    };
  }, [invalidRange, startDate, endDate]);

  const baseFilteredRecords = useMemo(
    () =>
      records.filter((record) => {
        const employee = employeeById.get(record.employeeId);
        const companyId = recordCompanyId(record, employee);
        const savedForCompany = (savedTablesByDate.get(record.date) || [])
          .some((table) => savedDayMatchesCompanyId(table, companyId));
        const teamId = recordDayTeamId(record, employee);
        return (
          savedForCompany &&
          (!restrictCompanyScope || selectedCompanyIds.has(companyId)) &&
          (!selectedTeamIds.size || selectedTeamIds.has(teamId)) &&
          recordMatchesDetailFilters(record, employee, detailFilterSets) &&
          (weekKey === "all" || weekStartISO(record.date) === weekKey)
        );
      }),
    [detailFilterSets, employeeById, records, restrictCompanyScope, savedTablesByDate, selectedCompanyIds, selectedTeamIds, weekKey],
  );

  const classifiedRecords = useMemo(
    () =>
      baseFilteredRecords
        .map((record) => ({ record, classification: classifyAbsence(record) }))
        .filter((entry): entry is { record: TimeRecord; classification: ClassifiedAbsence } => Boolean(entry.classification)),
    [baseFilteredRecords],
  );
  const absenceTypeRecords = useMemo(
    () =>
      classifiedRecords.filter((entry) =>
        !selectedAbsenceTypes.size || selectedAbsenceTypes.has(entry.classification.type),
      ),
    [classifiedRecords, selectedAbsenceTypes],
  );

  const baseEmployees = useMemo(() => {
    const employees = data.employees.filter((employee) =>
      employeeMatchesBaseFilters(employee, selectedCompanyIds, restrictCompanyScope, selectedTeamIds, endDate) &&
      employeeMatchesDetailFilters(employee, detailFilterSets),
    );
    const byId = new Map(employees.map((employee) => [employee.id, employee]));

    if (selectedTeamIds.size) {
      baseFilteredRecords.forEach((record) => {
        const employee = employeeById.get(record.employeeId);
        if (employee && !byId.has(employee.id)) byId.set(employee.id, employee);
      });
    }

    return Array.from(byId.values());
  }, [baseFilteredRecords, data.employees, detailFilterSets, employeeById, endDate, restrictCompanyScope, selectedCompanyIds, selectedTeamIds]);

  const recordByEmployeeDate = useMemo(() => {
    const map = new Map<string, TimeRecord>();
    baseFilteredRecords.forEach((record) => {
      map.set(`${record.employeeId}:${record.date}`, record);
    });
    return map;
  }, [baseFilteredRecords]);

  const expectedWorkDays = useMemo(() => {
    const byTeam = new Map<string, number>();
    const byMonth = new Map<string, number>();
    const savedUsefulDates = new Set<string>();
    let total = 0;

    baseEmployees.forEach((employee) => {
      savedActiveDates.forEach((date) => {
        const savedForCompany = (savedTablesByDate.get(date) || [])
          .some((table) => savedDayMatchesCompanyId(table, employee.companyId));
        if (!savedForCompany) return;
        if (employee.admissionDate && employee.admissionDate > date) return;
        if (!isUsefulSavedWorkday(employee, date, timekeepingSettingsByCompanyId)) return;

        const record = recordByEmployeeDate.get(`${employee.id}:${date}`);
        const teamId = record ? recordDayTeamId(record, employee) : employee.teamId || "";
        if (selectedTeamIds.size && !selectedTeamIds.has(teamId)) return;

        const teamLabel = record
          ? recordDayTeamLabel(record, employee, teamById)
          : teamById.get(teamId)?.name || "Sem equipe";
        const month = monthKey(date);
        total += 1;
        savedUsefulDates.add(date);
        byTeam.set(teamLabel, (byTeam.get(teamLabel) || 0) + 1);
        byMonth.set(month, (byMonth.get(month) || 0) + 1);
      });
    });

    return { total, savedUsefulDateCount: savedUsefulDates.size, byTeam, byMonth };
  }, [
    baseEmployees,
    recordByEmployeeDate,
    savedActiveDates,
    savedTablesByDate,
    selectedTeamIds,
    teamById,
    timekeepingSettingsByCompanyId,
  ]);

  const metrics = useMemo(() => {
    let absences = 0;
    let certificates = 0;
    let dayOffs = 0;
    let loss = 0;

    baseFilteredRecords.forEach((record) => {
      const employee = employeeById.get(record.employeeId);
      const classification = classifyAbsence(record);

      if (classification?.type === "certificate") {
        certificates += 1;
        loss += absenceLossValue(record, employee);
        return;
      }

      if (classification) {
        absences += 1;
        loss += absenceLossValue(record, employee);
        return;
      }

      if (isPointDayOffRecord(record)) dayOffs += 1;
    });

    const totalAbsencesAndCertificates = absences + certificates;
    const workedDays = expectedWorkDays.total;
    const savedUsefulDays = expectedWorkDays.savedUsefulDateCount;

    return {
      employees: baseEmployees.length,
      absences,
      certificates,
      absencesAndCertificates: totalAbsencesAndCertificates,
      dayOffs,
      workedDays,
      savedUsefulDays,
      absenteeism: workedDays ? (totalAbsencesAndCertificates / workedDays) * 100 : 0,
      loss,
    };
  }, [baseEmployees.length, baseFilteredRecords, employeeById, expectedWorkDays]);

  const overtimeByTeam = useMemo<ChartRow[]>(() => {
    const totals = new Map<string, number>();

    baseFilteredRecords.forEach((record) => {
      const hours = overtimeHours(record);
      if (hours <= 0) return;
      const employee = employeeById.get(record.employeeId);
      const label = recordDayTeamLabel(record, employee, teamById);
      totals.set(label, (totals.get(label) || 0) + hours);
    });

    return Array.from(totals.entries())
      .map(([label, value]) => ({ label, value, color: "#b9ee93" }))
      .sort((left, right) => right.value - left.value || compareText(left.label, right.label))
      .slice(0, 36);
  }, [baseFilteredRecords, employeeById, teamById]);

  const overtimeByMonth = useMemo<ChartRow[]>(() => {
    const totals = new Map<string, number>();

    baseFilteredRecords.forEach((record) => {
      const hours = overtimeHours(record);
      if (hours <= 0) return;
      const key = monthKey(record.date);
      totals.set(key, (totals.get(key) || 0) + hours);
    });

    return Array.from(totals.entries())
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, value]) => ({ label: monthLabel(key), value, color: "#1f95ed" }));
  }, [baseFilteredRecords]);

  const teamAbsenceRows = useMemo<ChartRow[]>(() => {
    const totals = new Map<string, number>();

    classifiedRecords.forEach(({ record }) => {
      const employee = employeeById.get(record.employeeId);
      const label = recordDayTeamLabel(record, employee, teamById);
      totals.set(label, (totals.get(label) || 0) + 1);
    });

    return Array.from(totals.entries())
      .map(([label, value]) => ({ label, value, color: "#c7f3a0" }))
      .sort((left, right) => right.value - left.value || compareText(left.label, right.label))
      .slice(0, 20);
  }, [classifiedRecords, employeeById, teamById]);

  const teamAbsencePercentRows = useMemo<ChartRow[]>(() => {
    const missedByTeam = new Map<string, number>();

    classifiedRecords.forEach(({ record }) => {
      const employee = employeeById.get(record.employeeId);
      const label = recordDayTeamLabel(record, employee, teamById);
      missedByTeam.set(label, (missedByTeam.get(label) || 0) + 1);
    });

    const labels = new Set([...missedByTeam.keys(), ...expectedWorkDays.byTeam.keys()]);
    return Array.from(labels)
      .map((label) => {
        const missed = missedByTeam.get(label) || 0;
        const worked = expectedWorkDays.byTeam.get(label) || 0;
        return {
        label,
        value: worked ? (missed / worked) * 100 : 0,
        detail: `${formatInteger(missed)} falta(s) / ${formatInteger(worked)} dia(s) trabalhado(s) calculado(s)`,
        color: "#1f95ed",
        };
      })
      .filter((row) => row.value > 0)
      .sort((left, right) => right.value - left.value || compareText(left.label, right.label))
      .slice(0, 20);
  }, [classifiedRecords, employeeById, expectedWorkDays, teamById]);

  const monthlyRows = useMemo<MonthChartRow[]>(() => {
    const months = new Map<string, MonthChartRow>();

    savedActiveDates.forEach((date) => {
      const key = monthKey(date);
      if (!months.has(key)) {
        months.set(key, { key, label: monthLabel(key), absences: 0, certificates: 0, missedDays: 0, workedDays: 0, percent: 0, overtime: 0 });
      }
    });

    const missedByMonth = new Map<string, number>();
    baseFilteredRecords.forEach((record) => {
      const key = monthKey(record.date);
      const row = months.get(key) || { key, label: monthLabel(key), absences: 0, certificates: 0, missedDays: 0, workedDays: 0, percent: 0, overtime: 0 };
      const classification = classifyAbsence(record);

      if (classification?.type === "certificate") {
        row.certificates += 1;
        row.missedDays += 1;
        missedByMonth.set(key, (missedByMonth.get(key) || 0) + 1);
      } else if (classification) {
        row.absences += 1;
        row.missedDays += 1;
        missedByMonth.set(key, (missedByMonth.get(key) || 0) + 1);
      }

      row.overtime += overtimeHours(record);
      months.set(key, row);
    });

    return Array.from(months.values())
      .map((row) => {
        const missed = missedByMonth.get(row.key) || 0;
        const worked = expectedWorkDays.byMonth.get(row.key) || 0;
        return {
          ...row,
          missedDays: missed,
          workedDays: worked,
          percent: worked ? (missed / worked) * 100 : 0,
        };
      })
      .sort((left, right) => left.key.localeCompare(right.key));
  }, [baseFilteredRecords, expectedWorkDays, savedActiveDates]);

  const absencePieRows = useMemo<ChartRow[]>(
    () =>
      (Object.keys(absenceTypeLabels) as AbsenceType[]).map((type) => ({
        label: absenceTypeLabels[type],
        value: classifiedRecords.filter((entry) => entry.classification.type === type).length,
        color: absenceTypeColors[type],
      })),
    [classifiedRecords],
  );

  const warningRows = useMemo<ChartRow[]>(() => {
    const totals = new Map<string, number>();

    absenceTypeRecords
      .filter((entry) => entry.classification.type === "confirmed")
      .forEach(({ record }) => {
        const employee = employeeById.get(record.employeeId);
        const label = record.employeeName || employee?.name || "Funcionário sem nome";
        totals.set(label, (totals.get(label) || 0) + 1);
      });

    return Array.from(totals.entries())
      .map(([label, value]) => ({ label, value, color: absenceTypeColors.confirmed }))
      .sort((left, right) => right.value - left.value || compareText(left.label, right.label))
      .slice(0, 24);
  }, [absenceTypeRecords, employeeById]);

  const repeatedAbsenceRows = useMemo<DualChartRow[]>(() => {
    const totals = new Map<string, { confirmed: number; certificate: number }>();

    absenceTypeRecords.forEach(({ record, classification }) => {
      if (classification.type !== "confirmed" && classification.type !== "certificate") return;
      const employee = employeeById.get(record.employeeId);
      const label = record.employeeName || employee?.name || "Funcionário sem nome";
      const current = totals.get(label) || { confirmed: 0, certificate: 0 };
      if (classification.type === "certificate") current.certificate += 1;
      else current.confirmed += 1;
      totals.set(label, current);
    });

    return Array.from(totals.entries())
      .map(([label, value]) => ({ label, primary: value.confirmed, secondary: value.certificate }))
      .filter((row) => row.primary + row.secondary > 3)
      .sort((left, right) => (right.primary + right.secondary) - (left.primary + left.secondary) || compareText(left.label, right.label))
      .slice(0, 36);
  }, [absenceTypeRecords, employeeById]);

  const cidRows = useMemo<CidCategoryRow[]>(() => {
    const categories = new Map<string, { count: number; cids: Map<string, number> }>();

    baseFilteredRecords
      .filter((record) => record.status === "medical_certificate")
      .forEach((record) => {
        const details = cidDetailsFromValue(record.cid || "");
        const category = details.hasCode ? details.category : `Sem CID - ${details.category}`;
        if (selectedCidCategories.size && !selectedCidCategories.has(category)) return;

        const current = categories.get(category) || { count: 0, cids: new Map<string, number>() };
        current.count += 1;
        current.cids.set(details.label, (current.cids.get(details.label) || 0) + 1);
        categories.set(category, current);
      });

    return Array.from(categories.entries())
      .map(([category, item]) => ({
        category,
        count: item.count,
        cids: Array.from(item.cids.entries())
          .map(([label, count]) => ({ label, count }))
          .sort((left, right) => right.count - left.count || compareText(left.label, right.label)),
      }))
      .sort((left, right) => right.count - left.count || compareText(left.category, right.category));
  }, [baseFilteredRecords, selectedCidCategories]);

  const cidPieRows = useMemo<CidPieRow[]>(() => {
    const totals = new Map<string, { category: string; count: number; employees: CidEmployeeEntry[] }>();

    baseFilteredRecords
      .filter((record) => record.status === "medical_certificate")
      .forEach((record) => {
        const details = cidDetailsFromValue(record.cid || "");
        const category = details.hasCode ? details.category : `Sem CID - ${details.category}`;
        if (selectedCidCategories.size && !selectedCidCategories.has(category)) return;

        const employee = employeeById.get(record.employeeId);
        const current = totals.get(details.label) || { category, count: 0, employees: [] };
        current.count += 1;
        current.employees.push({
          employeeId: record.employeeId,
          employeeName: record.employeeName || employee?.name || "Funcionario sem nome",
          category,
          date: record.date,
          cidLabel: details.label,
        });
        totals.set(details.label, current);
      });

    return Array.from(totals.entries())
      .map(([label, item], index) => ({
        label,
        value: item.count,
        category: item.category,
        employees: item.employees.sort((left, right) => compareText(left.employeeName, right.employeeName) || left.date.localeCompare(right.date)),
        color: cidPieColors[index % cidPieColors.length],
      }))
      .sort((left, right) => right.value - left.value || compareText(left.label, right.label));
  }, [baseFilteredRecords, employeeById, selectedCidCategories]);

  const selectedCidRow = useMemo(
    () => cidPieRows.find((row) => row.label === selectedCidLabel) || cidPieRows[0],
    [cidPieRows, selectedCidLabel],
  );

  const selectedCidEmployees = useMemo(() => {
    if (!selectedCidRow) return [];
    const grouped = new Map<string, { employeeName: string; category: string; count: number; dates: string[] }>();

    selectedCidRow.employees.forEach((entry) => {
      const current = grouped.get(entry.employeeId) || {
        employeeName: entry.employeeName,
        category: entry.category,
        count: 0,
        dates: [],
      };
      current.count += 1;
      current.dates.push(entry.date);
      grouped.set(entry.employeeId, current);
    });

    return Array.from(grouped.values())
      .map((entry) => ({ ...entry, dates: entry.dates.sort((left, right) => left.localeCompare(right)) }))
      .sort((left, right) => right.count - left.count || compareText(left.employeeName, right.employeeName));
  }, [selectedCidRow]);

  useEffect(() => {
    if (!cidPieRows.length) {
      if (selectedCidLabel) setSelectedCidLabel("");
      return;
    }

    if (!cidPieRows.some((row) => row.label === selectedCidLabel)) {
      setSelectedCidLabel(cidPieRows[0].label);
    }
  }, [cidPieRows, selectedCidLabel]);

  const cidCategoryOptions = useMemo(() => {
    const categories = new Set<string>();

    baseFilteredRecords
      .filter((record) => record.status === "medical_certificate")
      .forEach((record) => {
        const details = cidDetailsFromValue(record.cid || "");
        categories.add(details.hasCode ? details.category : `Sem CID - ${details.category}`);
      });

    return sortOptions(Array.from(categories).map((category) => ({ value: category, label: category })));
  }, [baseFilteredRecords]);

  const metricCards = [
    { label: "Total de Funcionários", value: formatCompact(metrics.employees), icon: Users, tone: "blue" },
    { label: "Total de Faltas", value: formatCompact(metrics.absences), icon: FileText, tone: "red" },
    { label: "Total de Atestados", value: formatCompact(metrics.certificates), icon: Stethoscope, tone: "green" },
    { label: "Faltas + Atestados", value: formatCompact(metrics.absencesAndCertificates), icon: HeartPulse, tone: "yellow" },
    { label: "Folgas", value: formatCompact(metrics.dayOffs), icon: CalendarDays, tone: "gray" },
    { label: "Dias Úteis Salvos", value: formatCompact(metrics.savedUsefulDays), icon: Clock, tone: "teal" },
    { label: "% Absenteísmo", value: formatPercent(metrics.absenteeism), icon: ChartPie, tone: "purple" },
    { label: "Perda $", value: formatCurrencyCompact(metrics.loss), icon: DollarSign, tone: "blue" },
  ];

  function clearFilters() {
    setAnalysisScope("group");
    setSelectedGroupId(defaultGroupId);
    setCompanyIds([]);
    setTeamIds([]);
    setEmployeeIds([]);
    setFunctionKeys([]);
    setCpfValues([]);
    setDepartmentIds([]);
    setSectorIds([]);
    setSubsectorIds([]);
    setWeekKey("all");
    setAbsenceTypeFilters([]);
    setCidCategoryFilters([]);
    setStartDate(yearStartISO(today));
    setEndDate(today);
  }

  const periodText = `${formatDate(startDate)} até ${formatDate(endDate)}`;

  return (
    <section className="page hr-control-page">
      <div className="page-header">
        <div>
          <h1 className="page-title">Controle RH</h1>
          <p className="page-subtitle">Indicadores de ponto, absenteísmo e atestados por categoria de CID.</p>
        </div>
        <div className="hr-header-actions">
          <div className="hr-scope-controls" aria-label="Escopo da análise">
            <label className="field">
              Analisar por
              <select
                value={analysisScope}
                onChange={(event) => {
                  const nextScope = event.target.value as HrAnalysisScope;
                  setAnalysisScope(nextScope);
                  setTeamIds([]);
                  if (nextScope === "group") setSelectedGroupId(defaultGroupId);
                  if (nextScope === "company") setCompanyIds([]);
                }}
              >
                <option value="group">Grupo</option>
                <option value="company">Empresa</option>
              </select>
            </label>
            {analysisScope === "group" ? (
              <label className="field">
                Grupo
                <select
                  value={selectedGroupId}
                  onChange={(event) => {
                    setSelectedGroupId(event.target.value);
                    setTeamIds([]);
                  }}
                >
                  <option value="">Selecione um grupo</option>
                  {groupOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="field">
                Empresa
                <select
                  value={companyIds[0] || ""}
                  onChange={(event) => {
                    setCompanyIds(event.target.value ? [event.target.value] : []);
                    setTeamIds([]);
                  }}
                >
                  <option value="">Selecione uma empresa</option>
                  {companyOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
            )}
          </div>
          <span className={`hr-load-badge ${recordsLoading || savedDaysLoading || data.loading ? "is-loading" : ""}`}>
            {recordsLoading || savedDaysLoading || data.loading ? "Atualizando dados" : `${formatInteger(baseFilteredRecords.length)} registro(s) de ${formatInteger(savedActiveDates.length)} dia(s) salvo(s)`}
          </span>
        </div>
      </div>

      <div className="hr-screen-tabs" role="tablist" aria-label="Telas do Controle RH">
        {microScreens.map((screen) => {
          const Icon = screen.icon;
          return (
            <button
              key={screen.key}
              type="button"
              className={activeView === screen.key ? "is-active" : ""}
              onClick={() => setActiveView(screen.key)}
              role="tab"
              aria-selected={activeView === screen.key}
            >
              <Icon size={16} />
              {screen.label}
            </button>
          );
        })}
      </div>

      <div className="filters-panel hr-control-filters">
        <Search size={18} />
        <label className="field">
          Data inicial
          <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        </label>
        <label className="field">
          Data final
          <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </label>
        <label className="field">
          Semana
          <select value={weekKey} onChange={(event) => setWeekKey(event.target.value)}>
            <option value="all">Todas</option>
            {weekOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
        <MultiSelect
          label="Funcionários"
          placeholder="Funcionários"
          value={employeeIds}
          onChange={setEmployeeIds}
          options={employeeOptions}
        />
        <MultiSelect
          label="Função"
          placeholder="Função"
          value={functionKeys}
          onChange={setFunctionKeys}
          options={functionOptions}
        />
        <MultiSelect
          label="CPF"
          placeholder="CPF"
          value={cpfValues}
          onChange={setCpfValues}
          options={cpfOptions}
        />
        <MultiSelect
          label="Departamento"
          placeholder="Departamento"
          value={departmentIds}
          onChange={(nextValues) => {
            setDepartmentIds(nextValues);
            setSectorIds([]);
            setSubsectorIds([]);
          }}
          options={departmentOptions}
        />
        <MultiSelect
          label="Setor"
          placeholder="Setor"
          value={sectorIds}
          onChange={(nextValues) => {
            setSectorIds(nextValues);
            setSubsectorIds([]);
          }}
          options={sectorOptions}
        />
        <MultiSelect
          label="Subsetor"
          placeholder="Subsetor"
          value={subsectorIds}
          onChange={setSubsectorIds}
          options={subsectorOptions}
        />
        <MultiSelect
          label="Equipe do dia"
          placeholder="Equipe do dia"
          value={teamIds}
          onChange={setTeamIds}
          options={teamOptions}
        />
        {activeView === "absenceTypes" ? (
          <MultiSelect
            label="Tipo de falta"
            placeholder="Tipo de falta"
            value={absenceTypeFilters}
            onChange={setAbsenceTypeFilters}
            options={absenceTypeOptions}
          />
        ) : null}
        {activeView === "cids" ? (
          <MultiSelect
            label="Categoria CID"
            placeholder="Categoria CID"
            value={cidCategoryFilters}
            onChange={setCidCategoryFilters}
            options={cidCategoryOptions}
          />
        ) : null}
        <ClearFiltersButton active={hasActiveFilters} onClear={clearFilters} />
      </div>

      {invalidRange ? (
        <div className="empty-state">
          <h2>Período inválido</h2>
          <p>A data inicial precisa ser menor ou igual à data final.</p>
        </div>
      ) : null}

      {activeView === "general" ? (
        <>
          <div className="hr-metric-grid" aria-label="Resumo de Controle RH">
            {metricCards.map((metric) => {
              const Icon = metric.icon;
              return (
                <article className={`hr-metric-card is-${metric.tone}`} key={metric.label}>
                  <Icon size={20} />
                  <span>{metric.label}</span>
                  <strong>{metric.value}</strong>
                </article>
              );
            })}
          </div>

          <div className="hr-dashboard-grid">
            <section className="hr-chart-panel">
              <header className="hr-chart-header">
                <div>
                  <h2><ChartColumn size={18} /> Ausência por equipe do dia</h2>
                  <span>Atestados + faltas - {periodText}</span>
                </div>
              </header>
              <HorizontalBarChart rows={teamAbsenceRows} />
            </section>

            <section className="hr-chart-panel">
              <header className="hr-chart-header">
                <div>
                  <h2><ChartColumn size={18} /> % por equipe do dia</h2>
                  <span>Faltas + atestados / dias trabalhados calculados</span>
                </div>
              </header>
              <HorizontalBarChart rows={teamAbsencePercentRows} formatter={formatPercent} />
            </section>

            <section className="hr-chart-panel">
              <header className="hr-chart-header">
                <div>
                  <h2><ChartColumn size={18} /> Faltas e atestados por mês</h2>
                  <span><i className="hr-dot is-primary" /> Qtd Faltas <i className="hr-dot is-secondary" /> Faltas por Atestados</span>
                </div>
              </header>
              <MonthlyGroupedChart rows={monthlyRows} />
            </section>

            <section className="hr-chart-panel">
              <header className="hr-chart-header">
                <div>
                  <h2><ChartColumn size={18} /> Faltas e atestados por mês</h2>
                  <span>Faltas + atestados / dias trabalhados calculados do mês</span>
                </div>
              </header>
              <MonthlyPercentChart rows={monthlyRows} />
            </section>
          </div>
        </>
      ) : null}

      {activeView === "overtime" ? (
        <div className="hr-dashboard-grid">
          <section className="hr-chart-panel hr-wide-chart">
            <header className="hr-chart-header">
              <div>
                <h2><ChartColumn size={18} /> Horas extras por equipe do dia</h2>
                <span>{periodText}</span>
              </div>
            </header>
            <HorizontalBarChart rows={overtimeByTeam} formatter={formatHours} />
          </section>

          <section className="hr-chart-panel hr-wide-chart">
            <header className="hr-chart-header">
              <div>
                <h2><ChartColumn size={18} /> Horas extras por mês</h2>
                <span>Somatório de HE no período filtrado</span>
              </div>
            </header>
            <HorizontalBarChart rows={overtimeByMonth} formatter={formatHours} />
          </section>
        </div>
      ) : null}

      {activeView === "absenceTypes" ? (
        <div className="hr-dashboard-grid">
          <section className="hr-chart-panel">
            <header className="hr-chart-header">
              <div>
                <h2><ChartColumn size={18} /> Faltas confirmadas</h2>
                <span>Funcionarios com status Falta Confirmada</span>
              </div>
            </header>
            <HorizontalBarChart rows={warningRows} />
          </section>

          <section className="hr-chart-panel">
            <header className="hr-chart-header">
              <div>
                <h2><ChartPie size={18} /> Total de faltas e atestados</h2>
                <span>Distribuição por tipo</span>
              </div>
            </header>
            <PieSummary rows={absencePieRows} />
          </section>

          <section className="hr-chart-panel hr-wide-chart">
            <header className="hr-chart-header">
              <div>
                <h2><HeartPulse size={18} /> Faltas confirmadas / atestados (maior que 3)</h2>
                <span>Funcionarios acima do limite no periodo selecionado</span>
              </div>
            </header>
            <DualBarChart
              rows={repeatedAbsenceRows}
              primaryLabel={absenceTypeLabels.confirmed}
              secondaryLabel={absenceTypeLabels.certificate}
            />
          </section>
        </div>
      ) : null}

      {activeView === "cids" ? (
        <section className="hr-chart-panel hr-wide-chart">
          <header className="hr-chart-header">
            <div>
              <h2><Stethoscope size={18} /> CIDs em atestados</h2>
              <span>Pizza por CID registrado e lista de funcionarios por categoria</span>
            </div>
          </header>
          <div className="hr-cid-pie-grid">
            <CidPieChart rows={cidPieRows} selectedLabel={selectedCidRow?.label || ""} onSelect={setSelectedCidLabel} />
            <aside className="hr-cid-selection-panel">
              <header>
                <span>CID selecionado</span>
                <strong>{selectedCidRow?.label || "Nenhum CID"}</strong>
                {selectedCidRow ? <small>{selectedCidRow.category} - {formatInteger(selectedCidRow.value)} registro(s)</small> : null}
              </header>

              <div className="hr-cid-employee-list">
                {selectedCidEmployees.map((entry) => (
                  <article key={`${entry.employeeName}-${entry.category}`}>
                    <strong>{entry.employeeName}</strong>
                    <span>{entry.category}</span>
                    <small>{formatInteger(entry.count)} registro(s): {entry.dates.map(formatDate).join(", ")}</small>
                  </article>
                ))}
                {!selectedCidEmployees.length ? <p className="muted">Clique em uma fatia do grafico para ver os funcionarios.</p> : null}
              </div>
            </aside>
          </div>
          {cidRows.length ? (
            <div className="hr-cid-breakdown">
              {cidRows.map((row) => (
                <article className="hr-cid-group" key={row.category}>
                  <header>
                    <strong>{row.category}</strong>
                    <span>{formatInteger(row.count)}</span>
                  </header>
                  <div>
                    {row.cids.slice(0, 8).map((cid) => (
                      <p key={cid.label}>
                        <span>{cid.label}</span>
                        <strong>{formatInteger(cid.count)}</strong>
                      </p>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
