import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../server.js";
import {
  EvidencePacketResponseSchema,
  AuditEventListResponseSchema,
} from "@warrant/contracts";
import { verifyEvidencePacketIntegrity } from "@warrant/domain";
import { buildEvidencePacketForProposal } from "../services/evidencePacketService.js";
import * as auditRepo from "../db/repositories/auditRepository.js";
import * as policyRepo from "../db/repositories/policyRepository.js";
import { db } from "../db/index.js";
import {
  checkoutProposals,
  approvals,
  policyVersions,
  policies,
  testRuns,
  findings,
  paymentOrders,
  spendReservations,
  auditEvents,
} from "../db/schema.js";

describe("Evidence Packet and Audit API Routes", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await buildServer({
      checkDb: async () => ({ configured: true, connected: false }),
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  describe("GET /api/audit-events", () => {
    it("returns 200 and matches AuditEventListResponseSchema", async () => {
      vi.spyOn(auditRepo, "listAuditEvents").mockResolvedValueOnce({
        events: [],
        total: 0,
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/audit-events",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      const parsed = AuditEventListResponseSchema.safeParse(body);
      expect(parsed.success).toBe(true);
      expect(Array.isArray(body.events)).toBe(true);
      expect(typeof body.total).toBe("number");
    });

    it("v1 alias GET /api/v1/audit-events works identically", async () => {
      vi.spyOn(auditRepo, "listAuditEvents").mockResolvedValueOnce({
        events: [],
        total: 0,
      });

      const res = await app.inject({
        method: "GET",
        url: "/api/v1/audit-events",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(AuditEventListResponseSchema.safeParse(body).success).toBe(true);
    });

    it("rejects invalid limit parameter", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/audit-events?limit=9999",
      });

      expect(res.statusCode).toBe(400);
      const body = JSON.parse(res.payload);
      expect(body.error.code).toBe("VALIDATION_ERROR");
    });
  });

  describe("GET /api/evidence-packets", () => {
    it("returns 404 when proposal is not found", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce("test-owner-id");
      vi.spyOn(db, "select").mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([]),
          }),
        }),
      } as any);

      const missingId = randomUUID();
      const res = await app.inject({
        method: "GET",
        url: `/api/evidence-packets/proposals/${missingId}`,
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.error.code).toBe("NOT_FOUND");
    });

    it("returns 404 when payment order is not found", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce("test-owner-id");
      vi.spyOn(db, "select").mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([]),
          }),
        }),
      } as any);

      const missingId = randomUUID();
      const res = await app.inject({
        method: "GET",
        url: `/api/evidence-packets/orders/${missingId}`,
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.error.code).toBe("NOT_FOUND");
    });

    it("returns 404 when policy version is not found", async () => {
      vi.spyOn(db, "select").mockReturnValueOnce({
        from: () => ({
          where: () => ({
            limit: () => Promise.resolve([]),
          }),
        }),
      } as any);

      const missingId = randomUUID();
      const res = await app.inject({
        method: "GET",
        url: `/api/evidence-packets/policies/${missingId}`,
      });

      expect(res.statusCode).toBe(404);
      const body = JSON.parse(res.payload);
      expect(body.error.code).toBe("NOT_FOUND");
    });

    it("returns 200 with sealed packet for built-in policy preset", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/evidence-packets/policies/pol_v1_books_hardware",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      const parsed = EvidencePacketResponseSchema.safeParse(body);
      expect(parsed.success).toBe(true);

      // Verify cryptographic packet hash integrity
      const packet = body.packet;
      const integrity = verifyEvidencePacketIntegrity(packet);
      expect(integrity.valid).toBe(true);
      expect(packet.target.entityType).toBe("POLICY_VERSION");
      expect(packet.redactionNotice).toBeDefined();
    });

    it("supports /api/audit-packets alias routes", async () => {
      const res = await app.inject({
        method: "GET",
        url: "/api/audit-packets/policies/pol_v1_books_hardware",
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(EvidencePacketResponseSchema.safeParse(body).success).toBe(true);
    });
  });

  describe("buildEvidencePacketForProposal Service Logic", () => {
    it("assembles complete evidence packet and verifies SHA-256 seal", async () => {
      const proposalId = randomUUID();
      const approvalId = randomUUID();
      const policyVersionId = randomUUID();
      const policyId = randomUUID();
      const testRunId = randomUUID();

      const mockDb = {
        select: () => ({
          from: (table: any) => {
            const getResult = () => {
              if (table === checkoutProposals) {
                return [
                  {
                    id: proposalId,
                    approvalId,
                    policyVersionId,
                    policyHash: "f".repeat(64),
                    decision: "ALLOW",
                    reasonCodes: ["OK"],
                    ruleTrace: [],
                    evaluatedAt: new Date(),
                    consumedNonceId: randomUUID(),
                    proposedCart: { items: [], totalAmountMinor: 4500 },
                    evidenceSnapshot: { verifiedMerchant: true },
                  },
                ];
              }
              if (table === approvals) {
                return [
                  {
                    id: approvalId,
                    spendLimitMinor: 10000,
                    currency: "USD",
                    qualifyingTestRunId: testRunId,
                    expiresAt: new Date(Date.now() + 86400000),
                    revokedAt: null,
                  },
                ];
              }
              if (table === policyVersions) {
                return [
                  {
                    id: policyVersionId,
                    policyId,
                    versionNumber: 1,
                    policyHash: "f".repeat(64),
                    sourceMandateSnapshot: "Test purchase mandate",
                    intentSpec: { budget: 100 },
                    policyDocument: { maxCartTotalMinor: 10000 },
                  },
                ];
              }
              if (table === policies) {
                return [
                  {
                    id: policyId,
                    name: "Test Policy",
                    sourceMandate: "Test purchase mandate",
                  },
                ];
              }
              if (table === testRuns) {
                return [
                  {
                    id: testRunId,
                    status: "PASSED",
                    exploredCount: 500,
                    domainVersion: "1.0.0",
                    findingCount: 0,
                  },
                ];
              }
              if (table === findings || table === paymentOrders || table === spendReservations || table === auditEvents) {
                return [];
              }
              return [];
            };

            const queryObj: any = {
              where: () => queryObj,
              orderBy: () => queryObj,
              limit: async () => getResult(),
              then: (resolve: any) => resolve(getResult()),
            };

            return queryObj;
          },
        }),
      };

      const packet = await buildEvidencePacketForProposal(proposalId, mockDb as any);
      expect(packet.packetId).toBeDefined();
      expect(packet.target.entityId).toBe(proposalId);
      expect(packet.policyIdentity.policyHash).toBe("f".repeat(64));
      expect(packet.verificationProof.zeroCriticalFindingsVerified).toBe(true);
      expect(packet.overallStatus).toBe("UNTESTED"); // No payment order yet executed

      // Check cryptographic integrity
      const integrity = verifyEvidencePacketIntegrity(packet);
      expect(integrity.valid).toBe(true);
      expect(integrity.calculatedHash).toBe(packet.packetHash);
    });

    it("rejects proposal packet retrieval if ownerId does not match (IDOR protection)", async () => {
      const proposalId = randomUUID();
      const realOwnerId = randomUUID();
      const foreignOwnerId = randomUUID();

      const mockDb = {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () => [
                {
                  id: proposalId,
                  ownerId: realOwnerId,
                },
              ],
            }),
          }),
        }),
      };

      await expect(
        buildEvidencePacketForProposal(proposalId, mockDb as any, foreignOwnerId)
      ).rejects.toThrowError(/not found/i);
    });
  });
});
