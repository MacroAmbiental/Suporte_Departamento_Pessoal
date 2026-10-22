import type { BenefitContract, Employee, TimekeepingColumn, TimeRecord } from "@/types/domain";

// Regra de cálculo do benefício. Fica em benefitContracts.customFields.calcRule (JSON),
// campo novo: a tela antiga (DP oficial) ignora e preserva ao salvar.
export const calcRuleFieldKey = "calcRule";
const timekeepingSettingsColumnKey = "__timekeeping_calculation_settings";

export type BenefitDayComponent = {
  id: string;
  label: string;
  // Status do ponto que contam (valores de statusConditions, ex.: "present").
  statuses: string[];
  // % HE do dia (50 seg-sex, 75 sábado, 120 domingo/feriado). null = qualquer.
  overtimePercent: number | null;
  sign: 1 | -1;
};

export type BenefitOrderLayout = {
  contractNumber: string;
  providerColumn: string;
  departmentLabel: string;
  deliveryZipCode: string;
  deliveryCity: string;
  deliveryState: string;
  deliveryDistrict: string;
  deliveryStreet: string;
  deliveryNumber: string;
  deliveryComplement: string;
  deliveryReference: string;
  contactName: string;
  contactPhone: string;
  deliveryUnitName: string;
};

// Período padrão do benefício; a apuração ainda deixa escolher mês inteiro ou quinzena.
export type BenefitDefaultPeriod = "month" | "biweekly";
export type BenefitPeriodPart = "month" | "first_half" | "second_half";

export const periodPartLabels: Record<BenefitPeriodPart, string> = {
  month: "Mês inteiro",
  first_half: "1ª quinzena (1 a 15)",
  second_half: "2ª quinzena (16 ao fim)",
};

export type BenefitCalcRule = {
  version: 1;
  mode: "daily";
  period: BenefitDefaultPeriod;
  dailyValue: number;
  components: BenefitDayComponent[];
  // Dias úteis corrigidos à mão pelo DP, por período (ver periodKey).
  businessDaysOverrides: Record<string, number>;
  order: BenefitOrderLayout;
};

export const providerColumns = [
  "Alimentação",
  "Restaurante",
  "Home-office",
  "Bem-estar",
  "Educação",
  "Flex (A+R)",
  "Multibenefícios",
  "Mobilidade",
];

// Mesma conta da planilha "Realizar Pedido (2)" do DP (alimentação).
export const defaultDayComponents: BenefitDayComponent[] = [
  { id: "he75", label: "HE 75", statuses: ["present"], overtimePercent: 75, sign: 1 },
  { id: "he120", label: "HE 120", statuses: ["present"], overtimePercent: 120, sign: 1 },
  { id: "faltas", label: "Faltas", statuses: ["absence_confirmed"], overtimePercent: null, sign: -1 },
  { id: "atestados", label: "Atestados", statuses: ["medical_certificate"], overtimePercent: null, sign: -1 },
  { id: "folgas", label: "Folgas", statuses: ["day_off"], overtimePercent: 50, sign: -1 },
];

export const emptyOrderLayout: BenefitOrderLayout = {
  contractNumber: "",
  providerColumn: "Alimentação",
  departmentLabel: "",
  deliveryZipCode: "",
  deliveryCity: "",
  deliveryState: "",
  deliveryDistrict: "",
  deliveryStreet: "",
  deliveryNumber: "",
  deliveryComplement: "",
  deliveryReference: "",
  contactName: "",
  contactPhone: "",
  deliveryUnitName: "",
};

export function defaultCalcRule(): BenefitCalcRule {
  return {
    version: 1,
    mode: "daily",
    period: "month",
    dailyValue: 0,
    components: defaultDayComponents.map((component) => ({ ...component, statuses: [...component.statuses] })),
    businessDaysOverrides: {},
    order: { ...emptyOrderLayout },
  };
}

