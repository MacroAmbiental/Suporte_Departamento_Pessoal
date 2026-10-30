import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  setDoc,
} from "firebase/firestore";
import { firestore } from "@/services/firebase";

const COLLECTION = "vacations";

export interface Vacation {
  id: string;
  employeeId: string;
  startDate: string;
  endDate: string;
  days: number;
  acquisitionYear?: number;
  acquisitionStart?: string;
  soldStartDate?: string;
  soldEndDate?: string;
  daysSold?: number;
  soldNote?: string;
  motivo?: string;
  notes?: string;
  /** "lancado" = o gozo está no Secullum como FÉRIAS; "sem-cpf" = fora do Secullum; "" = só no DP. */
  secullum?: "lancado" | "sem-cpf" | "";
  createdAt: string;
  updatedAt: string;
}

export type VacationBucket = "proximo" | "iniciado" | "vencido" | "afastado" | "emdia";

export async function loadVacations(): Promise<Vacation[]> {
  if (!firestore) return [];
  const snap = await getDocs(collection(firestore, COLLECTION));
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Vacation, "id">) }));
}

export async function saveVacation(
  vacation: Omit<Vacation, "id" | "createdAt" | "updatedAt"> & {
    id?: string;
    createdAt?: string;
  },
): Promise<Vacation> {
  if (!firestore) throw new Error("Firebase não configurado.");
  const now = new Date().toISOString();
  const { id, createdAt, ...rest } = vacation;
  const data = Object.fromEntries(
    Object.entries(rest).filter(([, value]) => value !== undefined),
  ) as Omit<Vacation, "id" | "createdAt" | "updatedAt">;
  if (id) {
    const ref = doc(firestore, COLLECTION, id);
    const payload = { ...data, updatedAt: now, createdAt: createdAt || now };
    await setDoc(ref, payload, { merge: true });
    return { ...(data as Vacation), id, createdAt: createdAt || now, updatedAt: now };
  }
  const ref = await addDoc(collection(firestore, COLLECTION), {
    ...data,
    createdAt: now,
    updatedAt: now,
  });
  return { ...(data as Vacation), id: ref.id, createdAt: now, updatedAt: now };
}

export async function deleteVacation(id: string): Promise<void> {
  if (!firestore) return;
  await deleteDoc(doc(firestore, COLLECTION, id));
}

export function monthsBetween(fromISO: string, toISO: string): number {
  if (!fromISO || !toISO) return 0;
  const from = new Date(`${fromISO}T00:00:00`);
  const to = new Date(`${toISO}T00:00:00`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return 0;
  let months =
    (to.getFullYear() - from.getFullYear()) * 12 +
    (to.getMonth() - from.getMonth());
  if (to.getDate() < from.getDate()) months -= 1;
  return Math.max(0, months);
}

export function vacationReferenceDate(
  admissionDate: string | undefined,
  vacations: Vacation[],
  todayISO?: string,
): string {
  const last = [...vacations]
    .filter((v) => v.endDate && (!todayISO || v.endDate < todayISO))
    .sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
  return last?.endDate || admissionDate || "";
}

function addToISO(iso: string, opts: { years?: number; months?: number; days?: number }): string {
  const d = new Date(`${iso}T00:00:00`);
  if (opts.years) d.setFullYear(d.getFullYear() + opts.years);
  if (opts.months) d.setMonth(d.getMonth() + opts.months);
  if (opts.days) d.setDate(d.getDate() + opts.days);
  return d.toISOString().slice(0, 10);
}

// Regra da empresa: o limite de gozo é 11 meses após o fim do período aquisitivo (a CLT dá 12).
export const VACATION_LIMIT_MONTHS = 11;

export interface AcquisitionPeriod {
  index: number;
  year: number;
  startISO: string;
  endISO: string;
  limitISO: string;
  complete: boolean;
  // Art. 133 da CLT: período perdido (afastamento INSS > 6 meses ou licença remunerada > 30 dias).
  lost?: { reason: string; returnISO: string };
  // Período que veio do relatório da contabilidade: saldo na data base (só as férias
  // lançadas no sistema depois dela são descontadas).
  report?: { baseDateISO: string; daysTaken: number; daysRemaining: number };
}

// Foto do relatório "Programação de Férias" do Domínio (contabilidade) por funcionário:
// até a data base vale o que a contabilidade diz; depois dela o sistema calcula.
export const VACATION_BASELINES_COLLECTION = "vacationBaselines";

export interface VacationBaseline {
  id: string;
  employeeId: string;
  companyId: string;
  baseDateISO: string;
  reportCompany: string;
  reportCode: string;
  reportName: string;
  periods: Array<{ startISO: string; endISO: string; daysRight: number; daysTaken: number; daysRemaining: number; limitISO: string; absences: number }>;
  importedAt: string;
  importedBy: string;
}

// Tira a foto do relatório de um funcionário (ligação errada ou relatório velho):
// ele volta ao cálculo pelo cadastro.
export async function deleteVacationBaseline(employeeId: string): Promise<void> {
  if (!firestore) return;
  await deleteDoc(doc(firestore, VACATION_BASELINES_COLLECTION, employeeId));
}

export async function loadVacationBaselines(): Promise<VacationBaseline[]> {
  if (!firestore) return [];
  const snap = await getDocs(collection(firestore, VACATION_BASELINES_COLLECTION));
  return snap.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as VacationBaseline);
}

