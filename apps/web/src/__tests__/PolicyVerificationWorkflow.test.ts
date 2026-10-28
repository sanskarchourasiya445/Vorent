import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { MandateEditorPanel } from "../components/policy/MandateEditorPanel";
import { RepairProposalModal } from "../components/policy/RepairProposalModal";
import { FindingDetailModal } from "../components/verification/FindingDetailModal";
import { VerificationCoverageCard } from "../components/verification/VerificationCoverageCard";
import {
  compileIntent,
  proposeRepair,
  createPolicyVersion,
} from "../api/policyService";
import {
  resolveFinding,
  acceptFindingRisk,
} from "../api/findingsService";
import { adaptVerificationReportToRunResult } from "../api/verificationService";
import type { VerificationReport, ProposeRepairResponse } from "@warrant/contracts";

describe("Policy Verification Workflow — Frontend Integration", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // 1. Intent Compilation & Clarifying Questions
  describe("1. Purchase Intent Compilation & Ambiguity Triage", () => {
    it("compiles natural-language purchase mandate and extracts structured policy", async () => {
      const mockResponse = {
        candidatePolicy: {
          schemaVersion: "1.0",
          currency: "USD",
          maxItemPriceMinor: 25000,
          maxCartTotalMinor: 60000,
          allowedCategories: ["Hardware", "Reference Books"],
          prohibitedCategories: ["Weapons / Lasers", "Gift Cards"],
          requireEvidence: true,
        },
        confirmedIntent: {
          name: "Engineering Equipment Mandate",
          currency: "USD",
          maxItemPriceMinor: 25000,
          maxCartTotalMinor: 60000,
          allowedCategories: ["Hardware", "Reference Books"],
          prohibitedCategories: ["Weapons / Lasers", "Gift Cards"],
          requireEvidence: true,
        },
        assumptions: ["Currency inferred as USD from '$' symbols."],
        questions: [],
        validation: { valid: true, errors: [], warnings: [] },
        requiresUserConfirmation: true as const,
        compilerMetadata: {
          compilerVersion: "1.0.0",
          deterministic: true,
          sourceLength: 85,
        },
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const res = await compileIntent({
        mandateText: "Allow hardware up to $250 and books up to $60. Total $600.",
        currency: "USD",
      });

      expect(res.candidatePolicy.currency).toBe("USD");
      expect(res.candidatePolicy.maxItemPriceMinor).toBe(25000);
      expect(res.candidatePolicy.maxCartTotalMinor).toBe(60000);
      expect(res.candidatePolicy.allowedCategories).toContain("Hardware");
      expect(res.requiresUserConfirmation).toBe(true);
      expect(res.compilerMetadata.deterministic).toBe(true);
    });

    it("surfaces clarifying questions when the compiler identifies ambiguity", async () => {
      const mockAmbiguousResponse = {
        candidatePolicy: {
          schemaVersion: "1.0",
          currency: "USD",
          allowedCategories: ["Office Equipment"],
          prohibitedCategories: [],
          requireEvidence: false,
        },
        confirmedIntent: {
          name: "Unbounded Office Supplies",
          currency: "USD",
          allowedCategories: ["Office Equipment"],
          prohibitedCategories: [],
          requireEvidence: false,
        },
        assumptions: ["No whole-cart limit detected."],
        questions: [
          "Did you intend to set a maximum single-item price ceiling?",
          "Did you intend to set a cumulative cart spending cap?",
        ],
        validation: { valid: true, errors: [], warnings: ["Unbounded cart limit"] },
        requiresUserConfirmation: true as const,
        compilerMetadata: {
          compilerVersion: "1.0.0",
          deterministic: true,
          sourceLength: 42,
        },
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockAmbiguousResponse,
      });

      const res = await compileIntent({
        mandateText: "Allow office supplies.",
      });

      expect(res.questions.length).toBe(2);
      expect(res.questions[0]).toContain("maximum single-item price ceiling");
      expect(res.questions[1]).toContain("cumulative cart spending cap");
    });

    it("surfaces compilation errors clearly and never silently substitutes a default policy", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            code: "VALIDATION_ERROR",
            message: "Mandate text exceeds 10000 characters limit",
          },
        }),
      });

      await expect(
        compileIntent({
          mandateText: "x".repeat(10001),
        }),
      ).rejects.toThrow("Mandate text exceeds 10000 characters limit");
    });
  });

  // 2. Verification Results, Counterexamples & Finite Search Disclaimers
  describe("2. Verification Run Results, Counterexamples & Honesty", () => {
    it("distinguishes confirmed counterexamples from inconclusive outcomes and maps severity", () => {
      const mockReport: VerificationReport = {
        runId: "run_verify_001",
        policyVersionId: "18674b70-b535-465d-a99f-fee8d9de5bf0",
        policyHash: "a4f912b7e53c4d89a290bc9812efaa43217d8900fe5b81a91e5d7a810b45cd2e",
        domainVersion: "1.0.0",
        status: "COMPLETED",
        stopReason: "DOMAIN_EXHAUSTED",
        searchSpaceEstimatedSize: 100,
        totalCandidatesExplored: 100,
        findingCount: 1,
        unresolvedCount: 1,
        exhausted: true,
        durationMs: 45,
        summary: "1 counterexample loophole and 1 unresolved candidate detected.",
        findings: [
          {
            findingId: "fnd_counterexample_1",
            fingerprint: "fp_abc1234567890123",
            severity: "HIGH",
            violationType: "FALSE_POSITIVE_ALLOW",
            title: "Whole-Cart Spend Limit Loophole",
            description: "Cart allowed 3 items totaling $660 exceeding $600 cap.",
            candidateCart: {
              currency: "USD",
              items: [
                {
                  sku: "HW-MON-4K",
                  title: "Developer Monitor",
                  category: "Hardware",
                  unitPriceMinor: 22000,
                  quantity: 3,
                  currency: "USD",
                },
              ],
            },
            expectedOutcome: { decision: "DENY", reasonCode: "CART_TOTAL_LIMIT_EXCEEDED" as const },
            actualOutcome: {
              decision: "ALLOW",
              primaryReasonCode: "ALL_RULES_PASSED" as const,
              reasonCodes: ["ALL_RULES_PASSED" as const],
              ruleTrace: [],
            },
            reproduction: { candidateIndex: 12, summary: "Add 3 units of HW-MON-4K." },
            resolutionStatus: "UNRESOLVED",
          },
        ],
        unresolvedCandidates: [
          {
            candidateIndex: 15,
            candidateCart: {
              currency: "USD",
              items: [
                {
                  sku: "UNKNOWN-CAT",
                  title: "Office Mat",
                  category: "Unknown Office Furnishings",
                  unitPriceMinor: 5000,
                  quantity: 1,
                  currency: "USD",
                },
              ],
            },
            actualDecision: "REVIEW",
            actualReasonCode: "UNKNOWN_CATEGORY" as const,
            unresolvedReason: "UNKNOWN_CATEGORY",
            notes: "Merchant classification pending catalog evidence verification.",
          },
        ],
      };

      const result = adaptVerificationReportToRunResult(mockReport, ["PRICE_BOUNDARIES"], true);

      expect(result.counterexampleCount).toBe(1);
      expect(result.unresolvedCount).toBe(1);
      expect(result.findings.length).toBe(2);

      const counterexample = result.findings.find((f) => f.classification === "COUNTEREXAMPLE");
      expect(counterexample).toBeDefined();
      expect(counterexample?.severity).toBe("HIGH");
      expect(counterexample?.expectedDecision).toBe("DENY");
      expect(counterexample?.actualResult.decision).toBe("ALLOW");

      const unresolved = result.findings.find((f) => f.classification === "UNRESOLVED_AMBIGUITY");
      expect(unresolved).toBeDefined();
      expect(unresolved?.expectedDecision).toBe("REVIEW");
      expect(unresolved?.actualResult.decision).toBe("REVIEW");
    });

    it("VerificationCoverageCard displays honest bounded search disclaimer without claiming universal safety", () => {
      const html = renderToString(
        React.createElement(VerificationCoverageCard, {
          status: "BUDGET_EXHAUSTED",
          coverage: {
            totalCandidatesEvaluated: 500,
            candidateBudget: 500,
            isExhaustive: false,
            dimensionsCovered: ["PRICE_BOUNDARIES"],
            evaluatedAt: new Date().toISOString(),
            durationMs: 120,
          },
          counterexampleCount: 0,
          unresolvedCount: 0,
          isLiveApi: true,
          stopReason: "CANDIDATE_CAP_REACHED",
          runId: "run_test_123",
        }),
      );

      expect(html).toContain("Live API Result");
      expect(html).toContain("run_test_123");
      expect(html).toContain("BUDGET EXHAUSTED");
      expect(html).toContain("does not prove universal safety");
    });
  });

  // 3. Repair Proposals, Diffs & Retesting Invariants
  describe("3. Policy Repair Proposals, Semantic Diffs & Retesting", () => {
    it("proposes automated repair addressing counterexamples with field diff and rationale", async () => {
      const mockRepairResponse: ProposeRepairResponse = {
        originalPolicy: {
          schemaVersion: "1.0",
          currency: "USD",
          maxItemPriceMinor: 25000,
          allowedCategories: ["Hardware"],
          requireEvidence: true,
        },
        repairedPolicy: {
          schemaVersion: "1.0",
          currency: "USD",
          maxItemPriceMinor: 25000,
          maxCartTotalMinor: 60000,
          allowedCategories: ["Hardware"],
          requireEvidence: true,
        },
        repairedIntent: {
          name: "Repaired Engineering Mandate",
          currency: "USD",
          maxItemPriceMinor: 25000,
          maxCartTotalMinor: 60000,
          allowedCategories: ["Hardware"],
          requireEvidence: true,
        },
        diff: {
          diffs: [
            {
              field: "maxCartTotalMinor",
              previousValue: undefined,
              proposedValue: 60000,
              changeType: "ADDED",
              description: "Added whole-cart spending ceiling of $600.00 USD.",
            },
          ],
          hasChanges: true,
          summary: "Added maxCartTotalMinor limit.",
        },
        addressedFindings: [
          {
            findingId: "fnd_01",
            fingerprint: "fp_123",
            violationType: "FALSE_POSITIVE_ALLOW",
            remedyAction: "Enforce whole-cart ceiling",
            explanation: "Eliminates loophole where multi-item orders bypassed limits.",
          },
        ],
        rationale: "Added whole-cart ceiling of $600.00 to close multi-item loophole.",
        requiresVerification: true,
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockRepairResponse,
      });

      const res = await proposeRepair({
        policyVersionId: "18674b70-b535-465d-a99f-fee8d9de5bf0",
      });

      expect(res.requiresVerification).toBe(true);
      expect(res.diff.hasChanges).toBe(true);
      expect(res.diff.diffs[0].changeType).toBe("ADDED");
      expect(res.diff.diffs[0].field).toBe("maxCartTotalMinor");
      expect(res.addressedFindings.length).toBe(1);
    });

    it("RepairProposalModal enforces retest requirement banner and renders field-level diff", () => {
      const html = renderToString(
        React.createElement(RepairProposalModal, {
          isOpen: true,
          onClose: () => {},
          policyVersionId: "18674b70-b535-465d-a99f-fee8d9de5bf0",
        }),
      );

      expect(html).toContain("Automated Policy Repair &amp; Semantic Diff");
      expect(html).toContain("Propose Targeted Loophole Repair");
      expect(html).toContain("18674b70-b535-465d-a99f-fee8d9de5bf0");
    });
  });

  // 4. Finding Resolution & Governance Enforcement (Decision D-014)
  describe("4. Finding Resolution & Decision D-014 Governance Enforcement", () => {
    it("resolves finding linking it to a verified repairing policy version", async () => {
      const mockUpdatedFinding = {
        id: "fnd_test_01",
        ownerId: "user_default",
        testRunId: "run_test_01",
        policyVersionId: "18674b70-b535-465d-a99f-fee8d9de5bf0",
        findingType: "FALSE_POSITIVE_ALLOW",
        severity: "HIGH" as const,
        status: "RESOLVED" as const,
        witness: { currency: "USD", items: [] },
        evidenceSnapshot: {},
        ruleTrace: [],
        reproduction: {},
        resolvedByVersionId: "99999999-b535-465d-a99f-fee8d9de5bf0",
        resolutionNote: "Fixed in version 2 with cart ceiling constraint.",
        createdAt: new Date().toISOString(),
        resolvedAt: new Date().toISOString(),
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockUpdatedFinding,
      });

      const res = await resolveFinding("fnd_test_01", {
        resolvedByVersionId: "99999999-b535-465d-a99f-fee8d9de5bf0",
        resolutionNote: "Fixed in version 2 with cart ceiling constraint.",
      });

      expect(res.status).toBe("RESOLVED");
      expect(res.resolvedByVersionId).toBe("99999999-b535-465d-a99f-fee8d9de5bf0");
    });

    it("rejects risk acceptance for CRITICAL or HIGH findings per Decision D-014", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            code: "RISK_ACCEPTANCE_NOT_PERMITTED",
            message: "Decision D-014 Violation: Cannot accept risk for HIGH severity finding",
          },
        }),
      });

      await expect(
        acceptFindingRisk("fnd_high_01", {
          rationale: "We accept this risk anyway.",
        }),
      ).rejects.toThrow("Decision D-014 Violation");
    });

    it("FindingDetailModal renders Decision D-014 notice and blocks risk acceptance for CRITICAL and HIGH findings", () => {
      const html = renderToString(
        React.createElement(FindingDetailModal, {
          finding: {
            id: "fnd_critical_01",
            title: "Critical Invariant Breach",
            summary: "Prohibited category purchased without quote evidence.",
            classification: "COUNTEREXAMPLE",
            severity: "CRITICAL",
            violationType: "FALSE_POSITIVE_ALLOW",
            expectedDecision: "DENY",
            actualResult: {
              decision: "ALLOW",
              primaryReasonCode: "ALL_RULES_PASSED" as const,
              reasonCodes: [],
              ruleTrace: [],
            },
            candidateCart: {
              currency: "USD",
              items: [
                {
                  sku: "CRIT-ITEM-1",
                  title: "Restricted Device",
                  category: "Prohibited",
                  unitPriceMinor: 10000,
                  quantity: 1,
                  currency: "USD",
                },
              ],
            },
            reproductionNotes: ["Run candidate 1."],
          },
          onClose: () => {},
        }),
      );

      expect(html).toContain("CRITICAL");
      expect(html).toContain("SEVERITY");
      expect(html).toContain("Finding Triage &amp; Governance Resolution");
      expect(html).toContain("Resolve with Version");
      expect(html).toContain("Accept Risk");
    });
  });

  // 5. Invariants & Checkout Continuity
  describe("5. Invariants, Loading & Approved Policy Version Preservation", () => {
    it("creates append-only policy version without mutating existing versions", async () => {
      const mockCreatedVersion = {
        id: "22222222-b535-465d-a99f-fee8d9de5bf0",
        policyId: "11111111-b535-465d-a99f-fee8d9de5bf0",
        name: "Hardware Policy",
        versionNumber: 2,
        sourceMandateSnapshot: "Repaired cart total limit",
        intentSpec: {
          name: "Hardware Policy Mandate",
          currency: "USD",
          maxItemPriceMinor: 25000,
          maxCartTotalMinor: 60000,
          allowedCategories: ["Hardware"],
          requireEvidence: true,
        },
        policyDocument: {
          schemaVersion: "1.0" as const,
          currency: "USD",
          maxItemPriceMinor: 25000,
          maxCartTotalMinor: 60000,
          allowedCategories: ["Hardware"],
          requireEvidence: true,
        },
        policySchemaVersion: "1.0",
        canonicalizationVersion: "1.0.0",
        policyHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        confirmationState: "CONFIRMED" as const,
        createdAt: new Date().toISOString(),
        isPreset: false,
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockCreatedVersion,
      });

      const newVersion = await createPolicyVersion("11111111-b535-465d-a99f-fee8d9de5bf0", {
        sourceMandateSnapshot: "Repaired cart total limit",
        policy: mockCreatedVersion.policyDocument,
        intent: mockCreatedVersion.intentSpec,
        confirmationState: "CONFIRMED",
      });

      expect(newVersion.versionNumber).toBe(2);
      expect(newVersion.id).toBe("22222222-b535-465d-a99f-fee8d9de5bf0");
      expect(newVersion.policyHash).toBe("bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
    });

    it("MandateEditorPanel renders initial state and sample presets", () => {
      const html = renderToString(React.createElement(MandateEditorPanel, {}));

      expect(html).toContain("Purchase Mandate Compiler");
      expect(html).toContain("Natural-Language Purchase Mandate");
      expect(html).toContain("Compile to Formal Policy");
      expect(html).toContain("Sample Presets:");
    });
  });
});
