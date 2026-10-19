import { randomUUID } from "node:crypto";
import { eq, and, or, desc } from "drizzle-orm";
import {
  paymentOrders,
  spendReservations,
  checkoutProposals,
  approvals,
  webhookEvents,
  auditEvents,
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
  ConfirmBuyerApprovalRequest,
  ConfirmBuyerApprovalResponse,
  CancelPaymentOrderRequest,
  CancelPaymentOrderResponse,
  CapturePaymentOrderRequest,
  CapturePaymentOrderResponse,
  ReconcilePaymentOrderRequest,
  ReconcilePaymentOrderResponse,
  PayPalWebhookEvent,
  WebhookProcessResponse,
  PaymentStatus,
  ReservationState,
} from "@warrant/contracts";

export interface CreatePaymentOrderContext extends CreatePaymentOrderRequest {
  ownerId: string;
}

export interface ConfirmBuyerApprovalContext extends ConfirmBuyerApprovalRequest {
  ownerId: string;
}

export interface CancelPaymentOrderContext extends CancelPaymentOrderRequest {
  ownerId: string;
}

export interface CapturePaymentOrderContext extends CapturePaymentOrderRequest {
  ownerId: string;
}

export interface ReconcilePaymentOrderContext extends ReconcilePaymentOrderRequest {
  ownerId: string;
}

function mapPaymentOrderRecord(o: any): PaymentOrderRecord {
  return {
    id: o.id,
    ownerId: o.ownerId,
    proposalId: o.proposalId,
    reservationId: o.reservationId,
    provider: "PAYPAL_SANDBOX",
    providerOrderId: o.providerOrderId,
    idempotencyKey: o.idempotencyKey,
    status: o.status as PaymentStatus,
    payerId: o.payerId ?? null,
    captureId: o.captureId ?? null,
    amountMinor: Number(o.amountMinor),
    currency: o.currency,
    createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : o.createdAt,
    updatedAt: o.updatedAt instanceof Date ? o.updatedAt.toISOString() : o.updatedAt,
  };
}

// Explicit state machine transitions
const LEGAL_PAYMENT_STATUS_TRANSITIONS: Record<string, string[]> = {
  CREATED: ["APPROVED", "CANCELLED", "FAILED", "UNKNOWN_REQUIRES_RECONCILIATION"],
  PAYER_ACTION_REQUIRED: ["APPROVED", "CANCELLED", "FAILED", "UNKNOWN_REQUIRES_RECONCILIATION"],
  APPROVED: ["CAPTURE_PENDING", "CAPTURED", "CANCELLED", "FAILED", "UNKNOWN_REQUIRES_RECONCILIATION"],
  CAPTURE_PENDING: ["CAPTURED", "FAILED", "UNKNOWN_REQUIRES_RECONCILIATION"],
  CAPTURED: [], // Terminal
  CANCELLED: [], // Terminal
  FAILED: ["UNKNOWN_REQUIRES_RECONCILIATION"],
  UNKNOWN_REQUIRES_RECONCILIATION: ["APPROVED", "CAPTURED", "CANCELLED", "FAILED"],
};

export function canTransitionPaymentStatus(current: string, next: string): boolean {
  if (current === next) return true;
  const allowed = LEGAL_PAYMENT_STATUS_TRANSITIONS[current] ?? [];
  return allowed.includes(next);
}

/**
 * Creates a PayPal Sandbox Checkout Order for an existing ALLOW spend reservation.
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
      return {
        order: mapPaymentOrderRecord(existing),
        paypalOrderId: existing.providerOrderId,
        reservationState: reservation.state as ReservationState,
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
      const now = new Date();
      await db.transaction(async (tx: any) => {
        await tx
          .update(spendReservations)
          .set({
            state: "RECONCILIATION_HOLD",
            expiresAt: null,
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
      throw new CheckoutError("PAYPAL_API_ERROR", err.message);
    }

    if (err instanceof PayPalConfigError) {
      throw new CheckoutError("PAYPAL_CONFIG_ERROR", err.message);
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
    order: mapPaymentOrderRecord(persistedOrder),
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
  const condition = ownerId
    ? and(eq(paymentOrders.id, orderId), eq(paymentOrders.ownerId, ownerId))
    : eq(paymentOrders.id, orderId);

  const list = await db.select().from(paymentOrders).where(condition);
  const o = list[0];
  if (!o) return null;

  return mapPaymentOrderRecord(o);
}

/**
 * Helper to find order by internal UUID or PayPal provider order ID.
 */
