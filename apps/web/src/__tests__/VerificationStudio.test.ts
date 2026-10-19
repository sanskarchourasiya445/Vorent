import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { VerificationConfigForm } from "../components/verification/VerificationConfigForm";
import { VerificationCoverageCard } from "../components/verification/VerificationCoverageCard";
import { FindingsList } from "../components/verification/FindingsList";
import { FindingDetailModal } from "../components/verification/FindingDetailModal";
import {
  executeVerificationRun,
  AVAILABLE_POLICIES,
} from "../api/verificationService";
import { ReasonCode } from "@warrant/contracts";
import type { VerificationFinding } from "../types/verification";

describe("Verification Studio Frontend Suite", () => {
  // Test 1: Configuration Form Rendering and Defaults
  it("1. renders verification configuration form with policy options and search dimensions", () => {
    const html = renderToStaticMarkup(
      React.createElement(VerificationConfigForm, {
        policies: AVAILABLE_POLICIES,
        onStartRun: () => {},
        isRunning: false,
      }),
    );

    expect(html).toContain("Verification Run Configuration");
    expect(html).toContain("Engineering Hardware &amp; Technical Books Policy");
    expect(html).toContain("Price Boundary Probing");
    expect(html).toContain("Quantity Splitting &amp; Bundles");
    expect(html).toContain("Evidence Freshness &amp; Quotes");
    expect(html).toContain("250 Candidates");
    expect(html).toContain("Start Verification Run");
  });

  it("2. disables configuration controls when verification run is in progress", () => {
    const html = renderToStaticMarkup(
      React.createElement(VerificationConfigForm, {
        policies: AVAILABLE_POLICIES,
        onStartRun: () => {},
        isRunning: true,
      }),
    );

    expect(html).toContain("disabled");
    expect(html).toContain("Running Verification...");
  });

  // Test 2: Coverage Card States
  it("3. renders IDLE state when verification engine has not yet run", () => {
    const html = renderToStaticMarkup(
      React.createElement(VerificationCoverageCard, {
        status: "IDLE",
        counterexampleCount: 0,
        unresolvedCount: 0,
      }),
    );

    expect(html).toContain("Verification Engine in Standby");
    expect(html).toContain("Configure search dimensions and candidate exploration budget");
  });

  it("4. renders RUNNING status with progress indication", () => {
    const html = renderToStaticMarkup(
      React.createElement(VerificationCoverageCard, {
        status: "RUNNING",
        counterexampleCount: 0,
        unresolvedCount: 0,
      }),
    );

    expect(html).toContain("VERIFICATION RUNNING");
    expect(html).toContain('role="status"');
  });

  it("5. renders COMPLETED exhaustive completion without unsearched space disclaimer", () => {
    const html = renderToStaticMarkup(
      React.createElement(VerificationCoverageCard, {
        status: "COMPLETED",
        coverage: {
          totalCandidatesEvaluated: 184,
          candidateBudget: 250,
          isExhaustive: true,
          dimensionsCovered: ["PRICE_BOUNDARIES", "QUANTITY_SPLITS"],
          evaluatedAt: "2026-10-19T11:45:00Z",
          durationMs: 380,
        },
        counterexampleCount: 1,
        unresolvedCount: 0,
      }),
    );

    expect(html).toContain("EXHAUSTIVE RUN COMPLETE");
    expect(html).toContain("184 / 250");
    expect(html).toContain("Exhaustive");
    expect(html).toContain("100% of candidate space");
    // Does NOT contain partial exploration disclaimer
    expect(html).not.toContain("Search Budget Exhausted: Partial Exploration Disclaimer");
  });

  it("6. renders BUDGET_EXHAUSTED with explicit partial exploration disclaimer", () => {
    const html = renderToStaticMarkup(
      React.createElement(VerificationCoverageCard, {
        status: "BUDGET_EXHAUSTED",
        coverage: {
          totalCandidatesEvaluated: 100,
          candidateBudget: 100,
          isExhaustive: false,
          dimensionsCovered: ["PRICE_BOUNDARIES"],
          evaluatedAt: "2026-10-19T11:45:00Z",
          durationMs: 250,
        },
        counterexampleCount: 1,
        unresolvedCount: 1,
        isDemoFixture: true,
      }),
    );

    expect(html).toContain("BUDGET EXHAUSTED (PARTIAL)");
    expect(html).toContain("Budget Bound");
    expect(html).toContain("Search Budget Exhausted: Partial Exploration Disclaimer");
    expect(html).toContain("does not prove universal safety");
    expect(html).toContain("Demo Fixture — Illustrative Verification Run");
  });

  it("7. renders FAILED state with error message", () => {
    const html = renderToStaticMarkup(
      React.createElement(VerificationCoverageCard, {
        status: "FAILED",
        counterexampleCount: 0,
        unresolvedCount: 0,
        errorMessage: "Network connection refused by API server",
      }),
    );

    expect(html).toContain("RUN FAILED");
    expect(html).toContain("Network connection refused by API server");
  });

  // Test 3: Findings List and Filtering
  const mockFinding: VerificationFinding = {
    id: "fnd_test_01",
    title: "Cart Limit Overflow via Unit Stacking",
    summary: "3 units priced at $220.00 pass per-item threshold but exceed aggregate limit.",
    classification: "COUNTEREXAMPLE",
    expectedDecision: "DENY",
    actualResult: {
      decision: "DENY",
      primaryReasonCode: ReasonCode.CART_TOTAL_LIMIT_EXCEEDED,
      reasonCodes: [ReasonCode.CART_TOTAL_LIMIT_EXCEEDED],
      ruleTrace: [],
      metadata: {
        evaluatorVersion: "1.0.0",
        itemCount: 3,
        cartTotalMinor: 66000,
        currency: "USD",
      },
    },
    candidateCart: {
      currency: "USD",
      items: [
        {
          sku: "HW-MONITOR-4K",
          title: "4K Developer Monitor",
          category: "Hardware",
          unitPriceMinor: 22000,
          quantity: 3,
          currency: "USD",
        },
      ],
    },
    reproductionNotes: ["Add 3 units of HW-MONITOR-4K."],
  };

  const mockUnresolvedFinding: VerificationFinding = {
    id: "fnd_test_02",
    title: "Unmapped Taxonomy Category in Quote",
    summary: "Candidate item has unverified category; held in fail-closed review.",
    classification: "UNRESOLVED_AMBIGUITY",
    expectedDecision: "REVIEW",
    actualResult: {
      decision: "REVIEW",
      primaryReasonCode: ReasonCode.UNKNOWN_CATEGORY,
      reasonCodes: [ReasonCode.UNKNOWN_CATEGORY],
      ruleTrace: [],
      metadata: {
        evaluatorVersion: "1.0.0",
        itemCount: 1,
        cartTotalMinor: 15000,
        currency: "USD",
      },
    },
    candidateCart: {
      currency: "USD",
      items: [
        {
          sku: "OFF-CHAIR-ERGO",
          title: "Ergonomic Chair",
          category: "Office / Unknown",
          unitPriceMinor: 15000,
          quantity: 1,
          currency: "USD",
        },
      ],
    },
    reproductionNotes: ["Submit unmapped category 'Office / Unknown'."],
  };

  it("8. renders findings list distinguishing Counterexamples from Unresolved Cases", () => {
    const html = renderToStaticMarkup(
      React.createElement(FindingsList, {
        findings: [mockFinding, mockUnresolvedFinding],
        onSelectFinding: () => {},
        totalEvaluated: 184,
      }),
    );

    expect(html).toContain("Verification Findings (2)");
    expect(html).toContain("Counterexample");
    expect(html).toContain("Unresolved Ambiguity");
    expect(html).toContain("Cart Limit Overflow via Unit Stacking");
    expect(html).toContain("Unmapped Taxonomy Category in Quote");
    expect(html).toContain("CART_TOTAL_LIMIT_EXCEEDED");
    expect(html).toContain("UNKNOWN_CATEGORY");
  });

  it("9. renders clean empty state when 0 findings are detected", () => {
    const html = renderToStaticMarkup(
      React.createElement(FindingsList, {
        findings: [],
        onSelectFinding: () => {},
        totalEvaluated: 184,
      }),
    );

    expect(html).toContain("No Counterexamples Detected in Explored Bounds");
    expect(html).toContain("Zero policy violations or unresolvable ambiguities were discovered");
  });

  // Test 4: Finding Detail Modal with Embedded DecisionResultCard
  it("10. renders FindingDetailModal with candidate cart breakdown, reproduction notes, and embedded DecisionResultCard", () => {
    const html = renderToStaticMarkup(
      React.createElement(FindingDetailModal, {
        finding: mockFinding,
        policyVersionId: "pol_v1_books_hardware",
        policyHash: "a4f912b7e53c4d89a290bc9812efaa43217d8900fe5b81a91e5d7a810b45cd2e",
        onClose: () => {},
      }),
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain("Confirmed Counterexample (Policy Loophole)");
    expect(html).toContain("Authoritative Gate Outcome");
    // Verifies embedded DecisionResultCard renders inside finding view
    expect(html).toContain("Transaction Refused by Gate");
    expect(html).toContain("CART_TOTAL_LIMIT_EXCEEDED");
    // Verifies candidate cart table
    expect(html).toContain("HW-MONITOR-4K");
    expect(html).toContain("4K Developer Monitor");
    expect(html).toContain("$220.00");
    expect(html).toContain("$660.00 USD");
    // Verifies reproduction steps
    expect(html).toContain("Deterministic Reproduction Steps");
    expect(html).toContain("Add 3 units of HW-MONITOR-4K.");
    // Verifies copy button
    expect(html).toContain("Copy Candidate Payload (JSON)");
  });

  // Test 5: End-to-end Verification API Service & Adapter
  it("11. executeVerificationRun offline demo mode produces isolated simulation fixture labeled isDemoFixture", async () => {
    const result = await executeVerificationRun(
      {
        policyVersionId: "pol_v1_books_hardware",
        dimensions: ["PRICE_BOUNDARIES", "QUANTITY_SPLITS"],
        candidateBudget: 250,
      },
      { useDemoSimulation: true },
    );

    expect(result.status).toBe("COMPLETED");
    expect(result.coverage.isExhaustive).toBe(true);
    expect(result.coverage.totalCandidatesEvaluated).toBe(184);
    expect(result.findings.length).toBeGreaterThan(0);
    expect(result.isDemoFixture).toBe(true);
    expect(result.isLiveApi).toBe(false);

    const counterexample = result.findings.find((f) => f.classification === "COUNTEREXAMPLE");
    expect(counterexample).toBeDefined();
    expect(counterexample?.actualResult.decision).toBe("DENY");
  });

  it("12. executeVerificationRun handles budget bound exhaustion correctly", async () => {
    const result = await executeVerificationRun(
      {
        policyVersionId: "pol_v1_books_hardware",
        dimensions: ["PRICE_BOUNDARIES"],
        candidateBudget: 100,
      },
      { useDemoSimulation: true, simulateBudgetExhaustion: true },
    );

    expect(result.status).toBe("BUDGET_EXHAUSTED");
    expect(result.coverage.isExhaustive).toBe(false);
    expect(result.coverage.totalCandidatesEvaluated).toBe(100);
    expect(result.isDemoFixture).toBe(true);
  });

  it("13. adaptVerificationReportToRunResult correctly adapts shared VerificationReport contract", async () => {
    const { adaptVerificationReportToRunResult } = await import("../api/verificationService");
    const { VerificationReportSchema } = await import("@warrant/contracts");

    const rawReport = {
      runId: "rep_123",
      status: "COMPLETED" as const,
      exhausted: true,
      stopReason: "DOMAIN_EXHAUSTED" as const,
      domainVersion: "1.0.0",
      totalCandidatesExplored: 150,
      searchSpaceEstimatedSize: 150,
      findingCount: 1,
      findings: [
        {
          findingId: "fnd_01",
          fingerprint: "0123456789abcdef0123456789abcdef",
          severity: "HIGH" as const,
          violationType: "FALSE_POSITIVE_ALLOW" as const,
          title: "Prohibited Category Bypass via Variant SKU",
          description: "Item with prohibited category was permitted by loose category rule.",
          candidateCart: {
            currency: "USD",
            items: [
              {
                sku: "PROH-ITEM-1",
                title: "Tactical Laser Pointer",
                category: "Weapons / Lasers",
                unitPriceMinor: 4500,
                quantity: 1,
                currency: "USD",
              },
            ],
          },
          expectedOutcome: {
            decision: "DENY" as const,
            reasonCode: ReasonCode.PROHIBITED_CATEGORY,
          },
          actualOutcome: {
            decision: "ALLOW" as const,
            primaryReasonCode: ReasonCode.ALL_RULES_PASSED,
            reasonCodes: [ReasonCode.ALL_RULES_PASSED],
          },
          reproduction: {
            candidateIndex: 42,
            summary: "Replay candidate 42 against active policy",
          },
          policyVersionId: "pol_v1_books_hardware",
          policyHash: "a4f912b7e53c4d89a290bc9812efaa43217d8900fe5b81a91e5d7a810b45cd2e",
          resolutionStatus: "UNRESOLVED" as const,
          discoveredAt: "2026-10-19T11:50:00Z",
        },
      ],
      unresolvedCount: 0,
      durationMs: 340,
      summary: "Domain exhausted with 1 counterexample discovered",
    };

    const validReport = VerificationReportSchema.parse(rawReport);
    const adapted = adaptVerificationReportToRunResult(validReport, ["PRICE_BOUNDARIES"], true);

    expect(adapted.runId).toBe("rep_123");
    expect(adapted.status).toBe("COMPLETED");
    expect(adapted.coverage.isExhaustive).toBe(true);
    expect(adapted.coverage.totalCandidatesEvaluated).toBe(150);
    expect(adapted.findings.length).toBe(1);
    expect(adapted.findings[0].classification).toBe("COUNTEREXAMPLE");
    expect(adapted.findings[0].expectedDecision).toBe("DENY");
    expect(adapted.findings[0].actualResult.decision).toBe("ALLOW");
    expect(adapted.isDemoFixture).toBe(false);
    expect(adapted.isLiveApi).toBe(true);
    expect(adapted.stopReason).toBe("DOMAIN_EXHAUSTED");
  });

  // Test 6: Live API Integration, Network, and Schema Validation Error Handling
  it("14. executeVerificationRun handles successful live API response from POST /api/verification/run", async () => {
    const originalFetch = globalThis.fetch;
    const mockReport = {
      runId: "live_run_999",
      status: "COMPLETED" as const,
      exhausted: true,
      stopReason: "DOMAIN_EXHAUSTED" as const,
      domainVersion: "1.0.0",
      totalCandidatesExplored: 200,
      searchSpaceEstimatedSize: 200,
      findingCount: 0,
      findings: [],
      unresolvedCount: 0,
      durationMs: 410,
      summary: "Live verification completed cleanly with 0 counterexamples.",
    };

    globalThis.fetch = async (url, options) => {
      expect(String(url)).toContain("/api/verification/run");
      expect(options?.method).toBe("POST");
      return new Response(JSON.stringify(mockReport), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    try {
      const result = await executeVerificationRun({
        policyVersionId: "pol_v1_books_hardware",
        dimensions: ["PRICE_BOUNDARIES"],
        candidateBudget: 200,
      });

      expect(result.runId).toBe("live_run_999");
      expect(result.status).toBe("COMPLETED");
      expect(result.isLiveApi).toBe(true);
      expect(result.isDemoFixture).toBe(false);
      expect(result.coverage.totalCandidatesEvaluated).toBe(200);
      expect(result.counterexampleCount).toBe(0);
      expect(result.summary).toContain("Live verification completed");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("15. executeVerificationRun surfaces HTTP 404 without faking successful live results", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return new Response("Not Found", { status: 404 });
    };

    try {
      await expect(
        executeVerificationRun({
          policyVersionId: "pol_v1_books_hardware",
          dimensions: ["PRICE_BOUNDARIES"],
          candidateBudget: 100,
        }),
      ).rejects.toThrow("Backend route not found: POST");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("16. executeVerificationRun surfaces HTTP 400 validation error from backend", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      return new Response(JSON.stringify({ message: "searchSpace.categories must not be empty" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    };

    try {
      await expect(
        executeVerificationRun({
          policyVersionId: "pol_v1_books_hardware",
          dimensions: ["PRICE_BOUNDARIES"],
          candidateBudget: 100,
        }),
      ).rejects.toThrow("Backend request validation failed (HTTP 400)");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("17. executeVerificationRun surfaces network failure without inventing data", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => {
      throw new TypeError("Failed to fetch (ECONNREFUSED)");
    };

    try {
      await expect(
        executeVerificationRun({
          policyVersionId: "pol_v1_books_hardware",
          dimensions: ["PRICE_BOUNDARIES"],
          candidateBudget: 100,
        }),
      ).rejects.toThrow("Network failure connecting to");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("18. buildVerificationRequest generates contract-valid VerificationRequest matching VerificationRequestSchema", async () => {
    const { buildVerificationRequest } = await import("../api/verificationService");
    const { VerificationRequestSchema } = await import("@warrant/contracts");

    const request = buildVerificationRequest(
      AVAILABLE_POLICIES[0],
      {
        policyVersionId: "pol_v1_books_hardware",
        dimensions: ["PRICE_BOUNDARIES", "CATEGORY_EVASION", "QUANTITY_SPLITS"],
        candidateBudget: 350,
      },
      5000,
    );

    // Assert that the generated request strictly validates against VerificationRequestSchema
    const validated = VerificationRequestSchema.parse(request);
    expect(validated.policy.schemaVersion).toBe("1.0");
    expect(validated.searchSpace.categories.length).toBeGreaterThan(0);
    expect(validated.searchSpace.pricePointsMinor.length).toBeGreaterThan(0);
    expect(validated.config?.maxCandidates).toBe(350);
  });
});
