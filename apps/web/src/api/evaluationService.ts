/**
 * Evaluation Service Compatibility Facade
 *
 * Decomposed into 3 cohesive modules:
 * - deterministicInvariantRunner.ts: Invariant bounds, initial state, and deterministic test fixtures (INV-01, INV-02, INV-03).
 * - evidenceAuditService.ts: Live persisted evidence audits, evidence packets, and audit trail retrieval.
 * - evaluationApiService.ts: Authoritative backend report client and full suite runner.
 */

export {
  DEFAULT_SEARCH_BOUNDS,
  getInitialEvaluationState,
  evaluatePolicyFixture,
  runDeterministicInvariants,
} from "./deterministicInvariantRunner";

export {
  fetchLivePersistedAudit,
  evaluatePersistedInvariants,
  fetchEvidencePacket,
  downloadEvidencePacket,
  fetchAuditTrail,
} from "./evidenceAuditService";

export {
  type AuthoritativeReportResult,
  fetchAuthoritativeEvaluationReport,
  executeEvaluationReportSuite,
} from "./evaluationApiService";
