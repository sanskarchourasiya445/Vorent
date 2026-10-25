import { describe, it, expect } from "vitest";
import {
  CANONICAL_POLICY_PRESETS,
  POLICY_PRESET_LIST,
  buildSearchSpaceForPreset,
} from "@warrant/test-fixtures";
import {
  PolicyDocumentSchema,
  ConfirmedIntentSchema,
  SearchSpaceDefinitionSchema,
} from "@warrant/contracts";
import { computePolicyHash } from "../verification/policyHash.js";
import { evaluatePolicy } from "../evaluator.js";

describe("Policy Preset Consistency Suite (LEAN-001 & LEAN-009)", () => {
  it("exports all 3 canonical presets in CANONICAL_POLICY_PRESETS and POLICY_PRESET_LIST", () => {
    expect(Object.keys(CANONICAL_POLICY_PRESETS)).toEqual([
      "pol_v1_books_hardware",
      "pol_v2_strict_peripherals",
      "pol_seeded_defect_unbounded_cart",
    ]);

    expect(POLICY_PRESET_LIST).toHaveLength(3);
    expect(POLICY_PRESET_LIST.map((p) => p.id)).toEqual([
      "pol_v1_books_hardware",
      "pol_v2_strict_peripherals",
      "pol_seeded_defect_unbounded_cart",
    ]);
  });

  it("proves each preset hash strictly matches computePolicyHash(preset.policy) using the canonical algorithm", () => {
    for (const preset of POLICY_PRESET_LIST) {
      const computedHash = computePolicyHash(preset.policy);
      expect(preset.hash).toBe(computedHash);
      expect(preset.hash).toMatch(/^[0-9a-f]{64}$/);
    }

    // Explicit verification of verified cryptographic digests
    expect(CANONICAL_POLICY_PRESETS["pol_v1_books_hardware"]?.hash).toBe(
      "93258bd2e0e10160490d8d690e79028c1886f96de0806b749e1822619a3cbbb5"
    );
    expect(CANONICAL_POLICY_PRESETS["pol_v2_strict_peripherals"]?.hash).toBe(
      "b327a266d96b8461924c4baa78afd43f46669a1be5e5aacf419eab57c0a30f07"
    );
    expect(CANONICAL_POLICY_PRESETS["pol_seeded_defect_unbounded_cart"]?.hash).toBe(
      "1d4ea3fac4f62cae288f43ec6ae466b757081ab1be31039e9f84d26c9f47183f"
    );
  });

  it("maintains referential equality between .policy and .policyDocument for seamless cross-tier compatibility", () => {
    for (const preset of POLICY_PRESET_LIST) {
      expect(preset.policy).toBe(preset.policyDocument);
    }
  });

  it("validates that all preset policy documents and intents strictly conform to contracts schemas", () => {
    for (const preset of POLICY_PRESET_LIST) {
      const parsedPolicy = PolicyDocumentSchema.safeParse(preset.policy);
      expect(parsedPolicy.success).toBe(true);

      const parsedIntent = ConfirmedIntentSchema.safeParse(preset.intent);
      expect(parsedIntent.success).toBe(true);
    }
  });

  it("verifies buildSearchSpaceForPreset builds schema-valid search space definitions with boundary expansion", () => {
    const preset = CANONICAL_POLICY_PRESETS["pol_v1_books_hardware"]!;
    const searchSpace = buildSearchSpaceForPreset(preset, [
      "PRICE_BOUNDARIES",
      "CATEGORY_EVASION",
      "QUANTITY_SPLITS",
      "CURRENCY_MUTATION",
      "EVIDENCE_FRESHNESS",
    ]);

    const parsed = SearchSpaceDefinitionSchema.safeParse(searchSpace);
    expect(parsed.success).toBe(true);

    // Verifies PRICE_BOUNDARIES adds ceiling boundaries (25000 -> 24900, 25000, 25100)
    expect(searchSpace.pricePointsMinor).toContain(24900);
    expect(searchSpace.pricePointsMinor).toContain(25000);
    expect(searchSpace.pricePointsMinor).toContain(25100);

    // Verifies CATEGORY_EVASION includes prohibited and evasion categories
    expect(searchSpace.categories).toContain("Gift Cards");
    expect(searchSpace.categories).toContain("Weapons / Lasers");
    expect(searchSpace.categories).toContain("Office Furnishing / Ergonomics");

    // Verifies QUANTITY_SPLITS expands quantities
    expect(searchSpace.quantities).toEqual([1, 2, 3]);
    expect(searchSpace.maxItemsPerCart).toBe(2);

    // Verifies CURRENCY_MUTATION expands currencies
    expect(searchSpace.currencies).toContain("USD");
    expect(searchSpace.currencies).toContain("EUR");

    // Verifies EVIDENCE_FRESHNESS
    expect(searchSpace.evidenceVariations).toEqual(["COMPLETE", "STALE", "MISSING"]);
  });

  it("verifies actual domain evaluation behavior under pol_v1_books_hardware", () => {
    const preset = CANONICAL_POLICY_PRESETS["pol_v1_books_hardware"]!;

    // 1. Compliant Book ($48.00) -> ALLOW
    const bookResult = evaluatePolicy({
      policy: preset.policy,
      cart: {
        currency: "USD",
        items: [
          {
            sku: "book-1",
            title: "Designing Data-Intensive Applications",
            category: "Reference Books",
            unitPriceMinor: 4800,
            quantity: 1,
          },
        ],
      },
      evidence: { evidenceComplete: true, quotesVerified: true, stale: false },
    });
    expect(bookResult.decision).toBe("ALLOW");
    expect(bookResult.primaryReasonCode).toBe("ALL_RULES_PASSED");

    // 2. Prohibited Gift Card ($100.00) -> DENY
    const giftCardResult = evaluatePolicy({
      policy: preset.policy,
      cart: {
        currency: "USD",
        items: [
          {
            sku: "gc-1",
            title: "Amazon Gift Card",
            category: "Gift Cards",
            unitPriceMinor: 10000,
            quantity: 1,
          },
        ],
      },
      evidence: { evidenceComplete: true, quotesVerified: true, stale: false },
    });
    expect(giftCardResult.decision).toBe("DENY");
    expect(giftCardResult.primaryReasonCode).toBe("PROHIBITED_CATEGORY");
  });

  it("verifies pol_seeded_defect_unbounded_cart omits maxCartTotalMinor causing overflow counterexample", () => {
    const defectPreset = CANONICAL_POLICY_PRESETS["pol_seeded_defect_unbounded_cart"]!;
    expect(defectPreset.policy.maxCartTotalMinor).toBeUndefined();
    expect(defectPreset.intent.maxCartTotalMinor).toBe(60000);

    // Cart with 3x $220.00 ($660.00 total)
    const cartResult = evaluatePolicy({
      policy: defectPreset.policy,
      cart: {
        currency: "USD",
        items: [
          {
            sku: "hw-mon-1",
            title: "4K Monitor",
            category: "Hardware",
            unitPriceMinor: 22000, // <= $250.00 item ceiling
            quantity: 3, // $660.00 total
          },
        ],
      },
      evidence: { evidenceComplete: true, quotesVerified: true, stale: false },
    });

    // Under defective policy without whole-cart limit, it passes item ceiling
    expect(cartResult.decision).toBe("ALLOW");
    // But under intent ($600.00), $660.00 is a violation — confirming the seeded defect behavior!
    expect(defectPreset.intent.maxCartTotalMinor).toBeDefined();
    expect(66000 > (defectPreset.intent.maxCartTotalMinor ?? 0)).toBe(true);
  });
});
