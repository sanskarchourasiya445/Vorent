import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../server.js";
import { env } from "../config/env.js";

describe("Staging Smoke Test Suite (Pre-Production Deployment Gate)", () => {
  let server: FastifyInstance;
  let originalEnv: string;
  let requesterToken: string;
  let approverToken: string;
  let adminToken: string;

  beforeAll(async () => {
    originalEnv = env.NODE_ENV;
    // Enforce production mode to test strict trust boundaries and production configurations
    (env as any).NODE_ENV = "production";

    server = await buildServer();
    await server.ready();

    // 1. Authenticate Personas
    const requesterRes = await server.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "requester@warrant.studio",
        password: "RequesterPass123!",
      },
    });
    expect(requesterRes.statusCode).toBe(200);
    requesterToken = requesterRes.json().token;

    const approverRes = await server.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "approver@warrant.studio",
        password: "ApproverPass123!",
      },
    });
    expect(approverRes.statusCode).toBe(200);
    approverToken = approverRes.json().token;

    const adminRes = await server.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: {
        email: "admin@warrant.studio",
        password: "AdminPass123!",
      },
    });
    expect(adminRes.statusCode).toBe(200);
    adminToken = adminRes.json().token;
  }, 30000);

  afterAll(async () => {
    (env as any).NODE_ENV = originalEnv;
    await server.close();
  });

  describe("1. Infrastructure & Service Health", () => {
    it("GET /health/live returns HTTP 200 with valid service liveness payload", async () => {
      const res = await server.inject({ method: "GET", url: "/health/live" });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe("ok");
      expect(body.service).toBe("warrant-api");
      expect(body.version).toBe("0.1.0");
      expect(body.uptime).toBeGreaterThanOrEqual(0);
    });

    it("GET /health/ready returns HTTP 200 confirming Neon PostgreSQL connection", async () => {
      const res = await server.inject({ method: "GET", url: "/health/ready" });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.status).toBe("ready");
      expect(body.database.configured).toBe(true);
      expect(body.database.connected).toBe(true);
      expect(body.database.latencyMs).toBeDefined();
    });

    it("GET / returns operational root metadata", async () => {
      const res = await server.inject({ method: "GET", url: "/" });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe("operational");
    });
  });

  describe("2. Production Trust Boundary & Fail-Closed Authentication", () => {
    it("rejects unauthenticated POST /api/approvals with HTTP 401 UNAUTHENTICATED", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/approvals",
        payload: { policyVersionId: "00000000-0000-0000-0000-000000000001", maxSpendMinor: 10000 },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("UNAUTHENTICATED");
    });

    it("rejects unauthenticated POST /api/payment-orders with HTTP 401 UNAUTHENTICATED", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/payment-orders",
        payload: { proposalId: "00000000-0000-0000-0000-000000000001", reservationId: "00000000-0000-0000-0000-000000000002" },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("UNAUTHENTICATED");
    });

    it("rejects unauthenticated GET /api/paypal/transactions with HTTP 401 UNAUTHENTICATED", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/paypal/transactions",
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("UNAUTHENTICATED");
    });

    it("rejects unauthenticated GET /api/payment-orders with HTTP 401 UNAUTHENTICATED", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/payment-orders",
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("UNAUTHENTICATED");
    });

    it("rejects unauthenticated GET /api/evidence-packets/proposals/:id with HTTP 401 UNAUTHENTICATED", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/evidence-packets/proposals/00000000-0000-0000-0000-000000000001",
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error.code).toBe("UNAUTHENTICATED");
    });
  });

  describe("3. Role-Based Access Control (RBAC) Hard Boundaries", () => {
    it("forbids REQUESTER role from creating spend approvals with HTTP 403 FORBIDDEN", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/approvals",
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: { policyVersionId: "00000000-0000-0000-0000-000000000001", maxSpendMinor: 10000 },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("FORBIDDEN");
    });

    it("forbids REQUESTER role from capturing payment orders with HTTP 403 FORBIDDEN", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/payment-orders/capture",
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: { orderId: "00000000-0000-0000-0000-000000000001" },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("FORBIDDEN");
    });

    it("forbids REQUESTER role from syncing PayPal ledger with HTTP 403 FORBIDDEN", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/paypal/sync",
        headers: { authorization: `Bearer ${requesterToken}` },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error.code).toBe("FORBIDDEN");
    });

    it("allows APPROVER role to inspect approvals listing", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/approvals",
        headers: { authorization: `Bearer ${approverToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json().approvals)).toBe(true);
    });

    it("allows ADMINISTRATOR role to inspect audit events log", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/audit-events",
        headers: { authorization: `Bearer ${adminToken}` },
      });
      expect(res.statusCode).toBe(200);
      expect(Array.isArray(res.json().events || res.json())).toBe(true);
    });
  });

  describe("4. PayPal Sandbox Live Connectivity & Configuration", () => {
    it("confirms PayPal environment is strictly 'sandbox'", () => {
      expect(env.PAYPAL_ENV).toBe("sandbox");
    });

    it("verifies live PayPal Sandbox OAuth status via authenticated endpoint", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/paypal/auth-status",
        headers: { authorization: `Bearer ${approverToken}` },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.authenticated).toBe(true);
      expect(body.environment).toBe("sandbox");
      expect(body.clientIdConfigured).toBe(true);
      expect(body.clientSecretConfigured).toBe(true);
    }, 15000);
  });

  describe("5. Webhook Signature Verification & Idempotency", () => {
    it("rejects webhook submissions lacking mandatory PayPal signature headers with HTTP 400", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/webhooks/paypal",
        payload: {
          id: "WH-TEST-001",
          create_time: new Date().toISOString(),
          resource_type: "capture",
          event_type: "PAYMENT.CAPTURE.COMPLETED",
          resource: { id: "CAP-001" },
        },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe("MISSING_WEBHOOK_HEADERS");
    });
  });

  describe("6. Session Lifecycle & Token Revocation", () => {
    it("successfully logs out user and invalidates session token against future requests", async () => {
      // 1. Verify token works
      const beforeLogout = await server.inject({
        method: "GET",
        url: "/api/account/profile",
        headers: { authorization: `Bearer ${requesterToken}` },
      });
      expect(beforeLogout.statusCode).toBe(200);

      // 2. Perform logout
      const logoutRes = await server.inject({
        method: "POST",
        url: "/api/auth/logout",
        headers: { authorization: `Bearer ${requesterToken}` },
      });
      expect(logoutRes.statusCode).toBe(200);

      // 3. Verify token is immediately rejected
      const afterLogout = await server.inject({
        method: "GET",
        url: "/api/account/profile",
        headers: { authorization: `Bearer ${requesterToken}` },
      });
      expect(afterLogout.statusCode).toBe(401);
      expect(afterLogout.json().error.code).toBe("UNAUTHENTICATED");
    });
  });
});
