import { describe, it, expect } from "vitest";
import {
  DecisionSchema,
  HealthLiveResponseSchema,
  HealthReadyResponseSchema,
  ReasonCode,
  type Decision,
} from "../index.js";

describe("Contracts & Enums Invariants", () => {
  it("preserves ALLOW, DENY, and REVIEW decision model", () => {
    const validDecisions: Decision[] = ["ALLOW", "DENY", "REVIEW"];
    expect(validDecisions).toContain(DecisionSchema.ALLOW);
    expect(validDecisions).toContain(DecisionSchema.DENY);
    expect(validDecisions).toContain(DecisionSchema.REVIEW);
    expect(Object.keys(DecisionSchema)).toHaveLength(3);
  });

  it("validates HealthLiveResponseSchema successfully", () => {
    const valid = {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: 42,
      service: "warrant-api",
      version: "0.1.0",
    };

    const parsed = HealthLiveResponseSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it("rejects invalid HealthLiveResponseSchema", () => {
    const invalid = {
      status: "error", // only "ok" is allowed
      timestamp: "not-a-datetime",
      uptime: -5,
      service: "warrant-api",
      version: "0.1.0",
    };

    const parsed = HealthLiveResponseSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });

  it("validates sanitized HealthReadyResponseSchema for ready state", () => {
    const validReady = {
      status: "ready",
      timestamp: new Date().toISOString(),
      service: "warrant-api",
      version: "0.1.0",
      database: {
        configured: true,
        connected: true,
        latencyMs: 12,
      },
    };

    const parsed = HealthReadyResponseSchema.safeParse(validReady);
    expect(parsed.success).toBe(true);
  });

  it("validates sanitized HealthReadyResponseSchema for not_ready state", () => {
    const validNotReady = {
      status: "not_ready",
      timestamp: new Date().toISOString(),
      service: "warrant-api",
      version: "0.1.0",
      database: {
        configured: true,
        connected: false,
      },
    };

    const parsed = HealthReadyResponseSchema.safeParse(validNotReady);
    expect(parsed.success).toBe(true);
  });

  it("does not include message or environment in parsed HealthReadyResponse output", () => {
    const payloadWithUnwantedFields = {
      status: "not_ready",
      timestamp: new Date().toISOString(),
      service: "warrant-api",
      version: "0.1.0",
      database: {
        configured: true,
        connected: false,
        message: "raw internal error string",
      },
      environment: "development",
    };

    const parsed = HealthReadyResponseSchema.parse(payloadWithUnwantedFields);
    // Zod strips un-schema'd fields by default
    expect(parsed).not.toHaveProperty("environment");
    expect(parsed.database).not.toHaveProperty("message");
  });

  it("defines core fail-closed reason codes", () => {
    expect(ReasonCode.PROHIBITED_CATEGORY).toBe("PROHIBITED_CATEGORY");
    expect(ReasonCode.ITEM_PRICE_LIMIT_EXCEEDED).toBe("ITEM_PRICE_LIMIT_EXCEEDED");
    expect(ReasonCode.CART_TOTAL_LIMIT_EXCEEDED).toBe("CART_TOTAL_LIMIT_EXCEEDED");
    expect(ReasonCode.LIFETIME_SPEND_LIMIT_EXCEEDED).toBe("LIFETIME_SPEND_LIMIT_EXCEEDED");
    expect(ReasonCode.NONCE_REPLAYED).toBe("NONCE_REPLAYED");
    expect(ReasonCode.POLICY_HASH_MISMATCH).toBe("POLICY_HASH_MISMATCH");
  });
});
