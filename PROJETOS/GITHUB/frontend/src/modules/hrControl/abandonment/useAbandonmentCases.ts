import { collection, doc, getDocs, onSnapshot, orderBy, query, where, writeBatch } from "firebase/firestore";
import { useCallback, useEffect, useMemo, useState } from "react";
import { firestore } from "@/services/firebase";
import { employeeEffectiveStatusForDate } from "@/modules/timekeeping/hooks/useTimekeepingModel";
import type { Employee, TimekeepingDayTable, User } from "@/types/domain";
import {
  ABANDONMENT_CASES_COLLECTION,
  ABANDONMENT_EVENTS_SUBCOLLECTION,
  ABANDONMENT_LOOKBACK_DAYS,
  ABANDONMENT_TRIGGER_DAYS,
  completeSavedDates,
  currentAbsenceStreak,
  type AbandonmentCase,
  type AbandonmentEvent,
  type AbandonmentOutcome,
  type AbandonmentPerson,
  type AbandonmentStage,
  type AbsenceStreak,
} from "@/modules/hrControl/abandonment/abandonmentModel";

type NewEvent = Omit<AbandonmentEvent, "id" | "createdAt" | "createdBy">;

function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

// Faltas confirmadas e pendentes por dia, guardadas enquanto o app está aberto (sobrevive a remontar a tela).
const absenceCache = new Map<string, { version: string; employeeIds: string[]; pendingIds: string[] }>();

type AbsencesByEmployee = { confirmed: Map<string, Set<string>>; pending: Map<string, Set<string>> };

function absencesFromCache(dates: string[]): AbsencesByEmployee {
  const confirmed = new Map<string, Set<string>>();
  const pending = new Map<string, Set<string>>();
  const add = (target: Map<string, Set<string>>, employeeId: string, date: string) => {
    const set = target.get(employeeId) || new Set<string>();
    set.add(date);
    target.set(employeeId, set);
  };
  dates.forEach((date) => {
    const entry = absenceCache.get(date);
    entry?.employeeIds.forEach((employeeId) => add(confirmed, employeeId, date));
    entry?.pendingIds?.forEach((employeeId) => add(pending, employeeId, date));
  });
  return { confirmed, pending };
}

// Firestore não aceita undefined: só grava os campos preenchidos do registro.
function cleanEvent(event: NewEvent) {
  return Object.fromEntries(Object.entries(event).filter(([, value]) => value !== undefined && value !== ""));
}