export interface DateInterval {
  start: string;
  end: string;
}

// Afastamentos e faltas que mexem nas férias (CLT arts. 130 e 133).
export interface VacationLeaveData {
  inss: DateInterval[];
  paidLicense: DateInterval[];
  absenceDates: string[];
  onLeaveToday: boolean;
}

export function addDaysISO(iso: string, days: number): string {
  return addToISO(iso, { days });
}

function daysInclusive(startISO: string, endISO: string): number {
  return Math.round((new Date(`${endISO}T00:00:00`).getTime() - new Date(`${startISO}T00:00:00`).getTime()) / 86400000) + 1;
}

// Dia em que os dias de afastamento dentro do período passam de maxDays (mesmo descontínuos) e o dia do retorno.
function periodLoss(intervals: DateInterval[], startISO: string, endISO: string, maxDays: number) {
  let total = 0;
  for (const interval of [...intervals].sort((a, b) => a.start.localeCompare(b.start))) {
    const from = interval.start > startISO ? interval.start : startISO;
    const to = interval.end < endISO ? interval.end : endISO;
    if (from > to) continue;
    const length = daysInclusive(from, to);
    if (total + length > maxDays) {
      return { lossISO: addToISO(from, { days: maxDays - total }), returnISO: addToISO(interval.end, { days: 1 }) };
    }
    total += length;
  }
  return null;
}