async function findOrderByIdOrProviderId(
  db: any,
  input: { orderId?: string; paypalOrderId?: string },
  ownerId?: string
) {
  let baseCondition;
  if (input.orderId && input.paypalOrderId) {
    baseCondition = or(
      eq(paymentOrders.id, input.orderId),
      eq(paymentOrders.providerOrderId, input.paypalOrderId)
    );
  } else if (input.orderId) {
    baseCondition = eq(paymentOrders.id, input.orderId);
  } else if (input.paypalOrderId) {
    baseCondition = eq(paymentOrders.providerOrderId, input.paypalOrderId);
  } else {
    throw new CheckoutError("BAD_REQUEST", "Either orderId or paypalOrderId must be provided");
  }

  const finalCondition = ownerId
    ? and(baseCondition, eq(paymentOrders.ownerId, ownerId))
    : baseCondition;

  const list = await db.select().from(paymentOrders).where(finalCondition);
  return list[0] ?? null;
}

/**
 * Confirms buyer approval upon return redirect or explicit check.
 * Validates with PayPal API that buyer has truly approved before updating local status.
 * Never treats a browser redirect alone as proof of payment or authorization to capture.
 */
export async function confirmBuyerApproval(
  db: any,
  input: ConfirmBuyerApprovalContext,
  paypalService: PayPalService = defaultPayPalService
): Promise<ConfirmBuyerApprovalResponse> {
  const order = await findOrderByIdOrProviderId(db, input, input.ownerId);
  if (!order) {
    throw new CheckoutError("ORDER_NOT_FOUND", "Payment order not found or ownership mismatch");
  }

  const reservationsList = await db
    .select()
    .from(spendReservations)
    .where(eq(spendReservations.id, order.reservationId));
  const reservation = reservationsList[0];
  if (!reservation) {
    throw new CheckoutError("RESERVATION_NOT_FOUND", "Associated spend reservation not found");
  }

  // Idempotency: If already captured, repeat visits are safe
  if (order.status === "CAPTURED") {
    return {
      order: mapPaymentOrderRecord(order),
      paypalOrderId: order.providerOrderId!,
      reservationState: reservation.state as ReservationState,
      nextAction: "NONE",
    };
  }

  // Idempotency: If already approved, return next action CAPTURE
  if (order.status === "APPROVED") {
    return {
      order: mapPaymentOrderRecord(order),
      paypalOrderId: order.providerOrderId!,
      reservationState: reservation.state as ReservationState,
      nextAction: "CAPTURE",
    };
  }

  if (order.status === "CANCELLED" || order.status === "FAILED") {
    throw new CheckoutError(
      "ORDER_TERMINAL_STATE",
      `Cannot approve order in terminal status '${order.status}'`
    );
  }

  if (!order.providerOrderId) {
    throw new CheckoutError(
      "MISSING_PROVIDER_ORDER_ID",
      "Payment order has no linked PayPal provider order ID"
    );
  }

  // Authoritatively query PayPal Orders API to confirm status
  const remoteOrder = await paypalService.getOrder(order.providerOrderId);

  if (remoteOrder.status === "APPROVED") {
    const now = new Date();
    const payerId = input.payerId || remoteOrder.payer?.payerId || order.payerId;

    const [updated] = await db
      .update(paymentOrders)
      .set({
        status: "APPROVED",
        payerId: payerId ?? null,
        updatedAt: now,
      })
      .where(eq(paymentOrders.id, order.id))
      .returning();

    return {
      order: mapPaymentOrderRecord(updated),
      paypalOrderId: order.providerOrderId,
      reservationState: reservation.state as ReservationState,
      nextAction: "CAPTURE",
    };
  }

  if (remoteOrder.status === "COMPLETED") {
    // Order was already completed on provider side
    const now = new Date();
    const [updated] = await db.transaction(async (tx: any) => {
      const [up] = await tx
        .update(paymentOrders)
        .set({
          status: "CAPTURED",
          updatedAt: now,
        })
        .where(eq(paymentOrders.id, order.id))
        .returning();

      await tx
        .update(spendReservations)
        .set({
          state: "COMMITTED",
          updatedAt: now,
        })
        .where(eq(spendReservations.id, reservation.id));

      return [up];
    });

    return {
      order: mapPaymentOrderRecord(updated),
      paypalOrderId: order.providerOrderId,
      reservationState: "COMMITTED",
      nextAction: "NONE",
    };
  }

  if (remoteOrder.status === "VOIDED") {
    await db.transaction(async (tx: any) => {
      await tx
        .update(paymentOrders)
        .set({ status: "CANCELLED", updatedAt: new Date() })
        .where(eq(paymentOrders.id, order.id));
      await tx
        .update(spendReservations)
        .set({ state: "RELEASED", updatedAt: new Date() })
        .where(eq(spendReservations.id, reservation.id));
    });

    throw new CheckoutError(
      "ORDER_VOIDED_ON_PAYPAL",
      "PayPal order was voided or cancelled by buyer."
    );
  }

  // Still CREATED or PAYER_ACTION_REQUIRED: Buyer has not completed approval
  throw new CheckoutError(
    "BUYER_NOT_APPROVED",
    `Buyer has not completed approval on PayPal (current status: ${remoteOrder.status}).`
  );
}

