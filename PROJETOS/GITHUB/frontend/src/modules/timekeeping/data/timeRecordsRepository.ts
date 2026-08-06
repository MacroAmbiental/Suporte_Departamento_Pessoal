import {
  collection,
  collectionGroup,
  deleteDoc,
  doc,
  documentId,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
  type DocumentData,
  type QuerySnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { firestore } from "@/services/firebase";
import type { TimeRecord } from "@/types/domain";

type Subscriber = {
  onChange: (records: TimeRecord[]) => void;
  onError?: (error: unknown) => void;
};

type DayListener = {
  records: TimeRecord[];
  legacyRecords: TimeRecord[];
  loaded: boolean;
  legacyChecked: boolean;
  subscribers: Set<Subscriber>;
  unsubscribe: Unsubscribe | null;
  closeTimer: ReturnType<typeof setTimeout> | null;
  lastAccessedAt: number;
  retryAfter: number;
};

type RangeCacheEntry = { records: TimeRecord[]; loadedAt: number };

const TIME_RECORDS_COLLECTION = "timeRecords";
const EMPLOYEE_POINTS_SUBCOLLECTION = "employeePoints";
const dayListeners = new Map<string, DayListener>();
const rangeCache = new Map<string, RangeCacheEntry>();
const rangeLoadPool = new Map<string, Promise<TimeRecord[]>>();
const duplicateRecordIdsByDate = new Map<string, string[]>();
const legacyRecordIdsByDate = new Map<string, string[]>();
const LISTENER_GRACE_PERIOD_MS = 30_000;
const RANGE_CACHE_TTL_MS = 5 * 60_000;
const MAX_DAY_CACHE_ENTRIES = 10;
const MAX_RANGE_CACHE_ENTRIES = 8;
const MAX_DUPLICATE_DATE_ENTRIES = 30;
const MAX_LEGACY_DATE_ENTRIES = 30;
const ERROR_RETRY_DELAY_MS = 2 * 60_000;
// O formato diario e o padrao. A colecao plana antiga fica disponivel apenas
// quando a migracao precisar ser revalidada explicitamente no ambiente.
const LEGACY_FALLBACK_ENABLED = import.meta.env.VITE_TIME_RECORDS_LEGACY_FALLBACK === "true";

function safeIdPart(value: string) {
  return value.replace(/[^a-zA-Z0-9_-]/g, "_");
}

export function timeRecordDocumentId(date: string, employeeId: string) {
  return `time-${safeIdPart(date)}-${safeIdPart(employeeId)}`;
}

function employeePointDocumentId(record: Pick<TimeRecord, "employeeId">) {
  return safeIdPart(record.employeeId);
}

function hasFilledRecordValue(value: unknown) {
  const text = String(value ?? "").trim();
  return Boolean(text && text !== "00:00" && text !== "0" && text !== "0.00" && text !== "[]");
}

function timeRecordContentScore(record: TimeRecord) {
  const customFields = record.customFields || {};
  const filledPunches = [
    record.checkIn,
    record.checkOut,
    customFields.ent2,
    customFields.sai2,
    customFields.ent3,
    customFields.sai3,
  ].filter(hasFilledRecordValue).length;
  const filledMetrics = [
    record.usefulHours,
    record.baseHours,
    record.overtimeHours,
    record.overtimeAmount,
    customFields.normais,
    customFields.faltas,
    customFields.extras,
    customFields.carga,
  ].filter(hasFilledRecordValue).length;
  const filledNotes = [record.cid, record.notes].filter(hasFilledRecordValue).length;
  const statusScore = record.status && record.status !== "absence_pending" ? 2 : 0;
  const sourceScore = record.source === "seculum" ? 2 : 0;
  const metricScore = record.status === "absence_pending" && filledPunches === 0 ? 0 : filledMetrics * 2;
  const otherCustomFields = Object.entries(customFields)
    .filter(([key, value]) => !["ent2", "sai2", "ent3", "sai3", "normais", "faltas", "extras", "carga"].includes(key) && hasFilledRecordValue(value))
    .length;

  return (filledPunches * 8)
    + metricScore
    + (filledNotes * 4)
    + statusScore
    + sourceScore
    + otherCustomFields;
}

export function pickPreferredTimeRecord(current: TimeRecord | undefined, candidate: TimeRecord) {
  if (!current) return candidate;

  const currentScore = timeRecordContentScore(current);
  const candidateScore = timeRecordContentScore(candidate);
  if (candidateScore !== currentScore) return candidateScore > currentScore ? candidate : current;

  return String(candidate.updatedAt || "") >= String(current.updatedAt || "") ? candidate : current;
}

function dayRecordsCollection(date: string) {
  if (!firestore) return null;
  return collection(
    firestore,
    TIME_RECORDS_COLLECTION,
    safeIdPart(date),
    EMPLOYEE_POINTS_SUBCOLLECTION,
  );
}

function normalize(snapshot: QuerySnapshot<DocumentData, DocumentData>) {
  const records = snapshot.docs
    .filter((entry) => entry.id !== "__schema" && entry.data().__systemMeta !== true)
    .map((entry) => {
      const data = entry.data();
      return {
        ...data,
        id: String(data.id || entry.id),
      } as TimeRecord;
    })
    // O documento-pai do dia fica na coleção timeRecords. Somente os documentos
    // da subcoleção employeePoints representam pontos de funcionários.
    .filter((record) => Boolean(record.employeeId && record.date));

  const latestByEmployeeDate = new Map<string, TimeRecord>();
  const duplicateIds = new Map<string, string[]>();
  records.forEach((record) => {
    const key = `${record.employeeId}:${record.date}`;
    const current = latestByEmployeeDate.get(key);
    if (!current) {
      latestByEmployeeDate.set(key, record);
      return;
    }
    const kept = pickPreferredTimeRecord(current, record);
    const discarded = kept === current ? record : current;
    latestByEmployeeDate.set(key, kept);
    const ids = duplicateIds.get(record.date) || [];
    ids.push(discarded.id);
    duplicateIds.set(record.date, ids);
  });
  duplicateIds.forEach((ids, date) => duplicateRecordIdsByDate.set(date, Array.from(new Set(ids))));
  while (duplicateRecordIdsByDate.size > MAX_DUPLICATE_DATE_ENTRIES) {
    const oldestKey = duplicateRecordIdsByDate.keys().next().value as string | undefined;
    if (!oldestKey) break;
    duplicateRecordIdsByDate.delete(oldestKey);
  }
  return Array.from(latestByEmployeeDate.values());
}

function mergeLatestRecords(...groups: TimeRecord[][]) {
  const latest = new Map<string, TimeRecord>();
  groups.flat().forEach((record) => {
    const key = `${record.employeeId}:${record.date}`;
    latest.set(key, pickPreferredTimeRecord(latest.get(key), record));
  });
  return Array.from(latest.values());
}

function rememberLegacyDocumentIds(snapshot: QuerySnapshot<DocumentData, DocumentData>) {
  const idsByDate = new Map<string, string[]>();
  snapshot.docs.forEach((entry) => {
    const data = entry.data();
    const date = String(data.date || "");
    if (!data.employeeId || !date) return;
    const ids = idsByDate.get(date) || [];
    ids.push(entry.id);
    idsByDate.set(date, ids);
  });
  idsByDate.forEach((ids, date) => legacyRecordIdsByDate.set(date, Array.from(new Set(ids))));
  while (legacyRecordIdsByDate.size > MAX_LEGACY_DATE_ENTRIES) {
    const oldestKey = legacyRecordIdsByDate.keys().next().value as string | undefined;
    if (!oldestKey) break;
    legacyRecordIdsByDate.delete(oldestKey);
  }
}

async function loadLegacyDayRecords(date: string) {
  if (!firestore || !LEGACY_FALLBACK_ENABLED) return [] as TimeRecord[];
  const snapshot = await getDocs(query(
    collection(firestore, TIME_RECORDS_COLLECTION),
    where("date", "==", date),
  ));
  rememberLegacyDocumentIds(snapshot);
  return normalize(snapshot);
}

async function loadLegacyRange(startDate: string, endDate: string) {
  if (!firestore || !LEGACY_FALLBACK_ENABLED) return [] as TimeRecord[];
  const snapshot = await getDocs(query(
    collection(firestore, TIME_RECORDS_COLLECTION),
    where("date", ">=", startDate),
    where("date", "<=", endDate),
  ));
  rememberLegacyDocumentIds(snapshot);
  return normalize(snapshot);
}

function isMissingCollectionGroupIndex(error: unknown) {
  const code = String((error as { code?: unknown } | null)?.code || "");
  const message = String((error as { message?: unknown } | null)?.message || error || "");
  return (
    code.includes("failed-precondition")
    || message.includes("COLLECTION_GROUP_ASC")
  ) && /index/i.test(message);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  maxConcurrency: number,
  worker: (item: T) => Promise<R>,
) {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const runners = Array.from(
    { length: Math.max(1, Math.min(maxConcurrency, items.length || 1)) },
    async () => {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await worker(items[index]);
      }
    },
  );
  await Promise.all(runners);
  return results;
}

