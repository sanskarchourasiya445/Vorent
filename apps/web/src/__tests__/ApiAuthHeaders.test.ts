import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { setStoredAuthToken, getStoredAuthToken, getAuthHeaders, request, ApiError } from "../api/client";
import { createApproval, revokeApproval } from "../api/approvalService";
import { createPolicy } from "../api/policyService";
import { listPaymentOrders } from "../api/paymentOrderService";

describe("Frontend API Authentication, Header Propagation & Session Expiration", () => {
  const originalFetch = globalThis.fetch;
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    const mockLocalStorage = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, val: string) => store.set(key, String(val)),
      removeItem: (key: string) => store.delete(key),
      clear: () => store.clear(),
    };
    vi.stubGlobal("localStorage", mockLocalStorage);
    vi.stubGlobal("window", {
      localStorage: mockLocalStorage,
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.unstubAllGlobals();
    store.clear();
  });

  it("1. getAuthHeaders returns empty object when no token is stored", () => {
    setStoredAuthToken(null);
    expect(getStoredAuthToken()).toBeNull();
    expect(getAuthHeaders()).toEqual({});
  });

  it("2. getAuthHeaders returns Bearer token header when token is stored", () => {
    setStoredAuthToken("jwt_secret_token_abc_123");
    expect(getStoredAuthToken()).toBe("jwt_secret_token_abc_123");
    expect(getAuthHeaders()).toEqual({
      Authorization: "Bearer jwt_secret_token_abc_123",
    });
  });

  it("3. createApproval passes Authorization header from stored token", async () => {
    setStoredAuthToken("jwt_approval_token_456");
    let capturedHeaders: HeadersInit | undefined;

    globalThis.fetch = async (_input, init) => {
      capturedHeaders = init?.headers;
      return new Response(
        JSON.stringify({
          id: "app_123",
          policyVersionId: "pol_v1",
          policyHash: "hash_123",
          spendLimitMinor: 10000,
          currency: "USD",
          status: "ACTIVE",
          expiresAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    };

    await createApproval({
      policyVersionId: "00000000-0000-0000-0000-000000000001",
      policyHash: "0".repeat(64),
      qualifyingTestRunId: "00000000-0000-0000-0000-000000000002",
      spendLimitMinor: 10000,
      currency: "USD",
      expiresInHours: 24,
    });

    expect(capturedHeaders).toBeDefined();
    const headersObj = capturedHeaders as Record<string, string>;
    expect(headersObj.Authorization).toBe("Bearer jwt_approval_token_456");
  });

  it("4. revokeApproval passes Authorization header from stored token", async () => {
    setStoredAuthToken("jwt_revoke_token_789");
    let capturedHeaders: HeadersInit | undefined;

    globalThis.fetch = async (_input, init) => {
      capturedHeaders = init?.headers;
      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    await revokeApproval("app_to_revoke_123");

    expect(capturedHeaders).toBeDefined();
    const headersObj = capturedHeaders as Record<string, string>;
    expect(headersObj.Authorization).toBe("Bearer jwt_revoke_token_789");
  });

  it("5. createPolicy passes Authorization header from stored token", async () => {
    setStoredAuthToken("jwt_policy_token_999");
    let capturedHeaders: HeadersInit | undefined;

    globalThis.fetch = async (_input, init) => {
      capturedHeaders = init?.headers;
      return new Response(
        JSON.stringify({
          id: "pol_ver_123",
          policyId: "pol_123",
          versionNumber: 1,
          policyHash: "hash_999",
          status: "DRAFT",
          rules: {},
          createdAt: new Date().toISOString(),
        }),
        { status: 201, headers: { "Content-Type": "application/json" } }
      );
    };

    await createPolicy({
      name: "Engineering Hardware Policy",
      sourceMandate: "Limits hardware spend",
      policy: {
        currency: "USD",
        schemaVersion: "1.0",
        maxItemPriceMinor: 25000,
        maxCartTotalMinor: 60000,
        allowedCategories: ["Hardware"],
      },
      intent: {
        rawInput: "Limits hardware spend",
        interpretedRules: [],
        confidenceScore: 1.0,
      } as any,
      confirmationState: "CONFIRMED",
    });

    expect(capturedHeaders).toBeDefined();
    const headersObj = capturedHeaders as Record<string, string>;
    expect(headersObj.Authorization).toBe("Bearer jwt_policy_token_999");
  });

  it("6. listPaymentOrders passes Authorization header from stored token", async () => {
    setStoredAuthToken("jwt_orders_token_555");
    let capturedHeaders: HeadersInit | undefined;

    globalThis.fetch = async (_input, init) => {
      capturedHeaders = init?.headers;
      return new Response(
        JSON.stringify({ orders: [], total: 0 }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    };

    await listPaymentOrders();

    expect(capturedHeaders).toBeDefined();
    const headersObj = capturedHeaders as Record<string, string>;
    expect(headersObj.Authorization).toBe("Bearer jwt_orders_token_555");
  });

  it("7. dispatches warrant_session_expired event when receiving 401 Unauthorized", async () => {
    let eventFired = false;
    const mockWindow = {
      localStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, val: string) => store.set(key, String(val)),
        removeItem: (key: string) => store.delete(key),
        clear: () => store.clear(),
      },
      dispatchEvent: (event: { type: string }) => {
        if (event.type === "warrant_session_expired") eventFired = true;
        return true;
      },
    };
    vi.stubGlobal("window", mockWindow);

    globalThis.fetch = async () =>
      new Response(JSON.stringify({ error: { message: "Token expired" } }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });

    await expect(request("/api/test-protected")).rejects.toThrow(ApiError);
    expect(eventFired).toBe(true);
  });
});
