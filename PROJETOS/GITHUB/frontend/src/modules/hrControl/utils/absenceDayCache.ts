import { collection, getDocs, query, where } from "firebase/firestore";
import { firestore } from "@/services/firebase";
import type { TimekeepingDayTable } from "@/types/domain";

/**
 * Faltas (confirmadas e pendentes) por dia, guardadas enquanto o app está
 * aberto. Cada dia é buscado com uma consulta pequena (só quem faltou), nunca o
 * ponto inteiro, e só de novo quando a versão do dia salvo muda.
 * Usado pelo Processo de Abandono e pela sequência de 11 faltas do Absenteísmo.
 */
type AbsenceDayEntry = { version: string; employeeIds: string[]; pendingIds: string[] };

const absenceCache = new Map<string, AbsenceDayEntry>();

export function dayVersionsFrom(...tableLists: TimekeepingDayTable[][]) {
  const versions = new Map<string, string>();
  tableLists.forEach((tables) => tables.forEach((table) => {
    versions.set(table.date, `${versions.get(table.date) || ""}|${table.updatedAt || table.savedAt || ""}`);
  }));
  return versions;
}

export function cachedAbsenceDay(date: string) {
  return absenceCache.get(date);
}

/** Garante no cache as faltas de cada data (busca só as que faltam ou mudaram). */
export async function ensureAbsenceDays(dates: string[], versionByDate: ReadonlyMap<string, string>) {
  const db = firestore;
  if (!db) return;
  const missing = dates.filter((date) => {
    const entry = absenceCache.get(date);
    return !entry || entry.version !== (versionByDate.get(date) || "");
  });
  await Promise.all(missing.map(async (date) => {
    const snapshot = await getDocs(query(
      collection(db, "timeRecords", date, "employeePoints"),
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
  }));
}
