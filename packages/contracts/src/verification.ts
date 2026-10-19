import { z } from "zod";
import { DecisionZodSchema, FindingSeverityZodSchema, ReasonCodeZodSchema, RunStatusZodSchema } from "./enums.js";
import { CartSchema, EvidenceSnapshotSchema } from "./cart.js";
import { PolicyDocumentSchema } from "./policy.js";
import { PolicyEvaluationResultSchema } from "./evaluation.js";

/**
 * Warrant Phase 2 — Verification Contracts
 * Bounded counterexample discovery, confirmed intent constraints, and search reports.
 */

// 1. Violation Type
export const ViolationTypeValues = [
  "FALSE_POSITIVE_ALLOW",
  "FALSE_NEGATIVE_DENY",
  "UNEXPECTED_REVIEW",
  "INVARIANT_VIOLATION",
] as const;

export const ViolationTypeZodSchema = z.enum(ViolationTypeValues);
export type ViolationType = z.infer<typeof ViolationTypeZodSchema>;

// 2. Finding Resolution Status
export const FindingResolutionStatusValues = [
  "UNRESOLVED",
  "RESOLVED",
  "ACCEPTED_RISK",
] as const;

export const FindingResolutionStatusZodSchema = z.enum(FindingResolutionStatusValues);
export type FindingResolutionStatus = z.infer<typeof FindingResolutionStatusZodSchema>;

// 3. Expected Example Cart Outcome
export const ExpectedExampleSchema = z.object({
  exampleId: z.string().optional(),
  description: z.string().optional(),
  cart: CartSchema,
  evidence: EvidenceSnapshotSchema.optional(),
  expectedDecision: DecisionZodSchema,
  expectedReasonCode: ReasonCodeZodSchema.optional(),
});

export type ExpectedExample = z.infer<typeof ExpectedExampleSchema>;

// 4. Confirmed Intent Constraints
export const ConfirmedIntentSchema = z.object({
  intentId: z.string().optional(),
  name: z.string().min(1).default("Purchase Mandate Intent"),
  currency: z.string().length(3, "Currency code must be 3 characters"),
  maxItemPriceMinor: z
    .number()
    .int("Max item price must be an integer")
    .nonnegative("Max item price must be non-negative")
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),
  maxCartTotalMinor: z
    .number()
    .int("Max cart total must be an integer")
    .nonnegative("Max cart total must be non-negative")
    .max(Number.MAX_SAFE_INTEGER)
    .optional(),
  allowedCategories: z.array(z.string().min(1)).optional(),
  prohibitedCategories: z.array(z.string().min(1)).optional(),
  requireEvidence: z.boolean().optional(),
  expectedExamples: z.array(ExpectedExampleSchema).optional(),
});

export type ConfirmedIntent = z.infer<typeof ConfirmedIntentSchema>;

// 5. Search Space Definition
export const EvidenceVariationValues = ["COMPLETE", "MISSING", "STALE"] as const;
export const EvidenceVariationZodSchema = z.enum(EvidenceVariationValues);
export type EvidenceVariation = z.infer<typeof EvidenceVariationZodSchema>;

export const SearchSpaceItemTemplateSchema = z.object({
  sku: z.string().min(1),
  title: z.string().min(1),
  category: z.string().min(1),
  unitPriceMinor: z
    .number()
    .int()
    .nonnegative()
    .max(Number.MAX_SAFE_INTEGER),
  currency: z.string().length(3).optional(),
});

export type SearchSpaceItemTemplate = z.infer<typeof SearchSpaceItemTemplateSchema>;

