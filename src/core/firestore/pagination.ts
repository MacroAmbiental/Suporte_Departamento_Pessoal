import {
  collection,
  documentId,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type DocumentData,
  type DocumentSnapshot,
  type QueryConstraint,
} from "firebase/firestore";
import { firestore } from "@/services/firebase";

export type FirestorePage<T> = {
  items: T[];
  lastDocument: DocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
};

export type PageRequest = {
  pageSize?: number;
  orderField?: string;
  direction?: "asc" | "desc";
  after?: DocumentSnapshot<DocumentData> | null;
  filters?: QueryConstraint[];
};

export async function loadCollectionPage<T extends { id: string }>(
  collectionName: string,
  request: PageRequest = {},
): Promise<FirestorePage<T>> {
  if (!firestore) return { items: [], lastDocument: null, hasMore: false };

  const pageSize = Math.max(1, Math.min(request.pageSize || 25, 100));
  const constraints: QueryConstraint[] = [
    ...(request.filters || []),
    orderBy(request.orderField || documentId(), request.direction || "asc"),
  ];
  if (request.after) constraints.push(startAfter(request.after));
  constraints.push(limit(pageSize + 1));

  const snapshot = await getDocs(query(collection(firestore, collectionName), ...constraints));
  const hasMore = snapshot.docs.length > pageSize;
  const visibleDocs = hasMore ? snapshot.docs.slice(0, pageSize) : snapshot.docs;

  return {
    items: visibleDocs.map((entry) => ({ id: entry.id, ...entry.data() }) as T),
    lastDocument: visibleDocs.at(-1) || null,
    hasMore,
  };
}

export async function countCollection(collectionName: string, filters: QueryConstraint[] = []) {
  if (!firestore) return 0;
  const snapshot = await getCountFromServer(query(collection(firestore, collectionName), ...filters));
  return snapshot.data().count;
}

export const firestoreWhere = where;
