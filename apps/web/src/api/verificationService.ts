import type {
  VerificationConfig,
  VerificationRunResult,
  PolicyOption,
  VerificationFinding,
} from "../types/verification";
import { ReasonCode, type PolicyEvaluationResult } from "@warrant/contracts";

export const AVAILABLE_POLICIES: PolicyOption[] = [
  {
    id: "pol_v1_books_hardware",
    version: "1.0.0",
    name: "Engineering Hardware & Technical Books Policy",
    hash: "a4f912b7e53c4d89a290bc9812efaa43217d8900fe5b81a91e5d7a810b45cd2e",
    description: "Approved policy authorizing dev hardware and reference books up to $250.00 USD per item and $600.00 USD total.",
    limitsSummary: "Max Item: $250.00 | Max Cart: $600.00 | Allowed: Hardware, Reference Books",
  },
  {
    id: "pol_v2_strict_peripherals",
    version: "2.1.0-draft",
    name: "Strict Ergonomic Peripherals Mandate",
    hash: "8e71fa480cb12da970392bc13d5a42099fbc9018e4726d1b8207f901abcf8912",
    description: "Draft policy enforcing strict category matching and requiring verifiable quotes for all monitors and keypads.",
    limitsSummary: "Max Item: $150.00 | Max Cart: $300.00 | Strict Quotes Required",
  },
];

export async function fetchAvailablePolicies(): Promise<PolicyOption[]> {
  // If backend endpoint /api/policies exists in future, call it here.
  return Promise.resolve(AVAILABLE_POLICIES);
}

import type { VerificationReport } from "@warrant/contracts";

/**
 * Pure adapter mapping an authoritative backend VerificationReport from @warrant/contracts
 * into the VerificationRunResult view-model.
 */
export function adaptVerificationReportToRunResult(
  report: VerificationReport,
  dimensions: VerificationConfig["dimensions"] = ["PRICE_BOUNDARIES"],
): VerificationRunResult {
  let status: VerificationRunResult["status"] = "COMPLETED";
  if (report.status === "FAILED") {
    status = "FAILED";
  } else if (report.stopReason === "CANDIDATE_CAP_REACHED" || report.status === "INCOMPLETE") {
    status = "BUDGET_EXHAUSTED";
  } else if (!report.exhausted) {
    status = "BUDGET_EXHAUSTED";
  } else if (report.unresolvedCount > 0 && report.findingCount === 0) {
    status = "UNRESOLVED_CASES";
  }

  const findings: VerificationFinding[] = [];

  // Map confirmed counterexamples
  for (const f of report.findings) {
    findings.push({
      id: f.findingId,
      title: f.title,
      summary: f.description,
      classification: "COUNTEREXAMPLE",
      expectedDecision: f.expectedOutcome.decision,
      actualResult: f.actualOutcome,
      candidateCart: f.candidateCart,
      candidateEvidence: f.evidence,
      reproductionNotes: [
        f.reproduction.summary,
        `Violated: ${f.violationType}`,
        `Candidate Index: ${f.reproduction.candidateIndex}`,
      ],
    });
  }

  // Map unresolved candidates if present
  if (report.unresolvedCandidates) {
    for (const u of report.unresolvedCandidates) {
      findings.push({
        id: `unres_${u.candidateIndex}`,
        title: `Unresolved Candidate #${u.candidateIndex}: ${u.unresolvedReason}`,
        summary: u.notes,
        classification: "UNRESOLVED_AMBIGUITY",
        expectedDecision: "REVIEW",
        actualResult: {
          decision: u.actualDecision,
          primaryReasonCode: u.actualReasonCode,
          reasonCodes: [u.actualReasonCode],
        },
        candidateCart: u.candidateCart,
        candidateEvidence: u.evidence,
        reproductionNotes: [u.notes, `Reason: ${u.unresolvedReason}`],
      });
    }
  }

  return {
    runId: report.runId,
    status,
    policyVersionId: report.policyVersionId || "unknown_policy",
    policyHash: report.policyHash || "hash_unavailable",
    coverage: {
      totalCandidatesEvaluated: report.totalCandidatesExplored,
      candidateBudget: report.searchSpaceEstimatedSize,
      isExhaustive: report.exhausted,
      dimensionsCovered: dimensions,
      evaluatedAt: new Date().toISOString(),
      durationMs: report.durationMs,
    },
    findings,
    counterexampleCount: report.findingCount,
    unresolvedCount: report.unresolvedCount,
    isDemoFixture: false, // Authoritative result from verification engine
  };
}

