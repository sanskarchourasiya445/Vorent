import {
  type UnresolvedCandidate,
  type VerificationConfig,
  type VerificationFinding,
  type VerificationReport,
  type VerificationRequest,
  VerificationReportSchema,
  VerificationRequestSchema,
} from "@warrant/contracts";
import { evaluatePolicy } from "../evaluator.js";
import { generateCandidates } from "../search/candidateGenerator.js";
import { computeFindingFingerprint } from "./fingerprint.js";

/**
 * Warrant Bounded Verification Engine
 *
 * Deterministically explores a declared finite domain of candidate carts to discover
 * reproducible counterexamples where policy rules diverge from confirmed intent or invariants.
 *
 * Guarantees:
 * - Strictly zero I/O (pure evaluation using evaluatePolicy).
 * - Distinguishes policy counterexamples from catalog-evidence gaps (unresolved).
 * - Never claims universal safety or exhaustive coverage unless the finite domain was exhausted.
 * - Stable, reproducible finding fingerprints.
 */
export function verifyPolicy(request: VerificationRequest): VerificationReport {
  const startTime = Date.now();

  // 1. Validate request parameters
  const parsedRequest = VerificationRequestSchema.safeParse(request);
  if (!parsedRequest.success) {
    const errorDetails = parsedRequest.error.issues
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");

    return VerificationReportSchema.parse({
      runId: `run-err-${Date.now()}`,
      status: "FAILED",
      exhausted: false,
      stopReason: "ERROR",
      domainVersion: request.searchSpace?.domainVersion ?? "1.0.0",
      totalCandidatesExplored: 0,
      searchSpaceEstimatedSize: 0,
      findingCount: 0,
      findings: [],
      unresolvedCount: 0,
      unresolvedCandidates: [],
      policyVersionId: request.config?.policyVersionId,
      policyHash: request.config?.policyHash,
      durationMs: Date.now() - startTime,
      summary: `Verification request failed schema validation: ${errorDetails}`,
    });
  }

  const { policy, intent, searchSpace } = parsedRequest.data;
  const config: VerificationConfig = {
    maxCandidates: parsedRequest.data.config?.maxCandidates ?? 500,
    stopOnFirstFinding: parsedRequest.data.config?.stopOnFirstFinding ?? false,
    policyVersionId: parsedRequest.data.config?.policyVersionId,
    policyHash: parsedRequest.data.config?.policyHash,
    timeoutMs: parsedRequest.data.config?.timeoutMs ?? 5000,
  };

  // 2. Generate Candidate Carts
  let candidates;
  try {
    candidates = generateCandidates(searchSpace);
  } catch (err) {
    return VerificationReportSchema.parse({
      runId: `run-err-${Date.now()}`,
      status: "FAILED",
      exhausted: false,
      stopReason: "ERROR",
      domainVersion: searchSpace.domainVersion,
      totalCandidatesExplored: 0,
      searchSpaceEstimatedSize: 0,
      findingCount: 0,
      findings: [],
      unresolvedCount: 0,
      unresolvedCandidates: [],
      policyVersionId: config.policyVersionId,
      policyHash: config.policyHash,
      durationMs: Date.now() - startTime,
      summary: `Failed to generate search space candidates: ${err instanceof Error ? err.message : String(err)}`,
    });
  }

  if (candidates.length === 0) {
    return VerificationReportSchema.parse({
      runId: `run-${Date.now()}`,
      status: "COMPLETED",
      exhausted: true,
      stopReason: "EMPTY_SEARCH_SPACE",
      domainVersion: searchSpace.domainVersion,
      totalCandidatesExplored: 0,
      searchSpaceEstimatedSize: 0,
      findingCount: 0,
      findings: [],
      unresolvedCount: 0,
      unresolvedCandidates: [],
      policyVersionId: config.policyVersionId,
      policyHash: config.policyHash,
      durationMs: Date.now() - startTime,
      summary: "Search space produced 0 candidates. Verification completed with empty domain.",
    });
  }

  const findings: VerificationFinding[] = [];
  const unresolved: UnresolvedCandidate[] = [];
  let totalExplored = 0;
  let exhausted = false;
  let stopReason: VerificationReport["stopReason"] = "DOMAIN_EXHAUSTED";

  const intentProhibitedSet = new Set(
    (intent.prohibitedCategories ?? []).map((c) => c.toLowerCase().trim()),
  );
  const intentAllowedSet = intent.allowedCategories && intent.allowedCategories.length > 0
    ? new Set(intent.allowedCategories.map((c) => c.toLowerCase().trim()))
    : null;

  // 3. Sequential, Deterministic Exploration
  for (const candidate of candidates) {
    // Check timeout
    if (Date.now() - startTime >= config.timeoutMs) {
      stopReason = "TIMEOUT";
      exhausted = false;
      break;
    }

    // Check candidate count ceiling
    if (totalExplored >= config.maxCandidates) {
      stopReason = "CANDIDATE_CAP_REACHED";
      exhausted = false;
      break;
    }

    totalExplored++;

    // Evaluate policy on candidate cart
    const evaluation = evaluatePolicy({
      policy,
      cart: candidate.cart,
      evidence: candidate.evidence,
    });

    // Calculate cart total in minor units
    const calculatedCartTotal = candidate.cart.items.reduce(
      (sum, item) => sum + item.unitPriceMinor * Math.max(0, item.quantity),
      0,
    );

    let candidateFinding: VerificationFinding | null = null;

    // Check Invariant 1: Prohibited Category Leak (Intent strictly prohibits category, but policy allowed it)
    for (const item of candidate.cart.items) {
      const itemCat = item.category.toLowerCase().trim();
      if (intentProhibitedSet.has(itemCat) && evaluation.decision === "ALLOW") {
        const fingerprint = computeFindingFingerprint({
          violationType: "FALSE_POSITIVE_ALLOW",
          expectedDecision: "DENY",
          actualDecision: "ALLOW",
          actualPrimaryReasonCode: evaluation.primaryReasonCode,
          candidateCart: candidate.cart,
          policyHash: config.policyHash,
        });

        candidateFinding = {
          findingId: `finding-${findings.length + 1}`,
          fingerprint,
          severity: "CRITICAL",
          violationType: "FALSE_POSITIVE_ALLOW",
          title: `Prohibited Category Allowed (${item.category})`,
          description: `Policy allowed item '${item.sku}' in prohibited category '${item.category}'. Intent strictly forbids this category.`,
          candidateCart: candidate.cart,
          evidence: candidate.evidence,
          expectedOutcome: {
            decision: "DENY",
            reasonCode: "PROHIBITED_CATEGORY",
          },
          actualOutcome: evaluation,
          reproduction: {
            candidateIndex: candidate.candidateIndex,
            summary: `Evaluate cart with item sku='${item.sku}', category='${item.category}', unitPrice=${item.unitPriceMinor}`,
          },
          policyVersionId: config.policyVersionId,
          policyHash: config.policyHash,
          resolutionStatus: "UNRESOLVED",
          discoveredAt: new Date().toISOString(),
        };
        break;
      }
    }

    // Check Invariant 2: Item Price Ceiling Leak (Item exceeds intent maxItemPriceMinor, but policy allowed it)
    if (!candidateFinding && intent.maxItemPriceMinor !== undefined && evaluation.decision === "ALLOW") {
      for (const item of candidate.cart.items) {
        if (item.unitPriceMinor > intent.maxItemPriceMinor) {
          const fingerprint = computeFindingFingerprint({
            violationType: "FALSE_POSITIVE_ALLOW",
            expectedDecision: "DENY",
            actualDecision: "ALLOW",
            actualPrimaryReasonCode: evaluation.primaryReasonCode,
            candidateCart: candidate.cart,
            policyHash: config.policyHash,
          });

          candidateFinding = {
            findingId: `finding-${findings.length + 1}`,
            fingerprint,
            severity: "HIGH",
            violationType: "FALSE_POSITIVE_ALLOW",
            title: `Item Price Limit Exceeded (${item.unitPriceMinor} > ${intent.maxItemPriceMinor})`,
            description: `Policy allowed item '${item.sku}' unit price ${item.unitPriceMinor} minor units, which exceeds intent item limit ${intent.maxItemPriceMinor}.`,
            candidateCart: candidate.cart,
            evidence: candidate.evidence,
            expectedOutcome: {
              decision: "DENY",
              reasonCode: "ITEM_PRICE_LIMIT_EXCEEDED",
            },
            actualOutcome: evaluation,
            reproduction: {
              candidateIndex: candidate.candidateIndex,
              summary: `Evaluate cart with item unit price ${item.unitPriceMinor} exceeding ceiling ${intent.maxItemPriceMinor}`,
            },
            policyVersionId: config.policyVersionId,
            policyHash: config.policyHash,
            resolutionStatus: "UNRESOLVED",
            discoveredAt: new Date().toISOString(),
          };
          break;
        }
      }
    }

    // Check Invariant 3: Cart Total Spending Limit Leak (Cart total exceeds intent maxCartTotalMinor, but policy allowed it)
    if (!candidateFinding && intent.maxCartTotalMinor !== undefined && evaluation.decision === "ALLOW") {
      if (calculatedCartTotal > intent.maxCartTotalMinor) {
        const fingerprint = computeFindingFingerprint({
          violationType: "FALSE_POSITIVE_ALLOW",
          expectedDecision: "DENY",
          actualDecision: "ALLOW",
          actualPrimaryReasonCode: evaluation.primaryReasonCode,
          candidateCart: candidate.cart,
          policyHash: config.policyHash,
        });

        candidateFinding = {
          findingId: `finding-${findings.length + 1}`,
          fingerprint,
          severity: "CRITICAL",
          violationType: "FALSE_POSITIVE_ALLOW",
          title: `Cart Spending Ceiling Exceeded (${calculatedCartTotal} > ${intent.maxCartTotalMinor})`,
          description: `Policy allowed cumulative cart total ${calculatedCartTotal} minor units, which exceeds intent whole-cart limit ${intent.maxCartTotalMinor}.`,
          candidateCart: candidate.cart,
          evidence: candidate.evidence,
          expectedOutcome: {
            decision: "DENY",
            reasonCode: "CART_TOTAL_LIMIT_EXCEEDED",
          },
          actualOutcome: evaluation,
          reproduction: {
            candidateIndex: candidate.candidateIndex,
            summary: `Evaluate cart with ${candidate.cart.items.length} items totaling ${calculatedCartTotal} minor units exceeding budget ${intent.maxCartTotalMinor}`,
          },
          policyVersionId: config.policyVersionId,
          policyHash: config.policyHash,
          resolutionStatus: "UNRESOLVED",
          discoveredAt: new Date().toISOString(),
        };
      }
    }

    // Check Invariant 4: Unexpected Policy Denial of Compliant Purchase (False Negative)
    if (!candidateFinding && evaluation.decision === "DENY") {
      const isCompliantWithIntent =
        candidate.cart.currency.toUpperCase() === intent.currency.toUpperCase() &&
        candidate.cart.items.every((item) => {
          const cat = item.category.toLowerCase().trim();
          const categoryAllowed = intentAllowedSet ? intentAllowedSet.has(cat) : true;
          const categoryNotProhibited = !intentProhibitedSet.has(cat);
          const priceWithinItemLimit = intent.maxItemPriceMinor === undefined || item.unitPriceMinor <= intent.maxItemPriceMinor;
          return categoryAllowed && categoryNotProhibited && priceWithinItemLimit;
        }) &&
        (intent.maxCartTotalMinor === undefined || calculatedCartTotal <= intent.maxCartTotalMinor) &&
        (candidate.evidence?.evidenceComplete !== false && candidate.evidence?.quotesVerified !== false && candidate.evidence?.stale !== true);

      if (isCompliantWithIntent) {
        const fingerprint = computeFindingFingerprint({
          violationType: "FALSE_NEGATIVE_DENY",
          expectedDecision: "ALLOW",
          actualDecision: "DENY",
          actualPrimaryReasonCode: evaluation.primaryReasonCode,
          candidateCart: candidate.cart,
          policyHash: config.policyHash,
        });

        candidateFinding = {
          findingId: `finding-${findings.length + 1}`,
          fingerprint,
          severity: "HIGH",
          violationType: "FALSE_NEGATIVE_DENY",
          title: `Compliant Purchase Unexpectedly Denied (${evaluation.primaryReasonCode})`,
          description: `Policy unexpectedly denied a fully compliant purchase that satisfies all intent criteria. Primary reason: ${evaluation.primaryReasonCode}.`,
          candidateCart: candidate.cart,
          evidence: candidate.evidence,
          expectedOutcome: {
            decision: "ALLOW",
            reasonCode: "ALL_RULES_PASSED",
          },
          actualOutcome: evaluation,
          reproduction: {
            candidateIndex: candidate.candidateIndex,
            summary: `Evaluate compliant cart: ${candidate.description}`,
          },
          policyVersionId: config.policyVersionId,
          policyHash: config.policyHash,
          resolutionStatus: "UNRESOLVED",
          discoveredAt: new Date().toISOString(),
        };
      }
    }

    // Check Invariant 5: Expected Examples from Intent Mismatch
    if (!candidateFinding && intent.expectedExamples && intent.expectedExamples.length > 0) {
      for (const example of intent.expectedExamples) {
        const itemsMatch =
          example.cart.items.length === candidate.cart.items.length &&
          example.cart.items.every((exItem) =>
            candidate.cart.items.some(
              (cItem) =>
                cItem.sku === exItem.sku &&
                cItem.unitPriceMinor === exItem.unitPriceMinor &&
                cItem.category.toLowerCase().trim() === exItem.category.toLowerCase().trim(),
            ),
          );

        if (itemsMatch && evaluation.decision !== example.expectedDecision) {
          const fingerprint = computeFindingFingerprint({
            violationType: evaluation.decision === "ALLOW" ? "FALSE_POSITIVE_ALLOW" : "FALSE_NEGATIVE_DENY",
            expectedDecision: example.expectedDecision,
            actualDecision: evaluation.decision,
            actualPrimaryReasonCode: evaluation.primaryReasonCode,
            candidateCart: candidate.cart,
            policyHash: config.policyHash,
          });

          candidateFinding = {
            findingId: `finding-${findings.length + 1}`,
            fingerprint,
            severity: "HIGH",
            violationType: evaluation.decision === "ALLOW" ? "FALSE_POSITIVE_ALLOW" : "FALSE_NEGATIVE_DENY",
            title: `Intent Example Expectation Mismatch`,
            description: example.description ?? `Expected decision '${example.expectedDecision}' but got '${evaluation.decision}'.`,
            candidateCart: candidate.cart,
            evidence: candidate.evidence,
            expectedOutcome: {
              decision: example.expectedDecision,
              reasonCode: example.expectedReasonCode,
            },
            actualOutcome: evaluation,
            reproduction: {
              candidateIndex: candidate.candidateIndex,
              summary: `Evaluate matching intent example: ${example.description ?? "explicit example"}`,
            },
            policyVersionId: config.policyVersionId,
            policyHash: config.policyHash,
            resolutionStatus: "UNRESOLVED",
            discoveredAt: new Date().toISOString(),
          };
          break;
        }
      }
    }

    // Process Finding or Record Unresolved Candidate
    if (candidateFinding) {
      findings.push(candidateFinding);
      if (config.stopOnFirstFinding) {
        stopReason = "FIRST_FINDING_STOP";
        exhausted = false;
        break;
      }
    } else if (evaluation.decision === "REVIEW") {
      // Record Catalog Evidence Gap or Ambiguity (Never fabricated as a policy defect)
      const isEvidenceGap =
        candidate.evidence?.evidenceComplete === false ||
        candidate.evidence?.quotesVerified === false ||
        candidate.evidence?.stale === true;

      unresolved.push({
        candidateIndex: candidate.candidateIndex,
        candidateCart: candidate.cart,
        evidence: candidate.evidence,
        actualDecision: evaluation.decision,
        actualReasonCode: evaluation.primaryReasonCode,
        unresolvedReason: isEvidenceGap ? "CATALOG_EVIDENCE_GAP" : "UNKNOWN_CATEGORY",
        notes: isEvidenceGap
          ? "Merchant evidence is incomplete, unverified, or stale; cannot evaluate policy deterministically without authoritative evidence."
          : `Item category '${candidate.cart.items[0]?.category}' is unclassified or unknown.`,
      });
    }
  }

  // If we iterated through all candidates without hitting cap or timeout
  if (totalExplored >= candidates.length && stopReason === "DOMAIN_EXHAUSTED") {
    exhausted = true;
    stopReason = "DOMAIN_EXHAUSTED";
  }

  const runStatus = exhausted ? "COMPLETED" : "INCOMPLETE";

  const summary = exhausted
    ? findings.length > 0
      ? `Exhaustive search of declared finite domain completed: discovered ${findings.length} reproducible counterexample(s) and ${unresolved.length} unresolved candidate(s) across ${totalExplored} candidates.`
      : `Exhaustive search of declared finite domain completed: zero counterexamples discovered across ${totalExplored} candidates.`
    : `Search incomplete (${stopReason}): evaluated ${totalExplored}/${candidates.length} candidates. Found ${findings.length} counterexample(s) and ${unresolved.length} unresolved candidate(s). Search space was not exhausted.`;

  const report: VerificationReport = {
    runId: `run-${Date.now()}`,
    status: runStatus,
    exhausted,
    stopReason,
    domainVersion: searchSpace.domainVersion,
    totalCandidatesExplored: totalExplored,
    searchSpaceEstimatedSize: candidates.length,
    findingCount: findings.length,
    findings,
    unresolvedCount: unresolved.length,
    unresolvedCandidates: unresolved,
    policyVersionId: config.policyVersionId,
    policyHash: config.policyHash,
    durationMs: Date.now() - startTime,
    summary,
  };

  return VerificationReportSchema.parse(report);
}
