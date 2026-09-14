import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  setDoc,
  where,
  type Unsubscribe,
} from "firebase/firestore";
import { firestore } from "@/services/firebase";
import type { TimekeepingDayTable, TimekeepingPresence, User } from "@/types/domain";
import { saveTimeRecordDayManifest } from "@/modules/timekeeping/data/timeRecordsRepository";
export { timeRecordDocumentId } from "@/modules/timekeeping/data/timeRecordsRepository";

const DAY_TABLE_COLLECTION = "timekeepingDayTables";
const PRESENCE_COLLECTION = "timekeepingPresence";
const PRESENCE_TTL_MS = 2 * 60_000;
let dayTableCache: { loadedAt: number; rows: TimekeepingDayTable[] } | null = null;

function safeIdPart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export async function saveTimekeepingDayTable(table: TimekeepingDayTable) {
  if (!firestore) throw new Error("Firebase/Firestore não configurado.");

  // Mantém o índice leve usado pela árvore de dias e grava o mesmo manifesto no
  // documento-pai timeRecords/{data}. Os pontos ficam dentro da subcoleção
  // employeePoints, um documento por funcionário.
  await Promise.all([
    setDoc(doc(firestore, DAY_TABLE_COLLECTION, table.id), table, { merge: true }),
    saveTimeRecordDayManifest(table.date, table as unknown as Record<string, unknown>),
  ]);
  dayTableCache = null;
}

export async function loadTimekeepingDayTables(maxResults = 730) {
  if (!firestore) return [] as TimekeepingDayTable[];
  if (dayTableCache && Date.now() - dayTableCache.loadedAt < 5 * 60_000) return dayTableCache.rows;
  const snapshot = await getDocs(query(
    collection(firestore, DAY_TABLE_COLLECTION),
    orderBy("date", "desc"),
    limit(Math.max(1, Math.min(maxResults, 1000))),
  ));
  const rows = snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as TimekeepingDayTable);
  dayTableCache = { loadedAt: Date.now(), rows };
  return rows;
}

function presenceDocumentId(date: string, userId: string) {
  return `${safeIdPart(date)}__${safeIdPart(userId)}`;
}

export async function publishTimekeepingPresence(date: string, user: Pick<User, "id" | "username" | "name">) {
  if (!firestore || !date) return;
  const now = Date.now();
  const id = presenceDocumentId(date, user.id);
  const presence: TimekeepingPresence = {
    id,
    date,
    userId: user.id,
    username: user.username,
    userName: user.name,
    startedAt: new Date(now).toISOString(),
    heartbeatAt: new Date(now).toISOString(),
    expiresAt: new Date(now + PRESENCE_TTL_MS).toISOString(),
  };
  await setDoc(doc(firestore, PRESENCE_COLLECTION, id), presence, { merge: true });
}

export async function clearTimekeepingPresence(date: string, userId: string) {
  if (!firestore || !date || !userId) return;
  await deleteDoc(doc(firestore, PRESENCE_COLLECTION, presenceDocumentId(date, userId))).catch(() => undefined);
}

export function subscribeTimekeepingPresence(
  date: string,
  onChange: (presence: TimekeepingPresence[]) => void,
  onError?: (error: unknown) => void,
): Unsubscribe {
  if (!firestore || !date) {
    onChange([]);
    return () => undefined;
  }
  return onSnapshot(
    query(collection(firestore, PRESENCE_COLLECTION), where("date", "==", date)),
    (snapshot) => {
      const now = Date.now();
      onChange(snapshot.docs
        .map((entry) => ({ id: entry.id, ...entry.data() }) as TimekeepingPresence)
        .filter((entry) => Date.parse(entry.expiresAt) > now));
    },
    onError,
  );
}
