import { z } from "zod";
import { DecisionZodSchema } from "./enums.js";
import { CartSchema } from "./cart.js";
import { PolicyDocumentSchema } from "./policy.js";
import { ConfirmedIntentSchema, VerificationFindingSchema } from "./verification.js";

/**
 * Warrant Phase 2 — Policy Compilation & Repair Contracts
 * Defines schemas for natural-language intent compilation, semantic policy diffing,
 * and automated policy repair proposals.
 */

// 1. Policy Validation Result
export const PolicyValidationResultSchema = z.object({
  valid: z.boolean(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()).default([]),
});

export type PolicyValidationResult = z.infer<typeof PolicyValidationResultSchema>;

// 2. Intent Compilation Request
export const CompileIntentRequestSchema = z.object({
  mandateText: z
    .string()
    .min(1, "Mandate text is required")
    .max(10000, "Mandate text exceeds 10000 characters limit"),
  currency: z.string().length(3, "Currency code must be 3 characters").optional(),
  policyId: z.string().optional(),
  targetName: z.string().optional(),
});

export type CompileIntentRequest = z.infer<typeof CompileIntentRequestSchema>;

// 3. Compiler Metadata
export const CompilerMetadataSchema = z.object({
  compilerVersion: z.string(),
  model: z.string().optional(),
  deterministic: z.boolean(),
  parsedClauses: z.array(z.string()).optional(),
  sourceLength: z.number().int().nonnegative(),
});

export type CompilerMetadata = z.infer<typeof CompilerMetadataSchema>;

// 4. Intent Compilation Response
export const CompileIntentResponseSchema = z.object({
  candidatePolicy: PolicyDocumentSchema,
  confirmedIntent: ConfirmedIntentSchema,
  assumptions: z.array(z.string()),
  questions: z.array(z.string()),
  validation: PolicyValidationResultSchema,
  requiresUserConfirmation: z.literal(true),
  compilerMetadata: CompilerMetadataSchema,
});

export type CompileIntentResponse = z.infer<typeof CompileIntentResponseSchema>;

// 5. Policy Change Types & Semantic Diff
export const PolicyChangeTypeValues = [
  "ADDED",
  "REMOVED",
  "MODIFIED",
  "UNCHANGED",
] as const;

export const PolicyChangeTypeSchema = z.enum(PolicyChangeTypeValues);
export type PolicyChangeType = z.infer<typeof PolicyChangeTypeSchema>;

export const PolicyFieldDiffSchema = z.object({
  field: z.string(),
  previousValue: z.unknown(),
  proposedValue: z.unknown(),
  changeType: PolicyChangeTypeSchema,
  description: z.string(),
});

export type PolicyFieldDiff = z.infer<typeof PolicyFieldDiffSchema>;

export const PolicyDiffSchema = z.object({
  previousVersionId: z.string().optional(),
  previousPolicyHash: z.string().optional(),
  targetPolicyHash: z.string().optional(),
  diffs: z.array(PolicyFieldDiffSchema),
  hasChanges: z.boolean(),
  summary: z.string(),
});

export type PolicyDiff = z.infer<typeof PolicyDiffSchema>;

export const ComputeDiffRequestSchema = z.object({
  sourcePolicy: PolicyDocumentSchema,
  targetPolicy: PolicyDocumentSchema,
  sourceVersionId: z.string().optional(),
  targetVersionId: z.string().optional(),
});

export type ComputeDiffRequest = z.infer<typeof ComputeDiffRequestSchema>;

// 6. Automated Policy Repair Proposal
export const FindingRemedySchema = z.object({
  findingId: z.string(),
  fingerprint: z.string(),
  violationType: z.string(),
  remedyAction: z.string(),
  explanation: z.string(),
});

export type FindingRemedy = z.infer<typeof FindingRemedySchema>;

export const ProposeRepairRequestSchema = z.object({
  policyVersionId: z.string().min(1, "policyVersionId is required"),
  testRunId: z.string().optional(),
  findings: z.array(VerificationFindingSchema).optional(),
  instructions: z.string().max(2000).optional(),
});

export type ProposeRepairRequest = z.infer<typeof ProposeRepairRequestSchema>;

export const ProposeRepairResponseSchema = z.object({
  originalPolicy: PolicyDocumentSchema,
  repairedPolicy: PolicyDocumentSchema,
  repairedIntent: ConfirmedIntentSchema,
  diff: PolicyDiffSchema,
  addressedFindings: z.array(FindingRemedySchema),
  rationale: z.string(),
  requiresVerification: z.literal(true),
});

export type ProposeRepairResponse = z.infer<typeof ProposeRepairResponseSchema>;

// 8. Witness Re-run and Regression Schemas (FR-008)
export const RerunWitnessesRequestSchema = z.object({
  policyVersionId: z.string().optional(),
  findingIds: z.array(z.string()).optional(),
});

export type RerunWitnessesRequest = z.infer<typeof RerunWitnessesRequestSchema>;

export const WitnessEvaluationResultSchema = z.object({
  findingId: z.string(),
  witnessCart: CartSchema,
  previousDecision: DecisionZodSchema.optional(),
  currentDecision: DecisionZodSchema,
  currentReasonCodes: z.array(z.string()),
  outcome: z.enum(["RESOLVED", "STILL_FAILING", "REGRESSION", "UNCHANGED"]),
  explanation: z.string(),
});

export type WitnessEvaluationResult = z.infer<typeof WitnessEvaluationResultSchema>;

export const RerunWitnessesResponseSchema = z.object({
  policyVersionId: z.string(),
  policyHash: z.string(),
  totalWitnesses: z.number().int().nonnegative(),
  resolvedCount: z.number().int().nonnegative(),
  unresolvedCount: z.number().int().nonnegative(),
  results: z.array(WitnessEvaluationResultSchema),
});

export type RerunWitnessesResponse = z.infer<typeof RerunWitnessesResponseSchema>;
