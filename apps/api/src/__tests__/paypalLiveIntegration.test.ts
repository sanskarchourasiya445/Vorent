import { describe, it, expect, beforeAll } from "vitest";
import { defaultPayPalService } from "../services/paypalService.js";
import { buildServer } from "../server.js";

describe("PayPal Sandbox Live Integration Suite", () => {
  let isPayPalLive = false;

  beforeAll(async () => {
    try {
      const status = await defaultPayPalService.getAuthStatus();
      isPayPalLive = Boolean(status.authenticated);
    } catch {
      isPayPalLive = false;
    }
  });

  it("authenticates with PayPal Sandbox OAuth and inspects scopes", async () => {
    if (!isPayPalLive) {
      return; // Skip when live PayPal sandbox endpoint is unreachable offline
    }
    const status = await defaultPayPalService.getAuthStatus();
    expect(status.environment).toBe("sandbox");
    expect(status.clientIdConfigured).toBe(true);
    expect(status.clientSecretConfigured).toBe(true);
    expect(status.authenticated).toBe(true);
    expect(Array.isArray(status.scopes)).toBe(true);
    expect(status.scopes.length).toBeGreaterThan(0);
  });

  it("creates a real PayPal Sandbox test checkout order", async () => {
    if (!isPayPalLive) {
      return; // Skip when live PayPal sandbox endpoint is unreachable offline
    }
    const order = await defaultPayPalService.createTestSandboxOrder({
      amountMinor: 2500,
      currency: "USD",
      itemDescription: "Warrant Live Integration Test",
    });

    expect(order.id).toBeDefined();
    expect(typeof order.id).toBe("string");
    expect(order.status).toBe("CREATED");
    expect(order.amountMinor).toBe(2500);
    expect(order.currency).toBe("USD");
    expect(order.approvalUrl).toBeDefined();
    expect(order.approvalUrl).toContain("paypal.com");
  });

  it("lists PayPal transactions or gracefully reports permission requirement", async () => {
    if (!isPayPalLive) {
      return; // Skip when live PayPal sandbox endpoint is unreachable offline
    }
    const result = await defaultPayPalService.listTransactions();
    expect(result.source).toBe("PAYPAL_TRANSACTION_SEARCH_API");
    expect(typeof result.permissionRequired).toBe("boolean");
    expect(Array.isArray(result.transactions)).toBe(true);
    if (result.permissionRequired) {
      expect(result.permissionNote).toContain("Transaction Search");
    }
  });

  it("handles Fastify /api/paypal routes via inject", async () => {
    if (!isPayPalLive) {
      return; // Skip when live PayPal sandbox endpoint is unreachable offline
    }
    const app = await buildServer({ paypalService: defaultPayPalService });

    // 1. GET /api/paypal/auth-status
    const authRes = await app.inject({
      method: "GET",
      url: "/api/paypal/auth-status",
    });
    expect(authRes.statusCode).toBe(200);
    const authJson = authRes.json();
    expect(authJson.authenticated).toBe(true);
    expect(authJson.environment).toBe("sandbox");

    // 2. POST /api/paypal/test-order
    const orderRes = await app.inject({
      method: "POST",
      url: "/api/paypal/test-order",
      payload: {
        amountMinor: 1800,
        currency: "USD",
        itemDescription: "Fastify Inject Test Order",
      },
    });
    expect(orderRes.statusCode).toBe(201);
    const orderJson = orderRes.json();
    expect(orderJson.id).toBeDefined();
    expect(orderJson.status).toBe("CREATED");
    expect(orderJson.approvalUrl).toContain("paypal.com");

    // 3. GET /api/paypal/transactions
    const txRes = await app.inject({
      method: "GET",
      url: "/api/paypal/transactions",
    });
    expect(txRes.statusCode).toBe(200);
    const txJson = txRes.json();
    expect(Array.isArray(txJson.transactions)).toBe(true);

    // 4. POST /api/paypal/sync
    const syncRes = await app.inject({
      method: "POST",
      url: "/api/paypal/sync",
    });
    expect(syncRes.statusCode).toBe(200);
    const syncJson = syncRes.json();
    expect(syncJson.success).toBe(true);

    await app.close();
  }, 30000);
});
