import {
  collection,
  deleteDoc,
  doc,
  documentId,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  setDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryConstraint,
  type QuerySnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { firestore } from "@/services/firebase";
import {
  hashPassword,
  initialsFromName,
  normalizeUsername,
  toAuthenticatedUser,
} from "@/services/accessControl";
import {
  cachedCollectionsSnapshot,
  patchCollectionCache,
  readCollectionCache,
  writeCollectionCache,
} from "@/core/firestore/collectionCache";
import type { DomainSnapshot, Employee, SystemPermission, SystemUser, User } from "@/types/domain";

export type CollectionName = keyof DomainSnapshot;
type Entity = { id: string };

type CollectionSubscriber = {
  onChange: (items: Entity[]) => void;
  onError?: (error: unknown) => void;
};

type CollectionListenerEntry = {
  latest: Entity[] | null;
  subscribers: Set<CollectionSubscriber>;
  unsubscribe: Unsubscribe | null;
  closeTimer: ReturnType<typeof setTimeout> | null;
};

const collectionListenerPool = new Map<CollectionName, CollectionListenerEntry>();
const collectionLoadPool = new Map<CollectionName, Promise<Entity[]>>();
const LISTENER_GRACE_PERIOD_MS = 60_000;

export const collectionNames: CollectionName[] = [
  "systemUsers",
  "systemPermissions",
  "permissionProfiles",
  "accessKeys",
  "companies",
  "departments",
  "sectors",
  "subsectors",
  "teams",
  "organizational_nodes",
  "employee_assignments",
  "companyGroups",
  "companyGroupCompanies",
  "companyGroupUnits",
  "companyGroupUnitLinks",
  "companyGroupEmployeeAssignments",
  "companyGroupLeadershipAssignments",
  "customModules",
  "benefitContracts",
  "benefitPlans",
  "benefitFolders",
  "benefitCustomFields",
  "employeeBenefits",
  "employees",
  "employeePromotions",
  "employeeDrafts",
  "appDrafts",
  "employeeDocuments",
  "documentAlerts",
  "timeRecords",
  "timekeepingColumns",
  "talentCandidates",
  "talentColumnOptions",
];

function legacyStorageKey(name: CollectionName): string {
  return `macro-dp:${name}`;
}

function removeLegacyLocalStorage(name: CollectionName): void {
  if (typeof window === "undefined" || !window.localStorage) return;
  try {
    window.localStorage.removeItem(legacyStorageKey(name));
  } catch {
    // O localStorage antigo não é mais banco nem cache de domínio.
  }
}

function getCollection(name: CollectionName) {
  if (!firestore) return null;
  return collection(firestore, name);
}

function normalizeCollectionSnapshot<T extends Entity>(snapshot: QuerySnapshot<DocumentData, DocumentData>): T[] {
  return snapshot.docs
    .filter((entry) => entry.id !== "__schema" && entry.data().__systemMeta !== true)
    .map((entry) => ({ id: entry.id, ...entry.data() }) as T);
}

function emptyDomainSnapshot(): DomainSnapshot {
  return collectionNames.reduce((snapshot, name) => {
    (snapshot as unknown as Record<string, Entity[]>)[name] = [];
    return snapshot;
  }, {} as DomainSnapshot);
}

export async function loadCollection<T extends Entity>(
  name: CollectionName,
  constraints: QueryConstraint[] = [],
): Promise<T[]> {
  const table = getCollection(name);
  if (!table) return [];

  // Consultas filtradas têm semântica própria e não podem compartilhar o cache
  // integral da coleção.
  if (constraints.length) {
    const snapshot = await getDocs(query(table, ...constraints));
    return normalizeCollectionSnapshot<T>(snapshot);
  }

  const cached = readCollectionCache<T>(name);
  if (cached) return cached;

  // Deduplica chamadas simultâneas feitas por provider, página e modal durante a
  // mesma montagem. Sem isso, uma coleção podia ser lida duas ou três vezes.
  const running = collectionLoadPool.get(name);
  if (running) return running as Promise<T[]>;

  const request = getDocs(table)
    .then((snapshot) => {
      const items = normalizeCollectionSnapshot<T>(snapshot);
      writeCollectionCache(name, items);
      removeLegacyLocalStorage(name);
      return items;
    })
    .finally(() => {
      collectionLoadPool.delete(name);
    });

  collectionLoadPool.set(name, request as Promise<Entity[]>);
  return request;
}

function pooledEntry(name: CollectionName): CollectionListenerEntry {
  const existing = collectionListenerPool.get(name);
  if (existing) return existing;

  const created: CollectionListenerEntry = {
    latest: readCollectionCache(name),
    subscribers: new Set(),
    unsubscribe: null,
    closeTimer: null,
  };
  collectionListenerPool.set(name, created);
  return created;
}

function startPooledListener(name: CollectionName, entry: CollectionListenerEntry) {
  if (entry.unsubscribe || !firestore) return;
  const table = getCollection(name);
  if (!table) return;

  entry.unsubscribe = onSnapshot(
    table,
    (snapshot) => {
      const items = normalizeCollectionSnapshot(snapshot);
      entry.latest = items;
      writeCollectionCache(name, items);
      removeLegacyLocalStorage(name);
      entry.subscribers.forEach((subscriber) => subscriber.onChange(items));
    },
    (error) => {
      console.warn(`Não foi possível sincronizar a coleção ${name}.`, error);
      entry.unsubscribe = null;
      entry.subscribers.forEach((subscriber) => subscriber.onError?.(error));
    },
  );
}

function subscribePooledCollection<T extends Entity>(
  name: CollectionName,
  onChange: (items: T[]) => void,
  onError?: (error: unknown) => void,
): Unsubscribe {
  const entry = pooledEntry(name);
  if (entry.closeTimer) {
    clearTimeout(entry.closeTimer);
    entry.closeTimer = null;
  }

  const subscriber: CollectionSubscriber = {
    onChange: (items) => onChange(items as T[]),
    onError,
  };
  entry.subscribers.add(subscriber);

  if (entry.latest) onChange(entry.latest as T[]);
  if (!firestore) {
    if (!entry.latest) onChange([]);
  } else {
    startPooledListener(name, entry);
  }

  return () => {
    entry.subscribers.delete(subscriber);
    if (entry.subscribers.size || entry.closeTimer) return;

    entry.closeTimer = setTimeout(() => {
      entry.closeTimer = null;
      if (entry.subscribers.size) return;
      entry.unsubscribe?.();
      entry.unsubscribe = null;
    }, LISTENER_GRACE_PERIOD_MS);
  };
}

export function subscribeCollection<T extends Entity>(
  name: CollectionName,
  constraints: QueryConstraint[],
  onChange: (items: T[]) => void,
  onError?: (error: unknown) => void,
): Unsubscribe {
  const table = getCollection(name);
  if (!table) {
    onChange([]);
    return () => undefined;
  }

  return onSnapshot(
    constraints.length ? query(table, ...constraints) : table,
    (snapshot) => {
      const items = normalizeCollectionSnapshot<T>(snapshot);
      writeCollectionCache(name, items);
      removeLegacyLocalStorage(name);
      onChange(items);
    },
    (error) => {
      console.warn(`Não foi possível sincronizar a coleção ${name}.`, error);
      onError?.(error);
    },
  );
}

export type DomainCollectionPatch = Partial<DomainSnapshot>;

/**
 * Abre listeners apenas para as coleções necessárias na tela atual.
 * Listeners iguais são compartilhados e mantidos por um curto período entre
 * trocas de tela, evitando uma nova leitura completa a cada navegação.
 */
export function subscribeDomainCollections(
  requestedNames: CollectionName[],
  onChange: (patch: DomainCollectionPatch) => void,
  onReady?: () => void,
  onError?: (error: unknown, collectionName: CollectionName) => void,
): Unsubscribe {
  const names = Array.from(new Set(requestedNames));
  if (!names.length) {
    onReady?.();
    return () => undefined;
  }

  const pending = new Set(names);
  const initialValues = new Map<CollectionName, Entity[]>();
  let initialPublished = false;

  const publishInitialWhenReady = () => {
    if (initialPublished || pending.size) return;
    initialPublished = true;
    const patch = names.reduce<DomainCollectionPatch>((result, name) => {
      (result as unknown as Record<string, Entity[]>)[name] = initialValues.get(name) || [];
      return result;
    }, {});
    onChange(patch);
    onReady?.();
  };

  const unsubscribes = names.map((name) => subscribePooledCollection(
    name,
    (items) => {
      if (!initialPublished) {
        initialValues.set(name, items);
        pending.delete(name);
        publishInitialWhenReady();
        return;
      }
      onChange({ [name]: items } as DomainCollectionPatch);
    },
    (error) => {
      const fallback = readCollectionCache(name) || [];
      initialValues.set(name, fallback);
      pending.delete(name);
      onError?.(error, name);
      publishInitialWhenReady();
    },
  ));

  return () => unsubscribes.forEach((unsubscribe) => unsubscribe());
}

/** Mantido para compatibilidade; prefira subscribeDomainCollections. */
export function subscribeDomainSnapshot(
  onChange: (snapshot: DomainSnapshot) => void,
  onError?: (error: unknown) => void,
): Unsubscribe {
  const snapshot = emptyDomainSnapshot();
  return subscribeDomainCollections(
    collectionNames,
    (patch) => {
      Object.assign(snapshot, patch);
      onChange({ ...snapshot });
    },
    undefined,
    (error) => onError?.(error),
  );
}

export async function saveEntity<T extends Entity>(name: CollectionName, item: T): Promise<void> {
  const table = getCollection(name);
  if (!table) throw new Error(`Firebase/Firestore não configurado para salvar a coleção ${name}.`);

  await setDoc(doc(table, item.id), item, { merge: true });
  patchCollectionCache<Entity>(name, (current) => {
    const index = current.findIndex((entry) => entry.id === item.id);
    if (index < 0) return [item, ...current];
    const next = [...current];
    next[index] = { ...current[index], ...item };
    return next;
  });
  removeLegacyLocalStorage(name);
}

export async function deleteEntity(name: CollectionName, id: string): Promise<void> {
  const table = getCollection(name);
  if (!table) throw new Error(`Firebase/Firestore não configurado para excluir da coleção ${name}.`);

  await deleteDoc(doc(table, id));
  patchCollectionCache<Entity>(name, (current) => current.filter((entry) => entry.id !== id));
  removeLegacyLocalStorage(name);
}

export type EntityBatchMutation =
  | { type: "set"; collection: CollectionName; item: Entity }
  | { type: "delete"; collection: CollectionName; id: string };

export async function commitEntityBatch(mutations: EntityBatchMutation[]): Promise<void> {
  if (!mutations.length) return;
  if (!firestore) throw new Error("Firebase/Firestore não configurado para salvar alterações em lote.");

  const chunkSize = 450;
  for (let offset = 0; offset < mutations.length; offset += chunkSize) {
    const chunk = mutations.slice(offset, offset + chunkSize);
    const batch = writeBatch(firestore);

    chunk.forEach((mutation) => {
      const table = getCollection(mutation.collection);
      if (!table) throw new Error(`Coleção ${mutation.collection} não disponível no Firestore.`);

      if (mutation.type === "set") {
        batch.set(doc(table, mutation.item.id), mutation.item, { merge: true });
      } else {
        batch.delete(doc(table, mutation.id));
      }
    });

    await batch.commit();
  }

  mutations.forEach((mutation) => {
    if (mutation.type === "set") {
      patchCollectionCache<Entity>(mutation.collection, (current) => {
        const index = current.findIndex((entry) => entry.id === mutation.item.id);
        if (index < 0) return [mutation.item, ...current];
        const next = [...current];
        next[index] = { ...current[index], ...mutation.item };
        return next;
      });
    } else {
      patchCollectionCache<Entity>(mutation.collection, (current) => current.filter((entry) => entry.id !== mutation.id));
    }
    removeLegacyLocalStorage(mutation.collection);
  });
}

export async function loadDomainSnapshot(names: CollectionName[] = collectionNames): Promise<DomainSnapshot> {
  const snapshot = emptyDomainSnapshot();
  const uniqueNames = Array.from(new Set(names));
  const concurrency = 4;
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < uniqueNames.length) {
      const index = nextIndex;
      nextIndex += 1;
      const name = uniqueNames[index];
      try {
        const items = await loadCollection(name);
        (snapshot as unknown as Record<string, Entity[]>)[name] = items;
      } catch (error) {
        console.warn(`Não foi possível carregar a coleção ${name}.`, error);
        (snapshot as unknown as Record<string, Entity[]>)[name] = [];
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, uniqueNames.length) }, () => worker()));
  return snapshot;
}

