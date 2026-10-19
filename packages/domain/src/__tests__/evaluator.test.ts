import { describe, it, expect } from "vitest";
import {
  evaluatePolicy,
  REASON_CODE_SEVERITY_ORDER,
  sortReasonCodes,
} from "../index.js";
import {
  PolicyEvaluationResultSchema,
  type EvaluatePolicyInput,
  type PolicyDocument,
} from "@warrant/contracts";

describe("Pure Deterministic Policy Evaluator (@warrant/domain)", () => {
  const basePolicy: PolicyDocument = {
    schemaVersion: "1.0",
    currency: "USD",
    maxItemPriceMinor: 6000, // $60.00 inclusive
    maxCartTotalMinor: 6000, // $60.00 inclusive
    allowedCategories: ["programming_book", "office_supplies", "hardware"],
    prohibitedCategories: ["gift_card", "subscription", "weapons"],
    requireEvidence: true,
  };

  it("1. ALLOWs a compliant programming book cart with sufficient evidence", () => {
    const input: EvaluatePolicyInput = {
      policy: basePolicy,
      cart: {
        currency: "USD",
        items: [
          {
            sku: "book-ts-001",
            title: "Programming TypeScript",
            category: "programming_book",
            unitPriceMinor: 4500, // $45.00
            quantity: 1,
          },
        ],
      },
      evidence: {
        snapshotTimestamp: "2026-10-19T10:00:00Z",
        quotesVerified: true,
        evidenceComplete: true,
      },
    };

    const result = evaluatePolicy(input);

    expect(result.decision).toBe("ALLOW");
    expect(result.primaryReasonCode).toBe("ALL_RULES_PASSED");
    expect(result.reasonCodes).toEqual(["ALL_RULES_PASSED"]);
    expect(result.reasonCodes).toContain(result.primaryReasonCode);
    expect(result.metadata?.cartTotalMinor).toBe(4500);
    expect(result.metadata?.itemCount).toBe(1);

    // Rule traces should all be PASS
    expect(result.ruleTrace?.every((t) => t.outcome === "PASS")).toBe(true);

    // Contract validation passes
    const validated = PolicyEvaluationResultSchema.safeParse(result);
    expect(validated.success).toBe(true);
  });

  it("2. DENYs a prohibited gift card cart", () => {
    const input: EvaluatePolicyInput = {
      policy: basePolicy,
      cart: {
        currency: "USD",
        items: [
          {
            sku: "gc-amazon-020",
            title: "Amazon $20 Gift Card",
            category: "gift_card",
            unitPriceMinor: 2000, // $20.00
            quantity: 1,
          },
        ],
      },
      evidence: {
        evidenceComplete: true,
        quotesVerified: true,
      },
    };

    const result = evaluatePolicy(input);

    expect(result.decision).toBe("DENY");
    expect(result.primaryReasonCode).toBe("PROHIBITED_CATEGORY");
    expect(result.reasonCodes).toContain("PROHIBITED_CATEGORY");
    expect(result.reasonCodes).toContain(result.primaryReasonCode);
  });

  it("3. DENYs with PROHIBITED_CATEGORY as primary when both prohibited category and price limit are violated", () => {
    // $75 gift card: violates both $60 maxItemPriceMinor AND prohibited category
    const input: EvaluatePolicyInput = {
      policy: basePolicy,
      cart: {
        currency: "USD",
        items: [
          {
            sku: "gc-visa-075",
            title: "Visa $75 Gift Card",
            category: "gift_card",
            unitPriceMinor: 7500, // $75.00
            quantity: 1,
          },
        ],
      },
      evidence: {
        evidenceComplete: true,
        quotesVerified: true,
      },
    };

    const result = evaluatePolicy(input);

    expect(result.decision).toBe("DENY");
    // Precedence rule: Category compliance trumps price ceiling
    expect(result.primaryReasonCode).toBe("PROHIBITED_CATEGORY");
    expect(result.reasonCodes).toContain("PROHIBITED_CATEGORY");
    expect(result.reasonCodes).toContain("ITEM_PRICE_LIMIT_EXCEEDED");
    expect(result.reasonCodes).toContain("CART_TOTAL_LIMIT_EXCEEDED");
    // Primary is index 0
    expect(result.reasonCodes[0]).toBe("PROHIBITED_CATEGORY");
    expect(result.reasonCodes).toContain(result.primaryReasonCode);
  });

  it("4. Ensures DENY takes precedence over REVIEW when violation and evidence gap coexist", () => {
    // Prohibited gift card + missing evidence
    const input: EvaluatePolicyInput = {
      policy: basePolicy,
      cart: {
        currency: "USD",
        items: [
          {
            sku: "gc-050",
            title: "Gift Card",
            category: "gift_card",
            unitPriceMinor: 5000,
            quantity: 1,
          },
        ],
      },
      evidence: {
        evidenceComplete: false, // Evidence gap!
        quotesVerified: false,
      },
    };

    const result = evaluatePolicy(input);

    // Rule: DENY trumps REVIEW
    expect(result.decision).toBe("DENY");
    expect(result.primaryReasonCode).toBe("PROHIBITED_CATEGORY");
    expect(result.reasonCodes).toContain("PROHIBITED_CATEGORY");
    expect(result.reasonCodes).toContain("MISSING_CRITICAL_EVIDENCE");

    // All DENY codes must precede REVIEW codes in reasonCodes
    const denyIndex = result.reasonCodes.indexOf("PROHIBITED_CATEGORY");
    const reviewIndex = result.reasonCodes.indexOf("MISSING_CRITICAL_EVIDENCE");
    expect(denyIndex).toBeLessThan(reviewIndex);
  });

  it("5. ALLOWs a cart exactly at an inclusive price and cart limit", () => {
    // Exactly $60.00 item and $60.00 cart total with $60.00 limits
    const input: EvaluatePolicyInput = {
      policy: basePolicy,
      cart: {
        currency: "USD",
        items: [
          {
            sku: "book-pro-060",
            title: "Advanced Compiler Design",
            category: "programming_book",
            unitPriceMinor: 6000, // Exactly $60.00
            quantity: 1,
          },
        ],
      },
      evidence: {
        evidenceComplete: true,
        quotesVerified: true,
      },
    };

    const result = evaluatePolicy(input);

    expect(result.decision).toBe("ALLOW");
    expect(result.primaryReasonCode).toBe("ALL_RULES_PASSED");
    expect(result.metadata?.cartTotalMinor).toBe(6000);
  });

  it("6. DENYs a cart just over an inclusive limit by 1 cent", () => {
    // $60.01 item: unit price 6001 minor units
    const input: EvaluatePolicyInput = {
      policy: basePolicy,
      cart: {
        currency: "USD",
        items: [
          {
            sku: "book-6001",
            title: "Expensive Manual",
            category: "programming_book",
            unitPriceMinor: 6001, // $60.01
            quantity: 1,
          },
        ],
      },
      evidence: {
        evidenceComplete: true,
        quotesVerified: true,
      },
    };

    const result = evaluatePolicy(input);

    expect(result.decision).toBe("DENY");
    expect(result.primaryReasonCode).toBe("ITEM_PRICE_LIMIT_EXCEEDED");
    expect(result.reasonCodes).toContain("ITEM_PRICE_LIMIT_EXCEEDED");
    expect(result.reasonCodes).toContain("CART_TOTAL_LIMIT_EXCEEDED");
  });

  it("7. DENYs when individual items are below limit but cart total exceeds limit", () => {
    // Two $35 items: total is $70 > $60 maxCartTotalMinor
    const input: EvaluatePolicyInput = {
      policy: basePolicy,
      cart: {
        currency: "USD",
        items: [
          {
            sku: "item-1",
            title: "Desk Lamp",
            category: "office_supplies",
            unitPriceMinor: 3500,
            quantity: 1,
          },
          {
            sku: "item-2",
            title: "Notebook Set",
            category: "office_supplies",
            unitPriceMinor: 3500,
            quantity: 1,
          },
        ],
      },
      evidence: {
        evidenceComplete: true,
        quotesVerified: true,
      },
    };

    const result = evaluatePolicy(input);

    expect(result.decision).toBe("DENY");
    expect(result.primaryReasonCode).toBe("CART_TOTAL_LIMIT_EXCEEDED");
    expect(result.reasonCodes).toEqual(["CART_TOTAL_LIMIT_EXCEEDED"]);
    expect(result.metadata?.cartTotalMinor).toBe(7000);
  });

  it("8. Returns REVIEW when category is unknown and critical evidence is missing (no definite violation)", () => {
    const input: EvaluatePolicyInput = {
      policy: {
        schemaVersion: "1.0",
        currency: "USD",
        maxItemPriceMinor: 10000,
        maxCartTotalMinor: 10000,
        // No allowedCategories constraint, so unknown category is not a hard block
      },
      cart: {
        currency: "USD",
        items: [
          {
            sku: "misc-001",
            title: "Unclassified Widget",
            category: "unknown",
            unitPriceMinor: 2500,
            quantity: 1,
          },
        ],
      },
      evidence: {
        evidenceComplete: false,
        quotesVerified: false,
      },
    };

    const result = evaluatePolicy(input);

    expect(result.decision).toBe("REVIEW");
    expect(result.primaryReasonCode).toBe("UNKNOWN_CATEGORY");
    expect(result.reasonCodes).toContain("UNKNOWN_CATEGORY");
    expect(result.reasonCodes).toContain("MISSING_CRITICAL_EVIDENCE");
    expect(result.reasonCodes[0]).toBe("UNKNOWN_CATEGORY");
    expect(result.reasonCodes).toContain(result.primaryReasonCode);
  });

  it("9. Returns REVIEW when evidence is stale", () => {
    const input: EvaluatePolicyInput = {
      policy: basePolicy,
      cart: {
        currency: "USD",
        items: [
          {
            sku: "book-1",
            title: "Book",
            category: "programming_book",
            unitPriceMinor: 3000,
            quantity: 1,
          },
        ],
      },
      evidence: {
        evidenceComplete: true,
        quotesVerified: true,
        stale: true,
      },
    };

    const result = evaluatePolicy(input);

    expect(result.decision).toBe("REVIEW");
    expect(result.primaryReasonCode).toBe("STALE_EVIDENCE");
    expect(result.reasonCodes).toContain("STALE_EVIDENCE");
  });

  it("10. DENYs on currency mismatch", () => {
    const input: EvaluatePolicyInput = {
      policy: basePolicy, // USD
      cart: {
        currency: "EUR", // EUR !== USD
        items: [
          {
            sku: "book-eu-001",
            title: "European Book",
            category: "programming_book",
            unitPriceMinor: 3000,
            quantity: 1,
          },
        ],
      },
    };

    const result = evaluatePolicy(input);

    expect(result.decision).toBe("DENY");
    expect(result.primaryReasonCode).toBe("CURRENCY_MISMATCH");
    expect(result.reasonCodes).toContain("CURRENCY_MISMATCH");
  });

  it("11. Handles empty cart with REVIEW and MISSING_CRITICAL_EVIDENCE", () => {
    const input: EvaluatePolicyInput = {
      policy: basePolicy,
      cart: {
        currency: "USD",
        items: [],
      },
    };

    const result = evaluatePolicy(input);

    expect(result.decision).toBe("REVIEW");
    expect(result.primaryReasonCode).toBe("MISSING_CRITICAL_EVIDENCE");
    expect(result.reasonCodes).toContain("MISSING_CRITICAL_EVIDENCE");
    expect(result.metadata?.itemCount).toBe(0);
  });

  it("12. Handles invalid quantity (<= 0) with REVIEW and MISSING_CRITICAL_EVIDENCE", () => {
    const input: EvaluatePolicyInput = {
      policy: basePolicy,
      cart: {
        currency: "USD",
        items: [
          {
            sku: "book-0",
            title: "Zero Quantity Book",
            category: "programming_book",
            unitPriceMinor: 2000,
            quantity: 0, // Invalid!
          },
        ],
      },
    };

    const result = evaluatePolicy(input);

    expect(result.decision).toBe("REVIEW");
    expect(result.primaryReasonCode).toBe("MISSING_CRITICAL_EVIDENCE");
    expect(result.reasonCodes).toContain("MISSING_CRITICAL_EVIDENCE");
  });

  it("13. Preserves deterministic reason-code ordering across multiple runs", () => {
    const input: EvaluatePolicyInput = {
      policy: basePolicy,
      cart: {
        currency: "EUR", // CURRENCY_MISMATCH
        items: [
          {
            sku: "item-mult-violation",
            title: "Prohibited Expensive Item",
            category: "gift_card", // PROHIBITED_CATEGORY
            unitPriceMinor: 8000, // ITEM_PRICE_LIMIT_EXCEEDED & CART_TOTAL_LIMIT_EXCEEDED
            quantity: 1,
          },
        ],
      },
      evidence: {
        evidenceComplete: false, // MISSING_CRITICAL_EVIDENCE
      },
    };

    const run1 = evaluatePolicy(input);
    const run2 = evaluatePolicy(input);

    expect(run1.reasonCodes).toEqual(run2.reasonCodes);
    expect(run1.primaryReasonCode).toEqual(run2.primaryReasonCode);

    // Expected order based on REASON_CODE_SEVERITY_ORDER:
    // PROHIBITED_CATEGORY (1)
    // ITEM_PRICE_LIMIT_EXCEEDED (2)
    // CART_TOTAL_LIMIT_EXCEEDED (3)
    // CURRENCY_MISMATCH (5)
    // MISSING_CRITICAL_EVIDENCE (7)
    expect(run1.reasonCodes).toEqual([
      "PROHIBITED_CATEGORY",
      "ITEM_PRICE_LIMIT_EXCEEDED",
      "CART_TOTAL_LIMIT_EXCEEDED",
      "CURRENCY_MISMATCH",
      "MISSING_CRITICAL_EVIDENCE",
    ]);
  });

  it("14. Guarantees primaryReasonCode is always present in reasonCodes invariant", () => {
    const testCases: EvaluatePolicyInput[] = [
      // Compliant
      {
        policy: basePolicy,
        cart: {
          currency: "USD",
          items: [{ sku: "1", title: "A", category: "programming_book", unitPriceMinor: 1000, quantity: 1 }],
        },
        evidence: { evidenceComplete: true, quotesVerified: true },
      },
      // Prohibited
      {
        policy: basePolicy,
        cart: {
          currency: "USD",
          items: [{ sku: "2", title: "B", category: "gift_card", unitPriceMinor: 1000, quantity: 1 }],
        },
      },
      // Review
      {
        policy: { ...basePolicy, prohibitedCategories: [] },
        cart: {
          currency: "USD",
          items: [{ sku: "3", title: "C", category: "unknown", unitPriceMinor: 1000, quantity: 1 }],
        },
      },
    ];

    for (const testInput of testCases) {
      const result = evaluatePolicy(testInput);
      expect(result.reasonCodes).toContain(result.primaryReasonCode);
      expect(result.reasonCodes.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("15. Correctly sorts reason codes using sortReasonCodes utility", () => {
    expect(REASON_CODE_SEVERITY_ORDER[0]).toBe("PROHIBITED_CATEGORY");

    const unsorted = [
      "MISSING_CRITICAL_EVIDENCE",
      "CART_TOTAL_LIMIT_EXCEEDED",
      "PROHIBITED_CATEGORY",
      "STALE_EVIDENCE",
      "ITEM_PRICE_LIMIT_EXCEEDED",
    ] as const;

    const sorted = sortReasonCodes(unsorted);

    expect(sorted).toEqual([
      "PROHIBITED_CATEGORY",
      "ITEM_PRICE_LIMIT_EXCEEDED",
      "CART_TOTAL_LIMIT_EXCEEDED",
      "MISSING_CRITICAL_EVIDENCE",
      "STALE_EVIDENCE",
    ]);
  });

  it("16. Handles completely invalid or malformed input without throwing unhandled exceptions", () => {
    const invalidInputs = [
      null as any,
      undefined as any,
      {} as any,
      { policy: null, cart: null } as any,
      { policy: { currency: "USD" }, cart: "not-a-cart" } as any,
      {
        policy: { currency: "USD" },
        cart: {
          currency: "USD",
          items: [{ sku: "", title: "", category: "", unitPriceMinor: -50, quantity: "bad" }],
        },
      } as any,
    ];

    for (const invalidInput of invalidInputs) {
      expect(() => {
        const result = evaluatePolicy(invalidInput);
        expect(result.decision).toBe("REVIEW");
        expect(result.reasonCodes).toContain(result.primaryReasonCode);
        expect(result.metadata?.currency).toBeDefined();
      }).not.toThrow();
    }
  });

  it("17. Catches runtime exceptions thrown by malicious or buggy getters and returns REVIEW", () => {
    const explosiveInput = {
      get policy() {
        throw new Error("Malicious getter triggered during evaluation");
      },
      cart: { currency: "USD", items: [] },
    } as any;

    expect(() => {
      const result = evaluatePolicy(explosiveInput);
      expect(result.decision).toBe("REVIEW");
      expect(result.primaryReasonCode).toBe("INTERNAL_EVALUATION_ERROR");
      expect(result.reasonCodes).toContain("INTERNAL_EVALUATION_ERROR");
    }).not.toThrow();
  });

  it("18. Returns REVIEW with MISSING_CRITICAL_EVIDENCE when policy.requireEvidence is true but evidence is omitted", () => {
    const input: EvaluatePolicyInput = {
      policy: {
        ...basePolicy,
        requireEvidence: true,
      },
      cart: {
        currency: "USD",
        items: [
          {
            sku: "book-001",
            title: "TypeScript Book",
            category: "programming_book",
            unitPriceMinor: 2500,
            quantity: 1,
          },
        ],
      },
      evidence: undefined, // Evidence omitted!
    };

    const result = evaluatePolicy(input);
    expect(result.decision).toBe("REVIEW");
    expect(result.primaryReasonCode).toBe("MISSING_CRITICAL_EVIDENCE");
    expect(result.reasonCodes).toContain("MISSING_CRITICAL_EVIDENCE");
  });

  it("19. Enforces DENY precedence over REVIEW for operational DENY codes", () => {
    const reasons = sortReasonCodes(["MISSING_CRITICAL_EVIDENCE", "POLICY_HASH_MISMATCH"]);
    // POLICY_HASH_MISMATCH is a DENY code and must precede MISSING_CRITICAL_EVIDENCE (a REVIEW code)
    expect(reasons[0]).toBe("POLICY_HASH_MISMATCH");
    expect(reasons[1]).toBe("MISSING_CRITICAL_EVIDENCE");
  });

  it("20. Handles huge monetary calculations exceeding MAX_SAFE_INTEGER gracefully with DENY", () => {
    const input: EvaluatePolicyInput = {
      policy: {
        schemaVersion: "1.0",
        currency: "USD",
        // No explicit maxCartTotalMinor limit set
      },
      cart: {
        currency: "USD",
        items: [
          {
            sku: "super-expensive-item",
            title: "Trillion Dollar Item",
            category: "hardware",
            unitPriceMinor: Number.MAX_SAFE_INTEGER,
            quantity: 2, // 2 * MAX_SAFE_INTEGER will overflow safe integers
          },
        ],
      },
    };

    const result = evaluatePolicy(input);
    expect(result.decision).toBe("DENY");
    expect(result.primaryReasonCode).toBe("CART_TOTAL_LIMIT_EXCEEDED");
    expect(result.reasonCodes).toContain("CART_TOTAL_LIMIT_EXCEEDED");
    expect(result.metadata?.cartTotalMinor).toBe(Number.MAX_SAFE_INTEGER);
  });

  it("21. Correctly normalizes category whitespace and case insensitivity in whitelist and blacklist", () => {
    const input: EvaluatePolicyInput = {
      policy: {
        schemaVersion: "1.0",
        currency: "USD",
        allowedCategories: ["  PROGRAMMING_BOOK  "],
        prohibitedCategories: ["  GIFT_CARD  "],
      },
      cart: {
        currency: "USD",
        items: [
          {
            sku: "book-case-test",
            title: "Clean Code",
            category: "programming_book", // Lowercase and trimmed
            unitPriceMinor: 2000,
            quantity: 1,
          },
        ],
      },
    };

    const result = evaluatePolicy(input);
    expect(result.decision).toBe("ALLOW");
    expect(result.primaryReasonCode).toBe("ALL_RULES_PASSED");
  });

  it("22. Detects stale evidence when item category is in evidence.staleCategories", () => {
    const input: EvaluatePolicyInput = {
      policy: {
        schemaVersion: "1.0",
        currency: "USD",
      },
      cart: {
        currency: "USD",
        items: [
          {
            sku: "hardware-01",
            title: "Monitor",
            category: "hardware",
            unitPriceMinor: 20000,
            quantity: 1,
          },
        ],
      },
      evidence: {
        evidenceComplete: true,
        quotesVerified: true,
        staleCategories: ["hardware"],
      },
    };

    const result = evaluatePolicy(input);
    expect(result.decision).toBe("REVIEW");
    expect(result.primaryReasonCode).toBe("STALE_EVIDENCE");
    expect(result.reasonCodes).toContain("STALE_EVIDENCE");
  });

  it("23. Deduplicates CURRENCY_MISMATCH when both cart and item currencies mismatch policy", () => {
    const input: EvaluatePolicyInput = {
      policy: {
        schemaVersion: "1.0",
        currency: "USD",
      },
      cart: {
        currency: "EUR", // Mismatch 1
        items: [
          {
            sku: "item-gbp",
            title: "Item in GBP",
            category: "books",
            unitPriceMinor: 1500,
            quantity: 1,
            currency: "GBP", // Mismatch 2
          },
        ],
      },
    };

    const result = evaluatePolicy(input);
    expect(result.decision).toBe("DENY");
    expect(result.primaryReasonCode).toBe("CURRENCY_MISMATCH");
    const currencyMismatchCount = result.reasonCodes.filter((c) => c === "CURRENCY_MISMATCH").length;
    expect(currencyMismatchCount).toBe(1); // Deduplicated!
  });

  it("24. Rejects fractional or negative prices at schema validation into REVIEW", () => {
    const inputWithFractionalCents = {
      policy: basePolicy,
      cart: {
        currency: "USD",
        items: [
          {
            sku: "fractional-cent-item",
            title: "Item with cents fraction",
            category: "programming_book",
            unitPriceMinor: 49.99, // Fractional cents!
            quantity: 1,
          },
        ],
      },
    } as any;

    const result = evaluatePolicy(inputWithFractionalCents);
    expect(result.decision).toBe("REVIEW");
    expect(result.primaryReasonCode).toBe("MISSING_CRITICAL_EVIDENCE");
    expect(result.reasonCodes).toContain("MISSING_CRITICAL_EVIDENCE");
    expect(result.ruleTrace?.[0]?.ruleId).toBe("input_schema_validation");
  });
});
