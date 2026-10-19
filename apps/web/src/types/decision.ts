import type { Decision, ReasonCodeValue } from "@warrant/contracts";

/**
 * Presentation view-model for an individual evidence attribute.
 * This represents display-ready evidence adapted from backend snapshots.
 */
export interface DecisionEvidenceItem {
  label: string;
  value: string;
  observedAt?: string;
  isStale?: boolean;
  verified?: boolean;
}

/**
 * Props for the presentational DecisionResultCard component.
 *
 * Invariants:
 * - This component is strictly presentational; it contains zero authorization logic.
 * - `decision` is authoritative and must be provided by the caller.
 * - `primaryReasonCode` represents the main explanation (authoritatively selected by the backend).
 * - `reasonCodes` represents all applicable evaluation codes, preserved in their original order.
 * - Optional metadata (policy version, hash, timestamp, evidence) is rendered only when supplied.
 * - Demo/synthetic fixtures must set `isDemoFixture: true` to prevent misleading operators.
 */
export interface DecisionResultCardProps {
  decision: Decision;
  primaryReasonCode?: ReasonCodeValue | string;
  reasonCodes?: Array<ReasonCodeValue | string>;
  policyVersionId?: string;
  policyHash?: string;
  evidenceItems?: DecisionEvidenceItem[];
  uncertaintyNotes?: string[];
  evaluatorVersion?: string;
  timestamp?: string;
  isDemoFixture?: boolean;
  className?: string;
}
