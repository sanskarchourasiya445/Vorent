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
