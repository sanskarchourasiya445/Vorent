import { z } from "zod";

/**
 * Approval status enum matching business lifecycle
 */
export const ApprovalStatusEnum = z.enum(["ACTIVE", "EXPIRED", "REVOKED"]);
export type ApprovalStatus = z.infer<typeof ApprovalStatusEnum>;

/**
 * Approval Record Schema
 */
export const ApprovalRecordSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  policyVersionId: z.string().uuid(),
  policyHash: z.string().length(64),
  policyName: z.string().optional(),
  qualifyingTestRunId: z.string().uuid(),
  spendLimitMinor: z.number().int().positive(),
  consumedSpendMinor: z.number().int().nonnegative().default(0),
  currency: z.string().length(3),
  expiresAt: z.union([z.string().datetime(), z.date()]),
  revokedAt: z.union([z.string().datetime(), z.date()]).nullable().optional(),
  createdAt: z.union([z.string().datetime(), z.date()]),
  status: ApprovalStatusEnum,
});

export type ApprovalRecord = z.infer<typeof ApprovalRecordSchema>;

/**
 * Create Approval Request Schema
 */
export const CreateApprovalRequestSchema = z.object({
  policyVersionId: z.string().uuid(),
  policyHash: z.string().length(64),
  qualifyingTestRunId: z.string().uuid(),
  spendLimitMinor: z.number().int().positive(),
  currency: z.string().length(3),
  expiresInHours: z.number().int().min(1).max(8760).default(24),
});

export type CreateApprovalRequest = z.infer<typeof CreateApprovalRequestSchema>;

/**
 * Approval List Response Schema
 */
export const ApprovalListResponseSchema = z.object({
  approvals: z.array(ApprovalRecordSchema),
  total: z.number().int().nonnegative(),
});

export type ApprovalListResponse = z.infer<typeof ApprovalListResponseSchema>;

/**
 * Revoke Approval Response Schema
 */
export const RevokeApprovalResponseSchema = z.object({
  success: z.boolean(),
  approval: ApprovalRecordSchema,
});

export type RevokeApprovalResponse = z.infer<typeof RevokeApprovalResponseSchema>;
