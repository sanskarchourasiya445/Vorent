import { z } from "zod";
import { DecisionZodSchema, ReasonCodeZodSchema, RuleOutcomeZodSchema } from "./enums.js";
import { CartSchema, EvidenceSnapshotSchema } from "./cart.js";
import { PolicyDocumentSchema } from "./policy.js";

/**
 * Audit trace for an individual rule evaluated by the deterministic engine.
 */
export const RuleEvaluationTraceSchema = z.object({
  ruleId: z.string().min(1, "Rule ID must not be empty"),
  ruleName: z.string().min(1, "Rule name must not be empty"),
  outcome: RuleOutcomeZodSchema,
  reasonCode: ReasonCodeZodSchema.optional(),
  message: z.string(),
});

export type RuleEvaluationTrace = z.infer<typeof RuleEvaluationTraceSchema>;

/**
 * Minimal evaluation metadata.
 */
export const EvaluationMetadataSchema = z.object({
  evaluatorVersion: z.string().default("1.0.0"),
  itemCount: z.number().int().nonnegative(),
  cartTotalMinor: z
    .number()
    .int("Cart total must be an integer")
    .nonnegative("Cart total must be non-negative integer minor units")
    .max(Number.MAX_SAFE_INTEGER, "Cart total exceeds maximum safe integer"),
  currency: z.string().min(1, "Currency must not be empty"),
  evaluatedAt: z.string().optional(),
});

export type EvaluationMetadata = z.infer<typeof EvaluationMetadataSchema>;

/**
 * Shared deterministic policy evaluation result.
 * Enforces invariant: reasonCodes is non-empty and contains primaryReasonCode.
 */
export const PolicyEvaluationResultSchema = z
  .object({
    decision: DecisionZodSchema,
    primaryReasonCode: ReasonCodeZodSchema,
    reasonCodes: z.array(ReasonCodeZodSchema).min(1, "reasonCodes must not be empty"),
    ruleTrace: z.array(RuleEvaluationTraceSchema).optional(),
    metadata: EvaluationMetadataSchema.optional(),
  })
  .refine(
    (data) => data.reasonCodes.includes(data.primaryReasonCode),
    {
      message: "primaryReasonCode must be present in reasonCodes",
      path: ["primaryReasonCode"],
    },
  );

export type PolicyEvaluationResult = z.infer<typeof PolicyEvaluationResultSchema>;

/**
 * Input to pure policy evaluation.
 */
export const EvaluatePolicyInputSchema = z.object({
  policy: PolicyDocumentSchema,
  cart: CartSchema,
  evidence: EvidenceSnapshotSchema.optional(),
});

export type EvaluatePolicyInput = z.infer<typeof EvaluatePolicyInputSchema>;
