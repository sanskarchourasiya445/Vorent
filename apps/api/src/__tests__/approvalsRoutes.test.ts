import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { buildServer } from "../server.js";
import type { FastifyInstance } from "fastify";
import * as approvalRepo from "../db/repositories/approvalRepository.js";
import * as policyRepo from "../db/repositories/policyRepository.js";
import { CheckoutError } from "../db/repositories/checkoutProposalRepository.js";
import { ApprovalListResponseSchema, UserRole } from "@warrant/contracts";

describe("Approval Routes & Decision D-014 Enforcements", () => {
  let server: FastifyInstance;
  let adminToken: string;

  const validApproval = {
    id: "11111111-1111-1111-1111-111111111111",
    ownerId: "22222222-2222-2222-2222-222222222222",
    policyVersionId: "33333333-3333-3333-3333-333333333333",
    policyHash: "a".repeat(64),
    policyName: "Engineering Hardware & Books",
    qualifyingTestRunId: "44444444-4444-4444-4444-444444444444",
    spendLimitMinor: 100000,
    consumedSpendMinor: 15000,
    currency: "USD",
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    revokedAt: null,
    createdAt: new Date().toISOString(),
    status: "ACTIVE" as const,
  };

  beforeAll(async () => {
    server = await buildServer({
      checkDb: async () => ({ configured: true, connected: false }),
    });
    const loginRes = await server.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { email: "admin@warrant.studio", password: "AdminPass123!" },
    });
    adminToken = loginRes.json().token;
  });

  afterAll(async () => {
    await server.close();
  });

  // 1. GET /api/approvals & GET /api/v1/approvals
  describe("GET /api/approvals", () => {
    it("returns 200 with list of approvals", async () => {
      const listSpy = vi.spyOn(approvalRepo, "listApprovals").mockResolvedValueOnce([validApproval]);

      const response = await server.inject({
        method: "GET",
        url: "/api/approvals",
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(ApprovalListResponseSchema.safeParse(json).success).toBe(true);
      expect(json.approvals).toHaveLength(1);
      expect(json.approvals[0].id).toBe(validApproval.id);
      expect(listSpy).toHaveBeenCalled();
    });

    it("GET /api/v1/approvals is an operational alias", async () => {
      vi.spyOn(approvalRepo, "listApprovals").mockResolvedValueOnce([validApproval]);

      const response = await server.inject({
        method: "GET",
        url: "/api/v1/approvals",
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.approvals).toHaveLength(1);
    });

    it("returns 503 DATABASE_UNAVAILABLE when database is in standby", async () => {
      vi.spyOn(approvalRepo, "listApprovals").mockRejectedValueOnce({
        code: "28P01",
        message: 'password authentication failed for user "postgres"',
      });

      const response = await server.inject({
        method: "GET",
        url: "/api/approvals",
      });

      expect(response.statusCode).toBe(503);
      const json = response.json();
      expect(json.error.code).toBe("DATABASE_UNAVAILABLE");
    });
  });

  // 2. POST /api/approvals
  describe("POST /api/approvals", () => {
    const validBody = {
      policyVersionId: "33333333-3333-3333-3333-333333333333",
      policyHash: "a".repeat(64),
      qualifyingTestRunId: "44444444-4444-4444-4444-444444444444",
      spendLimitMinor: 100000,
      currency: "USD",
      expiresInHours: 48,
    };

    it("rejects invalid request body with 400 Bad Request", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/approvals",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          policyVersionId: "invalid-uuid",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("BAD_REQUEST");
    });

    it("creates approval and returns 201 Created when D-014 passes", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce("22222222-2222-2222-2222-222222222222");
      const createSpy = vi.spyOn(approvalRepo, "createApproval").mockResolvedValueOnce(validApproval);

      const response = await server.inject({
        method: "POST",
        url: "/api/approvals",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: validBody,
      });

      expect(response.statusCode).toBe(201);
      const json = response.json();
      expect(json.approval.id).toBe(validApproval.id);
      expect(json.approval.status).toBe("ACTIVE");
      expect(createSpy).toHaveBeenCalled();
    });

    it("rejects approval creation if unresolved CRITICAL/HIGH findings exist (Decision D-014)", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce("22222222-2222-2222-2222-222222222222");
      vi.spyOn(approvalRepo, "createApproval").mockRejectedValueOnce(
        new CheckoutError(
          "UNRESOLVED_CRITICAL_HIGH_FINDINGS",
          "Approval blocked by 1 unresolved CRITICAL or HIGH finding(s) (Decision D-014)"
        )
      );

      const response = await server.inject({
        method: "POST",
        url: "/api/approvals",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: validBody,
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.error.code).toBe("UNRESOLVED_CRITICAL_HIGH_FINDINGS");
      expect(json.error.message).toContain("Decision D-014");
    });

    it("rejects approval creation if MEDIUM/LOW finding is ACCEPTED_RISK without rationale (Decision D-014)", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce("22222222-2222-2222-2222-222222222222");
      vi.spyOn(approvalRepo, "createApproval").mockRejectedValueOnce(
        new CheckoutError(
          "ACCEPTED_RISK_MISSING_RATIONALE",
          "ACCEPTED_RISK findings require a non-empty resolution note / rationale (Decision D-014)"
        )
      );

      const response = await server.inject({
        method: "POST",
        url: "/api/approvals",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: validBody,
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.error.code).toBe("ACCEPTED_RISK_MISSING_RATIONALE");
    });

    it("rejects approval creation if qualifying test run is not COMPLETED", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce("22222222-2222-2222-2222-222222222222");
      vi.spyOn(approvalRepo, "createApproval").mockRejectedValueOnce(
        new CheckoutError(
          "TEST_RUN_NOT_COMPLETED",
          "Qualifying test run must be in COMPLETED status (current: RUNNING)"
        )
      );

      const response = await server.inject({
        method: "POST",
        url: "/api/approvals",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: validBody,
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.error.code).toBe("TEST_RUN_NOT_COMPLETED");
    });

    it("returns 404 when qualifying test run is not found", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce("22222222-2222-2222-2222-222222222222");
      vi.spyOn(approvalRepo, "createApproval").mockRejectedValueOnce(
        new CheckoutError(
          "QUALIFYING_RUN_NOT_FOUND",
          "Qualifying test run not found"
        )
      );

      const response = await server.inject({
        method: "POST",
        url: "/api/approvals",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: validBody,
      });

      expect(response.statusCode).toBe(404);
      const json = response.json();
      expect(json.error.code).toBe("QUALIFYING_RUN_NOT_FOUND");
    });

    it("rejects approval creation if policy hash does not match version (POLICY_HASH_MISMATCH)", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce("22222222-2222-2222-2222-222222222222");
      vi.spyOn(approvalRepo, "createApproval").mockRejectedValueOnce(
        new CheckoutError(
          "POLICY_HASH_MISMATCH",
          `Policy hash mismatch for version ${validBody.policyVersionId}`
        )
      );

      const response = await server.inject({
        method: "POST",
        url: "/api/approvals",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: {
          ...validBody,
          policyHash: "b".repeat(64),
        },
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.error.code).toBe("POLICY_HASH_MISMATCH");
    });

    it("rejects approval creation if qualifying test run version does not match requested version (POLICY_VERSION_MISMATCH)", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce("22222222-2222-2222-2222-222222222222");
      vi.spyOn(approvalRepo, "createApproval").mockRejectedValueOnce(
        new CheckoutError(
          "POLICY_VERSION_MISMATCH",
          "Qualifying test run policyVersionId does not match requested version"
        )
      );

      const response = await server.inject({
        method: "POST",
        url: "/api/approvals",
        headers: { authorization: `Bearer ${adminToken}` },
        payload: validBody,
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.error.code).toBe("POLICY_VERSION_MISMATCH");
    });

    it("rejects approval creation with 403 FORBIDDEN when authenticated user role is REQUESTER", async () => {
      const authService = await import("../services/authService.js");
      vi.spyOn(authService, "verifySessionToken").mockResolvedValueOnce({
        id: "requester-user-id",
        email: "requester@warrant.studio",
        name: "Test Requester",
        role: UserRole.REQUESTER,
        createdAt: new Date().toISOString(),
      });

      const response = await server.inject({
        method: "POST",
        url: "/api/approvals",
        headers: {
          authorization: "Bearer mock-requester-token",
        },
        payload: validBody,
      });

      expect(response.statusCode).toBe(403);
      const json = response.json();
      expect(json.error.code).toBe("FORBIDDEN");
    });

    it("returns 503 DATABASE_UNAVAILABLE when database is unreachable", async () => {
      vi.spyOn(approvalRepo, "createApproval").mockRejectedValueOnce({
        code: "ECONNREFUSED",
        message: "connect ECONNREFUSED 127.0.0.1:5432",
      });

      const response = await server.inject({
        method: "POST",
        url: "/api/approvals",
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
        payload: validBody,
      });

      expect(response.statusCode).toBe(503);
      const json = response.json();
      expect(json.error.code).toBe("DATABASE_UNAVAILABLE");
    });
  });

  // 3. POST /api/approvals/:id/revoke
  describe("POST /api/approvals/:id/revoke", () => {
    it("revokes approval and returns 200 OK with REVOKED status", async () => {
      const revoked = {
        ...validApproval,
        status: "REVOKED" as const,
        revokedAt: new Date().toISOString(),
      };
      const revokeSpy = vi.spyOn(approvalRepo, "revokeApproval").mockResolvedValueOnce(revoked);

      const response = await server.inject({
        method: "POST",
        url: `/api/approvals/${validApproval.id}/revoke`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
      expect(json.approval.status).toBe("REVOKED");
      expect(revokeSpy).toHaveBeenCalledWith(expect.anything(), validApproval.id);
    });

    it("POST /api/v1/approvals/:id/revoke is an operational alias", async () => {
      const revoked = {
        ...validApproval,
        status: "REVOKED" as const,
        revokedAt: new Date().toISOString(),
      };
      vi.spyOn(approvalRepo, "revokeApproval").mockResolvedValueOnce(revoked);

      const response = await server.inject({
        method: "POST",
        url: `/api/v1/approvals/${validApproval.id}/revoke`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.success).toBe(true);
    });

    it("returns 404 when approval ID does not exist", async () => {
      vi.spyOn(approvalRepo, "revokeApproval").mockRejectedValueOnce(
        new CheckoutError("APPROVAL_NOT_FOUND", "Approval not found")
      );

      const response = await server.inject({
        method: "POST",
        url: `/api/approvals/nonexistent-id/revoke`,
        headers: {
          authorization: `Bearer ${adminToken}`,
        },
      });

      expect(response.statusCode).toBe(404);
      const json = response.json();
      expect(json.error.code).toBe("APPROVAL_NOT_FOUND");
    });
  });
});
