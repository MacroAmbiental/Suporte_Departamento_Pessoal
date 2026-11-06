import { collection, documentId, getCountFromServer, getDocsFromCache, getDocsFromServer, query, where } from "firebase/firestore";
import { firestore } from "@/services/firebase";
import { completeSavedDates } from "@/modules/hrControl/abandonment/abandonmentModel";
import { employeeLeaveEntries } from "@/modules/employeeProcesses/utils/leavePeriods";
import { loadTimekeepingDayTables } from "@/modules/timekeeping/data/timekeepingDayRepository";
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
// 06/11 (custo): antes relia as faltas/afastados de TODOS os dias salvos a cada
// abertura (e o cache sumia no F5). Agora cada dia tem versão = updatedAt do
// documento-pai timeRecords/{data} (muda em toda gravação) + quantos registros
// de falta/afastado o dia tem (pega exclusão). Dia com a mesma versão vem da
// memória ou do cache do navegador; só o dia que mudou é buscado de novo.
type DayRows = { employeeId: string; status: string }[];
const DAY_INDEX_KEY = "macro-dp:vacation-leave-day-index:v1";
const dayMemory = new Map<string, { version: string; rows: DayRows }>();

function readDayIndex(): Record<string, string> {
  try {
    return JSON.parse(window.localStorage.getItem(DAY_INDEX_KEY) || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function saveDayIndex(index: Record<string, string>) {
  try {
    window.localStorage.setItem(DAY_INDEX_KEY, JSON.stringify(index));
  } catch {
    // Índice é só otimização.
  }
}

async function pool<T, R>(items: T[], size: number, work: (item: T) => Promise<R>) {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) {
      const index = next++;
      results[index] = await work(items[index]);
    }
  }));
  return results;
}

async function fetchPointLeaveDays(): Promise<PointLeaveDays> {
  const empty: PointLeaveDays = { absencesByEmployee: new Map(), leaveByEmployee: new Map(), latestCompleteDate: "" };
  const db = firestore;
  if (!db) return empty;
  const tables = (await loadTimekeepingDayTables())
    .filter((table): table is typeof table & { date: string } => Boolean(table.date));
  const dates = Array.from(new Set(tables.map((table) => table.date))).sort();
  const add = (target: Map<string, string[]>, employeeId: string, date: string) => {
    const list = target.get(employeeId) || [];
    list.push(date);
    target.set(employeeId, list);
  };
  if (dates.length) {
    const folders = await getDocsFromServer(query(
      collection(db, "timeRecords"),
      where(documentId(), ">=", dates[0]),
      where(documentId(), "<=", dates[dates.length - 1]),
    ));
    const updatedAtByDate = new Map(folders.docs.map((entry) => [entry.id, String(entry.data().updatedAt || "")]));
    const index = readDayIndex();
    const days = await pool(dates, 8, async (date) => {
      const leaveQuery = query(
        collection(db, "timeRecords", date, "employeePoints"),
        where("status", "in", ["absence_confirmed", "leave"]),
      );
      const count = (await getCountFromServer(leaveQuery)).data().count;
      const version = `${updatedAtByDate.get(date) || ""}|${count}`;
      const memory = dayMemory.get(date);
      if (memory?.version === version) return { date, rows: memory.rows };
      let snapshot = null;
      if (index[date] === version) {
        try {
          const cachedDay = await getDocsFromCache(leaveQuery);
          if (cachedDay.size === count) snapshot = cachedDay;
        } catch {
          snapshot = null;
        }
      }
      if (!snapshot) snapshot = await getDocsFromServer(leaveQuery);
      const rows = snapshot.docs.map((entry) => ({
        employeeId: String(entry.data().employeeId || entry.id),
        status: String(entry.data().status || ""),
      }));
      dayMemory.set(date, { version, rows });
      index[date] = version;
      return { date, rows };
    });
    saveDayIndex(index);
    days.forEach(({ date, rows }) => rows.forEach((row) => {
      add(row.status === "leave" ? empty.leaveByEmployee : empty.absencesByEmployee, row.employeeId, date);
    }));
  }
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
