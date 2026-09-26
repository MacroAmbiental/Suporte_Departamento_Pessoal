import { collection, onSnapshot, query, where } from "firebase/firestore";
import { useEffect, useRef, useState } from "react";
import { firestore } from "@/services/firebase";
import { loadHrPointRange } from "@/modules/hrControl/utils/hrPointCache";
import { readHrSession, type CachedRange } from "@/modules/hrControl/utils/hrSessionCache";
import { subscribeTimeRecordsForDay } from "@/modules/timekeeping/data/timeRecordsRepository";
import type { TimeRecord, TimekeepingDayTable } from "@/types/domain";
import { isIsoDate } from "@/modules/hrControl/domain/hrControlModel";

export type UseHrControlDataArgs = {
  userId?: string;
  savedDayTablesReady: boolean;
  savedDayTables: TimekeepingDayTable[];
  startDate: string;
  endDate: string;
  monthAnchorDate: string;
  monthlyStartDate: string;
  comparisonWindow: {
    previousStart: string;
    currentEnd: string;
  };
  monthlyRangeKey: string;
  comparisonRangeKey: string;
  activeView: string;
  warmSession?: ReturnType<typeof readHrSession>;
  sessionIsFresh: boolean;
  dataRevision: number;
  changedPointDatesRef: React.MutableRefObject<Set<string>>;
};

