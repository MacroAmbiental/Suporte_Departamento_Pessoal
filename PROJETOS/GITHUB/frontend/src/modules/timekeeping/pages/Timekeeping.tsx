import { noticeAdjustedMinutes, noticeWorkAdjustment } from "../utils/noticeWorkAdjustment";
import {
  CalendarDays,
  Calculator,
  Check,
  Clock,
  Columns3,
  Edit3,
  FileSpreadsheet,
  FileText,
  Folder,
  GripVertical,
  MoreVertical,
  Lock,
  Unlock,
  Trash2,
  Plus,
  Save,
  Search,
  RefreshCw,
  Upload,
  Users,
  X,
  Zap,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import { doc, getDoc, setDoc, collection, addDoc } from "firebase/firestore";
import { setNavGuard } from "../../../common/navGuard";
import { getFunctions, httpsCallable } from "firebase/functions";
import { firebaseApp, firestore } from "@/services/firebase";
import type * as XLSXTypes from "xlsx";
import { useTimekeepingContext } from "@/modules/timekeeping/context/TimekeepingContext";
import {
  employeeEffectiveStatusForDate,
  initialTimekeepingFilters,
} from "@/modules/timekeeping/hooks/useTimekeepingModel";
import {
  cachedDuplicateTimeRecordIds,
  cachedLegacyTimeRecordIds,
  loadTimeRecordsRange,
  pickPreferredTimeRecord,
} from "@/modules/timekeeping/data/timeRecordsRepository";
import {
  buildCidOptions,
  standardizeCidValue,
} from "@/modules/timekeeping/data/cidCatalog";
import {
  clearTimekeepingPresence,
  loadTimekeepingDayTables,
  publishTimekeepingPresence,
  saveTimekeepingDayTable,
  subscribeTimekeepingPresence,
  timeRecordDocumentId,
} from "@/modules/timekeeping/data/timekeepingDayRepository";
import useCreateShortcut from "@/hooks/useCreateShortcut";
import { useAuth } from "@/hooks/useAuth";
import ClearFiltersButton from "../../../common/components/ClearFiltersButton";
import ConfirmModal from "@/common/components/ConfirmModal";
import type { DeleteImpact } from "@/common/components/DeleteImpactModal";
import { buildDomainDeletionImpact } from "@/common/utils/deletionImpact";
import MultiSelect from "../../../common/components/MultiSelect";
import TimekeepingPagination from "@/modules/timekeeping/components/TimekeepingPagination";
import type {
  AttendanceStatus,
  BenefitContract,
  CompanyGroup,
  Employee,
  TimeRecord,
  TimekeepingDayTable,
  TimekeepingPresence,
  TimekeepingColumn,
  TimekeepingColumnType,
  WorkScheduleDay,
} from "@/types/domain";
import {
  companyGroupForCompany as resolveCompanyGroupForCompany,
  dedupeStructureItems,
  primaryCompanyGroup,
  structureItemsForGroup,
} from "@/common/utils/groupStructure";
import { badgeClass, labelStatus, todayISO } from "@/utils/format";
import { isInExperience, processModalities, terminationModes } from "@/modules/employees/experience";

const fallbackStatuses: AttendanceStatus[] = [
  "present",
  "absence_pending",
  "absence_confirmed",
  "medical_certificate",
  "vacation",
  "day_off",
  "leave",
];
const minColumnWidth = 150;
const defaultColumnWidth = 190;
const maxColumnWidth = 560;
const settingsColumnKey = "__timekeeping_calculation_settings";
const noColumnFilterSelectionKey = "__timekeeping_no_column_filter_selection";
const columnOrderStorageKey = "__timekeeping_column_order_v1";

let xlsxModulePromise: Promise<typeof import("xlsx-js-style")> | null = null;

function loadXlsxModule() {
  if (!xlsxModulePromise) xlsxModulePromise = import("xlsx-js-style");
  return xlsxModulePromise;
}

const employeeKindLabels: Record<string, string> = {
  contract: "Funcionario de contrato",
  company: "Funcionario da empresa",
  diarist: "Diarista",
};

function employeeKindLabel(employee: Employee) {
  const registrationData = employee.registrationData || {};
  const kind = String(
    (employee as { employeeKind?: string }).employeeKind ||
    registrationData.employeeKind ||
    "",
  ).toLowerCase();
  return employeeKindLabels[kind] || "-";
}

function employeeProcessBadge(employee: Employee, date: string) {
  const fields = employee.registrationData || {};
  const mode = String(fields.terminationMode || "");
  const end = String(
    fields.noticeEndDate ||
      fields.scheduledDeactivationDate ||
      fields.deactivationEffectiveDate ||
      "",
  );
  const label = terminationModes[mode as keyof typeof terminationModes];

  if (employee.status === "terminated") return null;

  if (label && (!end || date <= end)) {
    const reduction =
      fields.noticeReductionApplies === "true" &&
      fields.noticeReduction === "hours" &&
      noticeWorkAdjustment(employee, date) === "hours"
        ? " · redução de 2h/dia"
        : "";

    return `${label}${reduction}`;
  }

  if (fields.noticeStartDate && end && date >= fields.noticeStartDate && date < end) {
    return "Aviso prévio";
  }

  if (!label && (fields.scheduledDeactivationDate || fields.deactivationEffectiveDate)) {
    return terminationModes.quick;
  }

  return isInExperience(employee, date) ? "Contrato de experiência" : null;
}

const baseColumns = [
  {
    key: "functionName",
    label: "FUNÇÃO",
    type: "system" as const,
    systemField: "functionName",
    readOnly: true,
    width: 180,
    wrap: false,
  },
  {
    key: "realTeamId",
    label: "EQUIPE REAL",
    type: "system" as const,
    systemField: "realTeam",
    readOnly: true,
    width: 180,
    wrap: false,
  },
  {
    key: "company",
    label: "EMPRESA",
    type: "system" as const,
    systemField: "company",
    readOnly: true,
    width: 230,
    wrap: false,
  },
  {
    key: "employee",
    label: "FUNCIONÁRIO",
    type: "system" as const,
    systemField: "employee",
    readOnly: true,
    width: 260,
    wrap: false,
  },
  {
    key: "employeeKind",
    label: "TIPO DE CONTRATO",
    type: "system" as const,
    systemField: "employeeKind",
    readOnly: true,
    width: 190,
    wrap: false,
  },
  {
    key: "checkIn",
    label: "ENT. 1",
    type: "time" as const,
    width: 120,
    wrap: false,
  },
  {
    key: "checkOut",
    label: "SAÍ. 1",
    type: "time" as const,
    width: 120,
    wrap: false,
  },
  {
    key: "ent2",
    label: "ENT. 2",
    type: "time" as const,
    width: 120,
    wrap: false,
  },
  {
    key: "sai2",
    label: "SAÍ. 2",
    type: "time" as const,
    width: 120,
    wrap: false,
  },
  {
    key: "ent3",
    label: "ENT. 3",
    type: "time" as const,
    width: 120,
    wrap: false,
  },
  {
    key: "sai3",
    label: "SAÍ. 3",
    type: "time" as const,
    width: 120,
    wrap: false,
  },
  {
    key: "normais",
    label: "NORMAIS",
    type: "time" as const,
    width: 120,
    wrap: false,
  },
  {
    key: "faltas",
    label: "FALTAS",
    type: "time" as const,
    width: 120,
    wrap: false,
  },
  {
    key: "extras",
    label: "EXTRAS",
    type: "time" as const,
    width: 120,
    wrap: false,
  },
  {
    key: "overtimePercent",
    label: "% HE",
    type: "number" as const,
    width: 120,
    wrap: false,
  },
  {
    key: "carga",
    label: "CARGA",
    type: "time" as const,
    width: 120,
    wrap: false,
  },
  {
    key: "status",
    label: "STATUS",
    type: "select" as const,
    width: 160,
    wrap: false,
  },
  { key: "cid", label: "CID", type: "text" as const, width: 150, wrap: false },
  {
    key: "dayTeamId",
    label: "EQUIPE DO DIA",
    type: "select" as const,
    width: 190,
    wrap: false,
  },
];

type BaseColumnDescriptor = (typeof baseColumns)[number];
type ColumnDescriptor = BaseColumnDescriptor | TimekeepingColumn;
type TableRow = Record<string, string>;
type FormulaMap = Record<string, string>;

const calculatedMetricKeys = ["normais", "faltas", "extras", "carga"] as const;
const manualMetricOverrideField = "__manual_calculation_fields";
const manualStatusSelectedField = "__manual_status_selected";
const manualWarningStorageKey = "__timekeeping_manual_warning_dates";

type CalculatedMetricKey = (typeof calculatedMetricKeys)[number];
type PendingManualMetricEdit = {
  employeeId: string;
  employeeName: string;
  columnKey: CalculatedMetricKey;
  columnLabel: string;
  value: string;
  date: string;
};

type ColumnForm = {
  id?: string;
  label: string;
  type: TimekeepingColumnType;
  options: string;
  optionColors: string;
  linkedModule: string;
  relatedField: string;
  systemField: string;
  formula: string;
};

type ConfirmDialog = {
  title: string;
  message: string;
  confirmLabel: string;
  variant?: "primary" | "danger";
  impact?: DeleteImpact;
  onConfirm: () => Promise<void> | void;
};

type SortDirection = "asc" | "desc";
type SortConfig = { key: string; direction: SortDirection } | null;
type ColumnFilterConfig = { search: string; selected: string[] };
type ColumnFilterMap = Record<string, ColumnFilterConfig>;
type ColumnFilterMenuPosition = {
  top: number;
  left: number;
  listMaxHeight: number;
};

const columnFilterMenuWidth = 320;
const columnFilterMenuEstimatedHeight = 368;
const columnFilterMenuMargin = 12;
type ReportFormat = "excel" | "pdf";

type SecullumImportRow = {
  rowNumber: number;
  date: string;
  employeeName: string;
  ent1: string;
  sai1: string;
  ent2: string;
  sai2: string;
  ent3: string;
  sai3: string;
  normais: string;
  faltas: string;
  extras: string;
  carga: string;
  employee?: Employee;
  warning?: string;
  hasManualRecord?: boolean;
  blockedReason?: string;
};

type CalculationPanelTab = "rules" | "formulas" | "statuses";

type StatusCondition = {
  id: string;
  value: string;
  label: string;
  rowColor: string;
  textColor: string;
  active: boolean;
};

type CalculationSettings = {
  usefulMinutesByWeekday: Record<string, number>;
  intervalMinutes: number;
  delayToleranceMinutes: number;
  secullumLunchOutTime: string;
  secullumLunchReturnTime: string;
  secullumEndTime: string;
  overtimeRates: {
    weekday: number;
    saturday: number;
    sunday: number;
    holiday: number;
  };
  holidays: string[];
  deductAbsencesFromBenefits: boolean;
  autoRecalculate: boolean;
  formulas: {
    usefulHours: string;
    overtimeHours: string;
    overtimePercent: string;
    overtimeAmount: string;
    hourBank: string;
  };
  statusConditions: StatusCondition[];
};

type StatusConditionForm = StatusCondition;

type SavedDayFolder = {
  date: string;
};

type SavedMonthFolder = {
  month: string;
  label: string;
  days: SavedDayFolder[];
};

type SavedYearFolder = {
  year: string;
  months: SavedMonthFolder[];
};

const emptyColumnForm: ColumnForm = {
  label: "",
  type: "text",
  options: "",
  optionColors: "",
  linkedModule: "",
  relatedField: "",
  systemField: "",
  formula: "",
};

const weekdayLabels: Record<string, string> = {
  "1": "Segunda-feira",
  "2": "Terça-feira",
  "3": "Quarta-feira",
  "4": "Quinta-feira",
  "5": "Sexta-feira",
  "6": "Sábado",
  "0": "Domingo",
};

const defaultStatusConditions: StatusCondition[] = [
  {
    id: "present",
    value: "present",
    label: "Presente",
    rowColor: "#d8f5e7",
    textColor: "#058356",
    active: true,
  },
  {
    id: "absence_pending",
    value: "absence_pending",
    label: "Falta / Pendência",
    rowColor: "#fff0c7",
    textColor: "#7a4d00",
    active: true,
  },
  {
    id: "absence_confirmed",
    value: "absence_confirmed",
    label: "Falta Confirmada",
    rowColor: "#ffe2e4",
    textColor: "#9f1f2a",
    active: true,
  },
  {
    id: "medical_certificate",
    value: "medical_certificate",
    label: "Atestado",
    rowColor: "#e3f1ff",
    textColor: "#246999",
    active: true,
  },
  {
    id: "vacation",
    value: "vacation",
    label: "Férias",
    rowColor: "#efe7ff",
    textColor: "#6541a5",
    active: true,
  },
  {
    id: "day_off",
    value: "day_off",
    label: "Folga",
    rowColor: "#eaf1f7",
    textColor: "#506477",
    active: true,
  },
  {
    id: "leave",
    value: "leave",
    label: "Afastado",
    rowColor: "#fff0df",
    textColor: "#9a5a00",
    active: true,
  },
];

const defaultCalculationSettings: CalculationSettings = {
  usefulMinutesByWeekday: {
    "1": 600,
    "2": 600,
    "3": 600,
    "4": 600,
    "5": 539,
    "6": 0,
    "0": 0,
  },
  intervalMinutes: 60,
  delayToleranceMinutes: 10,
  secullumLunchOutTime: "12:00",
  secullumLunchReturnTime: "13:01",
  secullumEndTime: "17:00",
  overtimeRates: {
    weekday: 50,
    saturday: 75,
    sunday: 120,
    holiday: 120,
  },
  holidays: [],
  deductAbsencesFromBenefits: true,
  autoRecalculate: true,
  formulas: {
    usefulHours: "Hora útil = base configurada por dia da semana",
    overtimeHours:
      "HE = tempo transcorrido acima da carga configurada para o dia da semana",
    overtimePercent: "%HE = 50% seg-sex, 75% sábado, 120% domingo/feriado",
    overtimeAmount: "Valor HE = HE x (Salário ÷ 220) x (1 + %HE)",
    hourBank:
      "FALTAS = diferença para completar a carga do dia; EXTRAS = o que ultrapassar a carga do dia",
  },
  statusConditions: defaultStatusConditions,
};

const emptyStatusConditionForm: StatusConditionForm = {
  id: "",
  value: "",
  label: "",
  rowColor: "#d8f5e7",
  textColor: "#058356",
  active: true,
};

function formatDateFolderLabel(date: string) {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}

function formatDateForDisplay(date: string) {
  return formatDateFolderLabel(date);
}

function formatMonthFolderLabel(monthKey: string) {
  const [year, month] = monthKey.split("-").map(Number);
  const label = new Date(year, month - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
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

function parseJson<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function readStoredColumnOrder() {
  if (typeof window === "undefined") return [] as string[];
  return parseJson<string[]>(
    window.localStorage.getItem(columnOrderStorageKey) || undefined,
    [],
  );
}

function applyColumnOrder<T extends { key: string }>(items: T[], order: string[]) {
  if (!order.length) return items;
  const positionByKey = new Map(order.map((key, index) => [key, index]));
  return [...items].sort((left, right) => {
    const leftPosition = positionByKey.get(left.key);
    const rightPosition = positionByKey.get(right.key);
    if (leftPosition === undefined && rightPosition === undefined) return 0;
    if (leftPosition === undefined) return 1;
    if (rightPosition === undefined) return -1;
    return leftPosition - rightPosition;
  });
}

function sanitizeColumnSelection(selectedKeys: string[] | null, availableKeys: string[]) {
  if (selectedKeys === null) return availableKeys;
  const availableSet = new Set(availableKeys);
  return selectedKeys.filter((key) => availableSet.has(key));
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function parseOptionColors(value: string) {
  return value
    .split(/\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((acc, line) => {
      const [option, color] = line.split("=").map((part) => part.trim());
      if (option && color) acc[option] = color;
      return acc;
    }, {});
}

function stringifyOptionColors(colors?: Record<string, string>) {
  return Object.entries(colors || {})
    .map(([option, color]) => `${option}=${color}`)
    .join("\n");
}

function mergeCalculationSettings(value?: string): CalculationSettings {
  const parsed = parseJson<Partial<CalculationSettings>>(value, {});
  return {
    ...defaultCalculationSettings,
    ...parsed,
    usefulMinutesByWeekday: {
      ...defaultCalculationSettings.usefulMinutesByWeekday,
      ...(parsed.usefulMinutesByWeekday || {}),
    },
    secullumLunchOutTime:
      parsed.secullumLunchOutTime ||
      defaultCalculationSettings.secullumLunchOutTime,
    secullumLunchReturnTime:
      parsed.secullumLunchReturnTime ||
      defaultCalculationSettings.secullumLunchReturnTime,
    secullumEndTime:
      parsed.secullumEndTime || defaultCalculationSettings.secullumEndTime,
    overtimeRates: {
      ...defaultCalculationSettings.overtimeRates,
      ...(parsed.overtimeRates || {}),
    },
    formulas: {
      ...defaultCalculationSettings.formulas,
      ...(parsed.formulas || {}),
    },
    statusConditions: parsed.statusConditions?.length
      ? parsed.statusConditions
      : defaultStatusConditions,
    holidays: parsed.holidays || [],
  };
}

function serializeCalculationSettings(settings: CalculationSettings) {
  return JSON.stringify(settings);
}

function normalizeKey(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toNumber(value: string | number | undefined) {
  const normalized = String(value ?? "")
    .replace(/[^0-9,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function toFixed2(value: string | number | undefined) {
  const number = typeof value === "number" ? value : toNumber(value);
  return Number.isFinite(number) ? Math.round(number * 100) / 100 : 0;
}

function formatNumber(value: string | number | undefined) {
  const number = toFixed2(value);
  return Number.isFinite(number) ? number.toFixed(2) : "0.00";
}

function getRowValue(row: TableRow, column: string) {
  if (row[column] != null) return row[column];
  const normalizedColumn = normalizeKey(column);
  if (row[normalizedColumn] != null) return row[normalizedColumn];
  const matchingKey = Object.keys(row).find(
    (key) => normalizeKey(key) === normalizedColumn,
  );
  return matchingKey ? row[matchingKey] : "";
}

function calculateFormula(formula: string, row: TableRow, columns: string[]) {
  const expression = formula.replace(/^=/, "").trim();
  if (!expression) return "";

  let replaced = expression;
  const sortedColumns = [...columns].sort((a, b) => b.length - a.length);
  for (const column of sortedColumns) {
    const value = String(toNumber(getRowValue(row, column) || "0"));
    replaced = replaced.replace(
      new RegExp(`\\b${escapeRegex(column)}\\b`, "gi"),
      value,
    );
    replaced = replaced.replace(
      new RegExp(`\\b${escapeRegex(normalizeKey(column))}\\b`, "gi"),
      value,
    );
  }

  if (!/^[0-9+\-*/().,\s]+$/.test(replaced)) return "";
  try {
    const result = Function(
      `"use strict"; return (${replaced.replace(/,/g, ".")});`,
    )();
    return Number.isFinite(Number(result)) ? formatNumber(result) : "";
  } catch {
    return "";
  }
}

function recalculateBenefitRows(
  rows: TableRow[],
  columns: string[],
  formulas: FormulaMap,
) {
  return rows.map((row) => {
    const next = { ...row };
    for (const column of columns) {
      if (formulas[column])
        next[column] = calculateFormula(formulas[column], next, columns);
      if (next[column] == null) next[column] = "";
    }
    return next;
  });
}

function readBenefitColumns(contract?: BenefitContract) {
  return parseJson<string[]>(contract?.customFields?.modelColumns, []);
}

function readBenefitRows(contract?: BenefitContract) {
  return parseJson<TableRow[]>(contract?.customFields?.tableRows, []);
}

function readBenefitFormulas(contract?: BenefitContract) {
  return parseJson<FormulaMap>(contract?.customFields?.formulas, {});
}

function sameEmployeeRow(row: TableRow, employee: Employee) {
  const possibleNames = ["Funcionário", "Funcionario", "Nome", "Empregado"];
  const possibleCpf = ["CPF", "Cpf"];
  const possibleRegistration = ["Matrícula", "Matricula", "Registro"];

  const nameMatch = possibleNames.some(
    (column) =>
      normalizeKey(getRowValue(row, column)) === normalizeKey(employee.name),
  );
  const cpfMatch =
    Boolean(employee.cpf) &&
    possibleCpf.some(
      (column) =>
        normalizeKey(getRowValue(row, column)) === normalizeKey(employee.cpf),
    );
  const registrationMatch =
    Boolean(employee.registration) &&
    possibleRegistration.some(
      (column) =>
        normalizeKey(getRowValue(row, column)) ===
        normalizeKey(employee.registration),
    );

  return nameMatch || cpfMatch || registrationMatch;
}

function dateToWeekdayIndex(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return new Date(value).getDay();
  return new Date(year, month - 1, day).getDay();
}

function dayMatchesDate(dayName: string, date: string) {
  const normalized = normalizeKey(dayName);
  const aliases = weekDayAliases[dateToWeekdayIndex(date)] || [];
  return aliases.some(
    (alias) =>
      normalizeKey(alias) === normalized ||
      normalized.startsWith(normalizeKey(alias)),
  );
}

function scheduleForDate(
  employee: Employee,
  date: string,
): WorkScheduleDay | undefined {
  const enabledDays =
    employee.workScheduleDays?.filter((day) => day.enabled) || [];
  return enabledDays.find((day) => dayMatchesDate(day.day, date));
}

function timeToMinutes(value?: string) {
  if (!value) return null;
  const [hour, minute] = value.split(":").map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return hour * 60 + minute;
}

function minutesToTime(value: number) {
  const hour = Math.floor(value / 60)
    .toString()
    .padStart(2, "0");
  const minute = (value % 60).toString().padStart(2, "0");
  return `${hour}:${minute}`;
}

function formatHours(value: number) {
  return Number.isFinite(value) ? value.toFixed(2) : "0.00";
}

function minutesToInput(value: number) {
  return minutesToTime(Math.max(0, Math.min(1439, Math.round(value || 0))));
}

function parseMinutesInput(value: string) {
  return timeToMinutes(value) ?? 0;
}

function normalizeSecullumKey(value: unknown) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "");
}

function normalizeEmployeeName(value: unknown) {
  return String(value || "")
    .trim()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function readSecullumCell(
  row: Record<string, unknown>,
  possibleNames: string[],
): string | number | Date | undefined {
  const entries = Object.entries(row);

  for (const possibleName of possibleNames) {
    const normalizedPossibleName = normalizeSecullumKey(possibleName);
    const found = entries.find(
      ([key]) => normalizeSecullumKey(key) === normalizedPossibleName,
    );
    if (found) return found[1] as string | number | Date | undefined;
  }

  return undefined;
}

function buildSecullumRowsFromSheet(
  XLSX: typeof import("xlsx-js-style"),
  sheet: XLSXTypes.WorkSheet,
): Record<string, unknown>[] {
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  });

  const headerRowIndex = matrix.findIndex((row) => {
    const normalizedCells = row.map((cell) => normalizeSecullumKey(cell));
    return normalizedCells.includes("DATA") && normalizedCells.includes("NOME");
  });

  if (headerRowIndex < 0) {
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: "",
      raw: false,
    });
  }

  const headerRow = matrix[headerRowIndex];
  const headersByColumn = headerRow.map((cell) => String(cell || "").trim());

  return matrix.slice(headerRowIndex + 1).map((row, index) => {
    const objectRow: Record<string, unknown> = {
      __rowNumber: headerRowIndex + index + 2,
    };

    headersByColumn.forEach((header, columnIndex) => {
      if (!header) return;
      objectRow[header] = row[columnIndex] ?? "";
    });

    return objectRow;
  });
}

function excelDateToISO(value: unknown, XLSX: typeof import("xlsx-js-style")) {
  if (value == null || value === "") return "";

  if (value instanceof Date) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  if (typeof value === "number") {
    const parsed = XLSX.SSF.parse_date_code(value);
    if (!parsed) return "";
    return `${parsed.y}-${String(parsed.m).padStart(2, "0")}-${String(parsed.d).padStart(2, "0")}`;
  }

  const text = String(value).trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;

  const brMatch = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (brMatch) {
    const day = brMatch[1].padStart(2, "0");
    const month = brMatch[2].padStart(2, "0");
    let year = brMatch[3];
    if (year.length === 2) year = `20${year}`;
    return `${year}-${month}-${day}`;
  }

  const date = new Date(text);
  if (!Number.isNaN(date.getTime())) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  return "";
}

function findEmployeeBySecullumName(employees: Employee[], name: string) {
  const normalizedName = normalizeEmployeeName(name);
  return employees.find(
    (employee) => normalizeEmployeeName(employee.name) === normalizedName,
  );
}

function buildSecullumWarning(row: SecullumImportRow) {
  const warnings: string[] = [];

  if (!row.employee) warnings.push("Funcionário não encontrado");

  const pairs = [
    ["ENT. 1", row.ent1, "SAÍ. 1", row.sai1],
    ["ENT. 2", row.ent2, "SAÍ. 2", row.sai2],
    ["ENT. 3", row.ent3, "SAÍ. 3", row.sai3],
  ];

  for (const [entryLabel, entryValue, exitLabel, exitValue] of pairs) {
    if ((entryValue && !exitValue) || (!entryValue && exitValue)) {
      warnings.push(`Batida incompleta em ${entryLabel}/${exitLabel}`);
    }
  }

  if (secullumTimeToHours(row.extras, "00:00") >= 4)
    warnings.push("Hora extra alta");
  if (row.faltas) warnings.push("Possui falta");

  return warnings.join(" | ");
}

function excelTimeToText(value: string | number | Date | undefined | null) {
  if (value == null || value === "") return "";

  if (value instanceof Date) {
    const hour = String(value.getHours()).padStart(2, "0");
    const minute = String(value.getMinutes()).padStart(2, "0");
    return `${hour}:${minute}`;
  }

  if (typeof value === "number") {
    const totalMinutes = Math.round(value * 24 * 60);
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  const text = String(value).trim();
  if (!text) return "";

  const match = text.match(/(\d{1,3}):(\d{2})/);
  if (match) {
    return `${match[1].padStart(2, "0")}:${match[2]}`;
  }

  const decimal = Number(text.replace(",", "."));
  if (Number.isFinite(decimal) && decimal >= 0 && decimal < 1) {
    const totalMinutes = Math.round(decimal * 24 * 60);
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  }

  return "";
}

function secullumTimeToHours(
  value: string | number | Date | undefined,
  fallback = "00:00",
) {
  const text = excelTimeToText(value || fallback);
  if (!text) return 0;

  const [hour, minute] = text.split(":").map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return 0;

  return toFixed2(hour + minute / 60);
}

function secullumTimeToMinutes(value: string | number | Date | undefined) {
  const text = excelTimeToText(value);
  if (!text) return null;

  const [hour, minute] = text.split(":").map(Number);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;

  return hour * 60 + minute;
}

function minutesToSecullumTime(value: number, emptyWhenZero = false) {
  const minutes = Math.max(0, Math.round(value || 0));
  if (emptyWhenZero && minutes <= 0) return "";

  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function hasFilledTimeValue(value?: string | number | Date | null) {
  const text =
    value instanceof Date
      ? value.toTimeString().slice(0, 5)
      : String(value || "").trim();
  return Boolean(text && text !== "00:00" && text !== "0:00");
}

const manualZeroSai2Field = "__manualZeroSai2";

function isSai2ManuallyZeroed(customFields?: Record<string, string>) {
  return customFields?.[manualZeroSai2Field] === "true";
}

function automaticTimeValue(
  value: string | number | Date | null | undefined,
  configuredTime: string,
  shouldApplyDefault: boolean,
) {
  if (hasFilledTimeValue(value)) return excelTimeToText(value) || String(value);
  return shouldApplyDefault ? configuredTime : "00:00";
}

function automaticScheduleTimeValue(
  value: string | number | Date | null | undefined,
  configuredTime: string,
  _legacyConfiguredTime: string,
  shouldApplyDefault: boolean,
) {
  // Valor preenchido é sempre exibido LITERALMENTE. A antiga substituição do
  // default legado (ex.: 13:01 → horário da escala) travava a digitação, pois
  // ao digitar "13:10" o valor passava por "13:01" e era revertido para o
  // padrão da escala — impedindo concluir a edição.
  if (hasFilledTimeValue(value)) {
    return excelTimeToText(value) || String(value);
  }
  return shouldApplyDefault ? configuredTime : "00:00";
}

function diffSecullumMinutes(start?: string, end?: string) {
  const startMinutes = secullumTimeToMinutes(start);
  let endMinutes = secullumTimeToMinutes(end);

  if (startMinutes == null || endMinutes == null) return 0;
  if (endMinutes < startMinutes) endMinutes += 24 * 60;

  return Math.max(0, endMinutes - startMinutes);
}

function isWeekendDate(date?: string) {
  if (!date) return false;
  const parsed = new Date(`${date}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return false;
  const day = parsed.getDay();
  return day === 0 || day === 6;
}

function normalLimitMinutesForDate(
  date?: string,
  settings: CalculationSettings = defaultCalculationSettings,
) {
  if (!date) return 0;
  const weekday = String(dateToWeekdayIndex(date));
  const configuredMinutes = Number(settings.usefulMinutesByWeekday?.[weekday]);
  return Number.isFinite(configuredMinutes) && configuredMinutes >= 0
    ? configuredMinutes
    : 0;
}

function scheduleHasBreak(schedule?: WorkScheduleDay) {
  return Boolean(
    schedule?.breakStart &&
    schedule.breakEnd &&
    timeToMinutes(schedule.breakStart) != null &&
    timeToMinutes(schedule.breakEnd) != null,
  );
}

function scheduleDailyWorkMinutes(schedule?: WorkScheduleDay) {
  if (!hasCompleteSchedule(schedule) || !schedule) return null;

  const start = timeToMinutes(schedule.start);
  let end = timeToMinutes(schedule.end);
  if (start == null || end == null) return null;
  if (end < start) end += 24 * 60;

  let breakMinutes = 0;
  if (scheduleHasBreak(schedule)) {
    const breakStart = timeToMinutes(schedule.breakStart);
    let breakEnd = timeToMinutes(schedule.breakEnd);
    if (breakStart != null && breakEnd != null) {
      if (breakEnd < breakStart) breakEnd += 24 * 60;
      breakMinutes = Math.max(0, breakEnd - breakStart);
    }
  }

  return Math.max(0, end - start - breakMinutes);
}

function hasRegisteredSchedule(employee?: Employee) {
  return Boolean(employee?.workScheduleDays?.some((day) => hasCompleteSchedule(day)));
}

function normalLimitMinutesForEmployeeDate(
  employee: Employee | undefined,
  date?: string,
  settings: CalculationSettings = defaultCalculationSettings,
) {
  if (!date) return 0;
  if (hasRegisteredSchedule(employee)) {
    const schedule = employee ? scheduleForDate(employee, date) : undefined;
    return noticeAdjustedMinutes(employee, date, scheduleDailyWorkMinutes(schedule) ?? 0);
  }
  return noticeAdjustedMinutes(employee, date, normalLimitMinutesForDate(date, settings));
}

function scheduleDefaultsForDate(
  employee: Employee | undefined,
  date: string | undefined,
  settings: CalculationSettings,
) {
  const schedule = employee && date ? scheduleForDate(employee, date) : undefined;
  const hasSchedule = hasCompleteSchedule(schedule);
  const hasBreak = scheduleHasBreak(schedule);

  return {
    lunchOut: hasSchedule && hasBreak ? schedule?.breakStart || "00:00" : hasSchedule ? "00:00" : settings.secullumLunchOutTime || "12:00",
    lunchReturn: hasSchedule && hasBreak ? schedule?.breakEnd || "00:00" : hasSchedule ? "00:00" : settings.secullumLunchReturnTime || "13:01",
    end: hasSchedule ? schedule?.end || "00:00" : settings.secullumEndTime || "17:00",
  };
}

type SecullumOriginCode =
  | "celular"
  | "computador"
  | "manual"
  | "automatico"
  | "api"
  | "secullum";

type SecullumDayRow = {
  entrada1: string;
  saida1: string;
  entrada2: string;
  saida2: string;
  nome?: string;
  origem?: {
    entrada1?: string;
    saida1?: string;
    entrada2?: string;
    saida2?: string;
  };
};

const SECULLUM_ORIGIN_COLORS: Record<SecullumOriginCode, string> = {
  celular: "#0ea5e9",
  computador: "#1e3a8a",
  manual: "#dc2626",
  automatico: "#ca8a04",
  api: "#111827",
  secullum: "#2563eb",
};

const SECULLUM_ORIGIN_LABELS: Record<SecullumOriginCode, string> = {
  celular: "Secullum — Celular",
  computador: "Secullum — Computador",
  manual: "Secullum — Manual",
  automatico: "Secullum — Automático",
  api: "Registrado no Secullum via Macro Ambiental",
  secullum: "Secullum — origem não identificada",
};

type TeamSchedulePunches = { ent1: string; sai1: string; ent2: string; sai2: string };
type TeamScheduleGroup = {
  teamId: string;
  teamName: string;
  lead?: Employee;
  punches: TeamSchedulePunches;
  applicable: boolean;
  collaborators: Employee[];
  targets: Employee[];
};

function scheduleToTeamPunches(schedule?: WorkScheduleDay): TeamSchedulePunches {
  return {
    ent1: schedule?.start?.trim() || "",
    sai1: schedule?.breakStart?.trim() || "",
    ent2: schedule?.breakEnd?.trim() || "",
    sai2: schedule?.end?.trim() || "",
  };
}

function teamPunchesHaveAny(punches: TeamSchedulePunches) {
  return [punches.ent1, punches.sai1, punches.ent2, punches.sai2].some((value) =>
    hasFilledTimeValue(value),
  );
}

function normalizeTeamPunch(value?: string | number | null) {
  return hasFilledTimeValue(value) ? excelTimeToText(value) || String(value) : "";
}

function roleIsEncarregado(role?: string) {
  return normalizeKey(role || "").includes("encarregad");
}

function teamNameMatchesEmployee(teamName: string, employeeName: string) {
  const team = normalizeKey(teamName);
  const employee = normalizeKey(employeeName);
  if (!team || !employee) return false;
  return (
    team === employee ||
    employee.startsWith(`${team}_`) ||
    team.startsWith(`${employee}_`)
  );
}

function findTeamLead(
  teamId: string,
  teamName: string,
  members: Employee[],
  allEmployees: Employee[],
): Employee | undefined {
  const byFlag = allEmployees.find(
    (employee) => employee.teamId === teamId && employee.isTeamLead,
  );
  if (byFlag) return byFlag;

  const byRole = members.find((employee) => roleIsEncarregado(employee.role));
  if (byRole) return byRole;

  const candidates = allEmployees.filter(
    (employee) =>
      (employee.isTeamLead || roleIsEncarregado(employee.role)) &&
      teamNameMatchesEmployee(teamName, employee.name),
  );
  if (!candidates.length) return undefined;

  const memberCompanyIds = new Set(members.map((member) => member.companyId));
  const withSchedule = candidates.filter((employee) =>
    Boolean(employee.workScheduleDays?.length),
  );
  const pool = withSchedule.length ? withSchedule : candidates;
  return pool.find((employee) => memberCompanyIds.has(employee.companyId)) || pool[0];
}

function isEmployeeInNoticePeriod(employee: Employee, date: string) {
  const registrationData = employee.registrationData || {};
  const start = String(registrationData.noticeStartDate || "");
  const end = String(
    registrationData.noticeEndDate || registrationData.noticeDate || "",
  );
  return Boolean(start && end && date >= start && date < end);
}

function isDiaristEmployee(employee: Employee) {
  const registrationData = employee.registrationData || {};
  return (
    String(
      (employee as any).employeeKind || registrationData.employeeKind || "",
    ).toLowerCase() === "diarist"
  );
}

function employeeRowTextColor(
  employee: Employee,
  date: string,
  fallback?: string,
) {
  if (isEmployeeInNoticePeriod(employee, date)) return "#c62828";
  if (isDiaristEmployee(employee)) return "#1565c0";
  return fallback;
}

function calculateSecullumMetrics(
  checkIn?: string,
  checkOut?: string,
  customFields?: Record<string, string>,
  settings: CalculationSettings = defaultCalculationSettings,
  date?: string,
  employee?: Employee,
) {
  const fields = customFields || {};
  const scheduleDefaults = scheduleDefaultsForDate(employee, date, settings);
  const ent1 = hasFilledTimeValue(checkIn) ? String(checkIn) : "";
  const hasAnyPunch = [
    checkIn,
    checkOut,
    fields.ent2,
    fields.sai2,
    fields.ent3,
    fields.sai3,
  ].some(hasFilledTimeValue);
  // Preenchimento automático da jornada DESATIVADO: só calcula com valores
  // realmente preenchidos (o preenchimento pela programação é feito via tecla "P").
  const shouldUseDefaults = false;
  void hasAnyPunch;

  const sai1 = hasFilledTimeValue(checkOut)
    ? String(checkOut)
    : shouldUseDefaults
      ? scheduleDefaults.lunchOut
      : "";
  const ent2 = hasFilledTimeValue(fields.ent2)
    ? String(fields.ent2)
    : shouldUseDefaults
      ? scheduleDefaults.lunchReturn
      : "";
  const sai2ManuallyZeroed = isSai2ManuallyZeroed(fields);
  const sai2 = sai2ManuallyZeroed
    ? ""
    : hasFilledTimeValue(fields.sai2)
      ? String(fields.sai2)
      : shouldUseDefaults
        ? scheduleDefaults.end
        : "";
  const ent3 = hasFilledTimeValue(fields.ent3) ? String(fields.ent3) : "";
  const sai3 = hasFilledTimeValue(fields.sai3) ? String(fields.sai3) : "";

  const normalLimitMinutes = normalLimitMinutesForEmployeeDate(employee, date, settings);

  if (!hasAnyPunch) {
    return {
      normais: "00:00",
      faltas: "00:00",
      extras: "00:00",
      carga: "00:00",
      usefulHours: 0,
      baseHours: 0,
      overtimeHours: 0,
      absenceCount: 0,
    };
  }

  const accountedMinutes =
    diffSecullumMinutes(ent1, sai1) +
    diffSecullumMinutes(ent2, sai2) +
    diffSecullumMinutes(ent3, sai3);

  const normalMinutes = Math.min(accountedMinutes, normalLimitMinutes);
  const faltaMinutes = Math.max(normalLimitMinutes - accountedMinutes, 0);
  const extraMinutes = Math.max(accountedMinutes - normalLimitMinutes, 0);

  return {
    normais: normalMinutes > 0 ? minutesToSecullumTime(normalMinutes) : "00:00",
    faltas: minutesToSecullumTime(faltaMinutes, true),
    extras: minutesToSecullumTime(extraMinutes, true),
    carga: minutesToSecullumTime(normalLimitMinutes),
    usefulHours: toFixed2(normalMinutes / 60),
    baseHours: toFixed2(normalLimitMinutes / 60),
    overtimeHours: toFixed2(extraMinutes / 60),
    absenceCount: faltaMinutes > 0 ? 1 : 0,
  };
}

function isAbsenceStatus(status?: string) {
  return (
    status === "absent" ||
    status === "absence_pending" ||
    status === "absence_confirmed"
  );
}

function isWorkingStatus(status?: string) {
  return status === "present";
}

function isFinancialNeutralStatus(status?: string) {
  return (
    status === "medical_certificate" ||
    status === "vacation" ||
    status === "leave"
  );
}

function isFullDayAbsenceStatus(status?: string) {
  return status === "absence_confirmed";
}

function statusDisplayText(status?: string) {
  const condition = defaultStatusConditions.find(
    (item) => item.value === status,
  );
  return condition?.label || labelStatus(status as AttendanceStatus) || "-";
}

function shouldShowStatusInsteadOfTime(columnKey: string, status?: string) {
  const punchColumns = [
    "checkIn",
    "checkOut",
    "ent2",
    "sai2",
    "ent3",
    "sai3",
    "extras",
  ];

  if (isFinancialNeutralStatus(status)) {
    return [...punchColumns, "faltas"].includes(columnKey);
  }

  if (isFullDayAbsenceStatus(status)) {
    return punchColumns.includes(columnKey);
  }

  return false;
}

function compareText(a: string, b: string) {
  return a.localeCompare(b, "pt-BR", { sensitivity: "base", numeric: true });
}

function normalizeSearch(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function columnFilterMenuPositionFromTrigger(trigger: HTMLElement): ColumnFilterMenuPosition {
  const rect = trigger.getBoundingClientRect();
  const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const left = Math.min(
    Math.max(columnFilterMenuMargin, rect.left),
    Math.max(columnFilterMenuMargin, viewportWidth - columnFilterMenuWidth - columnFilterMenuMargin),
  );
  const hasRoomBelow = rect.bottom + columnFilterMenuEstimatedHeight + columnFilterMenuMargin <= viewportHeight;
  const top = hasRoomBelow
    ? rect.bottom + 8
    : Math.max(columnFilterMenuMargin, rect.top - columnFilterMenuEstimatedHeight - 8);
  const availableHeight = hasRoomBelow
    ? viewportHeight - top - columnFilterMenuMargin
    : rect.top - columnFilterMenuMargin - 8;

  return {
    left,
    top,
    listMaxHeight: Math.max(120, Math.min(220, availableHeight - 132)),
  };
}

function sortOptions<T extends { label: string }>(options: T[]) {
  return [...options].sort((a, b) => compareText(a.label || "", b.label || ""));
}

function parseLocalDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function dayReferenceText(date: string) {
  const label = parseLocalDate(date).toLocaleDateString("pt-BR", {
    weekday: "long",
  });
  return `${label.charAt(0).toUpperCase() + label.slice(1)} • ${formatDateForDisplay(date)}`;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toISODate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function dateRange(start: string, end: string) {
  if (!start || !end) return [] as string[];
  const startDate = parseLocalDate(start);
  const endDate = parseLocalDate(end);
  const dates: string[] = [];

  for (
    let current = startDate;
    current <= endDate;
    current = addDays(current, 1)
  ) {
    dates.push(toISODate(current));
  }

  return dates;
}

function safeSheetName(value: string) {
  return value.replace(/[\\/?*[\]:]/g, "-").slice(0, 31);
}

function isHoliday(date: string, settings: CalculationSettings) {
  return settings.holidays.some((holiday) => holiday.trim() === date);
}

function usefulMinutesForDate(date: string, settings: CalculationSettings) {
  return settings.usefulMinutesByWeekday[String(dateToWeekdayIndex(date))] ?? 0;
}

function overtimeRateForDate(date: string, settings: CalculationSettings) {
  const weekday = dateToWeekdayIndex(date);
  if (isHoliday(date, settings)) return settings.overtimeRates.holiday;
  if (weekday === 0) return settings.overtimeRates.sunday;
  if (weekday === 6) return settings.overtimeRates.saturday;
  return settings.overtimeRates.weekday;
}

function statusValueFromLabel(label: string) {
  const key = normalizeKey(label);
  if (key === "presente") return "present";
  if (key.includes("pendencia")) return "absence_pending";
  if (key.includes("confirmada")) return "absence_confirmed";
  if (key === "atestado") return "medical_certificate";
  if (key === "ferias") return "vacation";
  if (key === "folga") return "day_off";
  if (key === "afastado") return "leave";
  return key || `status_${Date.now().toString(36)}`;
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

function clampTimeToSchedule(
  value: string | undefined,
  schedule: WorkScheduleDay,
  fallback: string,
) {
  const minutes = timeToMinutes(value) ?? timeToMinutes(fallback);
  const start = timeToMinutes(schedule.start);
  const end = timeToMinutes(schedule.end);
  if (minutes == null || start == null || end == null) return fallback;
  return minutesToTime(Math.max(start, Math.min(end, minutes)));
}

function normalizeScheduleTimes(
  schedule: WorkScheduleDay | undefined,
  checkIn: string | undefined,
  checkOut: string | undefined,
  changedField?: "checkIn" | "checkOut",
) {
  if (!hasCompleteSchedule(schedule) || !schedule)
    return { checkIn: "", checkOut: "" };

  let nextCheckIn = clampTimeToSchedule(checkIn, schedule, schedule.start);
  const checkOutMinutes =
    timeToMinutes(checkOut) ?? timeToMinutes(schedule.end);
  const startMinutes = timeToMinutes(schedule.start);
  let nextCheckOut =
    checkOutMinutes != null && startMinutes != null
      ? minutesToTime(Math.max(startMinutes, checkOutMinutes))
      : schedule.end;
  const inMinutes = timeToMinutes(nextCheckIn);
  const outMinutes = timeToMinutes(nextCheckOut);

  if (inMinutes != null && outMinutes != null && outMinutes < inMinutes) {
    if (changedField === "checkIn") nextCheckOut = nextCheckIn;
    else if (changedField === "checkOut")
      nextCheckIn = clampTimeToSchedule(schedule.start, schedule, nextCheckOut);
    else nextCheckOut = nextCheckIn;
  }

  return { checkIn: nextCheckIn, checkOut: nextCheckOut };
}

function calculateTimeMetrics(
  employee: Employee,
  date: string,
  status: string,
  checkIn: string | undefined,
  checkOut: string | undefined,
  settings: CalculationSettings,
) {
  const schedule = scheduleForDate(employee, date);
  const scheduleEnd = timeToMinutes(schedule?.end);
  const outMinutes = timeToMinutes(checkOut);
  const overtimeMinutes =
    isWorkingStatus(status) && scheduleEnd != null && outMinutes != null
      ? Math.max(0, outMinutes - scheduleEnd)
      : 0;
  const overtimeHours = toFixed2(overtimeMinutes / 60);
  const hasWorkdayRule =
    isWorkingStatus(status) &&
    (hasCompleteSchedule(schedule) || overtimeHours > 0);
  const overtimePercent = hasWorkdayRule
    ? overtimeRateForDate(date, settings)
    : 0;
  const baseHourValue = Number(employee.salary || 0) / 220;
  const overtimeAmount = toFixed2(
    overtimeHours * baseHourValue * (1 + overtimePercent / 100),
  );
  const usefulHours =
    isWorkingStatus(status) && (hasCompleteSchedule(schedule) || !hasRegisteredSchedule(employee))
      ? toFixed2(normalLimitMinutesForEmployeeDate(employee, date, settings) / 60)
      : 0;

  return {
    usefulHours,
    baseHours: usefulHours,
    intervalHours: toFixed2(settings.intervalMinutes / 60),
    overtimeHours,
    overtimePercent,
    overtimeAmount,
  };
}

function calcUsefulHours(checkIn?: string, checkOut?: string) {
  if (!checkIn || !checkOut) return 0;
  const [inHour, inMinute] = checkIn.split(":").map(Number);
  const [outHour, outMinute] = checkOut.split(":").map(Number);
  if ([inHour, inMinute, outHour, outMinute].some((item) => Number.isNaN(item)))
    return 0;
  const minutes = outHour * 60 + outMinute - (inHour * 60 + inMinute);
  if (minutes <= 0) return 0;
  return toFixed2(minutes / 60);
}

function cloneCalculationSettings(
  settings: CalculationSettings,
): CalculationSettings {
  return mergeCalculationSettings(serializeCalculationSettings(settings));
}

function removeUndefinedFields<T extends Record<string, any>>(object: T): T {
  return Object.fromEntries(
    Object.entries(object || {}).map(([key, value]) => [
      key,
      value === undefined || value === null ? "" : value,
    ]),
  ) as T;
}

function sanitizeTimeRecord(record: TimeRecord): TimeRecord {
  return {
    ...record,
    customFields: removeUndefinedFields(record.customFields || {}),
  };
}

function comparableTimeRecord(record?: TimeRecord) {
  if (!record) return "";
  const customFields = Object.fromEntries(
    Object.entries(record.customFields || {}).sort(([left], [right]) => left.localeCompare(right)),
  );
  return JSON.stringify({
    companyId: record.companyId || "",
    employeeId: record.employeeId || "",
    date: record.date || "",
    status: record.status || "",
    source: record.source || "",
    functionName: record.functionName || "",
    realTeamId: record.realTeamId || "",
    dayTeamId: record.dayTeamId || "",
    usefulHours: Number(record.usefulHours || 0),
    baseHours: Number(record.baseHours || 0),
    intervalHours: Number(record.intervalHours || 0),
    overtimePercent: Number(record.overtimePercent || 0),
    overtimeHours: Number(record.overtimeHours || 0),
    overtimeAmount: Number(record.overtimeAmount || 0),
    cid: record.cid || "",
    checkIn: record.checkIn || "00:00",
    checkOut: record.checkOut || "00:00",
    absenceCount: Number(record.absenceCount || 0),
    notes: record.notes || "",
    customFields,
  });
}

function isCalculatedMetricKey(value: string): value is CalculatedMetricKey {
  return calculatedMetricKeys.includes(value as CalculatedMetricKey);
}

function readManualMetricOverrides(customFields?: Record<string, string>) {
  const parsed = parseJson<string[]>(
    customFields?.[manualMetricOverrideField],
    [],
  );
  return new Set(
    parsed.filter((key): key is CalculatedMetricKey =>
      isCalculatedMetricKey(key),
    ),
  );
}

function addManualMetricOverride(
  customFields: Record<string, string> | undefined,
  key: CalculatedMetricKey,
  value: string,
) {
  const nextFields = { ...(customFields || {}) };
  const manualFields = readManualMetricOverrides(nextFields);
  manualFields.add(key);

  return {
    ...nextFields,
    [key]: value || "00:00",
    [manualMetricOverrideField]: JSON.stringify(Array.from(manualFields)),
  };
}

function metricValue(
  customFields: Record<string, string>,
  manualFields: Set<CalculatedMetricKey>,
  key: CalculatedMetricKey,
  automaticValue: string,
) {
  return manualFields.has(key) ? customFields[key] || "00:00" : automaticValue;
}

function createDisplayRecord(
  employee: Employee,
  date: string,
  existing?: TimeRecord,
  settings: CalculationSettings = defaultCalculationSettings,
): TimeRecord {
  const normalLimitMinutes = normalLimitMinutesForEmployeeDate(employee, date, settings);
  const scheduleDefaults = scheduleDefaultsForDate(employee, date, settings);
  const noticeAdjustment = noticeWorkAdjustment(employee, date);
  const status =
    noticeAdjustment === "leave" && (!existing?.status || isFullDayAbsenceStatus(existing.status)) ? "day_off" :
    existing?.status ||
    (isHoliday(date, settings) || normalLimitMinutes <= 0
      ? "day_off"
      : "absence_pending");
  const checkIn = hasFilledTimeValue(existing?.checkIn)
    ? excelTimeToText(existing?.checkIn) || String(existing?.checkIn)
    : "00:00";
  // Jornada NÃO é mais preenchida automaticamente ao informar a ENT. 1
  // (usar a tecla "P" no campo ENT. 1 para preencher pela programação).
  const useDefaults = false;
  const existingCustomFields = (existing?.customFields || {}) as Record<
    string,
    string
  >;
  const customFields: Record<string, string> = {
    ...existingCustomFields,
    ent2: automaticScheduleTimeValue(
      existingCustomFields.ent2,
      scheduleDefaults.lunchReturn,
      settings.secullumLunchReturnTime || "13:01",
      useDefaults,
    ),
    sai2: isSai2ManuallyZeroed(existingCustomFields)
      ? "00:00"
      : automaticScheduleTimeValue(
        existingCustomFields.sai2,
        scheduleDefaults.end,
        settings.secullumEndTime || "17:00",
        useDefaults,
      ),
    normais: existingCustomFields.normais || "00:00",
    faltas: existingCustomFields.faltas || "00:00",
    extras: existingCustomFields.extras || "00:00",
    carga: existingCustomFields.carga || "00:00",
  };
  const checkOut = automaticScheduleTimeValue(
    existing?.checkOut,
    scheduleDefaults.lunchOut,
    settings.secullumLunchOutTime || "12:00",
    useDefaults,
  );
  const calculated = calculateSecullumMetrics(
    checkIn,
    checkOut,
    customFields as Record<string, string>,
    settings,
    date,
    employee,
  );
  const neutralStatus = isFinancialNeutralStatus(status);
  const fullDayAbsence = isFullDayAbsenceStatus(status);
  const fullDayAbsenceHours = minutesToSecullumTime(normalLimitMinutes);
  const manualMetricOverrides = readManualMetricOverrides(customFields);

  const finalNormais = metricValue(
    customFields,
    manualMetricOverrides,
    "normais",
    neutralStatus || fullDayAbsence ? "00:00" : calculated.normais,
  );
  const finalFaltas = metricValue(
    customFields,
    manualMetricOverrides,
    "faltas",
    fullDayAbsence
      ? fullDayAbsenceHours
      : neutralStatus
        ? "00:00"
        : calculated.faltas,
  );
  const finalExtras = metricValue(
    customFields,
    manualMetricOverrides,
    "extras",
    neutralStatus || fullDayAbsence ? "00:00" : calculated.extras,
  );
  const finalCarga = metricValue(
    customFields,
    manualMetricOverrides,
    "carga",
    fullDayAbsence
      ? fullDayAbsenceHours
      : neutralStatus
        ? "00:00"
        : calculated.carga,
  );

  const displayedUsefulHours = manualMetricOverrides.has("normais")
    ? secullumTimeToHours(finalNormais)
    : neutralStatus || fullDayAbsence
      ? 0
      : (noticeAdjustment !== "none" ? calculated.usefulHours : existing?.usefulHours ?? calculated.usefulHours);
  const displayedBaseHours = manualMetricOverrides.has("carga")
    ? secullumTimeToHours(finalCarga)
    : fullDayAbsence
      ? normalLimitMinutes / 60
      : neutralStatus
        ? 0
        : (noticeAdjustment !== "none" ? calculated.baseHours : existing?.baseHours ?? calculated.baseHours);
  const displayedOvertimeHours = manualMetricOverrides.has("extras")
    ? secullumTimeToHours(finalExtras)
    : neutralStatus || fullDayAbsence
      ? 0
      : (noticeAdjustment !== "none" ? calculated.overtimeHours : existing?.overtimeHours ?? calculated.overtimeHours);
  const displayedAbsenceCount = manualMetricOverrides.has("faltas")
    ? (secullumTimeToMinutes(finalFaltas) || 0) > 0
      ? 1
      : 0
    : fullDayAbsence && normalLimitMinutes > 0
      ? 1
      : neutralStatus
        ? 0
        : (noticeAdjustment !== "none" ? calculated.absenceCount : existing?.absenceCount ?? calculated.absenceCount);

  return {
    id: existing?.id || "",
    companyId: existing?.companyId || employee.companyId,
    companyName: existing?.companyName,
    employeeId: employee.id,
    employeeName: existing?.employeeName || employee.name,
    date,
    status,
    source: existing?.source || "manual",
    functionName: existing?.functionName || employee.role || employee.position || "",
    departmentId: existing?.departmentId || employee.departmentId,
    departmentName: existing?.departmentName,
    sectorId: existing?.sectorId || employee.sectorId,
    sectorName: existing?.sectorName,
    subsectorId: existing?.subsectorId || employee.subsectorId,
    subsectorName: existing?.subsectorName,
    realTeamId: existing?.realTeamId || employee.teamId || "",
    realTeamName: existing?.realTeamName,
    dayTeamId: existing?.dayTeamId ?? employee.teamId ?? "",
    dayTeamName: existing?.dayTeamName,
    usefulHours: displayedUsefulHours,
    baseHours: displayedBaseHours,
    intervalHours:
      existing?.intervalHours || toFixed2(settings.intervalMinutes / 60),
    overtimePercent:
      neutralStatus || fullDayAbsence
        ? 0
        : existing?.overtimePercent || overtimeRateForDate(date, settings),
    overtimeHours: displayedOvertimeHours,
    overtimeAmount:
      neutralStatus || fullDayAbsence ? 0 : existing?.overtimeAmount || 0,
    cid: status === "medical_certificate" ? (existing?.cid ?? "") : "",
    checkIn: checkIn || "00:00",
    checkOut: checkOut || "00:00",
    absenceCount: displayedAbsenceCount,
    notes: existing?.notes ?? "",
    customFields: removeUndefinedFields({
      ...customFields,
      ent2: customFields.ent2 || "00:00",
      sai2: customFields.sai2 || "00:00",
      ent3: customFields.ent3 || "00:00",
      sai3: customFields.sai3 || "00:00",
      normais: finalNormais,
      faltas: finalFaltas,
      extras: finalExtras,
      carga: finalCarga,
      statusLabel:
        neutralStatus || fullDayAbsence ? statusDisplayText(status) : "",
    }),
    updatedAt: existing?.updatedAt || new Date().toISOString(),
  };
}

type SecullumBatchDiff = {
  field: "entrada1" | "saida1" | "entrada2" | "saida2";
  label: string;
  from: string;
  to: string;
};
type SecullumBatchItem = {
  employee: Employee;
  patch: Partial<TimeRecord>;
  diffs: SecullumBatchDiff[];
  selected: boolean;
};

export default function Timekeeping() {
  const {
    data,
    canCreateTimekeeping,
    canEditTimekeeping,
    canDeleteTimekeeping,
    filters,
    setFilters,
    filteredEmployees: employees,
    employeeOptions,
    cpfOptions,
  } = useTimekeepingContext();
  const { user } = useAuth();

  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;
  const [sortConfig, setSortConfig] = useState<SortConfig>(null);
  const [columnFilters, setColumnFilters] = useState<ColumnFilterMap>({});
  const [openColumnFilter, setOpenColumnFilter] = useState<string | null>(null);
  const [columnFilterMenuPosition, setColumnFilterMenuPosition] =
    useState<ColumnFilterMenuPosition | null>(null);
  const columnFilterMenuRef = useRef<HTMLDivElement | null>(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const [reportFormat, setReportFormat] = useState<ReportFormat>("excel");
  const [reportColumnKeys, setReportColumnKeys] = useState<string[] | null>(null);
  const [reportStartDate, setReportStartDate] = useState(
    filters.date || todayISO(),
  );
  const [reportEndDate, setReportEndDate] = useState(
    filters.date || todayISO(),
  );
  const [columnModalOpen, setColumnModalOpen] = useState(false);
  const [columnForm, setColumnForm] = useState<ColumnForm>(emptyColumnForm);
  const [calculationPanelOpen, setCalculationPanelOpen] = useState(false);
  const [calculationTab, setCalculationTab] =
    useState<CalculationPanelTab>("rules");
  const [calculationForm, setCalculationForm] = useState<CalculationSettings>(
    defaultCalculationSettings,
  );
  const [statusForm, setStatusForm] = useState<StatusConditionForm>(
    emptyStatusConditionForm,
  );
  const [statusModalOpen, setStatusModalOpen] = useState(false);
  const [openColumnMenu, setOpenColumnMenu] = useState<string | null>(null);
  const [columnOrder, setColumnOrder] = useState<string[]>(readStoredColumnOrder);
  const [draggedColumnKey, setDraggedColumnKey] = useState<string | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog | null>(
    null,
  );
  const [busy, setBusy] = useState(false);
  const [tableLocked, setTableLocked] = useState(true);
  const [draftRecordsByEmployeeId, setDraftRecordsByEmployeeId] = useState<Record<string, TimeRecord>>({});
  const [savedDayTables, setSavedDayTables] = useState<TimekeepingDayTable[]>([]);
  const [otherEditors, setOtherEditors] = useState<TimekeepingPresence[]>([]);
  const [secullumModalOpen, setSecullumModalOpen] = useState(false);
  const [secullumRows, setSecullumRows] = useState<SecullumImportRow[]>([]);
  const [secullumFileName, setSecullumFileName] = useState("");
  const [secullumImportError, setSecullumImportError] = useState("");
  const [pendingManualMetricEdit, setPendingManualMetricEdit] =
    useState<PendingManualMetricEdit | null>(null);
  const [manualWarningAcceptedDates, setManualWarningAcceptedDates] = useState<
    Record<string, boolean>
  >(() => {
    if (typeof window === "undefined") return {};
    return parseJson<Record<string, boolean>>(
      window.sessionStorage.getItem(manualWarningStorageKey) || undefined,
      {},
    );
  });

  const [teamScheduleModalOpen, setTeamScheduleModalOpen] = useState(false);
  const [expandedTeamScheduleIds, setExpandedTeamScheduleIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [excludedTeamScheduleEmployeeIds, setExcludedTeamScheduleEmployeeIds] = useState<
    Set<string>
  >(() => new Set());
  const [applyingTeamSchedule, setApplyingTeamSchedule] = useState(false);
  const [secullumStatus, setSecullumStatus] = useState<
    "idle" | "loading" | "ok" | "error"
  >("idle");
  const [secullumByCpf, setSecullumByCpf] = useState<Map<string, SecullumDayRow>>(
    () => new Map(),
  );
  const [secullumError, setSecullumError] = useState("");
  const [secullumLastSync, setSecullumLastSync] = useState("");
  const [secullumSendConfirm, setSecullumSendConfirm] = useState<{
    employee: Employee;
    field: "entrada1" | "saida1" | "entrada2" | "saida2";
    coluna: string;
    hora: string;
    macroValue: string;
    secValue: string;
  } | null>(null);
  const [secullumSendBusy, setSecullumSendBusy] = useState(false);
  const [secullumSendError, setSecullumSendError] = useState("");
  const secullumSeqRef = useRef(0);
  const [secullumOriginFilter, setSecullumOriginFilter] =
    useState<SecullumOriginCode | null>(null);
  // Lote da tecla "T": funcionários com diferença real entre Secullum e Firebase.
  const [secullumBatch, setSecullumBatch] = useState<SecullumBatchItem[] | null>(
    null,
  );
  // Data digitada no input (aplicada ao filtro com debounce para evitar
  // re-renderizar a tabela inteira a cada tecla).
  const [pendingDate, setPendingDate] = useState(filters.date);
  const [teamScheduleEdits, setTeamScheduleEdits] = useState<
    Record<string, TeamSchedulePunches>
  >({});
  const [noBreakTeamScheduleEmployeeIds, setNoBreakTeamScheduleEmployeeIds] =
    useState<Set<string>>(() => new Set());

  const employeesForDaySave = useMemo(
    () =>
      employees.filter((employee) => {
        if (employeeEffectiveStatusForDate(employee, filters.date) !== "terminated")
          return true;
        return data.timeRecords.some(
          (record) =>
            record.employeeId === employee.id && record.date === filters.date,
        );
      }),
    [employees, data.timeRecords, filters.date],
  );

  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  useEffect(() => {
    if (!openColumnFilter) return undefined;

    function closeColumnFilterOnOutsidePointer(event: PointerEvent) {
      const menu = columnFilterMenuRef.current;
      if (menu && event.target instanceof Node && menu.contains(event.target)) return;
      setOpenColumnFilter(null);
      setColumnFilterMenuPosition(null);
    }

    document.addEventListener("pointerdown", closeColumnFilterOnOutsidePointer);
    return () => {
      document.removeEventListener("pointerdown", closeColumnFilterOnOutsidePointer);
    };
  }, [openColumnFilter]);

  useEffect(() => {
    setTableLocked(true);
    setPendingManualMetricEdit(null);
    setDraftRecordsByEmployeeId({});
  }, [filters.date]);

  useEffect(() => {
    let active = true;
    void loadTimekeepingDayTables()
      .then((tables) => {
        if (active) setSavedDayTables(tables);
      })
      .catch((error) => console.warn("Não foi possível carregar os dias de ponto salvos.", error));
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!user?.id || !filters.date || tableLocked) {
      setOtherEditors([]);
      if (user?.id && filters.date) void clearTimekeepingPresence(filters.date, user.id);
      return undefined;
    }

    let active = true;
    const publish = () => publishTimekeepingPresence(filters.date, user).catch((error) => {
      console.warn("Não foi possível atualizar a presença na tabela de ponto.", error);
    });
    void publish();
    const unsubscribe = subscribeTimekeepingPresence(
      filters.date,
      (presence) => {
        if (!active) return;
        setOtherEditors(presence.filter((entry) => entry.userId !== user.id));
      },
      (error) => console.warn("Não foi possível acompanhar os editores do ponto.", error),
    );
    const refreshPresence = () => {
      if (document.visibilityState === "visible") {
        void publish();
      } else {
        void clearTimekeepingPresence(filters.date, user.id);
      }
      setOtherEditors((current) => current.filter((entry) => Date.parse(entry.expiresAt) > Date.now()));
    };
    const clearCurrentPresence = () => {
      void clearTimekeepingPresence(filters.date, user.id);
    };
    const heartbeat = window.setInterval(refreshPresence, 60_000);
    document.addEventListener("visibilitychange", refreshPresence);
    window.addEventListener("pagehide", clearCurrentPresence);

    return () => {
      active = false;
      window.clearInterval(heartbeat);
      document.removeEventListener("visibilitychange", refreshPresence);
      window.removeEventListener("pagehide", clearCurrentPresence);
      unsubscribe();
      void clearTimekeepingPresence(filters.date, user.id);
    };
  }, [filters.date, tableLocked, user?.id, user?.name, user?.username]);

  useEffect(() => {
    setCurrentPage(1);
  }, [columnFilters]);

  const hasActiveFilters = Boolean(
    filters.companyIds.length ||
    filters.departmentIds.length ||
    filters.sectorIds.length ||
    filters.realTeamIds.length ||
    filters.dayTeamIds.length ||
    filters.employeeIds.length ||
    filters.cpfValues.length ||
    filters.statuses.length ||
    filters.terminationModes?.length ||
    filters.search ||
    filters.date !== todayISO(),
  );

  const settingsColumn = useMemo(() => {
    const companyId = filters.companyIds[0] || "";
    return (
      data.timekeepingColumns.find(
        (column) =>
          column.key === settingsColumnKey && column.companyId === companyId,
      ) ||
      data.timekeepingColumns.find(
        (column) => column.key === settingsColumnKey && !column.companyId,
      )
    );
  }, [data.timekeepingColumns, filters.companyIds]);

  const calculationSettings = useMemo(
    () => mergeCalculationSettings(settingsColumn?.formula),
    [settingsColumn],
  );
  const companyById = useMemo(
    () => new Map(data.companies.map((company) => [company.id, company])),
    [data.companies],
  );
  // Estrutura (departamentos/setores/equipes) deduplicada por grupo de empresas,
  // para os filtros não repetirem o mesmo nome uma vez por empresa do grupo.
  const primaryStructureGroup = useMemo(
    () => primaryCompanyGroup(data.companyGroups, data.companyGroupCompanies),
    [data.companyGroups, data.companyGroupCompanies],
  );
  const structureGroupsForFilters = useMemo(() => {
    if (!filters.companyIds.length)
      return primaryStructureGroup ? [primaryStructureGroup] : [];
    const byId = new Map<string, CompanyGroup>();
    filters.companyIds.forEach((companyId) => {
      const group =
        resolveCompanyGroupForCompany(
          companyId,
          data.companyGroups,
          data.companyGroupCompanies,
        ) || primaryStructureGroup;
      if (group) byId.set(group.id, group);
    });
    return Array.from(byId.values());
  }, [
    data.companyGroupCompanies,
    data.companyGroups,
    filters.companyIds,
    primaryStructureGroup,
  ]);
  const structureDepartments = useMemo(
    () =>
      dedupeStructureItems(
        structureGroupsForFilters.flatMap((group) =>
          structureItemsForGroup(
            data.departments,
            group,
            data.companyGroupCompanies,
            data.companies,
          ),
        ),
      ),
    [
      data.companies,
      data.companyGroupCompanies,
      data.departments,
      structureGroupsForFilters,
    ],
  );
  const structureSectors = useMemo(
    () =>
      dedupeStructureItems(
        structureGroupsForFilters.flatMap((group) =>
          structureItemsForGroup(
            data.sectors,
            group,
            data.companyGroupCompanies,
            data.companies,
          ),
        ),
      ),
    [
      data.companies,
      data.companyGroupCompanies,
      data.sectors,
      structureGroupsForFilters,
    ],
  );
  const structureTeams = useMemo(
    () =>
      dedupeStructureItems(
        structureGroupsForFilters.flatMap((group) =>
          structureItemsForGroup(
            data.teams,
            group,
            data.companyGroupCompanies,
            data.companies,
          ),
        ),
      ),
    [
      data.companies,
      data.companyGroupCompanies,
      data.teams,
      structureGroupsForFilters,
    ],
  );
  const departmentById = useMemo(
    () => new Map(data.departments.map((department) => [department.id, department])),
    [data.departments],
  );
  const sectorById = useMemo(
    () => new Map(data.sectors.map((sector) => [sector.id, sector])),
    [data.sectors],
  );
  const subsectorById = useMemo(
    () => new Map(data.subsectors.map((subsector) => [subsector.id, subsector])),
    [data.subsectors],
  );
  const teamById = useMemo(
    () => new Map(data.teams.map((team) => [team.id, team])),
    [data.teams],
  );
  const employeeById = useMemo(
    () => new Map(data.employees.map((employee) => [employee.id, employee])),
    [data.employees],
  );

  const teamScheduleGroups = useMemo<TeamScheduleGroup[]>(() => {
    const selected = filters.realTeamIds.filter(Boolean);
    if (!selected.length) return [];

    const membersByTeam = new Map<string, Employee[]>();
    employees.forEach((employee) => {
      const teamId = employee.teamId || "";
      if (!teamId || !selected.includes(teamId)) return;
      const list = membersByTeam.get(teamId) || [];
      list.push(employee);
      membersByTeam.set(teamId, list);
    });

    return selected
      .map((teamId) => {
        const members = membersByTeam.get(teamId) || [];
        const teamName = teamById.get(teamId)?.name || "-";
        const lead = findTeamLead(teamId, teamName, members, data.employees);
        const schedule = lead ? scheduleForDate(lead, filters.date) : undefined;
        const punches = scheduleToTeamPunches(schedule);
        const collaborators = members.filter(
          (employee) => !lead || employee.id !== lead.id,
        );
        const targets = lead ? [lead, ...collaborators] : collaborators;
        return {
          teamId,
          teamName,
          lead,
          punches,
          applicable: teamPunchesHaveAny(punches),
          collaborators,
          targets,
        };
      })
      .filter((group) => group.lead || group.collaborators.length);
  }, [employees, data.employees, filters.realTeamIds, filters.date, teamById]);

  const teamScheduleSelectedCount = useMemo(
    () =>
      teamScheduleGroups.reduce((total, group) => {
        const edit = teamScheduleEdits[group.teamId];
        const punches: TeamSchedulePunches = {
          ent1: (edit?.ent1 || "").trim() || group.punches.ent1,
          sai1: (edit?.sai1 || "").trim() || group.punches.sai1,
          ent2: (edit?.ent2 || "").trim() || group.punches.ent2,
          sai2: (edit?.sai2 || "").trim() || group.punches.sai2,
        };
        if (!teamPunchesHaveAny(punches)) return total;
        return (
          total +
          group.targets.filter(
            (employee) => !excludedTeamScheduleEmployeeIds.has(employee.id),
          ).length
        );
      }, 0),
    [teamScheduleGroups, teamScheduleEdits, excludedTeamScheduleEmployeeIds],
  );

  function openTeamScheduleModal() {
    setExcludedTeamScheduleEmployeeIds(new Set());
    setNoBreakTeamScheduleEmployeeIds(new Set());
    setTeamScheduleEdits({});
    setExpandedTeamScheduleIds(new Set(teamScheduleGroups.map((group) => group.teamId)));
    setTeamScheduleModalOpen(true);
  }

  function toggleTeamScheduleExpanded(teamId: string) {
    setExpandedTeamScheduleIds((current) => {
      const next = new Set(current);
      if (next.has(teamId)) next.delete(teamId);
      else next.add(teamId);
      return next;
    });
  }

  function toggleTeamScheduleEmployee(employeeId: string) {
    setExcludedTeamScheduleEmployeeIds((current) => {
      const next = new Set(current);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  }

  function toggleTeamScheduleNoBreak(employeeId: string) {
    setNoBreakTeamScheduleEmployeeIds((current) => {
      const next = new Set(current);
      if (next.has(employeeId)) next.delete(employeeId);
      else next.add(employeeId);
      return next;
    });
  }

  function updateTeamScheduleEdit(
    teamId: string,
    field: keyof TeamSchedulePunches,
    value: string,
  ) {
    setTeamScheduleEdits((current) => {
      const base = current[teamId] || { ent1: "", sai1: "", ent2: "", sai2: "" };
      return { ...current, [teamId]: { ...base, [field]: value } };
    });
  }

  function effectiveTeamPunches(group: TeamScheduleGroup): TeamSchedulePunches {
    const edit = teamScheduleEdits[group.teamId];
    const pick = (field: keyof TeamSchedulePunches) =>
      (edit?.[field] || "").trim() || group.punches[field] || "";
    return {
      ent1: pick("ent1"),
      sai1: pick("sai1"),
      ent2: pick("ent2"),
      sai2: pick("sai2"),
    };
  }

  function teamScheduleCollaboratorState(
    employee: Employee,
    punches: TeamSchedulePunches,
  ) {
    const record = employeeRecord(employee.id);
    const current = {
      ent1: normalizeTeamPunch(record?.checkIn),
      sai1: normalizeTeamPunch(record?.checkOut),
      ent2: normalizeTeamPunch(record?.customFields?.ent2),
      sai2: normalizeTeamPunch(record?.customFields?.sai2),
    };
    const hasRecord = [current.ent1, current.sai1, current.ent2, current.sai2].some(
      Boolean,
    );
    const target = {
      ent1: normalizeTeamPunch(punches.ent1),
      sai1: normalizeTeamPunch(punches.sai1),
      ent2: normalizeTeamPunch(punches.ent2),
      sai2: normalizeTeamPunch(punches.sai2),
    };
    const differs =
      hasRecord &&
      (current.ent1 !== target.ent1 ||
        current.sai1 !== target.sai1 ||
        current.ent2 !== target.ent2 ||
        current.sai2 !== target.sai2);
    return { hasRecord, differs, current };
  }

  async function applyTeamSchedule() {
    if (applyingTeamSchedule) return;
    setApplyingTeamSchedule(true);
    try {
      const built: TimeRecord[] = [];
      teamScheduleGroups.forEach((group) => {
        const punches = effectiveTeamPunches(group);
        if (!teamPunchesHaveAny(punches)) return;
        group.targets.forEach((employee) => {
          if (excludedTeamScheduleEmployeeIds.has(employee.id)) return;
          const didBreak = !noBreakTeamScheduleEmployeeIds.has(employee.id);
          const existing = employeeRecord(employee.id);
          const patch: Partial<TimeRecord> = {
            source: "manual",
            status: "present",
            checkIn: punches.ent1 || "00:00",
            checkOut: didBreak ? punches.sai1 || "00:00" : "00:00",
            customFields: {
              ent2: didBreak ? punches.ent2 || "00:00" : "00:00",
              sai2: punches.sai2 || "00:00",
            },
          };
          const record = sanitizeTimeRecord({
            ...makeRecord(employee, patch),
            id: existing?.id || timeRecordDocumentId(filters.date, employee.id),
            updatedAt: new Date().toISOString(),
          });
          built.push(record);
        });
      });

      if (!built.length) {
        setTeamScheduleModalOpen(false);
        return;
      }

      setDraftRecordsByEmployeeId((current) => {
        const next = { ...current };
        built.forEach((record) => {
          next[record.employeeId] = record;
        });
        return next;
      });

      setTeamScheduleModalOpen(false);
    } catch (error) {
      console.error("Não foi possível aplicar os horários da equipe.", error);
      window.alert(
        "Não foi possível aplicar os horários da equipe. Tente novamente.",
      );
    } finally {
      setApplyingTeamSchedule(false);
    }
  }

  const companyGroupNameByCompanyId = useMemo(() => {
    const groupById = new Map(data.companyGroups.map((group) => [group.id, group]));
    const map = new Map<string, string>();

    data.companyGroupCompanies.forEach((relation) => {
      const group = groupById.get(relation.groupId);
      if (!group || group.active === false || map.has(relation.companyId)) return;
      map.set(relation.companyId, group.name);
    });

    return map;
  }, [data.companyGroupCompanies, data.companyGroups]);
  const timeRecordByEmployeeDate = useMemo(() => {
    const map = new Map<string, TimeRecord>();
    data.timeRecords.forEach((record) => {
      const key = `${record.employeeId}:${record.date}`;
      map.set(key, pickPreferredTimeRecord(map.get(key), record));
    });
    return map;
  }, [data.timeRecords]);
  const cidOptions = useMemo(
    () =>
      buildCidOptions([
        ...data.timeRecords.map((record) => record.cid || ""),
        ...Object.values(draftRecordsByEmployeeId).map((record) => record.cid || ""),
      ]),
    [data.timeRecords, draftRecordsByEmployeeId],
  );

  useEffect(() => {
    setCalculationForm(cloneCalculationSettings(calculationSettings));
  }, [calculationSettings]);

  const customColumns = useMemo(() => {
    const companyFilter = filters.companyIds[0];
    return data.timekeepingColumns
      .filter(
        (column) =>
          column.key !== settingsColumnKey &&
          column.active !== false &&
          (!column.companyId ||
            !companyFilter ||
            column.companyId === companyFilter),
      )
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [data.timekeepingColumns, filters.companyIds]);

  const unorderedColumns = useMemo<ColumnDescriptor[]>(() => {
    const seenKeys = new Set<string>();
    return [...baseColumns, ...customColumns].filter((column) => {
      if (seenKeys.has(column.key)) return false;
      seenKeys.add(column.key);
      return true;
    });
  }, [customColumns]);
  const columns = useMemo<ColumnDescriptor[]>(
    () => applyColumnOrder(unorderedColumns, columnOrder),
    [columnOrder, unorderedColumns],
  );
  const reportColumnOptions = useMemo(
    () => columns.map((column) => ({ key: column.key, label: column.label })),
    [columns],
  );

  const teamFilterOptions = useMemo(() => {
    const visibleTeams = structureTeams;
    const companyById = new Map(
      data.companies.map((company) => [company.id, company.name] as const),
    );
    const memberCountByTeam = new Map<string, number>();
    data.employees.forEach((employee) => {
      if (!employee.teamId) return;
      memberCountByTeam.set(
        employee.teamId,
        (memberCountByTeam.get(employee.teamId) || 0) + 1,
      );
    });
    const nameCount = new Map<string, number>();
    visibleTeams.forEach((team) => {
      const key = normalizeKey(team.name);
      nameCount.set(key, (nameCount.get(key) || 0) + 1);
    });
    let options = visibleTeams.map((team) => {
      const duplicated = (nameCount.get(normalizeKey(team.name)) || 0) > 1;
      const company = companyById.get(team.companyId) || "";
      const count = memberCountByTeam.get(team.id) || 0;
      const label = duplicated
        ? `${team.name}${company ? ` — ${company}` : ""} (${count})`
        : `${team.name} (${count})`;
      return { value: team.id, label };
    });
    const labelCount = new Map<string, number>();
    options.forEach((option) =>
      labelCount.set(option.label, (labelCount.get(option.label) || 0) + 1),
    );
    options = options.map((option) =>
      (labelCount.get(option.label) || 0) > 1
        ? { ...option, label: `${option.label} · ${option.value.slice(0, 4)}` }
        : option,
    );
    return options;
  }, [data.companies, data.employees, structureTeams]);
  const selectedReportColumnKeys = useMemo(
    () => sanitizeColumnSelection(
      reportColumnKeys,
      reportColumnOptions.map((column) => column.key),
    ),
    [reportColumnKeys, reportColumnOptions],
  );

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(columnOrderStorageKey, JSON.stringify(columnOrder));
  }, [columnOrder]);

  useEffect(() => {
    if (!reportModalOpen) return;
    setReportColumnKeys((current) =>
      sanitizeColumnSelection(current, reportColumnOptions.map((column) => column.key)),
    );
  }, [reportModalOpen, reportColumnOptions]);

  const columnByKey = useMemo(
    () => new Map(columns.map((column) => [column.key, column])),
    [columns],
  );

  // Substitui campos zerados da Macro Ambiental pelo valor do Secullum (somente com
  // a tabela desbloqueada). Reflete tanto na exibição quanto no "Salvar dia do mês".
  function substituteEmptyFromSecullum(
    employee: Employee,
    base?: TimeRecord,
  ): TimeRecord | undefined {
    // Substitui campos zerados pelo valor do Secullum SOMENTE em modo visualização
    // (tabela bloqueada). Ao liberar para editar, o usuário tem prioridade total e
    // a digitação é instantânea (sem a substituição rodando a cada tecla).
    if (!tableLocked) return base;
    if (secullumByCpf.size === 0) return base;
    const cpf = (employee.cpf || "").replace(/\D/g, "");
    const sec = cpf ? secullumByCpf.get(cpf) : undefined;
    if (!sec) return base;
    const cf = { ...((base?.customFields || {}) as Record<string, string>) };
    const next = { ...(base || {}) } as TimeRecord;
    let changed = false;
    if (!hasFilledTimeValue(base?.checkIn) && hasFilledTimeValue(sec.entrada1)) {
      next.checkIn = sec.entrada1;
      changed = true;
    }
    if (!hasFilledTimeValue(base?.checkOut) && hasFilledTimeValue(sec.saida1)) {
      next.checkOut = sec.saida1;
      changed = true;
    }
    if (!hasFilledTimeValue(cf.ent2) && hasFilledTimeValue(sec.entrada2)) {
      cf.ent2 = sec.entrada2;
      changed = true;
    }
    if (
      !isSai2ManuallyZeroed(cf) &&
      !hasFilledTimeValue(cf.sai2) &&
      hasFilledTimeValue(sec.saida2)
    ) {
      cf.sai2 = sec.saida2;
      changed = true;
    }
    if (!changed) return base;
    next.customFields = cf;
    return next;
  }

  const displayRecordByEmployeeId = useMemo(() => {
    const map = new Map<string, TimeRecord>();
    employees.forEach((employee) => {
      const existing =
        draftRecordsByEmployeeId[employee.id] ||
        timeRecordByEmployeeDate.get(`${employee.id}:${filters.date}`);
      const withSec = substituteEmptyFromSecullum(employee, existing);
      map.set(
        employee.id,
        createDisplayRecord(employee, filters.date, withSec, calculationSettings),
      );
    });
    return map;
  }, [
    calculationSettings,
    draftRecordsByEmployeeId,
    employees,
    filters.date,
    timeRecordByEmployeeDate,
    secullumByCpf,
    tableLocked,
  ]);

  const wholeDaySavePlan = useMemo(() => {
    const hasLocalDraftUpdates = Boolean(Object.keys(draftRecordsByEmployeeId).length);
    const companyFilter = new Set(filters.companyIds);
    const finalRecords = employeesForDaySave.map((employee) => {
      const current =
        draftRecordsByEmployeeId[employee.id] ||
        timeRecordByEmployeeDate.get(`${employee.id}:${filters.date}`);
      const currentWithSec = substituteEmptyFromSecullum(employee, current);
      return sanitizeTimeRecord({
        ...createDisplayRecord(employee, filters.date, currentWithSec, calculationSettings),
        id: timeRecordDocumentId(filters.date, employee.id),
        updatedAt: current?.updatedAt || "",
      });
    });
    const legacyRecordIds = new Set(cachedLegacyTimeRecordIds(filters.date));
    const recordsToWrite = finalRecords.filter((record) => {
      const stored = timeRecordByEmployeeDate.get(`${record.employeeId}:${record.date}`);
      return Boolean(
        !stored ||
        stored.id !== record.id ||
        legacyRecordIds.has(stored.id) ||
        comparableTimeRecord(stored) !== comparableTimeRecord(record)
      );
    });

    const calculatedObsoleteRecordIds = new Set([
      ...cachedDuplicateTimeRecordIds(filters.date),
      ...legacyRecordIds,
    ]);
    finalRecords.forEach((record) => {
      const stored = timeRecordByEmployeeDate.get(`${record.employeeId}:${record.date}`);
      if (stored?.id && stored.id !== record.id) calculatedObsoleteRecordIds.add(stored.id);
    });

    const previousTable = savedDayTables.find((table) => (
      table.date === filters.date &&
      (!companyFilter.size || table.companyIds.some((companyId) => companyFilter.has(companyId)))
    ));
    const hasStoredRecordsForDate = data.timeRecords.some((record) => (
      record.date === filters.date &&
      (!companyFilter.size || companyFilter.has(record.companyId))
    ));
    const isListedAsSaved = Boolean(previousTable || hasStoredRecordsForDate);
    const shouldSave = !isListedAsSaved || hasLocalDraftUpdates;
    const recordsToSave = shouldSave ? recordsToWrite : [];
    const obsoleteRecordIds = shouldSave ? calculatedObsoleteRecordIds : new Set<string>();
    const hasUpdates = Boolean(recordsToSave.length || obsoleteRecordIds.size || !isListedAsSaved);

    return {
      finalRecords,
      recordsToWrite: recordsToSave,
      obsoleteRecordIds,
      previousTable,
      hasUpdates,
      isSavedWithoutUpdates: Boolean(isListedAsSaved && !hasLocalDraftUpdates),
    };
  }, [
    calculationSettings,
    data.timeRecords,
    draftRecordsByEmployeeId,
    employeesForDaySave,
    filters.companyIds,
    filters.date,
    savedDayTables,
    timeRecordByEmployeeDate,
    secullumByCpf,
    tableLocked,
  ]);

  const tableFilteredEmployees = useMemo(
    () => filterEmployeesByTableColumns(employees, filters.date),
    [
      employees,
      filters.date,
      columnFilters,
      columnByKey,
      displayRecordByEmployeeId,
      calculationSettings,
    ],
  );
  const sortedEmployees = useMemo(
    () => sortEmployeesForDate(tableFilteredEmployees, filters.date),
    [
      tableFilteredEmployees,
      filters.date,
      sortConfig,
      columnByKey,
      displayRecordByEmployeeId,
    ],
  );
  const hasActiveColumnFilters = Object.values(columnFilters).some((filter) =>
    Boolean(filter.search.trim() || filter.selected.length),
  );

  // Origem(ns) da pessoa — MODELO MULTI-ORIGEM (uma pessoa pode cair em vários
  // cards). Regras:
  // 1) Todos os presentes contam em "Macro/API" (tudo que existe na base
  //    Macro/Firebase). Só CLT também têm origem no Secullum.
  // 2) Cada campo com batida no Secullum adiciona sua origem (celular/computador/
  //    manual/automatico). Se o valor coincide com o do Firebase, conta como api.
  // 3) A soma dos cards pode ultrapassar 100%; o TOTAL = nº de pessoas presentes.
  function personSecullumOriginCodes(employee: Employee): Set<SecullumOriginCode> {
    const base =
      draftRecordsByEmployeeId[employee.id] ||
      timeRecordByEmployeeDate.get(`${employee.id}:${filters.date}`);
    const cf = (base?.customFields || {}) as Record<string, string>;
    const fields = ["entrada1", "saida1", "entrada2", "saida2"] as const;
    const macroByField: Record<(typeof fields)[number], string> = {
      entrada1: String(base?.checkIn ?? ""),
      saida1: String(base?.checkOut ?? ""),
      entrada2: String(cf.ent2 ?? ""),
      saida2: String(cf.sai2 ?? ""),
    };
    const hasMacroPunch = fields.some((field) =>
      hasFilledTimeValue(macroByField[field]),
    );
    // Status efetivo: quem está em falta/pendência (ou registro zerado) NÃO
    // deve contar como "automático" (pré-assinalado do Secullum de ausente).
    const effectiveStatus =
      displayRecordByEmployeeId.get(employee.id)?.status ||
      base?.status ||
      "";
    const isAbsent = isAbsenceStatus(effectiveStatus);

    const codes = new Set<SecullumOriginCode>();
    const cpf = (employee.cpf || "").replace(/\D/g, "");
    const row = cpf ? secullumByCpf.get(cpf) : undefined;

    if (row) {
      for (const field of fields) {
        const value = String(row[field] ?? "").trim();
        if (!value || value === "00:00") continue;
        const code = (row.origem?.[field] as SecullumOriginCode) || "";
        const macroValue = String(macroByField[field] ?? "").trim();
        const inFirebase =
          hasFilledTimeValue(macroValue) && macroValue === value;
        if (code === "celular" || code === "computador") {
          codes.add(code);
        } else if (inFirebase || code === "api") {
          codes.add("api");
        } else if (code === "manual") {
          codes.add("manual");
        } else if (!isAbsent) {
          // Pré-assinalado só conta como automático se a pessoa NÃO está ausente.
          codes.add("automatico");
        }
      }
    }

    // Macro/API: qualquer batida real na base Macro/Firebase.
    if (hasMacroPunch) codes.add("api");
    return codes;
  }

  const secullumOriginStats = useMemo(() => {
    const counts: Record<SecullumOriginCode, number> = {
      celular: 0,
      computador: 0,
      manual: 0,
      automatico: 0,
      api: 0,
      secullum: 0,
    };
    let total = 0;
    sortedEmployees.forEach((employee) => {
      const codes = personSecullumOriginCodes(employee);
      if (codes.size === 0) return;
      total += 1;
      codes.forEach((code) => {
        counts[code] += 1;
      });
    });
    return { counts, total };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedEmployees, secullumByCpf, draftRecordsByEmployeeId]);

  const originFilteredEmployees = useMemo(() => {
    if (!secullumOriginFilter) return sortedEmployees;
    return sortedEmployees.filter((employee) =>
      personSecullumOriginCodes(employee).has(secullumOriginFilter),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sortedEmployees, secullumOriginFilter, secullumByCpf, draftRecordsByEmployeeId]);


  const totalPages = Math.max(1, Math.ceil(originFilteredEmployees.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedEmployees = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * pageSize;
    return originFilteredEmployees.slice(startIndex, startIndex + pageSize);
  }, [originFilteredEmployees, pageSize, safeCurrentPage]);
  const pageStart = originFilteredEmployees.length
    ? (safeCurrentPage - 1) * pageSize + 1
    : 0;
  const pageEnd = Math.min(safeCurrentPage * pageSize, originFilteredEmployees.length);

  const savedTimeFolders = useMemo<SavedYearFolder[]>(() => {
    const dayMap = new Map<string, SavedDayFolder>();
    const companyFilter = new Set(filters.companyIds);

    savedDayTables
      .filter((table) => !companyFilter.size || table.companyIds.some((companyId) => companyFilter.has(companyId)))
      .forEach((table) => {
        dayMap.set(table.date, { date: table.date });
      });

    // Compatibilidade com registros antigos ainda sem o manifesto diário.
    const hasCurrentDayRecords = data.timeRecords.some((record) => (
      record.date === filters.date
      && (!companyFilter.size || companyFilter.has(record.companyId))
    ));
    if (hasCurrentDayRecords && !dayMap.has(filters.date)) {
      dayMap.set(filters.date, { date: filters.date });
    }

    const yearMap = new Map<string, Map<string, SavedDayFolder[]>>();
    Array.from(dayMap.values())
      .sort((a, b) => b.date.localeCompare(a.date))
      .forEach((day) => {
        const year = day.date.slice(0, 4);
        const month = day.date.slice(0, 7);
        const monthMap = yearMap.get(year) || new Map<string, SavedDayFolder[]>();
        const days = monthMap.get(month) || [];
        days.push(day);
        monthMap.set(month, days);
        yearMap.set(year, monthMap);
      });

    return Array.from(yearMap.entries())
      .sort(([yearA], [yearB]) => yearB.localeCompare(yearA))
      .map(([year, monthMap]) => {
        const months = Array.from(monthMap.entries())
          .sort(([monthA], [monthB]) => monthB.localeCompare(monthA))
          .map(([month, days]) => ({
            month,
            label: formatMonthFolderLabel(month),
            days,
          }));

        return {
          year,
          months,
        };
      });
  }, [data.timeRecords, filters.companyIds, filters.date, savedDayTables]);

  function askConfirmation(dialog: ConfirmDialog) {
    setConfirmDialog(dialog);
  }

  async function executeConfirm() {
    if (!confirmDialog || busy) return;
    setBusy(true);
    try {
      await confirmDialog.onConfirm();
      setConfirmDialog(null);
    } finally {
      setBusy(false);
    }
  }

  async function runInBatches<T>(
    items: T[],
    batchSize: number,
    handler: (item: T) => Promise<unknown>,
  ) {
    for (let index = 0; index < items.length; index += batchSize) {
      const batch = items.slice(index, index + batchSize);
      await Promise.all(batch.map((item) => handler(item)));
    }
  }

  async function upsertTimeRecordsOptimized(records: TimeRecord[]) {
    if (!records.length) return;

    const dataWithBatch = data as typeof data & {
      upsertTimeRecords?: (records: TimeRecord[]) => Promise<unknown>;
      bulkUpsertTimeRecords?: (records: TimeRecord[]) => Promise<unknown>;
      batchUpsertTimeRecords?: (records: TimeRecord[]) => Promise<unknown>;
    };

    const batchUpdater =
      dataWithBatch.upsertTimeRecords ||
      dataWithBatch.bulkUpsertTimeRecords ||
      dataWithBatch.batchUpsertTimeRecords;

    if (batchUpdater) {
      await batchUpdater(records.map((record) => sanitizeTimeRecord(record)));
      return;
    }

    await runInBatches(records, 25, (record) =>
      data.upsertTimeRecord(sanitizeTimeRecord(record)),
    );
  }

  function openCalculationPanel() {
    setCalculationForm(cloneCalculationSettings(calculationSettings));
    setStatusForm(emptyStatusConditionForm);
    setStatusModalOpen(false);
    setCalculationTab("rules");
    setCalculationPanelOpen((current) => !current);
  }

  function updateWeekdayRule(dayKey: string, value: string) {
    setCalculationForm((current) => ({
      ...current,
      usefulMinutesByWeekday: {
        ...current.usefulMinutesByWeekday,
        [dayKey]: parseMinutesInput(value),
      },
    }));
  }

  function updateOvertimeRate(
    field: keyof CalculationSettings["overtimeRates"],
    value: string,
  ) {
    setCalculationForm((current) => ({
      ...current,
      overtimeRates: {
        ...current.overtimeRates,
        [field]: toFixed2(value),
      },
    }));
  }

  function updateFormulaDescription(
    field: keyof CalculationSettings["formulas"],
    value: string,
  ) {
    setCalculationForm((current) => ({
      ...current,
      formulas: {
        ...current.formulas,
        [field]: value,
      },
    }));
  }

  function openCreateStatusModal() {
    if (!canEditTimekeeping) return;
    setStatusForm(emptyStatusConditionForm);
    setCalculationTab("statuses");
    setCalculationPanelOpen(true);
    setStatusModalOpen(true);
  }

  function editStatusCondition(condition: StatusCondition) {
    if (!canEditTimekeeping) return;
    setStatusForm({ ...condition });
    setCalculationTab("statuses");
    setCalculationPanelOpen(true);
    setStatusModalOpen(true);
  }

  function closeStatusModal() {
    setStatusForm(emptyStatusConditionForm);
    setStatusModalOpen(false);
  }

  function resetStatusForm() {
    setStatusForm(emptyStatusConditionForm);
  }

  function saveStatusCondition(event: FormEvent) {
    event.preventDefault();
    if (!statusForm.label.trim()) return;
    const value =
      statusForm.value.trim() || statusValueFromLabel(statusForm.label);
    const normalized: StatusCondition = {
      ...statusForm,
      id:
        statusForm.id ||
        normalizeKey(value || statusForm.label) ||
        `status_${Date.now().toString(36)}`,
      value,
      label: statusForm.label.trim(),
    };

    setCalculationForm((current) => {
      const exists = current.statusConditions.some(
        (item) => item.id === normalized.id,
      );
      return {
        ...current,
        statusConditions: exists
          ? current.statusConditions.map((item) =>
            item.id === normalized.id ? normalized : item,
          )
          : [...current.statusConditions, normalized],
      };
    });

    closeStatusModal();
  }

  function removeStatusCondition(conditionId: string) {
    if (!canDeleteTimekeeping) return;
    setCalculationForm((current) => ({
      ...current,
      statusConditions: current.statusConditions.filter(
        (item) => item.id !== conditionId,
      ),
    }));
    if (statusForm.id === conditionId) closeStatusModal();
  }

  function statusConditionFor(value?: string) {
    return (
      calculationSettings.statusConditions.find(
        (item) => item.value === value,
      ) || defaultStatusConditions.find((item) => item.value === value)
    );
  }

  function editingStatusConditionFor(value?: string) {
    return (
      calculationForm.statusConditions.find((item) => item.value === value) ||
      defaultStatusConditions.find((item) => item.value === value)
    );
  }

  async function persistCalculationSettings(
    nextSettings: CalculationSettings,
    closePanel = false,
  ) {
    const normalizedSettings = cloneCalculationSettings(nextSettings);
    setBusy(true);
    try {
      await data.upsertTimekeepingColumn({
        id: settingsColumn?.id,
        companyId: filters.companyIds[0] || "",
        label: settingsColumn?.label || "Configurações de cálculo",
        key: settingsColumnKey,
        type: "formula",
        systemField: settingsColumn?.systemField || "",
        formula: serializeCalculationSettings(normalizedSettings),
        options: settingsColumn?.options || [],
        optionColors: settingsColumn?.optionColors || {},
        linkedModule: settingsColumn?.linkedModule || "",
        relatedField: settingsColumn?.relatedField || "",
        width: settingsColumn?.width || defaultColumnWidth,
        wrap: settingsColumn?.wrap || false,
        active: true,
        createdAt: settingsColumn?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setCalculationForm(normalizedSettings);
      if (closePanel) setCalculationPanelOpen(false);
    } finally {
      setBusy(false);
    }
  }

  async function saveCalculationPanel() {
    await persistCalculationSettings(calculationForm, true);
  }

  async function toggleHolidayForCurrentDate() {
    const date = filters.date;
    const holidays = calculationSettings.holidays
      .map((holiday) => holiday.trim())
      .filter(Boolean);
    const isAlreadyHoliday = holidays.includes(date);
    const nextHolidays = isAlreadyHoliday
      ? holidays.filter((holiday) => holiday !== date)
      : Array.from(new Set([...holidays, date])).sort();

    const nextSettings = {
      ...calculationSettings,
      holidays: nextHolidays,
    };

    await persistCalculationSettings(nextSettings);

    const nextPercent = overtimeRateForDate(date, nextSettings);
    const allowedCompanyIds = new Set(filters.companyIds);
    const visibleEmployeeIds = new Set(
      employees
        .filter(
          (employee) =>
            employeeEffectiveStatusForDate(employee, date) !== "terminated",
        )
        .filter(
          (employee) =>
            !allowedCompanyIds.size ||
            allowedCompanyIds.has(employee.companyId),
        )
        .map((employee) => employee.id),
    );
    const employeeById = new Map(
      data.employees.map((employee) => [employee.id, employee]),
    );
    const existingRecordsForVisibleEmployees = data.timeRecords.filter(
      (record) =>
        record.date === date &&
        visibleEmployeeIds.has(record.employeeId) &&
        (!allowedCompanyIds.size || allowedCompanyIds.has(record.companyId)),
    );

    setBusy(true);
    try {
      if (!isAlreadyHoliday) {
        const recordsToUpdate = existingRecordsForVisibleEmployees
          .filter(
            (record) =>
              record.status !== "day_off" ||
              Number(record.overtimePercent || 0) !== Number(nextPercent || 0),
          )
          .map((record) => {
            const employee = employeeById.get(record.employeeId);
            const baseHourValue = Number(employee?.salary || 0) / 220;
            return {
              ...record,
              status: "day_off" as AttendanceStatus,
              overtimePercent: nextPercent,
              overtimeAmount: toFixed2(
                Number(record.overtimeHours || 0) *
                baseHourValue *
                (1 + nextPercent / 100),
              ),
              updatedAt: new Date().toISOString(),
            };
          });

        await upsertTimeRecordsOptimized(recordsToUpdate);
        return;
      }

      const recordsToUpdate = existingRecordsForVisibleEmployees
        .filter(
          (record) =>
            !isFinancialNeutralStatus(record.status) &&
            !isFullDayAbsenceStatus(record.status),
        )
        .filter(
          (record) =>
            Number(record.overtimePercent || 0) !== Number(nextPercent || 0),
        )
        .map((record) => {
          const employee = employeeById.get(record.employeeId);
          const baseHourValue = Number(employee?.salary || 0) / 220;
          return {
            ...record,
            overtimePercent: nextPercent,
            overtimeAmount: toFixed2(
              Number(record.overtimeHours || 0) *
              baseHourValue *
              (1 + nextPercent / 100),
            ),
            updatedAt: new Date().toISOString(),
          };
        });

      await upsertTimeRecordsOptimized(recordsToUpdate);
    } finally {
      setBusy(false);
    }
  }

  function companyName(companyId: string) {
    return companyById.get(companyId)?.name || "-";
  }

  function companyGroupName(companyId?: string) {
    return companyId ? companyGroupNameByCompanyId.get(companyId) || "-" : "-";
  }

  function departmentName(departmentId?: string) {
    return departmentId ? departmentById.get(departmentId)?.name || "-" : "-";
  }

  function sectorName(sectorId?: string) {
    return sectorId ? sectorById.get(sectorId)?.name || "-" : "-";
  }

  function subsectorName(subsectorId?: string) {
    return subsectorId ? subsectorById.get(subsectorId)?.name || "-" : "-";
  }

  function teamName(teamId?: string) {
    return teamId ? teamById.get(teamId)?.name || "-" : "-";
  }

  function employeeRecord(employeeId: string, date = filters.date) {
    if (date === filters.date && draftRecordsByEmployeeId[employeeId]) {
      return draftRecordsByEmployeeId[employeeId];
    }
    return timeRecordByEmployeeDate.get(`${employeeId}:${date}`);
  }

  function displayRecord(employee: Employee) {
    return (
      displayRecordByEmployeeId.get(employee.id) ||
      createDisplayRecord(
        employee,
        filters.date,
        employeeRecord(employee.id),
        calculationSettings,
      )
    );
  }

  function makeRecord(
    employee: Employee,
    patch: Partial<TimeRecord>,
  ): TimeRecord {
    const existing = employeeRecord(employee.id);
    const current = createDisplayRecord(
      employee,
      filters.date,
      existing,
      calculationSettings,
    );

    const requestedCheckIn = patch.checkIn ?? current.checkIn;
    const checkIn = hasFilledTimeValue(requestedCheckIn)
      ? excelTimeToText(requestedCheckIn) || String(requestedCheckIn)
      : "00:00";
    // Sem preenchimento automático da jornada ao salvar a ENT. 1.
    const shouldApplyDefaults = false;
    const scheduleDefaults = scheduleDefaultsForDate(employee, filters.date, calculationSettings);
    const normalLimitMinutes = normalLimitMinutesForEmployeeDate(employee, filters.date, calculationSettings);
    const hasExplicitCheckOut = Object.prototype.hasOwnProperty.call(
      patch,
      "checkOut",
    );
    const requestedCheckOut = hasExplicitCheckOut ? patch.checkOut : current.checkOut;
    const checkOut = hasExplicitCheckOut
      ? automaticTimeValue(
        requestedCheckOut,
        scheduleDefaults.lunchOut,
        shouldApplyDefaults,
      )
      : automaticScheduleTimeValue(
        requestedCheckOut,
        scheduleDefaults.lunchOut,
        calculationSettings.secullumLunchOutTime || "12:00",
        shouldApplyDefaults,
      );
    const status = patch.status ?? current.status;

    const patchCustomFields = (patch.customFields || {}) as Record<string, string>;
    const customFields = {
      ...(current.customFields || {}),
      ...patchCustomFields,
    } as Record<string, string>;
    const hasExplicitEnt2 = Object.prototype.hasOwnProperty.call(
      patchCustomFields,
      "ent2",
    );
    const hasExplicitSai2 = Object.prototype.hasOwnProperty.call(
      patchCustomFields,
      "sai2",
    );
    const sai2ManuallyZeroed = isSai2ManuallyZeroed(customFields);

    const fieldsWithDefaults: Record<string, string> = {
      ...customFields,
      ent2: hasExplicitEnt2
        ? String(patchCustomFields.ent2 || "00:00")
        : automaticScheduleTimeValue(
          customFields.ent2,
          scheduleDefaults.lunchReturn,
          calculationSettings.secullumLunchReturnTime || "13:01",
          shouldApplyDefaults,
        ),
      sai2: sai2ManuallyZeroed
        ? "00:00"
        : hasExplicitSai2
          ? String(patchCustomFields.sai2 || "00:00")
          : automaticScheduleTimeValue(
            customFields.sai2,
            scheduleDefaults.end,
            calculationSettings.secullumEndTime || "17:00",
            shouldApplyDefaults,
          ),
    };

    const calculated = calculateSecullumMetrics(
      checkIn,
      checkOut,
      fieldsWithDefaults as Record<string, string>,
      calculationSettings,
      filters.date,
      employee,
    );
    const neutralStatus = isFinancialNeutralStatus(status);
    const fullDayAbsence = isFullDayAbsenceStatus(status);
    const fullDayAbsenceHours = minutesToSecullumTime(normalLimitMinutes);
    const manualMetricOverrides = readManualMetricOverrides(fieldsWithDefaults);

    const finalNormais = metricValue(
      fieldsWithDefaults,
      manualMetricOverrides,
      "normais",
      neutralStatus || fullDayAbsence ? "00:00" : calculated.normais,
    );
    const finalFaltas = metricValue(
      fieldsWithDefaults,
      manualMetricOverrides,
      "faltas",
      fullDayAbsence
        ? fullDayAbsenceHours
        : neutralStatus
          ? "00:00"
          : calculated.faltas,
    );
    const finalExtras = metricValue(
      fieldsWithDefaults,
      manualMetricOverrides,
      "extras",
      neutralStatus || fullDayAbsence ? "00:00" : calculated.extras,
    );
    const finalCarga = metricValue(
      fieldsWithDefaults,
      manualMetricOverrides,
      "carga",
      fullDayAbsence
        ? fullDayAbsenceHours
        : neutralStatus
          ? "00:00"
          : calculated.carga,
    );

    const nextCustomFields: Record<string, string> = {
      ...fieldsWithDefaults,
      ent2: fieldsWithDefaults.ent2 || "00:00",
      sai2: fieldsWithDefaults.sai2 || "00:00",
      ent3: fieldsWithDefaults.ent3 || "00:00",
      sai3: fieldsWithDefaults.sai3 || "00:00",
      normais: finalNormais,
      faltas: finalFaltas,
      extras: finalExtras,
      carga: finalCarga,
      statusLabel:
        neutralStatus || fullDayAbsence ? statusDisplayText(status) : "",
    };

    const overtimePercent =
      neutralStatus || fullDayAbsence
        ? 0
        : (patch.overtimePercent ??
          current.overtimePercent ??
          overtimeRateForDate(filters.date, calculationSettings));
    const overtimeHours = manualMetricOverrides.has("extras")
      ? secullumTimeToHours(finalExtras)
      : neutralStatus || fullDayAbsence
        ? 0
        : (patch.overtimeHours ?? calculated.overtimeHours);
    const usefulHours = manualMetricOverrides.has("normais")
      ? secullumTimeToHours(finalNormais)
      : neutralStatus || fullDayAbsence
        ? 0
        : (patch.usefulHours ?? calculated.usefulHours);
    const baseHours = manualMetricOverrides.has("carga")
      ? secullumTimeToHours(finalCarga)
      : fullDayAbsence
        ? normalLimitMinutes / 60
        : neutralStatus
          ? 0
          : (patch.baseHours ?? calculated.baseHours);
    const absenceCount = manualMetricOverrides.has("faltas")
      ? (secullumTimeToMinutes(finalFaltas) || 0) > 0
        ? 1
        : 0
      : fullDayAbsence && normalLimitMinutes > 0
        ? 1
        : neutralStatus
          ? 0
          : (patch.absenceCount ?? calculated.absenceCount);
    const baseHourValue = Number(employee.salary || 0) / 220;
    const overtimeAmount =
      neutralStatus || fullDayAbsence
        ? 0
        : toFixed2(
          Number(overtimeHours || 0) *
          baseHourValue *
          (1 + Number(overtimePercent || 0) / 100),
        );
    const finalCheckIn = checkIn || "00:00";
    const finalCheckOut = checkOut || "00:00";

    return {
      id: existing?.id || "",
      companyId: employee.companyId,
      employeeId: employee.id,
      date: filters.date,
      status,
      source: patch.source || current.source || "manual",
      functionName: employee.role || employee.position || "",
      realTeamId: employee.teamId || "",
      dayTeamId: patch.dayTeamId ?? current.dayTeamId ?? employee.teamId ?? "",
      usefulHours,
      baseHours,
      intervalHours:
        current.intervalHours ||
        toFixed2(calculationSettings.intervalMinutes / 60),
      overtimePercent,
      overtimeHours,
      overtimeAmount,
      cid:
        status === "medical_certificate"
          ? (patch.cid ?? current.cid ?? "")
          : "",
      checkIn: finalCheckIn,
      checkOut: finalCheckOut,
      absenceCount,
      notes: patch.notes ?? current.notes ?? "",
      customFields: removeUndefinedFields(nextCustomFields),
      updatedAt: new Date().toISOString(),
    };
  }

  async function syncBenefitAbsencesBatch(savedRecords: TimeRecord[]) {
    if (!savedRecords.length) return;

    const affectedEmployeeIds = new Set(savedRecords.map((record) => record.employeeId));
    const affectedCompanyIds = new Set(
      savedRecords
        .map((record) => employeeById.get(record.employeeId)?.companyId || record.companyId)
        .filter(Boolean),
    );
    const hasEmployeeBenefitsToSync = data.employeeBenefits.some(
      (benefit) => affectedEmployeeIds.has(benefit.employeeId) && benefit.active !== false,
    );
    const hasBenefitContractsToSync = data.benefitContracts.some((contract) => {
      if (!affectedCompanyIds.has(contract.companyId)) return false;
      return readBenefitColumns(contract)
        .some((column) => normalizeKey(column) === "faltas");
    });

    // Sem benefício dependente de faltas, não há motivo para consultar o mês.
    if (!hasEmployeeBenefitsToSync && !hasBenefitContractsToSync) return;

    const recordsByMonth = new Map<string, TimeRecord[]>();
    savedRecords.forEach((record) => {
      const month = record.date.slice(0, 7);
      const current = recordsByMonth.get(month) || [];
      current.push(record);
      recordsByMonth.set(month, current);
    });

    for (const [month, monthOverrides] of recordsByMonth) {
      const monthStart = `${month}-01`;
      const monthEndDate = new Date(`${monthStart}T12:00:00`);
      monthEndDate.setMonth(monthEndDate.getMonth() + 1, 0);
      const monthEnd = monthEndDate.toISOString().slice(0, 10);

      // Uma única consulta mensal atende todos os funcionários alterados.
      // Antes, cada funcionário iniciava sua própria rotina de sincronização.
      const monthRecords = await loadTimeRecordsRange(monthStart, monthEnd);
      const overrideKeys = new Set(
        monthOverrides.map((record) => `${record.employeeId}:${record.date}`),
      );
      const absenceCountByEmployee = new Map<string, number>();

      const addAbsence = (record: TimeRecord) => {
        const count = isAbsenceStatus(record.status)
          ? 1
          : Number(record.absenceCount || 0);
        absenceCountByEmployee.set(
          record.employeeId,
          (absenceCountByEmployee.get(record.employeeId) || 0) + count,
        );
      };

      monthRecords.forEach((record) => {
        if (!overrideKeys.has(`${record.employeeId}:${record.date}`)) addAbsence(record);
      });
      monthOverrides.forEach(addAbsence);

      const affectedEmployees = monthOverrides
        .map((record) => employeeById.get(record.employeeId))
        .filter((employee): employee is Employee => Boolean(employee));
      const affectedEmployeeIds = new Set(affectedEmployees.map((employee) => employee.id));
      const now = new Date().toISOString();

      const employeeBenefitTasks = data.employeeBenefits
        .filter((benefit) => affectedEmployeeIds.has(benefit.employeeId) && benefit.active !== false)
        .map((benefit) => async () => {
          const absenceCount = absenceCountByEmployee.get(benefit.employeeId) || 0;
          await data.upsertEmployeeBenefit({
            ...benefit,
            absenceCount,
            customFields: {
              ...(benefit.customFields || {}),
              faltas: String(absenceCount),
              Faltas: String(absenceCount),
              lastTimekeepingSyncAt: now,
            },
            updatedAt: now,
          });
        });

      // Evita centenas de escritas simultâneas e o backoff do Firestore.
      const taskChunkSize = 20;
      for (let offset = 0; offset < employeeBenefitTasks.length; offset += taskChunkSize) {
        await Promise.all(employeeBenefitTasks
          .slice(offset, offset + taskChunkSize)
          .map((task) => task()));
      }

      const affectedByCompany = new Map<string, Employee[]>();
      affectedEmployees.forEach((employee) => {
        const current = affectedByCompany.get(employee.companyId) || [];
        current.push(employee);
        affectedByCompany.set(employee.companyId, current);
      });

      const contractTasks = data.benefitContracts
        .filter((contract) => {
          const columns = readBenefitColumns(contract);
          return affectedByCompany.has(contract.companyId)
            && columns.some((column) => normalizeKey(column) === "faltas");
        })
        .map((contract) => async () => {
          const columns = readBenefitColumns(contract);
          const rows = readBenefitRows(contract);
          const formulas = readBenefitFormulas(contract);
          const absenceColumn = columns.find(
            (column) => normalizeKey(column) === "faltas",
          );
          if (!absenceColumn) return;

          const companyEmployees = affectedByCompany.get(contract.companyId) || [];
          let changed = false;
          const nextRows = recalculateBenefitRows(
            rows.map((row) => {
              const employee = companyEmployees.find((candidate) => sameEmployeeRow(row, candidate));
              if (!employee) return row;
              const nextValue = String(absenceCountByEmployee.get(employee.id) || 0);
              if (String(row[absenceColumn] ?? "") === nextValue) return row;
              changed = true;
              return { ...row, [absenceColumn]: nextValue };
            }),
            columns,
            formulas,
          );
          if (!changed) return;

          await data.upsertBenefitContract({
            ...contract,
            customFields: {
              ...contract.customFields,
              tableRows: JSON.stringify(nextRows),
              lastTimekeepingSyncAt: now,
              updatedAt: now,
            },
          });
        });

      for (let offset = 0; offset < contractTasks.length; offset += taskChunkSize) {
        await Promise.all(contractTasks
          .slice(offset, offset + taskChunkSize)
          .map((task) => task()));
      }
    }
  }

  async function saveRecord(employee: Employee, patch: Partial<TimeRecord>) {
    if (tableLocked) return undefined;
    const existing = employeeRecord(employee.id);
    const timePatchValues = [
      patch.checkIn,
      patch.checkOut,
      patch.customFields?.ent2,
      patch.customFields?.sai2,
      patch.customFields?.ent3,
      patch.customFields?.sai3,
    ];
    const normalizedPatch = !patch.status
      && (isAbsenceStatus(existing?.status) || !existing?.status)
      && timePatchValues.some(hasFilledTimeValue)
      ? { ...patch, status: "present" as AttendanceStatus }
      : patch;
    const nextRecord = sanitizeTimeRecord({
      ...makeRecord(employee, normalizedPatch),
      id: existing?.id || timeRecordDocumentId(filters.date, employee.id),
      updatedAt: existing?.updatedAt || new Date().toISOString(),
    });
    setDraftRecordsByEmployeeId((current) => ({ ...current, [employee.id]: nextRecord }));
    return nextRecord;
  }

  // ===== Tecla "T": atualização em LOTE pelo Secullum =====
  // Reutiliza a MESMA lógica da tecla S para montar o patch de cada funcionário.
  // Ignora os filtros da tela (itera data.employees), ignora quem não está no
  // Secullum (PJ), ignora jornada zerada e ignora quando não há diferença real.
  function buildSecullumBatch(): SecullumBatchItem[] {
    const norm = (v?: string) => {
      const s = String(v ?? "").trim();
      return s === "00:00" ? "" : s;
    };
    const labels: Record<SecullumBatchDiff["field"], string> = {
      entrada1: "Entrada 1",
      saida1: "Saída 1",
      entrada2: "Entrada 2",
      saida2: "Saída 2",
    };
    const items: SecullumBatchItem[] = [];
    data.employees.forEach((employee) => {
      const cpf = (employee.cpf || "").replace(/\D/g, "");
      const row = cpf ? secullumByCpf.get(cpf) : undefined;
      if (!row) return; // não existe no Secullum (ex.: PJ) → ignora silenciosamente
      const secFilled =
        hasFilledTimeValue(row.entrada1) ||
        hasFilledTimeValue(row.saida1) ||
        hasFilledTimeValue(row.entrada2) ||
        hasFilledTimeValue(row.saida2);
      if (!secFilled) return; // jornada zerada no Secullum → ignora

      const base = employeeRecord(employee.id);
      const cfBase = (base?.customFields || {}) as Record<string, string>;
      const current: Record<SecullumBatchDiff["field"], string | undefined> = {
        entrada1: base?.checkIn,
        saida1: base?.checkOut,
        entrada2: cfBase.ent2,
        saida2: cfBase.sai2,
      };

      const diffs: SecullumBatchDiff[] = [];
      (["entrada1", "saida1", "entrada2", "saida2"] as const).forEach((field) => {
        const secVal = String(row[field] ?? "").trim();
        if (!hasFilledTimeValue(secVal)) return; // igual à tecla S: só campos preenchidos
        if (norm(secVal) === norm(current[field])) return; // sem diferença real
        diffs.push({
          field,
          label: labels[field],
          from: norm(current[field]) || "--",
          to: secVal,
        });
      });
      if (!diffs.length) return; // dados iguais ao Firebase → ignora

      const patch: Partial<TimeRecord> = {};
      const cf: Record<string, string> = { ...cfBase };
      if (hasFilledTimeValue(row.entrada1)) patch.checkIn = row.entrada1;
      if (hasFilledTimeValue(row.saida1)) patch.checkOut = row.saida1;
      if (hasFilledTimeValue(row.entrada2)) cf.ent2 = row.entrada2;
      if (hasFilledTimeValue(row.saida2)) {
        cf.sai2 = row.saida2;
        cf[manualZeroSai2Field] = "false";
      }
      patch.customFields = cf;
      items.push({ employee, patch, diffs, selected: true });
    });
    return items;
  }

  function runSecullumBatch() {
    if (tableLocked) {
      window.alert(
        "Libere a tabela (modo edição) para aplicar os dados do Secullum em lote.",
      );
      return;
    }
    if (secullumStatus !== "ok") {
      window.alert(
        "Os dados do Secullum ainda não foram carregados para este dia. Clique em \"Atualizar Secullum\" e tente novamente.",
      );
      return;
    }
    const items = buildSecullumBatch();
    if (!items.length) {
      window.alert(
        "Nenhuma alteração encontrada entre o Secullum e o banco de dados para este dia.",
      );
      return;
    }
    setSecullumBatch(items);
  }

  // Confirmar o modal NÃO salva no Firebase: apenas envia os selecionados para a
  // área de pré-envio (draft). A persistência continua no botão "Salvar dia do mês".
  function confirmSecullumBatch() {
    if (!secullumBatch) return;
    secullumBatch
      .filter((item) => item.selected)
      .forEach((item) => void saveRecord(item.employee, item.patch));
    setSecullumBatch(null);
  }

  async function persistManualMetricEdit(edit: PendingManualMetricEdit) {
    const employee = employeeById.get(edit.employeeId);
    if (!employee || edit.date !== filters.date) return;

    const record = displayRecord(employee);
    const nextCustomFields = addManualMetricOverride(
      record.customFields as Record<string, string> | undefined,
      edit.columnKey,
      edit.value,
    );

    await saveRecord(employee, {
      source: "manual",
      customFields: nextCustomFields,
    });
  }

  function requestManualMetricEdit(
    employee: Employee,
    column: ColumnDescriptor,
    value: string,
  ) {
    if (!isCalculatedMetricKey(column.key)) return;

    const edit: PendingManualMetricEdit = {
      employeeId: employee.id,
      employeeName: employee.name,
      columnKey: column.key,
      columnLabel: column.label,
      value: value || "00:00",
      date: filters.date,
    };

    if (manualWarningAcceptedDates[filters.date]) {
      void persistManualMetricEdit(edit);
      return;
    }

    setPendingManualMetricEdit(edit);
  }

  async function confirmManualMetricEdit() {
    if (!pendingManualMetricEdit || busy) return;

    setBusy(true);
    try {
      await persistManualMetricEdit(pendingManualMetricEdit);
      setManualWarningAcceptedDates((current) => {
        const next = { ...current, [pendingManualMetricEdit.date]: true };
        if (typeof window !== "undefined") {
          window.sessionStorage.setItem(
            manualWarningStorageKey,
            JSON.stringify(next),
          );
        }
        return next;
      });
      setPendingManualMetricEdit(null);
    } finally {
      setBusy(false);
    }
  }

  async function saveWholeDay() {
    if (!user) return;
    setBusy(true);
    try {
      const now = new Date().toISOString();
      const finalRecords = wholeDaySavePlan.finalRecords.map((record) => ({
        ...record,
        updatedAt: record.updatedAt || now,
      }));
      const recordsToWrite = wholeDaySavePlan.recordsToWrite.map((record) => ({
        ...record,
        updatedAt: now,
      }));
      const obsoleteRecordIds = new Set(wholeDaySavePlan.obsoleteRecordIds);
      const previousTable = wholeDaySavePlan.previousTable;
      if (!recordsToWrite.length && !obsoleteRecordIds.size && previousTable) {
        // Dia já salvo e sem qualquer alteração: não cria nova versão nem faz
        // chamadas ao Firestore. Apenas encerra a edição local.
        setDraftRecordsByEmployeeId({});
        setTableLocked(true);
        return;
      }

      const mergedByEmployee = new Map<string, TimeRecord>();
      data.timeRecords
        .filter((record) => record.date === filters.date)
        .forEach((record) => mergedByEmployee.set(record.employeeId, record));
      finalRecords.forEach((record) => mergedByEmployee.set(record.employeeId, record));
      const mergedRecords = Array.from(mergedByEmployee.values());
      const dayTable: TimekeepingDayTable = {
        id: filters.date,
        date: filters.date,
        companyIds: Array.from(new Set(mergedRecords.map((record) => record.companyId).filter(Boolean))).sort(),
        employeeCount: mergedRecords.length,
        recordCount: mergedRecords.length,
        absenceCount: mergedRecords.filter((record) => isAbsenceStatus(record.status)).length,
        savedByUserId: user.id,
        savedByUsername: user.username,
        savedByName: user.name,
        savedAt: now,
        updatedAt: now,
        version: Number(previousTable?.version || 0) + 1,
      };

      // A fotografia completa continua existindo no dia. Porém, depois do
      // primeiro salvamento, somente funcionários alterados são regravados.
      // Isso evita reescrever e retransmitir centenas de documentos iguais no
      // listener do Firestore a cada clique.
      await Promise.all([
        data.saveTimekeepingDayRecords(recordsToWrite, Array.from(obsoleteRecordIds)),
        saveTimekeepingDayTable(dayTable),
      ]);
      setSavedDayTables((current) => [dayTable, ...current.filter((table) => table.id !== dayTable.id)]);

      // Auditoria (Firestore) das alterações de horário persistidas neste dia.
      void (async () => {
        const timeFields: Array<{
          field: "entrada1" | "saida1" | "entrada2" | "saida2";
          getter: (r: TimeRecord) => string;
        }> = [
            { field: "entrada1", getter: (r) => String(r.checkIn ?? "") },
            { field: "saida1", getter: (r) => String(r.checkOut ?? "") },
            {
              field: "entrada2",
              getter: (r) => String((r.customFields as Record<string, string>)?.ent2 ?? ""),
            },
            {
              field: "saida2",
              getter: (r) => String((r.customFields as Record<string, string>)?.sai2 ?? ""),
            },
          ];
        for (const record of recordsToWrite) {
          const employee = employeeById.get(record.employeeId);
          if (!employee) continue;
          const stored = timeRecordByEmployeeDate.get(
            `${record.employeeId}:${record.date}`,
          );
          for (const { field, getter } of timeFields) {
            const before = stored ? getter(stored) : "";
            const after = getter(record);
            if ((before || "").trim() === (after || "").trim()) continue;
            await writeTimekeepingAudit({
              employee,
              field,
              previousValue: before,
              newValue: after,
              previousOrigin: "firebase",
              newOrigin: "firebase",
              action: "alteracao_jornada_firebase",
              result: "sucesso",
              integratedWithSecullum: false,
            });
          }
        }
      })();

      const benefitsToSync = recordsToWrite.filter((record) => {
        const stored = timeRecordByEmployeeDate.get(`${record.employeeId}:${record.date}`);
        return record.status === "absence_confirmed"
          || stored?.status === "absence_confirmed";
      });

      // A sincronização financeira não bloqueia mais o botão de salvar. Ela usa
      // uma única leitura mensal e atualiza cada contrato apenas uma vez.
      if (benefitsToSync.length) {
        void syncBenefitAbsencesBatch(benefitsToSync).catch((error) => {
          console.error("Não foi possível sincronizar as faltas com os benefícios.", error);
        });
      }

      setDraftRecordsByEmployeeId({});
      setTableLocked(true);
    } finally {
      setBusy(false);
    }
  }

  function systemValue(
    employee: Employee,
    record: TimeRecord | undefined,
    column: ColumnDescriptor,
  ) {
    const key = "systemField" in column ? column.systemField : "";
    if (key === "functionName")
      return record?.functionName || employee.role || employee.position || "-";
    if (key === "realTeam")
      return record?.realTeamName || teamName(record?.realTeamId || employee.teamId);
    if (key === "companyGroup") return companyGroupName(employee.companyId);
    if (key === "company") return record?.companyName || companyName(record?.companyId || employee.companyId);
    if (key === "department")
      return record?.departmentName || departmentName(record?.departmentId || employee.departmentId);
    if (key === "sector")
      return record?.sectorName || sectorName(record?.sectorId || employee.sectorId);
    if (key === "subsector")
      return record?.subsectorName || subsectorName(record?.subsectorId || employee.subsectorId);
    if (key === "employee") return record?.employeeName || employee.name;
    if (key === "employeeKind") return employeeKindLabel(employee);
    if (key === "teamLead") return employee.isTeamLead ? "Sim" : "Não";
    return "-";
  }

  function customColumnValue(
    employee: Employee,
    record: TimeRecord | undefined,
    column: TimekeepingColumn,
  ) {
    if (column.type === "system") return systemValue(employee, record, column);
    if (column.type === "formula") {
      const source = {
        hora_util: String(record?.usefulHours || 0),
        he: String(record?.overtimeHours || 0),
        percentual_he: String(record?.overtimePercent || 0),
        entrada: record?.checkIn || "0",
        saida: record?.checkOut || "0",
        faltas: String(record?.absenceCount || 0),
        status: record?.status || "",
        cid: record?.cid || "",
        ...Object.fromEntries(
          Object.entries(record?.customFields || {}).map(([key, value]) => [
            normalizeKey(key),
            value,
          ]),
        ),
      };
      return (
        calculateFormula(column.formula || "", source, Object.keys(source)) ||
        "-"
      );
    }
    return record?.customFields?.[column.key] || "";
  }

  function linkedColumnOptions(column: TimekeepingColumn, employee: Employee) {
    const companyId = filters.companyIds[0] || employee.companyId;
    const optionColor = (value: string, label: string) =>
      column.optionColors?.[value] || column.optionColors?.[label] || "";

    if (column.linkedModule === "companies") {
      return sortOptions(
        data.companies.map((company) => ({
          value: company.id,
          label: company.name,
          color: optionColor(company.id, company.name),
        })),
      );
    }

    if (column.linkedModule === "employees") {
      return sortOptions(
        data.employees
          .filter((item) => !companyId || item.companyId === companyId)
          .map((item) => ({
            value: item.id,
            label: item.name,
            color: optionColor(item.id, item.name),
          })),
      );
    }

    if (column.linkedModule === "departments") {
      return sortOptions(
        data.departments
          .filter((item) => !companyId || item.companyId === companyId)
          .map((item) => ({
            value: item.id,
            label: item.name,
            color: optionColor(item.id, item.name),
          })),
      );
    }

    if (column.linkedModule === "sectors") {
      return sortOptions(
        data.sectors
          .filter((item) => !companyId || item.companyId === companyId)
          .map((item) => ({
            value: item.id,
            label: item.name,
            color: optionColor(item.id, item.name),
          })),
      );
    }

    if (column.linkedModule === "subsectors") {
      return sortOptions(
        data.subsectors
          .filter((item) => !companyId || item.companyId === companyId)
          .map((item) => ({
            value: item.id,
            label: item.name,
            color: optionColor(item.id, item.name),
          })),
      );
    }

    if (column.linkedModule === "teams") {
      return sortOptions(
        data.teams
          .filter((item) => !companyId || item.companyId === companyId)
          .map((item) => ({
            value: item.id,
            label: item.name,
            color: optionColor(item.id, item.name),
          })),
      );
    }

    if (column.linkedModule === "benefitContracts") {
      return sortOptions(
        data.benefitContracts
          .filter((item) => !companyId || item.companyId === companyId)
          .map((item) => ({
            value: item.id,
            label: item.name,
            color: optionColor(item.id, item.name),
          })),
      );
    }

    if (column.linkedModule === "benefitPlans") {
      return sortOptions(
        data.benefitPlans
          .filter((item) => !companyId || item.companyId === companyId)
          .map((item) => ({
            value: item.id,
            label: item.name,
            color: optionColor(item.id, item.name),
          })),
      );
    }

    return sortOptions(
      (column.options || []).map((option) => ({
        value: option,
        label: option,
        color: optionColor(option, option),
      })),
    );
  }

  function openCreateColumn() {
    if (!canCreateTimekeeping && !canEditTimekeeping) return;
    setColumnForm(emptyColumnForm);
    setColumnModalOpen(true);
    setOpenColumnMenu(null);
  }

  function openEditColumn(column: TimekeepingColumn) {
    if (!canEditTimekeeping) return;
    setColumnForm({
      id: column.id,
      label: column.label,
      type: column.type,
      options: (column.options || []).join("\n"),
      optionColors: stringifyOptionColors(column.optionColors),
      linkedModule: column.linkedModule || "",
      relatedField: column.relatedField || "",
      systemField: column.systemField || "",
      formula: column.formula || "",
    });
    setColumnModalOpen(true);
    setOpenColumnMenu(null);
  }

  async function submitColumn(event: FormEvent) {
    event.preventDefault();
    if (!columnForm.label.trim()) return;
    const existing = columnForm.id
      ? data.timekeepingColumns.find((column) => column.id === columnForm.id)
      : undefined;
    const type = columnForm.linkedModule ? "select" : columnForm.type;
    await data.upsertTimekeepingColumn({
      id: existing?.id,
      companyId: filters.companyIds[0] || "",
      label: columnForm.label.trim(),
      key: existing?.key || normalizeKey(columnForm.label),
      type,
      systemField: columnForm.type === "system" ? columnForm.systemField || "companyGroup" : columnForm.systemField,
      formula: columnForm.formula.trim(),
      options: columnForm.linkedModule
        ? []
        : columnForm.options
          .split(/[\n,;]/)
          .map((item) => item.trim())
          .filter(Boolean),
      optionColors: parseOptionColors(columnForm.optionColors),
      linkedModule: columnForm.linkedModule,
      relatedField: columnForm.relatedField,
      width: existing?.width || defaultColumnWidth,
      wrap: existing?.wrap || false,
      active: true,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setColumnModalOpen(false);
  }

  async function resizeColumn(column: TimekeepingColumn, delta: number) {
    const currentWidth = column.width || defaultColumnWidth;
    const nextWidth = Math.max(
      minColumnWidth,
      Math.min(maxColumnWidth, currentWidth + delta),
    );
    await data.upsertTimekeepingColumn({
      ...column,
      width: nextWidth,
      updatedAt: new Date().toISOString(),
    });
    setOpenColumnMenu(null);
  }

  async function toggleColumnWrap(column: TimekeepingColumn) {
    await data.upsertTimekeepingColumn({
      ...column,
      wrap: !column.wrap,
      updatedAt: new Date().toISOString(),
    });
    setOpenColumnMenu(null);
  }

  function deleteColumn(column: TimekeepingColumn) {
    if (!canDeleteTimekeeping) return;
    setOpenColumnMenu(null);
    askConfirmation({
      title: "Excluir coluna",
      message: `Tem certeza que deseja excluir a coluna ${column.label}?`,
      confirmLabel: "Excluir",
      variant: "danger",
      impact: buildDomainDeletionImpact(data, "timekeepingColumns", column.id, column.label),
      onConfirm: async () => {
        await data.deleteTimekeepingColumn(column.id);
      },
    });
  }

  function recordHasManualPoint(record?: TimeRecord) {
    if (!record) return false;

    const source = String(record.source || "manual").toLowerCase();
    if (source === "seculum" || source === "secullum") return false;

    const customFields = record.customFields || {};
    const hasMeaningfulTime = (value: unknown) => {
      const text = String(value || "").trim();
      return Boolean(text && text !== "00:00" && text !== "0:00");
    };

    const hasPunch = [
      record.checkIn,
      record.checkOut,
      customFields.ent2,
      customFields.sai2,
      customFields.ent3,
      customFields.sai3,
    ].some(hasMeaningfulTime);

    const hasManualCalculatedValue = [
      customFields.normais,
      customFields.faltas,
      customFields.extras,
    ].some(hasMeaningfulTime);

    const statusWasDecidedByDp = [
      "absence_confirmed",
      "medical_certificate",
      "vacation",
      "day_off",
      "leave",
    ].includes(String(record.status || ""));

    return Boolean(
      hasPunch ||
      hasManualCalculatedValue ||
      record.notes?.trim() ||
      record.cid?.trim() ||
      statusWasDecidedByDp,
    );
  }

  function buildSecullumDateError(rows: SecullumImportRow[]) {
    const datesInFile = Array.from(
      new Set(rows.map((row) => row.date).filter(Boolean)),
    ).sort();
    if (!datesInFile.length) {
      return "A planilha selecionada não possui datas válidas na coluna DATA. Confira se o arquivo é o relatório PONTO DIÁRIO do Secullum.";
    }

    const divergentDates = datesInFile.filter((date) => date !== filters.date);
    if (!divergentDates.length) return "";

    return `Importação bloqueada: a tela está no dia ${formatDateForDisplay(filters.date)}, mas a planilha do Secullum possui ${divergentDates.map(formatDateForDisplay).join(", ")}. Selecione no sistema a mesma data do arquivo ou importe a planilha correta.`;
  }

  async function handleSecullumFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setSecullumFileName(file.name);
    setSecullumImportError("");

    let rows: Record<string, unknown>[] = [];
    let XLSX: typeof import("xlsx-js-style");

    try {
      const buffer = await file.arrayBuffer();
      XLSX = await loadXlsxModule();
      const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
      const firstSheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[firstSheetName];

      if (!sheet) throw new Error("A planilha não possui uma aba válida.");
      rows = buildSecullumRowsFromSheet(XLSX, sheet);
    } catch (error) {
      console.error("Erro ao ler a planilha do Secullum:", error);
      setSecullumRows([]);
      setSecullumImportError(
        "Não foi possível ler a planilha selecionada. Confirme se o arquivo é um Excel válido (.xlsx ou .xls) exportado pelo Secullum.",
      );
      event.target.value = "";
      return;
    }

    const importedRows: SecullumImportRow[] = rows
      .map((row, index) => {
        const employeeName = String(
          readSecullumCell(row, [
            "NOME",
            "FUNCIONÁRIO",
            "FUNCIONARIO",
            "EMPREGADO",
          ]),
        ).trim();

        const imported: SecullumImportRow = {
          rowNumber: Number(row["__rowNumber"] || index + 2),
          date: excelDateToISO(readSecullumCell(row, ["DATA", "DIA"]), XLSX),
          employeeName,
          ent1: excelTimeToText(
            readSecullumCell(row, ["ENT. 1", "ENT 1", "ENTRADA 1"]),
          ),
          sai1: excelTimeToText(
            readSecullumCell(row, [
              "SAÍ. 1",
              "SAI. 1",
              "SAI 1",
              "SAÍDA 1",
              "SAIDA 1",
            ]),
          ),
          ent2: excelTimeToText(
            readSecullumCell(row, ["ENT. 2", "ENT 2", "ENTRADA 2"]),
          ),
          sai2: excelTimeToText(
            readSecullumCell(row, [
              "SAÍ. 2",
              "SAI. 2",
              "SAI 2",
              "SAÍDA 2",
              "SAIDA 2",
            ]),
          ),
          ent3: excelTimeToText(
            readSecullumCell(row, ["ENT. 3", "ENT 3", "ENTRADA 3"]),
          ),
          sai3: excelTimeToText(
            readSecullumCell(row, [
              "SAÍ. 3",
              "SAI. 3",
              "SAI 3",
              "SAÍDA 3",
              "SAIDA 3",
            ]),
          ),
          normais: excelTimeToText(
            readSecullumCell(row, ["NORMAIS", "HORAS NORMAIS"]),
          ),
          faltas: excelTimeToText(readSecullumCell(row, ["FALTAS", "FALTA"])),
          extras: excelTimeToText(
            readSecullumCell(row, [
              "EXTRAS",
              "HE",
              "HORA EXTRA",
              "HORAS EXTRAS",
            ]),
          ),
          carga: excelTimeToText(
            readSecullumCell(row, ["CARGA", "CARGA HORÁRIA", "CARGA HORARIA"]),
          ),
        };

        imported.employee = findEmployeeBySecullumName(
          data.employees,
          imported.employeeName,
        );
        const existing =
          imported.employee && imported.date
            ? timeRecordByEmployeeDate.get(
              `${imported.employee.id}:${imported.date}`,
            )
            : undefined;
        imported.hasManualRecord = recordHasManualPoint(existing);
        imported.warning = buildSecullumWarning(imported);

        return imported;
      })
      .filter(
        (row) =>
          row.employeeName &&
          row.date &&
          normalizeSecullumKey(row.employeeName) !== "NOME",
      );

    const dateError = buildSecullumDateError(importedRows);
    const rowsWithStatus = importedRows.map((row) => ({
      ...row,
      blockedReason: dateError
        ? "Data divergente"
        : row.hasManualRecord
          ? "Já possui ponto manual no sistema"
          : "",
    }));

    setSecullumRows(rowsWithStatus);
    setSecullumImportError(dateError);
  }

  function confirmImportSecullumRows() {
    if (secullumImportError) {
      window.alert(secullumImportError);
      return;
    }

    const importableRows = secullumRows.filter(
      (row) =>
        row.employee &&
        row.date &&
        !row.hasManualRecord &&
        row.date === filters.date,
    );
    const manualRows = secullumRows.filter(
      (row) => row.employee && row.date && row.hasManualRecord,
    );
    const ignoredRows = secullumRows.filter(
      (row) => !row.employee || !row.date,
    );

    if (!importableRows.length) {
      window.alert(
        "Nenhuma linha disponível para importar. Os registros encontrados já possuem lançamento manual, não têm funcionário correspondente ou estão sem data válida.",
      );
      return;
    }

    askConfirmation({
      title: "Preencher com dados do Secullum",
      message: `Foram encontradas ${importableRows.length} linha(s) sem lançamento manual. Deseja preencher automaticamente com os dados da planilha do Secullum? ${manualRows.length ? `${manualRows.length} linha(s) com ponto manual serão preservadas e não serão alteradas. ` : ""}${ignoredRows.length ? `${ignoredRows.length} linha(s) sem vínculo/data serão ignoradas.` : ""}`,
      confirmLabel: "Preencher automaticamente",
      variant: "primary",
      onConfirm: async () => {
        await importSecullumRows(importableRows);
      },
    });
  }

  async function importSecullumRows(rowsToImport?: SecullumImportRow[]) {
    const validRows = (rowsToImport || secullumRows).filter(
      (row) =>
        row.employee &&
        row.date &&
        !row.hasManualRecord &&
        row.date === filters.date,
    );

    setBusy(true);

    try {
      const obsoleteIds = new Set(cachedDuplicateTimeRecordIds(filters.date));
      const recordsToImport = validRows.map((row) => {
        const employee = row.employee as Employee;

        const existing = timeRecordByEmployeeDate.get(
          `${employee.id}:${row.date}`,
        );

        const hasImportedPunch = Boolean(
          row.ent1 ||
          row.sai1 ||
          row.ent2 ||
          row.sai2 ||
          row.ent3 ||
          row.sai3,
        );
        const importedDateIsHoliday = isHoliday(
          row.date,
          calculationSettings,
        );
        const scheduleDefaults = scheduleDefaultsForDate(
          employee,
          row.date,
          calculationSettings,
        );
        const secullumFields = {
          ent2:
            row.ent2 ||
            (hasImportedPunch
              ? scheduleDefaults.lunchReturn || ""
              : ""),
          sai2:
            row.sai2 ||
            (hasImportedPunch
              ? scheduleDefaults.end || ""
              : ""),
          ent3: row.ent3,
          sai3: row.sai3,
        };
        const calculated = calculateSecullumMetrics(
          row.ent1,
          row.sai1 ||
          (row.ent1 ? scheduleDefaults.lunchOut : ""),
          secullumFields,
          calculationSettings,
          row.date,
          employee,
        );
        const overtimePercent = overtimeRateForDate(
          row.date,
          calculationSettings,
        );
        const overtimeHours = calculated.overtimeHours;
        const baseHourValue = Number(employee.salary || 0) / 220;
        const expectedWorkMinutes = normalLimitMinutesForEmployeeDate(
          employee,
          row.date,
          calculationSettings,
        );
        const importedStatus: AttendanceStatus =
          !hasImportedPunch &&
            (importedDateIsHoliday || expectedWorkMinutes <= 0)
            ? "day_off"
            : hasImportedPunch
              ? "present"
              : "absence_pending";

        const record: TimeRecord = {
          id: timeRecordDocumentId(row.date, employee.id),
          companyId: employee.companyId,
          employeeId: employee.id,
          date: row.date,
          status: importedStatus,
          source: "seculum",
          functionName: employee.role || employee.position || "",
          realTeamId: employee.teamId || "",
          dayTeamId: existing?.dayTeamId ?? employee.teamId ?? "",
          checkIn: row.ent1,
          checkOut:
            row.sai1 ||
            (row.ent1 ? scheduleDefaults.lunchOut : ""),
          usefulHours: calculated.usefulHours,
          baseHours: calculated.baseHours,
          intervalHours: toFixed2(calculationSettings.intervalMinutes / 60),
          overtimePercent,
          overtimeHours,
          overtimeAmount: toFixed2(
            overtimeHours * baseHourValue * (1 + overtimePercent / 100),
          ),
          cid: existing?.cid || "",
          absenceCount:
            importedStatus === "absence_pending" && !hasImportedPunch && expectedWorkMinutes > 0
              ? 1
              : calculated.absenceCount,
          notes: existing?.notes || "",
          customFields: removeUndefinedFields({
            ...(existing?.customFields || {}),
            ent2: secullumFields.ent2 || "",
            sai2: secullumFields.sai2 || "",
            ent3: row.ent3 || "",
            sai3: row.sai3 || "",
            normais: calculated.normais || "00:00",
            faltas: calculated.faltas || "00:00",
            extras: calculated.extras || "00:00",
            carga: calculated.carga || "00:00",
            secullumFileName: secullumFileName || "",
            secullumImportedAt: new Date().toISOString(),
            secullumWarning: row.warning || "",
          }),
          updatedAt: new Date().toISOString(),
        };

        if (existing?.id && existing.id !== record.id) obsoleteIds.add(existing.id);
        return sanitizeTimeRecord(record);
      });

      await data.saveTimekeepingDayRecords(recordsToImport, Array.from(obsoleteIds));

      setSecullumModalOpen(false);
      setSecullumRows([]);
      setSecullumFileName("");
      setSecullumImportError("");
    } finally {
      setBusy(false);
    }
  }

  function displayRecordForDate(employee: Employee, date: string) {
    if (date === filters.date) {
      const cached = displayRecordByEmployeeId.get(employee.id);
      if (cached) return cached;
    }

    return createDisplayRecord(
      employee,
      date,
      employeeRecord(employee.id, date),
      calculationSettings,
    );
  }

  function exportCellValue(
    employee: Employee,
    record: TimeRecord,
    column: ColumnDescriptor,
  ) {
    if (column.type === "system") return systemValue(employee, record, column);
    if (column.key === "checkIn") return record.checkIn || "00:00";
    if (column.key === "checkOut") return record.checkOut || "00:00";
    if (column.key === "overtimePercent")
      return Number(record.overtimePercent || 0);
    if (column.key === "status") return statusDisplayText(record.status);
    if (column.key === "cid") return record.cid || "";
    if (column.key === "dayTeamId")
      return teamName(record.dayTeamId || employee.teamId);
    if (["normais", "faltas", "extras", "carga"].includes(column.key))
      return record.customFields?.[column.key] || "00:00";
    if (["ent2", "sai2", "ent3", "sai3"].includes(column.key))
      return record.customFields?.[column.key] || "00:00";

    if ("id" in column) return customColumnValue(employee, record, column);
    return "";
  }

  function sortableCellValue(
    employee: Employee,
    date: string,
    column: ColumnDescriptor,
  ) {
    const record = displayRecordForDate(employee, date);
    const value = exportCellValue(employee, record, column);
    return typeof value === "number"
      ? value
      : String(value || "").toLowerCase();
  }

  function sortEmployeesForDate(list: Employee[], date: string) {
    if (!sortConfig) return list;
    const column = columnByKey.get(sortConfig.key);
    if (!column) return list;
    const direction = sortConfig.direction === "asc" ? 1 : -1;
    const sortValueByEmployeeId = new Map(
      list.map((employee) => [
        employee.id,
        sortableCellValue(employee, date, column),
      ]),
    );

    return [...list].sort((a, b) => {
      const aValue = sortValueByEmployeeId.get(a.id) ?? "";
      const bValue = sortValueByEmployeeId.get(b.id) ?? "";
      if (typeof aValue === "number" && typeof bValue === "number")
        return (aValue - bValue) * direction;
      return compareText(String(aValue), String(bValue)) * direction;
    });
  }

  function toggleSort(columnKey: string) {
    setCurrentPage(1);
    setSortConfig((current) => {
      if (!current || current.key !== columnKey)
        return { key: columnKey, direction: "asc" };
      if (current.direction === "asc")
        return { key: columnKey, direction: "desc" };
      return null;
    });
  }

  function toggleColumnFilterMenu(columnKey: string, trigger: HTMLElement) {
    setOpenColumnFilter((current) => {
      if (current === columnKey) {
        setColumnFilterMenuPosition(null);
        return null;
      }

      setColumnFilterMenuPosition(columnFilterMenuPositionFromTrigger(trigger));
      return columnKey;
    });
  }

  function columnFilterValue(
    employee: Employee,
    date: string,
    column: ColumnDescriptor,
  ) {
    const record = displayRecordForDate(employee, date);
    const value = exportCellValue(employee, record, column);
    return String(value ?? "").trim();
  }

  function filterEmployeesByTableColumns(list: Employee[], date: string) {
    const activeFilters = Object.entries(columnFilters)
      .map(([columnKey, filter]) => ({
        column: columnByKey.get(columnKey),
        filter,
        searchText: normalizeSearch(filter.search),
      }))
      .filter(
        (entry) =>
          entry.column &&
          (entry.searchText || entry.filter.selected.length),
      );
    if (!activeFilters.length) return list;

    return list.filter((employee) =>
      activeFilters.every(({ column, filter, searchText }) => {
        if (!column) return true;
        const value = columnFilterValue(employee, date, column);
        const normalizedValue = normalizeSearch(value);
        const matchesSearch =
          !searchText || normalizedValue.includes(searchText);
        const matchesSelected =
          !filter.selected.length || filter.selected.includes(value);
        return matchesSearch && matchesSelected;
      }),
    );
  }

  function columnFilterOptions(column: ColumnDescriptor) {
    const values = employees.map((employee) =>
      columnFilterValue(employee, filters.date, column),
    );
    return Array.from(new Set(values)).sort(compareText);
  }

  function updateColumnFilter(
    columnKey: string,
    patch: Partial<ColumnFilterConfig>,
  ) {
    setColumnFilters((current) => {
      const previousFilter: ColumnFilterConfig = current[columnKey] || {
        search: "",
        selected: [],
      };
      const nextFilter: ColumnFilterConfig = { ...previousFilter, ...patch };
      const next = { ...current };
      if (!nextFilter.search.trim() && !nextFilter.selected.length) {
        delete next[columnKey];
      } else {
        next[columnKey] = nextFilter;
      }
      return next;
    });
  }

  function toggleColumnFilterValue(column: ColumnDescriptor, value: string) {
    const currentFilter = columnFilters[column.key] || {
      search: "",
      selected: [],
    };
    const options = columnFilterOptions(column);
    const currentSelected = currentFilter.selected.length
      ? currentFilter.selected.filter(
        (item) => item !== noColumnFilterSelectionKey,
      )
      : options;
    const selected = currentSelected.includes(value)
      ? currentSelected.filter((item) => item !== value)
      : [...currentSelected, value];
    updateColumnFilter(column.key, {
      selected:
        selected.length === options.length
          ? []
          : selected.length
            ? selected
            : [noColumnFilterSelectionKey],
    });
  }

  function selectAllColumnFilterValues(column: ColumnDescriptor) {
    updateColumnFilter(column.key, { selected: [] });
  }

  function deselectAllColumnFilterValues(column: ColumnDescriptor) {
    updateColumnFilter(column.key, { selected: [noColumnFilterSelectionKey] });
  }

  function clearColumnFilter(columnKey: string) {
    setColumnFilters((current) => {
      const next = { ...current };
      delete next[columnKey];
      return next;
    });
  }

  function clearAllColumnFilters() {
    setColumnFilters({});
    setOpenColumnFilter(null);
    setColumnFilterMenuPosition(null);
  }

  function reportColumnsForSelection() {
    const selected = new Set(selectedReportColumnKeys);
    return columns.filter((column) => selected.has(column.key));
  }

  function toggleReportColumn(columnKey: string) {
    setReportColumnKeys((current) => {
      const availableKeys = reportColumnOptions.map((column) => column.key);
      const selected = new Set(sanitizeColumnSelection(current, availableKeys));
      if (selected.has(columnKey)) selected.delete(columnKey);
      else selected.add(columnKey);
      return availableKeys.filter((key) => selected.has(key));
    });
  }

  function selectAllReportColumns() {
    setReportColumnKeys(reportColumnOptions.map((column) => column.key));
  }

  function clearReportColumns() {
    setReportColumnKeys([]);
  }

  function moveColumnByDrag(sourceKey: string, targetKey: string) {
    if (!sourceKey || !targetKey || sourceKey === targetKey) return;
    const keys = columns.map((column) => column.key);
    const sourceIndex = keys.indexOf(sourceKey);
    const targetIndex = keys.indexOf(targetKey);
    if (sourceIndex < 0 || targetIndex < 0) return;

    const next = [...keys];
    const [removed] = next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, removed);
    setColumnOrder(next);
  }

  function reportColumnKind(column: ColumnDescriptor): "date" | "name" | "team" | "time" | "metric" | "status" | "text" {
    if (column.key === "employee") return "name";
    if (column.key === "realTeamId" || column.key === "dayTeamId") return "team";
    if (["checkIn", "checkOut", "ent2", "sai2", "ent3", "sai3"].includes(column.key)) return "time";
    if (["normais", "faltas", "extras", "carga", "usefulHours", "overtimeHours", "overtimePercent"].includes(column.key)) return "metric";
    if (column.key === "status") return "status";
    return "text";
  }

  function reportColumnWidth(column: ColumnDescriptor) {
    const width = "width" in column && column.width ? column.width : defaultColumnWidth;
    return Math.max(10, Math.min(34, Math.round(width / 14)));
  }

  function reportCellValue(employee: Employee, record: TimeRecord, column: ColumnDescriptor) {
    const value = exportCellValue(employee, record, column);
    if (typeof value === "number") return value;
    return String(value || "");
  }

  async function exportReport() {
    if (reportFormat === "pdf") {
      await exportPdfReport();
      return;
    }
    await exportExcelReport();
  }

  async function exportExcelReport() {
    if (!reportStartDate || !reportEndDate) return;
    if (reportStartDate > reportEndDate) {
      window.alert("A data inicial não pode ser maior que a data final.");
      return;
    }

    const dates = dateRange(reportStartDate, reportEndDate);
    if (!dates.length) return;
    if (!employees.length) {
      window.alert("Nenhum funcionário encontrado para os filtros atuais.");
      return;
    }

    const selectedColumns = reportColumnsForSelection();
    if (!selectedColumns.length) {
      window.alert("Selecione pelo menos uma coluna para o relatório.");
      return;
    }

    const [reportRecords, XLSX] = await Promise.all([
      loadTimeRecordsRange(reportStartDate, reportEndDate),
      loadXlsxModule(),
    ]);
    const reportRecordMap = new Map(
      reportRecords.map((record) => [
        `${record.employeeId}:${record.date}`,
        record,
      ]),
    );
    const displayReportRecordForDate = (employee: Employee, date: string) =>
      createDisplayRecord(
        employee,
        date,
        reportRecordMap.get(`${employee.id}:${date}`),
        calculationSettings,
      );

    const workbook = XLSX.utils.book_new();
    const emittedAt = new Date();
    const emittedAtText = `${emittedAt.toLocaleDateString("pt-BR")} ${emittedAt.toLocaleTimeString("pt-BR", { hour12: false })}`;
    const periodText = `${formatDateForDisplay(reportStartDate)} até ${formatDateForDisplay(reportEndDate)}`;

    type PontoDiarioColumn = {
      key: string;
      label: string;
      width: number;
      value: (
        employee: Employee,
        record: TimeRecord,
        date: string,
      ) => string | number;
      kind?: "date" | "name" | "team" | "time" | "metric" | "status" | "text";
    };

    const reportColumns: PontoDiarioColumn[] = selectedColumns.map((column) => ({
      key: column.key,
      label: column.label,
      width: reportColumnWidth(column),
      value: (employee, record, _date) =>
        reportCellValue(employee, record, column),
      kind: reportColumnKind(column),
    }));

    const maxColumn = Math.max(0, reportColumns.length - 1);
    const columnWidths = reportColumns.map((column) => column.width);

    function hexToRgb(value: string, fallback: string) {
      const normalized = String(value || "").replace(/[^0-9a-f]/gi, "");
      if (normalized.length === 3) {
        return normalized
          .split("")
          .map((char) => char + char)
          .join("")
          .toUpperCase();
      }
      if (normalized.length === 6) return normalized.toUpperCase();
      return fallback;
    }

    const deepBlue = "0A3E91";
    const lightBorder = "D6DEEB";
    const mutedText = "38506F";
    const pageBg = "F8FAFD";
    const stripeBg = "F2F5FA";

    const titleStyle = {
      font: { bold: true, sz: 22, name: "Arial", color: { rgb: deepBlue } },
      alignment: { horizontal: "left", vertical: "center" },
      fill: { patternType: "solid", fgColor: { rgb: "FFFFFF" } },
    };
    const infoValueStyle = {
      font: { sz: 10, name: "Arial", bold: true, color: { rgb: "1F2D3D" } },
      alignment: { horizontal: "left", vertical: "center" },
      fill: { patternType: "solid", fgColor: { rgb: "FFFFFF" } },
      border: {
        top: { style: "thin", color: { rgb: lightBorder } },
        bottom: { style: "thin", color: { rgb: lightBorder } },
        left: { style: "thin", color: { rgb: lightBorder } },
        right: { style: "thin", color: { rgb: lightBorder } },
      },
    };
    const headerStyle = {
      font: { bold: true, sz: 10, name: "Arial", color: { rgb: "FFFFFF" } },
      alignment: { horizontal: "center", vertical: "center", wrapText: true },
      fill: { patternType: "solid", fgColor: { rgb: deepBlue } },
      border: {
        top: { style: "thin", color: { rgb: "C9D4E4" } },
        bottom: { style: "thin", color: { rgb: "C9D4E4" } },
        left: { style: "thin", color: { rgb: "C9D4E4" } },
        right: { style: "thin", color: { rgb: "C9D4E4" } },
      },
    };

    function buildBodyStyle(horizontal: "left" | "center", fillColor: string) {
      return {
        font: { sz: 9, name: "Arial", color: { rgb: mutedText } },
        alignment: { horizontal, vertical: "center", wrapText: false },
        fill: { patternType: "solid", fgColor: { rgb: fillColor } },
        border: {
          top: { style: "thin", color: { rgb: lightBorder } },
          bottom: { style: "thin", color: { rgb: lightBorder } },
          left: { style: "thin", color: { rgb: lightBorder } },
          right: { style: "thin", color: { rgb: lightBorder } },
        },
      };
    }

    function buildStatusStyle(
      condition: StatusCondition | undefined,
      fillColor: string,
    ) {
      if (!condition) {
        return {
          ...buildBodyStyle("center", fillColor),
          font: { bold: true, sz: 9, name: "Arial", color: { rgb: mutedText } },
        };
      }
      return {
        font: {
          bold: true,
          sz: 9,
          name: "Arial",
          color: { rgb: hexToRgb(condition.textColor, mutedText) },
        },
        alignment: { horizontal: "center", vertical: "center", wrapText: true },
        fill: {
          patternType: "solid",
          fgColor: { rgb: hexToRgb(condition.rowColor, fillColor) },
        },
        border: {
          top: {
            style: "thin",
            color: { rgb: hexToRgb(condition.textColor, lightBorder) },
          },
          bottom: {
            style: "thin",
            color: { rgb: hexToRgb(condition.textColor, lightBorder) },
          },
          left: {
            style: "thin",
            color: { rgb: hexToRgb(condition.textColor, lightBorder) },
          },
          right: {
            style: "thin",
            color: { rgb: hexToRgb(condition.textColor, lightBorder) },
          },
        },
      };
    }

    const footerCenterStyle = {
      font: { sz: 9, name: "Arial", color: { rgb: "3F5F8A" }, bold: true },
      alignment: { horizontal: "center", vertical: "center" },
      border: {
        top: { style: "thin", color: { rgb: lightBorder } },
        bottom: { style: "thin", color: { rgb: lightBorder } },
      },
    };

    function setCell(
      worksheet: XLSXTypes.WorkSheet,
      row: number,
      col: number,
      value: string | number,
      style?: object,
    ) {
      const address = XLSX.utils.encode_cell({ r: row, c: col });
      worksheet[address] = {
        t: typeof value === "number" ? "n" : "s",
        v: value,
      } as XLSXTypes.CellObject;
      if (style)
        (worksheet[address] as XLSXTypes.CellObject & { s?: object }).s = style;
    }

    function addMerge(
      worksheet: XLSXTypes.WorkSheet,
      row: number,
      firstCol: number,
      lastCol: number,
    ) {
      if (lastCol <= firstCol) return;
      worksheet["!merges"] = worksheet["!merges"] || [];
      worksheet["!merges"]!.push({
        s: { r: row, c: firstCol },
        e: { r: row, c: lastCol },
      });
    }

    function paintMerge(
      worksheet: XLSXTypes.WorkSheet,
      row: number,
      firstCol: number,
      lastCol: number,
      value: string | number,
      style?: object,
    ) {
      addMerge(worksheet, row, firstCol, lastCol);
      for (let col = firstCol; col <= lastCol; col += 1)
        setCell(worksheet, row, col, col === firstCol ? value : "", style);
    }

    function buildDailyWorksheet(date: string) {
      const worksheet: XLSXTypes.WorkSheet = {};
      const employeesForDate = sortEmployeesForDate(employees, date);
      const headerRow = 5;
      const firstDataRow = 6;
      const footerRow = firstDataRow + employeesForDate.length + 1;

      worksheet["!cols"] = columnWidths.map((wch) => ({ wch }));
      worksheet["!rows"] = [];
      worksheet["!merges"] = [];

      worksheet["!rows"]![0] = { hpt: 24 };
      worksheet["!rows"]![1] = { hpt: 17 };
      worksheet["!rows"]![2] = { hpt: 17 };
      worksheet["!rows"]![3] = { hpt: 17 };
      worksheet["!rows"]![4] = { hpt: 5 };
      worksheet["!rows"]![headerRow] = { hpt: 18 };

      paintMerge(worksheet, 0, 0, maxColumn, "PONTO DIÁRIO", titleStyle);
      paintMerge(
        worksheet,
        1,
        0,
        maxColumn,
        `Período: ${periodText}`,
        infoValueStyle,
      );
      paintMerge(
        worksheet,
        2,
        0,
        maxColumn,
        `Dia de referência: ${dayReferenceText(date)}`,
        infoValueStyle,
      );
      paintMerge(
        worksheet,
        3,
        0,
        maxColumn,
        "Relatório diário de ponto com as colunas escolhidas no sistema.",
        {
          font: {
            sz: 8,
            name: "Arial",
            color: { rgb: "6881A6" },
            italic: true,
          },
          alignment: { horizontal: "left", vertical: "center" },
          fill: { patternType: "solid", fgColor: { rgb: pageBg } },
        },
      );

      reportColumns.forEach((column, columnIndex) => {
        setCell(worksheet, headerRow, columnIndex, column.label, headerStyle);
      });

      employeesForDate.forEach((employee, employeeIndex) => {
        const row = firstDataRow + employeeIndex;
        const record = displayReportRecordForDate(employee, date);
        const rowFill = employeeIndex % 2 === 0 ? "FFFFFF" : stripeBg;
        worksheet["!rows"]![row] = { hpt: 17 };

        reportColumns.forEach((column, columnIndex) => {
          const value = column.value(employee, record, date) || "";
          const condition =
            column.kind === "status"
              ? statusConditionFor(record.status)
              : undefined;
          const style =
            column.kind === "name"
              ? buildBodyStyle("left", rowFill)
              : column.kind === "status"
                ? buildStatusStyle(condition, rowFill)
                : buildBodyStyle("center", rowFill);
          setCell(worksheet, row, columnIndex, value, style);
        });
      });

      paintMerge(
        worksheet,
        footerRow,
        0,
        maxColumn,
        `Emitido em: ${emittedAtText}`,
        footerCenterStyle,
      );

      const lastRow = footerRow + 1;
      worksheet["!ref"] = XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: lastRow - 1, c: maxColumn },
      });
      worksheet["!margins"] = {
        left: 0.2,
        right: 0.2,
        top: 0.2,
        bottom: 0.2,
        header: 0.1,
        footer: 0.1,
      };
      worksheet["!pageSetup"] = {
        orientation: "landscape",
        paperSize: 9,
        fitToWidth: 1,
        fitToHeight: 0,
      } as any;
      worksheet["!freeze"] = { xSplit: 0, ySplit: firstDataRow } as any;
      return worksheet;
    }

    dates.forEach((date, index) => {
      const worksheet = buildDailyWorksheet(date);
      const sheetName =
        dates.length === 1
          ? "Ponto"
          : safeSheetName(
            `${String(index + 1).padStart(2, "0")} ${formatDateForDisplay(date).replace(/\//g, "-")}`,
          );
      XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
    });

    const fileName =
      dates.length === 1
        ? `Ponto Diário ${formatDateForDisplay(reportStartDate).replace(/\//g, "-")}.xlsx`
        : `Ponto Diário ${formatDateForDisplay(reportStartDate).replace(/\//g, "-")} a ${formatDateForDisplay(reportEndDate).replace(/\//g, "-")}.xlsx`;
    XLSX.writeFile(workbook, fileName, {
      bookType: "xlsx",
      cellStyles: true,
    } as XLSXTypes.WritingOptions);
    setReportModalOpen(false);
  }

  async function exportPdfReport() {
    if (!reportStartDate || !reportEndDate) return;
    if (reportStartDate > reportEndDate) {
      window.alert("A data inicial não pode ser maior que a data final.");
      return;
    }

    const dates = dateRange(reportStartDate, reportEndDate);
    if (!dates.length) return;
    if (!employees.length) {
      window.alert("Nenhum funcionário encontrado para os filtros atuais.");
      return;
    }

    const selectedColumns = reportColumnsForSelection();
    if (!selectedColumns.length) {
      window.alert("Selecione pelo menos uma coluna para o relatório.");
      return;
    }

    const reportRecords = await loadTimeRecordsRange(
      reportStartDate,
      reportEndDate,
    );
    const reportRecordMap = new Map(
      reportRecords.map((record) => [
        `${record.employeeId}:${record.date}`,
        record,
      ]),
    );
    const periodText = `${formatDateForDisplay(reportStartDate)} até ${formatDateForDisplay(reportEndDate)}`;
    const emittedAt = new Date();
    const emittedAtText = `${emittedAt.toLocaleDateString("pt-BR")} ${emittedAt.toLocaleTimeString("pt-BR", { hour12: false })}`;
    const fontSize = selectedColumns.length > 14 ? 8 : 9;
    const columnHeaders = selectedColumns
      .map((column) => `<th>${escapeHtml(column.label)}</th>`)
      .join("");

    const sections = dates
      .map((date) => {
        const rows = sortEmployeesForDate(employees, date)
          .map((employee) => {
            const record = createDisplayRecord(
              employee,
              date,
              reportRecordMap.get(`${employee.id}:${date}`),
              calculationSettings,
            );
            const cells = selectedColumns
              .map(
                (column) =>
                  `<td>${escapeHtml(reportCellValue(employee, record, column))}</td>`,
              )
              .join("");
            return `<tr>${cells}</tr>`;
          })
          .join("");

        return `
          <section class="report-day">
            <header>
              <h2>${escapeHtml(formatDateForDisplay(date))}</h2>
              <span>${escapeHtml(dayReferenceText(date))}</span>
            </header>
            <table>
              <thead><tr>${columnHeaders}</tr></thead>
              <tbody>
                ${rows ||
          `<tr><td colspan="${selectedColumns.length}">Nenhum funcionário encontrado.</td></tr>`
          }
              </tbody>
            </table>
          </section>
        `;
      })
      .join("");

    const reportWindow = window.open("", "_blank");
    if (!reportWindow) {
      window.alert("Não foi possível abrir a janela de impressão do PDF.");
      return;
    }

    reportWindow.document.write(`
      <!doctype html>
      <html lang="pt-BR">
        <head>
          <meta charset="utf-8" />
          <title>Relatório de ponto</title>
          <style>
            @page { size: A4 landscape; margin: 10mm; }
            * { box-sizing: border-box; }
            body {
              margin: 0;
              color: #172033;
              font-family: Arial, Helvetica, sans-serif;
              font-size: ${fontSize}px;
            }
            .report-title {
              align-items: flex-end;
              border-bottom: 2px solid #0a3e91;
              display: flex;
              justify-content: space-between;
              margin-bottom: 12px;
              padding-bottom: 8px;
            }
            h1 {
              color: #0a3e91;
              font-size: 20px;
              margin: 0;
            }
            .report-meta {
              color: #38506f;
              text-align: right;
            }
            .report-day {
              break-after: page;
              page-break-after: always;
            }
            .report-day:last-child {
              break-after: auto;
              page-break-after: auto;
            }
            .report-day header {
              align-items: baseline;
              display: flex;
              gap: 12px;
              margin: 0 0 8px;
            }
            h2 {
              font-size: 14px;
              margin: 0;
            }
            table {
              border-collapse: collapse;
              table-layout: auto;
              width: 100%;
            }
            th,
            td {
              border: 1px solid #d6deeb;
              padding: 5px 6px;
              text-align: center;
              vertical-align: middle;
              word-break: normal;
            }
            th {
              background: #0a3e91;
              color: #fff;
              font-weight: 700;
            }
            td {
              color: #38506f;
            }
            tbody tr:nth-child(even) td {
              background: #f2f5fa;
            }
            td:first-child {
              text-align: left;
            }
          </style>
        </head>
        <body>
          <div class="report-title">
            <div>
              <h1>Relatório de ponto</h1>
              <div>Período: ${escapeHtml(periodText)}</div>
            </div>
            <div class="report-meta">
              <div>Emitido em: ${escapeHtml(emittedAtText)}</div>
              <div>${selectedColumns.length} colunas selecionadas</div>
            </div>
          </div>
          ${sections}
        </body>
      </html>
    `);
    reportWindow.document.close();
    reportWindow.focus();
    reportWindow.setTimeout(() => reportWindow.print(), 250);
    setReportModalOpen(false);
  }

  function renderHeader(column: ColumnDescriptor) {
    const width =
      "width" in column && column.width ? column.width : defaultColumnWidth;
    const isCustom = "id" in column;
    const sortIndicator =
      sortConfig?.key === column.key
        ? sortConfig.direction === "asc"
          ? "A-Z ↑"
          : "Z-A ↓"
        : "↕";
    const filter = columnFilters[column.key] || { search: "", selected: [] };
    const isFilterOpen = openColumnFilter === column.key;
    const normalizedFilterSearch = normalizeSearch(filter.search);
    const options = isFilterOpen ? columnFilterOptions(column) : [];
    const visibleOptions = normalizedFilterSearch
      ? options.filter((value) =>
        normalizeSearch(value || "(vazio)").includes(normalizedFilterSearch),
      )
      : options;
    const isFiltered = Boolean(filter.search.trim() || filter.selected.length);

    return (
      <th
        key={column.key}
        draggable
        onDragStart={(event) => {
          setDraggedColumnKey(column.key);
          event.dataTransfer.effectAllowed = "move";
          event.dataTransfer.setData("text/plain", column.key);
        }}
        onDragOver={(event) => {
          event.preventDefault();
          event.dataTransfer.dropEffect = "move";
        }}
        onDrop={(event) => {
          event.preventDefault();
          const sourceKey =
            event.dataTransfer.getData("text/plain") || draggedColumnKey || "";
          moveColumnByDrag(sourceKey, column.key);
          setDraggedColumnKey(null);
        }}
        onDragEnd={() => setDraggedColumnKey(null)}
        style={{
          minWidth: width,
          width,
          position: "relative",
          cursor: "grab",
          opacity: draggedColumnKey === column.key ? 0.65 : undefined,
        }}
      >
        <div
          className="benefit-column-header"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
          }}
        >
          <button
            className="benefit-column-name"
            type="button"
            title={`Ordenar ${column.label}`}
            onClick={() => toggleSort(column.key)}
            style={{
              background: "transparent",
              border: 0,
              padding: 0,
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              font: "inherit",
              color: "inherit",
            }}
          >
            <GripVertical size={14} aria-hidden="true" />
            <span>{column.label}</span>
            <small className="muted">{sortIndicator}</small>
          </button>
          <button
            className="column-filter-trigger"
            type="button"
            title={`Filtrar ${column.label}`}
            aria-label={`Filtrar ${column.label}`}
            onClick={(event) => {
              event.stopPropagation();
              toggleColumnFilterMenu(column.key, event.currentTarget);
            }}
            style={{
              border: isFiltered ? "1px solid #0f766e" : "1px solid #d5dfec",
              background: isFiltered ? "#e8f7f3" : "#fff",
              borderRadius: 6,
              padding: 4,
              cursor: "pointer",
              color: isFiltered ? "#0f766e" : "inherit",
            }}
          >
            <Search size={14} />
          </button>
          {isCustom && column.type === "formula" && column.formula ? (
            <small className="benefit-column-formula">= {column.formula}</small>
          ) : null}
          {isCustom ? (
            <button
              disabled={busy}
              type="button"
              className="column-menu-trigger"
              onClick={() =>
                setOpenColumnMenu(
                  openColumnMenu === column.id ? null : column.id,
                )
              }
              aria-label={`Ações da coluna ${column.label}`}
            >
              <MoreVertical size={16} />
            </button>
          ) : null}
          {isCustom && openColumnMenu === column.id ? (
            <div className="column-action-menu">
              {canEditTimekeeping ? (
                <>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => openEditColumn(column)}
                  >
                    Editar coluna
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => toggleColumnWrap(column)}
                  >
                    {column.wrap ? "Desativar" : "Ativar"} quebra de texto
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => resizeColumn(column, 40)}
                  >
                    Aumentar largura
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => resizeColumn(column, -40)}
                  >
                    Diminuir largura
                  </button>
                </>
              ) : null}
              {canDeleteTimekeeping ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => deleteColumn(column)}
                >
                  Excluir coluna
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        {isFilterOpen && columnFilterMenuPosition && typeof document !== "undefined" ? createPortal((
          <div
            className="column-filter-menu"
            ref={columnFilterMenuRef}
            onClick={(event) => event.stopPropagation()}
            style={{
              position: "fixed",
              zIndex: 55,
              top: columnFilterMenuPosition.top,
              left: columnFilterMenuPosition.left,
              width: columnFilterMenuWidth,
              maxWidth: `calc(100vw - ${columnFilterMenuMargin * 2}px)`,
              background: "#fff",
              border: "1px solid #d5dfec",
              borderRadius: 10,
              boxShadow: "0 14px 35px rgba(15, 23, 42, 0.18)",
              padding: 12,
              color: "#172033",
              textAlign: "left",
            }}
          >
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button
                className="btn btn-secondary"
                type="button"
                style={{ padding: "6px 8px", fontSize: 12 }}
                onClick={() => toggleSort(column.key)}
              >
                Ordenar
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                style={{ padding: "6px 8px", fontSize: 12 }}
                onClick={() => clearColumnFilter(column.key)}
              >
                Limpar
              </button>
            </div>
            <input
              className="table-input"
              type="search"
              placeholder="Pesquisar nesta coluna..."
              value={filter.search}
              onChange={(event) =>
                updateColumnFilter(column.key, { search: event.target.value })
              }
              style={{ width: "100%", marginBottom: 8 }}
            />
            <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <button
                className="btn btn-secondary"
                type="button"
                style={{ padding: "5px 8px", fontSize: 12 }}
                onClick={() => selectAllColumnFilterValues(column)}
              >
                Marcar tudo
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                style={{ padding: "5px 8px", fontSize: 12 }}
                onClick={() => deselectAllColumnFilterValues(column)}
              >
                Desmarcar
              </button>
            </div>
            <div
              style={{
                maxHeight: columnFilterMenuPosition.listMaxHeight,
                overflow: "auto",
                border: "1px solid #edf2f7",
                borderRadius: 8,
                padding: 6,
              }}
            >
              {visibleOptions.length ? (
                visibleOptions.map((value) => (
                  <label
                    key={`${column.key}-${value || "empty"}`}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "5px 4px",
                      fontSize: 12,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={
                        !filter.selected.length ||
                        filter.selected.includes(value)
                      }
                      onChange={() => toggleColumnFilterValue(column, value)}
                    />
                    <span>{value || "(vazio)"}</span>
                  </label>
                ))
              ) : (
                <div className="muted" style={{ padding: 8, fontSize: 12 }}>
                  Nenhum valor encontrado.
                </div>
              )}
            </div>
          </div>
        ), document.body) : null}
      </th>
    );
  }

  const secullumOnlyDigits = (value?: string) => (value || "").replace(/\D/g, "");

  async function fetchSecullumDay(persist: boolean) {
    const date = filters.date;
    if (!date) return;
    const seq = ++secullumSeqRef.current;
    setSecullumStatus("loading");
    setSecullumError("");
    try {
      if (!firebaseApp) throw new Error("Firebase não configurado.");
      const functions = getFunctions(firebaseApp, "southamerica-east1");
      const call = httpsCallable(functions, "obterBatidasSecullum");
      const callResp = await call({ data: date });
      // Descarta respostas obsoletas (usuário já trocou a data).
      if (seq !== secullumSeqRef.current) return;
      const rows = callResp.data as Array<Record<string, unknown>>;
      const map = new Map<string, SecullumDayRow>();
      (Array.isArray(rows) ? rows : []).forEach((row: Record<string, unknown>) => {
        const key = secullumOnlyDigits(
          String(row.cpfDigits || row.cpf || ""),
        );
        if (!key) return;
        map.set(key, {
          entrada1: String(row.entrada1 ?? ""),
          saida1: String(row.saida1 ?? ""),
          entrada2: String(row.entrada2 ?? ""),
          saida2: String(row.saida2 ?? ""),
          nome: row.nome ? String(row.nome) : undefined,
          origem: (row.origem as SecullumDayRow["origem"]) ?? undefined,
        });
      });
      setSecullumByCpf(map);
      setSecullumStatus("ok");
      const now = new Date().toISOString();
      setSecullumLastSync(now);
      if (persist && firestore) {
        try {
          await setDoc(
            doc(firestore, "secullumSync", date),
            { date, updatedAt: now, total: map.size },
            { merge: true },
          );
        } catch (persistError) {
          console.error("Falha ao registrar sync Secullum:", persistError);
        }
      }
    } catch (error) {
      if (seq !== secullumSeqRef.current) return;
      console.error("Secullum:", error);
      setSecullumError(
        error instanceof Error
          ? error.message
          : "Falha ao consultar a API do Secullum.",
      );
      setSecullumStatus("error");
    }
  }

  // Sincroniza a data pendente quando o filtro muda por fora (ex.: limpar filtros).
  useEffect(() => {
    setPendingDate(filters.date);
  }, [filters.date]);

  // Confirma descarte de edições não salvas (área de edição) antes de mudar a lista.
  function confirmDiscardDraft(): boolean {
    const n = Object.keys(draftRecordsByEmployeeId).length;
    if (n === 0) return true;
    return window.confirm(
      `Você tem ${n} registro(s) com edições ainda não enviados ao banco de dados na área de edição.\n\n` +
      `Se continuar, essas ${n} alteração(ões) serão perdidas. Deseja continuar?`,
    );
  }

  // Mantém a contagem de edições não salvas acessível aos guards de navegação.
  const draftCountRef = useRef(0);
  draftCountRef.current = Object.keys(draftRecordsByEmployeeId).length;

  // Bloqueia a saída da PÁGINA da aplicação (sidebar) e refresh/fechar do navegador
  // quando há edições não salvas. NÃO afeta a paginação da lista.
  useEffect(() => {
    setNavGuard(() => {
      const n = draftCountRef.current;
      if (n === 0) return true;
      return window.confirm(
        `Você tem ${n} registro(s) com edições não salvas no Controle de Ponto.\n\n` +
        `Se sair desta página, essas ${n} alteração(ões) serão perdidas. Deseja sair mesmo assim?`,
      );
    });
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (draftCountRef.current > 0) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", beforeUnload);
    return () => {
      setNavGuard(null);
      window.removeEventListener("beforeunload", beforeUnload);
    };
  }, []);

  // Aplica a data digitada ao filtro somente ao sair do campo / pressionar Enter
  // (digitar não deve surtir efeito na lista).
  function commitPendingDate(nextDate: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDate) || nextDate === filters.date) {
      setPendingDate(filters.date);
      return;
    }
    if (!confirmDiscardDraft()) {
      setPendingDate(filters.date);
      return;
    }
    setFilters((current) => ({ ...current, date: nextDate }));
  }

  // Carrega as batidas do Secullum automaticamente ao trocar o dia do filtro.
  useEffect(() => {
    // Limpa os dados do dia anterior para evitar exibir horários obsoletos.
    setSecullumByCpf(new Map());
    void fetchSecullumDay(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.date]);

  // Le a ultima atualizacao registrada no banco para o dia selecionado.
  useEffect(() => {
    let active = true;
    if (!firestore || !filters.date) return;
    getDoc(doc(firestore, "secullumSync", filters.date))
      .then((snap) => {
        if (active && snap.exists()) {
          const data = snap.data() as { updatedAt?: string };
          if (data.updatedAt) setSecullumLastSync(data.updatedAt);
        }
      })
      .catch(() => {
        /* ignore */
      });
    return () => {
      active = false;
    };
  }, [filters.date]);

  // Origem (código) da batida do Secullum para um campo específico do funcionário.
  function secullumOriginFor(
    employee: Employee,
    field: "entrada1" | "saida1" | "entrada2" | "saida2",
  ): { value: string; code: SecullumOriginCode } | null {
    const row = secullumByCpf.get(secullumOnlyDigits(employee.cpf));
    if (!row) return null;
    const value = String(row[field] ?? "").trim();
    if (!value) return null;
    const code = (row.origem?.[field] as SecullumOriginCode) || "secullum";
    return { value, code };
  }

  // Cor da fonte do campo editável: só colore quando o valor da Macro Ambiental
  // é igual ao valor registrado no Secullum (mesma batida). Caso contrário, preto.
  function secullumFieldColor(
    employee: Employee,
    field: "entrada1" | "saida1" | "entrada2" | "saida2",
    currentValue: string,
  ): string | undefined {
    if (secullumStatus !== "ok") return undefined;
    const origin = secullumOriginFor(employee, field);
    if (!origin) return undefined;
    const norm = (v: string) => (v || "").trim();
    if (norm(currentValue) !== norm(origin.value)) return undefined;
    return SECULLUM_ORIGIN_COLORS[origin.code];
  }

  function secullumColumnName(
    field: "entrada1" | "saida1" | "entrada2" | "saida2",
  ): string {
    return field === "entrada1"
      ? "Entrada1"
      : field === "saida1"
        ? "Saida1"
        : field === "entrada2"
          ? "Entrada2"
          : "Saida2";
  }

  const isEmptyTime = (v?: string) => {
    const t = (v || "").trim();
    return !t || t === "00:00";
  };

  // Auditoria (gravada no Firestore, NUNCA exibida na tela).
  async function writeTimekeepingAudit(entry: {
    employee: Employee;
    field: "entrada1" | "saida1" | "entrada2" | "saida2";
    previousValue?: string;
    newValue?: string;
    previousOrigin?: string;
    newOrigin?: string;
    action: string;
    result: "sucesso" | "erro";
    integratedWithSecullum?: boolean;
    secullumReturn?: string;
    errorMessage?: string;
  }) {
    if (!firestore || !user) return;
    try {
      const now = new Date();
      await addDoc(collection(firestore, "timekeepingAudit"), {
        userId: user.id,
        userName: user.name,
        userUsername: user.username,
        employeeId: entry.employee.id,
        employeeName: entry.employee.name,
        journeyDate: filters.date,
        field: entry.field,
        coluna: secullumColumnName(entry.field),
        previousValue: entry.previousValue ?? "",
        newValue: entry.newValue ?? "",
        previousOrigin: entry.previousOrigin ?? "",
        newOrigin: entry.newOrigin ?? "",
        action: entry.action,
        result: entry.result,
        integratedWithSecullum: entry.integratedWithSecullum ?? false,
        secullumReturn: entry.secullumReturn ?? "",
        errorMessage: entry.errorMessage ?? "",
        at: now.toISOString(),
        atLocal: now.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
      });
    } catch (auditError) {
      console.error("Falha ao gravar auditoria:", auditError);
    }
  }

  // Importa (Secullum → Firebase) apenas para o rascunho; persiste no "Salvar dia do mês".
  async function importSecullumField(
    employee: Employee,
    field: "entrada1" | "saida1" | "entrada2" | "saida2",
    secValue: string,
    macroValue: string,
  ) {
    if (tableLocked) return;
    const value = (secValue || "").trim() || "00:00";
    if (field === "entrada1") {
      await saveRecord(employee, { checkIn: value });
    } else if (field === "saida1") {
      await saveRecord(employee, { checkOut: value });
    } else {
      const rec = displayRecord(employee);
      const key = field === "entrada2" ? "ent2" : "sai2";
      const nextCustomFields = {
        ...(rec.customFields || {}),
        [key]: value,
        ...(key === "sai2"
          ? {
            [manualZeroSai2Field]: hasFilledTimeValue(value) ? "false" : "true",
          }
          : {}),
      };
      await saveRecord(employee, { customFields: nextCustomFields });
    }
    await writeTimekeepingAudit({
      employee,
      field,
      previousValue: macroValue,
      newValue: value,
      previousOrigin: "firebase",
      newOrigin: "secullum-importado",
      action: "importar_secullum",
      result: "sucesso",
      integratedWithSecullum: false,
    });
  }

  function requestSecullumSend(
    employee: Employee,
    field: "entrada1" | "saida1" | "entrada2" | "saida2",
    macroValue: string,
    secValue: string,
  ) {
    setSecullumSendError("");
    setSecullumSendConfirm({
      employee,
      field,
      coluna: secullumColumnName(field),
      hora: (macroValue || "").trim(),
      macroValue,
      secValue,
    });
  }

  async function confirmSecullumSend() {
    if (!secullumSendConfirm || secullumSendBusy) return;
    const { employee, field, coluna, hora, secValue } = secullumSendConfirm;
    setSecullumSendBusy(true);
    setSecullumSendError("");
    try {
      if (!firebaseApp) throw new Error("Firebase não configurado.");
      const functions = getFunctions(firebaseApp, "southamerica-east1");
      const call = httpsCallable(functions, "enviarBatidaSecullum");
      const resp = await call({
        cpf: employee.cpf,
        data: filters.date,
        coluna,
        hora,
        motivo: "Via API MACRO",
      });
      await writeTimekeepingAudit({
        employee,
        field,
        previousValue: secValue,
        newValue: hora,
        previousOrigin: secValue ? "secullum" : "",
        newOrigin: "api",
        action: "enviar_secullum",
        result: "sucesso",
        integratedWithSecullum: true,
        secullumReturn: JSON.stringify(resp.data ?? {}),
      });
      setSecullumSendConfirm(null);
      void fetchSecullumDay(false);
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : "Não foi possível registrar a jornada no Secullum.";
      setSecullumSendError(msg);
      await writeTimekeepingAudit({
        employee,
        field,
        previousValue: secValue,
        newValue: hora,
        previousOrigin: secValue ? "secullum" : "",
        newOrigin: "",
        action: "enviar_secullum",
        result: "erro",
        integratedWithSecullum: true,
        errorMessage: msg,
      });
    } finally {
      setSecullumSendBusy(false);
    }
  }

  // Botões de sincronização por campo (dentro do próprio item).
  function renderSecullumActions(
    employee: Employee,
    field: "entrada1" | "saida1" | "entrada2" | "saida2",
    macroValue: string,
  ) {
    if (secullumStatus !== "ok" || tableLocked || !canEditTimekeeping) return null;
    const origin = secullumOriginFor(employee, field);
    const secValue = origin?.value || "";
    const macroEmpty = isEmptyTime(macroValue);
    const secEmpty = isEmptyTime(secValue);
    const norm = (v: string) => (v || "").trim();
    const divergent = !macroEmpty && !secEmpty && norm(macroValue) !== norm(secValue);
    // "→ Secullum" só quando há valor no Macro E ele está diferente do Secullum
    // (Secullum vazio/"Sem ponto" ou divergente). Se já for igual, não aparece —
    // evita reenviar ao Secullum um horário idêntico ao que já está lá.
    const showEnviar = !macroEmpty && (secEmpty || divergent);
    const showImportar = (macroEmpty && !secEmpty) || divergent;
    if (!showEnviar && !showImportar) return null;
    return (
      <div style={{ display: "flex", gap: 4, marginTop: 3 }}>
        {showEnviar ? (
          <button
            type="button"
            disabled={busy}
            data-testid={`secullum-send-${field}-${employee.id}`}
            title="Registrar este horário da Macro Ambiental no Secullum (produção)"
            onClick={() => requestSecullumSend(employee, field, macroValue, secValue)}
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: "1px 6px",
              borderRadius: 6,
              border: "1px solid #1d4ed8",
              color: "#1d4ed8",
              background: "#eff6ff",
              cursor: "pointer",
            }}
          >
            → Secullum
          </button>
        ) : null}
        {showImportar ? (
          <button
            type="button"
            disabled={busy}
            data-testid={`secullum-import-${field}-${employee.id}`}
            title="Trazer o horário do Secullum para a Macro Ambiental (salva ao confirmar o dia)"
            onClick={() =>
              void importSecullumField(employee, field, secValue, macroValue)
            }
            style={{
              fontSize: 10,
              fontWeight: 700,
              padding: "1px 6px",
              borderRadius: 6,
              border: "1px solid #0f766e",
              color: "#0f766e",
              background: "#f0fdfa",
              cursor: "pointer",
            }}
          >
            ← {secValue || "Firebase"}
          </button>
        ) : null}
      </div>
    );
  }

  // Indicador de raio (⚡) somente para horários de origem "automático" do Secullum
  // que já estão refletidos no campo da Macro Ambiental.
  function renderSecullumRaio(
    employee: Employee,
    field: "entrada1" | "saida1" | "entrada2" | "saida2",
    macroValue: string,
  ) {
    if (secullumStatus !== "ok") return null;
    const origin = secullumOriginFor(employee, field);
    if (!origin || origin.code !== "automatico") return null;
    if ((macroValue || "").trim() !== (origin.value || "").trim()) return null;
    return (
      <div
        style={{ marginTop: 2, lineHeight: 0 }}
        title={SECULLUM_ORIGIN_LABELS.automatico}
        data-testid={`secullum-raio-${field}-${employee.id}`}
      >
        <Zap
          size={12}
          fill={SECULLUM_ORIGIN_COLORS.automatico}
          color={SECULLUM_ORIGIN_COLORS.automatico}
        />
      </div>
    );
  }


  function renderCell(
    employee: Employee,
    record: TimeRecord,
    column: ColumnDescriptor,
  ) {
    const width =
      "width" in column && column.width ? column.width : defaultColumnWidth;
    const wrap = "wrap" in column ? column.wrap : false;
    const tdClass = wrap ? "is-wrapped" : "is-nowrap";

    if (column.type === "system") {
      const processBadge = column.systemField === "employee"
        ? employeeProcessBadge(employee, filters.date)
        : null;
      return (
        <td
          key={column.key}
          style={{ minWidth: width, width }}
          className={tdClass}
        >
          {processBadge ? (
            <span className="timekeeping-employee-name">
              <span className="timekeeping-process-badge">{processBadge}</span>
              <span className="benefit-cell-value">
                {systemValue(employee, record, column)}
              </span>
            </span>
          ) : (
            <span className="benefit-cell-value">
              {systemValue(employee, record, column)}
            </span>
          )}
        </td>
      );
    }

    if (shouldShowStatusInsteadOfTime(column.key, record.status)) {
      const condition = statusConditionFor(record.status);
      const statusStyle = condition
        ? {
          backgroundColor: condition.rowColor,
          color: condition.textColor,
          borderColor: condition.textColor,
        }
        : undefined;

      return (
        <td key={column.key} style={{ minWidth: width, width }}>
          <span className="badge" style={statusStyle}>
            {statusDisplayText(record.status)}
          </span>
        </td>
      );
    }

    if (column.key === "checkIn") {
      return (
        <td key={column.key} style={{ minWidth: width, width }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input
              className="table-input"
              type="time"
              disabled={busy}
              data-ent1="true"
              style={{ color: secullumFieldColor(employee, "entrada1", record.checkIn || "00:00"), fontWeight: secullumFieldColor(employee, "entrada1", record.checkIn || "00:00") ? 700 : undefined }}
              value={record.checkIn || "00:00"}
              onChange={(event) =>
                void saveRecord(employee, {
                  checkIn: event.target.value || "00:00",
                })
              }
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  const inputs = Array.from(
                    document.querySelectorAll<HTMLInputElement>(
                      'input[data-ent1="true"]',
                    ),
                  );
                  const idx = inputs.indexOf(event.currentTarget);
                  const next = inputs[idx + 1];
                  if (next) {
                    next.focus();
                    next.select();
                  }
                  return;
                }
                // Tecla "P": preenche os demais campos da jornada conforme a
                // programação (escala) do funcionário no dia.
                if (event.key === "p" || event.key === "P") {
                  event.preventDefault();
                  if (busy) return;
                  const sd = scheduleDefaultsForDate(
                    employee,
                    filters.date,
                    calculationSettings,
                  );
                  const rec = displayRecord(employee);
                  void saveRecord(employee, {
                    checkOut: sd.lunchOut,
                    customFields: {
                      ...(rec.customFields || {}),
                      ent2: sd.lunchReturn,
                      sai2: sd.end,
                      [manualZeroSai2Field]: hasFilledTimeValue(sd.end)
                        ? "false"
                        : "true",
                    },
                  });
                }
                // Tecla "S": preenche a jornada com os dados do Secullum, se
                // existirem batidas para o funcionário no dia.
                if (event.key === "s" || event.key === "S") {
                  event.preventDefault();
                  if (busy) return;
                  const cpf = (employee.cpf || "").replace(/\D/g, "");
                  const row = cpf ? secullumByCpf.get(cpf) : undefined;
                  if (!row) return;
                  const rec = displayRecord(employee);
                  const cf: Record<string, string> = {
                    ...(rec.customFields || {}),
                  };
                  const patch: Partial<TimeRecord> = {};
                  if (hasFilledTimeValue(row.entrada1)) patch.checkIn = row.entrada1;
                  if (hasFilledTimeValue(row.saida1)) patch.checkOut = row.saida1;
                  if (hasFilledTimeValue(row.entrada2)) cf.ent2 = row.entrada2;
                  if (hasFilledTimeValue(row.saida2)) {
                    cf.sai2 = row.saida2;
                    cf[manualZeroSai2Field] = "false";
                  }
                  patch.customFields = cf;
                  void saveRecord(employee, patch);
                }
                // Tecla "T": atualização em LOTE pelo Secullum (ignora filtros
                // da tela). Abre modal com as diferenças reais para revisão.
                if (event.key === "t" || event.key === "T") {
                  event.preventDefault();
                  if (busy) return;
                  runSecullumBatch();
                }
              }}
            />
            <button
              className="icon-button"
              type="button"
              disabled={busy}
              title="Zerar a Entrada 1"
              aria-label="Zerar a Entrada 1"
              onClick={() => void saveRecord(employee, { checkIn: "00:00" })}
            >
              <X size={13} />
            </button>
          </div>
          {renderSecullumRaio(employee, "entrada1", record.checkIn || "00:00")}
          {renderSecullumActions(employee, "entrada1", record.checkIn || "00:00")}
        </td>
      );
    }
    if (column.key === "checkOut") {
      return (
        <td key={column.key} style={{ minWidth: width, width }}>
          <input
            className="table-input"
            type="time"
            disabled={busy}
            style={{ color: secullumFieldColor(employee, "saida1", record.checkOut || "00:00"), fontWeight: secullumFieldColor(employee, "saida1", record.checkOut || "00:00") ? 700 : undefined }}
            value={record.checkOut || "00:00"}
            onChange={(event) =>
              void saveRecord(employee, {
                checkOut: event.target.value || "00:00",
              })
            }
          />
          {renderSecullumRaio(employee, "saida1", record.checkOut || "00:00")}
          {renderSecullumActions(employee, "saida1", record.checkOut || "00:00")}
        </td>
      );
    }

    if (
      [
        "ent2",
        "sai2",
        "ent3",
        "sai3",
        "normais",
        "faltas",
        "extras",
        "carga",
      ].includes(column.key)
    ) {
      const calculated = calculateSecullumMetrics(
        record.checkIn,
        record.checkOut,
        record.customFields as Record<string, string>,
        calculationSettings,
        record.date,
        employee,
      );
      const metricFallback = "00:00";
      const value = String(
        record.customFields?.[column.key] ||
        calculated[column.key as keyof typeof calculated] ||
        metricFallback,
      );
      const isManualMetric = isCalculatedMetricKey(column.key);
      const secField =
        column.key === "ent2"
          ? ("entrada2" as const)
          : column.key === "sai2"
            ? ("saida2" as const)
            : null;
      const secColor = secField
        ? secullumFieldColor(employee, secField, value)
        : undefined;

      return (
        <td key={column.key} style={{ minWidth: width, width }}>
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input
              className="table-input"
              type="time"
              disabled={busy}
              style={{ color: secColor, fontWeight: secColor ? 700 : undefined }}
              title={
                isManualMetric
                  ? "Calculado automaticamente. Pode ser substituído manualmente após a confirmação do aviso."
                  : undefined
              }
              value={value}
              onChange={(event) => {
                const nextValue = event.target.value || "00:00";

                if (isManualMetric) {
                  requestManualMetricEdit(employee, column, nextValue);
                  return;
                }

                const nextCustomFields = {
                  ...(record.customFields || {}),
                  [column.key]: nextValue,
                  ...(column.key === "sai2"
                    ? {
                      [manualZeroSai2Field]: hasFilledTimeValue(nextValue)
                        ? "false"
                        : "true",
                    }
                    : {}),
                };

                void saveRecord(employee, { customFields: nextCustomFields });
              }}
            />
            {column.key === "sai2" ? (
              <button
                className="icon-button"
                type="button"
                disabled={busy}
                title="Zerar a Saída 2"
                aria-label="Zerar a Saída 2"
                onClick={() =>
                  void saveRecord(employee, {
                    customFields: {
                      ...(record.customFields || {}),
                      sai2: "00:00",
                      [manualZeroSai2Field]: "true",
                    },
                  })
                }
              >
                <X size={13} />
              </button>
            ) : null}
          </div>
          {column.key === "ent2"
            ? renderSecullumRaio(employee, "entrada2", value)
            : column.key === "sai2"
              ? renderSecullumRaio(employee, "saida2", value)
              : null}
          {column.key === "ent2"
            ? renderSecullumActions(employee, "entrada2", value)
            : column.key === "sai2"
              ? renderSecullumActions(employee, "saida2", value)
              : null}
        </td>
      );
    }
    if (column.key === "usefulHours") {
      return (
        <td key={column.key} style={{ minWidth: width, width }}>
          <input
            className="table-input"
            type="number"
            step="0.01"
            value={formatNumber(record.usefulHours)}
            onChange={(event) =>
              void saveRecord(employee, {
                usefulHours: toFixed2(event.target.value),
              })
            }
          />
        </td>
      );
    }
    if (column.key === "overtimePercent") {
      const weekday = dateToWeekdayIndex(filters.date);
      const overtimeRuleLabel = isHoliday(filters.date, calculationSettings)
        ? "Feriado"
        : weekday === 0
          ? "Domingo"
          : weekday === 6
            ? "Sábado"
            : "Seg–Sex";
      return (
        <td key={column.key} style={{ minWidth: width, width }}>
          <input
            className="table-input"
            type="number"
            step="0.01"
            title={`% HE conforme regra de ${overtimeRuleLabel}. Pode editar manualmente neste registro.`}
            value={formatNumber(record.overtimePercent)}
            onChange={(event) =>
              void saveRecord(employee, {
                overtimePercent: toFixed2(event.target.value),
              })
            }
          />
        </td>
      );
    }
    if (column.key === "overtimeHours") {
      return (
        <td key={column.key} style={{ minWidth: width, width }}>
          <input
            className="table-input"
            type="number"
            step="0.01"
            value={formatNumber(record.overtimeHours)}
            onChange={(event) =>
              void saveRecord(employee, {
                overtimeHours: toFixed2(event.target.value),
              })
            }
          />
        </td>
      );
    }
    if (column.key === "status") {
      const statusOptions = calculationSettings.statusConditions.filter(
        (status) => status.active,
      );
      const availableStatuses = statusOptions.length
        ? statusOptions
        : defaultStatusConditions;
      const selectedCondition = statusConditionFor(record.status);
      const selectStyle = selectedCondition
        ? {
          backgroundColor: selectedCondition.rowColor,
          color: selectedCondition.textColor,
          borderColor: selectedCondition.textColor,
        }
        : undefined;

      return (
        <td key={column.key} style={{ minWidth: width, width }}>
          <select
            className={`badge ${badgeClass(record.status)}`}
            style={selectStyle}
            value={record.status}
            onChange={(event) => {
              const nextStatus = event.target.value as AttendanceStatus;
              const patch: Partial<TimeRecord> = {
                status: nextStatus,
                customFields: {
                  ...(record.customFields || {}),
                  [manualStatusSelectedField]: "true",
                },
              };
              if (isAbsenceStatus(nextStatus)) {
                patch.checkIn = "00:00";
                patch.checkOut = "00:00";
                patch.customFields = {
                  ...patch.customFields,
                  ent2: "00:00",
                  sai2: "00:00",
                  ent3: "00:00",
                  sai3: "00:00",
                };
              }
              void saveRecord(employee, patch);
            }}
          >
            {sortOptions(
              availableStatuses.map((status) => ({
                value: status.value,
                label:
                  status.label ||
                  labelStatus(status.value as AttendanceStatus) ||
                  status.value,
              })),
            ).map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </td>
      );
    }
    if (column.key === "cid") {
      const cidEnabled = record.status === "medical_certificate";
      if (!cidEnabled) {
        return <td key={column.key} style={{ minWidth: width, width }} />;
      }

      return (
        <td key={column.key} style={{ minWidth: width, width }}>
          <input
            className="table-input"
            list="timekeeping-cid-options"
            placeholder="Categoria - Código - doença"
            value={record.cid || ""}
            onChange={(event) =>
              void saveRecord(employee, { cid: event.target.value })
            }
            onBlur={(event) => {
              const standardized = standardizeCidValue(event.target.value);
              if (standardized !== (record.cid || "")) {
                void saveRecord(employee, { cid: standardized });
              }
            }}
          />
        </td>
      );
    }
    if (column.key === "dayTeamId") {
      return (
        <td key={column.key} style={{ minWidth: width, width }}>
          <select
            className="table-input"
            value={record.dayTeamId || employee.teamId || ""}
            onChange={(event) =>
              void saveRecord(employee, { dayTeamId: event.target.value })
            }
          >
            <option value="">Sem equipe</option>
            {sortOptions(
              data.teams
                .filter((team) => team.companyId === employee.companyId)
                .map((team) => ({ value: team.id, label: team.name })),
            ).map((team) => (
              <option key={team.value} value={team.value}>
                {team.label}
              </option>
            ))}
          </select>
        </td>
      );
    }

    const customColumn = column as TimekeepingColumn;
    if (customColumn.type === "select") {
      const options = linkedColumnOptions(customColumn, employee);
      const currentValue = record.customFields?.[customColumn.key] || "";
      const selectedOption = options.find(
        (option) => option.value === currentValue,
      );
      const selectedColor =
        selectedOption?.color ||
        customColumn.optionColors?.[currentValue] ||
        "";
      return (
        <td key={customColumn.key} style={{ minWidth: width, width }}>
          <select
            className="table-input color-select"
            style={
              selectedColor
                ? {
                  borderColor: selectedColor,
                  backgroundColor: `${selectedColor}22`,
                }
                : undefined
            }
            value={currentValue}
            onChange={(event) =>
              void saveRecord(employee, {
                customFields: { [customColumn.key]: event.target.value || "" },
              })
            }
          >
            <option value="">Selecione</option>
            {options.map((option) => (
              <option
                key={option.value}
                value={option.value}
                style={
                  option.color ? { backgroundColor: option.color } : undefined
                }
              >
                {option.label}
              </option>
            ))}
          </select>
        </td>
      );
    }
    if (customColumn.type === "formula" || customColumn.type === "system") {
      return (
        <td
          key={customColumn.key}
          style={{ minWidth: width, width }}
          className={tdClass}
        >
          <span className="benefit-cell-value">
            {customColumnValue(employee, record, customColumn)}
          </span>
        </td>
      );
    }
    const customValue =
      customColumn.type === "time"
        ? record.customFields?.[customColumn.key] || "00:00"
        : record.customFields?.[customColumn.key] || "";
    return (
      <td key={customColumn.key} style={{ minWidth: width, width }}>
        <input
          className="table-input"
          type={
            customColumn.type === "number"
              ? "number"
              : customColumn.type === "time"
                ? "time"
                : "text"
          }
          value={customValue}
          onChange={(event) =>
            void saveRecord(employee, {
              customFields: {
                [customColumn.key]:
                  event.target.value ||
                  (customColumn.type === "time" ? "00:00" : ""),
              },
            })
          }
        />
      </td>
    );
  }

  const absentCount = sortedEmployees.reduce(
    (sum, employee) =>
      sum + (isAbsenceStatus(displayRecord(employee).status) ? 1 : 0),
    0,
  );
  const isCurrentDateHoliday = isHoliday(filters.date, calculationSettings);
  const isWholeDaySavedWithoutUpdates = wholeDaySavePlan.isSavedWithoutUpdates;
  // Só habilita "Salvar dia do mês" quando houver ao menos uma edição na área
  // de edição (rascunho). Dia novo/vazio sem edições mantém o botão inativo.
  const hasDraftEdits = Object.keys(draftRecordsByEmployeeId).length > 0;
  const saveWholeDayDisabled =
    busy || !employeesForDaySave.length || !hasDraftEdits;
  const saveWholeDayTitle = !hasDraftEdits
    ? "Edite pelo menos um funcionário na área de edição para habilitar o salvamento."
    : "Salva e preserva todos os registros desta data, inclusive de funcionários que forem desativados depois.";
  const pendingSaveChangesCount = isWholeDaySavedWithoutUpdates
    ? 0
    : Object.keys(draftRecordsByEmployeeId).length;

  useCreateShortcut(() => {
    if (busy) return;
    openCreateColumn();
  });

  return (
    <section className="page timekeeping-page">
      <datalist id="timekeeping-cid-options">
        {cidOptions.map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
      <div className="page-header">
        <div>
          <h1 className="page-title">Controle de ponto</h1>
          <p className="page-subtitle">
            Cada tabela representa um dia do mês. Os horários podem ser
            importados do Secullum ou lançados manualmente para conferência.
          </p>
        </div>
        <div className="form-actions">
          {canEditTimekeeping ? (
            <>
              <button
                className="btn btn-secondary"
                type="button"
                disabled={busy}
                onClick={() => setSecullumModalOpen(true)}
              >
                <Upload size={16} /> Secullum
              </button>
              <button
                className="btn btn-secondary"
                type="button"
                disabled={busy}
                onClick={openCalculationPanel}
              >
                <Calculator size={16} /> Painel de cálculo
              </button>
            </>
          ) : null}
          <button
            className="btn btn-secondary"
            type="button"
            disabled={busy}
            onClick={() => {
              setReportStartDate(filters.date || todayISO());
              setReportEndDate(filters.date || todayISO());
              setReportColumnKeys((current) => {
                const availableKeys = reportColumnOptions.map(
                  (column) => column.key,
                );
                return current && current.length
                  ? sanitizeColumnSelection(current, availableKeys)
                  : availableKeys;
              });
              setReportModalOpen(true);
            }}
          >
            <FileSpreadsheet size={16} /> Exportar relatório
          </button>
          {canCreateTimekeeping || canEditTimekeeping ? (
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy}
              onClick={openCreateColumn}
            >
              <Plus size={16} /> Adicionar coluna
            </button>
          ) : null}
        </div>
      </div>

      <div className="filters-panel">
        <Search size={18} />
        <MultiSelect
          label="Empresas"
          placeholder="Empresas"
          value={filters.companyIds}
          onChange={(companyIds) =>
            setFilters({
              ...filters,
              companyIds,
              departmentIds: [],
              sectorIds: [],
              realTeamIds: [],
              dayTeamIds: [],
            })
          }
          options={sortOptions(
            data.companies.map((company) => ({
              value: company.id,
              label: company.name,
            })),
          )}
        />
        <MultiSelect
          label="Departamentos"
          placeholder="Departamentos"
          value={filters.departmentIds}
          onChange={(departmentIds) =>
            setFilters({ ...filters, departmentIds, sectorIds: [] })
          }
          options={sortOptions(
            structureDepartments.map((department) => ({
              value: department.id,
              label: department.name,
            })),
          )}
        />
        <MultiSelect
          label="Setores"
          placeholder="Setores"
          value={filters.sectorIds}
          onChange={(sectorIds) => setFilters({ ...filters, sectorIds })}
          options={sortOptions(
            structureSectors
              .filter(
                (sector) =>
                  !filters.departmentIds.length ||
                  filters.departmentIds.includes(sector.departmentId),
              )
              .map((sector) => ({ value: sector.id, label: sector.name })),
          )}
        />
        <MultiSelect
          label="Status"
          placeholder="Status"
          value={filters.statuses}
          onChange={(statuses) => setFilters({ ...filters, statuses })}
          options={sortOptions([
            { value: "active", label: "Ativo" },
            { value: "leave", label: "Afastado" },
            { value: "terminated", label: "Desativado" },
          ])}
        />
        <MultiSelect
          label="Modalidade"
          placeholder="Modalidade"
          value={filters.terminationModes || []}
          onChange={(terminationModes) => setFilters({ ...filters, terminationModes })}
          options={sortOptions(Object.values(processModalities).map((label) => ({ value: label, label })))}
        />
        <MultiSelect
          label="Equipe real"
          placeholder="Equipe real"
          value={filters.realTeamIds}
          onChange={(realTeamIds) => setFilters({ ...filters, realTeamIds })}
          options={sortOptions(teamFilterOptions)}
        />
        <MultiSelect
          label="Equipe do dia"
          placeholder="Equipe do dia"
          value={filters.dayTeamIds}
          onChange={(dayTeamIds) => setFilters({ ...filters, dayTeamIds })}
          options={sortOptions(teamFilterOptions)}
        />
        <MultiSelect
          label="Funcionários"
          placeholder="Funcionários"
          value={filters.employeeIds}
          onChange={(employeeIds) => setFilters({ ...filters, employeeIds })}
          options={sortOptions(employeeOptions)}
        />
        <MultiSelect
          label="CPF"
          placeholder="CPF"
          value={filters.cpfValues}
          onChange={(cpfValues) => setFilters({ ...filters, cpfValues })}
          options={sortOptions(cpfOptions)}
        />
        <input
          type="date"
          value={pendingDate}
          onChange={(event) => setPendingDate(event.target.value)}
          onBlur={(event) => commitPendingDate(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitPendingDate((event.target as HTMLInputElement).value);
            }
          }}
        />
        <input
          placeholder="Buscar funcionário"
          value={filters.search}
          onChange={(event) =>
            setFilters({ ...filters, search: event.target.value })
          }
        />
        <ClearFiltersButton
          active={hasActiveFilters}
          onClear={() => {
            // Só pergunta sobre descartar se o "Limpar" for MUDAR o dia
            // (voltar para hoje). No mesmo dia, nada é perdido.
            const willChangeDate =
              filters.date !== initialTimekeepingFilters.date;
            if (!willChangeDate || confirmDiscardDraft()) {
              setFilters(initialTimekeepingFilters);
            }
          }}
        />
        {hasActiveColumnFilters ? (
          <button
            className="btn btn-secondary"
            type="button"
            onClick={clearAllColumnFilters}
          >
            <X size={16} /> Limpar filtros das colunas
          </button>
        ) : null}
      </div>

      {calculationPanelOpen ? (
        <article className="panel">
          <div className="panel-header">
            <div>
              <h2 className="panel-title">
                <Calculator size={18} /> Painel de cálculo
              </h2>
              <p className="panel-subtitle">
                Defina a hora útil por dia, as regras de hora extra e as
                condições de status com suas cores.
              </p>
            </div>
            <div className="form-actions">
              <button
                className="btn btn-ghost"
                type="button"
                disabled={busy}
                onClick={() => setCalculationPanelOpen(false)}
              >
                <X size={16} /> Fechar
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={busy}
                onClick={() => void saveCalculationPanel()}
              >
                <Save size={16} /> Salvar regra
              </button>
            </div>
          </div>

          <div className="wizard-card" style={{ display: "grid", gap: 16 }}>
            <div
              className="form-actions"
              style={{ justifyContent: "flex-start", gap: 8 }}
            >
              <button
                type="button"
                className={`btn ${calculationTab === "rules" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setCalculationTab("rules")}
              >
                Regras
              </button>
              <button
                type="button"
                className={`btn ${calculationTab === "formulas" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setCalculationTab("formulas")}
              >
                Fórmulas
              </button>
              <button
                type="button"
                className={`btn ${calculationTab === "statuses" ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setCalculationTab("statuses")}
              >
                Status / Condição
              </button>
            </div>
            {calculationTab === "rules" ? (
              <div className="form-grid">
                <label className="field">
                  Segunda-feira
                  <input
                    type="time"
                    step="60"
                    value={minutesToInput(
                      calculationForm.usefulMinutesByWeekday["1"] ?? 0,
                    )}
                    onChange={(event) =>
                      updateWeekdayRule("1", event.target.value)
                    }
                  />
                </label>
                <label className="field">
                  Terça-feira
                  <input
                    type="time"
                    step="60"
                    value={minutesToInput(
                      calculationForm.usefulMinutesByWeekday["2"] ?? 0,
                    )}
                    onChange={(event) =>
                      updateWeekdayRule("2", event.target.value)
                    }
                  />
                </label>
                <label className="field">
                  Quarta-feira
                  <input
                    type="time"
                    step="60"
                    value={minutesToInput(
                      calculationForm.usefulMinutesByWeekday["3"] ?? 0,
                    )}
                    onChange={(event) =>
                      updateWeekdayRule("3", event.target.value)
                    }
                  />
                </label>
                <label className="field">
                  Quinta-feira
                  <input
                    type="time"
                    step="60"
                    value={minutesToInput(
                      calculationForm.usefulMinutesByWeekday["4"] ?? 0,
                    )}
                    onChange={(event) =>
                      updateWeekdayRule("4", event.target.value)
                    }
                  />
                </label>
                <label className="field">
                  Sexta-feira
                  <input
                    type="time"
                    step="60"
                    value={minutesToInput(
                      calculationForm.usefulMinutesByWeekday["5"] ?? 0,
                    )}
                    onChange={(event) =>
                      updateWeekdayRule("5", event.target.value)
                    }
                  />
                </label>
                <label className="field">
                  Sábado
                  <input
                    type="time"
                    step="60"
                    value={minutesToInput(
                      calculationForm.usefulMinutesByWeekday["6"] ?? 0,
                    )}
                    onChange={(event) =>
                      updateWeekdayRule("6", event.target.value)
                    }
                  />
                </label>
                <label className="field">
                  Domingo
                  <input
                    type="time"
                    step="60"
                    value={minutesToInput(
                      calculationForm.usefulMinutesByWeekday["0"] ?? 0,
                    )}
                    onChange={(event) =>
                      updateWeekdayRule("0", event.target.value)
                    }
                  />
                </label>
                <label className="field">
                  Tolerância de atraso
                  <input
                    type="time"
                    step="60"
                    value={minutesToInput(
                      calculationForm.delayToleranceMinutes,
                    )}
                    onChange={(event) =>
                      setCalculationForm((current) => ({
                        ...current,
                        delayToleranceMinutes: parseMinutesInput(
                          event.target.value,
                        ),
                      }))
                    }
                  />
                </label>
                <label className="field">
                  Intervalo automático
                  <input
                    type="time"
                    step="60"
                    value={minutesToInput(calculationForm.intervalMinutes)}
                    onChange={(event) =>
                      setCalculationForm((current) => ({
                        ...current,
                        intervalMinutes: parseMinutesInput(event.target.value),
                      }))
                    }
                  />
                </label>
                <label className="field">
                  SAÍ. 1 almoço
                  <input
                    type="time"
                    step="60"
                    value={calculationForm.secullumLunchOutTime || "12:00"}
                    onChange={(event) =>
                      setCalculationForm((current) => ({
                        ...current,
                        secullumLunchOutTime: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  ENT. 2 retorno almoço
                  <input
                    type="time"
                    step="60"
                    value={calculationForm.secullumLunchReturnTime || "13:01"}
                    onChange={(event) =>
                      setCalculationForm((current) => ({
                        ...current,
                        secullumLunchReturnTime: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  SAÍ. 2 fim expediente
                  <input
                    type="time"
                    step="60"
                    value={calculationForm.secullumEndTime || "17:00"}
                    onChange={(event) =>
                      setCalculationForm((current) => ({
                        ...current,
                        secullumEndTime: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  HE Seg–Sex (%)
                  <input
                    type="number"
                    step="0.01"
                    value={formatNumber(calculationForm.overtimeRates.weekday)}
                    onChange={(event) =>
                      updateOvertimeRate("weekday", event.target.value)
                    }
                  />
                </label>
                <label className="field">
                  HE Sábado (%)
                  <input
                    type="number"
                    step="0.01"
                    value={formatNumber(calculationForm.overtimeRates.saturday)}
                    onChange={(event) =>
                      updateOvertimeRate("saturday", event.target.value)
                    }
                  />
                </label>
                <label className="field">
                  HE Domingo (%)
                  <input
                    type="number"
                    step="0.01"
                    value={formatNumber(calculationForm.overtimeRates.sunday)}
                    onChange={(event) =>
                      updateOvertimeRate("sunday", event.target.value)
                    }
                  />
                </label>
                <label className="field">
                  HE Feriado (%)
                  <input
                    type="number"
                    step="0.01"
                    value={formatNumber(calculationForm.overtimeRates.holiday)}
                    onChange={(event) =>
                      updateOvertimeRate("holiday", event.target.value)
                    }
                  />
                </label>
                <label className="field is-wide-field">
                  Feriados (YYYY-MM-DD, um por linha)
                  <textarea
                    value={calculationForm.holidays.join("\n")}
                    onChange={(event) =>
                      setCalculationForm((current) => ({
                        ...current,
                        holidays: event.target.value
                          .split(/\n/)
                          .map((item) => item.trim())
                          .filter(Boolean),
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>Abater faltas dos benefícios</span>
                  <select
                    value={
                      calculationForm.deductAbsencesFromBenefits
                        ? "true"
                        : "false"
                    }
                    onChange={(event) =>
                      setCalculationForm((current) => ({
                        ...current,
                        deductAbsencesFromBenefits:
                          event.target.value === "true",
                      }))
                    }
                  >
                    <option value="true">Ativo</option>
                    <option value="false">Inativo</option>
                  </select>
                </label>
                <label className="field">
                  <span>Recalcular automático</span>
                  <select
                    value={calculationForm.autoRecalculate ? "true" : "false"}
                    onChange={(event) =>
                      setCalculationForm((current) => ({
                        ...current,
                        autoRecalculate: event.target.value === "true",
                      }))
                    }
                  >
                    <option value="true">Ativo</option>
                    <option value="false">Inativo</option>
                  </select>
                </label>
              </div>
            ) : null}
            {calculationTab === "formulas" ? (
              <div className="form-grid">
                <label className="field is-wide-field">
                  Hora útil
                  <textarea
                    value={calculationForm.formulas.usefulHours}
                    onChange={(event) =>
                      updateFormulaDescription(
                        "usefulHours",
                        event.target.value,
                      )
                    }
                  />
                </label>
                <label className="field is-wide-field">
                  Horas extras (HE)
                  <textarea
                    value={calculationForm.formulas.overtimeHours}
                    onChange={(event) =>
                      updateFormulaDescription(
                        "overtimeHours",
                        event.target.value,
                      )
                    }
                  />
                </label>
                <label className="field is-wide-field">
                  % de horas extras
                  <textarea
                    value={calculationForm.formulas.overtimePercent}
                    onChange={(event) =>
                      updateFormulaDescription(
                        "overtimePercent",
                        event.target.value,
                      )
                    }
                  />
                </label>
                <label className="field is-wide-field">
                  Valor da hora extra
                  <textarea
                    value={calculationForm.formulas.overtimeAmount}
                    onChange={(event) =>
                      updateFormulaDescription(
                        "overtimeAmount",
                        event.target.value,
                      )
                    }
                  />
                </label>
                <label className="field is-wide-field">
                  Banco de horas
                  <textarea
                    value={calculationForm.formulas.hourBank}
                    onChange={(event) =>
                      updateFormulaDescription("hourBank", event.target.value)
                    }
                  />
                </label>
                <div className="field is-wide-field">
                  <strong>Regras aplicadas na tabela</strong>
                  <p className="muted" style={{ marginTop: 8 }}>
                    • SAÍ. 1 é o início do almoço, ENT. 2 é o retorno do almoço
                    e SAÍ. 2 é o fim do expediente. Esses horários são
                    configuráveis no painel de regras e também podem ser
                    editados na tabela.
                  </p>
                  <p className="muted">
                    NORMAIS soma os periodos ENT.1-SAI.1, ENT.2-SAI.2 e ENT.3-SAI.3;
                    a carga diaria da jornada do funcionario e o limite. Abaixo disso vira FALTAS,
                    acima disso vira EXTRAS.
                  </p>
                  <p className="muted">• Valor hora base = salário ÷ 220.</p>
                  <p className="muted">
                    • Acréscimos padrão: 50% seg–sex, 75% sábado, 120% domingo e
                    120% feriado.
                  </p>
                </div>
              </div>
            ) : null}
            {calculationTab === "statuses" ? (
              <div style={{ display: "grid", gap: 16 }}>
                <div
                  className="form-actions"
                  style={{
                    justifyContent: "space-between",
                    gap: 8,
                    flexWrap: "wrap",
                  }}
                >
                  <p className="muted" style={{ margin: 0 }}>
                    Edite os status exibidos no select da tabela e salve também
                    as cores da linha e do texto.
                  </p>
                  {canEditTimekeeping ? (
                    <button
                      type="button"
                      className="btn btn-primary"
                      onClick={openCreateStatusModal}
                    >
                      <Plus size={14} /> Adicionar status
                    </button>
                  ) : null}
                </div>

                <div className="table-panel">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Status / Condição</th>
                        <th>Cor da linha</th>
                        <th>Cor do texto</th>
                        <th>Ativo</th>
                        <th>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {calculationForm.statusConditions.map((condition) => (
                        <tr
                          key={condition.id}
                          style={{
                            backgroundColor: condition.rowColor,
                            color: condition.textColor,
                          }}
                        >
                          <td>{condition.label}</td>
                          <td>{condition.rowColor}</td>
                          <td>{condition.textColor}</td>
                          <td>{condition.active ? "Sim" : "Não"}</td>
                          <td>
                            <div
                              className="form-actions"
                              style={{ justifyContent: "flex-start", gap: 8 }}
                            >
                              {canEditTimekeeping ? (
                                <button
                                  type="button"
                                  className="btn btn-ghost"
                                  onClick={() => editStatusCondition(condition)}
                                >
                                  <Edit3 size={14} /> Editar
                                </button>
                              ) : null}
                              {canDeleteTimekeeping ? (
                                <button
                                  type="button"
                                  className="btn btn-ghost"
                                  onClick={() =>
                                    removeStatusCondition(condition.id)
                                  }
                                >
                                  <Trash2 size={14} /> Excluir
                                </button>
                              ) : null}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}{" "}
          </div>
        </article>
      ) : null}

      <article className="panel">
        <div className="panel-header">
          <div>
            <h2 className="panel-title">
              <Clock size={18} /> Tabela do dia{" "}
              {filters.date.split("-").reverse().join("/")}
            </h2>
            <p className="panel-subtitle">
              {sortedEmployees.length} de {employees.length} funcionário(s) ·{" "}
              {absentCount} falta(s) neste dia.{" "}
              {isCurrentDateHoliday
                ? "Este dia está marcado como feriado e a HE usará a regra de feriado."
                : "Ao marcar feriado, a HE deste dia usa a porcentagem configurada para feriado."}
            </p>
          </div>
          <div className="form-actions">
            <button
              className="btn btn-secondary"
              type="button"
              data-testid="secullum-refresh-btn"
              disabled={secullumStatus === "loading"}
              title={
                secullumLastSync
                  ? `Última atualização do Secullum: ${new Date(secullumLastSync).toLocaleString("pt-BR")}`
                  : "Atualiza as batidas do Secullum para o dia selecionado."
              }
              onClick={() => void fetchSecullumDay(true)}
            >
              <RefreshCw size={16} />{" "}
              {secullumStatus === "loading"
                ? "Atualizando Secullum…"
                : "Atualizar Secullum"}
            </button>
            {secullumLastSync ? (
              <span
                className="muted"
                style={{ fontSize: 11, alignSelf: "center" }}
                data-testid="secullum-last-sync"
              >
                Secullum atualizado em{" "}
                {new Date(secullumLastSync).toLocaleString("pt-BR")}
              </span>
            ) : null}
            {canEditTimekeeping && !tableLocked && filters.realTeamIds.length ? (
              <button
                className="btn btn-primary"
                type="button"
                data-testid="open-team-schedule-modal-btn"
                disabled={busy}
                title="Aplica o horário programado do encarregado a todos os colaboradores da equipe selecionada neste dia."
                onClick={openTeamScheduleModal}
              >
                <Users size={16} /> Alterar horários para todos colaboradores da
                equipe selecionada
              </button>
            ) : null}
            <button
              className={`btn ${isCurrentDateHoliday ? "btn-primary" : "btn-secondary"}`}
              type="button"
              disabled={busy}
              title="Marca ou desmarca a data atual como feriado para aplicar a regra de HE Feriado"
              onClick={() => void toggleHolidayForCurrentDate()}
            >
              <CalendarDays size={16} />{" "}
              {isCurrentDateHoliday ? "Feriado ativo" : "Feriado"}
            </button>
            {canEditTimekeeping ? (
              <span className={`timekeeping-save-day-action ${isWholeDaySavedWithoutUpdates ? "is-saved" : ""}`} title={saveWholeDayTitle}>
                <button
                  className={`btn timekeeping-save-day-btn ${isWholeDaySavedWithoutUpdates ? "is-saved" : "btn-secondary"}`}
                  type="button"
                  disabled={saveWholeDayDisabled}
                  title={saveWholeDayTitle}
                  onClick={() => void saveWholeDay()}
                >
                  <Check size={16} /> Salvar dia do mês
                  {pendingSaveChangesCount ? ` (${pendingSaveChangesCount} alteração(ões))` : ""}
                </button>
              </span>
            ) : null}
            {canEditTimekeeping ? (
              <button
                className={`btn ${tableLocked ? "btn-secondary" : "btn-primary"}`}
                type="button"
                disabled={busy}
                title={
                  tableLocked
                    ? "Tabela bloqueada. Clique para permitir alterações."
                    : "Tabela liberada para edição. Clique para bloquear."
                }
                onClick={() => setTableLocked((current) => !current)}
              >
                {tableLocked ? <Lock size={16} /> : <Unlock size={16} />}
                {tableLocked ? "Bloqueada" : "Liberada"}
              </button>
            ) : null}
          </div>
        </div>

        {otherEditors.length ? (
          <div className="alert" style={{ margin: "0 16px 12px", display: "flex", gap: 8, alignItems: "center" }}>
            <Users size={17} />
            <span>
              Esta tabela também está sendo editada por {otherEditors.map((entry) => `${entry.userName} (${entry.username})`).join(", ")}.
              As alterações permanecem locais até alguém clicar em <strong>Salvar dia do mês</strong>.
            </span>
          </div>
        ) : null}

        <div
          className="secullum-legend"
          data-testid="secullum-legend"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 16,
            alignItems: "center",
            margin: "0 16px 12px",
            padding: "8px 12px",
            border: "1px solid #e2e8f0",
            borderRadius: 10,
            background: "#f8fafc",
            fontSize: 12,
          }}
        >
          <strong style={{ color: "#334155", marginRight: 4 }}>
            Origem do horário{secullumOriginStats.total ? ` (${secullumOriginStats.total} no total)` : ""}:
          </strong>
          {(
            [
              ["celular", "Celular"],
              ["computador", "Computador"],
              ["manual", "Manual"],
              ["automatico", "Automático"],
              ["api", "Macro/API"],
            ] as Array<[SecullumOriginCode, string]>
          ).map(([code, label]) => {
            const count = secullumOriginStats.counts[code] || 0;
            const pct = secullumOriginStats.total
              ? Math.round((count / secullumOriginStats.total) * 100)
              : 0;
            const active = secullumOriginFilter === code;
            const color = SECULLUM_ORIGIN_COLORS[code];
            return (
              <button
                key={code}
                type="button"
                data-testid={`secullum-origin-card-${code}`}
                title={active ? "Clique para remover o filtro" : `Filtrar por ${label}`}
                onClick={() => {
                  setSecullumOriginFilter(active ? null : code);
                  setCurrentPage(1);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "6px 10px",
                  borderRadius: 10,
                  cursor: "pointer",
                  background: "#fff",
                  border: active ? `2px solid ${color}` : "1px solid #e2e8f0",
                  boxShadow: active ? `0 0 0 3px ${color}22` : "none",
                }}
              >
                {code === "automatico" ? (
                  <Zap size={14} fill={color} color={color} />
                ) : (
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 3,
                      background: color,
                      display: "inline-block",
                      border: code === "api" ? "1px solid #cbd5e1" : undefined,
                    }}
                  />
                )}
                <span
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    lineHeight: 1.15,
                    textAlign: "left",
                  }}
                >
                  <span style={{ color, fontWeight: 700, fontSize: 12 }}>
                    {label}
                  </span>
                  <span style={{ color: "#475569", fontSize: 12, fontWeight: 600 }}>
                    <span style={{ color, fontWeight: 700 }}>{pct}%</span>
                    {" · "}
                    {count} func.
                  </span>
                </span>
              </button>
            );
          })}
          {secullumOriginFilter ? (
            <button
              type="button"
              data-testid="secullum-origin-clear"
              onClick={() => {
                setSecullumOriginFilter(null);
                setCurrentPage(1);
              }}
              style={{
                padding: "6px 10px",
                borderRadius: 10,
                border: "1px solid #e2e8f0",
                background: "#f1f5f9",
                cursor: "pointer",
                fontSize: 12,
                fontWeight: 600,
                color: "#334155",
              }}
            >
              Limpar filtro ✕
            </button>
          ) : null}
        </div>


        {secullumSendConfirm
          ? createPortal(
            <div
              className="modal-overlay"
              data-testid="secullum-send-modal"
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(15,23,42,0.55)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
                padding: 16,
              }}
              onClick={() => {
                if (!secullumSendBusy) {
                  setSecullumSendConfirm(null);
                  setSecullumSendError("");
                }
              }}
            >
              <div
                role="dialog"
                aria-modal="true"
                onClick={(event) => event.stopPropagation()}
                style={{
                  background: "#fff",
                  borderRadius: 14,
                  padding: 24,
                  width: "100%",
                  maxWidth: 460,
                  boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
                }}
              >
                <h3 style={{ margin: "0 0 8px", fontSize: 18, color: "#0f172a" }}>
                  Registrar batida no Secullum
                </h3>
                <div
                  style={{
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-start",
                    background: "#fef2f2",
                    border: "1px solid #fecaca",
                    borderRadius: 10,
                    padding: "10px 12px",
                    margin: "12px 0",
                  }}
                >
                  <Zap size={18} color="#dc2626" style={{ flexShrink: 0, marginTop: 2 }} />
                  <span style={{ fontSize: 13, color: "#991b1b" }}>
                    Esta ação irá registrar/alterar a batida <strong>diretamente
                      no Secullum (ambiente de produção)</strong>. Confirme antes de
                    prosseguir.
                  </span>
                </div>
                <p style={{ fontSize: 14, color: "#334155", margin: "0 0 6px" }}>
                  <strong>Funcionário:</strong> {secullumSendConfirm.employee.name}
                </p>
                <p style={{ fontSize: 14, color: "#334155", margin: "0 0 6px" }}>
                  <strong>Data:</strong> {filters.date} &nbsp;•&nbsp;{" "}
                  <strong>Coluna:</strong> {secullumSendConfirm.coluna}
                </p>
                <p style={{ fontSize: 14, color: "#334155", margin: "0 0 6px" }}>
                  <strong>Horário a enviar:</strong> {secullumSendConfirm.hora || "--"}
                  {secullumSendConfirm.secValue
                    ? ` (substituirá ${secullumSendConfirm.secValue} no Secullum)`
                    : ""}
                </p>
                {secullumSendConfirm.secValue &&
                  secullumOriginFor(
                    secullumSendConfirm.employee,
                    secullumSendConfirm.field,
                  )?.code === "celular" ? (
                  <div
                    style={{
                      fontSize: 12,
                      color: "#92400e",
                      background: "#fffbeb",
                      border: "1px solid #fde68a",
                      borderRadius: 8,
                      padding: "8px 10px",
                      margin: "8px 0 0",
                    }}
                  >
                    Atenção: esta batida foi feita por celular e pode possuir foto
                    de reconhecimento facial. Ao alterá-la no Secullum, a foto
                    original pode ser perdida. <strong>Não é possível recuperar
                      essa foto pela API</strong> — somente mediante contato/contratação
                    do serviço BioWeb do Secullum.
                  </div>
                ) : null}
                {secullumSendError ? (
                  <div
                    data-testid="secullum-send-error"
                    style={{
                      fontSize: 13,
                      color: "#b91c1c",
                      background: "#fef2f2",
                      border: "1px solid #fecaca",
                      borderRadius: 8,
                      padding: "8px 10px",
                      margin: "10px 0 0",
                    }}
                  >
                    {secullumSendError}
                  </div>
                ) : null}
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 8,
                    marginTop: 18,
                  }}
                >
                  <button
                    className="btn btn-secondary"
                    type="button"
                    disabled={secullumSendBusy}
                    data-testid="secullum-send-cancel"
                    onClick={() => {
                      setSecullumSendConfirm(null);
                      setSecullumSendError("");
                    }}
                  >
                    Cancelar
                  </button>
                  <button
                    className="btn btn-primary"
                    type="button"
                    disabled={secullumSendBusy}
                    data-testid="secullum-send-confirm"
                    onClick={() => void confirmSecullumSend()}
                  >
                    {secullumSendBusy ? "Enviando…" : "Confirmar envio"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
          : null}

        {secullumBatch
          ? createPortal(
            <div
              className="modal-overlay"
              data-testid="secullum-batch-modal"
              style={{
                position: "fixed",
                inset: 0,
                background: "rgba(15,23,42,0.55)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 1000,
                padding: 16,
              }}
              onClick={() => setSecullumBatch(null)}
            >
              <div
                role="dialog"
                aria-modal="true"
                onClick={(event) => event.stopPropagation()}
                style={{
                  background: "#fff",
                  borderRadius: 14,
                  padding: 24,
                  width: "100%",
                  maxWidth: 640,
                  maxHeight: "85vh",
                  display: "flex",
                  flexDirection: "column",
                  boxShadow: "0 20px 50px rgba(0,0,0,0.25)",
                }}
              >
                <h3 style={{ margin: "0 0 4px", fontSize: 18, color: "#0f172a" }}>
                  Atualizar em lote pelo Secullum
                </h3>
                <p style={{ fontSize: 13, color: "#475569", margin: "0 0 12px" }}>
                  {secullumBatch.filter((item) => item.selected).length} de{" "}
                  {secullumBatch.length} funcionário(s) com alterações reais em{" "}
                  <strong>{filters.date}</strong>. Revise e desmarque quem não
                  deseja alterar. As alterações vão para o pré-envio (não salvam
                  no banco até clicar em "Salvar dia do mês").
                </p>
                <div style={{ margin: "0 0 8px" }}>
                  <button
                    type="button"
                    className="btn btn-secondary"
                    data-testid="secullum-batch-toggle-all"
                    onClick={() =>
                      setSecullumBatch((prev) => {
                        if (!prev) return prev;
                        const allSelected = prev.every((it) => it.selected);
                        return prev.map((it) => ({ ...it, selected: !allSelected }));
                      })
                    }
                  >
                    {secullumBatch.every((it) => it.selected)
                      ? "Desmarcar todos"
                      : "Marcar todos"}
                  </button>
                </div>
                <div
                  style={{
                    overflowY: "auto",
                    flex: 1,
                    border: "1px solid #e2e8f0",
                    borderRadius: 10,
                    padding: 6,
                  }}
                >
                  {secullumBatch.map((item, idx) => (
                    <label
                      key={item.employee.id}
                      data-testid={`secullum-batch-row-${item.employee.id}`}
                      style={{
                        display: "flex",
                        gap: 10,
                        alignItems: "flex-start",
                        padding: "10px 8px",
                        borderBottom:
                          idx < secullumBatch.length - 1
                            ? "1px solid #f1f5f9"
                            : "none",
                        cursor: "pointer",
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={item.selected}
                        data-testid={`secullum-batch-check-${item.employee.id}`}
                        onChange={() =>
                          setSecullumBatch((prev) =>
                            prev
                              ? prev.map((it, i) =>
                                i === idx
                                  ? { ...it, selected: !it.selected }
                                  : it,
                              )
                              : prev,
                          )
                        }
                        style={{ marginTop: 3, width: 16, height: 16 }}
                      />
                      <div style={{ flex: 1 }}>
                        <div
                          style={{ fontWeight: 600, fontSize: 14, color: "#0f172a" }}
                        >
                          {item.employee.name}
                        </div>
                        {item.diffs.map((d) => (
                          <div
                            key={d.field}
                            style={{ fontSize: 12, color: "#64748b" }}
                          >
                            {d.label}: {d.from} →{" "}
                            <strong style={{ color: "#0f766e" }}>{d.to}</strong>
                          </div>
                        ))}
                      </div>
                    </label>
                  ))}
                </div>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "flex-end",
                    gap: 8,
                    marginTop: 18,
                  }}
                >
                  <button
                    className="btn btn-secondary"
                    type="button"
                    data-testid="secullum-batch-cancel"
                    onClick={() => setSecullumBatch(null)}
                  >
                    Cancelar
                  </button>
                  <button
                    className="btn btn-primary"
                    type="button"
                    data-testid="secullum-batch-confirm"
                    disabled={
                      !secullumBatch.some((item) => item.selected)
                    }
                    onClick={() => confirmSecullumBatch()}
                  >
                    Adicionar ao pré-envio (
                    {secullumBatch.filter((item) => item.selected).length})
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
          : null}

        {secullumStatus === "error" ? (
          <div
            data-testid="secullum-error-banner"
            style={{
              margin: "0 16px 12px",
              padding: "10px 14px",
              borderRadius: 10,
              border: "1px solid #fecaca",
              background: "#fef2f2",
              color: "#991b1b",
              fontSize: 13,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <Zap size={16} color="#dc2626" />
            <span>
              Não foi possível carregar os dados do Secullum ({secullumError || "erro na API"}).
              A lista está sendo exibida normalmente, sem as cores de origem do Secullum.
            </span>
          </div>
        ) : null}

        <div
          className="table-panel timekeeping-table-panel"
          style={{ position: "relative" }}
        >
          {secullumStatus === "loading" ? (
            <div
              data-testid="secullum-loading-splash"
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 5,
                background: "rgba(248,250,252,0.9)",
                backdropFilter: "blur(2px)",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 14,
                borderRadius: 12,
              }}
            >
              <div
                style={{
                  width: 40,
                  height: 40,
                  border: "4px solid #cbd5e1",
                  borderTopColor: "#2563eb",
                  borderRadius: "50%",
                  animation: "secullum-spin 0.8s linear infinite",
                }}
              />
              <div style={{ fontSize: 14, fontWeight: 600, color: "#334155" }}>
                Carregando dados do Secullum…
              </div>
              <style>{`@keyframes secullum-spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : null}
          <div className="timekeeping-table-scroll">
            <table className="data-table timekeeping-table">
              <thead>
                <tr>{columns.map((column) => renderHeader(column))}</tr>
              </thead>
              <tbody
                aria-disabled={tableLocked}
                title={
                  tableLocked
                    ? "Tabela bloqueada para evitar alterações acidentais. Use o botão de cadeado para liberar."
                    : undefined
                }
                style={
                  tableLocked
                    ? { pointerEvents: "none", userSelect: "none" }
                    : undefined
                }
              >
                {paginatedEmployees.map((employee) => {
                  const record = displayRecord(employee);
                  return (
                    <tr
                      key={employee.id}
                      className={
                        isAbsenceStatus(record.status) ? "is-absence-row" : ""
                      }
                      style={(() => {
                        const condition = statusConditionFor(record.status);
                        const color = employeeRowTextColor(
                          employee,
                          filters.date,
                          condition?.textColor,
                        );
                        return condition || color
                          ? { backgroundColor: condition?.rowColor, color }
                          : undefined;
                      })()}
                    >
                      {columns.map((column) =>
                        renderCell(employee, record, column),
                      )}
                    </tr>
                  );
                })}
                {!sortedEmployees.length ? (
                  <tr>
                    <td colSpan={columns.length}>
                      Nenhum funcionário encontrado para os filtros.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          <TimekeepingPagination
            totalItems={sortedEmployees.length}
            pageStart={pageStart}
            pageEnd={pageEnd}
            currentPage={safeCurrentPage}
            totalPages={totalPages}
            onPageChange={(page) => setCurrentPage(page)}
          />
        </div>

        <div className="timekeeping-folders">
          <div className="timekeeping-folders-header">
            <h3>
              <Folder size={18} /> Pontos salvos
            </h3>
            <span>
              {savedTimeFolders.length} {savedTimeFolders.length === 1 ? "pasta" : "pastas"}
            </span>
          </div>
          {savedTimeFolders.length ? (
            <div className="timekeeping-folder-tree">
              {savedTimeFolders.map((yearFolder) => (
                <details className="timekeeping-folder" key={yearFolder.year}>
                  <summary>
                    <span>
                      <Folder size={16} /> {yearFolder.year}
                    </span>
                    <small>
                      {yearFolder.months.length} {yearFolder.months.length === 1 ? "pasta" : "pastas"}
                    </small>
                  </summary>
                  <div className="timekeeping-folder-children">
                    {yearFolder.months.map((monthFolder) => (
                      <details
                        className="timekeeping-folder is-month"
                        key={monthFolder.month}
                      >
                        <summary>
                          <span>
                            <Folder size={16} /> {monthFolder.label}
                          </span>
                          <small>
                            {monthFolder.days.length} {monthFolder.days.length === 1 ? "dia salvo" : "dias salvos"}
                          </small>
                        </summary>
                        <div className="timekeeping-day-list">
                          {monthFolder.days.map((dayFolder) => (
                            <button
                              className={`timekeeping-day-button ${dayFolder.date === filters.date ? "is-selected" : ""}`}
                              key={dayFolder.date}
                              type="button"
                              onClick={() =>
                                setFilters({ ...filters, date: dayFolder.date })
                              }
                            >
                              <CalendarDays size={16} />
                              <span>
                                {formatDateFolderLabel(dayFolder.date)}
                              </span>

                            </button>
                          ))}
                        </div>
                      </details>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          ) : (
            <p className="muted">Nenhum dia salvo ainda.</p>
          )}
        </div>
      </article>

      {secullumModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal-panel wizard-card" style={{ maxWidth: 1100 }}>
            <div className="modal-header">
              <h2>Importar ponto do Secullum</h2>
              <button
                className="icon-button"
                type="button"
                disabled={busy}
                onClick={() => {
                  setSecullumModalOpen(false);
                  setSecullumRows([]);
                  setSecullumFileName("");
                  setSecullumImportError("");
                }}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="form-grid">
              <label className="field is-wide-field">
                Planilha do Secullum
                <input
                  type="file"
                  accept=".xlsx,.xls"
                  disabled={busy}
                  onChange={(event) => void handleSecullumFile(event)}
                />
              </label>
            </div>

            {secullumFileName ? (
              <p className="muted">Arquivo selecionado: {secullumFileName}</p>
            ) : null}

            {secullumImportError ? (
              <div
                className="alert-card"
                style={{
                  borderColor: "#ef4444",
                  color: "#991b1b",
                  background: "#fee2e2",
                }}
              >
                {secullumImportError}
              </div>
            ) : null}

            {secullumRows.length ? (
              <div
                className="table-panel"
                style={{ maxHeight: 420, overflow: "auto" }}
              >
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Linha</th>
                      <th>Data</th>
                      <th>Funcionário Secullum</th>
                      <th>Funcionário Sistema</th>
                      <th>ENT. 1</th>
                      <th>SAÍ. 1</th>
                      <th>ENT. 2</th>
                      <th>SAÍ. 2</th>
                      <th>ENT. 3</th>
                      <th>SAÍ. 3</th>
                      <th>NORMAIS</th>
                      <th>FALTAS</th>
                      <th>EXTRAS</th>
                      <th>CARGA</th>
                      <th>Situação</th>
                      <th>Alerta</th>
                    </tr>
                  </thead>
                  <tbody>
                    {secullumRows.map((row) => (
                      <tr
                        key={`${row.rowNumber}-${row.employeeName}-${row.date}`}
                        className={
                          !row.employee || row.blockedReason
                            ? "is-absence-row"
                            : ""
                        }
                      >
                        <td>{row.rowNumber}</td>
                        <td>
                          {row.date
                            ? row.date.split("-").reverse().join("/")
                            : "-"}
                        </td>
                        <td>{row.employeeName}</td>
                        <td>{row.employee?.name || "Não encontrado"}</td>
                        <td>{row.ent1}</td>
                        <td>{row.sai1}</td>
                        <td>{row.ent2}</td>
                        <td>{row.sai2}</td>
                        <td>{row.ent3}</td>
                        <td>{row.sai3}</td>
                        <td>{row.normais}</td>
                        <td>{row.faltas}</td>
                        <td>{row.extras}</td>
                        <td>{row.carga}</td>
                        <td>
                          {row.blockedReason || "Disponível para preencher"}
                        </td>
                        <td>{row.warning || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="muted">
                Selecione a planilha exportada do Secullum para pré-visualizar
                os dados antes de importar.
              </p>
            )}

            <div className="form-actions">
              <button
                className="btn btn-ghost"
                type="button"
                disabled={busy}
                onClick={() => {
                  setSecullumModalOpen(false);
                  setSecullumRows([]);
                  setSecullumFileName("");
                  setSecullumImportError("");
                }}
              >
                Cancelar
              </button>

              <button
                className="btn btn-primary"
                type="button"
                disabled={
                  busy ||
                  Boolean(secullumImportError) ||
                  secullumRows.length === 0
                }
                title={
                  secullumRows.length === 0
                    ? "Selecione uma planilha do Secullum"
                    : "Analisar e preencher os registros disponíveis"
                }
                onClick={() => confirmImportSecullumRows()}
              >
                <Save size={16} /> Preencher com Secullum
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {reportModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <form
            className="modal-panel wizard-card timekeeping-report-modal"
            onSubmit={(event) => {
              event.preventDefault();
              void exportReport();
            }}
          >
            <div className="modal-header">
              <h2>Exportar relatório</h2>
              <button
                className="icon-button"
                type="button"
                disabled={busy}
                onClick={() => setReportModalOpen(false)}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="timekeeping-report-content">
              <div className="timekeeping-report-intro">
                <p className="muted">
                  Escolha o período, o formato e as colunas que devem aparecer
                  no arquivo gerado.
                </p>
                <span className="timekeeping-report-counter">
                  {selectedReportColumnKeys.length} de {reportColumnOptions.length} colunas
                </span>
              </div>

              <div className="timekeeping-report-controls">
                <label className="field">
                  Data inicial
                  <input
                    required
                    type="date"
                    value={reportStartDate}
                    onChange={(event) => setReportStartDate(event.target.value)}
                  />
                </label>
                <label className="field">
                  Data final
                  <input
                    required
                    type="date"
                    value={reportEndDate}
                    onChange={(event) => setReportEndDate(event.target.value)}
                  />
                </label>
                <div className="field">
                  <span>Formato</span>
                  <div
                    className="timekeeping-report-format"
                    role="group"
                    aria-label="Formato do relatório"
                  >
                    <button
                      className={reportFormat === "excel" ? "is-selected" : ""}
                      type="button"
                      onClick={() => setReportFormat("excel")}
                    >
                      <FileSpreadsheet size={15} /> Excel
                    </button>
                    <button
                      className={reportFormat === "pdf" ? "is-selected" : ""}
                      type="button"
                      onClick={() => setReportFormat("pdf")}
                    >
                      <FileText size={15} /> PDF
                    </button>
                  </div>
                </div>
              </div>

              <div className="timekeeping-report-columns">
                <div className="timekeeping-report-columns-header">
                  <div>
                    <strong>Colunas do relatório</strong>
                    <span>A ordem segue a tabela atual.</span>
                  </div>
                  <div className="timekeeping-report-column-actions">
                    <button
                      className="btn btn-secondary"
                      type="button"
                      disabled={
                        selectedReportColumnKeys.length ===
                        reportColumnOptions.length
                      }
                      onClick={selectAllReportColumns}
                    >
                      Marcar todas
                    </button>
                    <button
                      className="btn btn-secondary"
                      type="button"
                      disabled={!selectedReportColumnKeys.length}
                      onClick={clearReportColumns}
                    >
                      Limpar
                    </button>
                  </div>
                </div>

                <div className="timekeeping-report-column-grid">
                  {reportColumnOptions.map((column) => {
                    const selected = selectedReportColumnKeys.includes(
                      column.key,
                    );
                    return (
                      <label
                        className={`timekeeping-report-column ${selected ? "is-selected" : ""}`}
                        key={column.key}
                      >
                        <input
                          className="timekeeping-report-column-input"
                          type="checkbox"
                          checked={selected}
                          onChange={() => toggleReportColumn(column.key)}
                        />
                        <span className="timekeeping-report-column-check">
                          <Check size={15} />
                        </span>
                        <span className="timekeeping-report-column-label">
                          {column.label}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className="form-actions timekeeping-report-actions">
              <button
                className="btn btn-ghost"
                type="button"
                disabled={busy}
                onClick={() => setReportModalOpen(false)}
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                type="submit"
                disabled={
                  busy ||
                  !reportStartDate ||
                  !reportEndDate ||
                  !selectedReportColumnKeys.length
                }
              >
                {reportFormat === "pdf" ? (
                  <FileText size={16} />
                ) : (
                  <FileSpreadsheet size={16} />
                )}{" "}
                Gerar {reportFormat === "pdf" ? "PDF" : "Excel"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {columnModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <form className="modal-panel wizard-card" onSubmit={submitColumn}>
            <div className="modal-header">
              <h2>{columnForm.id ? "Editar coluna" : "Adicionar coluna"}</h2>
              <button
                className="icon-button"
                type="button"
                disabled={busy}
                onClick={() => setColumnModalOpen(false)}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>
            <div className="form-grid">
              <label className="field">
                Nome da coluna
                <input
                  required
                  disabled={busy}
                  value={columnForm.label}
                  onChange={(event) =>
                    setColumnForm({ ...columnForm, label: event.target.value })
                  }
                />
              </label>
              <label className="field">
                Tipo
                <select
                  disabled={busy}
                  value={columnForm.type}
                  onChange={(event) => {
                    const type = event.target.value as TimekeepingColumnType;
                    setColumnForm({
                      ...columnForm,
                      type,
                      systemField:
                        type === "system"
                          ? columnForm.systemField || "companyGroup"
                          : columnForm.systemField,
                    });
                  }}
                >
                  <option value="text">Texto</option>
                  <option value="number">Número</option>
                  <option value="time">Hora</option>
                  <option value="select">Select</option>
                  <option value="system">Dado do sistema</option>
                  <option value="formula">Fórmula</option>
                </select>
              </label>
              {columnForm.type === "select" ? (
                <label className="field">
                  Relacionar modulo
                  <select
                    disabled={busy}
                    value={columnForm.linkedModule}
                    onChange={(event) =>
                      setColumnForm({
                        ...columnForm,
                        linkedModule: event.target.value,
                      })
                    }
                  >
                    <option value="">Select manual</option>
                    <option value="companies">Empresas</option>
                    <option value="employees">Funcionarios da empresa</option>
                    <option value="departments">Departamentos</option>
                    <option value="sectors">Setores</option>
                    <option value="subsectors">Subsetores</option>
                    <option value="teams">Equipes</option>
                    <option value="benefitContracts">
                      Contratos de beneficio
                    </option>
                    <option value="benefitPlans">Planos de beneficio</option>
                  </select>
                </label>
              ) : null}
              {columnForm.type === "select" && !columnForm.linkedModule ? (
                <label className="field is-wide-field">
                  Opções do select
                  <textarea
                    disabled={busy}
                    value={columnForm.options}
                    onChange={(event) =>
                      setColumnForm({
                        ...columnForm,
                        options: event.target.value,
                      })
                    }
                    placeholder="Uma opção por linha"
                  />
                </label>
              ) : null}
              {columnForm.type === "select" ? (
                <label className="field is-wide-field">
                  Cores das opcoes
                  <textarea
                    disabled={busy}
                    value={columnForm.optionColors}
                    onChange={(event) =>
                      setColumnForm({
                        ...columnForm,
                        optionColors: event.target.value,
                      })
                    }
                    placeholder="Aprovado=#d8f5e7&#10;Pendente=#fff0c7&#10;Recusado=#ffe2e4"
                  />
                </label>
              ) : null}
              {columnForm.type === "system" ? (
                <label className="field">
                  Relacionar dado
                  <select
                    disabled={busy}
                    value={columnForm.systemField}
                    onChange={(event) =>
                      setColumnForm({
                        ...columnForm,
                        systemField: event.target.value,
                      })
                    }
                  >
                    <option value="companyGroup">Grupo</option>
                    <option value="company">Empresa</option>
                    <option value="department">Departamento</option>
                    <option value="sector">Setor</option>
                    <option value="subsector">Subsetor</option>
                    <option value="employee">Funcionário</option>
                    <option value="functionName">Função</option>
                    <option value="realTeam">Equipe real</option>
                    <option value="teamLead">Encarregado da equipe</option>
                  </select>
                </label>
              ) : null}
              {columnForm.type === "formula" ? (
                <label className="field is-wide-field">
                  Fórmula
                  <input
                    disabled={busy}
                    value={columnForm.formula}
                    onChange={(event) =>
                      setColumnForm({
                        ...columnForm,
                        formula: event.target.value,
                      })
                    }
                    placeholder="Ex.: hora_util + he - faltas"
                  />
                </label>
              ) : null}
            </div>
            <div className="form-actions">
              <button
                className="btn btn-ghost"
                disabled={busy}
                type="button"
                onClick={() => setColumnModalOpen(false)}
              >
                Cancelar
              </button>
              <button className="btn btn-primary" disabled={busy} type="submit">
                <Save size={16} /> Salvar coluna
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {statusModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <form
            className="modal-panel wizard-card"
            onSubmit={saveStatusCondition}
          >
            <div className="modal-header">
              <h2>{statusForm.id ? "Editar status" : "Adicionar status"}</h2>
              <button
                className="icon-button"
                type="button"
                disabled={busy}
                onClick={closeStatusModal}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>
            <div className="form-grid">
              <label className="field">
                Rótulo
                <input
                  required
                  disabled={busy}
                  value={statusForm.label}
                  onChange={(event) =>
                    setStatusForm((current) => ({
                      ...current,
                      label: event.target.value,
                    }))
                  }
                  placeholder="Ex.: Presente"
                />
              </label>
              <label className="field">
                Valor interno
                <input
                  disabled={busy}
                  value={statusForm.value}
                  onChange={(event) =>
                    setStatusForm((current) => ({
                      ...current,
                      value: normalizeKey(event.target.value),
                    }))
                  }
                  placeholder="Ex.: present"
                />
              </label>
              <label className="field">
                Cor da linha
                <input
                  disabled={busy}
                  type="color"
                  value={statusForm.rowColor}
                  onChange={(event) =>
                    setStatusForm((current) => ({
                      ...current,
                      rowColor: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="field">
                Cor do texto
                <input
                  disabled={busy}
                  type="color"
                  value={statusForm.textColor}
                  onChange={(event) =>
                    setStatusForm((current) => ({
                      ...current,
                      textColor: event.target.value,
                    }))
                  }
                />
              </label>
              <label className="field">
                Ativo
                <select
                  disabled={busy}
                  value={statusForm.active ? "true" : "false"}
                  onChange={(event) =>
                    setStatusForm((current) => ({
                      ...current,
                      active: event.target.value === "true",
                    }))
                  }
                >
                  <option value="true">Sim</option>
                  <option value="false">Não</option>
                </select>
              </label>
            </div>
            <div className="form-actions">
              <button
                className="btn btn-ghost"
                type="button"
                disabled={busy}
                onClick={resetStatusForm}
              >
                Limpar
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                disabled={busy}
                onClick={closeStatusModal}
              >
                Cancelar
              </button>
              <button className="btn btn-primary" disabled={busy} type="submit">
                <Save size={16} /> {statusForm.id ? "Atualizar" : "Adicionar"}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {pendingManualMetricEdit ? (
        <aside
          role="alertdialog"
          aria-live="assertive"
          aria-label="Confirmação de alteração manual"
          style={{
            position: "fixed",
            right: 24,
            bottom: 24,
            zIndex: 1200,
            width: "min(430px, calc(100vw - 32px))",
            padding: 18,
            borderRadius: 14,
            border: "1px solid #f59e0b",
            background: "#fffaf0",
            boxShadow: "0 18px 45px rgba(15, 23, 42, 0.22)",
            color: "#78350f",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div>
              <strong style={{ display: "block", marginBottom: 6 }}>
                Alteração manual de cálculo
              </strong>
              <p style={{ margin: 0, lineHeight: 1.45 }}>
                A alteração manual da coluna{" "}
                <strong>{pendingManualMetricEdit.columnLabel}</strong> para{" "}
                <strong>{pendingManualMetricEdit.employeeName}</strong> desativa
                o cálculo automático dessa coluna neste registro. O novo valor
                só será salvo depois que você confirmar em OK.
              </p>
              <small style={{ display: "block", marginTop: 8 }}>
                Este aviso aparece apenas uma vez para a tabela do dia{" "}
                {formatDateForDisplay(pendingManualMetricEdit.date)}.
              </small>
            </div>
            <button
              className="icon-button"
              type="button"
              disabled={busy}
              onClick={() => setPendingManualMetricEdit(null)}
              aria-label="Cancelar alteração manual"
            >
              <X size={18} />
            </button>
          </div>
          <div
            className="form-actions"
            style={{ marginTop: 14, justifyContent: "flex-end" }}
          >
            <button
              className="btn btn-ghost"
              type="button"
              disabled={busy}
              onClick={() => setPendingManualMetricEdit(null)}
            >
              Cancelar
            </button>
            <button
              className="btn btn-primary"
              type="button"
              disabled={busy}
              onClick={() => void confirmManualMetricEdit()}
            >
              <Check size={16} /> {busy ? "Salvando..." : "OK"}
            </button>
          </div>
        </aside>
      ) : null}

      {teamScheduleModalOpen ? (
        <div className="modal-backdrop" role="presentation">
          <div
            className="modal-panel wizard-card"
            style={{ maxWidth: 780, width: "100%" }}
            data-testid="team-schedule-modal"
          >
            <div className="modal-header">
              <h2>Alterar ponto da equipe</h2>
              <button
                className="icon-button"
                type="button"
                disabled={applyingTeamSchedule}
                onClick={() => setTeamScheduleModalOpen(false)}
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>
            <p className="panel-subtitle" style={{ padding: "0 4px 10px" }}>
              O horário programado de cada encarregado (ENT.1, SAÍ.1, ENT.2,
              SAÍ.2) será replicado para os colaboradores da equipe no dia{" "}
              {filters.date.split("-").reverse().join("/")}. Expanda uma equipe
              para revisar os colaboradores e desmarcar quem não deve receber.
            </p>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 10,
                maxHeight: 440,
                overflowY: "auto",
                padding: 4,
              }}
            >
              {teamScheduleGroups.length === 0 ? (
                <div className="alert">
                  Nenhuma equipe encontrada com os filtros atuais.
                </div>
              ) : (
                teamScheduleGroups.map((group) => {
                  const expanded = expandedTeamScheduleIds.has(group.teamId);
                  const punches = effectiveTeamPunches(group);
                  const groupHasPunch = teamPunchesHaveAny(punches);
                  const edit = teamScheduleEdits[group.teamId];
                  const punchFields: Array<{
                    key: keyof TeamSchedulePunches;
                    label: string;
                  }> = [
                      { key: "ent1", label: "ENT.1" },
                      { key: "sai1", label: "SAÍ.1" },
                      { key: "ent2", label: "ENT.2" },
                      { key: "sai2", label: "SAÍ.2" },
                    ];
                  const activeCount = groupHasPunch
                    ? group.targets.filter(
                      (employee) =>
                        !excludedTeamScheduleEmployeeIds.has(employee.id),
                    ).length
                    : 0;
                  return (
                    <div
                      key={group.teamId}
                      style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: 12,
                        padding: 12,
                        background: "#ffffff",
                      }}
                      data-testid={`team-schedule-group-${group.teamId}`}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                          gap: 12,
                          cursor: "pointer",
                        }}
                        onClick={() => toggleTeamScheduleExpanded(group.teamId)}
                        data-testid={`team-schedule-toggle-${group.teamId}`}
                      >
                        <div>
                          <strong>{group.teamName}</strong>
                          <div className="muted" style={{ fontSize: 13 }}>
                            Encarregado:{" "}
                            {group.lead ? group.lead.name : "— não encontrado —"}
                          </div>
                          <div className="muted" style={{ fontSize: 13 }}>
                            {group.lead
                              ? `Programado do encarregado · ENT.1 ${group.punches.ent1 || "--:--"} · SAÍ.1 ${group.punches.sai1 || "--:--"} · ENT.2 ${group.punches.ent2 || "--:--"} · SAÍ.2 ${group.punches.sai2 || "--:--"}`
                              : "Sem jornada programada — preencha os campos abaixo."}
                          </div>
                        </div>
                        <div
                          className="muted"
                          style={{ whiteSpace: "nowrap", fontWeight: 600 }}
                        >
                          {activeCount}/{group.targets.length}{" "}
                          {expanded ? "▲" : "▼"}
                        </div>
                      </div>
                      {expanded ? (
                        <div
                          style={{
                            marginTop: 10,
                            display: "flex",
                            flexDirection: "column",
                            gap: 10,
                          }}
                        >
                          <div>
                            <div
                              className="muted"
                              style={{ fontSize: 12, marginBottom: 4 }}
                            >
                              Jornada a aplicar (deixe em branco para usar o
                              horário programado do encarregado):
                            </div>
                            <div
                              style={{ display: "flex", flexWrap: "wrap", gap: 10 }}
                            >
                              {punchFields.map((field) => (
                                <label
                                  key={field.key}
                                  style={{
                                    display: "flex",
                                    flexDirection: "column",
                                    fontSize: 12,
                                    gap: 2,
                                  }}
                                >
                                  <span style={{ fontWeight: 600 }}>
                                    {field.label}
                                  </span>
                                  <input
                                    type="time"
                                    disabled={applyingTeamSchedule}
                                    value={edit?.[field.key] ?? ""}
                                    placeholder={group.punches[field.key] || ""}
                                    onChange={(event) =>
                                      updateTeamScheduleEdit(
                                        group.teamId,
                                        field.key,
                                        event.target.value,
                                      )
                                    }
                                    data-testid={`team-schedule-input-${group.teamId}-${field.key}`}
                                    style={{ padding: "4px 6px" }}
                                  />
                                  <span
                                    className="muted"
                                    style={{ fontSize: 11 }}
                                  >
                                    prog. {group.punches[field.key] || "--:--"}
                                  </span>
                                </label>
                              ))}
                            </div>
                          </div>
                          {group.targets.length === 0 ? (
                            <div className="muted" style={{ fontSize: 13 }}>
                              Nenhum colaborador nesta equipe no filtro atual.
                            </div>
                          ) : (
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "column",
                                gap: 6,
                              }}
                            >
                              {group.targets.map((employee) => {
                                const state = teamScheduleCollaboratorState(
                                  employee,
                                  punches,
                                );
                                const isLead = group.lead?.id === employee.id;
                                const checked = !excludedTeamScheduleEmployeeIds.has(
                                  employee.id,
                                );
                                const didBreak = !noBreakTeamScheduleEmployeeIds.has(
                                  employee.id,
                                );
                                return (
                                  <div
                                    key={employee.id}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: 8,
                                      flexWrap: "wrap",
                                    }}
                                    data-testid={`team-schedule-employee-${employee.id}`}
                                  >
                                    <label
                                      className="check-field"
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 8,
                                        flex: 1,
                                        minWidth: 200,
                                      }}
                                    >
                                      <input
                                        type="checkbox"
                                        disabled={applyingTeamSchedule}
                                        checked={checked}
                                        onChange={() =>
                                          toggleTeamScheduleEmployee(employee.id)
                                        }
                                        data-testid={`team-schedule-employee-checkbox-${employee.id}`}
                                      />
                                      <span style={{ flex: 1 }}>
                                        {employee.name}{" "}
                                        {isLead ? (
                                          <span
                                            style={{
                                              fontSize: 11,
                                              fontWeight: 700,
                                              color: "#1d4ed8",
                                            }}
                                          >
                                            (encarregado)
                                          </span>
                                        ) : null}{" "}
                                        <span
                                          className="muted"
                                          style={{ fontSize: 12 }}
                                        >
                                          · {employee.role || employee.position || "-"}
                                        </span>
                                      </span>
                                    </label>
                                    {state.differs ? (
                                      <span
                                        title={`Já possui ponto lançado: ENT.1 ${state.current.ent1 || "--:--"} · SAÍ.1 ${state.current.sai1 || "--:--"} · ENT.2 ${state.current.ent2 || "--:--"} · SAÍ.2 ${state.current.sai2 || "--:--"}`}
                                        style={{
                                          color: "#b45309",
                                          fontSize: 12,
                                          fontWeight: 600,
                                        }}
                                        data-testid={`team-schedule-conflict-${employee.id}`}
                                      >
                                        já preenchido
                                      </span>
                                    ) : null}
                                    <label
                                      className="check-field"
                                      style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 6,
                                        fontSize: 12,
                                        whiteSpace: "nowrap",
                                      }}
                                      title="Se desmarcar, o intervalo (SAÍ.1 e ENT.2) não será gravado para este funcionário."
                                    >
                                      <input
                                        type="checkbox"
                                        disabled={applyingTeamSchedule || !checked}
                                        checked={checked && didBreak}
                                        onChange={() =>
                                          toggleTeamScheduleNoBreak(employee.id)
                                        }
                                        data-testid={`team-schedule-break-checkbox-${employee.id}`}
                                      />
                                      Fez intervalo
                                    </label>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ) : null}
                    </div>
                  );
                })
              )}
            </div>
            <div
              className="form-actions"
              style={{ marginTop: 14, justifyContent: "space-between" }}
            >
              <button
                className="btn btn-ghost"
                type="button"
                disabled={applyingTeamSchedule}
                onClick={() => setTeamScheduleModalOpen(false)}
                data-testid="team-schedule-cancel-btn"
              >
                Cancelar
              </button>
              <button
                className="btn btn-primary"
                type="button"
                disabled={applyingTeamSchedule || teamScheduleSelectedCount === 0}
                onClick={() => void applyTeamSchedule()}
                data-testid="team-schedule-confirm-btn"
              >
                <Check size={16} />{" "}
                {applyingTeamSchedule
                  ? "Registrando..."
                  : `Registrar todos os ${teamScheduleSelectedCount} funcionário(s)`}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirmDialog ? (
        <ConfirmModal
          title={confirmDialog.title}
          description={confirmDialog.message}
          confirmLabel={confirmDialog.confirmLabel}
          destructive={confirmDialog.variant === "danger"}
          disabled={busy}
          impact={confirmDialog.impact}
          onCancel={() => setConfirmDialog(null)}
          onConfirm={() => void executeConfirm()}
        />
      ) : null}
    </section>
  );
}