/**
 * Cancels a payment order and safely releases spend reservation if confirmed not captured.
 */
export async function cancelPaymentOrder(
  db: any,
  input: CancelPaymentOrderContext,
  paypalService: PayPalService = defaultPayPalService
): Promise<CancelPaymentOrderResponse> {
  const order = await findOrderByIdOrProviderId(db, input, input.ownerId);
  if (!order) {
    throw new CheckoutError("ORDER_NOT_FOUND", "Payment order not found or ownership mismatch");
  }

  const reservationsList = await db
    .select()
    .from(spendReservations)
    .where(eq(spendReservations.id, order.reservationId));
  const reservation = reservationsList[0];
  if (!reservation) {
    throw new CheckoutError("RESERVATION_NOT_FOUND", "Associated spend reservation not found");
  }

  // Idempotency: If already cancelled, return cleanly
  if (order.status === "CANCELLED") {
    return {
      order: mapPaymentOrderRecord(order),
      reservationState: reservation.state as ReservationState,
      cancelled: true,
    };
  }

  // Never allow cancelling a captured order
  if (order.status === "CAPTURED" || reservation.state === "COMMITTED") {
    throw new CheckoutError(
      "CANNOT_CANCEL_CAPTURED_ORDER",
      "Order has already been captured and cannot be cancelled."
    );
  }

  // If order was created on PayPal, check provider to ensure it was not captured
  if (order.providerOrderId) {
    try {
      const remoteOrder = await paypalService.getOrder(order.providerOrderId);
      if (remoteOrder.status === "COMPLETED") {
        throw new CheckoutError(
          "CANNOT_CANCEL_COMPLETED_ORDER",
          "Order has already been completed on PayPal and cannot be cancelled."
        );
      }
    } catch (err: unknown) {
      if (err instanceof CheckoutError) throw err;
      // If ambiguous, do not release reservation; hold it
      if (err instanceof PayPalNetworkError) {
        await db.update(spendReservations).set({
          state: "RECONCILIATION_HOLD",
          updatedAt: new Date(),
        }).where(eq(spendReservations.id, reservation.id));
        throw new CheckoutError(
          "RECONCILIATION_HOLD",
          "Could not verify PayPal status before cancellation. Reservation placed on RECONCILIATION_HOLD."
        );
      }
    }
  }

  // Atomically update order to CANCELLED and reservation to RELEASED
  const now = new Date();
  const [updatedOrder] = await db.transaction(async (tx: any) => {
    const [up] = await tx
      .update(paymentOrders)
      .set({
        status: "CANCELLED",
        updatedAt: now,
      })
      .where(eq(paymentOrders.id, order.id))
      .returning();

    await tx
      .update(spendReservations)
      .set({
        state: "RELEASED",
        updatedAt: now,
      })
      .where(eq(spendReservations.id, reservation.id));

    return [up];
  });

  return {
    order: mapPaymentOrderRecord(updatedOrder),
    reservationState: "RELEASED",
    cancelled: true,
  };
}