export function useHrControlData({
  userId,
  savedDayTablesReady,
  savedDayTables,
  startDate,
  endDate,
  monthAnchorDate,
  monthlyStartDate,
  comparisonWindow,
  monthlyRangeKey,
  comparisonRangeKey,
  activeView,
  warmSession,
  sessionIsFresh,
  dataRevision,
  changedPointDatesRef,
}: UseHrControlDataArgs) {
  const [records, setRecords] = useState<TimeRecord[]>(() => warmSession?.records || []);
  const [recordsLoading, setRecordsLoading] = useState(!warmSession);
  const [loadedRecordsKey, setLoadedRecordsKey] = useState(warmSession?.loadedRecordsKey || "");
  const [recordsError, setRecordsError] = useState(false);
  const [monthlySavedDayTables, setMonthlySavedDayTables] = useState<TimekeepingDayTable[]>(() => warmSession?.monthlySavedDayTables || []);
  const [monthlySavedDaysStatus, setMonthlySavedDaysStatus] = useState<"loading" | "ready" | "error">(
    warmSession?.monthlySavedDaysKey ? "ready" : "loading",
  );
  const [monthlySavedDaysKey, setMonthlySavedDaysKey] = useState(warmSession?.monthlySavedDaysKey || "");
  const [monthlyRangeData, setMonthlyRangeData] = useState<CachedRange>(
    warmSession?.monthlyRangeData || { key: "", status: "loading", records: [] },
  );
  const [comparisonSavedDayTables, setComparisonSavedDayTables] = useState<TimekeepingDayTable[]>(() => warmSession?.comparisonSavedDayTables || []);
  const [comparisonSavedDaysStatus, setComparisonSavedDaysStatus] = useState<"loading" | "ready" | "error">(
    warmSession?.comparisonSavedDaysKey ? "ready" : "loading",
  );
  const [comparisonSavedDaysKey, setComparisonSavedDaysKey] = useState(warmSession?.comparisonSavedDaysKey || "");
  const [comparisonRangeData, setComparisonRangeData] = useState<CachedRange>(
    warmSession?.comparisonRangeData || { key: "", status: "loading", records: [] },
  );
  const [streakPointData, setStreakPointData] = useState<CachedRange>(
    warmSession?.streakPointData || { key: "", status: "loading", records: [] },
  );

  const periodHandledRevision = useRef(0);
  const monthlyHandledRevision = useRef(0);
  const comparisonHandledRevision = useRef(0);
  const periodRangeKey = `${userId || ""}:${startDate}:${endDate}`;
  const invalidRange = Boolean(startDate && endDate && startDate > endDate);

  useEffect(() => {
    if (warmSession && sessionIsFresh) {
      return undefined;
    }

    if (invalidRange || !savedDayTablesReady || !userId) return undefined;
    let active = true;
    const forced = dataRevision !== periodHandledRevision.current
      ? changedPointDatesRef.current.size ? changedPointDatesRef.current : new Set(savedDayTables.map((table) => table.date))
      : new Set<string>();

    setRecordsLoading(!readHrSession(userId) || loadedRecordsKey !== periodRangeKey);
    setRecordsError(false);

    void loadHrPointRange(startDate, endDate, savedDayTables, userId, forced, (lastKnown) => {
      if (active) {
        setRecords(lastKnown);
        setLoadedRecordsKey(periodRangeKey);
      }
    })
      .then((nextRecords) => {
        if (!active) return;
        setRecords(nextRecords);
        setLoadedRecordsKey(periodRangeKey);
        setRecordsError(false);
        periodHandledRevision.current = dataRevision;
      })
      .catch((error) => {
        console.warn("Não foi possível atualizar os dados de ponto do Controle RH.", error);
        if (active) setRecordsError(true);
      })
      .finally(() => {
        if (active) setRecordsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [changedPointDatesRef, dataRevision, endDate, invalidRange, loadedRecordsKey, periodRangeKey, savedDayTables, savedDayTablesReady, sessionIsFresh, startDate, userId, warmSession]);

  useEffect(() => {
    if (activeView !== "general" || dataRevision === 0 || !savedDayTablesReady || !firestore) return undefined;
    if (monthlySavedDaysKey !== monthlyRangeKey) setMonthlySavedDaysStatus("loading");

    return onSnapshot(
      query(collection(firestore, "timekeepingDayTables"), where("date", ">=", monthlyStartDate), where("date", "<=", monthAnchorDate)),
      (snapshot) => {
        setMonthlySavedDayTables(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as TimekeepingDayTable));
        setMonthlySavedDaysKey(monthlyRangeKey);
        setMonthlySavedDaysStatus("ready");
      },
      (error) => {
        console.warn("Não foi possível acompanhar os dias dos gráficos mensais.", error);
        setMonthlySavedDaysStatus("error");
      },
    );
  }, [activeView, monthAnchorDate, monthlyRangeKey, monthlySavedDaysKey, monthlyStartDate, savedDayTablesReady]);

  useEffect(() => {
    if (activeView !== "general" || monthlySavedDaysStatus !== "ready" ||
      monthlySavedDaysKey !== monthlyRangeKey || !userId) return undefined;

    let active = true;
    const forced = dataRevision !== monthlyHandledRevision.current
      ? changedPointDatesRef.current.size ? changedPointDatesRef.current : new Set(monthlySavedDayTables.map((table) => table.date))
      : new Set<string>();

    setMonthlyRangeData((previous) => previous.key === monthlyRangeKey ? previous : { key: monthlyRangeKey, status: "loading", records: [] });

    void loadHrPointRange(monthlyStartDate, monthAnchorDate, monthlySavedDayTables, userId, forced, (lastKnown) => {
      if (active) setMonthlyRangeData({ key: monthlyRangeKey, status: "ready", records: lastKnown });
    })
      .then((nextRecords) => {
        if (active) {
          setMonthlyRangeData({ key: monthlyRangeKey, status: "ready", records: nextRecords });
          monthlyHandledRevision.current = dataRevision;
        }
      })
      .catch((error) => {
        console.warn("Não foi possível carregar os pontos dos 12 meses.", error);
        if (active) setMonthlyRangeData((previous) => previous.key === monthlyRangeKey && previous.status === "ready"
          ? previous : { key: monthlyRangeKey, status: "error", records: [] });
      });

    return () => {
      active = false;
    };
  }, [activeView, changedPointDatesRef, dataRevision, monthAnchorDate, monthlyRangeKey, monthlySavedDayTables, monthlySavedDaysKey, monthlySavedDaysStatus, monthlyStartDate, userId]);

  useEffect(() => {
    const comparisonUsesMonthlyRange = comparisonWindow.previousStart >= monthlyStartDate && comparisonWindow.previousStart <= monthAnchorDate;
    if (activeView !== "general" || comparisonUsesMonthlyRange || invalidRange || !firestore) return undefined;
    if (comparisonSavedDaysKey !== comparisonRangeKey) setComparisonSavedDaysStatus("loading");

    return onSnapshot(
      query(collection(firestore, "timekeepingDayTables"), where("date", ">=", comparisonWindow.previousStart), where("date", "<=", comparisonWindow.currentEnd)),
      (snapshot) => {
        setComparisonSavedDayTables(snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as TimekeepingDayTable));
        setComparisonSavedDaysKey(comparisonRangeKey);
        setComparisonSavedDaysStatus("ready");
      },
      (error) => {
        console.warn("Não foi possível consultar os meses de comparação.", error);
        setComparisonSavedDaysStatus("error");
      },
    );
  }, [activeView, comparisonRangeKey, comparisonSavedDaysKey, comparisonSavedDaysStatus, comparisonWindow.currentEnd, comparisonWindow.previousStart, invalidRange, monthAnchorDate, monthlyStartDate]);

  useEffect(() => {
    const comparisonUsesMonthlyRange = comparisonWindow.previousStart >= monthlyStartDate && comparisonWindow.previousStart <= monthAnchorDate;
    if (activeView !== "general" || comparisonUsesMonthlyRange || invalidRange || !userId ||
      comparisonSavedDaysStatus !== "ready" || comparisonSavedDaysKey !== comparisonRangeKey) return undefined;

    let active = true;
    const forced = dataRevision !== comparisonHandledRevision.current
      ? changedPointDatesRef.current.size ? changedPointDatesRef.current : new Set(comparisonSavedDayTables.map((table) => table.date))
      : new Set<string>();

    setComparisonRangeData((previous) => previous.key === comparisonRangeKey ? previous : { key: comparisonRangeKey, status: "loading", records: [] });

    void loadHrPointRange(comparisonWindow.previousStart, comparisonWindow.currentEnd, comparisonSavedDayTables, userId, forced, (lastKnown) => {
      if (active) setComparisonRangeData({ key: comparisonRangeKey, status: "ready", records: lastKnown });
    }).then((nextRecords) => {
      if (active) {
        setComparisonRangeData({ key: comparisonRangeKey, status: "ready", records: nextRecords });
        comparisonHandledRevision.current = dataRevision;
      }
    }).catch((error) => {
      console.warn("Não foi possível carregar os meses de comparação.", error);
      if (active) setComparisonRangeData((previous) => previous.key === comparisonRangeKey && previous.status === "ready"
        ? previous : { key: comparisonRangeKey, status: "error", records: [] });
    });

    return () => {
      active = false;
    };
  }, [activeView, changedPointDatesRef, comparisonRangeKey, comparisonSavedDayTables, comparisonSavedDaysKey, comparisonSavedDaysStatus, comparisonWindow.currentEnd, comparisonWindow.previousStart, dataRevision, invalidRange, monthAnchorDate, monthlyStartDate, userId]);

  const streakDatesKey = "";

  useEffect(() => {
    if (!savedDayTablesReady || activeView !== "absenceMonitoring") return undefined;
    const dates = new Set(savedDayTables.map((table) => table.date).filter(isIsoDate));
    if (!dates.size) {
      setStreakPointData({ key: "", status: "ready", records: [] });
      return undefined;
    }

    const unsubscribers = Array.from(dates).map((date) => subscribeTimeRecordsForDay(date, (nextRecords) => {
      setStreakPointData({ key: date, status: "ready", records: nextRecords });
    }, (error) => {
      console.warn("Não foi possível acompanhar os pontos usados na sequência de faltas.", error);
      setStreakPointData({ key: date, status: "error", records: [] });
    }));

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [activeView, savedDayTables, savedDayTablesReady]);

  return {
    records,
    setRecords,
    recordsLoading,
    setRecordsLoading,
    loadedRecordsKey,
    setLoadedRecordsKey,
    recordsError,
    setRecordsError,
    monthlySavedDayTables,
    setMonthlySavedDayTables,
    monthlySavedDaysStatus,
    setMonthlySavedDaysStatus,
    monthlySavedDaysKey,
    setMonthlySavedDaysKey,
    monthlyRangeData,
    setMonthlyRangeData,
    comparisonSavedDayTables,
    setComparisonSavedDayTables,
    comparisonSavedDaysStatus,
    setComparisonSavedDaysStatus,
    comparisonSavedDaysKey,
    setComparisonSavedDaysKey,
    comparisonRangeData,
    setComparisonRangeData,
    streakPointData,
    setStreakPointData,
    periodRangeKey,
    invalidRange,
  };
}