/**
 * Fallback sem índice de collection group. Primeiro lê somente os documentos-pai
 * dos dias existentes no intervalo e depois suas subcoleções employeePoints.
 * Isso evita que uma configuração de índice ainda não publicada interrompa a
 * exclusão, a exportação ou a sincronização do ponto.
 */
async function loadNestedRangeByDayFolders(startDate: string, endDate: string) {
  if (!firestore) return [] as TimeRecord[];

  const dayFolders = await getDocs(query(
    collection(firestore, TIME_RECORDS_COLLECTION),
    where(documentId(), ">=", safeIdPart(startDate)),
    where(documentId(), "<=", safeIdPart(endDate)),
  ));
  const dates = Array.from(new Set(
    dayFolders.docs
      .map((entry) => String(entry.data().date || entry.id))
      .filter((date) => date >= startDate && date <= endDate),
  )).sort();

  const snapshots = await mapWithConcurrency(dates, 6, async (date) => {
    const recordsCollection = dayRecordsCollection(date);
    if (!recordsCollection) return [] as TimeRecord[];
    return normalize(await getDocs(recordsCollection));
  });
  return snapshots.flat();
}

export function cachedDuplicateTimeRecordIds(date: string) {
  return duplicateRecordIdsByDate.get(date) || [];
}