/**
 * Server-Side Capture:
 * Authenticated, ownership-checked capture endpoint.
 * All amounts, currency, policy version/hash, approval, proposal, reservation, and provider
 * order IDs are loaded strictly from trusted database records.
 * Client-supplied amounts or currencies are never accepted.
 */
export async function capturePaymentOrder(
  db: any,
  input: CapturePaymentOrderContext,
  paypalService: PayPalService = defaultPayPalService
): Promise<CapturePaymentOrderResponse> {
  const order = await findOrderByIdOrProviderId(db, input, input.ownerId);
  if (!order) {
    throw new CheckoutError("ORDER_NOT_FOUND", "Payment order not found or ownership mismatch");
  }

  // Load all linked records strictly from database
  const reservationsList = await db
    .select()
    .from(spendReservations)
    .where(eq(spendReservations.id, order.reservationId));
  const reservation = reservationsList[0];
  if (!reservation) {
    throw new CheckoutError("RESERVATION_NOT_FOUND", "Linked spend reservation not found");
  }

  const proposalsList = await db
    .select()
    .from(checkoutProposals)
    .where(eq(checkoutProposals.id, order.proposalId));
  const proposal = proposalsList[0];
  if (!proposal) {
    throw new CheckoutError("PROPOSAL_NOT_FOUND", "Linked checkout proposal not found");
  }

  const approvalsList = await db
    .select()
    .from(approvals)
    .where(eq(approvals.id, reservation.approvalId));
  const approval = approvalsList[0];
  if (!approval) {
    throw new CheckoutError("APPROVAL_NOT_FOUND", "Linked approval checkpoint not found");
  }

  // Idempotency: If already captured, return existing capture record
  if (order.status === "CAPTURED" && order.captureId) {
    return {
      order: mapPaymentOrderRecord(order),
      captureId: order.captureId,
      paypalOrderId: order.providerOrderId!,
      status: "CAPTURED",
      reservationState: reservation.state as ReservationState,
      capturedAmountMinor: Number(order.amountMinor),
      currency: order.currency,
    };
  }

  // Security Precondition 1: Order must be in APPROVED state
  if (order.status !== "APPROVED") {
    throw new CheckoutError(
      "ORDER_NOT_ELIGIBLE_FOR_CAPTURE",
      `Payment order is in state '${order.status}'. Capture requires 'APPROVED' status from buyer.`
    );
  }

  // Security Precondition 2: Approval must remain active and unrevoked
  if (approval.revokedAt) {
    throw new CheckoutError("REVOKED_APPROVAL", "Approval has been revoked prior to capture.");
  }
  if (new Date(approval.expiresAt).getTime() <= Date.now()) {
    throw new CheckoutError("EXPIRED_APPROVAL", "Approval has expired prior to capture.");
  }

  // Security Precondition 3: Policy binding must remain intact
  if (approval.policyHash !== proposal.policyHash) {
    throw new CheckoutError(
      "POLICY_HASH_MISMATCH",
      "Approval policy hash does not match proposal policy hash."
    );
  }

  // Security Precondition 4: Reservation must be in RESERVED state
  if (reservation.state !== "RESERVED") {
    throw new CheckoutError(
      "INVALID_RESERVATION_STATE",
      `Spend reservation is in state '${reservation.state}'. Expected 'RESERVED'.`
    );
  }

  // Security Precondition 5: Internal amounts and currency must match
  if (
    Number(reservation.amountMinor) !== Number(order.amountMinor) ||
    reservation.currency !== order.currency
  ) {
    throw new CheckoutError(
      "INTEGRITY_MISMATCH",
      "Spend reservation amount or currency does not match payment order."
    );
  }

  if (!order.providerOrderId) {
    throw new CheckoutError("MISSING_PROVIDER_ORDER_ID", "Order missing PayPal provider order ID");
  }

  // PayPal capture with supported idempotency header
  const captureIdempotencyKey = `warrant:cap:${order.id}`;

  let captureResult: {
    orderId: string;
    orderStatus: string;
    captureId: string;
    captureStatus: string;
    amount: { currencyCode: string; value: string };
  };

  try {
    captureResult = await paypalService.captureOrder({
      orderId: order.providerOrderId,
      idempotencyKey: captureIdempotencyKey,
    });
  } catch (err: unknown) {
    // Ambiguous outcome (timeout, 5xx): NEVER retry blindly or release reservation.
    // Transition both order and reservation to RECONCILIATION_HOLD.
    if (err instanceof PayPalNetworkError && err.isAmbiguous) {
      const now = new Date();
      await db.transaction(async (tx: any) => {
        await tx
          .update(paymentOrders)
          .set({
            status: "UNKNOWN_REQUIRES_RECONCILIATION",
            updatedAt: now,
          })
          .where(eq(paymentOrders.id, order.id));

        await tx
          .update(spendReservations)
          .set({
            state: "RECONCILIATION_HOLD",
            expiresAt: null,
            updatedAt: now,
          })
          .where(eq(spendReservations.id, reservation.id));
      });

      throw new CheckoutError(
        "CAPTURE_OUTCOME_AMBIGUOUS",
        "PayPal capture timed out or encountered an ambiguous network outcome. Order held for reconciliation to prevent double charges."
      );
    }

    if (err instanceof PayPalApiError) {
      throw new CheckoutError("PAYPAL_CAPTURE_FAILED", err.message);
    }

    throw err;
  }

  // Validate provider response amount matches trusted reservation amount
  const expectedAmountFormatted = (Number(order.amountMinor) / 100).toFixed(2);
  if (
    captureResult.amount.currencyCode !== order.currency ||
    captureResult.amount.value !== expectedAmountFormatted
  ) {
    // Discrepancy between capture amount and database order amount
    await db.transaction(async (tx: any) => {
      await tx
        .update(paymentOrders)
        .set({
          status: "UNKNOWN_REQUIRES_RECONCILIATION",
          captureId: captureResult.captureId,
          updatedAt: new Date(),
        })
        .where(eq(paymentOrders.id, order.id));

      await tx
        .update(spendReservations)
        .set({
          state: "RECONCILIATION_HOLD",
          updatedAt: new Date(),
        })
        .where(eq(spendReservations.id, reservation.id));
    });

    throw new CheckoutError(
      "CAPTURE_AMOUNT_MISMATCH",
      `Captured amount (${captureResult.amount.value} ${captureResult.amount.currencyCode}) does not match authorized order (${expectedAmountFormatted} ${order.currency}).`
    );
  }

  const isCompleted = captureResult.captureStatus === "COMPLETED";
  const finalStatus: PaymentStatus = isCompleted ? "CAPTURED" : "CAPTURE_PENDING";
  const finalReservationState: ReservationState = isCompleted ? "COMMITTED" : "RESERVED";
  const now = new Date();

  const [persistedOrder] = await db.transaction(async (tx: any) => {
    const [up] = await tx
      .update(paymentOrders)
      .set({
        status: finalStatus,
        captureId: captureResult.captureId,
        updatedAt: now,
      })
      .where(eq(paymentOrders.id, order.id))
      .returning();

    await tx
      .update(spendReservations)
      .set({
        state: finalReservationState,
        updatedAt: now,
      })
      .where(eq(spendReservations.id, reservation.id));

    return [up];
  });

  return {
    order: mapPaymentOrderRecord(persistedOrder),
    captureId: captureResult.captureId,
    paypalOrderId: order.providerOrderId,
    status: finalStatus,
    reservationState: finalReservationState,
    capturedAmountMinor: Number(persistedOrder.amountMinor),
    currency: persistedOrder.currency,
  };
}