export function buildAcquisitionPeriods(
  admissionDate: string | undefined,
  todayISO: string,
  leave?: VacationLeaveData,
  baseline?: VacationBaseline,
): AcquisitionPeriod[] {
  // Com relatório da contabilidade: os períodos dele (com saldo na data base) e,
  // depois do último, os anos seguintes calculados pelo sistema.
  if (baseline?.periods.length) {
    const fromReport: AcquisitionPeriod[] = [...baseline.periods]
      .sort((a, b) => a.startISO.localeCompare(b.startISO))
      .map((item, index) => ({
        index,
        year: Number(item.startISO.slice(0, 4)),
        startISO: item.startISO,
        endISO: item.endISO,
        limitISO: item.limitISO,
        complete: item.endISO < todayISO,
        report: { baseDateISO: baseline.baseDateISO, daysTaken: item.daysTaken, daysRemaining: item.daysRemaining },
      }));
    const nextStart = addToISO(fromReport[fromReport.length - 1].endISO, { days: 1 });
    const after = buildAcquisitionPeriods(nextStart, todayISO, leave)
      .reverse()
      .map((item, offset) => ({ ...item, index: fromReport.length + offset }));
    return [...fromReport, ...after].reverse();
  }
  if (!admissionDate || !/^\d{4}-\d{2}-\d{2}$/.test(admissionDate)) return [];
  const periods: AcquisitionPeriod[] = [];
  let startISO = admissionDate;
  for (let index = 0; index < 80; index += 1) {
    if (startISO > todayISO) break;
    const nextStart = addToISO(startISO, { years: 1 });
    const endISO = addToISO(nextStart, { days: -1 });
    const year = new Date(`${startISO}T00:00:00`).getFullYear();
    const losses = leave ? [
      { loss: periodLoss(leave.inss, startISO, endISO, 180), reason: "Afastamento pelo INSS por mais de 6 meses" },
      { loss: periodLoss(leave.paidLicense, startISO, endISO, 30), reason: "Licença remunerada por mais de 30 dias" },
    ].filter((item) => item.loss).sort((a, b) => a.loss!.lossISO.localeCompare(b.loss!.lossISO)) : [];
    if (losses.length) {
      const { loss, reason } = losses[0];
      periods.push({ index, year, startISO, endISO: loss!.lossISO, limitISO: "", complete: true, lost: { reason, returnISO: loss!.returnISO } });
      // Novo período aquisitivo só começa quando a pessoa volta ao serviço (art. 133, § 2º).
      if (loss!.returnISO > todayISO) break;
      startISO = loss!.returnISO;
      continue;
    }
    periods.push({
      index,
      year,
      startISO,
      endISO,
      limitISO: addToISO(endISO, { months: VACATION_LIMIT_MONTHS }),
      complete: endISO < todayISO,
    });
    startISO = nextStart;
  }
  return periods.reverse();
}

export interface CltRight {
  days: number;
  lost: boolean;
}

export function cltRightForAbsences(absences: number): CltRight {
  if (absences > 32) return { days: 0, lost: true };
  if (absences >= 24) return { days: 12, lost: false };
  if (absences >= 15) return { days: 18, lost: false };
  if (absences >= 6) return { days: 24, lost: false };
  return { days: 30, lost: false };
}

// Lançamentos que contam para um período aquisitivo: pelo ano informado ou, sem ano, pelo início dentro do
// período concessivo legal (12 meses) — férias iniciadas no 12º mês continuam no período certo.
export function vacationsForPeriod(period: AcquisitionPeriod, vacations: Vacation[]): Vacation[] {
  const legalLimitISO = addToISO(period.endISO, { months: 12 });
  return vacations.filter(
    (v) =>
      v.acquisitionYear === period.year ||
      (!v.acquisitionYear && v.startDate && v.startDate >= period.startISO && v.startDate <= legalLimitISO),
  );
}

// Proximidade do limite de gozo que entra em "Próximo ao limite".
export const VACATION_NEAR_LIMIT_MONTHS = 5;
export interface VacationStatus {
  bucket: VacationBucket;
  // Período mais antigo já completo que ainda tem dias a gozar (é ele que define a situação).
  pendingPeriod?: AcquisitionPeriod;
  pendingDays: number;
}

// Saldo de um período do relatório: o que a contabilidade deu como restante na data
// base, menos as férias lançadas no sistema depois dela.
export function reportPeriodPending(period: AcquisitionPeriod, vacations: Vacation[]) {
  if (!period.report) return 0;
  const after = vacationsForPeriod(period, vacations).filter((v) => (v.startDate || "") >= period.report!.baseDateISO);
  return Math.max(0, period.report.daysRemaining - after.reduce((sum, v) => sum + (v.days || 0) + (v.daysSold || 0), 0));
}

