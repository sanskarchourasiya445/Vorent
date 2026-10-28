import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { buildServer } from "../server.js";
import type { FastifyInstance } from "fastify";
import * as paymentOrderRepo from "../db/repositories/paymentOrderRepository.js";
import { CheckoutError } from "../db/repositories/checkoutProposalRepository.js";

describe("PayPal Webhooks Route & Processing", () => {
  let server: FastifyInstance;

  const validHeaders = {
    "paypal-auth-algo": "SHA256withRSA",
    "paypal-cert-url": "https://api.sandbox.paypal.com/v1/notifications/certs/CERT-123",
    "paypal-transmission-id": "trans-123456",
    "paypal-transmission-sig": "signature-token-abc",
    "paypal-transmission-time": "2026-10-19T14:30:00Z",
  };

  const sampleOrderApprovedEvent = {
    id: "WH-EVENT-001",
    event_version: "1.0",
    create_time: "2026-10-19T14:30:00Z",
    resource_type: "checkout-order",
    event_type: "CHECKOUT.ORDER.APPROVED",
    summary: "Buyer approved checkout order",
    resource: {
      id: "7SY090644K3801703",
      status: "APPROVED",
      payer: {
        payer_id: "PAYER-999",
      },
    },
  };

  const sampleCaptureCompletedEvent = {
    id: "WH-EVENT-002",
    event_version: "1.0",
    create_time: "2026-10-19T14:35:00Z",
    resource_type: "capture",
    event_type: "PAYMENT.CAPTURE.COMPLETED",
    summary: "Payment capture completed",
    resource: {
      id: "CAP-999888",
      status: "COMPLETED",
      amount: {
        value: "45.00",
        currency_code: "USD",
      },
      supplementary_data: {
        related_ids: {
          order_id: "7SY090644K3801703",
        },
      },
    },
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

  it("successfully processes valid webhook event (200 OK)", async () => {
    vi.spyOn(paymentOrderRepo, "processWebhookEvent").mockResolvedValueOnce({
      received: true,
      eventId: "WH-EVENT-001",
      eventType: "CHECKOUT.ORDER.APPROVED",
      actionTaken: "ORDER_APPROVED",
    });

    const response = await server.inject({
      method: "POST",
      url: "/api/webhooks/paypal",
      headers: validHeaders,
      payload: sampleOrderApprovedEvent,
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json.received).toBe(true);
    expect(json.eventId).toBe("WH-EVENT-001");
    expect(json.actionTaken).toBe("ORDER_APPROVED");
  });

  it("handles duplicate event idempotently with duplicate: true", async () => {
    vi.spyOn(paymentOrderRepo, "processWebhookEvent").mockResolvedValueOnce({
      received: true,
      duplicate: true,
      eventId: "WH-EVENT-001",
      eventType: "CHECKOUT.ORDER.APPROVED",
      actionTaken: "DUPLICATE_EVENT_IGNORED",
    });

    const response = await server.inject({
      method: "POST",
      url: "/api/webhooks/paypal",
      headers: validHeaders,
      payload: sampleOrderApprovedEvent,
    });

    expect(response.statusCode).toBe(200);
    const json = response.json();
    expect(json.received).toBe(true);
    expect(json.duplicate).toBe(true);
    expect(json.actionTaken).toBe("DUPLICATE_EVENT_IGNORED");
  });

  it("rejects unverified webhook signature with 400 Bad Request", async () => {
    vi.spyOn(paymentOrderRepo, "processWebhookEvent").mockRejectedValueOnce(
      new CheckoutError(
        "WEBHOOK_SIGNATURE_VERIFICATION_FAILED",
        "PayPal webhook signature verification failed."
      )
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/webhooks/paypal",
      headers: validHeaders,
      payload: sampleOrderApprovedEvent,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("WEBHOOK_SIGNATURE_VERIFICATION_FAILED");
  });

  it("rejects request if required PayPal signature headers are missing (400)", async () => {
    vi.spyOn(paymentOrderRepo, "processWebhookEvent").mockRejectedValueOnce(
      new CheckoutError(
        "MISSING_WEBHOOK_HEADERS",
        "Missing required PayPal webhook signature headers."
      )
    );

    const response = await server.inject({
      method: "POST",
      url: "/api/webhooks/paypal",
      headers: {},
      payload: sampleOrderApprovedEvent,
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("MISSING_WEBHOOK_HEADERS");
  });

  it("processes PAYMENT.CAPTURE.COMPLETED event", async () => {
    vi.spyOn(paymentOrderRepo, "processWebhookEvent").mockResolvedValueOnce({
      received: true,
      eventId: "WH-EVENT-002",
      eventType: "PAYMENT.CAPTURE.COMPLETED",
      actionTaken: "PAYMENT_CAPTURED_AND_COMMITTED",
    });

    const response = await server.inject({
      method: "POST",
      url: "/api/webhooks/paypal",
      headers: validHeaders,
      payload: sampleCaptureCompletedEvent,
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().actionTaken).toBe("PAYMENT_CAPTURED_AND_COMMITTED");
  });
});