/**
 * Reconciles an order against PayPal Orders and Captures APIs.
 * Resolves ambiguous states, missing webhooks, and DB mismatches safely.
 */
export async function reconcilePaymentOrder(
  db: any,
  input: ReconcilePaymentOrderContext,
  paypalService: PayPalService = defaultPayPalService
): Promise<ReconcilePaymentOrderResponse> {
  const order = await findOrderByIdOrProviderId(db, input, input.ownerId);
  if (!order) {
    throw new CheckoutError("ORDER_NOT_FOUND", "Payment order not found or ownership mismatch");
  }

  const reservationsList = await db
    .select()
    .from(spendReservations)
    .where(eq(spendReservations.id, order.reservationId));
  const reservation = reservationsList[0];
  if (!reservation) {
    throw new CheckoutError("RESERVATION_NOT_FOUND", "Linked spend reservation not found");
  }

  if (!order.providerOrderId) {
    return {
      order: mapPaymentOrderRecord(order),
      reservationState: reservation.state as ReservationState,
      reconciled: false,
      notes: "Cannot reconcile order without a PayPal providerOrderId.",
    };
  }

  const remoteOrder = await paypalService.getOrder(order.providerOrderId);
  const now = new Date();
  let updatedOrder = order;
  let finalReservationState = reservation.state;

  if (remoteOrder.status === "COMPLETED") {
    const capture = remoteOrder.purchaseUnits?.[0]?.payments?.captures?.[0];
    const captureId = capture?.id ?? order.captureId;

    [updatedOrder] = await db.transaction(async (tx: any) => {
      const [up] = await tx
        .update(paymentOrders)
        .set({
          status: "CAPTURED",
          captureId: captureId ?? null,
          updatedAt: now,
        })
        .where(eq(paymentOrders.id, order.id))
        .returning();

      await tx
        .update(spendReservations)
        .set({
          state: "COMMITTED",
          updatedAt: now,
        })
        .where(eq(spendReservations.id, reservation.id));

      return [up];
    });
    finalReservationState = "COMMITTED";
  } else if (remoteOrder.status === "APPROVED") {
    if (order.status !== "CAPTURED") {
      [updatedOrder] = await db.transaction(async (tx: any) => {
        const [up] = await tx
          .update(paymentOrders)
          .set({
            status: "APPROVED",
            payerId: remoteOrder.payer?.payerId ?? order.payerId,
            updatedAt: now,
          })
          .where(eq(paymentOrders.id, order.id))
          .returning();

        await tx
          .update(spendReservations)
          .set({
            state: "RESERVED",
            updatedAt: now,
          })
          .where(eq(spendReservations.id, reservation.id));

        return [up];
      });
      finalReservationState = "RESERVED";
    }
  } else if (remoteOrder.status === "VOIDED") {
    if (order.status !== "CAPTURED") {
      [updatedOrder] = await db.transaction(async (tx: any) => {
        const [up] = await tx
          .update(paymentOrders)
          .set({
            status: "CANCELLED",
            updatedAt: now,
          })
          .where(eq(paymentOrders.id, order.id))
          .returning();

        await tx
          .update(spendReservations)
          .set({
            state: "RELEASED",
            updatedAt: now,
          })
          .where(eq(spendReservations.id, reservation.id));

        return [up];
      });
      finalReservationState = "RELEASED";
    }
  }

  return {
    order: mapPaymentOrderRecord(updatedOrder),
    reservationState: finalReservationState as ReservationState,
    reconciled: true,
    externalStatus: remoteOrder.status,
    notes: `Reconciled with PayPal order status '${remoteOrder.status}'.`,
  };
}