export function vacationStatus(
  admissionDate: string | undefined,
  vacations: Vacation[],
  todayISO: string,
  leave?: VacationLeaveData,
  baseline?: VacationBaseline,
): VacationStatus {
  const completeOldestFirst = buildAcquisitionPeriods(admissionDate, todayISO, leave, baseline)
    .filter((period) => period.complete)
    .reverse();
  for (const period of completeOldestFirst) {
    if (period.lost) continue;
    if (period.report) {
      const pending = reportPeriodPending(period, vacations);
      if (pending <= 0) continue;
      const nearLimitReport = addToISO(todayISO, { months: VACATION_NEAR_LIMIT_MONTHS });
      const reportBucket: VacationBucket = period.limitISO < todayISO ? "vencido" : period.limitISO <= nearLimitReport ? "proximo" : "iniciado";
      return { bucket: reportBucket, pendingPeriod: period, pendingDays: pending };
    }
    const absences = leave ? leave.absenceDates.filter((date) => date >= period.startISO && date <= period.endISO).length : 0;
    const right = cltRightForAbsences(absences);
    if (right.lost) continue;
    const used = vacationsForPeriod(period, vacations).reduce((sum, v) => sum + (v.days || 0) + (v.daysSold || 0), 0);
    const pendingDays = right.days - used;
    if (pendingDays <= 0) continue;
    const nearLimit = addToISO(todayISO, { months: VACATION_NEAR_LIMIT_MONTHS });
    const bucket: VacationBucket = period.limitISO < todayISO ? "vencido"
      : period.limitISO <= nearLimit ? "proximo"
        : "iniciado";
    return { bucket, pendingPeriod: period, pendingDays };
  }
  return { bucket: "emdia", pendingDays: 0 };
}

export const bucketMeta: Record<
  VacationBucket,
  { label: string; sub: string; color: string; bg: string; border: string }
> = {
  proximo: {
    label: "Próximo ao limite",
    sub: `Limite de gozo em até ${VACATION_NEAR_LIMIT_MONTHS} meses`,
    color: "color-mix(in srgb, #b45309 var(--ink-keep), #e5e7eb)",
    bg: "color-mix(in srgb, #fffbeb var(--tint-keep), var(--surface))",
    border: "color-mix(in srgb, #fde68a var(--tint-line), var(--surface))",
  },
  iniciado: {
    label: "Iniciou o período",
    sub: "1 ano completo, férias a tirar",
    color: "color-mix(in srgb, #1d4ed8 var(--ink-keep), #e5e7eb)",
    bg: "var(--surface-muted)",
    border: "color-mix(in srgb, #bfdbfe var(--tint-line), var(--surface))",
  },
  vencido: {
    label: "Período vencido",
    sub: "Limite de gozo já passou",
    color: "color-mix(in srgb, #b91c1c var(--ink-keep), #e5e7eb)",
    bg: "color-mix(in srgb, #fef2f2 var(--tint-keep), var(--surface))",
    border: "color-mix(in srgb, #fecaca var(--tint-line), var(--surface))",
  },
  afastado: {
    label: "Afastado",
    sub: "Afastamento ou licença em curso",
    color: "color-mix(in srgb, #be185d var(--ink-keep), #e5e7eb)",
    bg: "color-mix(in srgb, #fdf2f8 var(--tint-keep), var(--surface))",
    border: "color-mix(in srgb, #fbcfe8 var(--tint-line), var(--surface))",
  },
  emdia: {
    label: "Em dia",
    sub: "Menos de 1 ano ou férias já tiradas",
    color: "color-mix(in srgb, #047857 var(--ink-keep), #e5e7eb)",
    bg: "color-mix(in srgb, #ecfdf5 var(--tint-keep), var(--surface))",
    border: "color-mix(in srgb, #a7f3d0 var(--tint-line), var(--surface))",
  },
};

export function hasScheduledVacation(dateISO: string, vacations: Vacation[]): boolean {
  return vacations.some((v) => v.startDate && v.startDate > dateISO);
}

export function isOnVacation(dateISO: string, vacations: Vacation[]): boolean {
  if (!dateISO) return false;
  return vacations.some(
    (v) => v.startDate && v.endDate && dateISO >= v.startDate && dateISO <= v.endDate,
  );
}
