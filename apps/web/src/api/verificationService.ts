import type {
  VerificationConfig,
  VerificationRunResult,
  PolicyOption,
  VerificationFinding,
} from "../types/verification";
import {
  ReasonCode,
  type PolicyEvaluationResult,
  type VerificationReport,
  type VerificationRequest,
  VerificationRequestSchema,
  VerificationReportSchema,
} from "@warrant/contracts";
import { POLICY_PRESET_LIST } from "@warrant/test-fixtures";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

export const AVAILABLE_POLICIES: PolicyOption[] = [...POLICY_PRESET_LIST];

/**
 * Returns available preset policies configured with search bounds for bounded verification.
 * Note: Persisted database policies are fetched separately via fetchPolicySummaries()
 * in policyService.ts because GET /api/policies returns PolicySummary items without
 * the client-side search space configuration required by PolicyOption.
 */
export function getAvailablePolicies(): PolicyOption[] {
  return [...AVAILABLE_POLICIES];
}

export async function fetchAvailablePolicies(): Promise<PolicyOption[]> {
  return [...AVAILABLE_POLICIES];
}

/**
 * Builds and validates a VerificationRequest contract payload matching VerificationRequestSchema.
 */
export function buildVerificationRequest(
  policyOption: PolicyOption,
  config: VerificationConfig,
  timeoutMs: number = 5000,
): VerificationRequest {
  const categories = [...policyOption.defaultCategories];
  if (config.dimensions.includes("CATEGORY_EVASION")) {
    categories.push("Weapons / Lasers", "Office Furnishing / Ergonomics");
  }

  const pricePointsMinor = [...policyOption.defaultPricePointsMinor];
  if (config.dimensions.includes("PRICE_BOUNDARIES") && policyOption.policyDocument.maxItemPriceMinor) {
    const limit = policyOption.policyDocument.maxItemPriceMinor;
    pricePointsMinor.push(limit - 100, limit, limit + 100);
  }

  const quantities = config.dimensions.includes("QUANTITY_SPLITS") ? [1, 2, 3] : [1];
  const currencies = config.dimensions.includes("CURRENCY_MUTATION")
    ? ["USD", "EUR"]
    : [policyOption.policyDocument.currency];
  const maxItemsPerCart = config.dimensions.includes("QUANTITY_SPLITS") ? 2 : 1;
  const evidenceVariations: ("COMPLETE" | "MISSING" | "STALE")[] = config.dimensions.includes(
    "EVIDENCE_FRESHNESS",
  )
    ? ["COMPLETE", "STALE", "MISSING"]
    : ["COMPLETE"];

  const candidateBudget = Math.max(1, Math.min(10000, config.candidateBudget));

  const rawPayload = {
    policy: policyOption.policyDocument,
    intent: policyOption.intent,
    searchSpace: {
      domainVersion: "1.0.0",
      categories: Array.from(new Set(categories)),
      pricePointsMinor: Array.from(new Set(pricePointsMinor)),
      quantities,
      currencies,
      maxItemsPerCart,
      evidenceVariations,
    },
    config: {
      maxCandidates: candidateBudget,
      stopOnFirstFinding: false,
      policyVersionId: policyOption.id,
      policyHash: policyOption.hash,
      timeoutMs,
    },
  };

  return VerificationRequestSchema.parse(rawPayload);
}

/**
 * Pure adapter mapping an authoritative backend VerificationReport from @warrant/contracts
 * into the VerificationRunResult view-model.
 */
export function adaptVerificationReportToRunResult(
  report: VerificationReport,
  dimensions: VerificationConfig["dimensions"] = ["PRICE_BOUNDARIES"],
  isLiveApi: boolean = true,
): VerificationRunResult {
  let status: VerificationRunResult["status"] = "COMPLETED";
  if (report.status === "FAILED") {
    status = "FAILED";
  } else if (report.stopReason === "TIMEOUT") {
    status = "TIMED_OUT";
  } else if (report.stopReason === "EMPTY_SEARCH_SPACE" || (report.totalCandidatesExplored === 0 && !report.exhausted)) {
    status = "EMPTY_SEARCH_SPACE";
  } else if (report.stopReason === "CANDIDATE_CAP_REACHED" || report.status === "INCOMPLETE" || !report.exhausted) {
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
      severity: f.severity,
      violationType: f.violationType,
      resolutionStatus: f.resolutionStatus,
      fingerprint: f.fingerprint,
      affectedRule: f.violationType,
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
        severity: "LOW",
        violationType: u.unresolvedReason,
        resolutionStatus: "UNRESOLVED",
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
    stopReason: report.stopReason,
    summary: report.summary,
    isLiveApi,
    isDemoFixture: !isLiveApi,
  };
}

/**
 * Custom error types for fine-grained error surfacing in the Studio UI.
 */
export class VerificationApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = "VerificationApiError";
  }
}

export interface ExecuteRunOptions {
  signal?: AbortSignal;
  useDemoSimulation?: boolean; // Set to true only if explicitly requested for demo exploration
  simulateBudgetExhaustion?: boolean;
  simulateError?: boolean;
  timeoutMs?: number;
  customPolicyOption?: PolicyOption;
}

/**
 * Executes a bounded verification run.
 * Defaults to dispatching live requests to `POST /api/verification/run`.
 * If live API fails, surfaces the real error rather than disguising it as success.
 */