export const SearchSpaceDefinitionSchema = z.object({
  domainVersion: z.string().default("1.0.0"),
  categories: z.array(z.string().min(1)).min(1, "Must declare at least one category"),
  pricePointsMinor: z
    .array(z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER))
    .min(1, "Must declare at least one price point"),
  quantities: z
    .array(z.number().int().positive().max(Number.MAX_SAFE_INTEGER))
    .default([1]),
  currencies: z.array(z.string().length(3)).default(["USD"]),
  maxItemsPerCart: z.number().int().min(1).max(4).default(2),
  evidenceVariations: z.array(EvidenceVariationZodSchema).default(["COMPLETE"]),
  customItemTemplates: z.array(SearchSpaceItemTemplateSchema).optional(),
});

export type SearchSpaceDefinition = z.infer<typeof SearchSpaceDefinitionSchema>;

// 6. Verification Configuration
export const VerificationConfigSchema = z.object({
  maxCandidates: z.number().int().positive().max(10000).optional().default(500),
  stopOnFirstFinding: z.boolean().optional().default(false),
  policyVersionId: z.string().optional(),
  policyHash: z.string().optional(),
  timeoutMs: z.number().int().positive().max(60000).optional().default(5000),
});

export type VerificationConfig = z.infer<typeof VerificationConfigSchema>;
export type VerificationConfigInput = z.input<typeof VerificationConfigSchema>;

// 7. Counterexample Finding
export const VerificationFindingSchema = z.object({
  findingId: z.string().min(1),
  fingerprint: z.string().min(16),
  severity: FindingSeverityZodSchema,
  violationType: ViolationTypeZodSchema,
  title: z.string().min(1),
  description: z.string().min(1),
  candidateCart: CartSchema,
  evidence: EvidenceSnapshotSchema.optional(),
  expectedOutcome: z.object({
    decision: DecisionZodSchema,
    reasonCode: ReasonCodeZodSchema.optional(),
  }),
  actualOutcome: PolicyEvaluationResultSchema,
  reproduction: z.object({
    candidateIndex: z.number().int().nonnegative(),
    summary: z.string(),
  }),
  policyVersionId: z.string().optional(),
  policyHash: z.string().optional(),
  resolutionStatus: FindingResolutionStatusZodSchema.default("UNRESOLVED"),
  discoveredAt: z.string().optional(),
});

export type VerificationFinding = z.infer<typeof VerificationFindingSchema>;

// 8. Unresolved Candidate
export const UnresolvedReasonValues = [
  "CATALOG_EVIDENCE_GAP",
  "AMBIGUOUS_INTENT",
  "UNKNOWN_CATEGORY",
] as const;

export const UnresolvedReasonZodSchema = z.enum(UnresolvedReasonValues);
export type UnresolvedReason = z.infer<typeof UnresolvedReasonZodSchema>;

export const UnresolvedCandidateSchema = z.object({
  candidateIndex: z.number().int().nonnegative(),
  candidateCart: CartSchema,
  evidence: EvidenceSnapshotSchema.optional(),
  actualDecision: DecisionZodSchema,
  actualReasonCode: ReasonCodeZodSchema,
  unresolvedReason: UnresolvedReasonZodSchema,
  notes: z.string(),
});

export type UnresolvedCandidate = z.infer<typeof UnresolvedCandidateSchema>;

// 9. Stop Reason
export const StopReasonValues = [
  "DOMAIN_EXHAUSTED",
  "CANDIDATE_CAP_REACHED",
  "FIRST_FINDING_STOP",
  "TIMEOUT",
  "EMPTY_SEARCH_SPACE",
  "ERROR",
] as const;

export const StopReasonZodSchema = z.enum(StopReasonValues);
export type StopReason = z.infer<typeof StopReasonZodSchema>;

// 10. Verification Report
export const VerificationReportSchema = z.object({
  runId: z.string().min(1),
  status: RunStatusZodSchema,
  exhausted: z.boolean(),
  stopReason: StopReasonZodSchema,
  domainVersion: z.string(),
  totalCandidatesExplored: z.number().int().nonnegative(),
  searchSpaceEstimatedSize: z.number().int().nonnegative(),
  findingCount: z.number().int().nonnegative(),
  findings: z.array(VerificationFindingSchema),
  unresolvedCount: z.number().int().nonnegative(),
  unresolvedCandidates: z.array(UnresolvedCandidateSchema).optional(),
  policyVersionId: z.string().optional(),
  policyHash: z.string().optional(),
  durationMs: z.number().nonnegative(),
  summary: z.string(),
});

