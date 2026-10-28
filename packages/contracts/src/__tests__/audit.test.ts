import { describe, it, expect } from "vitest";
import {
  ActorTypeZodSchema,
  AuditEventTypeZodSchema,
  EntityTypeZodSchema,
  AuditEventRecordSchema,
  CreateAuditEventInputSchema,
  AuditEventListResponseSchema,
} from "../audit.js";

describe("Audit Contracts", () => {
  const sampleEvent = {
    id: "a0000000-0000-0000-0000-000000000001",
    ownerId: "b0000000-0000-0000-0000-000000000002",
    actorType: "SYSTEM",
    eventType: "CHECKOUT_PROPOSAL_EVALUATED",
    entityType: "CHECKOUT_PROPOSAL",
    entityId: "c0000000-0000-0000-0000-000000000003",
    payload: { decision: "ALLOW", amountMinor: 4500 },
    createdAt: "2026-10-20T00:00:00.000Z",
  };

  it("validates valid actor types", () => {
    expect(ActorTypeZodSchema.safeParse("USER").success).toBe(true);
    expect(ActorTypeZodSchema.safeParse("AGENT").success).toBe(true);
    expect(ActorTypeZodSchema.safeParse("SYSTEM").success).toBe(true);
    expect(ActorTypeZodSchema.safeParse("PAYPAL_WEBHOOK").success).toBe(true);
    expect(ActorTypeZodSchema.safeParse("UNAUTHORIZED_ATTACKER").success).toBe(false);
  });

  it("validates valid audit event types", () => {
    expect(AuditEventTypeZodSchema.safeParse("POLICY_CREATED").success).toBe(true);
    expect(AuditEventTypeZodSchema.safeParse("APPROVAL_REVOKED").success).toBe(true);
    expect(AuditEventTypeZodSchema.safeParse("PAYMENT_ORDER_CAPTURED").success).toBe(true);
    expect(AuditEventTypeZodSchema.safeParse("RECONCILIATION_HOLD_TRIGGERED").success).toBe(true);
    expect(AuditEventTypeZodSchema.safeParse("ARBITRARY_MUTATION").success).toBe(false);
  });

  it("validates valid entity types", () => {
    expect(EntityTypeZodSchema.safeParse("POLICY").success).toBe(true);
    expect(EntityTypeZodSchema.safeParse("CHECKOUT_PROPOSAL").success).toBe(true);
    expect(EntityTypeZodSchema.safeParse("PAYMENT_ORDER").success).toBe(true);
    expect(EntityTypeZodSchema.safeParse("RANDOM_TABLE").success).toBe(false);
  });

  it("validates AuditEventRecordSchema", () => {
    const parse = AuditEventRecordSchema.safeParse(sampleEvent);
    expect(parse.success).toBe(true);
  });

  it("rejects AuditEventRecordSchema with non-uuid id", () => {
    const parse = AuditEventRecordSchema.safeParse({
      ...sampleEvent,
      id: "invalid-id",
    });
    expect(parse.success).toBe(false);
  });

  it("validates CreateAuditEventInputSchema with defaults", () => {
    const input = {
      eventType: "POLICY_CREATED" as const,
      entityType: "POLICY" as const,
      entityId: "pol_123",
      payload: { name: "Safe policy" },
    };
    const parse = CreateAuditEventInputSchema.safeParse(input);
    expect(parse.success).toBe(true);
    if (parse.success) {
      expect(parse.data.actorType).toBe("SYSTEM");
    }
  });

  it("validates AuditEventListResponseSchema", () => {
    const response = {
      events: [sampleEvent],
      total: 1,
    };
    const parse = AuditEventListResponseSchema.safeParse(response);
    expect(parse.success).toBe(true);
  });
});