export async function executeVerificationRun(
  config: VerificationConfig,
  options?: ExecuteRunOptions,
): Promise<VerificationRunResult> {
  const policyOption =
    options?.customPolicyOption ||
    AVAILABLE_POLICIES.find((p) => p.id === config.policyVersionId);
  if (!policyOption) {
    throw new Error(`Target policy "${config.policyVersionId}" not found in available policy manifests.`);
  }

  // 1. Explicitly requested demo exploration branch
  if (options?.useDemoSimulation) {
    return runSimulatedDemoRun(config, options);
  }

  // 2. Validate configuration against shared contract schema before dispatch
  let requestPayload: VerificationRequest;
  try {
    requestPayload = buildVerificationRequest(policyOption, config, options?.timeoutMs ?? 5000);
  } catch (err) {
    throw new Error(
      `Verification request configuration error: ${err instanceof Error ? err.message : String(err)}`,
    );
  }

  const endpointUrl = `${API_BASE}/api/verification/run`;
  const timeoutMs = options?.timeoutMs ?? 10000;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(endpointUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(requestPayload),
      signal: options?.signal || controller.signal,
    });
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(`Verification run timed out: Server did not respond within ${timeoutMs}ms.`);
    }
    throw new Error(
      `Network failure connecting to ${endpointUrl}: ${
        err instanceof Error ? err.message : "Connection refused"
      }. Backend API server is offline or unreachable.`,
    );
  } finally {
    clearTimeout(timeoutId);
  }

  // Check HTTP response code
  if (!response.ok) {
    let errorDetail = "";
    try {
      const rawText = await response.text();
      try {
        const errorJson = JSON.parse(rawText);
        if (typeof errorJson === "object" && errorJson !== null) {
          if ("error" in errorJson && typeof (errorJson as { error: unknown }).error === "object" && (errorJson as { error: { message?: string } }).error?.message) {
            errorDetail = String((errorJson as { error: { message: string } }).error.message);
          } else if ("message" in errorJson) {
            errorDetail = String((errorJson as { message: unknown }).message);
          } else {
            errorDetail = rawText || JSON.stringify(errorJson);
          }
        } else {
          errorDetail = rawText;
        }
      } catch {
        errorDetail = rawText;
      }
    } catch {
      errorDetail = response.statusText || "";
    }

    if (response.status === 404) {
      throw new VerificationApiError(
        404,
        `Backend route not found: POST ${endpointUrl} returned HTTP 404. Backend verification route is not yet deployed by the CLI agent.`,
        errorDetail,
      );
    }

    if (response.status === 400) {
      throw new VerificationApiError(
        400,
        `Backend request validation failed (HTTP 400): ${errorDetail || "Invalid request schema"}`,
        errorDetail,
      );
    }

    throw new VerificationApiError(
      response.status,
      `Backend verification engine failure (HTTP ${response.status}): ${errorDetail || response.statusText}`,
      errorDetail,
    );
  }

  // Validate response format against shared VerificationReportSchema
  const rawReport = await response.json();
  const parseResult = VerificationReportSchema.safeParse(rawReport);
  if (!parseResult.success) {
    throw new Error(
      `Malformed verification report received from backend: ${parseResult.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }

  // Return authoritative live result
  return adaptVerificationReportToRunResult(parseResult.data, config.dimensions, true);
}

/**
 * Isolated deterministic demonstration simulation fixture.
 * Used exclusively for local offline testing or explicit illustrative demonstrations.
 * Never presented as an authoritative live result.
 */
function runSimulatedDemoRun(
  config: VerificationConfig,
  options?: ExecuteRunOptions,
): Promise<VerificationRunResult> {
  if (options?.simulateError) {
    throw new Error("Simulated verification service error for test coverage.");
  }

  const totalCandidatesEvaluated = options?.simulateBudgetExhaustion
    ? config.candidateBudget
    : Math.min(config.candidateBudget, 184);

  const isExhaustive = !options?.simulateBudgetExhaustion && config.candidateBudget >= 184;
  const findings: VerificationFinding[] = [];

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
      id: "fnd_cntr_demo_01",
      title: "Cart Total Boundary Overflow via Compliant Item Stacking",
      summary:
        "3 units of $220.00 individually pass per-item threshold ($250.00) but aggregate to $660.00, triggering a cart total refusal.",
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
      id: "fnd_unres_demo_02",
      title: "Unverified Merchant Classification & Stale Quote",
      summary:
        "Candidate item has an unverified taxonomy category and quote age exceeding policy freshness window. Evaluator correctly holds transaction in fail-closed REVIEW.",
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

  return Promise.resolve({
    runId: `demo_run_${Date.now()}`,
    status,
    policyVersionId: config.policyVersionId,
    policyHash: AVAILABLE_POLICIES.find((p) => p.id === config.policyVersionId)?.hash || "hash_unavailable",
    coverage: {
      totalCandidatesEvaluated,
      candidateBudget: config.candidateBudget,
      isExhaustive,
      dimensionsCovered: config.dimensions,
      evaluatedAt: new Date().toISOString(),
      durationMs: 350,
    },
    findings,
    counterexampleCount,
    unresolvedCount,
    stopReason: isExhaustive ? "DOMAIN_EXHAUSTED" : "CANDIDATE_CAP_REACHED",
    summary: isExhaustive
      ? "Demonstration exploration completed exhaustively."
      : "Demonstration exploration reached candidate budget cap.",
    isLiveApi: false,
    isDemoFixture: true,
  });
}
