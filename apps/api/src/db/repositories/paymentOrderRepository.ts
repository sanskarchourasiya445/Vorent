import { randomUUID } from "node:crypto";
import { eq, and } from "drizzle-orm";
import {
  paymentOrders,
  spendReservations,
  checkoutProposals,
} from "../schema.js";
import { CheckoutError } from "./checkoutProposalRepository.js";
import {
  PayPalService,
  PayPalNetworkError,
  PayPalApiError,
  PayPalConfigError,
  defaultPayPalService,
} from "../../services/paypalService.js";
import type {
  PaymentOrderRecord,
  CreatePaymentOrderRequest,
  CreatePaymentOrderResponse,
} from "@warrant/contracts";

export interface CreatePaymentOrderContext extends CreatePaymentOrderRequest {
  ownerId: string;
}

/**
 * Creates a PayPal Sandbox Checkout Order for an existing ALLOW spend reservation.
 * Follows strict state machine rules from docs/INTEGRATIONS.md:
 * 1. Verifies that the spend reservation exists and proposal was ALLOWed.
 * 2. Derives amount, currency, and idempotency key strictly from server records.
 * 3. Idempotently returns existing order if already created.
 * 4. Places reservation on RECONCILIATION_HOLD if external outcome is ambiguous (e.g. timeout).
 * 5. Transitions reservation to RESERVED with 15-minute buyer approval TTL only after order confirmed.
 */