/**
 * Durably processes an incoming PayPal webhook event with signature verification and deduplication.
 */
export async function processWebhookEvent(
  db: any,
  params: {
    event: PayPalWebhookEvent;
    headers: {
      authAlgo?: string;
      certUrl?: string;
      transmissionId?: string;
      transmissionSig?: string;
      transmissionTime?: string;
    };
  },
  paypalService: PayPalService = defaultPayPalService
): Promise<WebhookProcessResponse> {
  const { event, headers } = params;

  // 1. Verify webhook signature
  if (
    !headers.authAlgo ||
    !headers.certUrl ||
    !headers.transmissionId ||
    !headers.transmissionSig ||
    !headers.transmissionTime
  ) {
    throw new CheckoutError(
      "MISSING_WEBHOOK_HEADERS",
      "Missing required PayPal webhook signature headers."
    );
  }

  const isValid = await paypalService.verifyWebhookSignature({
    authAlgo: headers.authAlgo,
    certUrl: headers.certUrl,
    transmissionId: headers.transmissionId,
    transmissionSig: headers.transmissionSig,
    transmissionTime: headers.transmissionTime,
    webhookEvent: event,
  });

  if (!isValid) {
    throw new CheckoutError(
      "WEBHOOK_SIGNATURE_VERIFICATION_FAILED",
      "PayPal webhook signature verification failed."
    );
  }

  // 2. Durable deduplication check
  const existingEvents = await db
    .select()
    .from(webhookEvents)
    .where(eq(webhookEvents.eventId, event.id));

  if (existingEvents.length > 0) {
    return {
      received: true,
      duplicate: true,
      eventId: event.id,
      eventType: event.event_type,
      actionTaken: "DUPLICATE_EVENT_IGNORED",
    };
  }

  // 3. Process event safely preventing state regressions
  let actionTaken = "EVENT_RECORDED";
  const now = new Date();

  switch (event.event_type) {
    case "CHECKOUT.ORDER.APPROVED": {
      const orderId = event.resource?.id;
      if (orderId) {
        const orderList = await db
          .select()
          .from(paymentOrders)
          .where(eq(paymentOrders.providerOrderId, orderId));
        const order = orderList[0];
        if (order && (order.status === "CREATED" || order.status === "PAYER_ACTION_REQUIRED")) {
          const payerId = event.resource?.payer?.payer_id ?? order.payerId;
          await db
            .update(paymentOrders)
            .set({ status: "APPROVED", payerId, updatedAt: now })
            .where(eq(paymentOrders.id, order.id));
          actionTaken = "ORDER_APPROVED";
        }
      }
      break;
    }

    case "PAYMENT.CAPTURE.COMPLETED": {
      const captureId = event.resource?.id;
      const orderId =
        event.resource?.supplementary_data?.related_ids?.order_id ||
        event.resource?.custom_id;

      let order: any = null;
      if (orderId) {
        const list = await db
          .select()
          .from(paymentOrders)
          .where(
            or(
              eq(paymentOrders.providerOrderId, orderId),
              eq(paymentOrders.reservationId, orderId)
            )
          );
        order = list[0];
      }

      if (!order && captureId) {
        const list = await db
          .select()
          .from(paymentOrders)
          .where(eq(paymentOrders.captureId, captureId));
        order = list[0];
      }

      if (order && order.status !== "CAPTURED") {
        await db.transaction(async (tx: any) => {
          await tx
            .update(paymentOrders)
            .set({
              status: "CAPTURED",
              captureId: captureId ?? order.captureId,
              updatedAt: now,
            })
            .where(eq(paymentOrders.id, order.id));

          await tx
            .update(spendReservations)
            .set({
              state: "COMMITTED",
              updatedAt: now,
            })
            .where(eq(spendReservations.id, order.reservationId));
        });
        actionTaken = "PAYMENT_CAPTURED_AND_COMMITTED";
      }
      break;
    }

    case "PAYMENT.CAPTURE.DENIED":
    case "PAYMENT.CAPTURE.DECLINED": {
      const captureId = event.resource?.id;
      const orderList = await db
        .select()
        .from(paymentOrders)
        .where(eq(paymentOrders.captureId, captureId));
      const order = orderList[0];
      if (order && order.status !== "CAPTURED") {
        await db.transaction(async (tx: any) => {
          await tx
            .update(paymentOrders)
            .set({ status: "FAILED", updatedAt: now })
            .where(eq(paymentOrders.id, order.id));

          await tx
            .update(spendReservations)
            .set({ state: "RECONCILIATION_HOLD", updatedAt: now })
            .where(eq(spendReservations.id, order.reservationId));
        });
        actionTaken = "CAPTURE_DENIED_HOLD";
      }
      break;
    }

    case "PAYMENT.CAPTURE.PENDING": {
      const captureId = event.resource?.id;
      const orderList = await db
        .select()
        .from(paymentOrders)
        .where(eq(paymentOrders.captureId, captureId));
      const order = orderList[0];
      if (order && order.status !== "CAPTURED") {
        await db
          .update(paymentOrders)
          .set({ status: "CAPTURE_PENDING", updatedAt: now })
          .where(eq(paymentOrders.id, order.id));
        actionTaken = "CAPTURE_MARKED_PENDING";
      }
      break;
    }

    case "PAYMENT.CAPTURE.REFUNDED":
    case "PAYMENT.CAPTURE.REVERSED": {
      // Record audit event for refunds/reversals without silently overwriting terminal CAPTURED
      await db.insert(auditEvents).values({
        id: randomUUID(),
        actorType: "PAYPAL_WEBHOOK",
        eventType: event.event_type,
        entityType: "PAYMENT_ORDER",
        payload: event.resource ?? {},
        createdAt: now,
      });
      actionTaken = "REFUND_AUDITED";
      break;
    }

    default:
      actionTaken = `UNHANDLED_EVENT_${event.event_type}`;
  }

  // 4. Durably persist event in webhookEvents
  await db.insert(webhookEvents).values({
    id: randomUUID(),
    eventId: event.id,
    eventType: event.event_type,
    resourceType: event.resource_type ?? null,
    resourceId: event.resource?.id ?? null,
    status: "PROCESSED",
    payload: event,
    createdAt: now,
    processedAt: now,
  });

  return {
    received: true,
    eventId: event.id,
    eventType: event.event_type,
    actionTaken,
  };
}