export type VerificationReport = z.infer<typeof VerificationReportSchema>;

// 11. Full Verification Request
export const VerificationRequestSchema = z.object({
  policy: PolicyDocumentSchema,
  intent: ConfirmedIntentSchema,
  searchSpace: SearchSpaceDefinitionSchema,
  config: VerificationConfigSchema.partial().optional(),
});

export type VerificationRequest = z.infer<typeof VerificationRequestSchema>;

// 12. Search Dimensions
export const SearchDimensionValues = [
  "PRICE_BOUNDARIES",
  "CATEGORY_EVASION",
  "CURRENCY_MUTATION",
  "EVIDENCE_FRESHNESS",
  "QUANTITY_SPLITS",
] as const;

export const SearchDimensionZodSchema = z.enum(SearchDimensionValues);
export type SearchDimension = z.infer<typeof SearchDimensionZodSchema>;

// 13. Preset-Referenced Verification Request
export const PresetVerificationRequestSchema = z.object({
  policyVersionId: z.string().min(1, "policyVersionId is required"),
  policyHash: z.string().optional(),
  dimensions: z.array(SearchDimensionZodSchema).min(1, "Must declare at least one search dimension").optional(),
  candidateBudget: z.number().int().positive().max(10000).optional(),
  maxCandidates: z.number().int().positive().max(10000).optional(),
  timeoutMs: z.number().int().positive().max(60000).optional(),
  stopOnFirstFinding: z.boolean().optional(),
});

export type PresetVerificationRequest = z.infer<typeof PresetVerificationRequestSchema>;

// 14. API Request Union
export const ApiVerificationRunRequestSchema = z.union([
  VerificationRequestSchema,
  PresetVerificationRequestSchema,
]);

export type ApiVerificationRunRequest = z.infer<typeof ApiVerificationRunRequestSchema>;

// 15. Structured Error Response Envelope
export const ApiErrorResponseSchema = z.object({
  error: z.object({
    code: z.string().min(1),
    message: z.string().min(1),
  }),
  requestId: z.string().min(1),
});

export type ApiErrorResponse = z.infer<typeof ApiErrorResponseSchema>;

// 16. Finding Resolution & Triage Contracts
export const ResolveFindingRequestSchema = z.object({
  resolvedByVersionId: z.string().min(1, "resolvedByVersionId is required"),
  resolutionNote: z.string().min(1, "resolutionNote is required"),
});

export type ResolveFindingRequest = z.infer<typeof ResolveFindingRequestSchema>;

export const AcceptRiskRequestSchema = z.object({
  rationale: z.string().min(1, "rationale is required"),
});

export type AcceptRiskRequest = z.infer<typeof AcceptRiskRequestSchema>;

export const FindingRecordSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  testRunId: z.string(),
  policyVersionId: z.string(),
  findingType: z.string(),
  severity: FindingSeverityZodSchema,
  status: FindingResolutionStatusZodSchema,
  witness: CartSchema,
  evidenceSnapshot: z.record(z.unknown()).default({}),
  ruleTrace: z.array(z.unknown()).default([]),
  reproduction: z.record(z.unknown()).default({}),
  resolvedByVersionId: z.string().nullable().optional(),
  resolutionNote: z.string().nullable().optional(),
  createdAt: z.string(),
  resolvedAt: z.string().nullable().optional(),
});

export type FindingRecord = z.infer<typeof FindingRecordSchema>;

export const FindingListResponseSchema = z.object({
  findings: z.array(FindingRecordSchema),
  total: z.number().int().nonnegative(),
});

export type FindingListResponse = z.infer<typeof FindingListResponseSchema>;


