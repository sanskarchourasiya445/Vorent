import { z } from "zod";
import { DecisionZodSchema } from "./enums.js";
import { AuditEventRecordSchema } from "./audit.js";

/**
 * High-level verification verdict for an evidence packet.
 * - PASS: All deterministic gates and policy rules passed with verified evidence.
 * - FAIL: Deterministic rule violation detected (e.g. prohibited category, ceiling breached).
 * - WARNING: Ambiguity, missing evidence, or active reconciliation hold present.
 * - UNTESTED: Provider payment operation or verification step was not executed in this run.
 */
export const EvidenceVerificationStatusZodSchema = z.enum([
  "PASS",
  "FAIL",
  "WARNING",
  "UNTESTED",
]);
export type EvidenceVerificationStatus = z.infer<typeof EvidenceVerificationStatusZodSchema>;

/**
 * Mandate and intent specification provenance.
 */
export const MandateProvenanceSchema = z.object({
  sourceMandate: z.string(),
  intentSpec: z.record(z.unknown()),
});
export type MandateProvenance = z.infer<typeof MandateProvenanceSchema>;

/**
 * Policy snapshot and cryptographic identity.
 */
export const PolicyIdentitySchema = z.object({
  policyId: z.string(),
  policyVersionId: z.string(),
  versionNumber: z.number().int().positive(),
  policyHash: z.string().length(64),
  policyDocument: z.record(z.unknown()),
});
export type PolicyIdentity = z.infer<typeof PolicyIdentitySchema>;

/**
 * Verification proof linking to bounded search results.
 */
export const VerificationProofSchema = z.object({
  qualifyingTestRunId: z.string().nullable().optional(),
  testRunStatus: z.string(),
  candidatesExplored: z.number().int().nonnegative(),
  domainVersion: z.string(),
  zeroCriticalFindingsVerified: z.boolean(),
  findingsCount: z.number().int().nonnegative(),
  searchLimitations: z.string(),
});
export type VerificationProof = z.infer<typeof VerificationProofSchema>;

/**
 * Approval authorization binding.
 */
export const ApprovalBindingSchema = z.object({
  approvalId: z.string(),
  spendLimitMinor: z.number().int().nonnegative(),
  currency: z.string(),
  expiresAt: z.string(),
  revokedAt: z.string().nullable().optional(),
});
export type ApprovalBinding = z.infer<typeof ApprovalBindingSchema>;

/**
 * Checkout proposal evaluation details.
 */
export const CheckoutEvaluationSummarySchema = z.object({
  proposalId: z.string(),
  decision: DecisionZodSchema,
  primaryReasonCode: z.string(),
  reasonCodes: z.array(z.string()),
  evaluatedAt: z.string(),
  consumedNonceId: z.string().nullable().optional(),
  cartSnapshot: z.record(z.unknown()),
  evidenceSnapshot: z.record(z.unknown()),
  ruleTrace: z.array(z.record(z.unknown())).optional(),
});
export type CheckoutEvaluationSummary = z.infer<typeof CheckoutEvaluationSummarySchema>;

/**
 * Payment lifecycle state and provider identifiers.
 */
export const PaymentLifecycleSummarySchema = z.object({
  paymentOrderId: z.string().nullable().optional(),
  provider: z.literal("PAYPAL_SANDBOX"),
  providerOrderId: z.string().nullable().optional(),
  status: z.string().nullable().optional(),
  amountMinor: z.number().int().nonnegative().nullable().optional(),
  currency: z.string().nullable().optional(),
  reservationState: z.string().nullable().optional(),
  reconciliationStatus: z.string().nullable().optional(),
});
export type PaymentLifecycleSummary = z.infer<typeof PaymentLifecycleSummarySchema>;

/**
 * Authoritative, reproducible Evidence Packet schema.
 */
export const EvidencePacketSchema = z.object({
  packetId: z.string(),
  packetVersion: z.literal("1.0.0"),
  generatedAt: z.string(),
  packetHash: z.string().length(64),
  target: z.object({
    entityType: z.enum(["CHECKOUT_PROPOSAL", "PAYMENT_ORDER", "POLICY_VERSION"]),
    entityId: z.string(),
  }),
  mandateProvenance: MandateProvenanceSchema,
  policyIdentity: PolicyIdentitySchema,
  verificationProof: VerificationProofSchema,
  approvalBinding: ApprovalBindingSchema.nullable().optional(),
  checkoutEvaluation: CheckoutEvaluationSummarySchema.nullable().optional(),
  paymentLifecycle: PaymentLifecycleSummarySchema.nullable().optional(),
  auditEvents: z.array(AuditEventRecordSchema),
  overallStatus: EvidenceVerificationStatusZodSchema,
  redactionNotice: z.string(),
});
export type EvidencePacket = z.infer<typeof EvidencePacketSchema>;

/**
 * Envelope for evidence packet API response.
 */
export const EvidencePacketResponseSchema = z.object({
  packet: EvidencePacketSchema,
});
export type EvidencePacketResponse = z.infer<typeof EvidencePacketResponseSchema>;
