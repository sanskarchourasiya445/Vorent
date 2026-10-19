import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { PaymentOrderPipelineCard } from "../components/checkout/PaymentOrderPipelineCard";
import type { PayPalOrderPresentationState } from "../types/paymentOrder";
import { createPaymentOrder, PaymentOrderError } from "../api/paymentOrderService";

describe("PaymentOrderPipelineCard Presentation Suite", () => {
  it("1. Renders all 4 distinct stages in the pipeline", () => {
    const html = renderToStaticMarkup(
      React.createElement(PaymentOrderPipelineCard, {
        decision: "ALLOW",
        primaryReasonCode: "ALL_RULES_PASSED",
        reservationId: "res_test_12345",
        reservationState: "ORDER_CREATION_PENDING",
        amountMinor: 4500,
        currency: "USD",
      }),
    );

    expect(html).toContain("1. Warrant Policy Gate");
    expect(html).toContain("2. Spend Reservation");
    expect(html).toContain("3. PayPal Sandbox Order");
    expect(html).toContain("4. Buyer Approval &amp; Capture");
    expect(html).toContain("Step 1");
    expect(html).toContain("Step 2");
    expect(html).toContain("Step 3");
    expect(html).toContain("Step 4");
  });

  it("2. Accurately renders ALLOW state with spend hold in ORDER_CREATION_PENDING", () => {
    const html = renderToStaticMarkup(
      React.createElement(PaymentOrderPipelineCard, {
        decision: "ALLOW",
        primaryReasonCode: "ALL_RULES_PASSED",
        reservationId: "res_uuid_9988",
        reservationState: "ORDER_CREATION_PENDING",
        amountMinor: 4500,
        currency: "USD",
        onCreatePayPalOrder: () => {},
      }),
    );

    expect(html).toContain("ALLOW (Authorized)");
    expect(html).toContain("ORDER_CREATION_PENDING (Hold Active)");
    expect(html).toContain("Temporary spend hold of $45.00 USD");
    expect(html).toContain("Prerequisites Satisfied for Sandbox Order Creation");
    expect(html).toContain("res_uuid_9988");
    expect(html).toContain("Create PayPal Sandbox Order");
  });

  it("2b. Accurately renders confirmed spend reservation when state is RESERVED", () => {
    const html = renderToStaticMarkup(
      React.createElement(PaymentOrderPipelineCard, {
        decision: "ALLOW",
        primaryReasonCode: "ALL_RULES_PASSED",
        reservationId: "res_uuid_9988",
        reservationState: "RESERVED",
        amountMinor: 4500,
        currency: "USD",
        onCreatePayPalOrder: () => {},
      }),
    );

    expect(html).toContain("ALLOW (Authorized)");
    expect(html).toContain("RESERVED");
    expect(html).toContain("Reserved $45.00 USD against approval limit");
  });

  it("3. Blocks downstream stages when Warrant Gate decision is DENY", () => {
    const html = renderToStaticMarkup(
      React.createElement(PaymentOrderPipelineCard, {
        decision: "DENY",
        primaryReasonCode: "PROHIBITED_CATEGORY",
        amountMinor: 5000,
        currency: "USD",
      }),
    );

    expect(html).toContain("DENY (PROHIBITED_CATEGORY)");
    expect(html).toContain("Blocked (Gate Denied)");
    expect(html).toContain("PayPal Order Dispatch Blocked");
    expect(html).toContain("The Warrant Gate denied this proposal (PROHIBITED_CATEGORY)");
  });

  it("4. Blocks downstream stages when reservation is missing even if ALLOW", () => {
    const html = renderToStaticMarkup(
      React.createElement(PaymentOrderPipelineCard, {
        decision: "ALLOW",
        primaryReasonCode: "ALL_RULES_PASSED",
        reservationId: undefined,
        amountMinor: 4500,
        currency: "USD",
      }),
    );

    expect(html).toContain("Pending Issuance");
    expect(html).toContain("Order creation requires active spend reservation.");
  });

  it("5. Protects against duplicate clicks during in-flight order creation", () => {
    const paypalOrderState: PayPalOrderPresentationState = {
      isCreating: true,
    };

    const html = renderToStaticMarkup(
      React.createElement(PaymentOrderPipelineCard, {
        decision: "ALLOW",
        primaryReasonCode: "ALL_RULES_PASSED",
        reservationId: "res_uuid_9988",
        reservationState: "ORDER_CREATION_PENDING",
        amountMinor: 4500,
        currency: "USD",
        paypalOrderState,
        onCreatePayPalOrder: () => {},
      }),
    );

    expect(html).toContain("disabled=\"\"");
    expect(html).toContain("Creating Order in PayPal Sandbox...");
  });

  it("6. Protects against duplicate clicks after successful order creation", () => {
    const paypalOrderState: PayPalOrderPresentationState = {
      orderId: "ord_internal_112233",
      paypalOrderId: "5O190127TN364715T",
      provider: "PAYPAL_SANDBOX",
      status: "CREATED",
      reservationState: "RESERVED",
      approvalUrl: "https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T",
    };

    const html = renderToStaticMarkup(
      React.createElement(PaymentOrderPipelineCard, {
        decision: "ALLOW",
        primaryReasonCode: "ALL_RULES_PASSED",
        reservationId: "res_uuid_9988",
        reservationState: "RESERVED",
        amountMinor: 4500,
        currency: "USD",
        paypalOrderState,
        onCreatePayPalOrder: () => {},
      }),
    );

    expect(html).toContain("Payment Order Details");
    expect(html).toContain("5O190127TN364715T");
    expect(html).toContain("ord_internal_112233");
    expect(html).toContain("Open Buyer Portal");
  });

  it("7. Displays ambiguous outcome warning and disables automatic retry on reconciliation hold", () => {
    const paypalOrderState: PayPalOrderPresentationState = {
      isAmbiguous: true,
      error: "Ambiguous Order Outcome (RECONCILIATION_REQUIRED): Order under reconciliation hold.",
    };

    const html = renderToStaticMarkup(
      React.createElement(PaymentOrderPipelineCard, {
        decision: "ALLOW",
        primaryReasonCode: "ALL_RULES_PASSED",
        reservationId: "res_uuid_9988",
        reservationState: "ORDER_CREATION_PENDING",
        amountMinor: 4500,
        currency: "USD",
        paypalOrderState,
        onCreatePayPalOrder: () => {},
      }),
    );

    expect(html).toContain("Ambiguous Payment Outcome — Reconciliation Hold Active");
    expect(html).toContain("Recovery Guidance:");
    expect(html).toContain("Automatic retry is strictly blocked.");
    expect(html).toContain("Reconciliation Hold");
  });

  it("8. Displays standard order creation failure with clear error message", () => {
    const paypalOrderState: PayPalOrderPresentationState = {
      error: "PayPal Sandbox API returned HTTP 422: UNPROCESSABLE_ENTITY (Invalid currency amount)",
    };

    const html = renderToStaticMarkup(
      React.createElement(PaymentOrderPipelineCard, {
        decision: "ALLOW",
        primaryReasonCode: "ALL_RULES_PASSED",
        reservationId: "res_uuid_9988",
        reservationState: "ORDER_CREATION_PENDING",
        amountMinor: 4500,
        currency: "USD",
        paypalOrderState,
        onCreatePayPalOrder: () => {},
      }),
    );

    expect(html).toContain("Payment Lifecycle Action Error");
    expect(html).toContain("PayPal Sandbox API returned HTTP 422: UNPROCESSABLE_ENTITY");
  });

  it("9. Adheres to accessibility requirements with landmarks, roles, and accessible labels", () => {
    const html = renderToStaticMarkup(
      React.createElement(PaymentOrderPipelineCard, {
        decision: "ALLOW",
        primaryReasonCode: "ALL_RULES_PASSED",
        reservationId: "res_uuid_9988",
        reservationState: "ORDER_CREATION_PENDING",
        amountMinor: 4500,
        currency: "USD",
      }),
    );

    expect(html).toContain('role="region"');
    expect(html).toContain('aria-label="Payment Order Pipeline"');
    expect(html).toContain('role="list"');
    expect(html).toContain('role="listitem"');
  });
});

