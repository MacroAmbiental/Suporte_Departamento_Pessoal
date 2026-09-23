import ModalPortal from "@/modules/shared/ModalPortal";
import {
  ArrowDown,
  ArrowUp,
  Calculator,
  Check,
  ChevronDown,
  Edit3,
  ExternalLink,
  Eye,
  FileClock,
  Gift,
  GripVertical,
  History,
  MoreVertical,
  Plus,
  PlusCircle,
  RefreshCcw,
  RotateCcw,
  Save,
  Search,
  Settings2,
  ShieldAlert,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState, type DragEvent, type FormEvent, type MouseEvent } from "react";
import { useDomainData } from "@/hooks/useDomainData";
import { useAuth } from "@/hooks/useAuth";
import ConfirmModal from "@/common/components/ConfirmModal";
import type { DeleteImpact } from "@/common/components/DeleteImpactModal";
import { buildDomainDeletionImpact } from "@/common/utils/deletionImpact";
import {
  companyGroupForCompany as resolveCompanyGroupForCompany,
  primaryCompanyGroup,
  structureItemsForGroup,
} from "@/common/utils/groupStructure";
import useCreateShortcut from "@/hooks/useCreateShortcut";
import { loadTimeRecordsRange } from "@/modules/timekeeping/data/timeRecordsRepository";
import type { BenefitContract, BenefitType, Employee, EmployeeBenefit, TimekeepingColumn, TimeRecord } from "@/types/domain";
import { createId, formatCurrency, normalizeUrl, todayISO } from "@/utils/format";
import { parseBenefitExcelFile } from "@/utils/benefitExcelImport";

type TableRow = Record<string, string>;
type FormulaMap = Record<string, string>;
type ColumnWidthMap = Record<string, number>;
type ColumnWrapMap = Record<string, boolean>;
type ColumnMenuPosition = { top: number; left: number };

type EmployeeFilterState = {
  search: string;
  departmentId: string;
  sectorId: string;
  subsectorId: string;
  teamId: string;
  role: string;
  status: string;
};

type FormulaReferenceTable = {
  id: string;
  name: string;
  columns: string[];
  rows: TableRow[];
};

type BenefitDivergence = {
  missingAssigned: string[];
  extraImported: string[];
  matched: string[];
  checkedAt: string;
};

type BenefitTableSnapshot = {
  id: string;
  date: string;
  savedAt: string;
  savedByUserId?: string;
  savedByName?: string;
  savedByUsername?: string;
  changeSummary?: string;
  columns: string[];
  rows: TableRow[];
  formulas: FormulaMap;
  divergenceInfo: string;
  totalRows: number;
  fileName?: string;
};

type BenefitsTab = "employees" | "table" | "settings" | "history";
type EmployeeQuickFilter = "selected" | "unselected" | "ineligible";
type BenefitSurveyPeriod = "15" | "30";
type BenefitSystemPeriod = "first_half" | "second_half" | "month" | "custom";
type BenefitSystemColumnKind = "absences" | "business_days";
type TableSort = { column: string; direction: "asc" | "desc" } | null;

type BenefitSurveyRecord = {
  completedAt: string;
  completedBy?: string;
};

type BenefitSurveyCompletions = Record<string, Partial<Record<BenefitSurveyPeriod, BenefitSurveyRecord>>>;

type BenefitSystemColumnConfig = {
  kind: BenefitSystemColumnKind;
  period: BenefitSystemPeriod;
  startDay?: number;
  endDay?: number;
};

type BenefitSystemColumnConfigMap = Record<string, BenefitSystemColumnConfig>;

type BenefitTimekeepingSettings = {
  usefulMinutesByWeekday: Record<string, number>;
  holidays: string[];
};

type ConfirmDialog = {
  title: string;
  message: string;
  confirmLabel: string;
  variant?: "primary" | "danger";
  impact?: DeleteImpact;
  onConfirm: () => Promise<void> | void;
};

type UndoToast = {
  message: string;
  undo?: () => Promise<void> | void;
};

const defaultBenefitColumns = "Funcionário\nCPF\nMatrícula\nValor\nDesconto\nTotal";
const minColumnWidth = 160;
const defaultColumnWidth = 220;
const maxColumnWidth = 560;
const employeePageSizeOptions = [12, 24, 48, 96];
const timekeepingSettingsColumnKey = "__timekeeping_calculation_settings";
const defaultBenefitTimekeepingSettings: BenefitTimekeepingSettings = {
  usefulMinutesByWeekday: {
    "1": 600,
    "2": 600,
    "3": 600,
    "4": 600,
    "5": 539,
    "6": 0,
    "0": 0,
  },
  holidays: [],
};
const defaultColumnForm: {
  label: string;
  formula: string;
  systemKind: "" | BenefitSystemColumnKind;
  systemPeriod: BenefitSystemPeriod;
  systemStartDay: string;
  systemEndDay: string;
} = {
  label: "",
  formula: "",
  systemKind: "",
  systemPeriod: "first_half",
  systemStartDay: "1",
  systemEndDay: "15",
};
const emptyEmployeeFilters: EmployeeFilterState = {
  search: "",
  departmentId: "",
  sectorId: "",
  subsectorId: "",
  teamId: "",
  role: "",
  status: "",
};
const employeeNameAliases = ["Funcionário", "Funcionario", "Nome", "Empregado", "Colaborador"];
const employeeCpfAliases = ["CPF", "Cpf", "Documento"];
const employeeRegistrationAliases = ["Matrícula", "Matricula", "Registro"];

const employeeStatusLabels: Record<string, string> = {
  active: "Ativo",
  leave: "Afastado",
  terminated: "Desligado",
};

const formulaOperators = [
  { label: "+", value: " + ", title: "Somar" },
  { label: "-", value: " - ", title: "Subtrair" },
  { label: "×", value: " * ", title: "Multiplicar" },
  { label: "÷", value: " / ", title: "Dividir" },
  { label: "(", value: "(", title: "Abrir parêntese" },
  { label: ")", value: ")", title: "Fechar parêntese" },
  { label: ",", value: ",", title: "Decimal com vírgula" },
  { label: ".", value: ".", title: "Decimal com ponto" },
];

const benefitTypeOptions: Array<{ value: BenefitType; label: string }> = [
  { value: "transport", label: "Vale transporte" },
  { value: "meal", label: "Vale refeição" },
  { value: "food", label: "Vale alimentação" },
  { value: "health", label: "Plano de saúde" },
  { value: "dental", label: "Plano odontológico" },
  { value: "custom", label: "Personalizado" },
];

