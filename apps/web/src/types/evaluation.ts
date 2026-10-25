import type {
  Decision,
  RuleEvaluationTrace,
  StopReason,
  EvidencePacket,
  AuditEventRecord,
  EvidenceVerificationStatus,
  EvidenceType,
  EvaluationReport,
} from "@warrant/contracts";

/**
 * Status of an individual security invariant check.
 * - PASS: The required test was actually executed and met all assertions.
 * - FAIL: The required test was executed and failed to meet security assertions.
 * - WARNING: The check completed with non-fatal caveats (e.g. database in standby, active reconciliation hold).
 * - UNTESTED: The check has not been executed yet; never display as PASS before running.
 */
export type InvariantStatus = "PASS" | "FAIL" | "WARNING" | "UNTESTED";

/**
 * Source category for evidence backing an invariant.
 */
export type InvariantEvidenceCategory =
  | "DETERMINISTIC_FIXTURE"
  | "PERSISTED_RECORDS"
  | "GATE_ENFORCEMENT";

/**
 * Detailed representation of a security invariant verification check.
 */
export interface SecurityInvariantCheck {
  id: string; // e.g. "INV-01", "INV-1"
  name: string;
  category: InvariantEvidenceCategory;
  description: string;
  status: InvariantStatus;
  testedAt: string | null;
  policyVersionId?: string | null;
  policyHash?: string | null;
  inputSummary: string;
  expectedDecision: Decision | string;
  actualDecision: Decision | string | null;
  primaryReasonCode?: string | null;
  ruleTrace?: RuleEvaluationTrace[];
  evidenceSnapshot?: Record<string, unknown> | null;
  notes: string;
  rawProof?: Record<string, unknown> | null;
  evidenceType?: EvidenceType | string;
  evidenceDetails?: string;
  limitations?: string;
}

/**
 * Declared bounded search parameters and formal limitations disclosure.
 */
export interface BoundedSearchLimits {
  domainVersion: string;
  declaredCategories: string[];
  pricePointsMinor: number[];
  maxItemsPerCart: number;
  evidenceVariations: string[];
  candidateCap: number;
  serverMaxTimeoutMs: number;
  totalCandidatesExplored?: number;
  stopReason?: StopReason | string;
  isExhausted?: boolean;
  knownLimitations: string[];
}

/**
 * Persisted operational evidence loaded from the live backend/database.
 */
export interface PersistedAuditEvidence {
  state: "READY" | "STANDBY" | "UNAVAILABLE" | "ERROR";
  totalPersistedRuns: number;
  totalPaymentOrders: number;
  reconciliationAlertsCount: number;
  totalSpendReservations: number;
  unauthorizedOrdersCount: number;
  message?: string | null;
  lastCheckedAt?: string | null;
}

/**
 * Complete evaluation suite aggregate result.
 */
export interface EvaluationSuiteResult {
  executedAt: string | null;
  isRunning: boolean;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  warningChecks: number;
  untestedChecks: number;
  invariants: SecurityInvariantCheck[];
  limits: BoundedSearchLimits;
  persistedEvidence: PersistedAuditEvidence;
  authoritativeReport?: EvaluationReport | null;
  error?: string | null;
}

/**
 * Load state for the Evidence Packet retrieval.
 */
export type EvidencePacketState =
  | "IDLE"
  | "LOADING"
  | "READY"
  | "EMPTY"
  | "STANDBY"
  | "UNAVAILABLE"
  | "ERROR";

export interface EvidencePacketLoadResult {
  state: EvidencePacketState;
  packet: EvidencePacket | null;
  message?: string | null;
  lastFetchedAt?: string | null;
}

/**
 * Load state for Audit Trail inspection.
 */
export type AuditTrailState =
  | "IDLE"
  | "LOADING"
  | "READY"
  | "EMPTY"
  | "STANDBY"
  | "UNAVAILABLE"
  | "ERROR";

export interface AuditTrailLoadResult {
  state: AuditTrailState;
  events: AuditEventRecord[];
  total: number;
  message?: string | null;
  lastFetchedAt?: string | null;
}

export type { EvidencePacket, AuditEventRecord, EvidenceVerificationStatus, EvidenceType, EvaluationReport };