export async function createPaymentOrder(
  db: any,
  input: CreatePaymentOrderContext,
  paypalService: PayPalService = defaultPayPalService
): Promise<CreatePaymentOrderResponse> {
  // 1. Authoritative verification of reservation and proposal
  const reservationsList = await db
    .select()
    .from(spendReservations)
    .where(eq(spendReservations.id, input.reservationId));

  const reservation = reservationsList[0];
  if (!reservation) {
    throw new CheckoutError(
      "RESERVATION_NOT_FOUND",
      `Spend reservation ${input.reservationId} not found`
    );
  }

  if (reservation.ownerId !== input.ownerId) {
    throw new CheckoutError(
      "FORBIDDEN_RESERVATION",
      "Spend reservation belongs to a different owner"
    );
  }

  if (reservation.proposalId !== input.proposalId) {
    throw new CheckoutError(
      "RESERVATION_PROPOSAL_MISMATCH",
      `Reservation ${input.reservationId} does not match proposal ${input.proposalId}`
    );
  }

  const proposalsList = await db
    .select()
    .from(checkoutProposals)
    .where(eq(checkoutProposals.id, input.proposalId));

  const proposal = proposalsList[0];
  if (!proposal) {
    throw new CheckoutError(
      "PROPOSAL_NOT_FOUND",
      `Checkout proposal ${input.proposalId} not found`
    );
  }

  if (proposal.decision !== "ALLOW") {
    throw new CheckoutError(
      "PROPOSAL_NOT_ALLOWED",
      `Payment order creation requires an ALLOW decision (current: ${proposal.decision})`
    );
  }

  // 2. Check for existing payment order (Idempotency and Reconciliation)
  const existingOrders = await db
    .select()
    .from(paymentOrders)
    .where(eq(paymentOrders.reservationId, input.reservationId));

  if (existingOrders.length > 0) {
    const existing = existingOrders[0];
    if (existing.providerOrderId) {
      // Idempotent return of already created order
      return {
        order: {
          id: existing.id,
          ownerId: existing.ownerId,
          proposalId: existing.proposalId,
          reservationId: existing.reservationId,
          provider: "PAYPAL_SANDBOX",
          providerOrderId: existing.providerOrderId,
          idempotencyKey: existing.idempotencyKey,
          status: existing.status as any,
          amountMinor: Number(existing.amountMinor),
          currency: existing.currency,
          createdAt: existing.createdAt instanceof Date ? existing.createdAt.toISOString() : existing.createdAt,
          updatedAt: existing.updatedAt instanceof Date ? existing.updatedAt.toISOString() : existing.updatedAt,
        },
        paypalOrderId: existing.providerOrderId,
        reservationState: reservation.state as any,
      };
    }

    if (existing.status === "UNKNOWN_REQUIRES_RECONCILIATION") {
      throw new CheckoutError(
        "RECONCILIATION_REQUIRED",
        "Previous order creation outcome is ambiguous and requires manual reconciliation before retry."
      );
    }
  }

  // 3. Verify reservation state
  if (reservation.state !== "ORDER_CREATION_PENDING") {
    if (reservation.state === "RECONCILIATION_HOLD") {
      throw new CheckoutError(
        "RECONCILIATION_HOLD",
        "Spend reservation is held pending reconciliation."
      );
    }
    if (reservation.state === "RESERVED") {
      throw new CheckoutError(
        "RESERVATION_ALREADY_COMMITTED",
        "Spend reservation has already been transitioned to an order."
      );
    }
    if (reservation.state === "RELEASED") {
      throw new CheckoutError(
        "RESERVATION_RELEASED",
        "Spend reservation has already expired or been released."
      );
    }
    throw new CheckoutError(
      "INVALID_RESERVATION_STATE",
      `Cannot create payment order in reservation state ${reservation.state}`
    );
  }

  // 4. Derive authoritative parameters
  const amountMinor = Number(reservation.amountMinor);
  const currency = reservation.currency;
  const idempotencyKey = `warrant:res:${reservation.id}`;

  // 5. Call external PayPal Sandbox API
  let paypalOrder: { id: string; status: string; approvalUrl?: string };
  try {
    paypalOrder = await paypalService.createOrder({
      reservationId: reservation.id,
      amountMinor,
      currency,
      idempotencyKey,
    });
  } catch (err: unknown) {
    if (err instanceof PayPalNetworkError && err.isAmbiguous) {
      // Ambiguous outcome: The order might exist in PayPal. Place reservation on RECONCILIATION_HOLD.
      const now = new Date();
      await db.transaction(async (tx: any) => {
        await tx
          .update(spendReservations)
          .set({
            state: "RECONCILIATION_HOLD",
            expiresAt: null, // Indefinite hold until reconciled
            updatedAt: now,
          })
          .where(eq(spendReservations.id, reservation.id));

        await tx.insert(paymentOrders).values({
          id: randomUUID(),
          ownerId: input.ownerId,
          proposalId: input.proposalId,
          reservationId: input.reservationId,
          provider: "PAYPAL_SANDBOX",
          providerOrderId: null,
          idempotencyKey,
          status: "UNKNOWN_REQUIRES_RECONCILIATION",
          amountMinor,
          currency,
          createdAt: now,
          updatedAt: now,
        });
      });

      throw new CheckoutError(
        "ORDER_CREATION_AMBIGUOUS",
        "External order creation outcome is ambiguous due to network interruption. Reservation placed on RECONCILIATION_HOLD to prevent budget overspend."
      );
    }

    if (err instanceof PayPalApiError) {
      throw new CheckoutError(
        "PAYPAL_API_ERROR",
        err.message
      );
    }

    if (err instanceof PayPalConfigError) {
      throw new CheckoutError(
        "PAYPAL_CONFIG_ERROR",
        err.message
      );
    }

    throw err;
  }

  // 6. Confirmed success: Persist order and transition reservation atomically
  const now = new Date();
  const orderId = randomUUID();
  const buyerApprovalExpiry = new Date(Date.now() + 15 * 60 * 1000); // 15-minute buyer-approval TTL

  const [persistedOrder] = await db.transaction(async (tx: any) => {
    const [insertedOrder] = await tx
      .insert(paymentOrders)
      .values({
        id: orderId,
        ownerId: input.ownerId,
        proposalId: input.proposalId,
        reservationId: input.reservationId,
        provider: "PAYPAL_SANDBOX",
        providerOrderId: paypalOrder.id,
        idempotencyKey,
        status: "CREATED",
        amountMinor,
        currency,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    await tx
      .update(spendReservations)
      .set({
        state: "RESERVED",
        expiresAt: buyerApprovalExpiry,
        updatedAt: now,
      })
      .where(eq(spendReservations.id, reservation.id));

    return [insertedOrder];
  });

  return {
    order: {
      id: persistedOrder.id,
      ownerId: persistedOrder.ownerId,
      proposalId: persistedOrder.proposalId,
      reservationId: persistedOrder.reservationId,
      provider: "PAYPAL_SANDBOX",
      providerOrderId: persistedOrder.providerOrderId,
      idempotencyKey: persistedOrder.idempotencyKey,
      status: persistedOrder.status as any,
      amountMinor: Number(persistedOrder.amountMinor),
      currency: persistedOrder.currency,
      createdAt: persistedOrder.createdAt instanceof Date ? persistedOrder.createdAt.toISOString() : persistedOrder.createdAt,
      updatedAt: persistedOrder.updatedAt instanceof Date ? persistedOrder.updatedAt.toISOString() : persistedOrder.updatedAt,
    },
    paypalOrderId: paypalOrder.id,
    reservationState: "RESERVED",
    approvalUrl: paypalOrder.approvalUrl,
  };
}

/**
 * Retrieves a payment order by ID with ownership scope check.
 */
export async function getPaymentOrder(
  db: any,
  orderId: string,
  ownerId?: string
): Promise<PaymentOrderRecord | null> {
  let query = db
    .select()
    .from(paymentOrders)
    .where(eq(paymentOrders.id, orderId));

  if (ownerId) {
    query = query.where(and(eq(paymentOrders.id, orderId), eq(paymentOrders.ownerId, ownerId)));
  }

  const list = await query;
  const o = list[0];
  if (!o) return null;

  return {
    id: o.id,
    ownerId: o.ownerId,
    proposalId: o.proposalId,
    reservationId: o.reservationId,
    provider: "PAYPAL_SANDBOX",
    providerOrderId: o.providerOrderId,
    idempotencyKey: o.idempotencyKey,
    status: o.status as any,
    amountMinor: Number(o.amountMinor),
    currency: o.currency,
    createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : o.createdAt,
    updatedAt: o.updatedAt instanceof Date ? o.updatedAt.toISOString() : o.updatedAt,
  };
}