function parseJson<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function normalizeKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseModelColumns(value: string) {
  const seen = new Set<string>();
  return value
    .split(/[\n,;]/)
    .map((column) => column.trim())
    .filter(Boolean)
    .filter((column) => {
      const key = normalizeKey(column);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function getRowValue(row: TableRow, column: string) {
  if (row[column] != null) return row[column];
  const normalizedColumn = normalizeKey(column);
  if (row[normalizedColumn] != null) return row[normalizedColumn];
  const matchingKey = Object.keys(row).find((key) => normalizeKey(key) === normalizedColumn);
  return matchingKey ? row[matchingKey] : "";
}

function formatDateTime(value?: string) {
  if (!value) return "Nunca";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function formatDateOnly(value?: string) {
  if (!value) return "Nunca";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR");
}

function currentMonthValue() {
  return todayISO().slice(0, 7);
}

function monthRange(referenceMonth: string) {
  const [yearValue, monthValue] = referenceMonth.split("-").map(Number);
  const year = yearValue || Number(todayISO().slice(0, 4));
  const month = monthValue || Number(todayISO().slice(5, 7));
  const lastDay = new Date(year, month, 0).getDate();

  return {
    start: `${year}-${String(month).padStart(2, "0")}-01`,
    end: `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`,
    lastDay,
  };
}

function systemPeriodRange(referenceMonth: string, period: BenefitSystemPeriod) {
  const range = monthRange(referenceMonth);
  if (period === "first_half") return { start: range.start, end: `${referenceMonth}-${String(Math.min(15, range.lastDay)).padStart(2, "0")}` };
  if (period === "second_half") return { start: `${referenceMonth}-${String(Math.min(15, range.lastDay)).padStart(2, "0")}`, end: range.end };
  return { start: range.start, end: range.end };
}

function benefitSystemPeriodLabel(period: BenefitSystemPeriod) {
  if (period === "first_half") return "dia 1 a 15";
  if (period === "second_half") return "dia 15 a 30";
  if (period === "custom") return "periodo personalizado";
  return "mes todo";
}

function normalizeMonthDay(value: string | number | undefined, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(31, Math.trunc(parsed)));
}

function customSystemDayRange(referenceMonth: string, startDay?: string | number, endDay?: string | number) {
  const range = monthRange(referenceMonth);
  const monthPrefix = range.start.slice(0, 8);
  const normalizedStart = Math.min(normalizeMonthDay(startDay, 1), range.lastDay);
  const normalizedEnd = Math.min(normalizeMonthDay(endDay, range.lastDay), range.lastDay);
  const firstDay = Math.min(normalizedStart, normalizedEnd);
  const lastDay = Math.max(normalizedStart, normalizedEnd);

  return {
    start: `${monthPrefix}${String(firstDay).padStart(2, "0")}`,
    end: `${monthPrefix}${String(lastDay).padStart(2, "0")}`,
    startDay: firstDay,
    endDay: lastDay,
  };
}

function readBenefitTimekeepingSettings(value?: string): BenefitTimekeepingSettings {
  const parsed = parseJson<Partial<BenefitTimekeepingSettings>>(value, {});
  const usefulMinutesByWeekday = {
    ...defaultBenefitTimekeepingSettings.usefulMinutesByWeekday,
    ...(parsed.usefulMinutesByWeekday || {}),
  };

  return {
    usefulMinutesByWeekday: Object.fromEntries(
      Object.entries(usefulMinutesByWeekday).map(([weekday, minutes]) => [weekday, Number(minutes) || 0]),
    ),
    holidays: Array.isArray(parsed.holidays)
      ? unique(parsed.holidays.map((holiday) => String(holiday)))
      : [],
  };
}

function buildBenefitTimekeepingSettingsByCompanyId(columns: TimekeepingColumn[]) {
  const settingsByCompanyId = new Map<string, BenefitTimekeepingSettings>();
  columns
    .filter((column) => column.key === timekeepingSettingsColumnKey && column.active !== false)
    .forEach((column) => {
      settingsByCompanyId.set(column.companyId || "", readBenefitTimekeepingSettings(column.formula));
    });
  return settingsByCompanyId;
}

function benefitTimekeepingSettingsForCompany(
  companyId: string | undefined,
  settingsByCompanyId: Map<string, BenefitTimekeepingSettings>,
) {
  return (companyId ? settingsByCompanyId.get(companyId) : undefined)
    || settingsByCompanyId.get("")
    || defaultBenefitTimekeepingSettings;
}

function weekdayIndexFromDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).getDay();
}

function businessDaysForSystemRange(
  referenceMonth: string,
  config: BenefitSystemColumnConfig,
  settings: BenefitTimekeepingSettings,
) {
  const range = customSystemDayRange(referenceMonth, config.startDay, config.endDay);
  const monthPrefix = range.start.slice(0, 8);
  const holidays = new Set(settings.holidays.map((holiday) => holiday.trim()).filter(Boolean));
  let total = 0;

  for (let day = range.startDay; day <= range.endDay; day += 1) {
    const date = `${monthPrefix}${String(day).padStart(2, "0")}`;
    const weekday = weekdayIndexFromDate(date);
    const usefulMinutes = Number(settings.usefulMinutesByWeekday[String(weekday)] || 0);
    if (usefulMinutes > 0 && !holidays.has(date)) total += 1;
  }

  return total;
}

function customSystemDayLabel(config: BenefitSystemColumnConfig) {
  const startDay = normalizeMonthDay(config.startDay, 1);
  const endDay = normalizeMonthDay(config.endDay, 31);
  return `dia ${Math.min(startDay, endDay)} a ${Math.max(startDay, endDay)}`;
}

function surveyPeriodLabel(period: BenefitSurveyPeriod) {
  return period === "15" ? "Levantamento dia 15" : "Levantamento dia 30";
}

function unique(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function compareText(left: string, right: string) {
  return left.localeCompare(right, "pt-BR", { numeric: true, sensitivity: "base" });
}

function digitsOnly(value: string) {
  return String(value || "").replace(/\D/g, "");
}

function normalizeText(value: string) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function findColumnByAliases(columns: string[], aliases: string[]) {
  return columns.find((column) => aliases.some((alias) => normalizeKey(column) === normalizeKey(alias)));
}

function findColumnByLabel(columns: string[], label: string) {
  const normalized = normalizeKey(label);
  return columns.find((column) => column === label || normalizeKey(column) === normalized);
}

function ensureEmployeeColumns(columns: string[]) {
  const nextColumns = [...columns];
  if (!findColumnByAliases(nextColumns, employeeNameAliases)) nextColumns.unshift("Funcionário");
  if (!findColumnByAliases(nextColumns, employeeCpfAliases)) nextColumns.push("CPF");
  if (!findColumnByAliases(nextColumns, employeeRegistrationAliases)) nextColumns.push("Matrícula");
  return parseModelColumns(nextColumns.join("\n"));
}

function employeeLabel(employee: Employee) {
  return [employee.name, employee.registration ? `mat. ${employee.registration}` : "", employee.cpf ? `CPF ${employee.cpf}` : ""]
    .filter(Boolean)
    .join(" · ");
}

function rowEmployeeLabel(row: TableRow, columns: string[]) {
  const nameColumn = findColumnByAliases(columns, employeeNameAliases);
  const cpfColumn = findColumnByAliases(columns, employeeCpfAliases);
  const registrationColumn = findColumnByAliases(columns, employeeRegistrationAliases);
  const values = [
    nameColumn ? getRowValue(row, nameColumn) : "",
    registrationColumn ? getRowValue(row, registrationColumn) : "",
    cpfColumn ? getRowValue(row, cpfColumn) : "",
  ].filter(Boolean);

  if (values.length) return values.join(" · ");
  return columns.map((column) => getRowValue(row, column)).find(Boolean) || "Linha sem identificação";
}

function rowsMatchByEmployee(leftRow: TableRow, leftColumns: string[], rightRow: TableRow, rightColumns: string[]) {
  const leftCpf = digitsOnly(getRowValue(leftRow, findColumnByAliases(leftColumns, employeeCpfAliases) || ""));
  const rightCpf = digitsOnly(getRowValue(rightRow, findColumnByAliases(rightColumns, employeeCpfAliases) || ""));
  if (leftCpf && rightCpf && leftCpf === rightCpf) return true;

  const leftRegistration = normalizeText(getRowValue(leftRow, findColumnByAliases(leftColumns, employeeRegistrationAliases) || ""));
  const rightRegistration = normalizeText(getRowValue(rightRow, findColumnByAliases(rightColumns, employeeRegistrationAliases) || ""));
  if (leftRegistration && rightRegistration && leftRegistration === rightRegistration) return true;

  const leftName = normalizeText(getRowValue(leftRow, findColumnByAliases(leftColumns, employeeNameAliases) || ""));
  const rightName = normalizeText(getRowValue(rightRow, findColumnByAliases(rightColumns, employeeNameAliases) || ""));
  return Boolean(leftName && rightName && leftName === rightName);
}

function rowMatchesEmployee(row: TableRow, employee: Employee, columns: string[]) {
  if (row.__employeeId && row.__employeeId === employee.id) return true;

  const nameColumn = findColumnByAliases(columns, employeeNameAliases);
  const cpfColumn = findColumnByAliases(columns, employeeCpfAliases);
  const registrationColumn = findColumnByAliases(columns, employeeRegistrationAliases);
  const nameMatch = Boolean(nameColumn) && normalizeText(getRowValue(row, nameColumn || "")) === normalizeText(employee.name);
  const cpfMatch = Boolean(employee.cpf && cpfColumn) && digitsOnly(getRowValue(row, cpfColumn || "")) === digitsOnly(employee.cpf);
  const registrationMatch = Boolean(employee.registration && registrationColumn)
    && normalizeText(getRowValue(row, registrationColumn || "")) === normalizeText(employee.registration);

  return nameMatch || cpfMatch || registrationMatch;
}

function applyEmployeeToRow(row: TableRow, employee: Employee, columns: string[]) {
  const next: TableRow = { ...row, __employeeId: employee.id };
  const nameColumn = findColumnByAliases(columns, employeeNameAliases);
  const cpfColumn = findColumnByAliases(columns, employeeCpfAliases);
  const registrationColumn = findColumnByAliases(columns, employeeRegistrationAliases);

  if (nameColumn) next[nameColumn] = employee.name;
  if (cpfColumn) next[cpfColumn] = employee.cpf || "";
  if (registrationColumn) next[registrationColumn] = employee.registration || "";
  columns.forEach((column) => {
    if (next[column] == null) next[column] = "";
  });

  return next;
}

function buildRowsForEmployees(sourceRows: TableRow[], employees: Employee[], columns: string[], fallbackRows: TableRow[] = []) {
  const remainingRows = [...sourceRows];
  const remainingFallbackRows = [...fallbackRows];
  return employees.map((employee) => {
    const rowIndex = remainingRows.findIndex((row) => rowMatchesEmployee(row, employee, columns));
    const fallbackIndex = remainingFallbackRows.findIndex((row) => rowMatchesEmployee(row, employee, columns));
    const baseRow = rowIndex >= 0
      ? remainingRows.splice(rowIndex, 1)[0]
      : fallbackIndex >= 0
        ? remainingFallbackRows.splice(fallbackIndex, 1)[0]
        : {};
    return applyEmployeeToRow(baseRow, employee, columns);
  });
}

function buildDivergence(assignedEmployees: Employee[], importedRows: TableRow[], columns: string[]): BenefitDivergence {
  const missingAssigned = assignedEmployees
    .filter((employee) => !importedRows.some((row) => rowMatchesEmployee(row, employee, columns)))
    .map(employeeLabel);
  const extraImported = importedRows
    .filter((row) => !assignedEmployees.some((employee) => rowMatchesEmployee(row, employee, columns)))
    .map((row) => rowEmployeeLabel(row, columns));
  const matched = assignedEmployees
    .filter((employee) => importedRows.some((row) => rowMatchesEmployee(row, employee, columns)))
    .map(employeeLabel);

  return {
    missingAssigned: unique(missingAssigned),
    extraImported: unique(extraImported),
    matched: unique(matched),
    checkedAt: new Date().toISOString(),
  };
}

function formatDivergenceMessage(divergence: BenefitDivergence, assignedCount: number) {
  if (!assignedCount) return "Nenhum funcionário vinculado ao benefício para comparar com a tabela.";

  const parts = [
    divergence.missingAssigned.length ? `${divergence.missingAssigned.length} funcionário(s) com benefício não apareceram na planilha/tabela` : "",
    divergence.extraImported.length ? `${divergence.extraImported.length} funcionário(s) aparecem na planilha/tabela, mas não estão vinculados ao benefício` : "",
  ].filter(Boolean);

  return parts.length ? parts.join(" · ") : `Importação 100% compatível: ${assignedCount} funcionário(s) vinculado(s) encontrado(s).`;
}

function replaceFormulaReference(formula: string, oldColumn: string, newColumn: string) {
  if (!formula) return formula;
  const oldNormalized = normalizeKey(oldColumn);
  const newNormalized = normalizeKey(newColumn);
  return formula
    .replace(new RegExp(`\\b${escapeRegex(oldColumn)}\\b`, "gi"), newColumn)
    .replace(new RegExp(`\\b${escapeRegex(oldNormalized)}\\b`, "gi"), newNormalized);
}

function toNumber(value: string) {
  const normalized = String(value || "")
    .replace(/[^0-9,.-]/g, "")
    .replace(/\.(?=\d{3}(\D|$))/g, "")
    .replace(",", ".");
  const number = Number(normalized);
  return Number.isFinite(number) ? number : 0;
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function replaceLooseReference(input: string, reference: string, value: string) {
  if (!reference) return input;
  return input.replace(new RegExp(`(^|[^A-Za-z0-9_])${escapeRegex(reference)}(?=$|[^A-Za-z0-9_])`, "gi"), (_match, prefix: string) => `${prefix}${value}`);
}

function externalFormulaValue(sourceName: string, columnName: string, row: TableRow, columns: string[], externalTables: FormulaReferenceTable[]) {
  const table = externalTables.find((item) => item.id === sourceName || normalizeKey(item.name) === normalizeKey(sourceName));
  if (!table) return 0;
  const targetColumn = findColumnByLabel(table.columns, columnName);
  if (!targetColumn) return 0;
  const matchingRow = table.rows.find((candidate) => rowsMatchByEmployee(row, columns, candidate, table.columns));
  return matchingRow ? toNumber(getRowValue(matchingRow, targetColumn)) : 0;
}

function formulaTokenValue(token: string, row: TableRow, columns: string[], externalTables: FormulaReferenceTable[]) {
  const parts = token.split("::").map((part) => part.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const columnName = parts.pop() || "";
    return externalFormulaValue(parts.join("::"), columnName, row, columns, externalTables);
  }

  const currentColumn = findColumnByLabel(columns, token);
  return currentColumn ? toNumber(getRowValue(row, currentColumn)) : 0;
}

function calculateFormula(formula: string, row: TableRow, columns: string[], externalTables: FormulaReferenceTable[] = []) {
  const expression = formula.replace(/^=/, "").trim();
  if (!expression) return "";

  let replaced = expression.replace(/\[([^\]]+)\]/g, (_match, token: string) => String(formulaTokenValue(token, row, columns, externalTables)));
  const sortedColumns = [...columns].sort((a, b) => b.length - a.length);
  for (const column of sortedColumns) {
    const value = String(toNumber(getRowValue(row, column) || "0"));
    replaced = replaceLooseReference(replaced, column, value);
    replaced = replaceLooseReference(replaced, normalizeKey(column), value);
  }

  if (!/^[0-9+\-*/().,\s]+$/.test(replaced)) return "";
  try {
    // Fórmulas são restritas a números e operadores aritméticos depois da substituição das colunas.
    const result = Function(`"use strict"; return (${replaced.replace(/,/g, ".")});`)();
    return Number.isFinite(Number(result)) ? (Math.round(Number(result) * 100) / 100).toFixed(2) : "";
  } catch {
    return "";
  }
}


function isCurrencyColumn(column: string) {
  const key = normalizeKey(column);
  return ["valor", "desconto", "total", "saldo", "credito", "reembolso", "liquido", "mensalidade", "custo"]
    .some((part) => key.includes(part));
}

function formatBenefitCell(value: string, column = "") {
  const raw = String(value ?? "").trim();
  if (!raw) return "—";
  const cleaned = raw.replace(/[^0-9,.-]/g, "");
  if (!cleaned) return raw;
  const number = toNumber(cleaned);
  if (isCurrencyColumn(column) && Number.isFinite(number)) return formatCurrency(number);
  const decimalLike = /^-?\d+[.,]\d{3,}$/.test(cleaned) || /^-?\d+\.\d{3,}$/.test(cleaned);
  const hasFloatingNoise = /\d+\.\d{3,}$/.test(cleaned);
  if (!decimalLike && !hasFloatingNoise) return raw;
  return Number.isFinite(number) ? number.toFixed(2) : raw;
}

function recalculateRows(rows: TableRow[], columns: string[], formulas: FormulaMap, externalTables: FormulaReferenceTable[] = []) {
  return rows.map((row) => {
    const next = { ...row };
    for (const column of columns) {
      if (formulas[column]) next[column] = calculateFormula(formulas[column], next, columns, externalTables);
      if (next[column] == null) next[column] = "";
    }
    return next;
  });
}

function readColumns(contract?: BenefitContract) {
  return parseJson<string[]>(contract?.customFields?.modelColumns, []);
}

function readRows(contract?: BenefitContract) {
  return parseJson<TableRow[]>(contract?.customFields?.tableRows, []);
}

function readFormulas(contract?: BenefitContract) {
  return parseJson<FormulaMap>(contract?.customFields?.formulas, {});
}

function readColumnWidths(contract?: BenefitContract) {
  return parseJson<ColumnWidthMap>(contract?.customFields?.columnWidths, {});
}

function readColumnWrap(contract?: BenefitContract) {
  return parseJson<ColumnWrapMap>(contract?.customFields?.columnWrap, {});
}

function readLastUpdate(contract?: BenefitContract) {
  return contract?.customFields?.lastExcelUpdateAt || contract?.customFields?.updatedAt || "";
}

function readDivergence(contract?: BenefitContract) {
  return parseJson<BenefitDivergence>(contract?.customFields?.lastEmployeeDivergenceDetails, {
    missingAssigned: [],
    extraImported: [],
    matched: [],
    checkedAt: "",
  });
}

function readSnapshots(contract?: BenefitContract) {
  return parseJson<BenefitTableSnapshot[]>(contract?.customFields?.tableSnapshots, []);
}

function readSurveyCompletions(contract?: BenefitContract) {
  return parseJson<BenefitSurveyCompletions>(contract?.customFields?.surveyCompletions, {});
}

function readSystemColumnConfigs(contract?: BenefitContract) {
  return parseJson<BenefitSystemColumnConfigMap>(contract?.customFields?.systemColumnConfigs, {});
}

function systemColumnDescription(config?: BenefitSystemColumnConfig) {
  if (!config) return "";
  if (config.kind === "absences") return `Levantamento de faltas - ${benefitSystemPeriodLabel(config.period)}`;
  if (config.kind === "business_days") return `Dias uteis - ${customSystemDayLabel(config)}`;
  return "";
}

function timeRecordAbsenceValue(record: TimeRecord) {
  const counted = Number(record.absenceCount || 0);
  if (Number.isFinite(counted) && counted > 0) return counted;
  return ["absent", "absence_pending", "absence_confirmed"].includes(record.status) ? 1 : 0;
}

function employeeForTableRow(row: TableRow, employees: Employee[], columns: string[]) {
  if (row.__employeeId) {
    const byId = employees.find((employee) => employee.id === row.__employeeId);
    if (byId) return byId;
  }
  return employees.find((employee) => rowMatchesEmployee(row, employee, columns));
}

function applyBenefitSystemColumns(
  baseRows: TableRow[],
  columns: string[],
  configs: BenefitSystemColumnConfigMap,
  timeRecords: TimeRecord[],
  employees: Employee[],
  referenceMonth: string,
  settingsByCompanyId: Map<string, BenefitTimekeepingSettings>,
  fallbackCompanyId: string,
) {
  const activeConfigs = Object.entries(configs).filter(([column]) => columns.includes(column));
  if (!activeConfigs.length) return baseRows;

  return baseRows.map((row) => {
    const employee = employeeForTableRow(row, employees, columns);
    const next = { ...row };
    activeConfigs.forEach(([column, config]) => {
      if (config.kind === "business_days") {
        const settings = benefitTimekeepingSettingsForCompany(employee?.companyId || fallbackCompanyId, settingsByCompanyId);
        next[column] = String(businessDaysForSystemRange(referenceMonth, config, settings));
        return;
      }

      if (!employee || config.kind !== "absences") {
        next[column] = "0";
        return;
      }

      const range = systemPeriodRange(referenceMonth, config.period);
      const absenceCount = timeRecords
        .filter((record) => record.employeeId === employee.id && record.date >= range.start && record.date <= range.end)
        .reduce((total, record) => total + timeRecordAbsenceValue(record), 0);
      next[column] = String(absenceCount);
    });
    return next;
  });
}

function cloneContract(contract: BenefitContract): BenefitContract {
  return { ...contract, customFields: { ...contract.customFields } };
}

function PaginationControls({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const start = total ? (page - 1) * pageSize + 1 : 0;
  const end = Math.min(total, page * pageSize);

  return (
    <div className="benefits-pagination">
      <span>Mostrando {start}-{end} de {total}</span>
      <label>
        <span>Por página</span>
        <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
          {employeePageSizeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
        </select>
      </label>
      <div className="benefits-pagination-actions">
        <button type="button" className="btn btn-secondary" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>Anterior</button>
        <strong>{page} / {pageCount}</strong>
        <button type="button" className="btn btn-secondary" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>Próxima</button>
      </div>
    </div>
  );
}

function appendFormulaValue(currentValue: string, nextValue: string) {
  const base = currentValue.trimEnd();
  const needsSpace = Boolean(base && !base.endsWith("(") && !nextValue.startsWith(")") && !nextValue.startsWith(",") && !nextValue.startsWith("."));
  return `${base}${needsSpace ? " " : ""}${nextValue}`.trimStart();
}

function FormulaBuilder({
  value,
  onChange,
  disabled,
  columns,
  externalTables,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  columns: string[];
  externalTables: FormulaReferenceTable[];
}) {
  const [externalTableId, setExternalTableId] = useState(externalTables[0]?.id || "");
  const selectedExternalTable = externalTables.find((table) => table.id === externalTableId) || externalTables[0];

  useEffect(() => {
    if (!externalTables.length) {
      setExternalTableId("");
      return;
    }
    if (!externalTables.some((table) => table.id === externalTableId)) {
      setExternalTableId(externalTables[0].id);
    }
  }, [externalTableId, externalTables]);

  const insert = (nextValue: string) => onChange(appendFormulaValue(value, nextValue));

  return (
    <div className="benefits-formula-builder">
      <label className="field is-wide-field">
        Fórmula matemática
        <textarea
          disabled={disabled}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="Ex.: [Valor] - [Desconto]"
        />
      </label>
      <div className="benefits-formula-tools">
        <div className="benefits-formula-group">
          <span>Operadores</span>
          <div className="benefits-formula-buttons">
            {formulaOperators.map((operator) => (
              <button
                type="button"
                className="benefits-formula-operator"
                disabled={disabled}
                key={operator.title}
                onClick={() => insert(operator.value)}
                title={operator.title}
              >
                {operator.label}
              </button>
            ))}
          </div>
        </div>
        <div className="benefits-formula-group">
          <span>Colunas desta tabela</span>
          <div className="benefits-formula-buttons">
            {columns.map((column) => (
              <button
                type="button"
                className="benefits-formula-token"
                disabled={disabled}
                key={column}
                onClick={() => insert(`[${column}]`)}
                title={column}
              >
                {column}
              </button>
            ))}
          </div>
        </div>
        <div className="benefits-formula-group">
          <span>Colunas de outros benefícios</span>
          {externalTables.length ? (
            <>
              <select value={selectedExternalTable?.id || ""} onChange={(event) => setExternalTableId(event.target.value)} disabled={disabled}>
                {externalTables.map((table) => <option key={table.id} value={table.id}>{table.name}</option>)}
              </select>
              <div className="benefits-formula-buttons">
                {(selectedExternalTable?.columns || []).map((column) => (
                  <button
                    type="button"
                    className="benefits-formula-token"
                    disabled={disabled}
                    key={`${selectedExternalTable?.id}-${column}`}
                    onClick={() => selectedExternalTable && insert(`[${selectedExternalTable.name}::${column}]`)}
                    title={`${selectedExternalTable?.name || ""} - ${column}`}
                  >
                    {column}
                  </button>
                ))}
              </div>
            </>
          ) : (
            <small>Nenhuma outra tabela de benefício nesta empresa.</small>
          )}
        </div>
      </div>
    </div>
  );
}

function EmployeeFilterControls({
  filters,
  onChange,
  onClear,
  hasActiveFilters,
  departmentOptions,
  sectorOptions,
  subsectorOptions,
  teamOptions,
  roleOptions,
  statusOptions,
  searchPlaceholder,
}: {
  filters: EmployeeFilterState;
  onChange: (filters: EmployeeFilterState) => void;
  onClear: () => void;
  hasActiveFilters: boolean;
  departmentOptions: Array<{ id: string; name: string }>;
  sectorOptions: Array<{ id: string; name: string; departmentId: string }>;
  subsectorOptions: Array<{ id: string; name: string; sectorId: string }>;
  teamOptions: Array<{ id: string; name: string }>;
  roleOptions: string[];
  statusOptions: string[];
  searchPlaceholder: string;
}) {
  const filteredSectorOptions = sectorOptions.filter((sector) => !filters.departmentId || sector.departmentId === filters.departmentId);
  const filteredSubsectorOptions = subsectorOptions.filter((subsector) => !filters.sectorId || subsector.sectorId === filters.sectorId);

  return (
    <div className="benefits-employee-filter-panel">
      <label className="benefits-search-field benefits-employee-search">
        <Search size={16} />
        <input
          placeholder={searchPlaceholder}
          value={filters.search}
          onChange={(event) => onChange({ ...filters, search: event.target.value })}
        />
      </label>
      <select
        aria-label="Filtrar por departamento"
        value={filters.departmentId}
        onChange={(event) => onChange({ ...filters, departmentId: event.target.value, sectorId: "", subsectorId: "" })}
      >
        <option value="">Todos os departamentos</option>
        {departmentOptions.map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
      </select>
      <select
        aria-label="Filtrar por setor"
        value={filters.sectorId}
        onChange={(event) => onChange({ ...filters, sectorId: event.target.value, subsectorId: "" })}
      >
        <option value="">Todos os setores</option>
        {filteredSectorOptions.map((sector) => <option key={sector.id} value={sector.id}>{sector.name}</option>)}
      </select>
      <select
        aria-label="Filtrar por subsetor"
        value={filters.subsectorId}
        onChange={(event) => onChange({ ...filters, subsectorId: event.target.value })}
      >
        <option value="">Todos os subsetores</option>
        {filteredSubsectorOptions.map((subsector) => <option key={subsector.id} value={subsector.id}>{subsector.name}</option>)}
      </select>
      <select
        aria-label="Filtrar por equipe"
        value={filters.teamId}
        onChange={(event) => onChange({ ...filters, teamId: event.target.value })}
      >
        <option value="">Todas as equipes</option>
        {teamOptions.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
      </select>
      <select
        aria-label="Filtrar por função ou cargo"
        value={filters.role}
        onChange={(event) => onChange({ ...filters, role: event.target.value })}
      >
        <option value="">Todas as funções/cargos</option>
        {roleOptions.map((role) => <option key={role} value={role}>{role}</option>)}
      </select>
      <select
        aria-label="Filtrar por status"
        value={filters.status}
        onChange={(event) => onChange({ ...filters, status: event.target.value })}
      >
        <option value="">Todos os status</option>
        {statusOptions.map((status) => <option key={status} value={status}>{employeeStatusLabels[status] || status}</option>)}
      </select>
      {hasActiveFilters ? (
        <button className="btn btn-ghost" type="button" onClick={onClear}><X size={15} /> Limpar filtros</button>
      ) : null}
    </div>
  );
}

export default function Benefits() {
  const data = useDomainData();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [companyFilterIds, setCompanyFilterIds] = useState<string[]>([]);
  const [selectedBenefitId, setSelectedBenefitId] = useState("");
  const [activeTab, setActiveTab] = useState<BenefitsTab>("employees");
  const [moreActionsOpen, setMoreActionsOpen] = useState(false);
  const [newColumnModalOpen, setNewColumnModalOpen] = useState(false);
  const [openRowMenu, setOpenRowMenu] = useState<number | null>(null);
  const [tableSort, setTableSort] = useState<TableSort>(null);
  const [historyPreview, setHistoryPreview] = useState<BenefitTableSnapshot | null>(null);
  const [incompatibilitySelection, setIncompatibilitySelection] = useState<string[]>([]);
  const [benefitModalOpen, setBenefitModalOpen] = useState(false);
  const [benefitForm, setBenefitForm] = useState({
    companyId: data.companies[0]?.id || "",
    name: "",
    modelColumns: defaultBenefitColumns,
  });
  const [editBenefitModalOpen, setEditBenefitModalOpen] = useState(false);
  const [editBenefitForm, setEditBenefitForm] = useState({
    id: "",
    companyId: "",
    name: "",
    providerName: "",
    type: "custom" as BenefitType,
    websiteUrl: "",
    startDate: "",
    endDate: "",
    active: true,
  });
  const [columnForm, setColumnForm] = useState(defaultColumnForm);
  const [editingColumn, setEditingColumn] = useState<string | null>(null);
  const [editColumnForm, setEditColumnForm] = useState({ label: "", formula: "" });
  const [modelEditorOpen, setModelEditorOpen] = useState(false);
  const [modelEditorText, setModelEditorText] = useState("");
  const [rowEditor, setRowEditor] = useState<{ index: number; values: TableRow } | null>(null);
  const [openColumnMenu, setOpenColumnMenu] = useState<string | null>(null);
  const [columnMenuPosition, setColumnMenuPosition] = useState<ColumnMenuPosition | null>(null);
  const [draggingColumn, setDraggingColumn] = useState<string | null>(null);
  const [employeeModalOpen, setEmployeeModalOpen] = useState(false);
  const [employeeFilters, setEmployeeFilters] = useState<EmployeeFilterState>(emptyEmployeeFilters);
  const [employeeQuickFilter, setEmployeeQuickFilter] = useState<EmployeeQuickFilter | null>(null);
  const [employeePage, setEmployeePage] = useState(1);
  const [employeePageSize, setEmployeePageSize] = useState(employeePageSizeOptions[0]);
  const [employeeModalFilters, setEmployeeModalFilters] = useState<EmployeeFilterState>(emptyEmployeeFilters);
  const [employeeModalPage, setEmployeeModalPage] = useState(1);
  const [employeeModalPageSize, setEmployeeModalPageSize] = useState(employeePageSizeOptions[1]);
  const [employeeSelection, setEmployeeSelection] = useState<string[]>([]);
  const [tableFilters, setTableFilters] = useState({ search: "", column: "" });
  const [benefitReferenceMonth, setBenefitReferenceMonth] = useState(currentMonthValue());
  const [systemTimeRecords, setSystemTimeRecords] = useState<TimeRecord[]>([]);
  const [systemTimeRecordsLoading, setSystemTimeRecordsLoading] = useState(false);
  const [updatingExcel, setUpdatingExcel] = useState(false);
  const [savingBenefit, setSavingBenefit] = useState(false);
  const [savingTable, setSavingTable] = useState(false);
  const [lastImportMessage, setLastImportMessage] = useState("");
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [undoToast, setUndoToast] = useState<UndoToast | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);

  const benefits = useMemo(() => data.benefitContracts.filter((benefit) => {
    const haystack = `${benefit.name} ${benefit.providerName}`.toLowerCase();
    return (!companyFilterIds.length || companyFilterIds.includes(benefit.companyId))
      && (!search || haystack.includes(search.toLowerCase()))
      && benefit.customFields?.modelTable === "true";
  }), [companyFilterIds, data.benefitContracts, search]);

  const selectedBenefit = benefits.find((benefit) => benefit.id === selectedBenefitId) || benefits[0];

  useEffect(() => {
    setIncompatibilitySelection(parseJson<string[]>(selectedBenefit?.customFields?.incompatibleBenefitIds, []));
    setBenefitReferenceMonth(selectedBenefit?.customFields?.surveyReferenceMonth || currentMonthValue());
    setMoreActionsOpen(false);
    setOpenRowMenu(null);
    setOpenColumnMenu(null);
  }, [selectedBenefit?.id, selectedBenefit?.customFields?.incompatibleBenefitIds, selectedBenefit?.customFields?.surveyReferenceMonth]);

  const hasActiveListFilters = Boolean(companyFilterIds.length || search);
  const hasActiveTableFilters = Boolean(tableFilters.search || tableFilters.column);
  const selectedCompany = data.companies.find((company) => company.id === selectedBenefit?.companyId);
  const selectedBenefitStructureGroup = useMemo(() => {
    const primary = primaryCompanyGroup(data.companyGroups, data.companyGroupCompanies);
    if (!selectedBenefit?.companyId) return primary;
    return resolveCompanyGroupForCompany(selectedBenefit.companyId, data.companyGroups, data.companyGroupCompanies)
      || primary;
  }, [data.companyGroupCompanies, data.companyGroups, selectedBenefit?.companyId]);
  const columns = readColumns(selectedBenefit);
  const formulas = readFormulas(selectedBenefit);
  const rows = readRows(selectedBenefit);
  const columnWidths = readColumnWidths(selectedBenefit);
  const columnWrap = readColumnWrap(selectedBenefit);
  const systemColumnConfigs = useMemo(() => readSystemColumnConfigs(selectedBenefit), [selectedBenefit]);
  const surveyCompletions = useMemo(() => readSurveyCompletions(selectedBenefit), [selectedBenefit]);
  const timekeepingSettingsByCompanyId = useMemo(
    () => buildBenefitTimekeepingSettingsByCompanyId(data.timekeepingColumns),
    [data.timekeepingColumns],
  );
  const lastUpdate = readLastUpdate(selectedBenefit);
  const busy = savingBenefit || savingTable || updatingExcel || confirmBusy || undoBusy;
  const assignedEmployeeBenefits = useMemo(() => (
    selectedBenefit
      ? data.employeeBenefits.filter((benefit) => benefit.contractId === selectedBenefit.id && benefit.active !== false)
      : []
  ), [data.employeeBenefits, selectedBenefit]);
  const assignedEmployeeIds = useMemo(() => new Set(assignedEmployeeBenefits.map((benefit) => benefit.employeeId)), [assignedEmployeeBenefits]);
  const benefitCompanyEmployees = useMemo(() => data.employees
    .filter((employee) => employee.companyId === selectedBenefit?.companyId && employee.status !== "terminated" && (!employee.admissionDate || employee.admissionDate <= todayISO()))
    .sort((a, b) => a.name.localeCompare(b.name)), [data.employees, selectedBenefit?.companyId]);
  const assignedEmployees = useMemo(() => (
    benefitCompanyEmployees.filter((employee) => assignedEmployeeIds.has(employee.id))
  ), [assignedEmployeeIds, benefitCompanyEmployees]);
  const activeSystemColumnConfigs = useMemo(() => (
    Object.fromEntries(Object.entries(systemColumnConfigs).filter(([column]) => columns.includes(column))) as BenefitSystemColumnConfigMap
  ), [columns, systemColumnConfigs]);
  const hasTimeRecordSystemColumns = Object.values(activeSystemColumnConfigs).some((config) => config.kind === "absences");
  const companyBenefits = useMemo(() => data.benefitContracts
    .filter((benefit) => benefit.companyId === selectedBenefit?.companyId && benefit.customFields?.modelTable === "true")
    .sort((a, b) => compareText(a.name, b.name)), [data.benefitContracts, selectedBenefit?.companyId]);
  const formulaExternalTables = useMemo<FormulaReferenceTable[]>(() => (
    companyBenefits
      .filter((benefit) => benefit.id !== selectedBenefit?.id)
      .map((benefit) => ({
        id: benefit.id,
        name: benefit.name,
        columns: readColumns(benefit),
        rows: readRows(benefit),
      }))
      .filter((benefit) => benefit.columns.length)
  ), [companyBenefits, selectedBenefit?.id]);
  const departmentById = useMemo(() => new Map(data.departments.map((item) => [item.id, item])), [data.departments]);
  const sectorById = useMemo(() => new Map(data.sectors.map((item) => [item.id, item])), [data.sectors]);
  const subsectorById = useMemo(() => new Map(data.subsectors.map((item) => [item.id, item])), [data.subsectors]);
  const teamById = useMemo(() => new Map(data.teams.map((item) => [item.id, item])), [data.teams]);
  const departmentOptions = useMemo(() => structureItemsForGroup(
    data.departments,
    selectedBenefitStructureGroup,
    data.companyGroupCompanies,
    data.companies,
  ), [data.companies, data.companyGroupCompanies, data.departments, selectedBenefitStructureGroup]);
  const sectorOptions = useMemo(() => structureItemsForGroup(
    data.sectors,
    selectedBenefitStructureGroup,
    data.companyGroupCompanies,
    data.companies,
  ), [data.companies, data.companyGroupCompanies, data.sectors, selectedBenefitStructureGroup]);
  const subsectorOptions = useMemo(() => structureItemsForGroup(
    data.subsectors,
    selectedBenefitStructureGroup,
    data.companyGroupCompanies,
    data.companies,
  ), [data.companies, data.companyGroupCompanies, data.subsectors, selectedBenefitStructureGroup]);
  const teamOptions = useMemo(() => structureItemsForGroup(
    data.teams,
    selectedBenefitStructureGroup,
    data.companyGroupCompanies,
    data.companies,
  ), [data.companies, data.companyGroupCompanies, data.teams, selectedBenefitStructureGroup]);
  const roleOptions = useMemo(() => unique(benefitCompanyEmployees.flatMap((employee) => [employee.role, employee.position || ""]))
    .sort(compareText), [benefitCompanyEmployees]);
  const statusOptions = useMemo(() => unique(benefitCompanyEmployees.map((employee) => employee.status))
    .sort((a, b) => compareText(employeeStatusLabels[a] || a, employeeStatusLabels[b] || b)), [benefitCompanyEmployees]);
  const conflictingBenefitIds = useMemo(() => {
    if (!selectedBenefit) return new Set<string>();
    const ids = new Set(parseJson<string[]>(selectedBenefit.customFields?.incompatibleBenefitIds, []));
    companyBenefits.forEach((benefit) => {
      if (benefit.id === selectedBenefit.id) return;
      const reverseRules = parseJson<string[]>(benefit.customFields?.incompatibleBenefitIds, []);
      if (reverseRules.includes(selectedBenefit.id)) ids.add(benefit.id);
    });
    ids.delete(selectedBenefit.id);
    return ids;
  }, [companyBenefits, selectedBenefit]);
  const employeeBenefitConflicts = useMemo(() => {
    const conflicts = new Map<string, string[]>();
    if (!selectedBenefit || !conflictingBenefitIds.size) return conflicts;
    data.employeeBenefits.forEach((employeeBenefit) => {
      if (employeeBenefit.active === false || !conflictingBenefitIds.has(employeeBenefit.contractId)) return;
      const contract = data.benefitContracts.find((benefit) => benefit.id === employeeBenefit.contractId);
      if (!contract) return;
      const current = conflicts.get(employeeBenefit.employeeId) || [];
      if (!current.includes(contract.name)) current.push(contract.name);
      conflicts.set(employeeBenefit.employeeId, current);
    });
    return conflicts;
  }, [conflictingBenefitIds, data.benefitContracts, data.employeeBenefits, selectedBenefit]);
  const employeeMatchesFilters = useMemo(() => (employee: Employee, filters: EmployeeFilterState) => {
    const conflictNames = employeeBenefitConflicts.get(employee.id)?.join(" ") || "";
    const departmentName = departmentById.get(employee.departmentId)?.name || "";
    const sectorName = sectorById.get(employee.sectorId)?.name || "";
    const subsectorName = employee.subsectorId ? subsectorById.get(employee.subsectorId)?.name || "" : "";
    const teamName = employee.teamId ? teamById.get(employee.teamId)?.name || "" : "";
    const statusLabel = employeeStatusLabels[employee.status] || employee.status;
    const needle = normalizeText(filters.search);
    const haystack = normalizeText([
      employee.name,
      employee.registration,
      employee.cpf,
      employee.role,
      employee.position || "",
      departmentName,
      sectorName,
      subsectorName,
      teamName,
      statusLabel,
      conflictNames,
    ].join(" "));

    return (!needle || haystack.includes(needle))
      && (!filters.departmentId || employee.departmentId === filters.departmentId)
      && (!filters.sectorId || employee.sectorId === filters.sectorId)
      && (!filters.subsectorId || (employee.subsectorId || "") === filters.subsectorId)
      && (!filters.teamId || (employee.teamId || "") === filters.teamId)
      && (!filters.role || normalizeKey(employee.role) === normalizeKey(filters.role) || normalizeKey(employee.position || "") === normalizeKey(filters.role))
      && (!filters.status || employee.status === filters.status);
  }, [departmentById, employeeBenefitConflicts, sectorById, subsectorById, teamById]);
  const quickFilteredEmployees = useMemo(() => {
    if (employeeQuickFilter === "unselected") {
      return benefitCompanyEmployees.filter((employee) => !assignedEmployeeIds.has(employee.id));
    }
    if (employeeQuickFilter === "ineligible") {
      return benefitCompanyEmployees.filter((employee) => employeeBenefitConflicts.has(employee.id));
    }
    return assignedEmployees;
  }, [assignedEmployeeIds, assignedEmployees, benefitCompanyEmployees, employeeBenefitConflicts, employeeQuickFilter]);
  const filteredEmployees = useMemo(() => (
    quickFilteredEmployees.filter((employee) => employeeMatchesFilters(employee, employeeFilters))
  ), [employeeFilters, employeeMatchesFilters, quickFilteredEmployees]);
  const employeePageCount = Math.max(1, Math.ceil(filteredEmployees.length / employeePageSize));
  const pagedEmployees = filteredEmployees.slice((employeePage - 1) * employeePageSize, employeePage * employeePageSize);
  const visibleEmployeesForModal = useMemo(() => (
    benefitCompanyEmployees.filter((employee) => employeeMatchesFilters(employee, employeeModalFilters))
  ), [benefitCompanyEmployees, employeeMatchesFilters, employeeModalFilters]);
  const employeeModalPageCount = Math.max(1, Math.ceil(visibleEmployeesForModal.length / employeeModalPageSize));
  const pagedEmployeesForModal = visibleEmployeesForModal.slice((employeeModalPage - 1) * employeeModalPageSize, employeeModalPage * employeeModalPageSize);
  const hasActiveEmployeeFilters = Object.values(employeeFilters).some(Boolean);
  const hasActiveEmployeeModalFilters = Object.values(employeeModalFilters).some(Boolean);

  useEffect(() => {
    setEmployeePage(1);
  }, [
    employeeFilters.search,
    employeeFilters.departmentId,
    employeeFilters.sectorId,
    employeeFilters.subsectorId,
    employeeFilters.teamId,
    employeeFilters.role,
    employeeFilters.status,
    employeeQuickFilter,
    employeePageSize,
    selectedBenefit?.id,
  ]);

  useEffect(() => {
    setEmployeePage((current) => Math.min(current, employeePageCount));
  }, [employeePageCount]);

  useEffect(() => {
    setEmployeeModalPage(1);
  }, [
    employeeModalFilters.search,
    employeeModalFilters.departmentId,
    employeeModalFilters.sectorId,
    employeeModalFilters.subsectorId,
    employeeModalFilters.teamId,
    employeeModalFilters.role,
    employeeModalFilters.status,
    employeeModalPageSize,
    employeeModalOpen,
  ]);

  useEffect(() => {
    setEmployeeModalPage((current) => Math.min(current, employeeModalPageCount));
  }, [employeeModalPageCount]);

  useEffect(() => {
    let active = true;
    if (!hasTimeRecordSystemColumns) {
      setSystemTimeRecords([]);
      setSystemTimeRecordsLoading(false);
      return () => {
        active = false;
      };
    }

    const range = monthRange(benefitReferenceMonth);
    setSystemTimeRecordsLoading(true);
    loadTimeRecordsRange(range.start, range.end)
      .then((records) => {
        if (active) setSystemTimeRecords(records);
      })
      .catch((error) => {
        console.error(error);
        if (active) setSystemTimeRecords([]);
      })
      .finally(() => {
        if (active) setSystemTimeRecordsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [benefitReferenceMonth, hasTimeRecordSystemColumns, selectedBenefit?.id]);

  const displayRows = useMemo(() => (
    recalculateRows(
      applyBenefitSystemColumns(
        rows,
        columns,
        activeSystemColumnConfigs,
        systemTimeRecords,
        benefitCompanyEmployees,
        benefitReferenceMonth,
        timekeepingSettingsByCompanyId,
        selectedBenefit?.companyId || "",
      ),
      columns,
      formulas,
      formulaExternalTables,
    )
  ), [
    activeSystemColumnConfigs,
    benefitCompanyEmployees,
    benefitReferenceMonth,
    columns,
    formulaExternalTables,
    formulas,
    rows,
    selectedBenefit?.companyId,
    systemTimeRecords,
    timekeepingSettingsByCompanyId,
  ]);

  const filteredRows = useMemo(() => {
    const needle = tableFilters.search.trim().toLowerCase();
    const filtered = displayRows.filter((row) => {
      if (!needle) return true;
      const searchableColumns = tableFilters.column ? [tableFilters.column] : columns;
      return searchableColumns.some((column) => getRowValue(row, column).toLowerCase().includes(needle));
    });
    if (!tableSort) return filtered;
    return filtered.slice().sort((rowA, rowB) => {
      const valueA = getRowValue(rowA, tableSort.column).trim();
      const valueB = getRowValue(rowB, tableSort.column).trim();
      const numericA = toNumber(valueA);
      const numericB = toNumber(valueB);
      const bothNumeric = Boolean(valueA && valueB && /\d/.test(valueA) && /\d/.test(valueB));
      const comparison = bothNumeric
        ? numericA - numericB
        : valueA.localeCompare(valueB, "pt-BR", { numeric: true, sensitivity: "base" });
      return tableSort.direction === "asc" ? comparison : -comparison;
    });
  }, [columns, displayRows, tableFilters.column, tableFilters.search, tableSort]);
  const divergenceDetails = readDivergence(selectedBenefit);
  const savedSnapshots = readSnapshots(selectedBenefit);
  function askConfirmation(dialog: ConfirmDialog) {
    setConfirmDialog(dialog);
  }

  function showUndo(message: string, undo?: () => Promise<void> | void) {
    setUndoToast({ message, undo });
    window.setTimeout(() => {
      setUndoToast((current) => (current?.message === message ? null : current));
    }, 9000);
  }

  function selectBenefit(benefitId: string) {
    if (busy) return;
    setSelectedBenefitId(benefitId);
    setActiveTab("employees");
    setEmployeeFilters(emptyEmployeeFilters);
    setEmployeeQuickFilter(null);
    setEmployeeModalFilters(emptyEmployeeFilters);
    setEmployeePage(1);
    setEmployeeModalPage(1);
    setMoreActionsOpen(false);
    setOpenRowMenu(null);
  }

  function openEmployeeModal() {
    if (!selectedBenefit || busy) return;
    setEmployeeSelection(assignedEmployees.map((employee) => employee.id));
    setEmployeeModalFilters(emptyEmployeeFilters);
    setEmployeeModalPage(1);
    setEmployeeModalOpen(true);
  }

  function toggleEmployeeSelection(employeeId: string) {
    setEmployeeSelection((current) => {
      if (current.includes(employeeId)) return current.filter((id) => id !== employeeId);
      if (employeeBenefitConflicts.has(employeeId)) return current;
      return [...current, employeeId];
    });
  }

  function toggleEmployeeQuickFilter(filter: EmployeeQuickFilter) {
    setEmployeeQuickFilter((current) => (current === filter ? null : filter));
  }

  function changeBenefitReferenceMonth(month: string) {
    if (!month) return;
    setBenefitReferenceMonth(month);
    if (selectedBenefit) {
      void saveBenefitCustomFields(selectedBenefit, { surveyReferenceMonth: month });
    }
  }

  async function toggleSurveyCompletion(period: BenefitSurveyPeriod) {
    if (!selectedBenefit || busy) return;

    const previousCompletions = surveyCompletions;
    const monthCompletions = { ...(previousCompletions[benefitReferenceMonth] || {}) };
    const wasCompleted = Boolean(monthCompletions[period]);
    if (wasCompleted) {
      delete monthCompletions[period];
    } else {
      monthCompletions[period] = {
        completedAt: new Date().toISOString(),
        completedBy: user?.username || user?.name || "Usuario nao identificado",
      };
    }

    const nextCompletions: BenefitSurveyCompletions = {
      ...previousCompletions,
      [benefitReferenceMonth]: monthCompletions,
    };
    if (!Object.keys(monthCompletions).length) delete nextCompletions[benefitReferenceMonth];

    await saveBenefitCustomFields(selectedBenefit, {
      surveyCompletions: JSON.stringify(nextCompletions),
      surveyReferenceMonth: benefitReferenceMonth,
    });
    showUndo(wasCompleted ? `${surveyPeriodLabel(period)} reaberto.` : `${surveyPeriodLabel(period)} concluido.`, async () => {
      await saveBenefitCustomFields(selectedBenefit, {
        surveyCompletions: JSON.stringify(previousCompletions),
        surveyReferenceMonth: benefitReferenceMonth,
      });
    });
  }

  function toggleTableSort(column: string) {
    setTableSort((current) => {
      if (!current || current.column !== column) return { column, direction: "asc" };
      if (current.direction === "asc") return { column, direction: "desc" };
      return null;
    });
  }

  function toggleColumnMenu(column: string, event: MouseEvent<HTMLButtonElement>) {
    if (openColumnMenu === column) {
      setOpenColumnMenu(null);
      setColumnMenuPosition(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const menuWidth = 236;
    setColumnMenuPosition({
      top: rect.bottom + 6,
      left: Math.max(12, Math.min(rect.left, window.innerWidth - menuWidth - 12)),
    });
    setOpenColumnMenu(column);
  }

  function visitBenefitSite() {
    if (!selectedBenefit?.websiteUrl) return;
    window.open(normalizeUrl(selectedBenefit.websiteUrl), "_blank", "noopener,noreferrer");
  }

  async function saveEmployeeSelection(event: FormEvent) {
    event.preventDefault();
    if (!selectedBenefit || busy) return;

    const blockedSelected = employeeSelection.filter((employeeId) => employeeBenefitConflicts.has(employeeId));
    if (blockedSelected.length) {
      alert(`${blockedSelected.length} funcionário(s) possuem benefício incompatível. Remova-os da seleção antes de salvar.`);
      return;
    }

    const selectedSet = new Set(employeeSelection);
    const selectedEmployees = benefitCompanyEmployees.filter((employee) => selectedSet.has(employee.id));
    const existingBenefits = data.employeeBenefits.filter((benefit) => benefit.contractId === selectedBenefit.id);
    const existingByEmployee = new Map(existingBenefits.map((benefit) => [benefit.employeeId, benefit]));
    const planId = data.benefitPlans.find((plan) => plan.contractId === selectedBenefit.id)?.id || "";
    const now = new Date().toISOString();

    setSavingTable(true);
    try {
      const changedEmployees = benefitCompanyEmployees.filter((employee) => {
        const existing = existingByEmployee.get(employee.id);
        const isSelected = selectedSet.has(employee.id);
        if (!existing) return isSelected;
        return existing.active !== isSelected;
      });

      await Promise.all(changedEmployees.map((employee) => {
        const existing = existingByEmployee.get(employee.id);
        const isSelected = selectedSet.has(employee.id);
        const payload: Omit<EmployeeBenefit, "id"> & { id?: string } = {
          id: existing?.id,
          employeeId: employee.id,
          companyId: selectedBenefit.companyId,
          contractId: selectedBenefit.id,
          planId: existing?.planId || planId,
          active: isSelected,
          cardNumber: existing?.cardNumber || "",
          balance: existing?.balance || 0,
          monthlyCredit: existing?.monthlyCredit || 0,
          absenceCount: existing?.absenceCount || 0,
          reimbursement: existing?.reimbursement || 0,
          discount: existing?.discount || 0,
          customFields: existing?.customFields || {},
          updatedAt: now,
        };
        return data.upsertEmployeeBenefit(payload);
      }));

      const nextColumns = ensureEmployeeColumns(columns);
      const nextRows = buildRowsForEmployees(rows, selectedEmployees, nextColumns);
      const divergence = buildDivergence(selectedEmployees, nextRows, nextColumns);
      await saveBenefitTable(selectedBenefit, nextColumns, nextRows, formulas, {
        assignedEmployeeIds: JSON.stringify(Array.from(selectedSet)),
        lastEmployeeDivergenceInfo: formatDivergenceMessage(divergence, selectedEmployees.length),
        lastEmployeeDivergenceDetails: JSON.stringify(divergence),
        lastEmployeeSelectionAt: now,
        lastEmployeeSelectionBy: user?.username || user?.name || "Usuário não identificado",
      }, "Funcionários vinculados com sucesso.");
      setEmployeeModalOpen(false);
      showUndo(`${changedEmployees.length} vínculo(s) de funcionário atualizados.`);
    } finally {
      setSavingTable(false);
    }
  }

  async function saveInformationSnapshot() {
    if (!selectedBenefit || busy) return;

    const now = new Date().toISOString();
    const divergenceInfo = selectedBenefit.customFields?.lastEmployeeDivergenceInfo
      || formatDivergenceMessage(buildDivergence(assignedEmployees, rows, columns), assignedEmployees.length);
    const snapshot: BenefitTableSnapshot = {
      id: createId("benefit-snapshot"),
      date: todayISO(),
      savedAt: now,
      savedByUserId: user?.id,
      savedByName: user?.name || "Usuário não identificado",
      savedByUsername: user?.username,
      changeSummary: "Tabela de valores salva manualmente.",
      columns,
      rows: displayRows,
      formulas,
      divergenceInfo,
      totalRows: rows.length,
      fileName: selectedBenefit.customFields?.lastExcelFileName,
    };
    const previousSnapshots = savedSnapshots;

    await saveBenefitCustomFields(selectedBenefit, {
      tableSnapshots: JSON.stringify([snapshot, ...savedSnapshots].slice(0, 180)),
      lastSavedSnapshotAt: now,
    });
    showUndo("Informações salvas no histórico.", async () => {
      await saveBenefitCustomFields(selectedBenefit, {
        tableSnapshots: JSON.stringify(previousSnapshots),
      });
    });
  }

  function confirmBenefitDeletionAccess(description: string) {
    return data.confirmAccessKey({
      title: "Chave de acesso para exclusão",
      description,
      confirmLabel: "Autorizar exclusão",
    });
  }

  async function executeConfirm() {
    if (!confirmDialog || confirmBusy) return;
    setConfirmBusy(true);
    try {
      await confirmDialog.onConfirm();
      setConfirmDialog(null);
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Não foi possível concluir a ação.");
    } finally {
      setConfirmBusy(false);
    }
  }

  async function executeUndo() {
    if (!undoToast?.undo || undoBusy) return;
    setUndoBusy(true);
    try {
      await undoToast.undo();
      setUndoToast(null);
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Não foi possível desfazer a alteração.");
    } finally {
      setUndoBusy(false);
    }
  }

  async function saveBenefitTable(
    contract: BenefitContract,
    nextColumns: string[],
    nextRows: TableRow[],
    nextFormulas: FormulaMap,
    metadata: Record<string, string> = {},
    _successMessage?: string,
    nextSystemColumnConfigs: BenefitSystemColumnConfigMap = systemColumnConfigs,
  ) {
    setSavingTable(true);
    try {
      const now = new Date().toISOString();
      const needsTimeRecords = Object.entries(nextSystemColumnConfigs)
        .some(([column, config]) => nextColumns.includes(column) && config.kind === "absences");
      const range = monthRange(benefitReferenceMonth);
      const recordsForSystem = needsTimeRecords
        ? await loadTimeRecordsRange(range.start, range.end)
        : systemTimeRecords;
      if (needsTimeRecords) setSystemTimeRecords(recordsForSystem);
      const preparedRows = recalculateRows(
        applyBenefitSystemColumns(
          nextRows,
          nextColumns,
          nextSystemColumnConfigs,
          recordsForSystem,
          benefitCompanyEmployees,
          benefitReferenceMonth,
          timekeepingSettingsByCompanyId,
          contract.companyId,
        ),
        nextColumns,
        nextFormulas,
        formulaExternalTables,
      );
      await data.upsertBenefitContract({
        ...contract,
        customFields: {
          ...contract.customFields,
          modelTable: "true",
          modelColumns: JSON.stringify(nextColumns),
          tableRows: JSON.stringify(preparedRows),
          formulas: JSON.stringify(nextFormulas),
          systemColumnConfigs: JSON.stringify(nextSystemColumnConfigs),
          surveyReferenceMonth: benefitReferenceMonth,
          updatedAt: now,
          ...metadata,
        },
      });
    } finally {
      setSavingTable(false);
    }
  }

  async function saveBenefitCustomFields(contract: BenefitContract, customFields: Record<string, string>) {
    setSavingTable(true);
    try {
      await data.upsertBenefitContract({
        ...contract,
        customFields: {
          ...contract.customFields,
          ...customFields,
          updatedAt: new Date().toISOString(),
        },
      });
    } finally {
      setSavingTable(false);
    }
  }

  async function submitBenefit(event: FormEvent) {
    event.preventDefault();
    if (savingBenefit || !benefitForm.companyId || !benefitForm.name.trim()) return;

    const modelColumns = parseModelColumns(benefitForm.modelColumns);
    setSavingBenefit(true);
    try {
      const contract = await data.upsertBenefitContract({
        companyId: benefitForm.companyId,
        name: benefitForm.name.trim(),
        providerName: "Tabela modelo própria",
        type: "custom",
        websiteUrl: "",
        startDate: new Date().toISOString().slice(0, 10),
        endDate: "",
        active: true,
        customFields: {
          modelTable: "true",
          modelColumns: JSON.stringify(modelColumns.length ? modelColumns : ["Funcionário", "Valor", "Total"]),
          tableRows: JSON.stringify([]),
          formulas: JSON.stringify({}),
          columnWidths: JSON.stringify({}),
          columnWrap: JSON.stringify({}),
          updatedAt: new Date().toISOString(),
        },
        createdAt: new Date().toISOString(),
      });

      setSelectedBenefitId(contract.id);
      setBenefitModalOpen(false);
      setBenefitForm({ companyId: benefitForm.companyId, name: "", modelColumns: defaultBenefitColumns });
      showUndo("Benefício criado com sucesso.", async () => {
        const deleted = await data.deleteBenefitContract(contract.id);
        if (deleted) setSelectedBenefitId(benefits[0]?.id || "");
      });
    } finally {
      setSavingBenefit(false);
    }
  }

  function openEditBenefitModal(benefit: BenefitContract, event?: MouseEvent) {
    event?.stopPropagation();
    if (busy) return;
    setEditBenefitForm({
      id: benefit.id,
      companyId: benefit.companyId,
      name: benefit.name,
      providerName: benefit.providerName || "Tabela modelo própria",
      type: benefit.type || "custom",
      websiteUrl: benefit.websiteUrl || "",
      startDate: benefit.startDate || "",
      endDate: benefit.endDate || "",
      active: benefit.active,
    });
    setEditBenefitModalOpen(true);
  }

  async function submitEditBenefit(event: FormEvent) {
    event.preventDefault();
    const benefit = data.benefitContracts.find((item) => item.id === editBenefitForm.id);
    if (!benefit || busy || !editBenefitForm.companyId || !editBenefitForm.name.trim()) return;

    askConfirmation({
      title: "Confirmar alteração",
      message: "Deseja salvar as alterações realizadas neste benefício? Você poderá desfazer essa alteração em seguida.",
      confirmLabel: "Salvar alterações",
      variant: "primary",
      onConfirm: async () => {
        const previousContract = cloneContract(benefit);
        await data.upsertBenefitContract({
          ...benefit,
          companyId: editBenefitForm.companyId,
          name: editBenefitForm.name.trim(),
          providerName: editBenefitForm.providerName.trim() || "Tabela modelo própria",
          type: editBenefitForm.type,
          websiteUrl: editBenefitForm.websiteUrl.trim(),
          startDate: editBenefitForm.startDate,
          endDate: editBenefitForm.endDate,
          active: editBenefitForm.active,
          customFields: {
            ...benefit.customFields,
            updatedAt: new Date().toISOString(),
          },
        });
        setEditBenefitModalOpen(false);
        showUndo("Alteração realizada com sucesso.", async () => {
          await data.upsertBenefitContract(previousContract);
          setSelectedBenefitId(previousContract.id);
        });
      },
    });
  }

  function deleteBenefit(benefit: BenefitContract, event?: MouseEvent) {
    event?.stopPropagation();
    if (busy) return;
    askConfirmation({
      title: "Confirmar exclusão",
      message: "Tem certeza que deseja apagar este benefício? Essa ação poderá alterar os dados cadastrados.",
      confirmLabel: "Apagar",
      variant: "danger",
      impact: buildDomainDeletionImpact(data, "benefitContracts", benefit.id, benefit.name),
      onConfirm: async () => {
        const snapshot = {
          contract: cloneContract(benefit),
          plans: data.benefitPlans.filter((item) => item.contractId === benefit.id),
          employeeBenefits: data.employeeBenefits.filter((item) => item.contractId === benefit.id),
          customFields: data.benefitCustomFields.filter((item) => item.benefitContractId === benefit.id),
        };
        const nextSelected = benefits.find((item) => item.id !== benefit.id)?.id || "";
        const deleted = await data.deleteBenefitContract(benefit.id);
        if (!deleted) return;

        setSelectedBenefitId(nextSelected);
        showUndo("Item apagado com sucesso.", async () => {
          await data.upsertBenefitContract(snapshot.contract);
          await Promise.all(snapshot.plans.map((item) => data.upsertBenefitPlan(item)));
          await Promise.all(snapshot.employeeBenefits.map((item) => data.upsertEmployeeBenefit(item)));
          await Promise.all(snapshot.customFields.map((item) => data.upsertBenefitCustomField(item)));
          setSelectedBenefitId(snapshot.contract.id);
        });
      },
    });
  }

  async function addColumn(event: FormEvent) {
    event.preventDefault();
    if (busy || !selectedBenefit || !columnForm.label.trim()) return;
    const label = columnForm.label.trim();
    if (columns.some((column) => normalizeKey(column) === normalizeKey(label))) {
      alert("Ja existe uma coluna com esse nome.");
      return;
    }
    const nextColumns = parseModelColumns([...columns, label].join("\n"));
    const nextFormulas = { ...formulas };
    const nextSystemColumnConfigs = { ...systemColumnConfigs };
    if (columnForm.systemKind) {
      const startDay = normalizeMonthDay(columnForm.systemStartDay, 1);
      const endDay = normalizeMonthDay(columnForm.systemEndDay, startDay);
      if (columnForm.systemKind === "business_days" && startDay > endDay) {
        alert("O dia inicial precisa ser menor ou igual ao dia final.");
        return;
      }
      delete nextFormulas[label];
      nextSystemColumnConfigs[label] = {
        kind: columnForm.systemKind,
        period: columnForm.systemKind === "business_days" ? "custom" : columnForm.systemPeriod,
        ...(columnForm.systemKind === "business_days" ? { startDay, endDay } : {}),
      };
    } else if (columnForm.formula.trim()) {
      nextFormulas[label] = columnForm.formula.trim();
    }

    askConfirmation({
      title: "Confirmar alteração",
      message: `Deseja criar a coluna "${label}" na tabela deste benefício?`,
      confirmLabel: "Criar coluna",
      variant: "primary",
      onConfirm: async () => {
        await saveBenefitTable(selectedBenefit, nextColumns, rows, nextFormulas, {
          systemColumnConfigs: JSON.stringify(nextSystemColumnConfigs),
        }, "Alteração realizada com sucesso.", nextSystemColumnConfigs);
        setColumnForm(defaultColumnForm);
        setNewColumnModalOpen(false);
      },
    });
  }

  function startEditColumn(column: string) {
    if (busy) return;
    setOpenColumnMenu(null);
    setColumnMenuPosition(null);
    setActiveTab("settings");
    setEditingColumn(column);
    setEditColumnForm({ label: column, formula: systemColumnConfigs[column] ? "" : formulas[column] || "" });
  }

  async function submitEditColumn(event: FormEvent) {
    event.preventDefault();
    if (busy || !selectedBenefit || !editingColumn) return;
    const nextLabel = editColumnForm.label.trim();
    if (!nextLabel) return;
    if (nextLabel !== editingColumn && columns.some((column) => column !== editingColumn && normalizeKey(column) === normalizeKey(nextLabel))) {
      alert("Já existe uma coluna com esse nome.");
      return;
    }

    const nextColumns = columns.map((column) => column === editingColumn ? nextLabel : column);
    const nextRows = rows.map((row) => {
      const clone = { ...row };
      if (nextLabel !== editingColumn) {
        clone[nextLabel] = getRowValue(row, editingColumn);
        delete clone[editingColumn];
      }
      return clone;
    });
    const nextFormulas: FormulaMap = {};
    Object.entries(formulas).forEach(([column, formula]) => {
      const targetColumn = column === editingColumn ? nextLabel : column;
      nextFormulas[targetColumn] = replaceFormulaReference(formula, editingColumn, nextLabel);
    });
    const trimmedFormula = editColumnForm.formula.trim();
    if (trimmedFormula) nextFormulas[nextLabel] = trimmedFormula;
    else delete nextFormulas[nextLabel];
    const nextSystemColumnConfigs = { ...systemColumnConfigs };
    if (nextSystemColumnConfigs[editingColumn]) {
      nextSystemColumnConfigs[nextLabel] = nextSystemColumnConfigs[editingColumn];
      if (nextLabel !== editingColumn) delete nextSystemColumnConfigs[editingColumn];
      delete nextFormulas[nextLabel];
    }

    const previousColumn = editingColumn;
    askConfirmation({
      title: "Confirmar alteração",
      message: `Deseja salvar as alterações da coluna "${previousColumn}"? Você poderá desfazer essa alteração em seguida.`,
      confirmLabel: "Salvar alterações",
      variant: "primary",
      onConfirm: async () => {
        const nextWidths = { ...columnWidths };
        const nextWrap = { ...columnWrap };
        if (nextLabel !== previousColumn) {
          if (nextWidths[previousColumn]) {
            nextWidths[nextLabel] = nextWidths[previousColumn];
            delete nextWidths[previousColumn];
          }
          if (nextWrap[previousColumn] != null) {
            nextWrap[nextLabel] = nextWrap[previousColumn];
            delete nextWrap[previousColumn];
          }
        }
        await saveBenefitTable(selectedBenefit, nextColumns, nextRows, nextFormulas, {
          columnWidths: JSON.stringify(nextWidths),
          columnWrap: JSON.stringify(nextWrap),
          systemColumnConfigs: JSON.stringify(nextSystemColumnConfigs),
        }, "Alteração realizada com sucesso.", nextSystemColumnConfigs);
        setEditingColumn(null);
        setEditColumnForm({ label: "", formula: "" });
      },
    });
  }

  function startEditRow(rowIndex: number) {
    if (busy) return;
    setRowEditor({
      index: rowIndex,
      values: columns.reduce<TableRow>((acc, column) => {
        acc[column] = getRowValue(rows[rowIndex] || {}, column);
        return acc;
      }, {}),
    });
  }

  async function submitEditRow(event: FormEvent) {
    event.preventDefault();
    if (!selectedBenefit || !rowEditor || busy) return;
    askConfirmation({
      title: "Confirmar alteração",
      message: "Deseja salvar as alterações realizadas nesta linha? Você poderá desfazer essa alteração em seguida.",
      confirmLabel: "Salvar alterações",
      variant: "primary",
      onConfirm: async () => {
        const nextRows = rows.map((row, index) => (index === rowEditor.index ? { ...row, ...rowEditor.values } : row));
        await saveBenefitTable(selectedBenefit, columns, nextRows, formulas, {}, "Alteração realizada com sucesso.");
        setRowEditor(null);
      },
    });
  }

  function addEmptyRow() {
    if (!selectedBenefit || busy || !columns.length) return;
    askConfirmation({
      title: "Confirmar alteração",
      message: "Deseja adicionar uma linha vazia nesta tabela?",
      confirmLabel: "Adicionar linha",
      variant: "primary",
      onConfirm: async () => {
        const emptyRow = columns.reduce<TableRow>((acc, column) => ({ ...acc, [column]: "" }), {});
        await saveBenefitTable(selectedBenefit, columns, [...rows, emptyRow], formulas, {}, "Alteração realizada com sucesso.");
      },
    });
  }

  function deleteRow(rowIndex: number) {
    if (!selectedBenefit || busy) return;
    askConfirmation({
      title: "Confirmar exclusão",
      message: "Tem certeza que deseja apagar esta linha? Essa ação poderá alterar os dados cadastrados.",
      confirmLabel: "Apagar",
      variant: "danger",
      impact: {
        entityType: "linha da tabela de benefício",
        entityLabel: rows[rowIndex]?.[columns[0]] || `Linha ${rowIndex + 1}`,
        reasons: ["A linha contém dados de um funcionário ou lançamento do benefício."],
        links: [{ label: "Células preenchidas", count: Object.values(rows[rowIndex] || {}).filter((value) => String(value || "").trim()).length }],
        consequences: ["A linha inteira será removida da tabela atual.", "Os valores desta linha deixarão de compor totais e fórmulas."],
      },
      onConfirm: async () => {
        const authorized = await confirmBenefitDeletionAccess("Informe uma chave ativa cadastrada na coleção accessKeys para apagar esta linha da tabela do benefício.");
        if (!authorized) return;

        const nextRows = rows.filter((_, index) => index !== rowIndex);
        await saveBenefitTable(selectedBenefit, columns, nextRows, formulas, {}, "Item apagado com sucesso.");
      },
    });
  }

  async function handleExcelUpdate(file?: File) {
    if (!file || !selectedBenefit || updatingExcel) return;
    if (!assignedEmployees.length) {
      alert("Vincule os funcionários ao benefício antes de importar. A tabela só recarrega pessoas cadastradas neste benefício.");
      return;
    }
    const baseModelColumns = readColumns(selectedBenefit).length ? readColumns(selectedBenefit) : columns;
    const modelColumns = assignedEmployees.length ? ensureEmployeeColumns(baseModelColumns) : baseModelColumns;
    if (!modelColumns.length) {
      alert("Cadastre ou recrie as colunas da tabela modelo antes de importar o Excel.");
      return;
    }

    setUpdatingExcel(true);
    setLastImportMessage("");
    try {
      const imported = await parseBenefitExcelFile(file, modelColumns);
      const normalizedRows = imported.rows.map((row) => {
        const next: TableRow = {};
        for (const column of modelColumns) {
          next[column] = formulas[column] ? "" : getRowValue(row, column);
        }
        return next;
      });
      const nextRows = buildRowsForEmployees(normalizedRows, assignedEmployees, modelColumns, rows);
      const divergence = buildDivergence(assignedEmployees, normalizedRows, modelColumns);
      const now = new Date().toISOString();
      const divergenceMessage = formatDivergenceMessage(divergence, assignedEmployees.length);
      const messageParts = [
        `${nextRows.length} funcionário(s) do benefício recarregado(s)`,
        `${normalizedRows.length} linha(s) lida(s) na importação via ${imported.source === "python" ? "Python" : "leitura local"}`,
        imported.matchedColumns.length ? `colunas lidas: ${imported.matchedColumns.join(", ")}` : "nenhuma coluna do modelo encontrada",
        imported.ignoredExcelColumns.length ? `ignoradas do Excel: ${imported.ignoredExcelColumns.join(", ")}` : "",
        imported.ignoredModelColumns.length ? `sem correspondência no Excel: ${imported.ignoredModelColumns.join(", ")}` : "",
        divergenceMessage,
      ].filter(Boolean).join(" · ");

      await saveBenefitTable(selectedBenefit, modelColumns, nextRows, formulas, {
        lastExcelUpdateAt: now,
        lastExcelFileName: file.name,
        lastExcelImportInfo: messageParts,
        lastEmployeeDivergenceInfo: divergenceMessage,
        lastEmployeeDivergenceDetails: JSON.stringify(divergence),
      }, "Tabela atualizada com sucesso.");
      setLastImportMessage(messageParts);
    } catch (error) {
      console.error(error);
      alert(error instanceof Error ? error.message : "Não foi possível atualizar a tabela com este Excel. Verifique o arquivo e tente novamente.");
    } finally {
      setUpdatingExcel(false);
    }
  }

  function deleteColumn(column: string) {
    if (busy || !selectedBenefit) return;
    setOpenColumnMenu(null);
    setColumnMenuPosition(null);
    askConfirmation({
      title: "Confirmar exclusão",
      message: `Tem certeza que deseja apagar a coluna "${column}"? Essa ação poderá alterar os dados cadastrados.`,
      confirmLabel: "Apagar",
      variant: "danger",
      impact: {
        entityType: "coluna da tabela de benefício",
        entityLabel: column,
        reasons: ["A coluna pode conter valores em várias linhas e participar de fórmulas."],
        links: [
          { label: "Linhas afetadas", count: rows.filter((row) => String(row[column] || "").trim()).length },
          { label: "Fórmulas que usam a coluna", count: Object.entries(formulas).filter(([target, formula]) => target === column || String(formula).toLowerCase().includes(column.toLowerCase())).length },
        ],
        consequences: ["A coluna e todos os valores nela preenchidos serão removidos.", "Fórmulas ligadas à coluna poderão deixar de funcionar ou serão removidas."],
      },
      onConfirm: async () => {
        const authorized = await confirmBenefitDeletionAccess("Informe uma chave ativa cadastrada na coleção accessKeys para apagar esta coluna da tabela do benefício.");
        if (!authorized) return;

        const nextColumns = columns.filter((item) => item !== column);
        const nextFormulas = { ...formulas };
        delete nextFormulas[column];
        const nextWidths = { ...columnWidths };
        const nextWrap = { ...columnWrap };
        const nextSystemColumnConfigs = { ...systemColumnConfigs };
        delete nextWidths[column];
        delete nextWrap[column];
        delete nextSystemColumnConfigs[column];
        const nextRows = rows.map((row) => {
          const clone = { ...row };
          delete clone[column];
          return clone;
        });
        await saveBenefitTable(selectedBenefit, nextColumns, nextRows, nextFormulas, {
          columnWidths: JSON.stringify(nextWidths),
          columnWrap: JSON.stringify(nextWrap),
          systemColumnConfigs: JSON.stringify(nextSystemColumnConfigs),
        }, "Item apagado com sucesso.", nextSystemColumnConfigs);
      },
    });
  }

  function openModelEditor() {
    if (!selectedBenefit || busy) return;
    setModelEditorText(columns.join("\n"));
    setModelEditorOpen(true);
  }

  async function saveModelEditor(event: FormEvent) {
    event.preventDefault();
    if (!selectedBenefit || busy) return;
    const nextColumns = parseModelColumns(modelEditorText);
    if (!nextColumns.length) {
      alert("Informe ao menos uma coluna para a tabela modelo.");
      return;
    }

    const nextRows = rows.map((row) => nextColumns.reduce<TableRow>((acc, column) => {
      acc[column] = getRowValue(row, column);
      return acc;
    }, {}));
    const nextFormulas = nextColumns.reduce<FormulaMap>((acc, column) => {
      const existing = Object.entries(formulas).find(([key]) => normalizeKey(key) === normalizeKey(column));
      if (existing) acc[column] = existing[1];
      return acc;
    }, {});
    const nextWidths = nextColumns.reduce<ColumnWidthMap>((acc, column) => {
      const existing = Object.entries(columnWidths).find(([key]) => normalizeKey(key) === normalizeKey(column));
      if (existing) acc[column] = existing[1];
      return acc;
    }, {});
    const nextWrap = nextColumns.reduce<ColumnWrapMap>((acc, column) => {
      const existing = Object.entries(columnWrap).find(([key]) => normalizeKey(key) === normalizeKey(column));
      if (existing) acc[column] = existing[1];
      return acc;
    }, {});
    const nextSystemColumnConfigs = nextColumns.reduce<BenefitSystemColumnConfigMap>((acc, column) => {
      const existing = Object.entries(systemColumnConfigs).find(([key]) => normalizeKey(key) === normalizeKey(column));
      if (existing) acc[column] = existing[1];
      return acc;
    }, {});

    askConfirmation({
      title: "Confirmar alteração",
      message: "Deseja refazer a tabela modelo? As linhas serão reorganizadas conforme as novas colunas.",
      confirmLabel: "Salvar nova tabela",
      variant: "primary",
      onConfirm: async () => {
        await saveBenefitTable(selectedBenefit, nextColumns, nextRows, nextFormulas, {
          columnWidths: JSON.stringify(nextWidths),
          columnWrap: JSON.stringify(nextWrap),
          systemColumnConfigs: JSON.stringify(nextSystemColumnConfigs),
          modelUpdatedAt: new Date().toISOString(),
        }, "Alteração realizada com sucesso.", nextSystemColumnConfigs);
        setModelEditorOpen(false);
      },
    });
  }

  function clearBenefitTable() {
    if (!selectedBenefit || busy) return;
    askConfirmation({
      title: "Confirmar exclusão",
      message: "Tem certeza que deseja apagar toda a tabela deste benefício? As colunas, fórmulas e linhas importadas serão removidas para você criar outra.",
      confirmLabel: "Apagar tabela",
      variant: "danger",
      impact: {
        entityType: "tabela de benefício",
        entityLabel: selectedBenefit.name,
        reasons: ["A tabela contém a estrutura e os valores atuais do benefício."],
        links: [
          { label: "Colunas", count: columns.length },
          { label: "Linhas", count: rows.length },
          { label: "Fórmulas", count: Object.keys(formulas).length },
        ],
        consequences: ["Todas as colunas, linhas, fórmulas e configurações visuais serão removidas.", "O benefício permanecerá cadastrado, mas sem tabela de valores."],
      },
      onConfirm: async () => {
        const authorized = await confirmBenefitDeletionAccess("Informe uma chave ativa cadastrada na coleção accessKeys para apagar toda a tabela deste benefício.");
        if (!authorized) return;

        await saveBenefitTable(selectedBenefit, [], [], {}, {
          columnWidths: JSON.stringify({}),
          columnWrap: JSON.stringify({}),
          lastExcelUpdateAt: "",
          lastExcelFileName: "",
          lastExcelImportInfo: "",
          lastEmployeeDivergenceInfo: "",
          lastEmployeeDivergenceDetails: "",
          systemColumnConfigs: JSON.stringify({}),
          modelUpdatedAt: new Date().toISOString(),
        }, "Item apagado com sucesso.", {});
        setEditingColumn(null);
        setLastImportMessage("");
      },
    });
  }


  async function reorderColumn(sourceColumn: string, targetColumn: string) {
    if (!selectedBenefit || busy) return;
    if (sourceColumn === targetColumn) return;
    const currentIndex = columns.indexOf(sourceColumn);
    const targetIndex = columns.indexOf(targetColumn);
    if (currentIndex < 0 || targetIndex < 0) return;
    const nextColumns = [...columns];
    const [movedColumn] = nextColumns.splice(currentIndex, 1);
    nextColumns.splice(targetIndex, 0, movedColumn);
    await saveBenefitTable(selectedBenefit, nextColumns, rows, formulas, {}, "Ordem das colunas atualizada.");
  }

  function handleColumnDragStart(column: string, event: DragEvent<HTMLDivElement>) {
    if (busy) {
      event.preventDefault();
      return;
    }
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", column);
    setDraggingColumn(column);
  }

  function handleColumnDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  async function handleColumnDrop(targetColumn: string, event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const sourceColumn = event.dataTransfer.getData("text/plain") || draggingColumn;
    setDraggingColumn(null);
    if (!sourceColumn) return;
    await reorderColumn(sourceColumn, targetColumn);
  }

  function handleColumnDragEnd() {
    setDraggingColumn(null);
  }

  async function saveIncompatibilityRules() {
    if (!selectedBenefit || busy) return;
    const previous = parseJson<string[]>(selectedBenefit.customFields?.incompatibleBenefitIds, []);
    await saveBenefitCustomFields(selectedBenefit, {
      incompatibleBenefitIds: JSON.stringify(incompatibilitySelection),
      incompatibilityRulesUpdatedAt: new Date().toISOString(),
      incompatibilityRulesUpdatedBy: user?.username || user?.name || "Usuário não identificado",
    });
    showUndo("Regras de incompatibilidade atualizadas.", async () => {
      await saveBenefitCustomFields(selectedBenefit, {
        incompatibleBenefitIds: JSON.stringify(previous),
      });
    });
  }

  function restoreSnapshot(snapshot: BenefitTableSnapshot) {
    if (!selectedBenefit || busy) return;
    setHistoryPreview(null);
    askConfirmation({
      title: "Restaurar versão salva",
      message: `Deseja restaurar a tabela salva em ${formatDateTime(snapshot.savedAt)}? A tabela atual será substituída, mas poderá ser recuperada pelo histórico.`,
      confirmLabel: "Restaurar versão",
      variant: "primary",
      onConfirm: async () => {
        const currentColumns = columns;
        const currentRows = rows;
        const currentFormulas = formulas;
        await saveBenefitTable(selectedBenefit, snapshot.columns, snapshot.rows, snapshot.formulas, {
          lastRestoredSnapshotId: snapshot.id,
          lastRestoredAt: new Date().toISOString(),
          lastRestoredBy: user?.username || user?.name || "Usuário não identificado",
        }, "Versão restaurada.");
        setActiveTab("table");
        setHistoryPreview(null);
        showUndo("Versão do histórico restaurada.", async () => {
          await saveBenefitTable(selectedBenefit, currentColumns, currentRows, currentFormulas);
        });
      },
    });
  }

  async function resizeColumn(column: string, delta: number) {
    if (!selectedBenefit || busy) return;
    const currentWidth = columnWidths[column] || defaultColumnWidth;
    const nextWidth = Math.max(minColumnWidth, Math.min(maxColumnWidth, currentWidth + delta));
    await saveBenefitCustomFields(selectedBenefit, {
      columnWidths: JSON.stringify({ ...columnWidths, [column]: nextWidth }),
    });
    setOpenColumnMenu(null);
    setColumnMenuPosition(null);
  }

  async function toggleColumnWrap(column: string) {
    if (!selectedBenefit || busy) return;
    await saveBenefitCustomFields(selectedBenefit, {
      columnWrap: JSON.stringify({ ...columnWrap, [column]: !columnWrap[column] }),
    });
    setOpenColumnMenu(null);
    setColumnMenuPosition(null);
  }

  const totalColumn = columns.find((column) => normalizeKey(column) === "total");
  const grandTotal = totalColumn ? displayRows.reduce((sum, row) => sum + toNumber(row[totalColumn]), 0) : 0;
  const storedImportMessage = selectedBenefit?.customFields?.lastExcelImportInfo || lastImportMessage;
  const storedDivergenceMessage = selectedBenefit?.customFields?.lastEmployeeDivergenceInfo;
  const hasDivergence = Boolean(divergenceDetails.missingAssigned.length || divergenceDetails.extraImported.length);
  const currentSurveyCompletions = surveyCompletions[benefitReferenceMonth] || {};
  const unassignedEmployeeCount = Math.max(0, benefitCompanyEmployees.length - assignedEmployees.length);
  const ineligibleEmployeeCount = benefitCompanyEmployees.filter((employee) => employeeBenefitConflicts.has(employee.id)).length;
  const selectedUnassignedCount = Math.max(0, benefitCompanyEmployees.length - employeeSelection.length);
  const conflictingAssignedEmployees = assignedEmployees.filter((employee) => employeeBenefitConflicts.has(employee.id));
  const sortedSnapshots = savedSnapshots.slice().sort((a, b) => b.savedAt.localeCompare(a.savedAt));

  useCreateShortcut(() => {
    if (savingBenefit) return;
    setBenefitModalOpen(true);
  });

  return (
    <section className="page benefits-page benefits-redesign">
      <div className="page-header benefits-simple-header">
        <div>
          <h1 className="page-title">Benefícios</h1>
          <p className="page-subtitle">Gerencie os benefícios e os funcionários vinculados.</p>
        </div>
        <div className="benefits-header-controls">
          <select
            aria-label="Filtrar por empresa"
            value={companyFilterIds[0] || ""}
            onChange={(event) => setCompanyFilterIds(event.target.value ? [event.target.value] : [])}
          >
            <option value="">Todas as empresas</option>
            {data.companies.map((company) => <option value={company.id} key={company.id}>{company.name}</option>)}
          </select>
          <label className="benefits-search-field">
            <Search size={17} />
            <input placeholder="Buscar benefício" value={search} onChange={(event) => setSearch(event.target.value)} />
            {hasActiveListFilters ? (
              <button type="button" className="benefits-search-clear" onClick={() => { setCompanyFilterIds([]); setSearch(""); }} aria-label="Limpar filtros"><X size={15} /></button>
            ) : null}
          </label>
          <button className="btn btn-primary" type="button" disabled={savingBenefit} onClick={() => setBenefitModalOpen(true)}>
            <Plus size={17} /> Novo benefício
          </button>
        </div>
      </div>

      <div className="benefits-workspace">
        <aside className="benefits-navigation" aria-label="Lista de benefícios">
          <div className="benefits-navigation-header">
            <div>
              <span className="benefits-navigation-eyebrow">BENEFÍCIOS</span>
              <strong>{benefits.length} cadastrado(s)</strong>
            </div>
            <button className="icon-button" type="button" disabled={savingBenefit} onClick={() => setBenefitModalOpen(true)} aria-label="Novo benefício"><Plus size={17} /></button>
          </div>
          <div className="benefits-navigation-list">
            {benefits.map((benefit) => {
              const employeeCount = data.employeeBenefits.filter((item) => item.contractId === benefit.id && item.active !== false).length;
              return (
                <button
                  type="button"
                  className={`benefits-navigation-item ${benefit.id === selectedBenefit?.id ? "is-selected" : ""}`}
                  key={benefit.id}
                  disabled={busy}
                  onClick={() => selectBenefit(benefit.id)}
                >
                  <span className="benefits-navigation-accent" />
                  <span className="benefits-navigation-copy">
                    <strong>{benefit.name}</strong>
                    <small>Atualizado em {formatDateOnly(readLastUpdate(benefit))}</small>
                  </span>
                  <span className="benefits-navigation-count">{employeeCount} {employeeCount === 1 ? "funcionário" : "funcionários"}</span>
                </button>
              );
            })}
            {!benefits.length ? <p className="benefits-empty-state">Nenhum benefício encontrado.</p> : null}
          </div>
        </aside>

        <main className="benefits-detail">
          {selectedBenefit ? (
            <>
              <header className="benefits-detail-header">
                <div className="benefits-detail-title">
                  <span className="benefits-detail-icon"><Gift size={22} /></span>
                  <div>
                    <h2>{selectedBenefit.name}</h2>
                    <p>{selectedCompany?.name || "Empresa não informada"}</p>
                    <div className="benefits-detail-meta">
                      <span>{assignedEmployees.length} {assignedEmployees.length === 1 ? "funcionário" : "funcionários"}</span>
                      <span>•</span>
                      <span>Total {formatCurrency(grandTotal)}</span>
                      <span>•</span>
                      <span>Atualizado em {formatDateTime(lastUpdate)}</span>
                    </div>
                  </div>
                </div>
                <div className="benefits-detail-actions">
                  <button className="btn btn-secondary" type="button" disabled={busy} onClick={() => openEditBenefitModal(selectedBenefit)}><Edit3 size={16} /> Editar benefício</button>
                  <button className="btn btn-secondary" type="button" disabled={busy || !selectedBenefit.websiteUrl} onClick={visitBenefitSite}><ExternalLink size={16} /> Visitar site</button>
                  <div className="benefits-more-wrap">
                    <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => setMoreActionsOpen((current) => !current)}>
                      <MoreVertical size={16} /> Mais ações <ChevronDown size={15} />
                    </button>
                    {moreActionsOpen ? (
                      <div className="benefits-more-menu">
                        <button type="button" onClick={() => { setMoreActionsOpen(false); openModelEditor(); }}><RefreshCcw size={15} /> Refazer tabela</button>
                        <button type="button" onClick={() => { setMoreActionsOpen(false); setActiveTab("settings"); }}><Settings2 size={15} /> Configurações</button>
                        <button type="button" onClick={() => { setMoreActionsOpen(false); setActiveTab("history"); }}><History size={15} /> Histórico de atualizações</button>
                        <button type="button" className="is-danger" onClick={() => { setMoreActionsOpen(false); deleteBenefit(selectedBenefit); }}><Trash2 size={15} /> Excluir benefício</button>
                      </div>
                    ) : null}
                  </div>
                </div>
              </header>

              <nav className="benefits-tabs" aria-label="Seções do benefício">
                <button type="button" className={activeTab === "employees" ? "is-active" : ""} onClick={() => setActiveTab("employees")}><Users size={16} /> Funcionários</button>
                <button type="button" className={activeTab === "table" ? "is-active" : ""} onClick={() => setActiveTab("table")}><Calculator size={16} /> Tabela de valores</button>
                <button type="button" className={activeTab === "settings" ? "is-active" : ""} onClick={() => setActiveTab("settings")}><Settings2 size={16} /> Configurações</button>
                <button type="button" className={activeTab === "history" ? "is-active" : ""} onClick={() => setActiveTab("history")}><FileClock size={16} /> Histórico</button>
              </nav>

              <div className="benefits-tab-content">
                {activeTab === "employees" ? (
                  <section className="benefits-employees-tab">
                    <div className="benefits-section-heading">
                      <div>
                        <h3>Funcionários vinculados</h3>
                        <p>Adicione ou remova pessoas e confira impedimentos entre benefícios.</p>
                      </div>
                      <button className="btn btn-primary" type="button" disabled={busy} onClick={openEmployeeModal}><UserPlus size={16} /> Gerenciar funcionários</button>
                    </div>
                    <div className="benefits-summary-grid" aria-label="Filtros rápidos de funcionários">
                      <button
                        type="button"
                        className={`benefits-summary-card ${employeeQuickFilter === "selected" ? "is-active" : ""}`}
                        aria-pressed={employeeQuickFilter === "selected"}
                        onClick={() => toggleEmployeeQuickFilter("selected")}
                      >
                        <strong>{assignedEmployees.length}</strong><span>Selecionados</span>
                      </button>
                      <button
                        type="button"
                        className={`benefits-summary-card ${employeeQuickFilter === "unselected" ? "is-active" : ""}`}
                        aria-pressed={employeeQuickFilter === "unselected"}
                        onClick={() => toggleEmployeeQuickFilter("unselected")}
                      >
                        <strong>{unassignedEmployeeCount}</strong><span>Não selecionados</span>
                      </button>
                      <button
                        type="button"
                        className={`benefits-summary-card ${ineligibleEmployeeCount ? "is-danger" : ""} ${employeeQuickFilter === "ineligible" ? "is-active" : ""}`}
                        aria-pressed={employeeQuickFilter === "ineligible"}
                        onClick={() => toggleEmployeeQuickFilter("ineligible")}
                      >
                        <strong>{ineligibleEmployeeCount}</strong><span>Sem direito por incompatibilidade</span>
                      </button>
                    </div>
                    <EmployeeFilterControls
                      filters={employeeFilters}
                      onChange={setEmployeeFilters}
                      onClear={() => setEmployeeFilters(emptyEmployeeFilters)}
                      hasActiveFilters={hasActiveEmployeeFilters}
                      departmentOptions={departmentOptions}
                      sectorOptions={sectorOptions}
                      subsectorOptions={subsectorOptions}
                      teamOptions={teamOptions}
                      roleOptions={roleOptions}
                      statusOptions={statusOptions}
                      searchPlaceholder="Buscar por nome, CPF, matrícula, função, setor ou equipe"
                    />
                    {conflictingAssignedEmployees.length ? (
                      <div className="benefits-compact-alert is-warning"><ShieldAlert size={17} /><span><strong>{conflictingAssignedEmployees.length} vínculo(s) incompatível(is).</strong> Remova esses funcionários ou ajuste as regras do benefício.</span></div>
                    ) : null}
                    <div className="benefits-employee-cards">
                      {pagedEmployees.map((employee) => {
                        const conflictNames = employeeBenefitConflicts.get(employee.id) || [];
                        const departmentName = departmentById.get(employee.departmentId)?.name || "Sem departamento";
                        const sectorName = sectorById.get(employee.sectorId)?.name || "Sem setor";
                        const teamName = employee.teamId ? teamById.get(employee.teamId)?.name || "Sem equipe" : "Sem equipe";
                        return (
                          <article className={`benefits-employee-card ${conflictNames.length ? "is-ineligible" : ""}`} key={employee.id}>
                            <div className="benefits-avatar">{employee.name.slice(0, 2).toUpperCase()}</div>
                            <div>
                              <strong>{employee.name}</strong>
                              <span>{employee.registration || "Sem matrícula"} · {employee.cpf || "Sem CPF"}</span>
                              <small>{employee.role || employee.position || "Sem função"}</small>
                              <small>{departmentName} · {sectorName} · {teamName}</small>
                              {conflictNames.length ? <em>Sem direito: já vinculado a {conflictNames.join(", ")}</em> : null}
                            </div>
                          </article>
                        );
                      })}
                      {!employeeQuickFilter && !assignedEmployees.length ? <p className="benefits-empty-state">Nenhum funcionário vinculado a este benefício.</p> : null}
                      {employeeQuickFilter && !quickFilteredEmployees.length ? <p className="benefits-empty-state">Nenhum funcionário encontrado para o filtro selecionado.</p> : null}
                      {quickFilteredEmployees.length > 0 && !filteredEmployees.length ? <p className="benefits-empty-state">Nenhum funcionário encontrado para os filtros aplicados.</p> : null}
                    </div>
                    {filteredEmployees.length ? (
                      <PaginationControls
                        page={employeePage}
                        pageSize={employeePageSize}
                        total={filteredEmployees.length}
                        onPageChange={setEmployeePage}
                        onPageSizeChange={setEmployeePageSize}
                      />
                    ) : null}
                  </section>
                ) : null}

                {activeTab === "table" ? (
                  <section className="benefits-table-tab">
                    {storedDivergenceMessage ? (
                      <div className={`benefits-compact-alert ${hasDivergence ? "is-warning" : "is-success"}`}>
                        {hasDivergence ? <ShieldAlert size={17} /> : <Check size={17} />}
                        <span>
                          <strong>
                            {hasDivergence
                              ? `${divergenceDetails.missingAssigned.length + divergenceDetails.extraImported.length} divergência(s) encontrada(s)`
                              : "Importação 100% compatível"}
                          </strong>
                          {storedImportMessage ? <small>{storedImportMessage}</small> : <small>{storedDivergenceMessage}</small>}
                        </span>
                        {hasDivergence ? (
                          <div className="benefits-divergence-details">
                            {divergenceDetails.missingAssigned.length ? (
                              <div>
                                <strong>Vinculados sem linha na importação</strong>
                                {divergenceDetails.missingAssigned.slice(0, 12).map((name) => <small key={name}>{name}</small>)}
                                {divergenceDetails.missingAssigned.length > 12 ? <small>+ {divergenceDetails.missingAssigned.length - 12} outro(s)</small> : null}
                              </div>
                            ) : null}
                            {divergenceDetails.extraImported.length ? (
                              <div>
                                <strong>Na importação, mas fora deste benefício</strong>
                                {divergenceDetails.extraImported.slice(0, 12).map((name) => <small key={name}>{name}</small>)}
                                {divergenceDetails.extraImported.length > 12 ? <small>+ {divergenceDetails.extraImported.length - 12} outro(s)</small> : null}
                              </div>
                            ) : null}
                          </div>
                        ) : null}
                        {hasDivergence ? <button type="button" onClick={() => setActiveTab("employees")}>Ver divergências</button> : null}
                      </div>
                    ) : null}
                    <div className="benefits-survey-panel">
                      <label className="field benefits-survey-month">
                        Mes de referencia
                        <input
                          type="month"
                          value={benefitReferenceMonth}
                          disabled={busy}
                          onChange={(event) => changeBenefitReferenceMonth(event.target.value)}
                        />
                      </label>
                      {(["15", "30"] as BenefitSurveyPeriod[]).map((period) => {
                        const completion = currentSurveyCompletions[period];
                        const completed = Boolean(completion);
                        return (
                          <button
                            key={period}
                            type="button"
                            disabled={busy}
                            className={`benefits-survey-card ${completed ? "is-complete" : "is-pending"}`}
                            onClick={() => void toggleSurveyCompletion(period)}
                          >
                            <strong>{surveyPeriodLabel(period)}</strong>
                            <span>{completed ? "Concluido" : "Pendente"}</span>
                            <small>{completed ? formatDateTime(completion?.completedAt) : "Clique para concluir"}</small>
                          </button>
                        );
                      })}
                    </div>
                    <div className="benefits-table-toolbar">
                      <label className="benefits-search-field benefits-table-search"><Search size={16} /><input placeholder="Buscar funcionário" value={tableFilters.search} onChange={(event) => setTableFilters({ ...tableFilters, search: event.target.value })} /></label>
                      <select value={tableFilters.column} onChange={(event) => setTableFilters({ ...tableFilters, column: event.target.value })}>
                        <option value="">Todas as colunas</option>
                        {columns.map((column) => <option key={column} value={column}>{column}</option>)}
                      </select>
                      {hasActiveTableFilters ? <button className="btn btn-ghost" type="button" onClick={() => setTableFilters({ search: "", column: "" })}><X size={15} /> Limpar filtros</button> : null}
                      <span className="benefits-toolbar-spacer" />
                      <button className="btn btn-secondary" type="button" disabled={busy || !columns.length} onClick={addEmptyRow}><PlusCircle size={16} /> Adicionar linha</button>
                      <label className="btn btn-secondary"><Upload size={16} /> {updatingExcel ? "Importando..." : "Importar Excel"}<input hidden disabled={busy} type="file" accept=".xls,.xlsx,.xlsm,.csv" onChange={(event) => handleExcelUpdate(event.target.files?.[0])} /></label>
                      <button className="btn btn-primary" type="button" disabled={busy || !columns.length} onClick={() => void saveInformationSnapshot()}><Save size={16} /> Salvar alterações</button>
                    </div>
                    <div className="table-panel benefit-table-panel">
                      <div className="benefit-table-scroll">
                        <table className="data-table benefit-table benefits-compact-table">
                          <thead>
                            <tr>
                              {columns.map((column) => {
                                const width = columnWidths[column] || defaultColumnWidth;
                                const systemConfig = systemColumnConfigs[column];
                                return (
                                  <th key={column} style={{ minWidth: width, width }}>
                                    <div className="benefit-column-header">
                                      <button className="benefits-sort-button" type="button" onClick={() => toggleTableSort(column)}>
                                        <span>{column}</span>
                                        {tableSort?.column === column ? (tableSort.direction === "asc" ? <ArrowUp size={14} /> : <ArrowDown size={14} />) : null}
                                      </button>
                                      <button disabled={busy} type="button" className="column-menu-trigger" onClick={(event) => toggleColumnMenu(column, event)} aria-label={`Ações da coluna ${column}`}><MoreVertical size={16} /></button>
                                      {formulas[column] ? <small className="benefit-column-formula">= {formulas[column]}</small> : null}
                                      {!formulas[column] && systemConfig ? <small className="benefit-column-formula">{systemColumnDescription(systemConfig)}</small> : null}
                                      {openColumnMenu === column ? (
                                        <div className="column-action-menu is-fixed" style={columnMenuPosition || undefined}>
                                          <button type="button" disabled={busy} onClick={() => startEditColumn(column)}>Editar coluna</button>
                                          <button type="button" disabled={busy} onClick={() => deleteColumn(column)}>Excluir coluna</button>
                                          <button type="button" disabled={busy} onClick={() => resizeColumn(column, 40)}>Aumentar largura</button>
                                          <button type="button" disabled={busy} onClick={() => resizeColumn(column, -40)}>Diminuir largura</button>
                                          <button type="button" disabled={busy} onClick={() => toggleColumnWrap(column)}>{columnWrap[column] ? "Desativar" : "Ativar"} quebra de texto</button>
                                        </div>
                                      ) : null}
                                    </div>
                                  </th>
                                );
                              })}
                              <th className="benefit-row-actions-head">Ações</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredRows.map((row) => {
                              const rowIndex = displayRows.indexOf(row);
                              return (
                                <tr key={rowIndex}>
                                  {columns.map((column) => {
                                    const width = columnWidths[column] || defaultColumnWidth;
                                    return <td key={`${rowIndex}-${column}`} style={{ minWidth: width, width }} className={columnWrap[column] ? "is-wrapped" : "is-nowrap"}><span className="benefit-cell-value">{formatBenefitCell(getRowValue(row, column), column)}</span></td>;
                                  })}
                                  <td className="row-actions-cell benefits-row-menu-cell">
                                    <button type="button" className="column-menu-trigger" onClick={() => setOpenRowMenu((current) => current === rowIndex ? null : rowIndex)} aria-label="Ações da linha"><MoreVertical size={16} /></button>
                                    {openRowMenu === rowIndex ? (
                                      <div className="benefits-row-menu">
                                        <button type="button" onClick={() => { setOpenRowMenu(null); startEditRow(rowIndex); }}><Edit3 size={14} /> Editar</button>
                                        <button type="button" className="is-danger" onClick={() => { setOpenRowMenu(null); deleteRow(rowIndex); }}><Trash2 size={14} /> Excluir</button>
                                      </div>
                                    ) : null}
                                  </td>
                                </tr>
                              );
                            })}
                            {!rows.length ? <tr><td colSpan={Math.max(1, columns.length + 1)}>Importe um Excel ou adicione uma linha para começar.</td></tr> : null}
                            {rows.length > 0 && !filteredRows.length ? <tr><td colSpan={Math.max(1, columns.length + 1)}>Nenhuma linha encontrada para os filtros aplicados.</td></tr> : null}
                          </tbody>
                        </table>
                      </div>
                    </div>
                    <div className="benefits-table-footer">Mostrando {filteredRows.length} de {rows.length} funcionário(s){systemTimeRecordsLoading ? " · Atualizando levantamentos do sistema..." : ""}</div>
                  </section>
                ) : null}

                {activeTab === "settings" ? (
                  <section className="benefits-settings-tab">
                    <div className="benefits-section-heading"><div><h3>Configurações da tabela</h3><p>Crie fórmulas, altere a ordem e controle incompatibilidades.</p></div></div>
                    <div className="benefits-settings-grid">
                      <article className="benefits-settings-card">
                        <div className="benefits-settings-card-header"><div><h4>Estrutura da tabela</h4><p>{columns.length} coluna(s) configurada(s)</p></div><button className="btn btn-primary" type="button" onClick={() => setNewColumnModalOpen(true)}><Plus size={16} /> Nova coluna</button></div>
                        <div className="benefits-column-list">
                          {columns.map((column) => (
                            <div
                              className={`benefits-column-item ${draggingColumn === column ? "is-dragging" : ""}`}
                              draggable={!busy}
                              key={column}
                              onDragStart={(event) => handleColumnDragStart(column, event)}
                              onDragOver={handleColumnDragOver}
                              onDrop={(event) => void handleColumnDrop(column, event)}
                              onDragEnd={handleColumnDragEnd}
                            >
                              <span className="benefits-column-drag-handle" title="Arrastar coluna"><GripVertical size={17} /></span>
                              <div><strong>{column}</strong>{systemColumnConfigs[column] ? <small>{systemColumnDescription(systemColumnConfigs[column])}</small> : formulas[column] ? <small>= {formulas[column]}</small> : <small>Sem formula</small>}</div>
                              <div className="benefits-column-item-actions">
                                <button type="button" disabled={busy} onClick={() => startEditColumn(column)}><Edit3 size={15} /></button>
                                <button type="button" disabled={busy} className="is-danger" onClick={() => deleteColumn(column)}><Trash2 size={15} /></button>
                              </div>
                            </div>
                          ))}
                        </div>
                        {editingColumn ? (
                          <form className="benefits-inline-editor" onSubmit={submitEditColumn}>
                            <label className="field">Nome da coluna<input disabled={busy} value={editColumnForm.label} onChange={(event) => setEditColumnForm({ ...editColumnForm, label: event.target.value })} /></label>
                            <FormulaBuilder
                              value={editColumnForm.formula}
                              onChange={(formula) => setEditColumnForm({ ...editColumnForm, formula })}
                              disabled={busy || Boolean(systemColumnConfigs[editingColumn])}
                              columns={columns.filter((column) => column !== editingColumn)}
                              externalTables={formulaExternalTables}
                            />
                            <div className="form-actions"><button className="btn btn-ghost" type="button" onClick={() => setEditingColumn(null)}>Cancelar</button><button className="btn btn-primary" type="submit"><Check size={15} /> Salvar coluna</button></div>
                          </form>
                        ) : null}
                        <div className="benefits-settings-actions"><button className="btn btn-secondary" type="button" onClick={openModelEditor}><RefreshCcw size={15} /> Refazer estrutura</button><button className="btn btn-ghost danger-text" type="button" onClick={clearBenefitTable}><Trash2 size={15} /> Limpar tabela</button></div>
                      </article>

                      <article className="benefits-settings-card">
                        <div className="benefits-settings-card-header"><div><h4>Benefícios incompatíveis</h4><p>Quem já possui um destes benefícios ficará marcado em vermelho e não poderá ser selecionado.</p></div></div>
                        <div className="benefits-incompatibility-list">
                          {companyBenefits.filter((benefit) => benefit.id !== selectedBenefit.id).map((benefit) => (
                            <label className="benefits-incompatibility-option" key={benefit.id}>
                              <input type="checkbox" checked={incompatibilitySelection.includes(benefit.id)} onChange={() => setIncompatibilitySelection((current) => current.includes(benefit.id) ? current.filter((id) => id !== benefit.id) : [...current, benefit.id])} />
                              <span><strong>{benefit.name}</strong><small>{data.employeeBenefits.filter((item) => item.contractId === benefit.id && item.active !== false).length} funcionário(s) vinculados</small></span>
                            </label>
                          ))}
                          {companyBenefits.length <= 1 ? <p className="benefits-empty-state">Cadastre outro benefício na mesma empresa para criar regras de incompatibilidade.</p> : null}
                        </div>
                        {conflictingAssignedEmployees.length ? <div className="benefits-compact-alert is-warning"><ShieldAlert size={16} /><span>{conflictingAssignedEmployees.length} funcionário(s) atualmente possuem vínculos incompatíveis.</span></div> : null}
                        <div className="form-actions"><button className="btn btn-primary" type="button" disabled={busy} onClick={() => void saveIncompatibilityRules()}><Save size={15} /> Salvar regras</button></div>
                      </article>
                    </div>
                  </section>
                ) : null}

                {activeTab === "history" ? (
                  <section className="benefits-history-tab">
                    <div className="benefits-section-heading"><div><h3>Histórico de atualizações</h3><p>Visualize quem salvou, o que foi alterado e restaure uma versão anterior.</p></div></div>
                    <div className="benefits-history-list">
                      {sortedSnapshots.map((snapshot) => (
                        <article className="benefits-history-card" key={snapshot.id}>
                          <div className="benefits-history-icon"><FileClock size={18} /></div>
                          <div className="benefits-history-copy">
                            <strong>{formatDateTime(snapshot.savedAt)}</strong>
                            <span>{snapshot.savedByName || "Usuário não registrado"}{snapshot.savedByUsername ? ` (@${snapshot.savedByUsername})` : ""}</span>
                            <small>{snapshot.changeSummary || snapshot.divergenceInfo || "Tabela de valores salva."}</small>
                            <small>{snapshot.totalRows} linha(s) · {snapshot.columns.length} coluna(s){snapshot.fileName ? ` · ${snapshot.fileName}` : ""}</small>
                          </div>
                          <div className="benefits-history-actions"><button className="btn btn-ghost" type="button" onClick={() => setHistoryPreview(snapshot)}><Eye size={15} /> Visualizar</button><button className="btn btn-secondary" type="button" onClick={() => restoreSnapshot(snapshot)}><RotateCcw size={15} /> Restaurar</button></div>
                        </article>
                      ))}
                      {!sortedSnapshots.length ? <p className="benefits-empty-state">Nenhuma versão salva ainda. Use “Salvar alterações” na tabela de valores.</p> : null}
                    </div>
                  </section>
                ) : null}
              </div>
            </>
          ) : (
            <div className="benefits-empty-detail"><Gift size={34} /><h2>Selecione um benefício</h2><p>Escolha um item na lateral ou crie um novo benefício.</p></div>
          )}
        </main>
      </div>

      {benefitModalOpen ? (
        <ModalPortal className="modal-backdrop" role="presentation">
          <form className="modal-panel wizard-card" onSubmit={submitBenefit}>
            <div className="modal-header"><h2>Novo benefício</h2><button className="icon-button" type="button" disabled={savingBenefit} onClick={() => setBenefitModalOpen(false)} aria-label="Fechar"><X size={18} /></button></div>
            <div className="form-grid">
              <label className="field is-wide-field">Empresa<select required disabled={savingBenefit} value={benefitForm.companyId} onChange={(event) => setBenefitForm({ ...benefitForm, companyId: event.target.value })}><option value="">Selecione a empresa</option>{data.companies.map((company) => <option value={company.id} key={company.id}>{company.name}</option>)}</select></label>
              <label className="field is-wide-field">Nome do benefício<input required disabled={savingBenefit} value={benefitForm.name} onChange={(event) => setBenefitForm({ ...benefitForm, name: event.target.value })} placeholder="Ex.: Vale-transporte" /></label>
              <label className="field is-wide-field">Colunas iniciais<textarea disabled={savingBenefit} value={benefitForm.modelColumns} onChange={(event) => setBenefitForm({ ...benefitForm, modelColumns: event.target.value })} /></label>
            </div>
            <div className="form-actions"><button className="btn btn-ghost" disabled={savingBenefit} type="button" onClick={() => setBenefitModalOpen(false)}>Cancelar</button><button className="btn btn-primary" disabled={savingBenefit} type="submit">{savingBenefit ? "Salvando..." : "Criar benefício"}</button></div>
          </form>
        </ModalPortal>
      ) : null}

      {editBenefitModalOpen ? (
        <ModalPortal className="modal-backdrop" role="presentation">
          <form className="modal-panel wizard-card" onSubmit={submitEditBenefit}>
            <div className="modal-header"><h2>Editar benefício</h2><button className="icon-button" type="button" disabled={busy} onClick={() => setEditBenefitModalOpen(false)} aria-label="Fechar"><X size={18} /></button></div>
            <div className="form-grid">
              <label className="field">Empresa<select required disabled={busy} value={editBenefitForm.companyId} onChange={(event) => setEditBenefitForm({ ...editBenefitForm, companyId: event.target.value })}><option value="">Selecione a empresa</option>{data.companies.map((company) => <option value={company.id} key={company.id}>{company.name}</option>)}</select></label>
              <label className="field">Nome do benefício<input required disabled={busy} value={editBenefitForm.name} onChange={(event) => setEditBenefitForm({ ...editBenefitForm, name: event.target.value })} /></label>
              <label className="field">Fornecedor / descrição<input disabled={busy} value={editBenefitForm.providerName} onChange={(event) => setEditBenefitForm({ ...editBenefitForm, providerName: event.target.value })} /></label>
              <label className="field">Tipo<select disabled={busy} value={editBenefitForm.type} onChange={(event) => setEditBenefitForm({ ...editBenefitForm, type: event.target.value as BenefitType })}>{benefitTypeOptions.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}</select></label>
              <label className="field">Site / link<input disabled={busy} value={editBenefitForm.websiteUrl} onChange={(event) => setEditBenefitForm({ ...editBenefitForm, websiteUrl: event.target.value })} /></label>
              <label className="field">Início<input disabled={busy} type="date" value={editBenefitForm.startDate} onChange={(event) => setEditBenefitForm({ ...editBenefitForm, startDate: event.target.value })} /></label>
              <label className="field">Fim<input disabled={busy} type="date" value={editBenefitForm.endDate} onChange={(event) => setEditBenefitForm({ ...editBenefitForm, endDate: event.target.value })} /></label>
              <label className="check-field"><input disabled={busy} type="checkbox" checked={editBenefitForm.active} onChange={(event) => setEditBenefitForm({ ...editBenefitForm, active: event.target.checked })} />Benefício ativo</label>
            </div>
            <div className="form-actions"><button className="btn btn-ghost" disabled={busy} type="button" onClick={() => setEditBenefitModalOpen(false)}>Cancelar</button><button className="btn btn-primary" disabled={busy} type="submit"><Check size={16} /> Salvar alterações</button></div>
          </form>
        </ModalPortal>
      ) : null}

      {employeeModalOpen ? (
        <ModalPortal className="modal-backdrop" role="presentation">
          <form className="modal-panel wizard-card benefit-employees-modal" onSubmit={saveEmployeeSelection}>
            <div className="modal-header"><h2>Funcionários do benefício</h2><button className="icon-button" type="button" disabled={busy} onClick={() => setEmployeeModalOpen(false)} aria-label="Fechar"><X size={18} /></button></div>
            <div className="benefit-employee-modal-summary">
              <div><strong>{selectedBenefit?.name}</strong><span>{selectedCompany?.name || "Empresa não informada"}</span></div>
              <div className="benefit-employee-modal-counts"><span><b>{employeeSelection.length}</b> selecionados</span><span><b>{selectedUnassignedCount}</b> não selecionados</span><span className={ineligibleEmployeeCount ? "is-danger" : ""}><b>{ineligibleEmployeeCount}</b> sem direito</span></div>
            </div>
            <EmployeeFilterControls
              filters={employeeModalFilters}
              onChange={setEmployeeModalFilters}
              onClear={() => setEmployeeModalFilters(emptyEmployeeFilters)}
              hasActiveFilters={hasActiveEmployeeModalFilters}
              departmentOptions={departmentOptions}
              sectorOptions={sectorOptions}
              subsectorOptions={subsectorOptions}
              teamOptions={teamOptions}
              roleOptions={roleOptions}
              statusOptions={statusOptions}
              searchPlaceholder="Buscar por nome, CPF, matrícula, função, setor, equipe ou incompatibilidade"
            />
            <div className="benefit-employee-list">
              {pagedEmployeesForModal.map((employee) => {
                const conflictNames = employeeBenefitConflicts.get(employee.id) || [];
                const isSelected = employeeSelection.includes(employee.id);
                const isBlocked = conflictNames.length > 0 && !isSelected;
                const departmentName = departmentById.get(employee.departmentId)?.name || "Sem departamento";
                const sectorName = sectorById.get(employee.sectorId)?.name || "Sem setor";
                const teamName = employee.teamId ? teamById.get(employee.teamId)?.name || "Sem equipe" : "Sem equipe";
                return (
                  <label className={`benefit-employee-option ${conflictNames.length ? "is-ineligible" : ""}`} key={employee.id}>
                    <input type="checkbox" disabled={busy || isBlocked} checked={isSelected} onChange={() => toggleEmployeeSelection(employee.id)} />
                    <span><strong>{employee.name}</strong><small>{employee.registration || "Sem matrícula"} · {employee.cpf || "Sem CPF"} · {employee.role || employee.position || "Sem função"}</small><small>{departmentName} · {sectorName} · {teamName}</small>{conflictNames.length ? <em>Sem direito: já possui {conflictNames.join(", ")}{isSelected ? ". Remova este vínculo para salvar." : ""}</em> : null}</span>
                  </label>
                );
              })}
              {!visibleEmployeesForModal.length ? <p className="muted">Nenhum funcionário encontrado nesta empresa.</p> : null}
            </div>
            {visibleEmployeesForModal.length ? (
              <PaginationControls
                page={employeeModalPage}
                pageSize={employeeModalPageSize}
                total={visibleEmployeesForModal.length}
                onPageChange={setEmployeeModalPage}
                onPageSizeChange={setEmployeeModalPageSize}
              />
            ) : null}
            <div className="form-actions"><button className="btn btn-ghost" disabled={busy} type="button" onClick={() => setEmployeeModalOpen(false)}>Cancelar</button><button className="btn btn-primary" disabled={busy} type="submit"><Check size={16} /> Salvar funcionários</button></div>
          </form>
        </ModalPortal>
      ) : null}

      {newColumnModalOpen ? (
        <ModalPortal className="modal-backdrop" role="presentation">
          <form className="modal-panel wizard-card benefits-small-modal" onSubmit={addColumn}>
            <div className="modal-header"><h2>Nova coluna</h2><button className="icon-button" type="button" disabled={busy} onClick={() => setNewColumnModalOpen(false)} aria-label="Fechar"><X size={18} /></button></div>
            <label className="field">Nome da coluna<input autoFocus disabled={busy} value={columnForm.label} onChange={(event) => setColumnForm({ ...columnForm, label: event.target.value })} placeholder="Ex.: Total líquido" /></label>
            <FormulaBuilder
              value={columnForm.formula}
              onChange={(formula) => setColumnForm({ ...columnForm, formula })}
              disabled={busy || Boolean(columnForm.systemKind)}
              columns={columns}
              externalTables={formulaExternalTables}
            />
            <div className="benefits-system-column-panel">
              <label className="check-field">
                <input
                  type="checkbox"
                  checked={Boolean(columnForm.systemKind)}
                  disabled={busy}
                  onChange={(event) => setColumnForm({
                    ...columnForm,
                    label: event.target.checked && !columnForm.label.trim() ? "Faltas" : columnForm.label,
                    formula: event.target.checked ? "" : columnForm.formula,
                    systemKind: event.target.checked ? "absences" : "",
                    systemPeriod: event.target.checked ? "first_half" : columnForm.systemPeriod,
                    systemStartDay: event.target.checked ? "1" : columnForm.systemStartDay,
                    systemEndDay: event.target.checked ? "15" : columnForm.systemEndDay,
                  })}
                />
                Levantamento do sistema
              </label>
              {columnForm.systemKind ? (
                <div className="form-grid benefits-system-column-grid">
                  <label className="field">
                    Indicador
                    <select
                      disabled={busy}
                      value={columnForm.systemKind}
                      onChange={(event) => {
                        const systemKind = event.target.value as BenefitSystemColumnKind;
                        const defaultLabel = systemKind === "business_days" ? "Dias uteis" : "Faltas";
                        const currentLabel = columnForm.label.trim();
                        const shouldUseDefaultLabel = !currentLabel || currentLabel === "Faltas" || currentLabel === "Dias uteis";
                        setColumnForm({
                          ...columnForm,
                          label: shouldUseDefaultLabel ? defaultLabel : columnForm.label,
                          formula: "",
                          systemKind,
                          systemPeriod: systemKind === "business_days" ? "custom" : "first_half",
                        });
                      }}
                    >
                      <option value="absences">Faltas dos funcionarios</option>
                      <option value="business_days">Dias uteis</option>
                    </select>
                  </label>
                  {columnForm.systemKind === "absences" ? (
                    <label className="field">
                      Periodo
                      <select disabled={busy} value={columnForm.systemPeriod} onChange={(event) => setColumnForm({ ...columnForm, systemPeriod: event.target.value as BenefitSystemPeriod })}>
                        <option value="first_half">Dia 1 a 15</option>
                        <option value="second_half">Dia 15 a 30</option>
                        <option value="month">Mes todo</option>
                      </select>
                    </label>
                  ) : (
                    <>
                      <label className="field">
                        Dia inicial
                        <input
                          type="number"
                          min={1}
                          max={31}
                          disabled={busy}
                          value={columnForm.systemStartDay}
                          onChange={(event) => setColumnForm({ ...columnForm, systemStartDay: event.target.value })}
                        />
                      </label>
                      <label className="field">
                        Dia final
                        <input
                          type="number"
                          min={1}
                          max={31}
                          disabled={busy}
                          value={columnForm.systemEndDay}
                          onChange={(event) => setColumnForm({ ...columnForm, systemEndDay: event.target.value })}
                        />
                      </label>
                      <p className="muted benefits-system-column-hint">Usa o mes de referencia da tabela e desconta feriados marcados no Controle de Ponto.</p>
                    </>
                  )}
                </div>
              ) : null}
            </div>
            <div className="form-actions"><button className="btn btn-ghost" type="button" onClick={() => setNewColumnModalOpen(false)}>Cancelar</button><button className="btn btn-primary" type="submit"><Plus size={15} /> Criar coluna</button></div>
          </form>
        </ModalPortal>
      ) : null}

      {modelEditorOpen ? (
        <ModalPortal className="modal-backdrop" role="presentation">
          <form className="modal-panel wizard-card" onSubmit={saveModelEditor}>
            <div className="modal-header"><h2>Refazer tabela modelo</h2><button className="icon-button" type="button" disabled={busy} onClick={() => setModelEditorOpen(false)} aria-label="Fechar"><X size={18} /></button></div>
            <label className="field is-wide-field">Colunas da tabela<textarea disabled={busy} value={modelEditorText} onChange={(event) => setModelEditorText(event.target.value)} /></label>
            <p className="muted">Informe uma coluna por linha. Ao salvar, a tabela será reorganizada conforme esse modelo.</p>
            <div className="form-actions"><button className="btn btn-ghost" disabled={busy} type="button" onClick={() => setModelEditorOpen(false)}>Cancelar</button><button className="btn btn-primary" disabled={busy} type="submit">Salvar nova tabela</button></div>
          </form>
        </ModalPortal>
      ) : null}

      {rowEditor ? (
        <ModalPortal className="modal-backdrop" role="presentation">
          <form className="modal-panel wizard-card" onSubmit={submitEditRow}>
            <div className="modal-header"><h2>Editar linha</h2><button className="icon-button" type="button" disabled={busy} onClick={() => setRowEditor(null)} aria-label="Fechar"><X size={18} /></button></div>
            <div className="form-grid">{columns.map((column) => <label className="field" key={column}>{column}{formulas[column] ? " (fórmula)" : systemColumnConfigs[column] ? " (levantamento)" : ""}<input disabled={busy || Boolean(formulas[column]) || Boolean(systemColumnConfigs[column])} value={rowEditor.values[column] || ""} onChange={(event) => setRowEditor({ ...rowEditor, values: { ...rowEditor.values, [column]: event.target.value } })} /></label>)}</div>
            <div className="form-actions"><button className="btn btn-ghost" disabled={busy} type="button" onClick={() => setRowEditor(null)}>Cancelar</button><button className="btn btn-primary" disabled={busy} type="submit"><Check size={16} /> Salvar alterações</button></div>
          </form>
        </ModalPortal>
      ) : null}

      {historyPreview ? (
        <ModalPortal className="modal-backdrop" role="presentation">
          <div className="modal-panel wizard-card benefits-history-preview">
            <div className="modal-header"><div><h2>Versão de {formatDateTime(historyPreview.savedAt)}</h2><p className="muted">{historyPreview.savedByName || "Usuário não registrado"}{historyPreview.savedByUsername ? ` (@${historyPreview.savedByUsername})` : ""}</p></div><button className="icon-button" type="button" onClick={() => setHistoryPreview(null)} aria-label="Fechar"><X size={18} /></button></div>
            <p>{historyPreview.changeSummary || historyPreview.divergenceInfo}</p>
            <div className="benefits-history-preview-table"><table className="data-table"><thead><tr>{historyPreview.columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{historyPreview.rows.slice(0, 10).map((row, index) => <tr key={index}>{historyPreview.columns.map((column) => <td key={column}>{formatBenefitCell(getRowValue(row, column), column)}</td>)}</tr>)}</tbody></table></div>
            {historyPreview.rows.length > 10 ? <p className="muted">Exibindo as primeiras 10 de {historyPreview.rows.length} linhas.</p> : null}
            <div className="form-actions"><button className="btn btn-ghost" type="button" onClick={() => setHistoryPreview(null)}>Fechar</button><button className="btn btn-primary" type="button" onClick={() => restoreSnapshot(historyPreview)}><RotateCcw size={15} /> Restaurar esta versão</button></div>
          </div>
        </ModalPortal>
      ) : null}

      {confirmDialog ? <ConfirmModal title={confirmDialog.title} description={confirmDialog.message} confirmLabel={confirmDialog.confirmLabel} destructive={confirmDialog.variant === "danger"} disabled={confirmBusy} impact={confirmDialog.impact} onCancel={() => setConfirmDialog(null)} onConfirm={executeConfirm} /> : null}

      {undoToast ? (
        <div className="undo-toast" role="status"><span>{undoToast.message}</span>{undoToast.undo ? <button type="button" disabled={undoBusy} onClick={executeUndo}><RotateCcw size={16} /> {undoBusy ? "Desfazendo..." : "Desfazer alteração"}</button> : null}<button type="button" disabled={undoBusy} onClick={() => setUndoToast(null)} aria-label="Fechar aviso"><X size={14} /></button></div>
      ) : null}
    </section>
  );
}