/**
 * Lists payment orders with optional filtering by status and reservation.
 */
export async function listPaymentOrders(
  db: any,
  params?: {
    ownerId?: string;
    status?: PaymentStatus;
    reservationId?: string;
    limit?: number;
  }
): Promise<{ orders: PaymentOrderRecord[]; total: number; reconciliationAlertsCount: number }> {
  const limit = Math.min(params?.limit ?? 50, 100);
  const conditions = [];

  if (params?.ownerId) conditions.push(eq(paymentOrders.ownerId, params.ownerId));
  if (params?.status) conditions.push(eq(paymentOrders.status, params.status));
  if (params?.reservationId) conditions.push(eq(paymentOrders.reservationId, params.reservationId));

  let query = db.select().from(paymentOrders);
  if (conditions.length > 0) {
    query = query.where(conditions.length === 1 ? conditions[0] : and(...conditions));
  }

  const rows = await query.orderBy(desc(paymentOrders.createdAt)).limit(limit);
  const mapped = rows.map(mapPaymentOrderRecord);

  // Count reconciliation alerts (orders requiring reconciliation)
  let alertCount = 0;
  try {
    const alertRows = await db
      .select({ id: paymentOrders.id })
      .from(paymentOrders)
      .where(eq(paymentOrders.status, "UNKNOWN_REQUIRES_RECONCILIATION"));
    alertCount = alertRows.length;
  } catch {
    // fallback
  }

  return {
    orders: mapped,
    total: mapped.length,
    reconciliationAlertsCount: alertCount,
  };
}