describe("createPaymentOrder API Service Suite", () => {
  const validProposalId = "11111111-1111-1111-1111-111111111111";
  const validReservationId = "22222222-2222-2222-2222-222222222222";

  it("10. Rejects invalid UUID inputs before transmitting network request", async () => {
    await expect(
      createPaymentOrder({
        proposalId: "invalid-uuid",
        reservationId: validReservationId,
      }),
    ).rejects.toThrow("Invalid payment order payload: proposalId and reservationId must be valid UUIDs.");
  });

  it("11. Dispatches valid proposalId and reservationId and parses 201 response", async () => {
    const originalFetch = globalThis.fetch;
    let interceptedBody: any = null;

    globalThis.fetch = async (_url, init) => {
      interceptedBody = JSON.parse(init?.body as string);
      return new Response(
        JSON.stringify({
          order: {
            id: "33333333-3333-3333-3333-333333333333",
            ownerId: "44444444-4444-4444-4444-444444444444",
            proposalId: validProposalId,
            reservationId: validReservationId,
            provider: "PAYPAL_SANDBOX",
            providerOrderId: "5O190127TN364715T",
            idempotencyKey: "idem_key_12345",
            status: "CREATED",
            amountMinor: 4500,
            currency: "USD",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          paypalOrderId: "5O190127TN364715T",
          reservationState: "ORDER_CREATION_PENDING",
          approvalUrl: "https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T",
        }),
        {
          status: 201,
          headers: { "Content-Type": "application/json" },
        },
      );
    };

    try {
      const response = await createPaymentOrder({
        proposalId: validProposalId,
        reservationId: validReservationId,
      });

      expect(interceptedBody).toEqual({
        proposalId: validProposalId,
        reservationId: validReservationId,
      });
      // Verifies no client-side amounts or policy hashes were sent
      expect(interceptedBody.amountMinor).toBeUndefined();
      expect(interceptedBody.currency).toBeUndefined();

      expect(response.paypalOrderId).toBe("5O190127TN364715T");
      expect(response.order.status).toBe("CREATED");
      expect(response.approvalUrl).toContain("sandbox.paypal.com");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("12. Handles 409 Conflict with ambiguous outcome and flags isAmbiguous: true", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          error: {
            code: "RECONCILIATION_REQUIRED",
            message: "Spend reservation is currently locked under reconciliation hold.",
          },
          requestId: "req_test_conflict",
        }),
        {
          status: 409,
          headers: { "Content-Type": "application/json" },
        },
      );
    };

    try {
      await createPaymentOrder({
        proposalId: validProposalId,
        reservationId: validReservationId,
      });
      expect.fail("Expected createPaymentOrder to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(PaymentOrderError);
      const poErr = err as PaymentOrderError;
      expect(poErr.statusCode).toBe(409);
      expect(poErr.isAmbiguous).toBe(true);
      expect(poErr.code).toBe("RECONCILIATION_REQUIRED");
      expect(poErr.message).toContain("Ambiguous Order Outcome");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("13. Handles 503 Persistence Unavailable honestly", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async () => {
      return new Response(
        JSON.stringify({
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "Persistence store is currently unavailable in standby mode.",
          },
        }),
        {
          status: 503,
          headers: { "Content-Type": "application/json" },
        },
      );
    };

    try {
      await createPaymentOrder({
        proposalId: validProposalId,
        reservationId: validReservationId,
      });
      expect.fail("Expected createPaymentOrder to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(PaymentOrderError);
      const poErr = err as PaymentOrderError;
      expect(poErr.statusCode).toBe(503);
      expect(poErr.code).toBe("DATABASE_UNAVAILABLE");
      expect(poErr.message).toContain("PostgreSQL persistence store is currently in standby mode");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("14. Handles network failures and flags potential ambiguous outcome", async () => {
    const originalFetch = globalThis.fetch;

    globalThis.fetch = async () => {
      throw new Error("Failed to fetch (connection reset by peer)");
    };

    try {
      await createPaymentOrder({
        proposalId: validProposalId,
        reservationId: validReservationId,
      });
      expect.fail("Expected createPaymentOrder to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(PaymentOrderError);
      const poErr = err as PaymentOrderError;
      expect(poErr.isAmbiguous).toBe(true);
      expect(poErr.code).toBe("NETWORK_ERROR");
      expect(poErr.message).toContain("Outcome may be ambiguous");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
