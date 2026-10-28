import { describe, it, expect } from "vitest";
import {
  ConfirmedIntentSchema,
  SearchSpaceDefinitionSchema,
  VerificationConfigSchema,
  VerificationFindingSchema,
  VerificationReportSchema,
  VerificationRequestSchema,
  PresetVerificationRequestSchema,
  ApiVerificationRunRequestSchema,
  ApiErrorResponseSchema,
  type ConfirmedIntent,
  type SearchSpaceDefinition,
} from "../index.js";

describe("Verification Contracts (@warrant/contracts)", () => {
  const validIntent: ConfirmedIntent = {
    name: "Standard Book Purchase Mandate",
    currency: "USD",
    maxItemPriceMinor: 6000,
    maxCartTotalMinor: 6000,
    allowedCategories: ["programming_book"],
    prohibitedCategories: ["gift_card", "subscription"],
    requireEvidence: true,
  };

  const validSearchSpace: SearchSpaceDefinition = {
    domainVersion: "1.0.0",
    categories: ["programming_book", "gift_card"],
    pricePointsMinor: [3000, 6000, 7500],
    quantities: [1, 2],
    currencies: ["USD"],
    maxItemsPerCart: 2,
    evidenceVariations: ["COMPLETE", "MISSING"],
  };

  it("1. validates well-formed ConfirmedIntentSchema", () => {
    const parsed = ConfirmedIntentSchema.safeParse(validIntent);
    expect(parsed.success).toBe(true);
  });

  it("2. rejects invalid ConfirmedIntentSchema with negative limits or invalid currency", () => {
    const invalidCurrency = { ...validIntent, currency: "INVALID_LENGTH" };
    expect(ConfirmedIntentSchema.safeParse(invalidCurrency).success).toBe(false);

    const negativeLimit = { ...validIntent, maxCartTotalMinor: -50 };
    expect(ConfirmedIntentSchema.safeParse(negativeLimit).success).toBe(false);

    const fractionalLimit = { ...validIntent, maxItemPriceMinor: 59.99 };
    expect(ConfirmedIntentSchema.safeParse(fractionalLimit).success).toBe(false);
  });

  it("3. validates well-formed SearchSpaceDefinitionSchema", () => {
    const parsed = SearchSpaceDefinitionSchema.safeParse(validSearchSpace);
    expect(parsed.success).toBe(true);
  });

  it("4. rejects SearchSpaceDefinitionSchema with empty categories or price points", () => {
    const emptyCategories = { ...validSearchSpace, categories: [] };
    expect(SearchSpaceDefinitionSchema.safeParse(emptyCategories).success).toBe(false);

    const emptyPrices = { ...validSearchSpace, pricePointsMinor: [] };
    expect(SearchSpaceDefinitionSchema.safeParse(emptyPrices).success).toBe(false);
  });

  it("5. validates default VerificationConfigSchema values", () => {
    const parsed = VerificationConfigSchema.parse({});
    expect(parsed.maxCandidates).toBe(500);
    expect(parsed.stopOnFirstFinding).toBe(false);
    expect(parsed.timeoutMs).toBe(5000);
  });

  it("6. validates complete VerificationReportSchema", () => {
    const sampleReport = {
      runId: "run-test-001",
      status: "COMPLETED",
      exhausted: true,
      stopReason: "DOMAIN_EXHAUSTED",
      domainVersion: "1.0.0",
      totalCandidatesExplored: 12,
      searchSpaceEstimatedSize: 12,
      findingCount: 0,
      findings: [],
      unresolvedCount: 0,
      unresolvedCandidates: [],
      durationMs: 42,
      summary: "Domain exhausted, zero counterexamples.",
    };

    const parsed = VerificationReportSchema.safeParse(sampleReport);
    expect(parsed.success).toBe(true);
  });

  it("7. validates VerificationFindingSchema with reproduction details and fingerprint", () => {
    const sampleFinding = {
      findingId: "finding-1",
      fingerprint: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      severity: "CRITICAL",
      violationType: "FALSE_POSITIVE_ALLOW",
      title: "Cart spending limit bypassed",
      description: "Policy allowed cart total 7000 exceeding intent limit 6000",
      candidateCart: {
        currency: "USD",
        items: [
          { sku: "item-1", title: "Item 1", category: "books", unitPriceMinor: 3500, quantity: 1 },
          { sku: "item-2", title: "Item 2", category: "books", unitPriceMinor: 3500, quantity: 1 },
        ],
      },
      expectedOutcome: {
        decision: "DENY",
        reasonCode: "CART_TOTAL_LIMIT_EXCEEDED",
      },
      actualOutcome: {
        decision: "ALLOW",
        primaryReasonCode: "ALL_RULES_PASSED",
        reasonCodes: ["ALL_RULES_PASSED"],
      },
      reproduction: {
        candidateIndex: 4,
        summary: "Evaluate cart with 2 items totaling 7000",
      },
      resolutionStatus: "UNRESOLVED",
    };

    const parsed = VerificationFindingSchema.safeParse(sampleFinding);
    expect(parsed.success).toBe(true);
  });

  it("8. validates complete VerificationRequestSchema", () => {
    const request = {
      policy: {
        schemaVersion: "1.0",
        currency: "USD",
        maxItemPriceMinor: 6000,
      },
      intent: validIntent,
      searchSpace: validSearchSpace,
    };

    const parsed = VerificationRequestSchema.safeParse(request);
    expect(parsed.success).toBe(true);
  });

  it("9. validates PresetVerificationRequestSchema", () => {
    const validPreset = {
      policyVersionId: "pol_v1_books_hardware",
      dimensions: ["PRICE_BOUNDARIES", "QUANTITY_SPLITS"],
      candidateBudget: 150,
      timeoutMs: 3000,
    };

    const parsed = PresetVerificationRequestSchema.safeParse(validPreset);
    expect(parsed.success).toBe(true);

    const invalidEmpty = {
      policyVersionId: "",
    };
    expect(PresetVerificationRequestSchema.safeParse(invalidEmpty).success).toBe(false);
  });

  it("10. validates ApiVerificationRunRequestSchema union with both full and preset requests", () => {
    const fullRequest = {
      policy: { schemaVersion: "1.0", currency: "USD" },
      intent: validIntent,
      searchSpace: validSearchSpace,
    };
    expect(ApiVerificationRunRequestSchema.safeParse(fullRequest).success).toBe(true);

    const presetRequest = {
      policyVersionId: "pol_v1_books_hardware",
      candidateBudget: 50,
    };
    expect(ApiVerificationRunRequestSchema.safeParse(presetRequest).success).toBe(true);

    const invalidRequest = {
      randomField: 123,
    };
    expect(ApiVerificationRunRequestSchema.safeParse(invalidRequest).success).toBe(false);
  });

  it("11. validates ApiErrorResponseSchema envelope", () => {
    const errorPayload = {
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid input schema",
      },
      requestId: "req_test_123",
    };

    const parsed = ApiErrorResponseSchema.safeParse(errorPayload);
    expect(parsed.success).toBe(true);

    const invalidError = {
      error: "Just a string",
      requestId: "req_test_123",
    };
    expect(ApiErrorResponseSchema.safeParse(invalidError).success).toBe(false);
  });
});

