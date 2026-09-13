import { useEffect, useState } from "react";
import {
  cachedDayRecords,
  subscribeTimeRecordsForDay,
} from "@/modules/timekeeping/data/timeRecordsRepository";
import type { TimeRecord } from "@/types/domain";

/**
 * Mantido com o nome antigo para compatibilidade, mas agora carrega somente o
 * dia selecionado. Relatórios mensais usam loadTimeRecordsRange sob demanda.
 */
export function useMonthlyTimeRecords(date: string) {
  const [records, setRecords] = useState<TimeRecord[]>(() => cachedDayRecords(date));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setRecords(cachedDayRecords(date));
    setLoading(true);

    const unsubscribe = subscribeTimeRecordsForDay(
      date,
      (nextRecords) => {
        if (!active) return;
        setRecords(nextRecords);
        setLoading(false);
      },
      () => {
        if (active) setLoading(false);
      },
    );

    return () => {
      active = false;
      unsubscribe();
    };
  }, [date]);

  return { records, loading, day: date };
}