export function cachedLegacyTimeRecordIds(date: string) {
  return legacyRecordIdsByDate.get(date) || [];
}

function trimCaches() {
  if (dayListeners.size > MAX_DAY_CACHE_ENTRIES) {
    [...dayListeners.entries()]
      .filter(([, entry]) => !entry.subscribers.size && !entry.unsubscribe)
      .sort(([, left], [, right]) => left.lastAccessedAt - right.lastAccessedAt)
      .slice(0, Math.max(0, dayListeners.size - MAX_DAY_CACHE_ENTRIES))
      .forEach(([key]) => dayListeners.delete(key));
  }
  if (rangeCache.size > MAX_RANGE_CACHE_ENTRIES) {
    [...rangeCache.entries()]
      .sort(([, left], [, right]) => left.loadedAt - right.loadedAt)
      .slice(0, rangeCache.size - MAX_RANGE_CACHE_ENTRIES)
      .forEach(([key]) => rangeCache.delete(key));
  }
}

function listenerForDay(date: string): DayListener {
  const existing = dayListeners.get(date);
  if (existing) return existing;

  const created: DayListener = {
    records: [],
    legacyRecords: [],
    loaded: false,
    legacyChecked: false,
    subscribers: new Set(),
    unsubscribe: null,
    closeTimer: null,
    lastAccessedAt: Date.now(),
    retryAfter: 0,
  };
  dayListeners.set(date, created);
  return created;
}

export function cachedDayRecords(date: string) {
  return dayListeners.get(date)?.records || [];
}

/**
 * Estrutura atual no Firestore:
 * timeRecords/{AAAA-MM-DD}/employeePoints/{employeeId}
 *
 * Assim cada dia é um documento próprio e, dentro dele, existe exatamente um
 * ponto por funcionário. O listener acompanha somente o dia aberto.
 */
