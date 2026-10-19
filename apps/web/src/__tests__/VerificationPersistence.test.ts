import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import {
  fetchSavedVerificationRuns,
  fetchSavedVerificationReport,
} from "../api/persistenceService";
import { SavedRunsBrowser } from "../components/verification/SavedRunsBrowser";
import { VerificationCoverageCard } from "../components/verification/VerificationCoverageCard";
import { ReasonCode } from "@warrant/contracts";

describe("Verification Persistence Frontend Suite", () => {
  it("1. fetchSavedVerificationRuns returns UNAVAILABLE when backend route is not mounted (404)", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("Not Found", { status: 404 });

    try {
      const result = await fetchSavedVerificationRuns();
      expect(result.state).toBe("UNAVAILABLE");
      if (result.state === "UNAVAILABLE") {
        expect(result.message).toContain("is not yet mounted");
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("2. fetchSavedVerificationRuns returns UNAVAILABLE when database is standby (503)", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("Service Unavailable", { status: 503 });

    try {
      const result = await fetchSavedVerificationRuns();
      expect(result.state).toBe("UNAVAILABLE");
      if (result.state === "UNAVAILABLE") {
        expect(result.message).toContain("PostgreSQL database is in standby mode");
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("3. fetchSavedVerificationRuns returns EMPTY when 0 saved runs exist", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    try {
      const result = await fetchSavedVerificationRuns();
      expect(result.state).toBe("EMPTY");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("4. fetchSavedVerificationRuns returns READY with run summaries", async () => {
    const mockRuns = [
      {
        runId: "run_db_001",
        policyVersionId: "pol_v1_books_hardware",
        policyName: "Engineering Hardware & Technical Books Policy",
        policyHash: "a4f912b7e53c4d89a290bc9812efaa43217d8900fe5b81a91e5d7a810b45cd2e",
        status: "COMPLETED",
        stopReason: "DOMAIN_EXHAUSTED",
        exhausted: true,
        totalCandidatesExplored: 184,
        findingCount: 0,
        unresolvedCount: 0,
        durationMs: 340,
        createdAt: "2026-10-19T10:00:00Z",
        summary: "No counterexamples detected in explored bounds.",
      },
    ];

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ data: mockRuns }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    try {
      const result = await fetchSavedVerificationRuns();
      expect(result.state).toBe("READY");
      if (result.state === "READY") {
        expect(result.data.length).toBe(1);
        expect(result.data[0].runId).toBe("run_db_001");
        expect(result.data[0].exhausted).toBe(true);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("5. fetchSavedVerificationReport loads report and marks as isSavedRun", async () => {
    const mockReport = {
      runId: "run_db_001",
      status: "COMPLETED",
      exhausted: true,
      stopReason: "DOMAIN_EXHAUSTED",
      domainVersion: "1.0.0",
      totalCandidatesExplored: 184,
      searchSpaceEstimatedSize: 184,
      findingCount: 1,
      findings: [
        {
          findingId: "fnd_001",
          fingerprint: "0123456789abcdef",
          severity: "HIGH",
          violationType: "FALSE_POSITIVE_ALLOW",
          title: "Item Price Exceeds Threshold",
          description: "Candidate item price was $260.00 exceeding $250.00 limit",
          candidateCart: {
            cartId: "cart_saved",
            currency: "USD",
            items: [
              { sku: "sku_1", title: "Dev Board", category: "Hardware", unitPriceMinor: 26000, quantity: 1 },
            ],
          },
          expectedOutcome: { decision: "DENY", reasonCode: ReasonCode.ITEM_PRICE_LIMIT_EXCEEDED },
          actualOutcome: { decision: "ALLOW", primaryReasonCode: ReasonCode.ALL_RULES_PASSED, reasonCodes: [ReasonCode.ALL_RULES_PASSED] },
          reproduction: { candidateIndex: 2, summary: "Item @ $260.00 > $250.00 limit" },
          policyVersionId: "pol_v1_books_hardware",
          resolutionStatus: "UNRESOLVED",
        },
      ],
      unresolvedCount: 0,
      durationMs: 340,
      summary: "Saved verification report retrieved from database.",
    };

    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ data: mockReport }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    try {
      const result = await fetchSavedVerificationReport("run_db_001");
      expect(result.runId).toBe("run_db_001");
      expect(result.isSavedRun).toBe(true);
      expect(result.counterexampleCount).toBe(1);
      expect(result.findings[0].id).toBe("fnd_001");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("6. SavedRunsBrowser renders database standby notice when persistence is unavailable", () => {
    // Render static markup of SavedRunsBrowser
    const html = renderToStaticMarkup(
      React.createElement(SavedRunsBrowser, {
        onLoadReport: async () => {},
      }),
    );

    expect(html).toContain("Persisted Verification Runs");
    expect(html).toContain("Refresh");
  });

  it("7. VerificationCoverageCard displays Saved Database Run badge when isSavedRun is true", () => {
    const html = renderToStaticMarkup(
      React.createElement(VerificationCoverageCard, {
        status: "COMPLETED",
        coverage: {
          totalCandidatesEvaluated: 184,
          candidateBudget: 184,
          isExhaustive: true,
          dimensionsCovered: ["PRICE_BOUNDARIES"],
          evaluatedAt: "2026-10-19T10:00:00Z",
          durationMs: 340,
        },
        counterexampleCount: 0,
        unresolvedCount: 0,
        isSavedRun: true,
        runId: "run_db_001",
      }),
    );

    expect(html).toContain("Saved Database Run");
    expect(html).toContain("Run ID:");
    expect(html).toContain("run_db_001");
  });
});
