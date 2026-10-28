import { z } from "zod";

/**
 * Invariant verification status.
 * Strictly adheres to honesty: UNTESTED if not run, FIXTURE_VERIFIED for local fixtures, VERIFIED for live persisted evidence.
 */
export const InvariantStatusZodSchema = z.enum([
  "VERIFIED",
  "FIXTURE_VERIFIED",
  "UNTESTED",
  "FAILED",
]);
export type InvariantStatus = z.infer<typeof InvariantStatusZodSchema>;

/**
 * Type of evidence supporting an invariant claim.
 */
export const EvidenceTypeZodSchema = z.enum([
  "PERSISTED_DATABASE",
  "UNIT_FIXTURE",
  "REPRODUCIBLE_SEARCH",
  "NONE",
]);
export type EvidenceType = z.infer<typeof EvidenceTypeZodSchema>;

/**
 * Evaluation of an individual security invariant.
 */
export const SecurityInvariantCheckSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().min(1),
  status: InvariantStatusZodSchema,
  evidenceType: EvidenceTypeZodSchema,
  evidenceDetails: z.string(),
  limitations: z.string().optional(),
});
export type SecurityInvariantCheck = z.infer<typeof SecurityInvariantCheckSchema>;

/**
 * Bounded search coverage and seeded defect metrics.
 */
export const BoundedSearchEvaluationSummarySchema = z.object({
  domainVersion: z.string(),
  declaredCandidateCount: z.number().int().nonnegative(),
  exploredCandidateCount: z.number().int().nonnegative(),
  seededDefectsCount: z.number().int().nonnegative(),
  seededDefectsDetected: z.number().int().nonnegative(),
  reproducibleFindingsCount: z.number().int().nonnegative(),
  stopReason: z.string(),
  exhausted: z.boolean(),
  searchLimitations: z.string(),
});
export type BoundedSearchEvaluationSummary = z.infer<typeof BoundedSearchEvaluationSummarySchema>;

/**
 * Live database evidence summary.
 */
export const DatabaseEvidenceSummarySchema = z.object({
  connected: z.boolean(),
  persistedPoliciesCount: z.number().int().nonnegative(),
  persistedVersionsCount: z.number().int().nonnegative(),
  persistedRunsCount: z.number().int().nonnegative(),
  persistedApprovalsCount: z.number().int().nonnegative(),
  persistedProposalsCount: z.number().int().nonnegative(),
  persistedReservationsCount: z.number().int().nonnegative(),
  persistedPaymentOrdersCount: z.number().int().nonnegative(),
  reconciliationHoldsCount: z.number().int().nonnegative(),
});
export type DatabaseEvidenceSummary = z.infer<typeof DatabaseEvidenceSummarySchema>;

/**
 * Full Evaluation Report Schema conforming to PRD FR-015 and Security Invariants.
 */
export const EvaluationReportSchema = z.object({
  meta: z.object({
    reportId: z.string(),
    generatedAt: z.string(),
    evaluatorVersion: z.string(),
    fixturesVersion: z.string(),
    environment: z.literal("sandbox"),
    databaseStatus: z.enum(["CONNECTED", "STANDBY"]),
  }),
  securityInvariants: z.array(SecurityInvariantCheckSchema),
  boundedSearchSummary: BoundedSearchEvaluationSummarySchema,
  databaseEvidence: DatabaseEvidenceSummarySchema,
  disclosures: z.array(z.string()),
});
export type EvaluationReport = z.infer<typeof EvaluationReportSchema>;

/**
 * Response schema for GET /api/evaluation/report
 */
export const EvaluationReportResponseSchema = z.object({
  report: EvaluationReportSchema,
});
export type EvaluationReportResponse = z.infer<typeof EvaluationReportResponseSchema>;
