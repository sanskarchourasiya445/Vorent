import type {
  PolicyEvaluationResult,
  EvidenceSnapshot,
} from "@warrant/contracts";
import type { DecisionEvidenceItem, DecisionResultCardProps } from "../types/decision";

export interface AdapterOptions {
  policyVersionId?: string;
  policyHash?: string;
  evidence?: EvidenceSnapshot;
  isDemoFixture?: boolean;
  className?: string;
}

/**
 * Pure adapter that maps an authoritative PolicyEvaluationResult from @warrant/contracts
 * into the presentational DecisionResultCardProps view-model.
 *
 * Invariants:
 * 1. Preserves backend decision, primaryReasonCode, and reasonCodes ordering unchanged.
 * 2. Does NOT perform any policy evaluation or override backend verdicts.
 * 3. Adapts optional evidence without falsely claiming authenticity.
 */
export function adaptEvaluationResultToDecisionCardProps(
  result: PolicyEvaluationResult,
  options?: AdapterOptions,
): DecisionResultCardProps {
  const evidenceItems: DecisionEvidenceItem[] = [];
  const uncertaintyNotes: string[] = [];

  // Adapt rule trace uncertainty if present
  if (result.ruleTrace && Array.isArray(result.ruleTrace)) {
    for (const trace of result.ruleTrace) {
      if (trace.outcome === "UNKNOWN" || trace.outcome === "FAIL") {
        uncertaintyNotes.push(`${trace.ruleName}: ${trace.message}`);
      }
    }
  }

  // Adapt optional evidence snapshot if provided
  if (options?.evidence) {
    const ev = options.evidence;

    if (ev.snapshotTimestamp) {
      evidenceItems.push({
        label: "Evidence Snapshot Time",
        value: ev.snapshotTimestamp,
        observedAt: ev.snapshotTimestamp,
      });
    }

    if (ev.quotesVerified !== undefined) {
      evidenceItems.push({
        label: "Quote Verification Status",
        value: ev.quotesVerified ? "Merchant Verified" : "Unverified Merchant Claim",
        verified: ev.quotesVerified,
      });
      if (!ev.quotesVerified) {
        uncertaintyNotes.push(
          "Merchant price quote authenticity has not been independently verified.",
        );
      }
    }

    if (ev.evidenceComplete !== undefined) {
      evidenceItems.push({
        label: "Attribute Completeness",
        value: ev.evidenceComplete ? "Complete Catalog Attributes" : "Incomplete Attributes",
        verified: ev.evidenceComplete,
      });
      if (!ev.evidenceComplete) {
        uncertaintyNotes.push("Merchant catalog payload is missing non-critical product attributes.");
      }
    }

    if (ev.stale !== undefined) {
      evidenceItems.push({
        label: "Evidence Freshness",
        value: ev.stale ? "Stale Data (Exceeded Freshness Window)" : "Fresh Data",
        isStale: ev.stale,
      });
      if (ev.stale) {
        uncertaintyNotes.push("Evidence snapshot exceeds maximum allowable policy age.");
      }
    }

    if (ev.unknownCategories && ev.unknownCategories.length > 0) {
      evidenceItems.push({
        label: "Unverified Categories",
        value: ev.unknownCategories.join(", "),
        verified: false,
      });
    }

    if (ev.staleCategories && ev.staleCategories.length > 0) {
      evidenceItems.push({
        label: "Stale Categories",
        value: ev.staleCategories.join(", "),
        isStale: true,
      });
    }
  }

  return {
    decision: result.decision,
    primaryReasonCode: result.primaryReasonCode,
    reasonCodes: result.reasonCodes, // Preserves exact backend array order
    policyVersionId: options?.policyVersionId,
    policyHash: options?.policyHash,
    evidenceItems: evidenceItems.length > 0 ? evidenceItems : undefined,
    uncertaintyNotes: uncertaintyNotes.length > 0 ? uncertaintyNotes : undefined,
    evaluatorVersion: result.metadata?.evaluatorVersion,
    timestamp: result.metadata?.evaluatedAt || options?.evidence?.snapshotTimestamp,
    isDemoFixture: options?.isDemoFixture ?? false,
    className: options?.className,
  };
}