export function useAbandonmentCases({ employees, savedDayTables, isUsefulDay, user, today }: {
  employees: Employee[];
  savedDayTables: TimekeepingDayTable[];
  isUsefulDay: (employee: Employee, date: string) => boolean;
  user: User | null | undefined;
  today: string;
}) {
  const [absentDatesByEmployee, setAbsentDatesByEmployee] = useState<AbsencesByEmployee | null>(null);
  const [streakError, setStreakError] = useState(false);
  const [cases, setCases] = useState<AbandonmentCase[]>([]);
  const [casesReady, setCasesReady] = useState(false);
  const [casesError, setCasesError] = useState(false);

  const savedDatesDesc = useMemo(() => {
    const from = shiftDate(today, -ABANDONMENT_LOOKBACK_DAYS);
    return completeSavedDates(savedDayTables.filter((table) => table.date && table.date >= from && table.date <= today));
  }, [savedDayTables, today]);
  // Versão de cada dia (data de alteração do dia salvo): o cache só busca de novo o dia que mudou.
  const versionByDate = useMemo(() => {
    const versions = new Map<string, string>();
    savedDayTables.forEach((table) => versions.set(table.date, `${versions.get(table.date) || ""}|${table.updatedAt || table.savedAt || ""}`));
    return versions;
  }, [savedDayTables]);
  const datesKey = savedDatesDesc.map((date) => `${date}${versionByDate.get(date) || ""}`).join(",");

  // Só as faltas (confirmadas e pendentes) de cada dia completo (consulta pequena por dia, sem carregar o ponto inteiro).
  useEffect(() => {
    if (!firestore || !savedDatesDesc.length) return undefined;
    let active = true;
    setStreakError(false);
    const missing = savedDatesDesc.filter((date) => {
      const entry = absenceCache.get(date);
      return !entry || entry.version !== versionByDate.get(date) || !entry.pendingIds;
    });
    const publish = () => setAbsentDatesByEmployee(absencesFromCache(savedDatesDesc));
    if (!missing.length) { publish(); return undefined; }
    Promise.all(missing.map(async (date) => {
      const snapshot = await getDocs(query(
        collection(firestore!, "timeRecords", date, "employeePoints"),
        where("status", "in", ["absence_confirmed", "absence_pending"]),
      ));
      const idsWith = (status: string) => snapshot.docs
        .filter((entry) => entry.data().status === status)
        .map((entry) => String(entry.data().employeeId || entry.id));
      absenceCache.set(date, {
        version: versionByDate.get(date) || "",
        employeeIds: idsWith("absence_confirmed"),
        pendingIds: idsWith("absence_pending"),
      });
    }))
      .then(() => { if (active) publish(); })
      .catch((error) => {
        console.warn("Não foi possível carregar as faltas para o processo de abandono.", error);
        if (active) setStreakError(true);
      });
    return () => { active = false; };
    // datesKey resume as datas e as versões.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datesKey]);

  useEffect(() => {
    if (!firestore) return undefined;
    return onSnapshot(collection(firestore, ABANDONMENT_CASES_COLLECTION), (snapshot) => {
      setCases(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as AbandonmentCase));
      setCasesReady(true);
      setCasesError(false);
    }, (error) => {
      console.warn("Não foi possível carregar os casos de abandono.", error);
      setCasesError(true);
    });
  }, []);

  const streakByEmployee = useMemo(() => {
    const result = new Map<string, AbsenceStreak>();
    if (!absentDatesByEmployee || !savedDatesDesc.length) return result;
    const reference = savedDatesDesc[0];
    employees.forEach((employee) => {
      const absent = absentDatesByEmployee.confirmed.get(employee.id);
      // Desligado no cadastro sai mesmo se o último ponto salvo for o dia trabalhado do desligamento.
      if (!absent || employee.status === "terminated" || employeeEffectiveStatusForDate(employee, reference) === "terminated") return;
      const pending = absentDatesByEmployee.pending.get(employee.id) || new Set<string>();
      const streak = currentAbsenceStreak(employee, savedDatesDesc, absent, pending, isUsefulDay);
      if (streak) result.set(employee.id, streak);
    });
    return result;
  }, [absentDatesByEmployee, employees, isUsefulDay, savedDatesDesc]);

  // Desligado em outra tela (Funcionários/Processos/rotina): o caso aberto sai do andamento e aparece como encerrado,
  // sem gravar nada — se a pessoa for reativada, o caso volta para a etapa em que estava.
  const terminatedById = useMemo(() => new Map(employees
    .filter((employee) => employee.status === "terminated")
    .map((employee) => [employee.id, employee])), [employees]);
  const openCases = useMemo(() => cases.filter((item) => item.status === "open" && !terminatedById.has(item.employeeId)), [cases, terminatedById]);
  const dismissedElsewhere = useMemo(() => cases
    .filter((item) => item.status === "open" && terminatedById.has(item.employeeId))
    .map((item) => {
      const registrationData = terminatedById.get(item.employeeId)?.registrationData || {};
      const date = String(registrationData.deactivationCompletedDate || registrationData.deactivationEffectiveDate || registrationData.scheduledDeactivationDate || "");
      return { item, date };
    }), [cases, terminatedById]);
  const openCaseByEmployee = useMemo(() => new Map(cases
    .filter((item) => item.status === "open")
    .map((item) => [item.employeeId, item])), [cases]);

  // Sinalizados: sequência atual >= gatilho e ainda sem caso aberto.
  const flagged = useMemo(() => [...streakByEmployee.values()]
    .filter((streak) => streak.days >= ABANDONMENT_TRIGGER_DAYS && !openCaseByEmployee.has(streak.employeeId))
    .sort((left, right) => right.days - left.days), [openCaseByEmployee, streakByEmployee]);

  const person = useMemo<AbandonmentPerson>(() => ({ id: user?.id || "", name: user?.name || user?.username || "" }), [user]);

  const addEvent = useCallback(async (caseId: string, event: NewEvent) => {
    if (!firestore) throw new Error("Firebase/Firestore não configurado.");
    const now = new Date().toISOString();
    const batch = writeBatch(firestore);
    batch.set(doc(collection(firestore, ABANDONMENT_CASES_COLLECTION, caseId, ABANDONMENT_EVENTS_SUBCOLLECTION)), {
      ...cleanEvent(event), createdAt: now, createdBy: person,
    });
    batch.set(doc(firestore, ABANDONMENT_CASES_COLLECTION, caseId), { updatedAt: now }, { merge: true });
    await batch.commit();
  }, [person]);

  const openCase = useCallback(async (employee: Employee, streak: AbsenceStreak, companyName: string) => {
    if (!firestore) throw new Error("Firebase/Firestore não configurado.");
    const now = new Date().toISOString();
    const ref = doc(collection(firestore, ABANDONMENT_CASES_COLLECTION));
    const item: Omit<AbandonmentCase, "id"> = {
      employeeId: employee.id,
      employeeName: employee.name,
      companyId: employee.companyId || "",
      companyName,
      stage: "contact",
      status: "open",
      firstAbsenceDate: streak.firstDate,
      absenceDaysAtOpen: streak.days,
      openedAt: now,
      openedBy: person,
      stageChangedAt: now,
      updatedAt: now,
    };
    const batch = writeBatch(firestore);
    batch.set(ref, item);
    batch.set(doc(collection(ref, ABANDONMENT_EVENTS_SUBCOLLECTION)), {
      kind: "system",
      notes: `Caso aberto com ${streak.days} falta(s) confirmada(s) seguida(s), desde ${streak.firstDate.split("-").reverse().join("/")}.`,
      createdAt: now,
      createdBy: person,
    });
    await batch.commit();
    return ref.id;
  }, [person]);

  const moveStage = useCallback(async (item: AbandonmentCase, stage: AbandonmentStage, notes?: string) => {
    if (!firestore || item.stage === stage) return;
    const now = new Date().toISOString();
    const batch = writeBatch(firestore);
    batch.set(doc(firestore, ABANDONMENT_CASES_COLLECTION, item.id), { stage, stageChangedAt: now, updatedAt: now }, { merge: true });
    batch.set(doc(collection(firestore, ABANDONMENT_CASES_COLLECTION, item.id, ABANDONMENT_EVENTS_SUBCOLLECTION)), {
      ...cleanEvent({ kind: "stage", stageFrom: item.stage, stageTo: stage, notes }), createdAt: now, createdBy: person,
    });
    await batch.commit();
  }, [person]);

  const closeCase = useCallback(async (item: AbandonmentCase, outcome: AbandonmentOutcome, notes: string) => {
    if (!firestore) return;
    const now = new Date().toISOString();
    const batch = writeBatch(firestore);
    batch.set(doc(firestore, ABANDONMENT_CASES_COLLECTION, item.id), {
      status: "closed", stage: "closed", outcome, closedAt: now, closedBy: person, stageChangedAt: now, updatedAt: now,
    }, { merge: true });
    batch.set(doc(collection(firestore, ABANDONMENT_CASES_COLLECTION, item.id, ABANDONMENT_EVENTS_SUBCOLLECTION)), {
      ...cleanEvent({ kind: "closed", stageFrom: item.stage, stageTo: "closed", result: outcome, notes }), createdAt: now, createdBy: person,
    });
    await batch.commit();
  }, [person]);

  return {
    streakByEmployee,
    flagged,
    cases,
    openCases,
    dismissedElsewhere,
    casesReady: casesReady && Boolean(absentDatesByEmployee),
    loadError: streakError || casesError,
    openCase,
    addEvent,
    moveStage,
    closeCase,
  };
}

export function useAbandonmentEvents(caseId: string | null) {
  const [events, setEvents] = useState<AbandonmentEvent[]>([]);
  useEffect(() => {
    if (!firestore || !caseId) { setEvents([]); return undefined; }
    return onSnapshot(
      query(collection(firestore, ABANDONMENT_CASES_COLLECTION, caseId, ABANDONMENT_EVENTS_SUBCOLLECTION), orderBy("createdAt", "desc")),
      (snapshot) => setEvents(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as AbandonmentEvent)),
      (error) => console.warn("Não foi possível carregar o histórico do caso.", error),
    );
  }, [caseId]);
  return events;
}