export function subscribeTimeRecordsForDay(
  date: string,
  onChange: (records: TimeRecord[]) => void,
  onError?: (error: unknown) => void,
): Unsubscribe {
  if (!date) {
    onChange([]);
    return () => undefined;
  }

  const entry = listenerForDay(date);
  entry.lastAccessedAt = Date.now();
  trimCaches();
  if (entry.closeTimer) {
    clearTimeout(entry.closeTimer);
    entry.closeTimer = null;
  }

  const subscriber: Subscriber = { onChange, onError };
  entry.subscribers.add(subscriber);
  if (entry.loaded) onChange(entry.records);

  const recordsCollection = dayRecordsCollection(date);
  if (!recordsCollection) {
    entry.loaded = true;
    entry.records = [];
    onChange([]);
  } else if (!entry.unsubscribe && Date.now() >= entry.retryAfter) {
    entry.unsubscribe = onSnapshot(
      recordsCollection,
      (snapshot) => {
        const nestedRecords = normalize(snapshot);
        entry.records = mergeLatestRecords(entry.legacyRecords, nestedRecords);
        entry.loaded = true;
        entry.subscribers.forEach((current) => current.onChange(entry.records));

        // Compatibilidade temporaria: faz somente uma leitura plana por dia
        // quando o fallback legado estiver explicitamente habilitado.
        if (!entry.legacyChecked && LEGACY_FALLBACK_ENABLED) {
          entry.legacyChecked = true;
          void loadLegacyDayRecords(date)
            .then((legacyRecords) => {
              entry.legacyRecords = legacyRecords;
              entry.records = mergeLatestRecords(legacyRecords, entry.records);
              entry.subscribers.forEach((current) => current.onChange(entry.records));
            })
            .catch((error) => {
              console.warn(`Não foi possível consultar o ponto legado de ${date}.`, error);
            });
        }
      },
      (error) => {
        entry.unsubscribe = null;
        entry.retryAfter = Date.now() + ERROR_RETRY_DELAY_MS;
        console.warn(`Não foi possível carregar os registros de ponto de ${date}.`, error);
        entry.subscribers.forEach((current) => current.onError?.(error));
      },
    );
  }

  return () => {
    entry.subscribers.delete(subscriber);
    if (entry.subscribers.size || entry.closeTimer) return;
    entry.closeTimer = setTimeout(() => {
      entry.closeTimer = null;
      if (entry.subscribers.size) return;
      entry.unsubscribe?.();
      entry.unsubscribe = null;
      entry.lastAccessedAt = Date.now();
      trimCaches();
    }, LISTENER_GRACE_PERIOD_MS);
  };
}

export async function loadTimeRecordsRange(startDate: string, endDate: string) {
  if (!firestore || !startDate || !endDate || startDate > endDate) return [] as TimeRecord[];

  if (startDate === endDate) {
    const cachedDay = dayListeners.get(startDate);
    if (cachedDay?.loaded) return cachedDay.records;
  }

  const key = `${startDate}:${endDate}`;
  const cached = rangeCache.get(key);
  if (cached && Date.now() - cached.loadedAt < RANGE_CACHE_TTL_MS) return cached.records;

  const running = rangeLoadPool.get(key);
  if (running) return running;

  const nestedRangeRequest = getDocs(query(
    collectionGroup(firestore, EMPLOYEE_POINTS_SUBCOLLECTION),
    where("date", ">=", startDate),
    where("date", "<=", endDate),
  ))
    .then(normalize)
    .catch(async (error) => {
      if (!isMissingCollectionGroupIndex(error)) throw error;
      console.warn(
        "Índice de employeePoints.date ainda não publicado. Usando leitura por pastas diárias.",
      );
      return loadNestedRangeByDayFolders(startDate, endDate);
    });

  const request = Promise.all([
    nestedRangeRequest,
    // Le o formato plano antigo somente com VITE_TIME_RECORDS_LEGACY_FALLBACK=true.
    loadLegacyRange(startDate, endDate),
  ])
    .then(([nestedRecords, legacyRecords]) => {
      const records = mergeLatestRecords(legacyRecords, nestedRecords);
      rangeCache.set(key, { records, loadedAt: Date.now() });
      trimCaches();
      return records;
    })
    .finally(() => rangeLoadPool.delete(key));

  rangeLoadPool.set(key, request);
  return request;
}

/**
 * Persiste os registros no formato diário, sem criar documentos extras a cada
 * clique. Cada combinação data + funcionário sempre sobrescreve o mesmo
 * documento da subcoleção employeePoints.
 */
type SaveTimeRecordsTreeOptions = {
  /**
   * Grava o documento-pai leve do dia. No salvamento da tabela completa esse
   * manifesto é persistido por saveTimekeepingDayTable, portanto pode ser
   * desativado para evitar uma escrita duplicada no mesmo clique.
   */
  writeDayManifest?: boolean;
};

