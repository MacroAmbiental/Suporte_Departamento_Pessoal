import type { TimeRecord, TimekeepingDayTable } from "@/types/domain";

export type CachedRange = { key: string; status: "loading" | "ready" | "error"; records: TimeRecord[] };
export type HrSessionSnapshot = {
  records: TimeRecord[];
  loadedRecordsKey: string;
  savedDayTables: TimekeepingDayTable[];
  annualSavedDayTables: TimekeepingDayTable[];
  annualLoadedYear: number | null;
  monthlySavedDayTables: TimekeepingDayTable[];
  monthlySavedDaysKey: string;
  monthlyRangeData: CachedRange;
  comparisonSavedDayTables: TimekeepingDayTable[];
  comparisonSavedDaysKey: string;
  comparisonRangeData: CachedRange;
  streakPointData: CachedRange;
  cachedAt?: number;
};

const SESSION_CACHE_PREFIX = "hr-control-session:";
const SESSION_CACHE_TTL_MS = 60_000;

// Navigation inside the app keeps this in memory. The persistent Firestore cache
// still handles a full browser reload. Each user's data has its own key.
const snapshots = new Map<string, HrSessionSnapshot>();
function sessionStorageKey(userId: string) {
  return `${SESSION_CACHE_PREFIX}${userId}`;
}

export function readHrSession(userId?: string) {
  if (!userId) return undefined;
  const inMemory = snapshots.get(userId);
  if (inMemory) return inMemory;

  try {
    const raw = window.localStorage.getItem(sessionStorageKey(userId));
    if (!raw) return undefined;
    const parsed = JSON.parse(raw) as HrSessionSnapshot | null;
    if (!parsed || typeof parsed !== "object") return undefined;
    snapshots.set(userId, parsed);
    return parsed;
  } catch {
    return undefined;
  }
}

export function writeHrSession(userId: string, snapshot: HrSessionSnapshot) {
  const versioned = { ...snapshot, cachedAt: Date.now() };
  snapshots.set(userId, versioned);

  try {
    window.localStorage.setItem(sessionStorageKey(userId), JSON.stringify(versioned));
  } catch {
    // Browsers may block storage in private mode or restricted contexts.
  }
}

export function isHrSessionFresh(userId?: string, ttlMs = SESSION_CACHE_TTL_MS) {
  if (!userId) return false;
  const snapshot = readHrSession(userId);
  if (!snapshot?.cachedAt) return false;
  return Date.now() - snapshot.cachedAt <= ttlMs;
}

export function clearHrSessions() {
  snapshots.clear();
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith(SESSION_CACHE_PREFIX)) window.localStorage.removeItem(key);
    }
  } catch {
    // Ignore storage restrictions while clearing.
  }
}
