import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { buildServer } from "../server.js";
import type { FastifyInstance } from "fastify";
import * as checkoutRepo from "../db/repositories/checkoutProposalRepository.js";
import * as policyRepo from "../db/repositories/policyRepository.js";
import { db } from "../db/index.js";
import { ReasonCode } from "@warrant/contracts";

describe("Checkout HTTP Routes (Nonces & Proposals)", () => {
  let server: FastifyInstance;

  const validApprovalId = "11111111-1111-1111-1111-111111111111";
  const validPolicyVersionId = "22222222-2222-2222-2222-222222222222";
  const validPolicyHash = "a".repeat(64);
  const validNonceId = "33333333-3333-3333-3333-333333333333";
  const validProposalId = "44444444-4444-4444-4444-444444444444";
  const validOwnerId = "55555555-5555-5555-5555-555555555555";
  const validReservationId = "66666666-6666-6666-6666-666666666666";

  beforeAll(async () => {
    server = await buildServer({
      checkDb: async () => ({ configured: true, connected: false }),
    });
  });

  afterAll(async () => {
    await server.close();
  });

  // 1. POST /api/checkout/nonces & POST /api/v1/checkout/nonces
  describe("POST /api/checkout/nonces", () => {
    const validNoncePayload = {
      approvalId: validApprovalId,
      policyVersionId: validPolicyVersionId,
      policyHash: validPolicyHash,
      ttlSeconds: 300,
    };

    it("rejects invalid request body with 400 Bad Request", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/checkout/nonces",
        payload: {
          approvalId: "invalid-uuid",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("BAD_REQUEST");
    });

    it("issues a single-use nonce on valid approval and returns 201 Created", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce(validOwnerId);
      vi.spyOn(db, "select").mockReturnValueOnce({
        from: () => ({
          where: () => Promise.resolve([
            {
              id: validApprovalId,
              policyVersionId: validPolicyVersionId,
              policyHash: validPolicyHash,
              revokedAt: null,
              expiresAt: new Date(Date.now() + 86400000),
            },
          ]),
        }),
      } as any);

      vi.spyOn(checkoutRepo, "issueCheckoutNonce").mockResolvedValueOnce({
        id: validNonceId,
        rawNonce: "raw_nonce_secret_hex",
        nonceHash: "h".repeat(64),
        expiresAt: new Date(Date.now() + 300000),
      });

      const response = await server.inject({
        method: "POST",
        url: "/api/checkout/nonces",
        payload: validNoncePayload,
      });

      expect(response.statusCode).toBe(201);
      const json = response.json();
      expect(json.id).toBe(validNonceId);
      expect(json.nonceId).toBe(validNonceId);
      expect(json.rawNonce).toBe("raw_nonce_secret_hex");
      expect(json.nonce).toBe("raw_nonce_secret_hex");
      expect(json.nonceHash).toBe("h".repeat(64));
    });

    it("POST /api/v1/checkout/nonces is an operational forward-compatible alias", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce(validOwnerId);
      vi.spyOn(db, "select").mockReturnValueOnce({
        from: () => ({
          where: () => Promise.resolve([
            {
              id: validApprovalId,
              policyVersionId: validPolicyVersionId,
              policyHash: validPolicyHash,
              revokedAt: null,
              expiresAt: new Date(Date.now() + 86400000),
            },
          ]),
        }),
      } as any);

      vi.spyOn(checkoutRepo, "issueCheckoutNonce").mockResolvedValueOnce({
        id: validNonceId,
        rawNonce: "raw_nonce_secret_hex",
        nonceHash: "h".repeat(64),
        expiresAt: new Date(Date.now() + 300000),
      });

      const response = await server.inject({
        method: "POST",
        url: "/api/v1/checkout/nonces",
        payload: validNoncePayload,
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().id).toBe(validNonceId);
    });

    it("returns 404 when approval does not exist", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce(validOwnerId);
      vi.spyOn(db, "select").mockReturnValueOnce({
        from: () => ({
          where: () => Promise.resolve([]),
        }),
      } as any);

      const response = await server.inject({
        method: "POST",
        url: "/api/checkout/nonces",
        payload: validNoncePayload,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe("APPROVAL_NOT_FOUND");
    });

    it("returns 400 when approval is revoked", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce(validOwnerId);
      vi.spyOn(db, "select").mockReturnValueOnce({
        from: () => ({
          where: () => Promise.resolve([
            {
              id: validApprovalId,
              policyVersionId: validPolicyVersionId,
              policyHash: validPolicyHash,
              revokedAt: new Date(),
              expiresAt: new Date(Date.now() + 86400000),
            },
          ]),
        }),
      } as any);

      const response = await server.inject({
        method: "POST",
        url: "/api/checkout/nonces",
        payload: validNoncePayload,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("REVOKED_APPROVAL");
    });

    it("returns 400 when approval is expired", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce(validOwnerId);
      vi.spyOn(db, "select").mockReturnValueOnce({
        from: () => ({
          where: () => Promise.resolve([
            {
              id: validApprovalId,
              policyVersionId: validPolicyVersionId,
              policyHash: validPolicyHash,
              revokedAt: null,
              expiresAt: new Date(Date.now() - 10000),
            },
          ]),
        }),
      } as any);

      const response = await server.inject({
        method: "POST",
        url: "/api/checkout/nonces",
        payload: validNoncePayload,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("EXPIRED_APPROVAL");
    });

    it("returns 400 when policy version or hash mismatch", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce(validOwnerId);
      vi.spyOn(db, "select").mockReturnValueOnce({
        from: () => ({
          where: () => Promise.resolve([
            {
              id: validApprovalId,
              policyVersionId: validPolicyVersionId,
              policyHash: "different-hash".padEnd(64, "0"),
              revokedAt: null,
              expiresAt: new Date(Date.now() + 86400000),
            },
          ]),
        }),
      } as any);

      const response = await server.inject({
        method: "POST",
        url: "/api/checkout/nonces",
        payload: validNoncePayload,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("POLICY_HASH_MISMATCH");
    });
  });

  // 2. POST /api/checkout/proposals & POST /api/v1/checkout/proposals
  describe("POST /api/checkout/proposals", () => {
    const validProposalPayload = {
      approvalId: validApprovalId,
      policyVersionId: validPolicyVersionId,
      policyHash: validPolicyHash,
      nonceId: validNonceId,
      cart: {
        currency: "USD",
        items: [
          {
            sku: "sku_book_001",
            title: "Domain-Driven Design",
            category: "Reference Books",
            unitPriceMinor: 4500,
            quantity: 1,
          },
        ],
      },
      evidenceSnapshot: {
        timestamp: new Date().toISOString(),
        merchantConfidence: 1.0,
        itemCategorizations: {
          sku_book_001: { category: "Reference Books", confidence: 1.0 },
        },
      },
    };

    it("rejects invalid request body with 400 Bad Request", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/checkout/proposals",
        payload: {
          approvalId: "invalid",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("BAD_REQUEST");
    });

    it("evaluates compliant proposal to ALLOW with spend reservation (201 Created)", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce(validOwnerId);
      vi.spyOn(checkoutRepo, "submitCheckoutProposal").mockResolvedValueOnce({
        proposal: {
          id: validProposalId,
          ownerId: validOwnerId,
          approvalId: validApprovalId,
          policyVersionId: validPolicyVersionId,
          policyHash: validPolicyHash,
          consumedNonceId: validNonceId,
          cartHash: "c".repeat(64),
          proposedCart: validProposalPayload.cart,
          normalizedCart: validProposalPayload.cart,
          evidenceSnapshot: validProposalPayload.evidenceSnapshot,
          decision: "ALLOW",
          reasonCodes: [ReasonCode.ALL_RULES_PASSED],
          ruleTrace: [],
          evaluatedAt: new Date(),
          createdAt: new Date(),
        },
        reservation: {
          id: validReservationId,
          ownerId: validOwnerId,
          approvalId: validApprovalId,
          proposalId: validProposalId,
          amountMinor: 4500,
          currency: "USD",
          state: "ORDER_CREATION_PENDING" as const,
          expiresAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        decision: "ALLOW",
        reasonCodes: [ReasonCode.ALL_RULES_PASSED],
      });

      const response = await server.inject({
        method: "POST",
        url: "/api/checkout/proposals",
        payload: validProposalPayload,
      });

      expect(response.statusCode).toBe(201);
      const json = response.json();
      expect(json.decision).toBe("ALLOW");
      expect(json.proposal.id).toBe(validProposalId);
      expect(json.reservation.id).toBe(validReservationId);
      expect(json.reservation.state).toBe("ORDER_CREATION_PENDING");
      expect(json.reservation.amountMinor).toBe(4500);
    });

    it("evaluates policy violation proposal to DENY without reservation (201 Created)", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce(validOwnerId);
      vi.spyOn(checkoutRepo, "submitCheckoutProposal").mockResolvedValueOnce({
        proposal: {
          id: validProposalId,
          ownerId: validOwnerId,
          approvalId: validApprovalId,
          policyVersionId: validPolicyVersionId,
          policyHash: validPolicyHash,
          consumedNonceId: validNonceId,
          cartHash: "c".repeat(64),
          proposedCart: validProposalPayload.cart,
          normalizedCart: validProposalPayload.cart,
          evidenceSnapshot: validProposalPayload.evidenceSnapshot,
          decision: "DENY",
          reasonCodes: [ReasonCode.PROHIBITED_CATEGORY],
          ruleTrace: [],
          evaluatedAt: new Date(),
          createdAt: new Date(),
        },
        reservation: null, // Zero reservation created on DENY
        decision: "DENY",
        reasonCodes: [ReasonCode.PROHIBITED_CATEGORY],
      });

      const response = await server.inject({
        method: "POST",
        url: "/api/checkout/proposals",
        payload: validProposalPayload,
      });

      expect(response.statusCode).toBe(201);
      const json = response.json();
      expect(json.decision).toBe("DENY");
      expect(json.reservation).toBeNull();
      expect(json.reasonCodes).toContain(ReasonCode.PROHIBITED_CATEGORY);
    });

    it("evaluates spend limit exceeded proposal to DENY without reservation", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce(validOwnerId);
      vi.spyOn(checkoutRepo, "submitCheckoutProposal").mockResolvedValueOnce({
        proposal: {
          id: validProposalId,
          ownerId: validOwnerId,
          approvalId: validApprovalId,
          policyVersionId: validPolicyVersionId,
          policyHash: validPolicyHash,
          consumedNonceId: validNonceId,
          cartHash: "c".repeat(64),
          proposedCart: validProposalPayload.cart,
          normalizedCart: validProposalPayload.cart,
          evidenceSnapshot: validProposalPayload.evidenceSnapshot,
          decision: "DENY",
          reasonCodes: [ReasonCode.LIFETIME_SPEND_LIMIT_EXCEEDED],
          ruleTrace: [],
          evaluatedAt: new Date(),
          createdAt: new Date(),
        },
        reservation: null,
        decision: "DENY",
        reasonCodes: [ReasonCode.LIFETIME_SPEND_LIMIT_EXCEEDED],
      });

      const response = await server.inject({
        method: "POST",
        url: "/api/checkout/proposals",
        payload: validProposalPayload,
      });

      expect(response.statusCode).toBe(201);
      const json = response.json();
      expect(json.decision).toBe("DENY");
      expect(json.reservation).toBeNull();
      expect(json.reasonCodes).toContain(ReasonCode.LIFETIME_SPEND_LIMIT_EXCEEDED);
    });

    it("returns 409 Conflict when nonce is replayed (NONCE_REPLAYED)", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce(validOwnerId);
      vi.spyOn(checkoutRepo, "submitCheckoutProposal").mockRejectedValueOnce(
        new checkoutRepo.NonceReplayError(
          "NONCE_REPLAYED: Checkout nonce has already been consumed"
        )
      );

      const response = await server.inject({
        method: "POST",
        url: "/api/checkout/proposals",
        payload: validProposalPayload,
      });

      expect(response.statusCode).toBe(409);
      const json = response.json();
      expect(json.error.code).toBe("NONCE_REPLAYED");
    });

    it("returns 400 Bad Request when nonce has expired (NONCE_EXPIRED)", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce(validOwnerId);
      vi.spyOn(checkoutRepo, "submitCheckoutProposal").mockRejectedValueOnce(
        new checkoutRepo.CheckoutError(
          "NONCE_EXPIRED",
          "Checkout nonce has expired"
        )
      );

      const response = await server.inject({
        method: "POST",
        url: "/api/checkout/proposals",
        payload: validProposalPayload,
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.error.code).toBe("NONCE_EXPIRED");
    });

    it("returns 404 when approval is not found", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce(validOwnerId);
      vi.spyOn(checkoutRepo, "submitCheckoutProposal").mockRejectedValueOnce(
        new checkoutRepo.CheckoutError(
          "APPROVAL_NOT_FOUND",
          "Approval not found"
        )
      );

      const response = await server.inject({
        method: "POST",
        url: "/api/checkout/proposals",
        payload: validProposalPayload,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe("APPROVAL_NOT_FOUND");
    });

    it("returns 503 DATABASE_UNAVAILABLE when database is unreachable", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockRejectedValueOnce({
        code: "28P01",
        message: 'password authentication failed for user "postgres"',
      });

      const response = await server.inject({
        method: "POST",
        url: "/api/checkout/proposals",
        payload: validProposalPayload,
      });

      expect(response.statusCode).toBe(503);
      expect(response.json().error.code).toBe("DATABASE_UNAVAILABLE");
    });
  });
});
