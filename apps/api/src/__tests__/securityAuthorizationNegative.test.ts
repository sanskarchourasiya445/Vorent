import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../server.js";
import * as policyRepo from "../db/repositories/policyRepository.js";
import * as approvalRepo from "../db/repositories/approvalRepository.js";
import * as checkoutRepo from "../db/repositories/checkoutProposalRepository.js";
import * as paymentOrderRepo from "../db/repositories/paymentOrderRepository.js";
import * as verificationRunRepo from "../db/repositories/verificationRunRepository.js";
import * as evidenceService from "../services/evidencePacketService.js";
import { CheckoutError, NonceReplayError } from "../db/repositories/checkoutProposalRepository.js";
import { ReasonCode } from "@warrant/contracts";

describe("Security, Authorization & Negative Vulnerability Tests", () => {
  let server: FastifyInstance;

  const ownerA = "11111111-1111-1111-1111-111111111111";
  const ownerB = "99999999-9999-9999-9999-999999999999";
  const validApprovalId = "22222222-2222-2222-2222-222222222222";
  const validPolicyVersionId = "33333333-3333-3333-3333-333333333333";
  const validPolicyHash = "a".repeat(64);
  const validNonceId = "44444444-4444-4444-4444-444444444444";
  const validProposalId = "55555555-5555-5555-5555-555555555555";

  beforeAll(async () => {
    server = await buildServer({
      checkDb: async () => ({ configured: true, connected: false }),
    });
  });

  afterAll(async () => {
    await server.close();
  });

  // =========================================================================
  // 1. PRIVILEGE ESCALATION VIA REQUEST PAYLOADS
  // =========================================================================
  describe("1. Privilege Escalation Prevention", () => {
    it("rejects attempt to escalate spend limit or assign roles via approval creation payload", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce(ownerA);
      const createSpy = vi.spyOn(approvalRepo, "createApproval").mockResolvedValueOnce({
        id: validApprovalId,
        ownerId: ownerA,
        policyVersionId: validPolicyVersionId,
        policyHash: validPolicyHash,
        qualifyingTestRunId: randomUUID(),
        spendLimitMinor: 5000, // Trusted parsed value
        consumedSpendMinor: 0,
        currency: "USD",
        expiresAt: new Date(Date.now() + 86400000).toISOString(),
        revokedAt: null,
        createdAt: new Date().toISOString(),
        status: "ACTIVE" as const,
      });

      const response = await server.inject({
        method: "POST",
        url: "/api/approvals",
        payload: {
          policyVersionId: validPolicyVersionId,
          policyHash: validPolicyHash,
          qualifyingTestRunId: randomUUID(),
          spendLimitMinor: 5000,
          currency: "USD",
          // Maliciously injected fields to attempt privilege escalation:
          role: "SUPER_ADMIN",
          canApprove: true,
          tenantId: "global-root",
          ownerId: ownerB,
        },
      });

      expect(response.statusCode).toBe(201);
      // Verify that createApproval was called ONLY with the bound ownerA from session,
      // and NOT with ownerB or any injected role
      expect(createSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.not.objectContaining({ role: "SUPER_ADMIN", canApprove: true, tenantId: "global-root" }),
        ownerA
      );
    });

    it("rejects non-positive quantities in checkout proposals at boundary schema level", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/checkout/proposals",
        payload: {
          approvalId: validApprovalId,
          policyVersionId: validPolicyVersionId,
          policyHash: validPolicyHash,
          nonceId: validNonceId,
          cart: {
            currency: "USD",
            items: [
              {
                sku: "ATTACK-001",
                title: "Negative Quantity Attack",
                category: "software_license",
                unitPriceMinor: 10000,
                quantity: -5, // Negative quantity attempting to reduce cart total
              },
            ],
          },
          evidenceSnapshot: {
            evidenceComplete: true,
            quotesVerified: true,
          },
        },
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.error.code).toBe("BAD_REQUEST");
    });

    it("rejects zero quantity in cart item at boundary schema level", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/checkout/proposals",
        payload: {
          approvalId: validApprovalId,
          policyVersionId: validPolicyVersionId,
          policyHash: validPolicyHash,
          nonceId: validNonceId,
          cart: {
            currency: "USD",
            items: [
              {
                sku: "ATTACK-002",
                title: "Zero Quantity Item",
                category: "software_license",
                unitPriceMinor: 10000,
                quantity: 0,
              },
            ],
          },
          evidenceSnapshot: {
            evidenceComplete: true,
          },
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("BAD_REQUEST");
    });
  });

  // =========================================================================
  // 2. INSECURE DIRECT OBJECT REFERENCES (IDOR) & CROSS-TENANT ACCESS
  // =========================================================================
  describe("2. IDOR and Cross-Tenant Data Access Protection", () => {
    it("returns 404 when attempting to access an evidence packet belonging to another user", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce(ownerA);
      vi.spyOn(evidenceService, "buildEvidencePacketForProposal").mockRejectedValueOnce(
        new evidenceService.EvidencePacketNotFoundError(`Checkout proposal '${validProposalId}' not found.`)
      );

      const response = await server.inject({
        method: "GET",
        url: `/api/evidence-packets/proposals/${validProposalId}`,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe("NOT_FOUND");
    });

    it("rejects payment order creation if spend reservation belongs to a different owner", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce(ownerA);
      vi.spyOn(paymentOrderRepo, "createPaymentOrder").mockRejectedValueOnce(
        new CheckoutError("FORBIDDEN_RESERVATION", "Spend reservation belongs to a different owner")
      );

      const response = await server.inject({
        method: "POST",
        url: "/api/payment-orders",
        payload: {
          proposalId: validProposalId,
          reservationId: "77777777-7777-7777-7777-777777777777",
        },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe("FORBIDDEN_RESERVATION");
    });
  });

  // =========================================================================
  // 3. DECISION D-014 FAIL-CLOSED SPEND PROTECTION
  // =========================================================================
  describe("3. Decision D-014 Fail-Closed Enforcement", () => {
    it("blocks approval creation when unresolved CRITICAL findings exist", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce(ownerA);
      vi.spyOn(approvalRepo, "createApproval").mockRejectedValueOnce(
        new CheckoutError(
          "UNRESOLVED_CRITICAL_HIGH_FINDINGS",
          "Approval blocked by 1 unresolved CRITICAL or HIGH finding(s) (Decision D-014)"
        )
      );

      const response = await server.inject({
        method: "POST",
        url: "/api/approvals",
        payload: {
          policyVersionId: validPolicyVersionId,
          policyHash: validPolicyHash,
          qualifyingTestRunId: randomUUID(),
          spendLimitMinor: 50000,
          currency: "USD",
          expiresInHours: 24,
        },
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.error.code).toBe("UNRESOLVED_CRITICAL_HIGH_FINDINGS");
      expect(json.error.message).toContain("Decision D-014");
    });

    it("strictly forbids risk acceptance for CRITICAL or HIGH findings via POST /api/findings/:id/accept-risk", async () => {
      const findingId = randomUUID();
      vi.spyOn(verificationRunRepo, "acceptRiskFinding").mockRejectedValueOnce(
        new Error("Decision D-014 invariant violation: CRITICAL findings cannot be accepted as risk. A policy repair is required.")
      );

      const response = await server.inject({
        method: "POST",
        url: `/api/findings/${findingId}/accept-risk`,
        payload: {
          rationale: "Attempting to waive a critical loophole without policy repair",
        },
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.error.code).toBe("RISK_ACCEPTANCE_NOT_PERMITTED");
      expect(json.error.message).toContain("Decision D-014");
    });
  });

  // =========================================================================
  // 4. AUTHORIZATION GATES & FAIL-CLOSED PAYMENTS
  // =========================================================================
  describe("4. Payment Authorization Gates", () => {
    it("strictly blocks PayPal order creation if proposal decision is DENY or REVIEW", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce(ownerA);
      vi.spyOn(paymentOrderRepo, "createPaymentOrder").mockRejectedValueOnce(
        new CheckoutError("PROPOSAL_NOT_ALLOWED", "Payment order creation requires an ALLOW decision (current: DENY)")
      );

      const response = await server.inject({
        method: "POST",
        url: "/api/payment-orders",
        payload: {
          proposalId: validProposalId,
          reservationId: "88888888-8888-8888-8888-888888888888",
        },
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("PROPOSAL_NOT_ALLOWED");
    });

    it("rejects checkout proposals exceeding lifetime spend limit with LIFETIME_SPEND_LIMIT_EXCEEDED", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce(ownerA);
      vi.spyOn(checkoutRepo, "submitCheckoutProposal").mockResolvedValueOnce({
        proposal: {
          id: validProposalId,
          ownerId: ownerA,
          approvalId: validApprovalId,
          policyVersionId: validPolicyVersionId,
          policyHash: validPolicyHash,
          consumedNonceId: validNonceId,
          cartHash: "c".repeat(64),
          proposedCart: { currency: "USD", items: [] },
          normalizedCart: { currency: "USD", items: [] },
          evidenceSnapshot: {},
          decision: "DENY",
          reasonCodes: [ReasonCode.LIFETIME_SPEND_LIMIT_EXCEEDED],
          ruleTrace: [],
          evaluatedAt: new Date().toISOString(),
          createdAt: new Date().toISOString(),
        },
        reservation: null, // No reservation created for DENY
        decision: "DENY",
        reasonCodes: [ReasonCode.LIFETIME_SPEND_LIMIT_EXCEEDED],
      });

      const response = await server.inject({
        method: "POST",
        url: "/api/checkout/proposals",
        payload: {
          approvalId: validApprovalId,
          policyVersionId: validPolicyVersionId,
          policyHash: validPolicyHash,
          nonceId: validNonceId,
          cart: {
            currency: "USD",
            items: [
              {
                sku: "EXPENSIVE-001",
                title: "Server Cluster Rack",
                category: "Peripherals",
                unitPriceMinor: 500000,
                quantity: 1,
              },
            ],
          },
          evidenceSnapshot: {
            evidenceComplete: true,
          },
        },
      });

      expect(response.statusCode).toBe(201); // Evaluated outcome returns 201 with DENY
      const json = response.json();
      expect(json.decision).toBe("DENY");
      expect(json.reasonCodes).toContain(ReasonCode.LIFETIME_SPEND_LIMIT_EXCEEDED);
      expect(json.reservation).toBeNull();
    });

    it("rejects consumed nonce with 409 Conflict to prevent replay attacks", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce(ownerA);
      vi.spyOn(checkoutRepo, "submitCheckoutProposal").mockRejectedValueOnce(
        new NonceReplayError("NONCE_REPLAYED: Checkout nonce has already been consumed")
      );

      const response = await server.inject({
        method: "POST",
        url: "/api/checkout/proposals",
        payload: {
          approvalId: validApprovalId,
          policyVersionId: validPolicyVersionId,
          policyHash: validPolicyHash,
          nonceId: validNonceId,
          cart: {
            currency: "USD",
            items: [
              {
                sku: "REPLAY-001",
                title: "Replay Attempt Item",
                category: "Reference Books",
                unitPriceMinor: 2500,
                quantity: 1,
              },
            ],
          },
          evidenceSnapshot: {
            evidenceComplete: true,
          },
        },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe("NONCE_REPLAYED");
    });
  });

  // =========================================================================
  // 5. DATABASE STANDBY & ZERO CREDENTIAL LEAKAGE
  // =========================================================================
  describe("5. Database Standby & Information Leakage Protection", () => {
    it("returns sanitized 503 DATABASE_UNAVAILABLE and suppresses DB error details", async () => {
      vi.spyOn(approvalRepo, "listApprovals").mockRejectedValueOnce({
        code: "28P01",
        message: 'password authentication failed for user "postgres_secret_admin"',
      });

      const response = await server.inject({
        method: "GET",
        url: "/api/approvals",
      });

      expect(response.statusCode).toBe(503);
      const json = response.json();
      expect(json.error.code).toBe("DATABASE_UNAVAILABLE");
      expect(json.error.message).toBe("Persistence store is currently unavailable in standby mode.");
      // Assert zero leak of raw password/database message in response body
      expect(JSON.stringify(json)).not.toContain("password authentication failed");
      expect(JSON.stringify(json)).not.toContain("postgres_secret_admin");
    });
  });
});
