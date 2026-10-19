import { z } from "zod";
import { PolicyDocumentSchema } from "./policy.js";
import { ConfirmedIntentSchema, SearchSpaceDefinitionSchema, VerificationReportSchema } from "./verification.js";
import { RunStatusValues } from "./enums.js";

export const ConfirmationStateValues = ["DRAFT", "CONFIRMED"] as const;
export const ConfirmationStateZodSchema = z.enum(ConfirmationStateValues);
export type ConfirmationState = z.infer<typeof ConfirmationStateZodSchema>;

/**
 * Immutable policy version record.
 * Once created, a policy version cannot be mutated; repairs and updates create a new version.
 */
export const PolicyVersionRecordSchema = z.object({
  id: z.string(),
  policyId: z.string(),
  ownerId: z.string().optional(),
  name: z.string(),
  versionNumber: z.number().int().positive(),
  sourceMandateSnapshot: z.string(),
  intentSpec: ConfirmedIntentSchema,
  policyDocument: PolicyDocumentSchema,
  policySchemaVersion: z.string().default("1.0"),
  canonicalizationVersion: z.string().default("1.0.0"),
  policyHash: z.string().length(64),
  confirmationState: ConfirmationStateZodSchema,
  createdAt: z.string(),
  isPreset: z.boolean().default(false),
  presetId: z.string().optional(),
});
export type PolicyVersionRecord = z.infer<typeof PolicyVersionRecordSchema>;

/**
 * Summary view of a policy including its latest version info.
 */
export const PolicySummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  sourceMandate: z.string(),
  currentVersionId: z.string().nullable().optional(),
  currentVersionNumber: z.number().int().positive().optional(),
  policyHash: z.string().length(64).optional(),
  isPreset: z.boolean().default(false),
  presetId: z.string().optional(),
  versionCount: z.number().int().nonnegative().default(1),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PolicySummary = z.infer<typeof PolicySummarySchema>;

export const PolicyListResponseSchema = z.object({
  policies: z.array(PolicySummarySchema),
  total: z.number().int().nonnegative(),
});
export type PolicyListResponse = z.infer<typeof PolicyListResponseSchema>;

export const PolicyVersionListResponseSchema = z.object({
  policyId: z.string(),
  name: z.string(),
  versions: z.array(PolicyVersionRecordSchema),
  total: z.number().int().nonnegative(),
});
export type PolicyVersionListResponse = z.infer<typeof PolicyVersionListResponseSchema>;

/**
 * Request payload for creating a new policy and its initial version.
 */
export const CreatePolicyRequestSchema = z.object({
  name: z.string().min(1, "Policy name is required").max(120),
  sourceMandate: z.string().min(1, "Source mandate is required").max(5000),
  policy: PolicyDocumentSchema,
  intent: ConfirmedIntentSchema,
  confirmationState: ConfirmationStateZodSchema.default("CONFIRMED"),
});
export type CreatePolicyRequest = z.infer<typeof CreatePolicyRequestSchema>;

/**
 * Request payload for creating a new version of an existing policy.
 */
export const CreatePolicyVersionRequestSchema = z.object({
  sourceMandateSnapshot: z.string().max(5000).optional(),
  policy: PolicyDocumentSchema,
  intent: ConfirmedIntentSchema,
  confirmationState: ConfirmationStateZodSchema.default("CONFIRMED"),
});
export type CreatePolicyVersionRequest = z.infer<typeof CreatePolicyVersionRequestSchema>;

/**
 * Persisted test run record summary.
 */
export const PersistedTestRunSummarySchema = z.object({
  id: z.string(),
  policyVersionId: z.string(),
  policyHash: z.string().length(64),
  domainId: z.string(),
  domainVersion: z.string(),
  status: z.enum(RunStatusValues),
  candidateLimit: z.number().int().positive(),
  candidateCount: z.number().int().nonnegative(),
  exploredCount: z.number().int().nonnegative(),
  findingCount: z.number().int().nonnegative(),
  unresolvedCount: z.number().int().nonnegative().optional(),
  stopReason: z.string().nullable().optional(),
  exhausted: z.boolean(),
  durationMs: z.number().int().nonnegative(),
  startedAt: z.string().nullable().optional(),
  finishedAt: z.string().nullable().optional(),
  createdAt: z.string(),
});
export type PersistedTestRunSummary = z.infer<typeof PersistedTestRunSummarySchema>;

export const TestRunListResponseSchema = z.object({
  runs: z.array(PersistedTestRunSummarySchema),
  total: z.number().int().nonnegative(),
});
export type TestRunListResponse = z.infer<typeof TestRunListResponseSchema>;

/**
 * Full detail of a persisted test run including the report and input search space.
 */
export const PersistedTestRunDetailSchema = PersistedTestRunSummarySchema.extend({
  domainDefinition: SearchSpaceDefinitionSchema,
  report: VerificationReportSchema,
});
export type PersistedTestRunDetail = z.infer<typeof PersistedTestRunDetailSchema>;
