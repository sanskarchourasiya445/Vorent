import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  PayPalService,
  PayPalConfigError,
  PayPalApiError,
  PayPalNetworkError,
} from "../services/paypalService.js";

describe("PayPalService (Unit & Mocked Contract Tests)", () => {
  const validClientId = "mock_client_id_12345";
  const validClientSecret = "mock_client_secret_67890";
  const mockBaseUrl = "https://api-m.sandbox.paypal.com";

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Configuration & Security Boundaries", () => {
    it("fails closed if PAYPAL_ENV is not 'sandbox'", async () => {
      const service = new PayPalService({
        env: "live",
        clientId: validClientId,
        clientSecret: validClientSecret,
      });

      await expect(service.getAccessToken()).rejects.toThrowError(PayPalConfigError);
      await expect(service.getAccessToken()).rejects.toThrowError(/PAYPAL_ENV must be strictly 'sandbox'/);
    });

    it("fails closed if Client ID or Client Secret is missing", async () => {
      const serviceNoSecret = new PayPalService({
        env: "sandbox",
        clientId: validClientId,
        clientSecret: "",
      });

      await expect(serviceNoSecret.getAccessToken()).rejects.toThrowError(PayPalConfigError);
      await expect(serviceNoSecret.getAccessToken()).rejects.toThrowError(/PAYPAL_CREDENTIALS_MISSING/);
    });
  });

  describe("OAuth Access Token Acquisition", () => {
    it("acquires and caches OAuth token on valid client credentials", async () => {
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        callCount++;
        expect(url).toBe(`${mockBaseUrl}/v1/oauth2/token`);
        expect(init?.method).toBe("POST");
        expect(init?.headers).toBeDefined();

        const headers = init?.headers as Record<string, string>;
        const expectedAuth = `Basic ${Buffer.from(`${validClientId}:${validClientSecret}`).toString("base64")}`;
        expect(headers.Authorization).toBe(expectedAuth);
        expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");

        return new Response(
          JSON.stringify({
            scope: "https://api-m.paypal.com/v1/payments/.*",
            access_token: "mock_access_token_abc_123",
            token_type: "Bearer",
            expires_in: 3600,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      });

      const service = new PayPalService(
        { env: "sandbox", clientId: validClientId, clientSecret: validClientSecret, baseUrl: mockBaseUrl },
        mockFetch
      );

      // First call fetches from endpoint
      const token1 = await service.getAccessToken();
      expect(token1).toBe("mock_access_token_abc_123");
      expect(callCount).toBe(1);

      // Second immediate call reuses active cached token
      const token2 = await service.getAccessToken();
      expect(token2).toBe("mock_access_token_abc_123");
      expect(callCount).toBe(1); // No new network call
    });

    it("handles OAuth rejection (401 Unauthorized) safely without leaking secrets", async () => {
      const mockFetch = vi.fn().mockImplementation(
        () =>
          new Response(
            JSON.stringify({
              error: "invalid_client",
              error_description: "Client Authentication failed",
            }),
            { status: 401, headers: { "Content-Type": "application/json" } }
          )
      );

      const service = new PayPalService(
        { env: "sandbox", clientId: validClientId, clientSecret: validClientSecret, baseUrl: mockBaseUrl },
        mockFetch
      );

      await expect(service.getAccessToken()).rejects.toThrowError(PayPalApiError);
      await expect(service.getAccessToken()).rejects.toThrowError(/Client Authentication failed/);
    });

    it("handles OAuth network timeout safely", async () => {
      const mockFetch = vi.fn().mockRejectedValue(
        Object.assign(new Error("Request timed out"), { name: "TimeoutError" })
      );

      const service = new PayPalService(
        { env: "sandbox", clientId: validClientId, clientSecret: validClientSecret, baseUrl: mockBaseUrl },
        mockFetch
      );

      await expect(service.getAccessToken()).rejects.toThrowError(PayPalNetworkError);
      await expect(service.getAccessToken()).rejects.toThrowError(/timed out/);
    });

    it("rejects malformed OAuth response missing access_token", async () => {
      const mockFetch = vi.fn().mockImplementation(
        () =>
          new Response(
            JSON.stringify({ expires_in: 3600 }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          )
      );

      const service = new PayPalService(
        { env: "sandbox", clientId: validClientId, clientSecret: validClientSecret, baseUrl: mockBaseUrl },
        mockFetch
      );

      await expect(service.getAccessToken()).rejects.toThrowError(PayPalApiError);
      await expect(service.getAccessToken()).rejects.toThrowError(/valid access_token/);
    });
  });

  describe("PayPal Checkout Order Creation", () => {
    const validParams = {
      reservationId: "11111111-1111-1111-1111-111111111111",
      amountMinor: 4500,
      currency: "USD",
      idempotencyKey: "warrant:res:11111111-1111-1111-1111-111111111111",
    };

    it("creates PayPal Sandbox order with correct idempotency key and formatted amount", async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/v1/oauth2/token")) {
          return new Response(
            JSON.stringify({ access_token: "mock_token", expires_in: 3600 }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }

        expect(url).toBe(`${mockBaseUrl}/v2/checkout/orders`);
        expect(init?.method).toBe("POST");

        const headers = init?.headers as Record<string, string>;
        expect(headers.Authorization).toBe("Bearer mock_token");
        expect(headers["PayPal-Request-Id"]).toBe(validParams.idempotencyKey);
        expect(headers["Content-Type"]).toBe("application/json");

        const body = JSON.parse(init?.body as string);
        expect(body.intent).toBe("CAPTURE");
        expect(body.purchase_units[0].reference_id).toBe(validParams.reservationId);
        expect(body.purchase_units[0].amount.currency_code).toBe("USD");
        expect(body.purchase_units[0].amount.value).toBe("45.00"); // 4500 minor units -> 45.00

        return new Response(
          JSON.stringify({
            id: "5O190127TN364715T",
            status: "CREATED",
            links: [
              {
                href: "https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T",
                rel: "approve",
                method: "GET",
              },
            ],
          }),
          { status: 201, headers: { "Content-Type": "application/json" } }
        );
      });

      const service = new PayPalService(
        { env: "sandbox", clientId: validClientId, clientSecret: validClientSecret, baseUrl: mockBaseUrl },
        mockFetch
      );

      const order = await service.createOrder(validParams);
      expect(order.id).toBe("5O190127TN364715T");
      expect(order.status).toBe("CREATED");
      expect(order.approvalUrl).toBe("https://www.sandbox.paypal.com/checkoutnow?token=5O190127TN364715T");
    });

    it("handles definite 422 Unprocessable Entity error without leaking secrets", async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/v1/oauth2/token")) {
          return new Response(
            JSON.stringify({ access_token: "mock_token", expires_in: 3600 }),
            { status: 200 }
          );
        }

        return new Response(
          JSON.stringify({
            name: "UNPROCESSABLE_ENTITY",
            message: "The requested currency is not supported for this seller.",
          }),
          { status: 422, headers: { "Content-Type": "application/json" } }
        );
      });

      const service = new PayPalService(
        { env: "sandbox", clientId: validClientId, clientSecret: validClientSecret, baseUrl: mockBaseUrl },
        mockFetch
      );

      await expect(service.createOrder(validParams)).rejects.toThrowError(PayPalApiError);
      await expect(service.createOrder(validParams)).rejects.toThrowError(/currency is not supported/);
    });

    it("flags 500/503 PayPal server error as an AMBIGUOUS network error", async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/v1/oauth2/token")) {
          return new Response(
            JSON.stringify({ access_token: "mock_token", expires_in: 3600 }),
            { status: 200 }
          );
        }

        return new Response("Internal Server Error", { status: 503 });
      });

      const service = new PayPalService(
        { env: "sandbox", clientId: validClientId, clientSecret: validClientSecret, baseUrl: mockBaseUrl },
        mockFetch
      );

      try {
        await service.createOrder(validParams);
        expect.unreachable("Should have thrown PayPalNetworkError");
      } catch (err) {
        expect(err).toBeInstanceOf(PayPalNetworkError);
        expect((err as PayPalNetworkError).isAmbiguous).toBe(true);
      }
    });

    it("flags fetch timeout as an AMBIGUOUS network error", async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/v1/oauth2/token")) {
          return new Response(
            JSON.stringify({ access_token: "mock_token", expires_in: 3600 }),
            { status: 200 }
          );
        }

        throw Object.assign(new Error("Request timed out"), { name: "TimeoutError" });
      });

      const service = new PayPalService(
        { env: "sandbox", clientId: validClientId, clientSecret: validClientSecret, baseUrl: mockBaseUrl },
        mockFetch
      );

      try {
        await service.createOrder(validParams);
        expect.unreachable("Should have thrown PayPalNetworkError");
      } catch (err) {
        expect(err).toBeInstanceOf(PayPalNetworkError);
        expect((err as PayPalNetworkError).isAmbiguous).toBe(true);
      }
    });
  });

  describe("Retrieving Orders (getOrder)", () => {
    it("retrieves and normalizes order details from PayPal", async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/v1/oauth2/token")) {
          return new Response(JSON.stringify({ access_token: "mock_token", expires_in: 3600 }), { status: 200 });
        }
        return new Response(
          JSON.stringify({
            id: "ORDER-123",
            status: "APPROVED",
            intent: "CAPTURE",
            purchase_units: [
              {
                reference_id: "res-123",
                amount: { currency_code: "USD", value: "45.00" },
              },
            ],
            payer: { payer_id: "PAYER-ABC" },
          }),
          { status: 200 }
        );
      });

      const service = new PayPalService(
        { env: "sandbox", clientId: validClientId, clientSecret: validClientSecret, baseUrl: mockBaseUrl },
        mockFetch
      );

      const order = await service.getOrder("ORDER-123");
      expect(order.id).toBe("ORDER-123");
      expect(order.status).toBe("APPROVED");
      expect(order.payer?.payerId).toBe("PAYER-ABC");
    });
  });

  describe("Order Capture (captureOrder)", () => {
    it("captures order and returns capture ID and status", async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/v1/oauth2/token")) {
          return new Response(JSON.stringify({ access_token: "mock_token", expires_in: 3600 }), { status: 200 });
        }
        const headers = init?.headers as Record<string, string>;
        expect(headers["PayPal-Request-Id"]).toBe("warrant:cap:123");

        return new Response(
          JSON.stringify({
            id: "ORDER-123",
            status: "COMPLETED",
            purchase_units: [
              {
                payments: {
                  captures: [
                    {
                      id: "CAP-789",
                      status: "COMPLETED",
                      amount: { currency_code: "USD", value: "45.00" },
                    },
                  ],
                },
              },
            ],
          }),
          { status: 201 }
        );
      });

      const service = new PayPalService(
        { env: "sandbox", clientId: validClientId, clientSecret: validClientSecret, baseUrl: mockBaseUrl },
        mockFetch
      );

      const capture = await service.captureOrder({
        orderId: "ORDER-123",
        idempotencyKey: "warrant:cap:123",
      });

      expect(capture.orderId).toBe("ORDER-123");
      expect(capture.captureId).toBe("CAP-789");
      expect(capture.captureStatus).toBe("COMPLETED");
      expect(capture.amount.value).toBe("45.00");
    });

    it("flags capture timeout as an AMBIGUOUS network error", async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/v1/oauth2/token")) {
          return new Response(JSON.stringify({ access_token: "mock_token", expires_in: 3600 }), { status: 200 });
        }
        throw Object.assign(new Error("Capture timed out"), { name: "TimeoutError" });
      });

      const service = new PayPalService(
        { env: "sandbox", clientId: validClientId, clientSecret: validClientSecret, baseUrl: mockBaseUrl },
        mockFetch
      );

      await expect(
        service.captureOrder({ orderId: "ORDER-123", idempotencyKey: "warrant:cap:123" })
      ).rejects.toThrowError(PayPalNetworkError);
    });
  });

  describe("Webhook Signature Verification (verifyWebhookSignature)", () => {
    it("returns true when PayPal verification returns SUCCESS", async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/v1/oauth2/token")) {
          return new Response(JSON.stringify({ access_token: "mock_token", expires_in: 3600 }), { status: 200 });
        }
        return new Response(
          JSON.stringify({ verification_status: "SUCCESS" }),
          { status: 200 }
        );
      });

      const service = new PayPalService(
        {
          env: "sandbox",
          clientId: validClientId,
          clientSecret: validClientSecret,
          webhookId: "WH-CONFIG-123",
          baseUrl: mockBaseUrl,
        },
        mockFetch
      );

      const isValid = await service.verifyWebhookSignature({
        authAlgo: "SHA256withRSA",
        certUrl: "https://api.sandbox.paypal.com/cert",
        transmissionId: "trans-1",
        transmissionSig: "sig-1",
        transmissionTime: "2026-10-19T14:00:00Z",
        webhookEvent: { id: "EVT-1", event_type: "CHECKOUT.ORDER.APPROVED" },
      });

      expect(isValid).toBe(true);
    });

    it("returns false when PayPal verification returns FAILURE", async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/v1/oauth2/token")) {
          return new Response(JSON.stringify({ access_token: "mock_token", expires_in: 3600 }), { status: 200 });
        }
        return new Response(
          JSON.stringify({ verification_status: "FAILURE" }),
          { status: 200 }
        );
      });

      const service = new PayPalService(
        {
          env: "sandbox",
          clientId: validClientId,
          clientSecret: validClientSecret,
          webhookId: "WH-CONFIG-123",
          baseUrl: mockBaseUrl,
        },
        mockFetch
      );

      const isValid = await service.verifyWebhookSignature({
        authAlgo: "SHA256withRSA",
        certUrl: "https://api.sandbox.paypal.com/cert",
        transmissionId: "trans-1",
        transmissionSig: "sig-1",
        transmissionTime: "2026-10-19T14:00:00Z",
        webhookEvent: { id: "EVT-1", event_type: "CHECKOUT.ORDER.APPROVED" },
      });

      expect(isValid).toBe(false);
    });
  });

  describe("Sandbox Auth Status (getAuthStatus)", () => {
    it("reports authenticated=true and parses scopes when OAuth succeeds", async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        expect(url).toContain("/v1/oauth2/token");
        return new Response(
          JSON.stringify({
            access_token: "sandbox_token_xyz",
            scope: "https://uri.paypal.com/services/reporting/search/read https://api-m.paypal.com/v1/payments/.*",
            expires_in: 3600,
          }),
          { status: 200 }
        );
      });

      const service = new PayPalService(
        { env: "sandbox", clientId: validClientId, clientSecret: validClientSecret, baseUrl: mockBaseUrl },
        mockFetch
      );

      const status = await service.getAuthStatus();
      expect(status.authenticated).toBe(true);
      expect(status.environment).toBe("sandbox");
      expect(status.clientIdConfigured).toBe(true);
      expect(status.clientSecretConfigured).toBe(true);
      expect(status.hasTransactionSearchScope).toBe(true);
      expect(status.scopes).toContain("https://uri.paypal.com/services/reporting/search/read");
    });

    it("reports authenticated=false if credentials are missing", async () => {
      const service = new PayPalService({
        env: "sandbox",
        clientId: "",
        clientSecret: "",
      });

      const status = await service.getAuthStatus();
      expect(status.authenticated).toBe(false);
      expect(status.clientIdConfigured).toBe(false);
      expect(status.clientSecretConfigured).toBe(false);
    });

    it("reports authenticated=false if OAuth fails", async () => {
      const mockFetch = vi.fn().mockImplementation(async () => {
        return new Response(
          JSON.stringify({ error: "invalid_client", error_description: "Bad client credentials" }),
          { status: 401 }
        );
      });

      const service = new PayPalService(
        { env: "sandbox", clientId: validClientId, clientSecret: validClientSecret, baseUrl: mockBaseUrl },
        mockFetch
      );

      const status = await service.getAuthStatus();
      expect(status.authenticated).toBe(false);
      expect(status.message).toContain("Bad client credentials");
    });
  });

  describe("Transaction Search (listTransactions)", () => {
    it("fetches and maps transactions from reporting API", async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/v1/oauth2/token")) {
          return new Response(
            JSON.stringify({ access_token: "token_123", expires_in: 3600 }),
            { status: 200 }
          );
        }

        expect(url).toContain("/v1/reporting/transactions");
        expect(url).toContain("fields=all");

        return new Response(
          JSON.stringify({
            transaction_details: [
              {
                transaction_info: {
                  transaction_id: "TX-998877",
                  transaction_status: "S",
                  transaction_amount: { currency_code: "USD", value: "250.00" },
                  fee_amount: { currency_code: "USD", value: "-7.55" },
                  transaction_initiation_date: "2026-10-15T12:00:00Z",
                  transaction_subject: "Office Equipment Order",
                },
                payer_info: {
                  email_address: "corp-buyer@example.com",
                  payer_name: { given_name: "John", surname: "Doe" },
                },
              },
            ],
            total_items: 1,
            total_pages: 1,
          }),
          { status: 200 }
        );
      });

      const service = new PayPalService(
        { env: "sandbox", clientId: validClientId, clientSecret: validClientSecret, baseUrl: mockBaseUrl },
        mockFetch
      );

      const result = await service.listTransactions();
      expect(result.source).toBe("PAYPAL_TRANSACTION_SEARCH_API");
      expect(result.permissionRequired).toBe(false);
      expect(result.total).toBe(1);
      expect(result.transactions).toHaveLength(1);

      const tx = result.transactions[0]!;
      expect(tx.transactionId).toBe("TX-998877");
      expect(tx.status).toBe("COMPLETED");
      expect(tx.amountMinor).toBe(25000);
      expect(tx.currency).toBe("USD");
      expect(tx.feeAmountMinor).toBe(755);
      expect(tx.payerEmail).toBe("corp-buyer@example.com");
      expect(tx.payerName).toBe("John Doe");
      expect(tx.description).toBe("Office Equipment Order");
    });

    it("handles 403 NOT_AUTHORIZED by returning permissionRequired: true without throwing", async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/v1/oauth2/token")) {
          return new Response(
            JSON.stringify({ access_token: "token_123", expires_in: 3600 }),
            { status: 200 }
          );
        }

        return new Response(
          JSON.stringify({
            name: "NOT_AUTHORIZED",
            message: "Authorization failed due to insufficient permissions.",
          }),
          { status: 403 }
        );
      });

      const service = new PayPalService(
        { env: "sandbox", clientId: validClientId, clientSecret: validClientSecret, baseUrl: mockBaseUrl },
        mockFetch
      );

      const result = await service.listTransactions();
      expect(result.permissionRequired).toBe(true);
      expect(result.permissionNote).toContain("Transaction Search");
      expect(result.transactions).toHaveLength(0);
    });

    it("clamps date range to 31 days maximum", async () => {
      let queriedUrl = "";
      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes("/v1/oauth2/token")) {
          return new Response(
            JSON.stringify({ access_token: "token_123", expires_in: 3600 }),
            { status: 200 }
          );
        }
        queriedUrl = url;
        return new Response(JSON.stringify({ transaction_details: [], total_items: 0 }), { status: 200 });
      });

      const service = new PayPalService(
        { env: "sandbox", clientId: validClientId, clientSecret: validClientSecret, baseUrl: mockBaseUrl },
        mockFetch
      );

      // Request a 60-day range
      const end = new Date("2026-10-20T00:00:00Z");
      const start = new Date("2026-08-20T00:00:00Z");

      await service.listTransactions({
        startDate: start.toISOString(),
        endDate: end.toISOString(),
      });

      const parsedUrl = new URL(queriedUrl);
      const usedStart = new Date(parsedUrl.searchParams.get("start_date")!);
      const usedEnd = new Date(parsedUrl.searchParams.get("end_date")!);
      const diffDays = (usedEnd.getTime() - usedStart.getTime()) / (1000 * 60 * 60 * 24);

      expect(diffDays).toBeLessThanOrEqual(31);
    });
  });

  describe("Create Test Sandbox Order (createTestSandboxOrder)", () => {
    it("creates a test order and returns approval link", async () => {
      const mockFetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes("/v1/oauth2/token")) {
          return new Response(
            JSON.stringify({ access_token: "token_123", expires_in: 3600 }),
            { status: 200 }
          );
        }

        expect(url).toContain("/v2/checkout/orders");
        const body = JSON.parse(init?.body as string);
        expect(body.purchase_units[0].amount.value).toBe("30.00");
        expect(body.purchase_units[0].amount.currency_code).toBe("USD");

        return new Response(
          JSON.stringify({
            id: "TEST-ORDER-777",
            status: "CREATED",
            links: [
              { href: "https://www.sandbox.paypal.com/checkoutnow?token=TEST-ORDER-777", rel: "approve" },
            ],
          }),
          { status: 201 }
        );
      });

      const service = new PayPalService(
        { env: "sandbox", clientId: validClientId, clientSecret: validClientSecret, baseUrl: mockBaseUrl },
        mockFetch
      );

      const res = await service.createTestSandboxOrder({
        amountMinor: 3000,
        currency: "USD",
        itemDescription: "Test Sandbox Item",
      });

      expect(res.id).toBe("TEST-ORDER-777");
      expect(res.status).toBe("CREATED");
      expect(res.approvalUrl).toContain("TEST-ORDER-777");
      expect(res.amountMinor).toBe(3000);
      expect(res.currency).toBe("USD");
    });
  });
});
