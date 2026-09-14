import type { DomainSnapshot } from "@/types/domain";

export type DomainCollectionName = keyof DomainSnapshot;
type Entity = { id: string };

type CacheEntry = {
  value: Entity[];
  updatedAt: number;
};

const cache = new Map<DomainCollectionName, CacheEntry>();
const DEFAULT_TTL_MS = 30 * 60 * 1000;
const STORAGE_PREFIX = "macro-dp:collection-cache:v2:";
const MAX_PERSISTED_COLLECTION_BYTES = 250_000;
const persistableCollections = new Set<DomainCollectionName>([
  "accessKeys",
  "benefitCustomFields",
  "benefitFolders",
  "companies",
  "companyGroups",
  "companyGroupCompanies",
  "departments",
  "permissionProfiles",
  "sectors",
  "subsectors",
  "teams",
  "timekeepingColumns",
]);

function storageKey(name: DomainCollectionName) {
  return `${STORAGE_PREFIX}${name}`;
}

function readPersistedEntry(name: DomainCollectionName): CacheEntry | null {
  if (typeof window === "undefined") return null;
  try {
    if (!persistableCollections.has(name)) {
      window.sessionStorage.removeItem(storageKey(name));
      return null;
    }
    const raw = window.sessionStorage.getItem(storageKey(name));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    if (!Array.isArray(parsed.value) || !Number.isFinite(parsed.updatedAt)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function persistEntry(name: DomainCollectionName, entry: CacheEntry) {
  if (typeof window === "undefined") return;
  if (!persistableCollections.has(name)) {
    try {
      window.sessionStorage.removeItem(storageKey(name));
    } catch {
      // Cache persistente e apenas uma otimizacao.
    }
    return;
  }

  // JSON.stringify de coleções grandes bloqueava a thread principal. O Firestore
  // já possui cache IndexedDB; sessionStorage fica restrito a coleções pequenas
  // e é escrito somente quando o navegador estiver ocioso.
  const persist = () => {
    try {
      const serialized = JSON.stringify(entry);
      if (serialized.length > MAX_PERSISTED_COLLECTION_BYTES) {
        window.sessionStorage.removeItem(storageKey(name));
        return;
      }
      window.sessionStorage.setItem(storageKey(name), serialized);
    } catch {
      // Cache persistente é apenas uma otimização.
    }
  };

  if ("requestIdleCallback" in window) {
    (window as Window & { requestIdleCallback: (callback: () => void, options?: { timeout: number }) => number })
      .requestIdleCallback(persist, { timeout: 1500 });
  } else {
    globalThis.setTimeout(persist, 0);
  }
}

export function readCollectionCache<T extends Entity>(
  name: DomainCollectionName,
  ttlMs = DEFAULT_TTL_MS,
): T[] | null {
  let entry = cache.get(name);
  if (!entry) {
    entry = readPersistedEntry(name) || undefined;
    if (entry) cache.set(name, entry);
  }
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > ttlMs) return null;
  return entry.value as T[];
}

export function writeCollectionCache<T extends Entity>(name: DomainCollectionName, value: T[]) {
  const entry: CacheEntry = { value, updatedAt: Date.now() };
  cache.set(name, entry);
  persistEntry(name, entry);
}

export function patchCollectionCache<T extends Entity>(
  name: DomainCollectionName,
  updater: (current: T[]) => T[],
) {
  const current = readCollectionCache<T>(name, Number.POSITIVE_INFINITY) || [];
  writeCollectionCache(name, updater(current));
}

export function invalidateCollectionCache(name: DomainCollectionName) {
  cache.delete(name);
  if (typeof window !== "undefined") {
    try {
      window.sessionStorage.removeItem(storageKey(name));
    } catch {
      // Sem ação necessária.
    }
  }
}

export function clearCollectionCache() {
  cache.clear();
  if (typeof window === "undefined") return;
  try {
    Object.keys(window.sessionStorage)
      .filter((key) => key.startsWith(STORAGE_PREFIX))
      .forEach((key) => window.sessionStorage.removeItem(key));
  } catch {
    // Sem ação necessária.
  }
}

export function cachedCollectionsSnapshot(names: DomainCollectionName[]) {
  return names.reduce<Partial<DomainSnapshot>>((snapshot, name) => {
    const cached = readCollectionCache(name);
    if (cached) (snapshot as Record<string, Entity[]>)[name] = cached;
    return snapshot;
  }, {});
}
