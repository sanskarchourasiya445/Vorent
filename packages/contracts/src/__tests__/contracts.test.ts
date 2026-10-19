import { describe, it, expect } from "vitest";
import {
  DecisionSchema,
  DecisionZodSchema,
  HealthLiveResponseSchema,
  HealthReadyResponseSchema,
  ReasonCode,
  ReasonCodeZodSchema,
  PolicyEvaluationResultSchema,
  CartSchema,
  CartItemSchema,
  EvaluationMetadataSchema,
  PolicyDocumentSchema,
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
    expect(ReasonCode.ALL_RULES_PASSED).toBe("ALL_RULES_PASSED");
  });

  describe("PolicyEvaluationResultSchema Invariants", () => {
    it("validates a conforming ALLOW evaluation result", () => {
      const validAllow = {
        decision: "ALLOW",
        primaryReasonCode: "ALL_RULES_PASSED",
        reasonCodes: ["ALL_RULES_PASSED"],
        ruleTrace: [
          {
            ruleId: "category_check",
            ruleName: "Category Check",
            outcome: "PASS",
            message: "All categories are allowed",
          },
        ],
        metadata: {
          evaluatorVersion: "1.0.0",
          itemCount: 1,
          cartTotalMinor: 4500,
          currency: "USD",
        },
      };

      const parsed = PolicyEvaluationResultSchema.safeParse(validAllow);
      expect(parsed.success).toBe(true);
    });

    it("validates a conforming DENY evaluation result with multiple reason codes", () => {
      const validDeny = {
        decision: "DENY",
        primaryReasonCode: "PROHIBITED_CATEGORY",
        reasonCodes: ["PROHIBITED_CATEGORY", "ITEM_PRICE_LIMIT_EXCEEDED"],
        ruleTrace: [
          {
            ruleId: "prohibited_category",
            ruleName: "Prohibited Category",
            outcome: "FAIL",
            reasonCode: "PROHIBITED_CATEGORY",
            message: "Item is in prohibited category gift_card",
          },
        ],
      };

      const parsed = PolicyEvaluationResultSchema.safeParse(validDeny);
      expect(parsed.success).toBe(true);
    });

    it("rejects result where primaryReasonCode is not in reasonCodes", () => {
      const invalidResult = {
        decision: "DENY",
        primaryReasonCode: "PROHIBITED_CATEGORY",
        reasonCodes: ["ITEM_PRICE_LIMIT_EXCEEDED"], // Missing primaryReasonCode!
      };

      const parsed = PolicyEvaluationResultSchema.safeParse(invalidResult);
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues[0]?.message).toContain("primaryReasonCode must be present in reasonCodes");
      }
    });

    it("rejects result with empty reasonCodes array", () => {
      const emptyReasons = {
        decision: "ALLOW",
        primaryReasonCode: "ALL_RULES_PASSED",
        reasonCodes: [],
      };

      const parsed = PolicyEvaluationResultSchema.safeParse(emptyReasons);
      expect(parsed.success).toBe(false);
    });

    it("rejects invalid decision value", () => {
      const invalidDecision = {
        decision: "MAYBE",
        primaryReasonCode: "ALL_RULES_PASSED",
        reasonCodes: ["ALL_RULES_PASSED"],
      };

      const parsed = PolicyEvaluationResultSchema.safeParse(invalidDecision);
      expect(parsed.success).toBe(false);

      expect(DecisionZodSchema.safeParse("MAYBE").success).toBe(false);
      expect(DecisionZodSchema.safeParse("ALLOW").success).toBe(true);
    });

    it("rejects invalid reasonCode value", () => {
      const invalidReason = {
        decision: "DENY",
        primaryReasonCode: "ARBITRARY_UNAUTHORIZED_REASON",
        reasonCodes: ["ARBITRARY_UNAUTHORIZED_REASON"],
      };

      const parsed = PolicyEvaluationResultSchema.safeParse(invalidReason);
      expect(parsed.success).toBe(false);

      expect(ReasonCodeZodSchema.safeParse("ARBITRARY_UNAUTHORIZED_REASON").success).toBe(false);
      expect(ReasonCodeZodSchema.safeParse("ALL_RULES_PASSED").success).toBe(true);
    });
  });

  describe("Cart and Policy Schemas", () => {
    it("validates well-formed cart", () => {
      const validCart = {
        currency: "USD",
        items: [
          {
            sku: "book-1",
            title: "TypeScript Guide",
            category: "programming_book",
            unitPriceMinor: 4500,
            quantity: 1,
          },
        ],
      };

      const parsed = CartSchema.safeParse(validCart);
      expect(parsed.success).toBe(true);
    });

    it("validates well-formed policy document", () => {
      const validPolicy = {
        schemaVersion: "1.0",
        currency: "USD",
        maxItemPriceMinor: 6000,
        maxCartTotalMinor: 6000,
        prohibitedCategories: ["gift_card"],
      };

      const parsed = PolicyDocumentSchema.safeParse(validPolicy);
      expect(parsed.success).toBe(true);
    });

    it("rejects negative or fractional unitPriceMinor in CartItemSchema", () => {
      const negativePrice = {
        sku: "item-1",
        title: "Item 1",
        category: "books",
        unitPriceMinor: -100,
        quantity: 1,
      };
      expect(CartItemSchema.safeParse(negativePrice).success).toBe(false);

      const fractionalPrice = {
        sku: "item-2",
        title: "Item 2",
        category: "books",
        unitPriceMinor: 45.5,
        quantity: 1,
      };
      expect(CartItemSchema.safeParse(fractionalPrice).success).toBe(false);
    });

    it("rejects non-integer quantity in CartItemSchema", () => {
      const fractionalQty = {
        sku: "item-1",
        title: "Item 1",
        category: "books",
        unitPriceMinor: 1000,
        quantity: 1.5,
      };
      expect(CartItemSchema.safeParse(fractionalQty).success).toBe(false);
    });

    it("rejects values exceeding MAX_SAFE_INTEGER in CartItemSchema", () => {
      const unsafePrice = {
        sku: "item-1",
        title: "Item 1",
        category: "books",
        unitPriceMinor: Number.MAX_SAFE_INTEGER + 1,
        quantity: 1,
      };
      expect(CartItemSchema.safeParse(unsafePrice).success).toBe(false);
    });

    it("rejects negative or fractional limits in PolicyDocumentSchema", () => {
      const negativeLimit = {
        schemaVersion: "1.0",
        currency: "USD",
        maxItemPriceMinor: -50,
      };
      expect(PolicyDocumentSchema.safeParse(negativeLimit).success).toBe(false);

      const fractionalLimit = {
        schemaVersion: "1.0",
        currency: "USD",
        maxCartTotalMinor: 50.75,
      };
      expect(PolicyDocumentSchema.safeParse(fractionalLimit).success).toBe(false);
    });

    it("accepts valid and audit currencies in EvaluationMetadataSchema", () => {
      const valid3Letter = {
        evaluatorVersion: "1.0.0",
        itemCount: 1,
        cartTotalMinor: 1000,
        currency: "USD",
      };
      expect(EvaluationMetadataSchema.safeParse(valid3Letter).success).toBe(true);

      const fallbackUnknown = {
        evaluatorVersion: "1.0.0",
        itemCount: 0,
        cartTotalMinor: 0,
        currency: "UNKNOWN",
      };
      expect(EvaluationMetadataSchema.safeParse(fallbackUnknown).success).toBe(true);

      const emptyCurrency = {
        evaluatorVersion: "1.0.0",
        itemCount: 0,
        cartTotalMinor: 0,
        currency: "",
      };
      expect(EvaluationMetadataSchema.safeParse(emptyCurrency).success).toBe(false);
    });
  });
});
