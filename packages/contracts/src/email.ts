import { z } from "zod";

/**
 * Transactional Email Event Types
 */
export const EmailEventType = {
  APPROVAL_GRANTED: "APPROVAL_GRANTED",
  APPROVAL_REVOKED: "APPROVAL_REVOKED",
  ORDER_CAPTURED: "ORDER_CAPTURED",
  RECONCILIATION_ALERT: "RECONCILIATION_ALERT",
} as const;

export type EmailEventType = (typeof EmailEventType)[keyof typeof EmailEventType];

/**
 * Payload for Approval Granted Notification
 */
export const ApprovalGrantedEmailPayloadSchema = z.object({
  recipientEmail: z.string().email(),
  recipientName: z.string().optional(),
  approvalId: z.string().min(1),
  policyId: z.string().min(1),
  policyHash: z.string().min(1),
  spendCap: z.number().positive(),
  currency: z.string().default("USD"),
  expiresAt: z.string().datetime(),
  grantedBy: z.string().min(1),
});

export type ApprovalGrantedEmailPayload = z.infer<typeof ApprovalGrantedEmailPayloadSchema>;

/**
 * Payload for Approval Revoked Notification
 */
export const ApprovalRevokedEmailPayloadSchema = z.object({
  recipientEmail: z.string().email(),
  recipientName: z.string().optional(),
  approvalId: z.string().min(1),
  policyId: z.string().min(1),
  revokedReason: z.string().min(1),
  revokedAt: z.string().datetime(),
  revokedBy: z.string().min(1),
});

export type ApprovalRevokedEmailPayload = z.infer<typeof ApprovalRevokedEmailPayloadSchema>;

/**
 * Order Line Item for Captured Email
 */
export const OrderEmailItemSchema = z.object({
  name: z.string(),
  quantity: z.number().int().positive(),
  unitPrice: z.number().nonnegative(),
});

export type OrderEmailItem = z.infer<typeof OrderEmailItemSchema>;

/**
 * Payload for Order Captured Confirmation
 */
export const OrderCapturedEmailPayloadSchema = z.object({
  recipientEmail: z.string().email(),
  recipientName: z.string().optional(),
  orderId: z.string().min(1),
  paypalOrderId: z.string().optional(),
  captureId: z.string().optional(),
  approvalId: z.string().optional(),
  amount: z.number().positive(),
  currency: z.string().default("USD"),
  items: z.array(OrderEmailItemSchema).default([]),
  capturedAt: z.string().datetime(),
  policyHash: z.string().optional(),
});

export type OrderCapturedEmailPayload = z.infer<typeof OrderCapturedEmailPayloadSchema>;

/**
 * Payload for Reconciliation Discrepancy Alert
 */
export const ReconciliationAlertEmailPayloadSchema = z.object({
  recipientEmail: z.string().email(),
  recipientName: z.string().optional(),
  orderId: z.string().min(1),
  discrepancyType: z.string().min(1),
  expectedAmount: z.number().nonnegative(),
  actualAmount: z.number().nonnegative(),
  currency: z.string().default("USD"),
  detectedAt: z.string().datetime(),
  reason: z.string(),
});

export type ReconciliationAlertEmailPayload = z.infer<typeof ReconciliationAlertEmailPayloadSchema>;

/**
 * Generic Send Email Result
 */
export const SendEmailResultSchema = z.object({
  success: z.boolean(),
  id: z.string().optional(),
  mock: z.boolean().default(false),
  error: z.string().optional(),
});

export type SendEmailResult = z.infer<typeof SendEmailResultSchema>;
