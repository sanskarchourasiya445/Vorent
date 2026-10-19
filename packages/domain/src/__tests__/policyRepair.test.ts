import { describe, it, expect } from "vitest";
import { computePolicyDiff } from "../repair/policyDiff.js";
import { proposePolicyRepair } from "../repair/policyRepairer.js";
import { type PolicyDocument, type VerificationFinding } from "@warrant/contracts";

describe("Phase 2 Policy Diff & Automated Repair", () => {
  const samplePolicyV1: PolicyDocument = {
    schemaVersion: "1.0",
    currency: "USD",
    maxItemPriceMinor: 25000, // $250.00
    // maxCartTotalMinor omitted (flawed policy)
    allowedCategories: ["Hardware", "Reference Books"],
    prohibitedCategories: ["Adult"],
    requireEvidence: true,
  };

  describe("computePolicyDiff", () => {
    it("detects additions, removals, and modifications between policies", () => {
      const policyV2: PolicyDocument = {
        schemaVersion: "1.0",
        currency: "USD",
        maxItemPriceMinor: 20000, // tightened from 25000
        maxCartTotalMinor: 50000, // added 50000
        allowedCategories: ["Hardware", "Reference Books", "Peripherals"], // added Peripherals
        prohibitedCategories: ["Adult", "Gift Cards"], // added Gift Cards
        requireEvidence: true,
      };

      const diff = computePolicyDiff(samplePolicyV1, policyV2, {
        sourceVersionId: "v1-uuid",
      });

      expect(diff.hasChanges).toBe(true);
      expect(diff.previousVersionId).toBe("v1-uuid");
      expect(diff.diffs.length).toBe(4);

      const itemPriceDiff = diff.diffs.find((d) => d.field === "maxItemPriceMinor");
      expect(itemPriceDiff?.changeType).toBe("MODIFIED");
      expect(itemPriceDiff?.description).toContain("Tightened");

      const cartTotalDiff = diff.diffs.find((d) => d.field === "maxCartTotalMinor");
      expect(cartTotalDiff?.changeType).toBe("ADDED");
      expect(cartTotalDiff?.description).toContain("Added whole-cart spending ceiling");

      const prohibitedDiff = diff.diffs.find((d) => d.field === "prohibitedCategories");
      expect(prohibitedDiff?.changeType).toBe("MODIFIED");
      expect(prohibitedDiff?.description).toContain("Gift Cards");
    });

    it("returns hasChanges: false when policies are identical", () => {
      const diff = computePolicyDiff(samplePolicyV1, { ...samplePolicyV1 });
      expect(diff.hasChanges).toBe(false);
      expect(diff.diffs).toHaveLength(0);
      expect(diff.summary).toContain("No semantic changes");
    });
  });

  describe("proposePolicyRepair", () => {
    it("proposes whole-cart spending cap repair when cart total finding occurs", () => {
      const finding: VerificationFinding = {
        findingId: "f-1",
        fingerprint: "fp-cart-total-leak",
        severity: "CRITICAL",
        violationType: "FALSE_POSITIVE_ALLOW",
        title: "Cart Spending Ceiling Exceeded (66000 > 60000)",
        description: "Policy allowed cumulative cart total 66000 minor units, which exceeds intent whole-cart limit 60000.",
        candidateCart: {
          currency: "USD",
          items: [
            { sku: "hw-1", title: "Item 1", category: "Hardware", unitPriceMinor: 22000, quantity: 3 },
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
          ruleTrace: [],
        },
        reproduction: {
          candidateIndex: 12,
          summary: "Evaluate cart totaling 66000",
        },
        resolutionStatus: "UNRESOLVED",
      };

      const repair = proposePolicyRepair({
        originalPolicy: samplePolicyV1,
        findings: [finding],
        sourceVersionId: "v1-uuid",
      });

      expect(repair.repairedPolicy.maxCartTotalMinor).toBe(60000);
      expect(repair.requiresVerification).toBe(true);
      expect(repair.addressedFindings).toHaveLength(1);
      expect(repair.addressedFindings[0]?.findingId).toBe("f-1");
      expect(repair.diff.hasChanges).toBe(true);
      expect(repair.diff.diffs.some((d) => d.field === "maxCartTotalMinor")).toBe(true);
      expect(repair.rationale).toContain("whole-cart spending ceiling");
    });

    it("proposes prohibiting leaked category when counterexample allows unauthorized category", () => {
      const finding: VerificationFinding = {
        findingId: "f-2",
        fingerprint: "fp-prohibited-leak",
        severity: "CRITICAL",
        violationType: "FALSE_POSITIVE_ALLOW",
        title: "Prohibited Category Allowed (Gift Cards)",
        description: "Policy allowed item 'proh-card-1' in prohibited category 'Gift Cards'.",
        candidateCart: {
          currency: "USD",
          items: [
            { sku: "proh-card-1", title: "Digital Card", category: "Gift Cards", unitPriceMinor: 5000, quantity: 1 },
          ],
        },
        expectedOutcome: {
          decision: "DENY",
          reasonCode: "PROHIBITED_CATEGORY",
        },
        actualOutcome: {
          decision: "ALLOW",
          primaryReasonCode: "ALL_RULES_PASSED",
          reasonCodes: ["ALL_RULES_PASSED"],
          ruleTrace: [],
        },
        reproduction: {
          candidateIndex: 5,
          summary: "Evaluate cart with gift card",
        },
        resolutionStatus: "UNRESOLVED",
      };

      const repair = proposePolicyRepair({
        originalPolicy: samplePolicyV1,
        findings: [finding],
        sourceVersionId: "v1-uuid",
      });

      expect(repair.repairedPolicy.prohibitedCategories).toContain("Gift Cards");
      expect(repair.addressedFindings[0]?.remedyAction).toContain("Added 'Gift Cards' to prohibitedCategories");
      expect(repair.diff.diffs.some((d) => d.field === "prohibitedCategories")).toBe(true);
    });

    it("proposes allowing compliant category when compliant item was unexpectedly denied", () => {
      const finding: VerificationFinding = {
        findingId: "f-3",
        fingerprint: "fp-false-negative",
        severity: "HIGH",
        violationType: "FALSE_NEGATIVE_DENY",
        title: "Compliant Purchase Unexpectedly Denied (PROHIBITED_CATEGORY)",
        description: "Policy unexpectedly denied a fully compliant purchase that satisfies all intent criteria.",
        candidateCart: {
          currency: "USD",
          items: [
            { sku: "peri-1", title: "USB Mouse", category: "Peripherals", unitPriceMinor: 3000, quantity: 1 },
          ],
        },
        expectedOutcome: {
          decision: "ALLOW",
          reasonCode: "ALL_RULES_PASSED",
        },
        actualOutcome: {
          decision: "DENY",
          primaryReasonCode: "UNKNOWN_CATEGORY",
          reasonCodes: ["UNKNOWN_CATEGORY"],
          ruleTrace: [],
        },
        reproduction: {
          candidateIndex: 22,
          summary: "Evaluate cart with peripherals",
        },
        resolutionStatus: "UNRESOLVED",
      };

      const repair = proposePolicyRepair({
        originalPolicy: samplePolicyV1,
        findings: [finding],
        sourceVersionId: "v1-uuid",
      });

      expect(repair.repairedPolicy.allowedCategories).toContain("Peripherals");
      expect(repair.addressedFindings[0]?.remedyAction).toContain("Added 'Peripherals' to allowedCategories");
      expect(repair.diff.diffs.some((d) => d.field === "allowedCategories")).toBe(true);
    });
  });
});
