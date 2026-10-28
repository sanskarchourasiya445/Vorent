import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { PaymentOrderPipelineCard } from "../components/checkout/PaymentOrderPipelineCard";
import { TransactionsPanel } from "../components/transactions/TransactionsPanel";
import {
  getPaymentOrder,
  confirmBuyerApproval,
  capturePaymentOrder,
  cancelPaymentOrder,
  reconcilePaymentOrder,
  PaymentOrderError,
} from "../api/paymentOrderService";
import type { PayPalOrderPresentationState } from "../types/paymentOrder";
import type { PaymentOrderRecord } from "@warrant/contracts";

describe("Payment Lifecycle - Frontend Unit & Contract Suite", () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // 1. Buyer Approval Flow
  describe("1. Buyer Approval Verification", () => {
    const validOrderId = "11111111-1111-1111-1111-111111111111";
    const validPaypalId = "5O190127TN364715T";

    it("validates input before sending buyer-approval request", async () => {
      await expect(
        confirmBuyerApproval({} as any),
      ).rejects.toThrow("Invalid buyer approval payload: either orderId or paypalOrderId must be provided.");
    });

    it("sends buyer-approval request and parses successful response with nextAction CAPTURE", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({
          order: {
            id: validOrderId,
            ownerId: "22222222-2222-2222-2222-222222222222",
            proposalId: "33333333-3333-3333-3333-333333333333",
            reservationId: "44444444-4444-4444-4444-444444444444",
            provider: "PAYPAL_SANDBOX",
            providerOrderId: validPaypalId,
            idempotencyKey: "warrant:res:44444444-4444-4444-4444-444444444444",
            status: "APPROVED",
            payerId: "PAYER_998877",
            amountMinor: 4500,
            currency: "USD",
            createdAt: "2026-10-19T10:00:00.000Z",
            updatedAt: "2026-10-19T10:05:00.000Z",
          },
          paypalOrderId: validPaypalId,
          reservationState: "RESERVED",
          nextAction: "CAPTURE",
        }),
      } as Response);

      const result = await confirmBuyerApproval({
        orderId: validOrderId,
        paypalOrderId: validPaypalId,
        payerId: "PAYER_998877",
      });

      expect(result.order.status).toBe("APPROVED");
      expect(result.nextAction).toBe("CAPTURE");
      expect(result.paypalOrderId).toBe(validPaypalId);
      expect(result.reservationState).toBe("RESERVED");
    });

    it("handles BUYER_NOT_APPROVED 422 error honestly", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 422,
        ok: false,
        json: async () => ({
          error: {
            code: "BUYER_NOT_APPROVED",
            message: "Buyer has not completed approval on PayPal (current status: CREATED).",
          },
        }),
      } as Response);

      await expect(
        confirmBuyerApproval({
          orderId: validOrderId,
          paypalOrderId: validPaypalId,
        }),
      ).rejects.toThrow("Buyer has not completed approval on PayPal");
    });
  });

  // 2. Server Capture Flow & Eligibility
  describe("2. Server-Side Capture Flow & Invariant Enforcement", () => {
    const validOrderId = "11111111-1111-1111-1111-111111111111";
    const validPaypalId = "5O190127TN364715T";

    it("dispatches capture request and transitions status to CAPTURED and reservation to COMMITTED", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({
          order: {
            id: validOrderId,
            ownerId: "22222222-2222-2222-2222-222222222222",
            proposalId: "33333333-3333-3333-3333-333333333333",
            reservationId: "44444444-4444-4444-4444-444444444444",
            provider: "PAYPAL_SANDBOX",
            providerOrderId: validPaypalId,
            idempotencyKey: "warrant:res:44444444-4444-4444-4444-444444444444",
            status: "CAPTURED",
            captureId: "CAP_88990011",
            amountMinor: 4500,
            currency: "USD",
            createdAt: "2026-10-19T10:00:00.000Z",
            updatedAt: "2026-10-19T10:10:00.000Z",
          },
          captureId: "CAP_88990011",
          paypalOrderId: validPaypalId,
          status: "CAPTURED",
          reservationState: "COMMITTED",
          capturedAmountMinor: 4500,
          currency: "USD",
        }),
      } as Response);

      const result = await capturePaymentOrder({
        orderId: validOrderId,
        paypalOrderId: validPaypalId,
      });

      expect(result.status).toBe("CAPTURED");
      expect(result.reservationState).toBe("COMMITTED");
      expect(result.captureId).toBe("CAP_88990011");
      expect(result.capturedAmountMinor).toBe(4500);
    });

    it("renders capture button only when status is APPROVED", () => {
      // 1. When status is CREATED: capture action area is NOT rendered
      const createdState: PayPalOrderPresentationState = {
        orderId: validOrderId,
        paypalOrderId: validPaypalId,
        status: "CREATED",
        reservationState: "RESERVED",
        approvalUrl: "https://www.sandbox.paypal.com/checkoutnow?token=" + validPaypalId,
      };

      const htmlCreated = renderToStaticMarkup(
        React.createElement(PaymentOrderPipelineCard, {
          decision: "ALLOW",
          primaryReasonCode: "ALL_RULES_PASSED",
          reservationId: "res_uuid",
          reservationState: "RESERVED",
          amountMinor: 4500,
          currency: "USD",
          paypalOrderState: createdState,
        }),
      );

      expect(htmlCreated).toContain("Buyer Approval Required");
      expect(htmlCreated).toContain("Verify Buyer Approval");
      expect(htmlCreated).not.toContain("Capture Payment");

      // 2. When status is APPROVED: capture button IS rendered
      const approvedState: PayPalOrderPresentationState = {
        orderId: validOrderId,
        paypalOrderId: validPaypalId,
        status: "APPROVED",
        reservationState: "RESERVED",
        payerId: "PAYER_123",
      };

      const htmlApproved = renderToStaticMarkup(
        React.createElement(PaymentOrderPipelineCard, {
          decision: "ALLOW",
          primaryReasonCode: "ALL_RULES_PASSED",
          reservationId: "res_uuid",
          reservationState: "RESERVED",
          amountMinor: 4500,
          currency: "USD",
          paypalOrderState: approvedState,
          onCapturePaymentOrder: () => {},
        }),
      );

      expect(htmlApproved).toContain("Buyer Approved — Eligible for Server-Side Capture");
      expect(htmlApproved).toContain("Capture Payment");

      // 3. When status is CAPTURED: capture button is NOT rendered; shows captured banner
      const capturedState: PayPalOrderPresentationState = {
        orderId: validOrderId,
        paypalOrderId: validPaypalId,
        status: "CAPTURED",
        reservationState: "COMMITTED",
        captureId: "CAP_12345",
      };

      const htmlCaptured = renderToStaticMarkup(
        React.createElement(PaymentOrderPipelineCard, {
          decision: "ALLOW",
          primaryReasonCode: "ALL_RULES_PASSED",
          reservationId: "res_uuid",
          reservationState: "COMMITTED",
          amountMinor: 4500,
          currency: "USD",
          paypalOrderState: capturedState,
        }),
      );

      expect(htmlCaptured).toContain("Payment Successfully Captured &amp; Committed");
      expect(htmlCaptured).toContain("CAP_12345");
      expect(htmlCaptured).not.toContain("Capture Payment");
    });

    it("protects against duplicate capture submissions while in-flight", () => {
      const capturingState: PayPalOrderPresentationState = {
        orderId: validOrderId,
        paypalOrderId: validPaypalId,
        status: "APPROVED",
        reservationState: "RESERVED",
        isCapturing: true,
      };

      const htmlCapturing = renderToStaticMarkup(
        React.createElement(PaymentOrderPipelineCard, {
          decision: "ALLOW",
          primaryReasonCode: "ALL_RULES_PASSED",
          reservationId: "res_uuid",
          reservationState: "RESERVED",
          amountMinor: 4500,
          currency: "USD",
          paypalOrderState: capturingState,
          onCapturePaymentOrder: () => {},
        }),
      );

      expect(htmlCapturing).toContain("disabled=\"\"");
    });
  });

  // 3. Cancellation Flow
  describe("3. Cancellation Flow & Reservation Release", () => {
    const validOrderId = "11111111-1111-1111-1111-111111111111";
    const validPaypalId = "5O190127TN364715T";

    it("dispatches cancellation request and releases reservation", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({
          order: {
            id: validOrderId,
            ownerId: "22222222-2222-2222-2222-222222222222",
            proposalId: "33333333-3333-3333-3333-333333333333",
            reservationId: "44444444-4444-4444-4444-444444444444",
            provider: "PAYPAL_SANDBOX",
            providerOrderId: validPaypalId,
            idempotencyKey: "warrant:res:44444444-4444-4444-4444-444444444444",
            status: "CANCELLED",
            amountMinor: 4500,
            currency: "USD",
            createdAt: "2026-10-19T10:00:00.000Z",
            updatedAt: "2026-10-19T10:15:00.000Z",
          },
          reservationState: "RELEASED",
          cancelled: true,
        }),
      } as Response);

      const result = await cancelPaymentOrder({
        orderId: validOrderId,
        paypalOrderId: validPaypalId,
        reason: "Customer requested cancellation",
      });

      expect(result.order.status).toBe("CANCELLED");
      expect(result.reservationState).toBe("RELEASED");
      expect(result.cancelled).toBe(true);
    });

    it("rejects cancellation on already captured orders (422 CANNOT_CANCEL_CAPTURED_ORDER)", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 422,
        ok: false,
        json: async () => ({
          error: {
            code: "CANNOT_CANCEL_CAPTURED_ORDER",
            message: "Order has already been captured and cannot be cancelled.",
          },
        }),
      } as Response);

      await expect(
        cancelPaymentOrder({
          orderId: validOrderId,
          paypalOrderId: validPaypalId,
        }),
      ).rejects.toThrow("Order has already been captured and cannot be cancelled.");
    });
  });

  // 4. Ambiguous Outcomes and Reconciliation
  describe("4. Ambiguous Outcomes, Timeouts & Reconciliation", () => {
    const validOrderId = "11111111-1111-1111-1111-111111111111";

    it("identifies network drop as ambiguous error and flags isAmbiguous true", async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network connection dropped"));

      try {
        await capturePaymentOrder({ orderId: validOrderId });
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(PaymentOrderError);
        const poe = err as PaymentOrderError;
        expect(poe.isAmbiguous).toBe(true);
        expect(poe.code).toBe("NETWORK_ERROR");
        expect(poe.message).toContain("Outcome may be ambiguous; verify order ledger before retrying");
      }
    });

    it("identifies 409 conflict as ambiguous outcome and disables blind retries", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 409,
        ok: false,
        json: async () => ({
          error: {
            code: "RECONCILIATION_REQUIRED",
            message: "Order placed on RECONCILIATION_HOLD due to conflicting upstream state.",
          },
        }),
      } as Response);

      try {
        await capturePaymentOrder({ orderId: validOrderId });
        expect.fail("Should have thrown");
      } catch (err) {
        expect(err).toBeInstanceOf(PaymentOrderError);
        const poe = err as PaymentOrderError;
        expect(poe.isAmbiguous).toBe(true);
        expect(poe.statusCode).toBe(409);
        expect(poe.message).toContain("Do NOT retry automatically");
      }
    });

    it("reconciles ambiguous order against PayPal APIs cleanly", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({
          order: {
            id: validOrderId,
            ownerId: "22222222-2222-2222-2222-222222222222",
            proposalId: "33333333-3333-3333-3333-333333333333",
            reservationId: "44444444-4444-4444-4444-444444444444",
            provider: "PAYPAL_SANDBOX",
            providerOrderId: "5O190127TN364715T",
            idempotencyKey: "warrant:res:44444444-4444-4444-4444-444444444444",
            status: "APPROVED",
            amountMinor: 4500,
            currency: "USD",
            createdAt: "2026-10-19T10:00:00.000Z",
            updatedAt: "2026-10-19T10:20:00.000Z",
          },
          reservationState: "RESERVED",
          reconciled: true,
          externalStatus: "APPROVED",
          notes: "Reconciled with PayPal order status 'APPROVED'.",
        }),
      } as Response);

      const result = await reconcilePaymentOrder({ orderId: validOrderId });
      expect(result.reconciled).toBe(true);
      expect(result.order.status).toBe("APPROVED");
      expect(result.reservationState).toBe("RESERVED");
      expect(result.notes).toContain("Reconciled with PayPal order status 'APPROVED'");
    });
  });

  // 5. Order Retrieval & Transactions Component
  describe("5. Order Retrieval and Transactions Presentation", () => {
    const validOrderId = "11111111-1111-1111-1111-111111111111";

    it("retrieves payment order details by ID from backend", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({
          order: {
            id: validOrderId,
            ownerId: "22222222-2222-2222-2222-222222222222",
            proposalId: "33333333-3333-3333-3333-333333333333",
            reservationId: "44444444-4444-4444-4444-444444444444",
            provider: "PAYPAL_SANDBOX",
            providerOrderId: "5O190127TN364715T",
            idempotencyKey: "warrant:res:44444444-4444-4444-4444-444444444444",
            status: "APPROVED",
            payerId: "PAYER_ABC_123",
            amountMinor: 4500,
            currency: "USD",
            createdAt: "2026-10-19T10:00:00.000Z",
            updatedAt: "2026-10-19T10:05:00.000Z",
          },
        }),
      } as Response);

      const record: PaymentOrderRecord = await getPaymentOrder(validOrderId);
      expect(record.id).toBe(validOrderId);
      expect(record.status).toBe("APPROVED");
      expect(record.amountMinor).toBe(4500);
      expect(record.currency).toBe("USD");
      expect(record.payerId).toBe("PAYER_ABC_123");
    });

    it("renders TransactionsPanel structure and search input cleanly", () => {
      const html = renderToStaticMarkup(
        React.createElement(TransactionsPanel, {}),
      );

      expect(html).toContain("Transactions &amp; Payment Lifecycle");
      expect(html).toContain("Look Up Payment Order by ID");
      expect(html).toContain("Load Order");
      expect(html).toContain('role="region"');
      expect(html).toContain('aria-label="Transactions Workstation"');
    });
  });
});
