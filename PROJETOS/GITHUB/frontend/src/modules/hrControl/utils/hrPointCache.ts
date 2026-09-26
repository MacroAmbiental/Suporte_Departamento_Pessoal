import { firestore } from "@/services/firebase";
import { loadCachedTimeRecordsRange, loadFreshTimeRecordsForDay, loadTimeRecordsRange } from "@/modules/timekeeping/data/timeRecordsRepository";
import { changedPointDates, pointManifestVersions, type PointCacheIndex } from "./pointCacheIndex";
import type { TimeRecord, TimekeepingDayTable } from "@/types/domain";

const INDEX_PREFIX = "hr-control:point-index:v1:";
const pendingDays = new Map<string, Promise<TimeRecord[]>>();
const memoryRanges = new Map<string, { versions: Record<string, string>; records: TimeRecord[] }>();
export function clearHrPointMemory() {
  memoryRanges.clear();
}

function rememberRange(key: string, versions: Record<string, string>, records: TimeRecord[]) {
  memoryRanges.delete(key);
  memoryRanges.set(key, { versions, records });
  if (memoryRanges.size > 12) memoryRanges.delete(memoryRanges.keys().next().value!);
  return records;
}

function indexKey(userId: string) {
  return `${INDEX_PREFIX}${firestore?.app.options.projectId || "local"}:${userId}`;
}

function readIndex(key: string): PointCacheIndex {
  try {
    const value = JSON.parse(window.localStorage.getItem(key) || "null") as PointCacheIndex | null;
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}

function saveIndex(key: string, index: PointCacheIndex) {
  try {
    // Keep only metadata for recent days. Firestore itself stores point documents in IndexedDB.
    const recent = Object.fromEntries(Object.entries(index).sort(([a], [b]) => b.localeCompare(a)).slice(0, 800));
    window.localStorage.setItem(key, JSON.stringify(recent));
  } catch { /* Private mode and disabled local storage still allow a regular network load. */ }
}

function countByDate(records: TimeRecord[]) {
  const counts: Record<string, number> = {};
  records.forEach((record) => { counts[record.date] = (counts[record.date] || 0) + 1; });
  return counts;
}

function fetchChangedDay(date: string, userId: string) {
  const key = `${userId}:${date}`;
  const running = pendingDays.get(key);
  if (running) return running;
  const request = loadFreshTimeRecordsForDay(date).finally(() => pendingDays.delete(key));
  pendingDays.set(key, request);
  return request;
}

export async function loadHrPointRange(startDate: string, endDate: string,
  dayTables: TimekeepingDayTable[], userId: string, forcedDates: ReadonlySet<string> = new Set(),
  onCached?: (records: TimeRecord[]) => void) {
  const key = indexKey(userId);
  const versions = pointManifestVersions(dayTables.filter((table) => table.date >= startDate && table.date <= endDate));
  const dates = Object.keys(versions);
  if (!dates.length) return [] as TimeRecord[];
  const memoryKey = `${userId}:${startDate}:${endDate}`;
  const memory = memoryRanges.get(memoryKey);
  const sameManifest = memory && dates.length === Object.keys(memory.versions).length &&
    dates.every((date) => memory.versions[date] === versions[date]);
  if (sameManifest && !forcedDates.size) return memory.records;
  const index = readIndex(key);
  const cached = memory?.records ?? await loadCachedTimeRecordsRange(startDate, endDate, dates);
  const current = cached?.filter((record) => Boolean(versions[record.date])) || [];
  const cachedCounts = countByDate(current);
  const changed = changedPointDates(versions, index, cachedCounts, forcedDates);
  if (cached && !changed.length) return rememberRange(memoryKey, versions, current);
  // Display the complete last-known result while changed dates are verified online.
  if (cached && dates.every((date) => index[date] && index[date].count === (cachedCounts[date] || 0))) {
    onCached?.(current);
  }

  // Cold start: one indexed range request is cheaper than one request per day.
  if (!cached || changed.length > Math.max(8, dates.length / 3)) {
    const all = await loadTimeRecordsRange(startDate, endDate, { forceRefresh: true });
    const records = all.filter((record) => Boolean(versions[record.date]));
    const counts = countByDate(records);
    const next = readIndex(key);
    dates.forEach((date) => { next[date] = { version: versions[date], count: counts[date] || 0 }; });
    saveIndex(key, next);
    return rememberRange(memoryKey, versions, records);
  }

  const changes = await Promise.all(changed.map(async (date) => [date, await fetchChangedDay(date, userId)] as const));
  const replacement = new Map(changes);
  const records = current.filter((record) => !replacement.has(record.date));
  changes.forEach(([, rows]) => records.push(...rows));
  const counts = countByDate(records);
  const next = readIndex(key);
  dates.forEach((date) => { next[date] = { version: versions[date], count: counts[date] || 0 }; });
  saveIndex(key, next);
  return rememberRange(memoryKey, versions, records);
}
