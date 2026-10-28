import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../server.js";
import { inMemoryPolicies, listPolicies } from "../db/repositories/policyRepository.js";
import { inMemoryTestRuns, listVerificationRuns } from "../db/repositories/verificationRunRepository.js";
import { env } from "../config/env.js";

describe("Production & Staging Authentication Trust Boundary & Tenant Isolation (SEC-001, SEC-002, REL-001)", () => {
  let server: FastifyInstance;
  let approverToken: string;
  let requesterToken: string;

  const validPolicyVersionId = "33333333-3333-3333-3333-333333333333";
  const validPolicyHash = "a".repeat(64);

  beforeAll(async () => {
    server = await buildServer({
      checkDb: async () => ({ configured: true, connected: false }),
    });
    await server.ready();

    const approverRes = await server.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "approver@warrant.studio", password: "ApproverPass123!" },
    });
    approverToken = approverRes.json().token;

    const requesterRes = await server.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "requester@warrant.studio", password: "RequesterPass123!" },
    });
    requesterToken = requesterRes.json().token;
  }, 60000);

  afterAll(async () => {
    await server.close();
  });

  describe("1. Strict Production & Staging Authentication Trust Boundary (SEC-001)", () => {
    it("strictly rejects unauthenticated approval creation in production with HTTP 401 UNAUTHENTICATED", async () => {
      const origEnv = env.NODE_ENV;
      (env as any).NODE_ENV = "production";

      try {
        const response = await server.inject({
          method: "POST",
          url: "/api/approvals",
          payload: {
            policyVersionId: validPolicyVersionId,
            policyHash: validPolicyHash,
            qualifyingTestRunId: randomUUID(),
            spendLimitMinor: 5000,
            currency: "USD",
          },
        });

        expect(response.statusCode).toBe(401);
        const json = response.json();
        expect(json.error.code).toBe("UNAUTHENTICATED");
        expect(json.error.message).toContain("Authentication required");
      } finally {
        (env as any).NODE_ENV = origEnv;
      }
    });

    it("strictly rejects unauthenticated approval revocation in production with HTTP 401 UNAUTHENTICATED", async () => {
      const origEnv = env.NODE_ENV;
      (env as any).NODE_ENV = "production";

      try {
        const response = await server.inject({
          method: "POST",
          url: "/api/approvals/00000000-0000-0000-0000-000000000001/revoke",
        });

        expect(response.statusCode).toBe(401);
        expect(response.json().error.code).toBe("UNAUTHENTICATED");
      } finally {
        (env as any).NODE_ENV = origEnv;
      }
    });

    it("strictly rejects unauthenticated policy creation in production with HTTP 401 UNAUTHENTICATED", async () => {
      const origEnv = env.NODE_ENV;
      (env as any).NODE_ENV = "production";

      try {
        const response = await server.inject({
          method: "POST",
          url: "/api/policies",
          payload: {
            name: "Unauthenticated Attack Policy",
            sourceMandate: "Laptops up to $500",
            confirmationState: "CONFIRMED",
            intent: {
              name: "Attack Intent",
              currency: "USD",
            },
          },
        });

        expect(response.statusCode).toBe(401);
        expect(response.json().error.code).toBe("UNAUTHENTICATED");
      } finally {
        (env as any).NODE_ENV = origEnv;
      }
    });

    it("strictly rejects unauthenticated payment order creation in production with HTTP 401 UNAUTHENTICATED", async () => {
      const origEnv = env.NODE_ENV;
      (env as any).NODE_ENV = "production";

      try {
        const response = await server.inject({
          method: "POST",
          url: "/api/payment-orders",
          payload: {
            reservationId: randomUUID(),
          },
        });

        expect(response.statusCode).toBe(401);
        expect(response.json().error.code).toBe("UNAUTHENTICATED");
      } finally {
        (env as any).NODE_ENV = origEnv;
      }
    });

    it("strictly rejects unauthenticated payment order capture in production with HTTP 401 UNAUTHENTICATED", async () => {
      const origEnv = env.NODE_ENV;
      (env as any).NODE_ENV = "production";

      try {
        const response = await server.inject({
          method: "POST",
          url: "/api/payment-orders/capture",
          payload: {
            orderId: randomUUID(),
            paypalOrderId: "4XC10315GW197663C",
          },
        });

        expect(response.statusCode).toBe(401);
        expect(response.json().error.code).toBe("UNAUTHENTICATED");
      } finally {
        (env as any).NODE_ENV = origEnv;
      }
    });

    it("strictly rejects unauthenticated payment order reconciliation in production with HTTP 401 UNAUTHENTICATED", async () => {
      const origEnv = env.NODE_ENV;
      (env as any).NODE_ENV = "production";

      try {
        const response = await server.inject({
          method: "POST",
          url: "/api/payment-orders/reconcile",
          payload: {
            orderId: randomUUID(),
            paypalOrderId: "4XC10315GW197663C",
          },
        });

        expect(response.statusCode).toBe(401);
        expect(response.json().error.code).toBe("UNAUTHENTICATED");
      } finally {
        (env as any).NODE_ENV = origEnv;
      }
    });

    it("strictly rejects unauthenticated checkout proposal submission in production with HTTP 401 UNAUTHENTICATED", async () => {
      const origEnv = env.NODE_ENV;
      (env as any).NODE_ENV = "production";

      try {
        const response = await server.inject({
          method: "POST",
          url: "/api/checkout/proposals",
          payload: {
            approvalId: randomUUID(),
            policyVersionId: validPolicyVersionId,
            policyHash: validPolicyHash,
            nonceId: randomUUID(),
            cart: {
              currency: "USD",
              items: [
                {
                  sku: "item_gpu_01",
                  title: "NVIDIA RTX 4090",
                  quantity: 1,
                },
              ],
            },
            evidenceSnapshot: {
              evidenceComplete: true,
            },
          },
        });

        expect(response.statusCode).toBe(401);
        expect(response.json().error.code).toBe("UNAUTHENTICATED");
      } finally {
        (env as any).NODE_ENV = origEnv;
      }
    });

    it("strictly rejects unauthenticated payment orders listing in production with HTTP 401 UNAUTHENTICATED", async () => {
      const origEnv = env.NODE_ENV;
      (env as any).NODE_ENV = "production";

      try {
        const response = await server.inject({
          method: "GET",
          url: "/api/payment-orders",
        });

        expect(response.statusCode).toBe(401);
        expect(response.json().error.code).toBe("UNAUTHENTICATED");
      } finally {
        (env as any).NODE_ENV = origEnv;
      }
    });

    it("strictly rejects unauthenticated PayPal transactions listing in production with HTTP 401 UNAUTHENTICATED", async () => {
      const origEnv = env.NODE_ENV;
      (env as any).NODE_ENV = "production";

      try {
        const response = await server.inject({
          method: "GET",
          url: "/api/paypal/transactions",
        });

        expect(response.statusCode).toBe(401);
        expect(response.json().error.code).toBe("UNAUTHENTICATED");
      } finally {
        (env as any).NODE_ENV = origEnv;
      }
    });

    it("strictly rejects unauthenticated PayPal test order creation in production with HTTP 401 UNAUTHENTICATED", async () => {
      const origEnv = env.NODE_ENV;
      (env as any).NODE_ENV = "production";

      try {
        const response = await server.inject({
          method: "POST",
          url: "/api/paypal/test-order",
          payload: {
            amountMinor: 2500,
            currency: "USD",
          },
        });

        expect(response.statusCode).toBe(401);
        expect(response.json().error.code).toBe("UNAUTHENTICATED");
      } finally {
        (env as any).NODE_ENV = origEnv;
      }
    });

    it("strictly rejects unauthenticated evidence packet retrieval in production with HTTP 401 UNAUTHENTICATED", async () => {
      const origEnv = env.NODE_ENV;
      (env as any).NODE_ENV = "production";

      try {
        const response = await server.inject({
          method: "GET",
          url: `/api/evidence-packets/proposals/${randomUUID()}`,
        });

        expect(response.statusCode).toBe(401);
        expect(response.json().error.code).toBe("UNAUTHENTICATED");
      } finally {
        (env as any).NODE_ENV = origEnv;
      }
    });

    it("strictly rejects unauthenticated persisted verification run in production with HTTP 401 UNAUTHENTICATED", async () => {
      const origEnv = env.NODE_ENV;
      (env as any).NODE_ENV = "production";

      try {
        const response = await server.inject({
          method: "POST",
          url: "/api/verification/runs?persist=true",
          payload: {
            policyPresetId: "pol_v1_books_hardware",
            candidateLimit: 10,
          },
        });

        expect(response.statusCode).toBe(401);
        expect(response.json().error.code).toBe("UNAUTHENTICATED");
      } finally {
        (env as any).NODE_ENV = origEnv;
      }
    });

    it("strictly enforces fail-closed authentication in staging environment (NODE_ENV=staging)", async () => {
      const origEnv = env.NODE_ENV;
      (env as any).NODE_ENV = "staging";

      try {
        const response = await server.inject({
          method: "POST",
          url: "/api/approvals",
          payload: {
            policyVersionId: validPolicyVersionId,
            policyHash: validPolicyHash,
            qualifyingTestRunId: randomUUID(),
            spendLimitMinor: 5000,
            currency: "USD",
          },
        });

        expect(response.statusCode).toBe(401);
        expect(response.json().error.code).toBe("UNAUTHENTICATED");
      } finally {
        (env as any).NODE_ENV = origEnv;
      }
    });
  });

  describe("2. Server-Side Role Enforcement Across Boundaries", () => {
    it("rejects approval creation by REQUESTER role with HTTP 403 FORBIDDEN", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/approvals",
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: {
          policyVersionId: validPolicyVersionId,
          policyHash: validPolicyHash,
          qualifyingTestRunId: randomUUID(),
          spendLimitMinor: 5000,
          currency: "USD",
        },
      });

      expect(response.statusCode).toBe(403);
      const json = response.json();
      expect(json.error.code).toBe("FORBIDDEN");
      expect(json.error.message).toContain("APPROVER");
    });

    it("rejects approval revocation by REQUESTER role with HTTP 403 FORBIDDEN", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/approvals/00000000-0000-0000-0000-000000000001/revoke",
        headers: { authorization: `Bearer ${requesterToken}` },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe("FORBIDDEN");
    });

    it("rejects policy archive by APPROVER role with HTTP 403 (Requires ADMINISTRATOR)", async () => {
      const response = await server.inject({
        method: "DELETE",
        url: "/api/policies/00000000-0000-0000-0000-000000000001",
        headers: { authorization: `Bearer ${approverToken}` },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe("FORBIDDEN");
      expect(response.json().error.message).toContain("ADMINISTRATOR");
    });

    it("rejects payment order capture by REQUESTER role with HTTP 403 FORBIDDEN", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/payment-orders/capture",
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: {
          orderId: randomUUID(),
          paypalOrderId: "4XC10315GW197663C",
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe("FORBIDDEN");
    });

    it("rejects payment order reconciliation by REQUESTER role with HTTP 403 FORBIDDEN", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/payment-orders/reconcile",
        headers: { authorization: `Bearer ${requesterToken}` },
        payload: {
          orderId: randomUUID(),
          paypalOrderId: "4XC10315GW197663C",
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe("FORBIDDEN");
    });
  });

  describe("3. Tenant Data Isolation (SEC-002)", () => {
    it("ensures listPolicies filters by tenant ownerId and does not leak Tenant B policies to Tenant A", async () => {
      const tenantA = "11111111-aaaa-1111-aaaa-111111111111";
      const tenantB = "22222222-bbbb-2222-bbbb-222222222222";

      inMemoryPolicies.set("pol_custom_tenant_a", {
        id: "pol_custom_tenant_a",
        ownerId: tenantA,
        name: "Tenant A Procurement Policy",
        sourceMandate: "Only books up to $100",
        currentVersionId: "ver_custom_a_v1",
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
      });

      inMemoryPolicies.set("pol_custom_tenant_b", {
        id: "pol_custom_tenant_b",
        ownerId: tenantB,
        name: "Tenant B Secret Compliance Mandate",
        sourceMandate: "Hardware up to $10,000",
        currentVersionId: "ver_custom_b_v1",
        createdAt: new Date(),
        updatedAt: new Date(),
        archivedAt: null,
      });

      const listForTenantA = await listPolicies({} as any, tenantA);
      const listForTenantB = await listPolicies({} as any, tenantB);

      const tenantAPolicyIds = listForTenantA.map((p) => p.id);
      expect(tenantAPolicyIds).toContain("pol_custom_tenant_a");
      expect(tenantAPolicyIds).not.toContain("pol_custom_tenant_b");

      const tenantBPolicyIds = listForTenantB.map((p) => p.id);
      expect(tenantBPolicyIds).toContain("pol_custom_tenant_b");
      expect(tenantBPolicyIds).not.toContain("pol_custom_tenant_a");

      expect(tenantAPolicyIds).toContain("pol_v1_books_hardware");
      expect(tenantBPolicyIds).toContain("pol_v1_books_hardware");
    });

    it("ensures listVerificationRuns filters by tenant ownerId and does not leak Tenant B runs to Tenant A", async () => {
      const tenantA = "11111111-aaaa-1111-aaaa-111111111111";
      const tenantB = "22222222-bbbb-2222-bbbb-222222222222";

      inMemoryTestRuns.set("run_tenant_a", {
        id: "run_tenant_a",
        ownerId: tenantA,
        policyVersionId: "ver_custom_tenant_a",
        policyHash: "1".repeat(64),
        domainId: "procurement-checkout-domain",
        domainVersion: "1.0.0",
        status: "COMPLETED",
        candidateLimit: 100,
        candidateCount: 100,
        exploredCount: 100,
        findingCount: 0,
        unresolvedCount: 0,
        stopReason: "EXHAUSTED",
        exhausted: true,
        durationMs: 50,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        findings: [],
      } as any);

      inMemoryTestRuns.set("run_tenant_b", {
        id: "run_tenant_b",
        ownerId: tenantB,
        policyVersionId: "ver_custom_tenant_b",
        policyHash: "2".repeat(64),
        domainId: "procurement-checkout-domain",
        domainVersion: "1.0.0",
        status: "COMPLETED",
        candidateLimit: 100,
        candidateCount: 100,
        exploredCount: 100,
        findingCount: 2,
        unresolvedCount: 2,
        stopReason: "EXHAUSTED",
        exhausted: true,
        durationMs: 75,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        findings: [],
      } as any);

      const runsForTenantA = await listVerificationRuns({} as any, { ownerId: tenantA });
      const runsForTenantB = await listVerificationRuns({} as any, { ownerId: tenantB });

      const tenantARunIds = runsForTenantA.map((r) => r.id);
      expect(tenantARunIds).toContain("run_tenant_a");
      expect(tenantARunIds).not.toContain("run_tenant_b");

      const tenantBRunIds = runsForTenantB.map((r) => r.id);
      expect(tenantBRunIds).toContain("run_tenant_b");
      expect(tenantBRunIds).not.toContain("run_tenant_a");
    });
  });

  describe("4. Duplicate Webhook Insertion Concurrency (REL-001)", () => {
    it("handles concurrent unique key conflict 23505 gracefully as DUPLICATE_EVENT_IGNORED", async () => {
      const duplicateError: any = new Error('duplicate key value violates unique constraint "webhook_events_event_id_unique"');
      duplicateError.code = "23505";

      const mockDb: any = {
        select: () => ({
          from: () => ({
            where: () => Promise.resolve([]),
          }),
        }),
        insert: () => ({
          values: () => Promise.reject(duplicateError),
        }),
      };

      const { processWebhookEvent } = await import("../db/repositories/paymentOrderRepository.js");
      const result = await processWebhookEvent(mockDb, {
        event: {
          id: "WH-CONCURRENT-RACE-001",
          event_type: "PAYMENT.CAPTURE.COMPLETED",
          resource_type: "capture",
          resource: { id: "CAP-001" },
        } as any,
        headers: {
          authAlgo: "SHA256withRSA",
          certUrl: "https://api.sandbox.paypal.com/cert",
          transmissionId: "trans-001",
          transmissionSig: "sig-001",
          transmissionTime: new Date().toISOString(),
        },
      }, {
        verifyWebhookSignature: async () => true,
      } as any);

      expect(result.duplicate).toBe(true);
      expect(result.actionTaken).toBe("DUPLICATE_EVENT_IGNORED");
    });
  });
});
