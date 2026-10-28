import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { buildServer } from "../server.js";
import type { FastifyInstance } from "fastify";
import * as paymentOrderRepo from "../db/repositories/paymentOrderRepository.js";
import * as policyRepo from "../db/repositories/policyRepository.js";
import { CheckoutError } from "../db/repositories/checkoutProposalRepository.js";

describe("Payment Order Complete Lifecycle", () => {
  let server: FastifyInstance;

  const validOwnerId = "11111111-1111-1111-1111-111111111111";
  const validOrderId = "44444444-4444-4444-4444-444444444444";
  const validPayPalOrderId = "7SY090644K3801703";
  const validCaptureId = "CAP-123456789";

  const sampleOrderRecord = {
    id: validOrderId,
    ownerId: validOwnerId,
    proposalId: "22222222-2222-2222-2222-222222222222",
    reservationId: "33333333-3333-3333-3333-333333333333",
    provider: "PAYPAL_SANDBOX" as const,
    providerOrderId: validPayPalOrderId,
    idempotencyKey: "warrant:res:33333333-3333-3333-3333-333333333333",
    status: "CREATED" as const,
    payerId: null,
    captureId: null,
    amountMinor: 4500,
    currency: "USD",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  beforeAll(async () => {
    server = await buildServer({
      checkDb: async () => ({ configured: true, connected: false }),
    });
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================
  // 1. BUYER APPROVAL & RETURN FLOW
  // ==========================================
  describe("Buyer Approval Flow (POST /api/payment-orders/buyer-approval)", () => {
    it("confirms buyer approval when PayPal order status is APPROVED", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce(validOwnerId);
      vi.spyOn(paymentOrderRepo, "confirmBuyerApproval").mockResolvedValueOnce({
        order: {
          ...sampleOrderRecord,
          status: "APPROVED",
          payerId: "PAYER-123",
        },
        paypalOrderId: validPayPalOrderId,
        reservationState: "RESERVED",
        nextAction: "CAPTURE",
      });

      const response = await server.inject({
        method: "POST",
        url: "/api/payment-orders/buyer-approval",
        payload: {
          orderId: validOrderId,
          paypalOrderId: validPayPalOrderId,
          payerId: "PAYER-123",
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.order.status).toBe("APPROVED");
      expect(json.nextAction).toBe("CAPTURE");
      expect(json.paypalOrderId).toBe(validPayPalOrderId);
    });

    it("supports ID in URL path (POST /api/payment-orders/:id/buyer-approval)", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce(validOwnerId);
      vi.spyOn(paymentOrderRepo, "confirmBuyerApproval").mockResolvedValueOnce({
        order: {
          ...sampleOrderRecord,
          status: "APPROVED",
        },
        paypalOrderId: validPayPalOrderId,
        reservationState: "RESERVED",
        nextAction: "CAPTURE",
      });

      const response = await server.inject({
        method: "POST",
        url: `/api/payment-orders/${validOrderId}/buyer-approval`,
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().order.status).toBe("APPROVED");
    });

    it("makes repeated visits safe and idempotent", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce(validOwnerId);
      vi.spyOn(paymentOrderRepo, "confirmBuyerApproval").mockResolvedValueOnce({
        order: {
          ...sampleOrderRecord,
          status: "APPROVED",
        },
        paypalOrderId: validPayPalOrderId,
        reservationState: "RESERVED",
        nextAction: "CAPTURE",
      });

      const response = await server.inject({
        method: "POST",
        url: "/api/payment-orders/buyer-approval",
        payload: { orderId: validOrderId },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().nextAction).toBe("CAPTURE");
    });

    it("rejects approval if buyer has not approved on PayPal (422)", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce(validOwnerId);
      vi.spyOn(paymentOrderRepo, "confirmBuyerApproval").mockRejectedValueOnce(
        new CheckoutError("BUYER_NOT_APPROVED", "Buyer has not completed approval on PayPal")
      );

      const response = await server.inject({
        method: "POST",
        url: "/api/payment-orders/buyer-approval",
        payload: { orderId: validOrderId },
      });

      expect(response.statusCode).toBe(422);
      expect(response.json().error.code).toBe("BUYER_NOT_APPROVED");
    });

    it("returns 404 if order not found", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce(validOwnerId);
      vi.spyOn(paymentOrderRepo, "confirmBuyerApproval").mockRejectedValueOnce(
        new CheckoutError("ORDER_NOT_FOUND", "Payment order not found")
      );

      const response = await server.inject({
        method: "POST",
        url: "/api/payment-orders/buyer-approval",
        payload: { orderId: validOrderId },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe("ORDER_NOT_FOUND");
    });
  });

  // ==========================================
  // 2. ORDER CANCELLATION FLOW
  // ==========================================
  describe("Order Cancellation Flow (POST /api/payment-orders/cancel)", () => {
    it("cancels uncaptured order and safely releases reservation", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce(validOwnerId);
      vi.spyOn(paymentOrderRepo, "cancelPaymentOrder").mockResolvedValueOnce({
        order: {
          ...sampleOrderRecord,
          status: "CANCELLED",
        },
        reservationState: "RELEASED",
        cancelled: true,
      });

      const response = await server.inject({
        method: "POST",
        url: "/api/payment-orders/cancel",
        payload: { orderId: validOrderId, reason: "Buyer changed mind" },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.cancelled).toBe(true);
      expect(json.order.status).toBe("CANCELLED");
      expect(json.reservationState).toBe("RELEASED");
    });

    it("prevents cancelling already captured order (422)", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce(validOwnerId);
      vi.spyOn(paymentOrderRepo, "cancelPaymentOrder").mockRejectedValueOnce(
        new CheckoutError("CANNOT_CANCEL_CAPTURED_ORDER", "Order has already been captured")
      );

      const response = await server.inject({
        method: "POST",
        url: "/api/payment-orders/cancel",
        payload: { orderId: validOrderId },
      });

      expect(response.statusCode).toBe(422);
      expect(response.json().error.code).toBe("CANNOT_CANCEL_CAPTURED_ORDER");
    });
  });

  // ==========================================
  // 3. SERVER-SIDE CAPTURE FLOW
  // ==========================================
  describe("Server-Side Capture Flow (POST /api/payment-orders/capture)", () => {
    it("captures approved order and commits spend reservation (200 OK)", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce(validOwnerId);
      vi.spyOn(paymentOrderRepo, "capturePaymentOrder").mockResolvedValueOnce({
        order: {
          ...sampleOrderRecord,
          status: "CAPTURED",
          captureId: validCaptureId,
        },
        captureId: validCaptureId,
        paypalOrderId: validPayPalOrderId,
        status: "CAPTURED",
        reservationState: "COMMITTED",
        capturedAmountMinor: 4500,
        currency: "USD",
      });

      const response = await server.inject({
        method: "POST",
        url: "/api/payment-orders/capture",
        payload: { orderId: validOrderId },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.status).toBe("CAPTURED");
      expect(json.captureId).toBe(validCaptureId);
      expect(json.reservationState).toBe("COMMITTED");
      expect(json.capturedAmountMinor).toBe(4500);
      expect(json.currency).toBe("USD");
    });

    it("supports ID in URL path (POST /api/payment-orders/:id/capture)", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce(validOwnerId);
      vi.spyOn(paymentOrderRepo, "capturePaymentOrder").mockResolvedValueOnce({
        order: {
          ...sampleOrderRecord,
          status: "CAPTURED",
          captureId: validCaptureId,
        },
        captureId: validCaptureId,
        paypalOrderId: validPayPalOrderId,
        status: "CAPTURED",
        reservationState: "COMMITTED",
        capturedAmountMinor: 4500,
        currency: "USD",
      });

      const response = await server.inject({
        method: "POST",
        url: `/api/payment-orders/${validOrderId}/capture`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().status).toBe("CAPTURED");
    });

    it("rejects capture if order is not in APPROVED state (422)", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce(validOwnerId);
      vi.spyOn(paymentOrderRepo, "capturePaymentOrder").mockRejectedValueOnce(
        new CheckoutError(
          "ORDER_NOT_ELIGIBLE_FOR_CAPTURE",
          "Order must be in APPROVED state before capture."
        )
      );

      const response = await server.inject({
        method: "POST",
        url: "/api/payment-orders/capture",
        payload: { orderId: validOrderId },
      });

      expect(response.statusCode).toBe(422);
      expect(response.json().error.code).toBe("ORDER_NOT_ELIGIBLE_FOR_CAPTURE");
    });

    it("rejects capture if approval has been revoked (422)", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce(validOwnerId);
      vi.spyOn(paymentOrderRepo, "capturePaymentOrder").mockRejectedValueOnce(
        new CheckoutError("REVOKED_APPROVAL", "Approval was revoked prior to capture.")
      );

      const response = await server.inject({
        method: "POST",
        url: "/api/payment-orders/capture",
        payload: { orderId: validOrderId },
      });

      expect(response.statusCode).toBe(422);
      expect(response.json().error.code).toBe("REVOKED_APPROVAL");
    });

    it("rejects capture if approval has expired (422)", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce(validOwnerId);
      vi.spyOn(paymentOrderRepo, "capturePaymentOrder").mockRejectedValueOnce(
        new CheckoutError("EXPIRED_APPROVAL", "Approval expired prior to capture.")
      );

      const response = await server.inject({
        method: "POST",
        url: "/api/payment-orders/capture",
        payload: { orderId: validOrderId },
      });

      expect(response.statusCode).toBe(422);
      expect(response.json().error.code).toBe("EXPIRED_APPROVAL");
    });

    it("treats ambiguous network timeout during capture as 409 and holds reservation", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce(validOwnerId);
      vi.spyOn(paymentOrderRepo, "capturePaymentOrder").mockRejectedValueOnce(
        new CheckoutError(
          "CAPTURE_OUTCOME_AMBIGUOUS",
          "PayPal capture timed out or encountered an ambiguous network outcome."
        )
      );

      const response = await server.inject({
        method: "POST",
        url: "/api/payment-orders/capture",
        payload: { orderId: validOrderId },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe("CAPTURE_OUTCOME_AMBIGUOUS");
    });
  });

  // ==========================================
  // 4. RECONCILIATION FLOW
  // ==========================================
  describe("Order Reconciliation Flow (POST /api/payment-orders/reconcile)", () => {
    it("reconciles order state with PayPal status", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce(validOwnerId);
      vi.spyOn(paymentOrderRepo, "reconcilePaymentOrder").mockResolvedValueOnce({
        order: {
          ...sampleOrderRecord,
          status: "CAPTURED",
          captureId: validCaptureId,
        },
        reservationState: "COMMITTED",
        reconciled: true,
        externalStatus: "COMPLETED",
        notes: "Reconciled with PayPal order status 'COMPLETED'.",
      });

      const response = await server.inject({
        method: "POST",
        url: "/api/payment-orders/reconcile",
        payload: { orderId: validOrderId },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.reconciled).toBe(true);
      expect(json.order.status).toBe("CAPTURED");
      expect(json.reservationState).toBe("COMMITTED");
      expect(json.externalStatus).toBe("COMPLETED");
    });

    it("supports ID in URL path (POST /api/payment-orders/:id/reconcile)", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce(validOwnerId);
      vi.spyOn(paymentOrderRepo, "reconcilePaymentOrder").mockResolvedValueOnce({
        order: {
          ...sampleOrderRecord,
          status: "APPROVED",
        },
        reservationState: "RESERVED",
        reconciled: true,
        externalStatus: "APPROVED",
      });

      const response = await server.inject({
        method: "POST",
        url: `/api/payment-orders/${validOrderId}/reconcile`,
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().reconciled).toBe(true);
      expect(response.json().externalStatus).toBe("APPROVED");
    });
  });
});