/**
 * Returns reconciliation alerts across payment orders and spend reservations.
 */
export async function getReconciliationAlerts(
  db: any,
  ownerId?: string
): Promise<{ unreconciledOrders: PaymentOrderRecord[]; heldReservations: any[]; totalAlerts: number }> {
  let orderQuery = db
    .select()
    .from(paymentOrders)
    .where(eq(paymentOrders.status, "UNKNOWN_REQUIRES_RECONCILIATION"));
  if (ownerId) {
    orderQuery = db
      .select()
      .from(paymentOrders)
      .where(and(eq(paymentOrders.status, "UNKNOWN_REQUIRES_RECONCILIATION"), eq(paymentOrders.ownerId, ownerId)));
  }
  const unreconciledRows = await orderQuery.orderBy(desc(paymentOrders.createdAt));
  const unreconciledOrders = unreconciledRows.map(mapPaymentOrderRecord);

  let resQuery = db
    .select()
    .from(spendReservations)
    .where(eq(spendReservations.state, "RECONCILIATION_HOLD"));
  if (ownerId) {
    resQuery = db
      .select()
      .from(spendReservations)
      .where(and(eq(spendReservations.state, "RECONCILIATION_HOLD"), eq(spendReservations.ownerId, ownerId)));
  }
  const heldReservations = await resQuery.orderBy(desc(spendReservations.createdAt));

  return {
    unreconciledOrders,
    heldReservations,
    totalAlerts: unreconciledOrders.length + heldReservations.length,
  };
}
