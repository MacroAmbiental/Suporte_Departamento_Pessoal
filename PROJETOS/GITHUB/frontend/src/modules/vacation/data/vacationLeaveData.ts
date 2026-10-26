import { collection, getDocs, query, where } from "firebase/firestore";
import { firestore } from "@/services/firebase";
import { completeSavedDates } from "@/modules/hrControl/abandonment/abandonmentModel";
import { employeeLeaveEntries } from "@/modules/employeeProcesses/utils/leavePeriods";
import type { Employee } from "@/types/domain";
import { todayISO } from "@/utils/format";
import { addDaysISO, type DateInterval, type VacationLeaveData } from "@/modules/vacation/data/vacationsRepository";

// Modalidades do afastamento (Processos → Afastamento) pagas pelo INSS: contam para os 6 meses do art. 133, IV.
const INSS_LEAVE_TYPES = ["incapacidade temporária", "afastamento por invalidez"];

export type PointLeaveDays = {
  absencesByEmployee: Map<string, string[]>;
  leaveByEmployee: Map<string, string[]>;
  // Último dia de ponto completo: afastamento que vai até ele está em curso.
  latestCompleteDate: string;
};

// A leitura leva dezenas de segundos: reaproveitada por alguns minutos ao voltar para a tela.
const CACHE_MS = 5 * 60 * 1000;
let cached: { at: number; promise: Promise<PointLeaveDays> } | null = null;

export function loadPointLeaveDays(): Promise<PointLeaveDays> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.promise;
  const promise = fetchPointLeaveDays();
  cached = { at: Date.now(), promise };
  promise.catch(() => { cached = null; });
  return promise;
}

// Faltas confirmadas e dias "Afastado" do ponto, uma consulta pequena por dia salvo (sem carregar o ponto inteiro).
async function fetchPointLeaveDays(): Promise<PointLeaveDays> {
  const empty: PointLeaveDays = { absencesByEmployee: new Map(), leaveByEmployee: new Map(), latestCompleteDate: "" };
  if (!firestore) return empty;
  const tablesSnapshot = await getDocs(collection(firestore, "timekeepingDayTables"));
  const tables = tablesSnapshot.docs.map((entry) => entry.data() as { date?: string; recordCount?: number })
    .filter((table): table is { date: string; recordCount?: number } => Boolean(table.date));
  const dates = Array.from(new Set(tables.map((table) => table.date)));
  const add = (target: Map<string, string[]>, employeeId: string, date: string) => {
    const list = target.get(employeeId) || [];
    list.push(date);
    target.set(employeeId, list);
  };
  await Promise.all(dates.map(async (date) => {
    const snapshot = await getDocs(query(
      collection(firestore!, "timeRecords", date, "employeePoints"),
      where("status", "in", ["absence_confirmed", "leave"]),
    ));
    snapshot.docs.forEach((entry) => {
      const data = entry.data();
      const employeeId = String(data.employeeId || entry.id);
      add(data.status === "leave" ? empty.leaveByEmployee : empty.absencesByEmployee, employeeId, date);
    });
  }));
  const today = todayISO();
  empty.latestCompleteDate = completeSavedDates(tables.filter((table) => table.date <= today))[0] || "";
  return empty;
}

// Dias "Afastado" do ponto viram intervalos: buracos de até 4 dias (fim de semana, feriado) não cortam o afastamento.
function intervalsFromDates(dates: string[]): DateInterval[] {
  const sorted = Array.from(new Set(dates)).sort();
  const intervals: DateInterval[] = [];
  sorted.forEach((date) => {
    const last = intervals[intervals.length - 1];
    if (last && date <= addDaysISO(last.end, 5)) last.end = date;
    else intervals.push({ start: date, end: date });
  });
  return intervals;
}

function expandDates(interval: DateInterval): string[] {
  const dates: string[] = [];
  for (let date = interval.start; date <= interval.end && dates.length < 3660; date = addDaysISO(date, 1)) dates.push(date);
  return dates;
}

export function employeeVacationLeaveData(employee: Employee, point: PointLeaveDays | null, todayISO: string): VacationLeaveData {
  const entries = employeeLeaveEntries(employee);
  const inss: DateInterval[] = entries
    .filter((entry) => entry.kind === "leave" && INSS_LEAVE_TYPES.some((type) => entry.label.toLocaleLowerCase("pt-BR").startsWith(type)))
    .map((entry) => ({ start: entry.start, end: entry.end }));
  // Afastamento do ponto não tem motivo: tratado como afastamento previdenciário.
  const pointLeave = intervalsFromDates(point?.leaveByEmployee.get(employee.id) || []);
  const latest = point?.latestCompleteDate || "";
  pointLeave.forEach((interval) => {
    // Afastado até o último dia de ponto completo: segue afastado até hoje.
    if (latest && interval.end >= addDaysISO(latest, -4)) interval.end = todayISO > interval.end ? todayISO : interval.end;
  });
  inss.push(...pointLeave);
  const paidLicense: DateInterval[] = entries
    .filter((entry) => entry.kind === "license" && entry.label.toLocaleLowerCase("pt-BR").includes("remunerada"))
    .map((entry) => ({ start: entry.start, end: entry.end }));
  // Suspensão disciplinar não é falta justificada (art. 131): entra na contagem do art. 130.
  const suspensionDates = entries
    .filter((entry) => entry.kind === "suspension" || entry.label.toLocaleLowerCase("pt-BR") === "suspensão")
    .flatMap(expandDates);
  const absenceDates = Array.from(new Set([...(point?.absencesByEmployee.get(employee.id) || []), ...suspensionDates]));
  const onLeaveToday = [...inss, ...entries.filter((entry) => entry.kind === "license").map((entry) => ({ start: entry.start, end: entry.end }))]
    .some((interval) => interval.start <= todayISO && todayISO <= interval.end);
  return { inss, paidLicense, absenceDates, onLeaveToday };
}