export const firestoreTablePath = (name: CollectionName) => name;

async function findSystemUserByUsername(normalizedUsername: string): Promise<SystemUser | null> {
  const table = getCollection("systemUsers");
  if (!table) return null;

  const snapshot = await getDocs(query(table, where("username", "==", normalizedUsername), limit(2)));
  const candidates = normalizeCollectionSnapshot<SystemUser>(snapshot);
  return candidates.find((item) => normalizeUsername(item.username) === normalizedUsername && item.active !== false) || null;
}

async function loadPermissionsForUser(userId: string): Promise<SystemPermission[]> {
  return loadCollection<SystemPermission>("systemPermissions", [where("userId", "==", userId)]);
}

async function loadEmployeeById(employeeId?: string): Promise<Employee | undefined> {
  if (!firestore || !employeeId) return undefined;
  const snapshot = await getDoc(doc(firestore, "employees", employeeId));
  if (!snapshot.exists()) return undefined;
  return { id: snapshot.id, ...snapshot.data() } as Employee;
}

export async function loadDocumentsByIds<T extends Entity>(
  name: CollectionName,
  ids: string[],
): Promise<T[]> {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (!firestore || !uniqueIds.length) return [];

  const table = getCollection(name);
  if (!table) return [];

  const chunkSize = 30;
  const results: T[] = [];
  for (let offset = 0; offset < uniqueIds.length; offset += chunkSize) {
    const chunk = uniqueIds.slice(offset, offset + chunkSize);
    const snapshot = await getDocs(query(table, where(documentId(), "in", chunk)));
    results.push(...normalizeCollectionSnapshot<T>(snapshot));
  }
  return results;
}

export async function authenticateSystemUser(username: string, password: string): Promise<User | null> {
  const normalized = normalizeUsername(username);
  if (!normalized || !password) return null;

  const candidate = await findSystemUserByUsername(normalized);
  if (!candidate) return null;

  const passwordHash = await hashPassword(password);
  const hasValidHash = Boolean(candidate.passwordHash && candidate.passwordHash === passwordHash);
  const hasLegacyPassword = Boolean(candidate.password && candidate.password === password);
  if (!hasValidHash && !hasLegacyPassword) return null;

  const [permissions, employee] = await Promise.all([
    loadPermissionsForUser(candidate.id),
    loadEmployeeById(candidate.employeeId),
  ]);

  const profile: SystemUser = {
    ...candidate,
    name: employee?.name || candidate.name,
    role: employee?.role || candidate.role,
    position: employee?.position || candidate.position,
    initials: initialsFromName(employee?.name || candidate.name, candidate.username),
  };

  return toAuthenticatedUser(profile, permissions);
}