export async function saveTimeRecordsTree(
  records: TimeRecord[],
  obsoleteLegacyRecordIds: string[] = [],
  options: SaveTimeRecordsTreeOptions = {},
) {
  const db = firestore;
  if (!db) throw new Error("Firebase/Firestore não configurado.");
  if (!records.length && !obsoleteLegacyRecordIds.length) return;

  type Mutation =
    | { type: "set"; path: ReturnType<typeof doc>; value: Record<string, unknown> }
    | { type: "delete"; path: ReturnType<typeof doc> };

  const mutations: Mutation[] = [];
  const dates = new Map<string, TimeRecord[]>();

  records.forEach((record) => {
    if (!record.date || !record.employeeId) return;
    const date = safeIdPart(record.date);
    const list = dates.get(date) || [];
    list.push(record);
    dates.set(date, list);

    mutations.push({
      type: "set",
      path: doc(
        db,
        TIME_RECORDS_COLLECTION,
        date,
        EMPLOYEE_POINTS_SUBCOLLECTION,
        employeePointDocumentId(record),
      ),
      value: record as unknown as Record<string, unknown>,
    });
  });

  if (options.writeDayManifest !== false) {
    dates.forEach((dateRecords, date) => {
      const latestUpdate = dateRecords.reduce(
        (latest, record) => String(record.updatedAt || "") > latest ? String(record.updatedAt || "") : latest,
        "",
      );
      mutations.push({
        type: "set",
        path: doc(db, TIME_RECORDS_COLLECTION, date),
        value: {
          id: date,
          date,
          documentType: "timekeepingDay",
          updatedAt: latestUpdate || new Date().toISOString(),
        },
      });
    });
  }

  const legacyIdsToDelete = new Set(obsoleteLegacyRecordIds.filter(Boolean));
  records.forEach((record) => {
    const legacyIds = legacyRecordIdsByDate.get(record.date) || [];
    if (legacyIds.includes(record.id)) legacyIdsToDelete.add(record.id);
  });

  Array.from(legacyIdsToDelete).forEach((legacyId) => {
    // IDs legados ficam diretamente na raiz. Nunca remove o documento-pai do dia.
    if (/^\d{4}-\d{2}-\d{2}$/.test(legacyId)) return;
    mutations.push({
      type: "delete",
      path: doc(db, TIME_RECORDS_COLLECTION, legacyId),
    });
  });

  const chunkSize = 450;
  for (let offset = 0; offset < mutations.length; offset += chunkSize) {
    const batch = writeBatch(db);
    mutations.slice(offset, offset + chunkSize).forEach((mutation) => {
      if (mutation.type === "set") batch.set(mutation.path, mutation.value, { merge: true });
      else batch.delete(mutation.path);
    });
    await batch.commit();
  }

  dates.forEach((_, date) => {
    legacyRecordIdsByDate.delete(date);
    const entry = dayListeners.get(date);
    if (entry) entry.legacyRecords = [];
  });
  patchCachedTimeRecords(records);
}

/** Atualiza os caches locais após escrita otimista, sem nova leitura. */
export function patchCachedTimeRecords(records: TimeRecord[]) {
  if (!records.length) return;
  const byDate = new Map<string, TimeRecord[]>();
  records.forEach((record) => {
    const list = byDate.get(record.date) || [];
    list.push(record);
    byDate.set(record.date, list);
  });

  byDate.forEach((changedRecords, date) => {
    const entry = dayListeners.get(date);
    if (!entry) return;
    const next = new Map(entry.records.map((record) => [record.employeeId, record]));
    changedRecords.forEach((record) => next.set(record.employeeId, record));
    entry.records = [...next.values()];
    entry.loaded = true;
    entry.subscribers.forEach((subscriber) => subscriber.onChange(entry.records));
  });

  rangeCache.clear();
}

export function removeCachedTimeRecord(id: string, date?: string) {
  const entries = date ? [[date, dayListeners.get(date)] as const] : [...dayListeners.entries()];
  entries.forEach(([, entry]) => {
    if (!entry) return;
    const next = entry.records.filter((record) => record.id !== id);
    if (next.length === entry.records.length) return;
    entry.records = next;
    entry.subscribers.forEach((subscriber) => subscriber.onChange(entry.records));
  });
  rangeCache.clear();
}

export async function deleteTimeRecordTree(record: Pick<TimeRecord, "date" | "employeeId">) {
  const db = firestore;
  if (!db || !record.date || !record.employeeId) return;
  await deleteDoc(doc(
    db,
    TIME_RECORDS_COLLECTION,
    safeIdPart(record.date),
    EMPLOYEE_POINTS_SUBCOLLECTION,
    safeIdPart(record.employeeId),
  ));
}

export async function saveTimeRecordDayManifest(date: string, manifest: Record<string, unknown>) {
  const db = firestore;
  if (!db || !date) return;
  await setDoc(
    doc(db, TIME_RECORDS_COLLECTION, safeIdPart(date)),
    {
      id: date,
      date,
      documentType: "timekeepingDay",
      ...manifest,
    },
    { merge: true },
  );
}