function parseJson<T>(value: string | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function readCalcRule(benefit?: BenefitContract): BenefitCalcRule | null {
  const parsed = parseJson<Partial<BenefitCalcRule> | null>(benefit?.customFields?.[calcRuleFieldKey], null);
  if (!parsed) return null;
  const base = defaultCalcRule();
  return {
    ...base,
    ...parsed,
    period: parsed.period === "biweekly" ? "biweekly" : "month",
    dailyValue: Number(parsed.dailyValue) || 0,
    components: Array.isArray(parsed.components) ? parsed.components : base.components,
    businessDaysOverrides: parsed.businessDaysOverrides || {},
    order: { ...base.order, ...(parsed.order || {}) },
  };
}

// Sugestão inicial a partir da tabela antiga (ex.: coluna "Valor" com fórmula "15,03").
export function suggestedCalcRule(benefit?: BenefitContract): BenefitCalcRule {
  const rule = defaultCalcRule();
  const formulas = parseJson<Record<string, string>>(benefit?.customFields?.formulas, {});
  const legacyValue = Number(String(formulas.Valor || formulas.valor || "").replace(",", "."));
  if (Number.isFinite(legacyValue) && legacyValue > 0) rule.dailyValue = legacyValue;
  return rule;
}

export function serializeCalcRule(rule: BenefitCalcRule) {
  return JSON.stringify(rule);
}

/* ---------- Configuração do ponto (feriados, jornada, % HE, status) ---------- */

export type StatusOption = { value: string; label: string };

export type PointSettings = {
  usefulMinutesByWeekday: Record<string, number>;
  holidays: string[];
  overtimeRates: { weekday: number; saturday: number; sunday: number; holiday: number };
  statusOptions: StatusOption[];
};

const defaultStatusOptions: StatusOption[] = [
  { value: "present", label: "Presente" },
  { value: "absence_pending", label: "Falta / Pendência" },
  { value: "absence_confirmed", label: "Falta Confirmada" },
  { value: "medical_certificate", label: "Atestado" },
  { value: "vacation", label: "Férias" },
  { value: "day_off", label: "Folga" },
  { value: "dsr", label: "DSR" },
  { value: "holiday", label: "Feriado" },
  { value: "leave", label: "Afastado" },
];

export const defaultPointSettings: PointSettings = {
  usefulMinutesByWeekday: { "0": 0, "1": 600, "2": 600, "3": 600, "4": 600, "5": 539, "6": 0 },
  holidays: [],
  overtimeRates: { weekday: 50, saturday: 75, sunday: 120, holiday: 120 },
  statusOptions: defaultStatusOptions,
};

function readPointSettings(value?: string): PointSettings {
  const parsed = parseJson<Record<string, unknown>>(value, {});
  const rates = (parsed.overtimeRates || {}) as Partial<PointSettings["overtimeRates"]>;
  const conditions = Array.isArray(parsed.statusConditions)
    ? (parsed.statusConditions as Array<{ value?: string; label?: string; active?: boolean }>)
      .filter((item) => item.value && item.active !== false)
      .map((item) => ({ value: String(item.value), label: String(item.label || item.value) }))
    : [];
  return {
    usefulMinutesByWeekday: Object.fromEntries(Object.entries({
      ...defaultPointSettings.usefulMinutesByWeekday,
      ...((parsed.usefulMinutesByWeekday || {}) as Record<string, number>),
    }).map(([weekday, minutes]) => [weekday, Number(minutes) || 0])),
    holidays: Array.isArray(parsed.holidays) ? parsed.holidays.map(String) : [],
    overtimeRates: {
      weekday: Number(rates.weekday ?? 50),
      saturday: Number(rates.saturday ?? 75),
      sunday: Number(rates.sunday ?? 120),
      holiday: Number(rates.holiday ?? 120),
    },
    statusOptions: conditions.length ? conditions : defaultStatusOptions,
  };
}

export function pointSettingsForCompany(columns: TimekeepingColumn[], companyId?: string): PointSettings {
  const candidates = columns.filter((column) => column.key === timekeepingSettingsColumnKey && column.active !== false);
  const column = candidates.find((item) => companyId && item.companyId === companyId)
    || candidates.find((item) => !item.companyId)
    || candidates[0];
  return column ? readPointSettings(column.formula) : defaultPointSettings;
}

/* ---------- Período e dias úteis ---------- */

export function monthRange(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const lastDay = new Date(year, monthNumber, 0).getDate();
  return {
    start: `${month}-01`,
    end: `${month}-${String(lastDay).padStart(2, "0")}`,
    lastDay,
  };
}

function weekdayOf(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(year, month - 1, day).getDay();
}

// 1ª quinzena = 1 a 15; 2ª quinzena = 16 ao último dia (sem dia repetido).
export function periodRange(month: string, part: BenefitPeriodPart) {
  const { lastDay } = monthRange(month);
  const startDay = part === "second_half" ? 16 : 1;
  const endDay = part === "first_half" ? 15 : lastDay;
  return {
    start: `${month}-${String(startDay).padStart(2, "0")}`,
    end: `${month}-${String(endDay).padStart(2, "0")}`,
    startDay,
    endDay,
  };
}

// Chave da correção manual de dias úteis: "AAAA-MM" (mês) ou "AAAA-MM-Q1"/"AAAA-MM-Q2".
export function periodKey(month: string, part: BenefitPeriodPart) {
  if (part === "first_half") return `${month}-Q1`;
  if (part === "second_half") return `${month}-Q2`;
  return month;
}

export function calendarBusinessDays(month: string, settings: PointSettings, part: BenefitPeriodPart = "month") {
  const { startDay, endDay } = periodRange(month, part);
  const holidays = new Set(settings.holidays.map((holiday) => holiday.trim()));
  let total = 0;
  for (let day = startDay; day <= endDay; day += 1) {
    const date = `${month}-${String(day).padStart(2, "0")}`;
    if ((settings.usefulMinutesByWeekday[String(weekdayOf(date))] || 0) > 0 && !holidays.has(date)) total += 1;
  }
  return total;
}

export function overtimePercentForDate(date: string, settings: PointSettings) {
  if (settings.holidays.includes(date)) return settings.overtimeRates.holiday;
  const weekday = weekdayOf(date);
  if (weekday === 0) return settings.overtimeRates.sunday;
  if (weekday === 6) return settings.overtimeRates.saturday;
  return settings.overtimeRates.weekday;
}

/* ---------- Apuração ---------- */

export type BenefitCalcRow = {
  employee: Employee;
  businessDays: number;
  // Contagem e datas por componente (id).
  counts: Record<string, number>;
  dates: Record<string, string[]>;
  payableDays: number;
  value: number;
};

const round2 = (value: number) => Math.round(value * 100) / 100;

// Dias sem registro no ponto não entram em nenhum componente: o ponto mostra
// "Falta / Pendência" ou "Folga" de fim de semana, que a regra não conta.
export function calculateBenefitRows(params: {
  employees: Employee[];
  records: TimeRecord[];
  rule: BenefitCalcRule;
  businessDays: number;
  settings: PointSettings;
}): BenefitCalcRow[] {
  const { employees, records, rule, businessDays, settings } = params;
  const recordsByEmployee = new Map<string, TimeRecord[]>();
  records.forEach((record) => {
    const list = recordsByEmployee.get(record.employeeId);
    if (list) list.push(record);
    else recordsByEmployee.set(record.employeeId, [record]);
  });

  return employees.map((employee) => {
    const counts: Record<string, number> = {};
    const dates: Record<string, string[]> = {};
    rule.components.forEach((component) => {
      counts[component.id] = 0;
      dates[component.id] = [];
    });

    (recordsByEmployee.get(employee.id) || []).forEach((record) => {
      const percent = Number(record.overtimePercent) || overtimePercentForDate(record.date, settings);
      rule.components.forEach((component) => {
        if (!component.statuses.includes(record.status)) return;
        if (component.overtimePercent !== null && Math.round(percent) !== component.overtimePercent) return;
        counts[component.id] += 1;
        dates[component.id].push(record.date);
      });
    });

    const adjustment = rule.components.reduce((sum, component) => sum + component.sign * counts[component.id], 0);
    const payableDays = Math.max(0, businessDays + adjustment);
    return {
      employee,
      businessDays,
      counts,
      dates,
      payableDays,
      value: round2(payableDays * rule.dailyValue),
    };
  });
}
