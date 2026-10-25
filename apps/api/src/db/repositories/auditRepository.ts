import { randomUUID } from "node:crypto";
import { eq, desc, and, sql } from "drizzle-orm";
import type {
  AuditEventRecord,
  CreateAuditEventInput,
} from "@warrant/contracts";
import { auditEvents } from "../schema.js";

/**
 * Append-only Audit Repository
 *
 * IMMUTABILITY GUARANTEES & OPERATIONAL BOUNDARIES:
 * 1. Append-Only: Exposes only `logAuditEvent` and `listAuditEvents`. Absolutely no update,
 *    mutation, or deletion methods are exported or implemented.
 * 2. Ordinary Application Protection: Prevents ordinary application workflows from mutating
 *    or deleting previously recorded audit events.
 * 3. Redaction: Automatically strips and redacts sensitive credentials, tokens, and authorization
 *    headers before persistence.
 * 4. Limitations: Guarantees apply at the application/API layer. Direct administrative access
 *    to PostgreSQL (e.g. superuser SQL execution or external database dropping) is outside
 *    application-layer controls.
 */

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SENSITIVE_KEY_PATTERNS = [
  /secret/i,
  /token/i,
  /password/i,
  /authorization/i,
  /auth[-_]?code/i,
  /api[-_]?key/i,
  /private[-_]?key/i,
  /credential/i,
  /bearer/i,
];

/**
 * Recursively redacts sensitive keys from audit event payloads.
 */
export function redactSensitiveAuditPayload(payload: unknown): unknown {
  if (payload === null || typeof payload !== "object") {
    return payload;
  }
  if (Array.isArray(payload)) {
    return payload.map(redactSensitiveAuditPayload);
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
      result[key] = "[REDACTED]";
    } else {
      result[key] = redactSensitiveAuditPayload(value);
    }
  }
  return result;
}

export interface ListAuditEventsFilters {
  ownerId?: string;
  entityType?: string;
  entityId?: string;
  eventType?: string;
  actorType?: string;
  limit?: number;
  offset?: number;
}

/**
 * Appends a new immutable audit record to the audit trail.
 */
export async function logAuditEvent(
  db: any,
  input: CreateAuditEventInput,
): Promise<AuditEventRecord> {
  const id = randomUUID();
  const createdAt = new Date();

  let entityId: string | null = null;
  const payloadToStore: Record<string, unknown> =
    (redactSensitiveAuditPayload(input.payload) as Record<string, unknown>) ?? {};

  if (input.entityId) {
    if (UUID_REGEX.test(input.entityId)) {
      entityId = input.entityId;
    } else {
      payloadToStore.originalEntityId = input.entityId;
    }
  }

  const recordToInsert = {
    id,
    ownerId: input.ownerId && UUID_REGEX.test(input.ownerId) ? input.ownerId : null,
    actorType: input.actorType ?? "SYSTEM",
    eventType: input.eventType,
    entityType: input.entityType,
    entityId,
    payload: payloadToStore,
    createdAt,
  };

  await db.insert(auditEvents).values(recordToInsert);

  return {
    id,
    ownerId: recordToInsert.ownerId,
    actorType: recordToInsert.actorType,
    eventType: recordToInsert.eventType,
    entityType: recordToInsert.entityType,
    entityId: recordToInsert.entityId,
    payload: recordToInsert.payload,
    createdAt: createdAt.toISOString(),
  };
}

/**
 * Lists audit events with optional filtering, sorted newest first.
 */
export async function listAuditEvents(
  db: any,
  filters: ListAuditEventsFilters = {},
): Promise<{ events: AuditEventRecord[]; total: number }> {
  const conditions: any[] = [];

  if (filters.ownerId && UUID_REGEX.test(filters.ownerId)) {
    conditions.push(eq(auditEvents.ownerId, filters.ownerId));
  }
  if (filters.entityType) {
    conditions.push(eq(auditEvents.entityType, filters.entityType));
  }
  if (filters.entityId && UUID_REGEX.test(filters.entityId)) {
    conditions.push(eq(auditEvents.entityId, filters.entityId));
  }
  if (filters.eventType) {
    conditions.push(eq(auditEvents.eventType, filters.eventType));
  }
  if (filters.actorType) {
    conditions.push(eq(auditEvents.actorType, filters.actorType));
  }

  const whereClause =
    conditions.length === 0
      ? undefined
      : conditions.length === 1
        ? conditions[0]
        : and(...conditions);

  let query = db.select().from(auditEvents);
  if (whereClause) {
    query = query.where(whereClause);
  }

  if (typeof query.orderBy === "function") {
    query = query.orderBy(desc(auditEvents.createdAt));
  }

  const limit = Math.min(Math.max(1, filters.limit ?? 50), 200);
  const offset = Math.max(0, filters.offset ?? 0);

  if (typeof query.limit === "function") {
    query = query.limit(limit);
  }
  if (typeof query.offset === "function") {
    query = query.offset(offset);
  }

  const rows = await query;

  let total = rows.length;
  try {
    let countQuery = db.select({ count: sql<number>`count(*)` }).from(auditEvents);
    if (whereClause) {
      countQuery = countQuery.where(whereClause);
    }
    const countRes = await countQuery;
    if (countRes && countRes[0] && countRes[0].count !== undefined) {
      total = Number(countRes[0].count);
    }
  } catch {
    total = rows.length;
  }

  const events: AuditEventRecord[] = rows.map((r: any) => ({
    id: r.id,
    ownerId: r.ownerId ?? null,
    actorType: r.actorType,
    eventType: r.eventType,
    entityType: r.entityType,
    entityId: r.entityId ?? null,
    payload: (r.payload as Record<string, unknown>) ?? {},
    createdAt:
      r.createdAt instanceof Date
        ? r.createdAt.toISOString()
        : new Date(r.createdAt).toISOString(),
  }));

  return { events, total };
}
