import { describe, it, expect } from "vitest";
import {
  verifyPolicy,
  generateCandidates,
  computeFindingFingerprint,
} from "../index.js";
import type {
  ConfirmedIntent,
  PolicyDocument,
  SearchSpaceDefinition,
  VerificationRequest,
} from "@warrant/contracts";

describe("Bounded Verification Engine (@warrant/domain)", () => {
  const confirmedIntent: ConfirmedIntent = {
    name: "Book Purchase Mandate (Max $60 Total, No Gift Cards)",
    currency: "USD",
    maxItemPriceMinor: 6000, // $60.00
    maxCartTotalMinor: 6000, // $60.00
    allowedCategories: ["programming_book", "office_supplies"],
    prohibitedCategories: ["gift_card", "subscription"],
    requireEvidence: true,
  };

  const declaredSearchSpace: SearchSpaceDefinition = {
    domainVersion: "1.0.0",
    categories: ["programming_book", "gift_card"],
    pricePointsMinor: [3500, 6000, 7500], // $35, $60, $75
    quantities: [1],
    currencies: ["USD"],
    maxItemsPerCart: 2,
    evidenceVariations: ["COMPLETE", "MISSING"],
  };

  it("1. Discovers the seeded policy defect: cart spending ceiling omitted while item ceiling set", () => {
    // Defective policy: Set maxItemPriceMinor: 6000 ($60), but forgot maxCartTotalMinor!
    // When two $35 items are in the cart (total $70), policy allows it, but intent strictly capped total at $60.
    const defectivePolicy: PolicyDocument = {
      schemaVersion: "1.0",
      currency: "USD",
      maxItemPriceMinor: 6000,
      // maxCartTotalMinor is missing! Seeded defect from docs/PROJECT.md!
      allowedCategories: ["programming_book"],
      prohibitedCategories: ["gift_card"],
      requireEvidence: true,
    };

    const request: VerificationRequest = {
      policy: defectivePolicy,
      intent: confirmedIntent,
      searchSpace: declaredSearchSpace,
      config: {
        maxCandidates: 500,
        policyVersionId: "pv_draft_001",
        policyHash: "a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890",
      },
    };

    const report = verifyPolicy(request);

    expect(report.status).toBe("COMPLETED");
    expect(report.exhausted).toBe(true);
    expect(report.stopReason).toBe("DOMAIN_EXHAUSTED");
    expect(report.findingCount).toBeGreaterThan(0);

    // Look for the specific cart ceiling finding
    const budgetFinding = report.findings.find(
      (f) => f.expectedOutcome.reasonCode === "CART_TOTAL_LIMIT_EXCEEDED",
    );
    expect(budgetFinding).toBeDefined();
    expect(budgetFinding?.severity).toBe("CRITICAL");
    expect(budgetFinding?.violationType).toBe("FALSE_POSITIVE_ALLOW");
    expect(budgetFinding?.expectedOutcome.decision).toBe("DENY");
    expect(budgetFinding?.actualOutcome.decision).toBe("ALLOW");
    expect(budgetFinding?.policyVersionId).toBe("pv_draft_001");
    expect(budgetFinding?.fingerprint).toBeDefined();
    expect(budgetFinding?.fingerprint.length).toBe(64);
  });

  it("2. Discovers prohibited category leak when policy omits prohibited category", () => {
    // Defective policy: forgot to prohibit "gift_card"
    const defectivePolicy: PolicyDocument = {
      schemaVersion: "1.0",
      currency: "USD",
      maxItemPriceMinor: 10000,
      maxCartTotalMinor: 10000,
      // prohibitedCategories omitted!
      requireEvidence: true,
    };

    const request: VerificationRequest = {
      policy: defectivePolicy,
      intent: confirmedIntent,
      searchSpace: {
        ...declaredSearchSpace,
        categories: ["gift_card"],
        pricePointsMinor: [2000],
        maxItemsPerCart: 1,
        evidenceVariations: ["COMPLETE"],
      },
    };

    const report = verifyPolicy(request);

    expect(report.findingCount).toBeGreaterThan(0);
    const categoryFinding = report.findings.find(
      (f) => f.expectedOutcome.reasonCode === "PROHIBITED_CATEGORY",
    );
    expect(categoryFinding).toBeDefined();
    expect(categoryFinding?.severity).toBe("CRITICAL");
    expect(categoryFinding?.violationType).toBe("FALSE_POSITIVE_ALLOW");
    expect(categoryFinding?.actualOutcome.decision).toBe("ALLOW");
    expect(categoryFinding?.expectedOutcome.decision).toBe("DENY");
  });

  it("3. Discovers false negative when policy improperly denies a compliant purchase", () => {
    // Defective policy: set overly strict limit of $20 when intent allowed up to $60
    const overstrictPolicy: PolicyDocument = {
      schemaVersion: "1.0",
      currency: "USD",
      maxItemPriceMinor: 2000, // $20 max, but intent wanted $60!
      maxCartTotalMinor: 6000,
      allowedCategories: ["programming_book"],
      requireEvidence: true,
    };

    const request: VerificationRequest = {
      policy: overstrictPolicy,
      intent: confirmedIntent,
      searchSpace: {
        ...declaredSearchSpace,
        categories: ["programming_book"],
        pricePointsMinor: [3500], // $35 compliant book under $60 intent
        maxItemsPerCart: 1,
        evidenceVariations: ["COMPLETE"],
      },
    };

    const report = verifyPolicy(request);

    expect(report.findingCount).toBeGreaterThan(0);
    const falseNegative = report.findings.find((f) => f.violationType === "FALSE_NEGATIVE_DENY");
    expect(falseNegative).toBeDefined();
    expect(falseNegative?.severity).toBe("HIGH");
    expect(falseNegative?.expectedOutcome.decision).toBe("ALLOW");
    expect(falseNegative?.actualOutcome.decision).toBe("DENY");
  });

  it("4. Exhausts finite domain with zero findings for a fully repaired and aligned policy", () => {
    // Repaired policy: exactly enforces all intent limits and category constraints
    const repairedPolicy: PolicyDocument = {
      schemaVersion: "1.0",
      currency: "USD",
      maxItemPriceMinor: 6000,
      maxCartTotalMinor: 6000,
      allowedCategories: ["programming_book", "office_supplies"],
      prohibitedCategories: ["gift_card", "subscription"],
      requireEvidence: true,
    };

    const request: VerificationRequest = {
      policy: repairedPolicy,
      intent: confirmedIntent,
      searchSpace: declaredSearchSpace,
      config: {
        maxCandidates: 500,
      },
    };

    const report = verifyPolicy(request);

    expect(report.status).toBe("COMPLETED");
    expect(report.exhausted).toBe(true);
    expect(report.stopReason).toBe("DOMAIN_EXHAUSTED");
    expect(report.findingCount).toBe(0);
    expect(report.findings).toHaveLength(0);
    expect(report.totalCandidatesExplored).toBeGreaterThan(0);
    expect(report.summary).toContain("Exhaustive search of declared finite domain completed: zero counterexamples");
  });

  it("5. Yields identical findings and stable SHA-256 fingerprints across deterministic reruns", () => {
    const defectivePolicy: PolicyDocument = {
      schemaVersion: "1.0",
      currency: "USD",
      maxItemPriceMinor: 6000,
      allowedCategories: ["programming_book"],
      prohibitedCategories: ["gift_card"],
      requireEvidence: true,
    };

    const request: VerificationRequest = {
      policy: defectivePolicy,
      intent: confirmedIntent,
      searchSpace: declaredSearchSpace,
      config: {
        policyHash: "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210",
      },
    };

    const run1 = verifyPolicy(request);
    const run2 = verifyPolicy(request);

    expect(run1.findingCount).toBe(run2.findingCount);
    expect(run1.totalCandidatesExplored).toBe(run2.totalCandidatesExplored);
    expect(run1.findings.map((f) => f.fingerprint)).toEqual(run2.findings.map((f) => f.fingerprint));
    expect(run1.findings[0]?.fingerprint).toBe(run2.findings[0]?.fingerprint);
  });

  it("6. Stops with CANDIDATE_CAP_REACHED and INCOMPLETE status when maxCandidates is reached", () => {
    const defectivePolicy: PolicyDocument = {
      schemaVersion: "1.0",
      currency: "USD",
      maxItemPriceMinor: 6000,
      requireEvidence: true,
    };

    const request: VerificationRequest = {
      policy: defectivePolicy,
      intent: confirmedIntent,
      searchSpace: declaredSearchSpace,
      config: {
        maxCandidates: 4, // Intentionally small cap
      },
    };

    const report = verifyPolicy(request);

    expect(report.status).toBe("INCOMPLETE");
    expect(report.exhausted).toBe(false);
    expect(report.stopReason).toBe("CANDIDATE_CAP_REACHED");
    expect(report.totalCandidatesExplored).toBe(4);
    expect(report.summary).toContain("Search space was not exhausted");
  });

  it("7. Stops immediately on first finding when stopOnFirstFinding is enabled", () => {
    const defectivePolicy: PolicyDocument = {
      schemaVersion: "1.0",
      currency: "USD",
      // Completely permissive policy will fail early
      maxItemPriceMinor: 100000,
      requireEvidence: true,
    };

    const request: VerificationRequest = {
      policy: defectivePolicy,
      intent: confirmedIntent,
      searchSpace: declaredSearchSpace,
      config: {
        stopOnFirstFinding: true,
      },
    };

    const report = verifyPolicy(request);

    expect(report.status).toBe("INCOMPLETE");
    expect(report.exhausted).toBe(false);
    expect(report.stopReason).toBe("FIRST_FINDING_STOP");
    expect(report.findingCount).toBe(1);
    expect(report.findings).toHaveLength(1);
  });

  it("8. Distinguishes catalog-evidence gaps from policy defects and records unresolved candidates", () => {
    const policy: PolicyDocument = {
      schemaVersion: "1.0",
      currency: "USD",
      maxItemPriceMinor: 6000,
      maxCartTotalMinor: 6000,
      allowedCategories: ["programming_book"],
      prohibitedCategories: ["gift_card"],
      requireEvidence: true,
    };

    const request: VerificationRequest = {
      policy,
      intent: confirmedIntent,
      searchSpace: {
        domainVersion: "1.0.0",
        categories: ["programming_book"],
        pricePointsMinor: [3500],
        quantities: [1],
        currencies: ["USD"],
        maxItemsPerCart: 1,
        evidenceVariations: ["MISSING", "STALE"], // Only incomplete/stale evidence
      },
    };

    const report = verifyPolicy(request);

    // Should NOT fabricate policy findings because the gap is catalog evidence, not policy defect
    expect(report.findingCount).toBe(0);
    expect(report.unresolvedCount).toBeGreaterThan(0);
    expect(report.unresolvedCandidates?.[0]?.unresolvedReason).toBe("CATALOG_EVIDENCE_GAP");
    expect(report.unresolvedCandidates?.[0]?.actualDecision).toBe("REVIEW");
  });

  it("9. Deduplicates candidate carts and prevents duplicate evaluations", () => {
    const searchSpace: SearchSpaceDefinition = {
      domainVersion: "1.0.0",
      categories: ["books", "books"], // Duplicate input categories
      pricePointsMinor: [1000, 1000], // Duplicate input prices
      quantities: [1, 1],
      currencies: ["USD", "USD"],
      maxItemsPerCart: 1,
      evidenceVariations: ["COMPLETE"],
    };

    const candidates = generateCandidates(searchSpace);
    // Unique combination should be exactly 1
    expect(candidates).toHaveLength(1);
  });

  it("10. Throws error and marks report FAILED when search space exceeds safety combination limit", () => {
    const explosiveSpace: SearchSpaceDefinition = {
      domainVersion: "1.0.0",
      // Large array of categories and price points that would blow up 2-item cart space
      categories: Array.from({ length: 40 }, (_, i) => `category_${i}`),
      pricePointsMinor: Array.from({ length: 20 }, (_, i) => (i + 1) * 1000),
      quantities: [1],
      currencies: ["USD"],
      maxItemsPerCart: 2,
      evidenceVariations: ["COMPLETE"],
    };

    expect(() => generateCandidates(explosiveSpace)).toThrow("Declared search space exceeds safety limit");

    const report = verifyPolicy({
      policy: { schemaVersion: "1.0", currency: "USD" },
      intent: confirmedIntent,
      searchSpace: explosiveSpace,
    });

    expect(report.status).toBe("FAILED");
    expect(report.stopReason).toBe("ERROR");
    expect(report.summary).toContain("Declared search space exceeds safety limit");
  });

  it("11. Verifies computeFindingFingerprint produces stable, expected hex hash", () => {
    const fingerprint1 = computeFindingFingerprint({
      violationType: "FALSE_POSITIVE_ALLOW",
      expectedDecision: "DENY",
      actualDecision: "ALLOW",
      actualPrimaryReasonCode: "ALL_RULES_PASSED",
      candidateCart: {
        currency: "USD",
        items: [{ sku: "book-1", title: "Book", category: "programming_book", unitPriceMinor: 7500, quantity: 1 }],
      },
      policyHash: "hash-123",
    });

    const fingerprint2 = computeFindingFingerprint({
      violationType: "FALSE_POSITIVE_ALLOW",
      expectedDecision: "DENY",
      actualDecision: "ALLOW",
      actualPrimaryReasonCode: "ALL_RULES_PASSED",
      candidateCart: {
        currency: "USD",
        items: [{ sku: "book-1", title: "Book", category: "programming_book", unitPriceMinor: 7500, quantity: 1 }],
      },
      policyHash: "hash-123",
    });

    expect(fingerprint1).toBe(fingerprint2);
    expect(fingerprint1).toMatch(/^[a-f0-9]{64}$/);
  });
});
