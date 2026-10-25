import { z } from "zod";
import { PaymentStatusZodSchema, ReservationStateZodSchema } from "./enums.js";

/**
 * Create Payment Order Request Schema
 * Only proposalId and reservationId are accepted from client.
 * Amount, currency, policy binding, and spend authorization are strictly loaded
 * from trusted server-side records.
 */
export const CreatePaymentOrderRequestSchema = z.object({
  proposalId: z.string().uuid(),
  reservationId: z.string().uuid(),
});

export type CreatePaymentOrderRequest = z.infer<typeof CreatePaymentOrderRequestSchema>;

/**
 * Payment Order Record Schema
 */
export const PaymentOrderRecordSchema = z.object({
  id: z.string().uuid(),
  ownerId: z.string().uuid(),
  proposalId: z.string().uuid(),
  reservationId: z.string().uuid(),
  provider: z.literal("PAYPAL_SANDBOX"),
  providerOrderId: z.string().nullable().optional(),
  idempotencyKey: z.string(),
  status: PaymentStatusZodSchema,
  payerId: z.string().nullable().optional(),
  captureId: z.string().nullable().optional(),
  amountMinor: z.number().int().positive(),
  currency: z.string().length(3),
  createdAt: z.union([z.string().datetime(), z.date()]),
  updatedAt: z.union([z.string().datetime(), z.date()]),
});

export type PaymentOrderRecord = z.infer<typeof PaymentOrderRecordSchema>;

/**
 * Create Payment Order Response Schema
 */
export const CreatePaymentOrderResponseSchema = z.object({
  order: PaymentOrderRecordSchema,
  paypalOrderId: z.string(),
  reservationState: ReservationStateZodSchema,
  approvalUrl: z.string().url().optional(),
});

export type CreatePaymentOrderResponse = z.infer<typeof CreatePaymentOrderResponseSchema>;

/**
 * Payment Order List Response Schema (for dashboard and order history)
 */
export const PaymentOrderListResponseSchema = z.object({
  orders: z.array(PaymentOrderRecordSchema),
  total: z.number().int().nonnegative(),
  reconciliationAlertsCount: z.number().int().nonnegative().default(0),
});

export type PaymentOrderListResponse = z.infer<typeof PaymentOrderListResponseSchema>;

/**
 * Reconciliation Alerts Response Schema (for dashboard alert indicators)
 */
export const ReconciliationAlertsResponseSchema = z.object({
  unreconciledOrders: z.array(PaymentOrderRecordSchema),
  heldReservations: z.array(z.any()),
  totalAlerts: z.number().int().nonnegative(),
});

export type ReconciliationAlertsResponse = z.infer<typeof ReconciliationAlertsResponseSchema>;

/**
 * Buyer Approval Confirmation Schema
 */
export const ConfirmBuyerApprovalRequestSchema = z
  .object({
    orderId: z.string().uuid().optional(),
    paypalOrderId: z.string().optional(),
    payerId: z.string().optional(),
  })
  .refine((data) => Boolean(data.orderId || data.paypalOrderId), {
    message: "Either orderId or paypalOrderId must be provided",
  });

export type ConfirmBuyerApprovalRequest = z.infer<typeof ConfirmBuyerApprovalRequestSchema>;

export const ConfirmBuyerApprovalResponseSchema = z.object({
  order: PaymentOrderRecordSchema,
  paypalOrderId: z.string(),
  reservationState: ReservationStateZodSchema,
  nextAction: z.enum(["CAPTURE", "NONE"]),
});

export type ConfirmBuyerApprovalResponse = z.infer<typeof ConfirmBuyerApprovalResponseSchema>;

/**
 * Cancel Payment Order Schema
 */
export const CancelPaymentOrderRequestSchema = z
  .object({
    orderId: z.string().uuid().optional(),
    paypalOrderId: z.string().optional(),
    reason: z.string().optional(),
  })
  .refine((data) => Boolean(data.orderId || data.paypalOrderId), {
    message: "Either orderId or paypalOrderId must be provided",
  });

export type CancelPaymentOrderRequest = z.infer<typeof CancelPaymentOrderRequestSchema>;

export const CancelPaymentOrderResponseSchema = z.object({
  order: PaymentOrderRecordSchema,
  reservationState: ReservationStateZodSchema,
  cancelled: z.boolean(),
});

export type CancelPaymentOrderResponse = z.infer<typeof CancelPaymentOrderResponseSchema>;

/**
 * Capture Payment Order Schema
 * Authenticated, ownership-checked capture.
 * Only orderId/paypalOrderId is accepted from client.
 * All amounts, currency, and authorization are loaded from trusted server records.
 */
export const CapturePaymentOrderRequestSchema = z
  .object({
    orderId: z.string().uuid().optional(),
    paypalOrderId: z.string().optional(),
  })
  .refine((data) => Boolean(data.orderId || data.paypalOrderId), {
    message: "Either orderId or paypalOrderId must be provided",
  });

export type CapturePaymentOrderRequest = z.infer<typeof CapturePaymentOrderRequestSchema>;

