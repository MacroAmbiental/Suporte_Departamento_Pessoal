import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  setDoc,
} from "firebase/firestore";
import { firestore } from "@/services/firebase";
import type { AuditAction, AuditLog, User } from "@/types/domain";

const AUDIT_COLLECTION = "auditLogs";
const SENSITIVE_FIELD_PATTERN = /(password|senha|hash|token|secret|base64|content|filechunk|keyhash)/i;

function createAuditId() {
  const randomId = globalThis.crypto?.randomUUID?.();
  return randomId ? `audit-${randomId}` : `audit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function safeValue(value: unknown): unknown {
  if (value == null || typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) return `[${value.length} item(ns)]`;
  return "[objeto]";
}

export function changedFieldNames(before?: Record<string, unknown>, after?: Record<string, unknown>) {
  if (!after) return [] as string[];
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after)]);
  return Array.from(keys)
    .filter((key) => !SENSITIVE_FIELD_PATTERN.test(key))
    .filter((key) => JSON.stringify(safeValue(before?.[key])) !== JSON.stringify(safeValue(after[key])))
    .slice(0, 30);
}

export function entityDisplayName(item?: Record<string, unknown>, fallback = "") {
  if (!item) return fallback;
  const candidate = item.employeeName
    || item.name
    || item.label
    || item.username
    || item.title
    || item.date
    || item.registration
    || item.id;
  return String(candidate || fallback).trim();
}

export function changeAction(
  before: Record<string, unknown> | undefined,
  after: Record<string, unknown>,
): AuditAction {
  if (!before) return "create";
  const becameInactive = (
    before.active !== false && after.active === false
  ) || (
    before.status !== "terminated" && after.status === "terminated"
  );
  return becameInactive ? "deactivate" : "edit";
}

export async function writeAuditLog(input: {
  actor: Pick<User, "id" | "username" | "name"> | null | undefined;
  action: AuditAction;
  entityType: string;
  entityId?: string;
  entityLabel?: string;
  description: string;
  changedFields?: string[];
  metadata?: Record<string, string | number | boolean>;
}) {
  if (!firestore || !input.actor) return;
  const now = new Date().toISOString();
  const id = createAuditId();
  const log: AuditLog = {
    id,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId || "",
    entityLabel: input.entityLabel || "",
    description: input.description,
    changedFields: input.changedFields || [],
    actorUserId: input.actor.id,
    actorUsername: input.actor.username,
    actorName: input.actor.name,
    createdAt: now,
    metadata: input.metadata || {},
  };
  await setDoc(doc(collection(firestore, AUDIT_COLLECTION), id), log);
}

export async function loadRecentAuditLogs(maxResults = 200): Promise<AuditLog[]> {
  if (!firestore) return [];
  const snapshot = await getDocs(query(
    collection(firestore, AUDIT_COLLECTION),
    orderBy("createdAt", "desc"),
    limit(Math.max(1, Math.min(maxResults, 500))),
  ));
  return snapshot.docs.map((entry) => ({ id: entry.id, ...entry.data() }) as AuditLog);
}
