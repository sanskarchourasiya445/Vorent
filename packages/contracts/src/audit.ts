import { z } from "zod";

/**
 * Actor initiating the security-sensitive event.
 */
export const ActorTypeZodSchema = z.enum([
  "USER",
  "AGENT",
  "SYSTEM",
  "PAYPAL_WEBHOOK",
]);
export type ActorType = z.infer<typeof ActorTypeZodSchema>;

/**
 * Enumeration of all auditable security-sensitive actions across Warrant.
 */
export const AuditEventTypeZodSchema = z.enum([
  "POLICY_CREATED",
  "POLICY_UPDATED",
  "POLICY_ARCHIVED",
  "POLICY_VERSION_CREATED",
  "VERIFICATION_RUN_COMPLETED",
  "FINDING_RESOLVED",
  "FINDING_RISK_ACCEPTED",
  "APPROVAL_CREATED",
  "APPROVAL_REVOKED",
  "NONCE_ISSUED",
  "NONCE_CONSUMED",
  "CHECKOUT_PROPOSAL_EVALUATED",
  "SPEND_RESERVATION_CREATED",
  "SPEND_RESERVATION_RESERVED",
  "SPEND_RESERVATION_COMMITTED",
  "SPEND_RESERVATION_RELEASED",
  "SPEND_RESERVATION_HELD",
  "PAYMENT_ORDER_CREATED",
  "PAYMENT_ORDER_CAPTURED",
  "PAYMENT_ORDER_CANCELLED",
  "PAYMENT_ORDER_FAILED",
  "WEBHOOK_EVENT_PROCESSED",
  "RECONCILIATION_HOLD_TRIGGERED",
  "USER_REGISTERED",
  "USER_LOGGED_IN",
  "USER_LOGGED_OUT",
  "USER_PROFILE_UPDATED",
  "USER_PREFERENCES_UPDATED",
  "USER_PASSWORD_CHANGED",
  "ORGANIZATION_MEMBER_ADDED",
  "EMAIL_NOTIFICATION_SENT",
  "EMAIL_NOTIFICATION_FAILED",
]);
export type AuditEventType = z.infer<typeof AuditEventTypeZodSchema>;

/**
 * Primary target entity type for the audit record.
 */
export const EntityTypeZodSchema = z.enum([
  "POLICY",
  "POLICY_VERSION",
  "TEST_RUN",
  "FINDING",
  "APPROVAL",
  "CHECKOUT_NONCE",
  "CHECKOUT_PROPOSAL",
  "SPEND_RESERVATION",
  "PAYMENT_ORDER",
  "WEBHOOK_EVENT",
  "USER",
  "ORGANIZATION_MEMBER",
  "EMAIL_NOTIFICATION",
]);

export type EntityType = z.infer<typeof EntityTypeZodSchema>;

/**
 * Schema for an immutable, append-only audit event record.
 */
export const AuditEventRecordSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid().nullable().optional(),
  actorType: z.string().min(1),
  eventType: z.string().min(1),
  entityType: z.string().min(1),
  entityId: z.string().nullable().optional(),
  payload: z.record(z.unknown()).default({}),
  createdAt: z.string(),
});
export type AuditEventRecord = z.infer<typeof AuditEventRecordSchema>;

/**
 * Request payload for creating a new audit event.
 */
export const CreateAuditEventInputSchema = z.object({
  ownerId: z.string().uuid().nullable().optional(),
  actorType: ActorTypeZodSchema.default("SYSTEM"),
  eventType: AuditEventTypeZodSchema,
  entityType: EntityTypeZodSchema,
  entityId: z.string().nullable().optional(),
  payload: z.record(z.unknown()).default({}),
});
export type CreateAuditEventInput = z.infer<typeof CreateAuditEventInputSchema>;

/**
 * Response schema for GET /api/audit-events
 */
export const AuditEventListResponseSchema = z.object({
  events: z.array(AuditEventRecordSchema),
  total: z.number().int().nonnegative(),
});
export type AuditEventListResponse = z.infer<typeof AuditEventListResponseSchema>;