export const CapturePaymentOrderResponseSchema = z.object({
  order: PaymentOrderRecordSchema,
  captureId: z.string(),
  paypalOrderId: z.string(),
  status: PaymentStatusZodSchema,
  reservationState: ReservationStateZodSchema,
  capturedAmountMinor: z.number().int().positive(),
  currency: z.string().length(3),
});

export type CapturePaymentOrderResponse = z.infer<typeof CapturePaymentOrderResponseSchema>;

/**
 * Reconcile Payment Order Schema
 */
export const ReconcilePaymentOrderRequestSchema = z
  .object({
    orderId: z.string().uuid().optional(),
    paypalOrderId: z.string().optional(),
  })
  .refine((data) => Boolean(data.orderId || data.paypalOrderId), {
    message: "Either orderId or paypalOrderId must be provided",
  });

export type ReconcilePaymentOrderRequest = z.infer<typeof ReconcilePaymentOrderRequestSchema>;

export const ReconcilePaymentOrderResponseSchema = z.object({
  order: PaymentOrderRecordSchema,
  reservationState: ReservationStateZodSchema,
  reconciled: z.boolean(),
  externalStatus: z.string().optional(),
  notes: z.string().optional(),
});

export type ReconcilePaymentOrderResponse = z.infer<typeof ReconcilePaymentOrderResponseSchema>;

/**
 * PayPal Webhook Event Schema
 */
export const PayPalWebhookEventSchema = z
  .object({
    id: z.string(),
    event_version: z.string().optional(),
    create_time: z.string(),
    resource_type: z.string(),
    event_type: z.string(),
    summary: z.string().optional(),
    resource: z.record(z.any()),
    links: z.array(z.any()).optional(),
  })
  .passthrough();

export type PayPalWebhookEvent = z.infer<typeof PayPalWebhookEventSchema>;

export const WebhookProcessResponseSchema = z.object({
  received: z.literal(true),
  duplicate: z.boolean().optional(),
  eventId: z.string(),
  eventType: z.string(),
  actionTaken: z.string(),
});

export type WebhookProcessResponse = z.infer<typeof WebhookProcessResponseSchema>;

/**
 * PayPal Sandbox Auth Status Schema
 */
export const PayPalAuthStatusResponseSchema = z.object({
  environment: z.literal("sandbox"),
  authenticated: z.boolean(),
  hasTransactionSearchScope: z.boolean(),
  clientIdConfigured: z.boolean(),
  clientSecretConfigured: z.boolean(),
  webhookIdConfigured: z.boolean(),
  scopes: z.array(z.string()).default([]),
  message: z.string(),
});

export type PayPalAuthStatusResponse = z.infer<typeof PayPalAuthStatusResponseSchema>;

/**
 * PayPal Normalized Transaction Schema
 */
export const PayPalTransactionSchema = z.object({
  transactionId: z.string(),
  paypalReferenceId: z.string().nullable().optional(),
  status: z.string(),
  amountMinor: z.number().int(),
  currency: z.string().length(3),
  initiationDate: z.string(),
  updatedDate: z.string().nullable().optional(),
  payerEmail: z.string().nullable().optional(),
  payerName: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  feeAmountMinor: z.number().int().optional(),
  syncedToLedger: z.boolean().default(false),
  associatedOrderId: z.string().uuid().nullable().optional(),
});

export type PayPalTransaction = z.infer<typeof PayPalTransactionSchema>;

/**
 * PayPal Transaction List Response Schema
 */
export const PayPalTransactionListResponseSchema = z.object({
  transactions: z.array(PayPalTransactionSchema),
  total: z.number().int().nonnegative(),
  startDate: z.string(),
  endDate: z.string(),
  source: z.enum(["PAYPAL_TRANSACTION_SEARCH_API", "DATABASE_SYNCHRONIZED_ORDERS", "MOCK_STANDBY"]),
  permissionRequired: z.boolean().default(false),
  permissionNote: z.string().optional(),
});

export type PayPalTransactionListResponse = z.infer<typeof PayPalTransactionListResponseSchema>;

/**
 * PayPal Sync Response Schema
 */
export const PayPalSyncResponseSchema = z.object({
  success: z.boolean(),
  syncedCount: z.number().int().nonnegative(),
  updatedCount: z.number().int().nonnegative(),
  source: z.string(),
  message: z.string(),
});

export type PayPalSyncResponse = z.infer<typeof PayPalSyncResponseSchema>;

/**
 * Create Test Sandbox Order Request & Response
 */
export const CreateTestSandboxOrderRequestSchema = z.object({
  amountMinor: z.number().int().positive().default(1500),
  currency: z.string().length(3).default("USD"),
  itemDescription: z.string().default("PayPal Sandbox Test Purchase"),
});

export type CreateTestSandboxOrderRequest = z.infer<typeof CreateTestSandboxOrderRequestSchema>;

export const CreateTestSandboxOrderResponseSchema = z.object({
  id: z.string(),
  status: z.string(),
  approvalUrl: z.string().url().optional(),
  amountMinor: z.number().int(),
  currency: z.string(),
  createdAt: z.string(),
});

export type CreateTestSandboxOrderResponse = z.infer<typeof CreateTestSandboxOrderResponseSchema>;

