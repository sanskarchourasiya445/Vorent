import { z } from "zod";
import { DecisionZodSchema, ReservationStateZodSchema } from "./enums.js";
import { CartSchema, EvidenceSnapshotSchema } from "./cart.js";

/**
 * Checkout Nonce Record Schema
 */
export const CheckoutNonceRecordSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  approvalId: z.string().uuid(),
  policyVersionId: z.string().uuid(),
  policyHash: z.string().length(64),
  nonceHash: z.string().length(64),
  expiresAt: z.union([z.string().datetime(), z.date()]),
  consumedAt: z.union([z.string().datetime(), z.date()]).nullable(),
  createdAt: z.union([z.string().datetime(), z.date()]),
});

export type CheckoutNonceRecord = z.infer<typeof CheckoutNonceRecordSchema>;

/**
 * Create Checkout Nonce Request
 */
export const CreateCheckoutNonceRequestSchema = z.object({
  approvalId: z.string().uuid(),
  policyVersionId: z.string().uuid(),
  policyHash: z.string().length(64),
  ttlSeconds: z.number().int().min(10).max(3600).default(300),
});

export type CreateCheckoutNonceRequest = z.infer<typeof CreateCheckoutNonceRequestSchema>;

/**
 * Submit Checkout Proposal Request
 */
export const SubmitCheckoutProposalRequestSchema = z.object({
  approvalId: z.string().uuid(),
  policyVersionId: z.string().uuid(),
  policyHash: z.string().length(64),
  nonceId: z.string().uuid(),
  cart: CartSchema,
  evidenceSnapshot: EvidenceSnapshotSchema,
});

export type SubmitCheckoutProposalRequest = z.infer<typeof SubmitCheckoutProposalRequestSchema>;

/**
 * Spend Reservation Record Schema
 */
export const SpendReservationRecordSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  approvalId: z.string().uuid(),
  proposalId: z.string().uuid(),
  amountMinor: z.number().int().nonnegative(),
  currency: z.string().length(3),
  state: ReservationStateZodSchema,
  expiresAt: z.union([z.string().datetime(), z.date()]).nullable().optional(),
  createdAt: z.union([z.string().datetime(), z.date()]),
  updatedAt: z.union([z.string().datetime(), z.date()]),
});

export type SpendReservationRecord = z.infer<typeof SpendReservationRecordSchema>;

/**
 * Checkout Proposal Record Schema
 */
export const CheckoutProposalRecordSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  approvalId: z.string().uuid(),
  policyVersionId: z.string().uuid(),
  policyHash: z.string().length(64),
  consumedNonceId: z.string().uuid(),
  cartHash: z.string().length(64),
  proposedCart: CartSchema,
  normalizedCart: CartSchema,
  evidenceSnapshot: EvidenceSnapshotSchema,
  decision: DecisionZodSchema,
  reasonCodes: z.array(z.string()),
  ruleTrace: z.array(z.any()),
  evaluatedAt: z.union([z.string().datetime(), z.date()]),
  createdAt: z.union([z.string().datetime(), z.date()]),
});

export type CheckoutProposalRecord = z.infer<typeof CheckoutProposalRecordSchema>;

/**
 * Submit Checkout Proposal Result
 */
export const SubmitCheckoutProposalResponseSchema = z.object({
  proposal: CheckoutProposalRecordSchema,
  reservation: SpendReservationRecordSchema.nullable(),
  decision: DecisionZodSchema,
  reasonCodes: z.array(z.string()),
});

export type SubmitCheckoutProposalResponse = z.infer<typeof SubmitCheckoutProposalResponseSchema>;
