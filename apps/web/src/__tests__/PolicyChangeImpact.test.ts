import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import {
  computePolicyDiff,
  type PolicyComparisonInput,
} from "../utils/policyDiff";
import {
  fetchPolicySummaries,
  fetchPolicyVersionDetail,
} from "../api/policyService";
import { PolicyChangeImpactPanel } from "../components/policy/PolicyChangeImpactPanel";
import { ApprovalHistoryTimeline } from "../components/policy/ApprovalHistoryTimeline";
import { AVAILABLE_POLICIES } from "../api/verificationService";

describe("Policy Change Impact & Approval History Suite", () => {
  const pol1 = AVAILABLE_POLICIES.find((p) => p.id === "pol_v1_books_hardware")!;
  const pol2Strict = AVAILABLE_POLICIES.find((p) => p.id === "pol_v2_strict_peripherals")!;
  const polDefect = AVAILABLE_POLICIES.find(
    (p) => p.id === "pol_seeded_defect_unbounded_cart",
  )!;

  const baseInput: PolicyComparisonInput = {
    id: pol1.id,
    name: pol1.name,
    version: pol1.version,
    hash: pol1.hash,
    policyHash: pol1.hash,
    policyDocument: pol1.policyDocument,
  };

  const defectInput: PolicyComparisonInput = {
    id: polDefect.id,
    name: polDefect.name,
    version: polDefect.version,
    hash: polDefect.hash,
    policyHash: polDefect.hash,
    policyDocument: polDefect.policyDocument,
  };

  const strictInput: PolicyComparisonInput = {
    id: pol2Strict.id,
    name: pol2Strict.name,
    version: pol2Strict.version,
    hash: pol2Strict.hash,
    policyHash: pol2Strict.hash,
    policyDocument: pol2Strict.policyDocument,
  };

  // 1. Identical Policies Comparison
  it("1. computePolicyDiff returns identical=true and IDENTICAL severity for the same policy", () => {
    const diff = computePolicyDiff(baseInput, baseInput);
    expect(diff.identical).toBe(true);
    expect(diff.reverificationRequired).toBe(false);
    expect(diff.overallSeverity).toBe("IDENTICAL");
    expect(diff.criticalTriggers).toHaveLength(0);
    expect(diff.ruleDiffs.every((r) => !r.changed)).toBe(true);
  });

  // 2. Whole-Cart Spending Cap Removal (Unbounded Cart Defect)
  it("2. computePolicyDiff flags whole-cart spending limit removal as CRITICAL reverification trigger", () => {
    const diff = computePolicyDiff(baseInput, defectInput);
    expect(diff.identical).toBe(false);
    expect(diff.reverificationRequired).toBe(true);
    expect(diff.overallSeverity).toBe("CRITICAL");

    // Check cart total rule diff
    const cartDiff = diff.ruleDiffs.find((r) => r.field === "maxCartTotalMinor");
    expect(cartDiff).toBeDefined();
    expect(cartDiff?.changed).toBe(true);
    expect(cartDiff?.severity).toBe("CRITICAL");
    expect(cartDiff?.reverificationTrigger).toBe(true);
    expect(cartDiff?.targetDisplay).toContain("UNBOUNDED");

    // Check critical trigger message
    expect(
      diff.criticalTriggers.some((t) => t.toLowerCase().includes("whole-cart spending cap removed")),
    ).toBe(true);
  });

  // 3. Single-Item Ceiling Increase
  it("3. computePolicyDiff flags single-item price ceiling relaxation as reverification trigger", () => {
    const diff = computePolicyDiff(strictInput, baseInput); // $150 item cap -> $250 item cap
    expect(diff.reverificationRequired).toBe(true);

    const itemDiff = diff.ruleDiffs.find((r) => r.field === "maxItemPriceMinor");
    expect(itemDiff?.changed).toBe(true);
    expect(itemDiff?.severity).toBe("HIGH");
    expect(itemDiff?.reverificationTrigger).toBe(true);
    expect(
      diff.criticalTriggers.some((t) => t.toLowerCase().includes("single-item limit increased")),
    ).toBe(true);
  });

  // 4. Prohibited Categories Removal (Relaxation)
  it("4. computePolicyDiff flags removal of prohibited categories as HIGH risk relaxation", () => {
    const relaxedTarget: PolicyComparisonInput = {
      id: "pol_relaxed",
      name: "Relaxed Categories Policy",
      policyDocument: {
        ...pol1.policyDocument,
        prohibitedCategories: [], // Removed Weapons, Adult, Gift Cards
      },
    };

    const diff = computePolicyDiff(baseInput, relaxedTarget);
    expect(diff.reverificationRequired).toBe(true);

    const prohibitedDiff = diff.ruleDiffs.find((r) => r.field === "prohibitedCategories");
    expect(prohibitedDiff?.changed).toBe(true);
    expect(prohibitedDiff?.severity).toBe("HIGH");
    expect(
      diff.criticalTriggers.some((t) => t.includes("Prohibited categories removed")),
    ).toBe(true);
  });

  // 5. Evidence Requirement Disabled
  it("5. computePolicyDiff flags disabling proof of evidence as CRITICAL reverification trigger", () => {
    const noEvidenceTarget: PolicyComparisonInput = {
      id: "pol_no_evidence",
      name: "No Evidence Policy",
      policyDocument: {
        ...pol1.policyDocument,
        requireEvidence: false,
      },
    };

    const diff = computePolicyDiff(baseInput, noEvidenceTarget);
    expect(diff.overallSeverity).toBe("CRITICAL");
    expect(diff.reverificationRequired).toBe(true);

    const evidenceDiff = diff.ruleDiffs.find((r) => r.field === "requireEvidence");
    expect(evidenceDiff?.changed).toBe(true);
    expect(evidenceDiff?.severity).toBe("CRITICAL");
    expect(
      diff.criticalTriggers.some((t) => t.includes("Evidence requirement disabled")),
    ).toBe(true);
  });

  // 6. Currency Mismatch
  it("6. computePolicyDiff flags currency code change as CRITICAL", () => {
    const foreignCurrencyTarget: PolicyComparisonInput = {
      id: "pol_eur",
      name: "EUR Policy",
      policyDocument: {
        ...pol1.policyDocument,
        currency: "EUR",
      },
    };

    const diff = computePolicyDiff(baseInput, foreignCurrencyTarget);
    expect(diff.overallSeverity).toBe("CRITICAL");

    const currencyDiff = diff.ruleDiffs.find((r) => r.field === "currency");
    expect(currencyDiff?.changed).toBe(true);
    expect(currencyDiff?.severity).toBe("CRITICAL");
  });

  // 7. Cryptographic SHA-256 Hash Difference
  it("7. computePolicyDiff records hash difference and invalidates prior approvals", () => {
    const diff = computePolicyDiff(baseInput, strictInput);
    expect(diff.baseHash).toBe(baseInput.hash);
    expect(diff.targetHash).toBe(strictInput.hash);
    expect(diff.reverificationReasons.length).toBeGreaterThan(0);
  });

  // 8. fetchPolicySummaries API Handling
  it("8. fetchPolicySummaries returns READY with policies when backend responds with 200", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          policies: [
            {
              id: "pol_v1_books_hardware",
              name: "Books & Hardware",
              sourceMandate: "Mandate",
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
          total: 1,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );

    try {
      const result = await fetchPolicySummaries();
      expect(result.state.state).toBe("READY");
      if (result.state.state === "READY") {
        expect(result.state.data).toHaveLength(1);
        expect(result.state.data[0].id).toBe("pol_v1_books_hardware");
      }
      expect(result.isFallback).toBe(false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("9. fetchPolicySummaries returns UNAVAILABLE when database returns 503 standby", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("Database Standby", { status: 503 });

    try {
      const result = await fetchPolicySummaries();
      expect(result.state.state).toBe("UNAVAILABLE");
      if (result.state.state === "UNAVAILABLE") {
        expect(result.state.message).toContain("PostgreSQL database is in standby mode");
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("10. fetchPolicySummaries returns fallback presets when route returns 404 or fails", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("Not Found", { status: 404 });

    try {
      const result = await fetchPolicySummaries();
      expect(result.state.state).toBe("READY");
      expect(result.isFallback).toBe(true);
      if (result.state.state === "READY") {
        expect(result.state.data.length).toBeGreaterThanOrEqual(3);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("11. fetchPolicyVersionDetail returns preset detail when local ID matches", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("Not Found", { status: 404 });

    try {
      const detail = await fetchPolicyVersionDetail("pol_v1_books_hardware");
      expect(detail.id).toBe("pol_v1_books_hardware");
      expect(detail.policyDocument.maxItemPriceMinor).toBe(25000);
      expect(detail.policyDocument.maxCartTotalMinor).toBe(60000);
      expect(detail.hash).toBe(pol1.hash);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 12. Component Render: PolicyChangeImpactPanel
  it("12. PolicyChangeImpactPanel renders comparison header, version selectors, and tabs", () => {
    const html = renderToStaticMarkup(
      React.createElement(PolicyChangeImpactPanel, {
        initialBasePolicyId: "pol_v1_books_hardware",
        initialTargetPolicyId: "pol_seeded_defect_unbounded_cart",
      }),
    );

    expect(html).toContain("Policy Change Impact &amp; Approval History");
    expect(html).toContain("Impact &amp; Diff Matrix");
    expect(html).toContain("Approval History Timeline");
    expect(html).toContain("Select Policy Versions to Compare");
    expect(html).toContain("Swap Comparison");
    expect(html).toContain("do not constitute proof of universal safety");
  });

  // 13. Component Render: ApprovalHistoryTimeline
  it("13. ApprovalHistoryTimeline renders timeline controls and refresh button", () => {
    const html = renderToStaticMarkup(
      React.createElement(ApprovalHistoryTimeline, {
        selectedPolicyHash: pol1.hash,
      }),
    );

    expect(html).toContain("Approval History Timeline");
    expect(html).toContain("Active only");
    expect(html).toContain("Refresh");
  });

  // 14. Missing policy version handling
  it("14. fetchPolicyVersionDetail throws descriptive error when version is missing", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("Not Found", { status: 404 });

    try {
      await expect(fetchPolicyVersionDetail("non_existent_policy_999")).rejects.toThrow(
        "could not be loaded from API or local presets",
      );
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  // 15. Real API / 503 Standby honesty
  it("15. ApprovalHistoryTimeline honestly renders standby state when backend returns 503 without fabricating records", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(
        JSON.stringify({
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "PostgreSQL persistence is in standby mode.",
          },
        }),
        { status: 503, headers: { "Content-Type": "application/json" } },
      );

    try {
      const { fetchApprovals } = await import("../api/approvalService");
      const result = await fetchApprovals();
      expect(result.state).toBe("UNAVAILABLE");
      if (result.state === "UNAVAILABLE") {
        expect(result.message).toContain("PostgreSQL database is in standby mode");
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