/**
 * Executes a bounded verification run against a policy.
 * Dispatches to backend API if available, or falls back to an isolated,
 * deterministic demonstration fixture explicitly labeled with `isDemoFixture: true`.
 */
export async function executeVerificationRun(
  config: VerificationConfig,
  options?: { signal?: AbortSignal; simulateBudgetExhaustion?: boolean; simulateError?: boolean },
): Promise<VerificationRunResult> {
  // Check if real backend endpoint is available
  try {
    const response = await fetch("/api/verification/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
      signal: options?.signal,
    });

    if (response.ok) {
      const data = (await response.json()) as VerificationReport;
      return adaptVerificationReportToRunResult(data, config.dimensions);
    }
  } catch {
    // Backend endpoint not yet implemented by Fastify router; proceed with isolated realistic simulation
  }

  if (options?.simulateError) {
    throw new Error("Verification service connection refused (Fastify server offline)");
  }

  // Realistic deterministic simulation for bounded verification
  // Yield execution to simulate non-blocking exploration
  await new Promise((resolve) => setTimeout(resolve, 350));

  const totalCandidatesEvaluated = options?.simulateBudgetExhaustion
    ? config.candidateBudget
    : Math.min(config.candidateBudget, 184);

  const isExhaustive = !options?.simulateBudgetExhaustion && config.candidateBudget >= 184;

  const findings: VerificationFinding[] = [];

  // Finding 1: Real counterexample where unit price passed but cart total boundary was violated
  if (config.dimensions.includes("PRICE_BOUNDARIES") || config.dimensions.includes("QUANTITY_SPLITS")) {
    const counterexampleResult: PolicyEvaluationResult = {
      decision: "DENY",
      primaryReasonCode: ReasonCode.CART_TOTAL_LIMIT_EXCEEDED,
      reasonCodes: [ReasonCode.CART_TOTAL_LIMIT_EXCEEDED],
      ruleTrace: [
        {
          ruleId: "max_item_price_limit",
          ruleName: "Max Item Price Limit",
          outcome: "PASS",
          reasonCode: ReasonCode.ALL_RULES_PASSED,
          message: "Item unit price $220.00 is <= max allowable $250.00",
        },
        {
          ruleId: "max_cart_total_limit",
          ruleName: "Max Cart Total Limit",
          outcome: "FAIL",
          reasonCode: ReasonCode.CART_TOTAL_LIMIT_EXCEEDED,
          message: "Aggregate cart total $660.00 exceeds allowable $600.00 limit",
        },
      ],
      metadata: {
        evaluatorVersion: "1.0.0",
        itemCount: 3,
        cartTotalMinor: 66000,
        currency: "USD",
        evaluatedAt: new Date().toISOString(),
      },
    };

    findings.push({
      id: "fnd_cntr_01_qty_split",
      title: "Cart Total Boundary Overflow via Compliant Item Stacking",
      summary: "3 units of $220.00 individually pass per-item threshold ($250.00) but aggregate to $660.00, triggering a cart total refusal.",
      classification: "COUNTEREXAMPLE",
      expectedDecision: "DENY",
      actualResult: counterexampleResult,
      candidateCart: {
        currency: "USD",
        items: [
          {
            sku: "HW-MON-4K-27",
            title: "4K Developer Monitor",
            category: "Hardware",
            unitPriceMinor: 22000,
            quantity: 3,
            currency: "USD",
          },
        ],
      },
      candidateEvidence: {
        snapshotTimestamp: new Date().toISOString(),
        quotesVerified: true,
        evidenceComplete: true,
        stale: false,
      },
      reproductionNotes: [
        "Select policy pol_v1_books_hardware with maxItemPrice: $250.00 and maxCartTotal: $600.00.",
        "Add 3 units of SKU HW-MON-4K-27 priced at $220.00.",
        "Deterministic evaluator flags CART_TOTAL_LIMIT_EXCEEDED and blocks authorization.",
      ],
    });
  }

  // Finding 2: Unresolved ambiguity case (NOT a confirmed vulnerability)
  if (config.dimensions.includes("EVIDENCE_FRESHNESS") || config.dimensions.includes("CATEGORY_EVASION")) {
    const unresolvedResult: PolicyEvaluationResult = {
      decision: "REVIEW",
      primaryReasonCode: ReasonCode.UNKNOWN_CATEGORY,
      reasonCodes: [ReasonCode.UNKNOWN_CATEGORY, ReasonCode.STALE_EVIDENCE],
      ruleTrace: [
        {
          ruleId: "category_verification",
          ruleName: "Catalog Category Verification",
          outcome: "UNKNOWN",
          reasonCode: ReasonCode.UNKNOWN_CATEGORY,
          message: "Merchant category 'Office Furnishing / Ergonomics' is not in approved taxonomy list",
        },
        {
          ruleId: "evidence_freshness",
          ruleName: "Evidence Freshness Check",
          outcome: "FAIL",
          reasonCode: ReasonCode.STALE_EVIDENCE,
          message: "Quote evidence timestamp is 72 hours old (limit 24 hours)",
        },
      ],
      metadata: {
        evaluatorVersion: "1.0.0",
        itemCount: 1,
        cartTotalMinor: 14000,
        currency: "USD",
        evaluatedAt: new Date().toISOString(),
      },
    };

    findings.push({
      id: "fnd_unres_02_ambig_cat",
      title: "Unverified Merchant Classification & Stale Quote",
      summary: "Candidate item has an unverified taxonomy category and quote age exceeding policy freshness window. Evaluator correctly holds transaction in fail-closed REVIEW.",
      classification: "UNRESOLVED_AMBIGUITY",
      expectedDecision: "REVIEW",
      actualResult: unresolvedResult,
      candidateCart: {
        currency: "USD",
        items: [
          {
            sku: "FURN-DESK-PAD-XL",
            title: "Ergonomic Desk Mat",
            category: "Office Furnishing / Ergonomics",
            unitPriceMinor: 14000,
            quantity: 1,
            currency: "USD",
          },
        ],
      },
      candidateEvidence: {
        snapshotTimestamp: "2026-10-16T08:00:00Z",
        quotesVerified: false,
        evidenceComplete: false,
        stale: true,
        unknownCategories: ["Office Furnishing / Ergonomics"],
      },
      reproductionNotes: [
        "Candidate submitted with unmapped category 'Office Furnishing / Ergonomics'.",
        "Evidence quote age exceeds 24h limit.",
        "Evaluator does NOT classify as confirmed vulnerability; held in fail-closed REVIEW pending operator resolution.",
      ],
    });
  }

  const counterexampleCount = findings.filter((f) => f.classification === "COUNTEREXAMPLE").length;
  const unresolvedCount = findings.filter((f) => f.classification === "UNRESOLVED_AMBIGUITY").length;

  let status: VerificationRunResult["status"] = "COMPLETED";
  if (!isExhaustive) {
    status = "BUDGET_EXHAUSTED";
  } else if (unresolvedCount > 0 && counterexampleCount === 0) {
    status = "UNRESOLVED_CASES";
  }

  return {
    runId: `run_${Date.now()}`,
    status,
    policyVersionId: config.policyVersionId,
    policyHash: config.policyHash || AVAILABLE_POLICIES.find((p) => p.id === config.policyVersionId)?.hash || "hash_unavailable",
    coverage: {
      totalCandidatesEvaluated,
      candidateBudget: config.candidateBudget,
      isExhaustive,
      dimensionsCovered: config.dimensions,
      evaluatedAt: new Date().toISOString(),
      durationMs: 412,
    },
    findings,
    counterexampleCount,
    unresolvedCount,
    isDemoFixture: true, // Clearly disclaim isolated demo data when backend API is not live
  };
}
