import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolve } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { pool, db } from "../db/index.js";
import { buildServer } from "../server.js";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import {
  policies,
  policyVersions,
  testRuns,
  findings,
  approvals,
  checkoutNonces,
  checkoutProposals,
  spendReservations,
} from "../db/schema.js";
import { ensureDefaultUser } from "../db/repositories/policyRepository.js";
import {
  issueCheckoutNonce,
  submitCheckoutProposal,
} from "../db/repositories/checkoutProposalRepository.js";
import { computePolicyHash } from "@warrant/domain";
import { ReasonCode } from "@warrant/contracts";
import type { FastifyInstance } from "fastify";
import type { PolicyDocument, ConfirmedIntent, SearchSpaceDefinition } from "@warrant/contracts";

describe("Phase 4 Real PostgreSQL Persistence & Verification", () => {
  let isDbLive = false;
  let server: FastifyInstance;
  const createdPolicyIds: string[] = [];
  const createdRunIds: string[] = [];
  const createdApprovalIds: string[] = [];

  beforeAll(async () => {
    // Probe real PostgreSQL connection safely
    try {
      const client = await pool.connect();
      await client.query("SELECT 1");
      client.release();
      isDbLive = true;

      // Apply migrations if DB is live and reachable
      await migrate(db, {
        migrationsFolder: resolve(process.cwd(), "drizzle/migrations"),
      });
    } catch {
      isDbLive = false;
    }

    server = await buildServer({
      checkDb: async () => ({
        configured: true,
        connected: isDbLive,
        latencyMs: isDbLive ? 2 : undefined,
      }),
    });
  });

  afterAll(async () => {
    if (isDbLive) {
      // Clean up isolated test records safely
      for (const appId of createdApprovalIds) {
        try {
          await db.delete(spendReservations).where(eq(spendReservations.approvalId, appId));
          await db.delete(checkoutProposals).where(eq(checkoutProposals.approvalId, appId));
          await db.delete(checkoutNonces).where(eq(checkoutNonces.approvalId, appId));
          await db.delete(approvals).where(eq(approvals.id, appId));
        } catch {
          // ignore cleanup errors on teardown
        }
      }
      for (const runId of createdRunIds) {
        try {
          await db.delete(findings).where(eq(findings.testRunId, runId));
          await db.delete(testRuns).where(eq(testRuns.id, runId));
        } catch {
          // ignore cleanup errors on teardown
        }
      }
      for (const policyId of createdPolicyIds) {
        try {
          await db.delete(policyVersions).where(eq(policyVersions.policyId, policyId));
          await db.delete(policies).where(eq(policies.id, policyId));
        } catch {
          // ignore cleanup errors on teardown
        }
      }
    }
    await server.close();
  }, 30000);

  const validPolicy: PolicyDocument = {
    schemaVersion: "1.0",
    currency: "USD",
    maxItemPriceMinor: 8000,
    maxCartTotalMinor: 20000,
    allowedCategories: ["Books", "Office Supplies"],
    prohibitedCategories: ["Weapons", "Gift Cards"],
    requireEvidence: true,
  };

  const validIntent: ConfirmedIntent = {
    name: "Real DB Test Policy Intent",
    currency: "USD",
    maxItemPriceMinor: 8000,
    maxCartTotalMinor: 20000,
    allowedCategories: ["Books", "Office Supplies"],
    prohibitedCategories: ["Weapons", "Gift Cards"],
    requireEvidence: true,
  };

  const testSearchSpace: SearchSpaceDefinition = {
    domainVersion: "1.0.0",
    categories: ["Books", "Gift Cards"],
    pricePointsMinor: [5000, 10000],
    quantities: [1],
    currencies: ["USD"],
    maxItemsPerCart: 1,
    evidenceVariations: ["COMPLETE"],
  };

  describe("Real PostgreSQL Live Persistence (conditional on live DB authentication)", () => {
    it("1. Creates policy and initial immutable version 1 record in PostgreSQL", async (ctx) => {
      if (!isDbLive) {
        ctx.skip();
        return;
      }
      const res = await server.inject({
        method: "POST",
        url: "/api/policies",
        payload: {
          name: "Real DB Persistence Policy",
          sourceMandate: "Mandate text for live DB test",
          policy: validPolicy,
          intent: validIntent,
          confirmationState: "CONFIRMED",
        },
      });

      expect(res.statusCode).toBe(201);
      const created = res.json();
      expect(created.id).toBeDefined();
      expect(created.policyId).toBeDefined();
      expect(created.versionNumber).toBe(1);
      createdPolicyIds.push(created.policyId);

      // Verify row exists directly in PostgreSQL
      const dbRows = await db.select().from(policies).where(eq(policies.id, created.policyId));
      expect(dbRows.length).toBe(1);
      expect(dbRows[0]?.currentVersionId).toBe(created.id);
    });

    it("2 & 3. Executes verification run and confirms run + findings are persisted in PostgreSQL", async (ctx) => {
      if (!isDbLive) {
        ctx.skip();
        return;
      }
      const policyId = createdPolicyIds[0];
      if (!policyId) throw new Error("Policy ID not found from previous step");

      const versionRes = await db.select().from(policies).where(eq(policies.id, policyId));
      const versionId = versionRes[0]?.currentVersionId;
      if (!versionId) throw new Error("Version ID not found on policy");

      const runRes = await server.inject({
        method: "POST",
        url: "/api/verification/runs",
        payload: {
          policy: validPolicy,
          intent: validIntent,
          searchSpace: testSearchSpace,
          config: {
            policyVersionId: versionId,
            maxCandidates: 10,
          },
        },
      });

      expect(runRes.statusCode).toBe(201);
      const runBody = runRes.json();
      expect(runBody.run).toBeDefined();
      expect(runBody.run.id).toBeDefined();
      expect(runBody.run.policyVersionId).toBe(versionId);
      createdRunIds.push(runBody.run.id);

      // Confirm test_runs record in PostgreSQL
      const dbRuns = await db.select().from(testRuns).where(eq(testRuns.id, runBody.run.id));
      expect(dbRuns.length).toBe(1);
      expect(dbRuns[0]?.status).toBe("COMPLETED");

      // Confirm findings in PostgreSQL if any discovered
      if (runBody.run.findingCount > 0) {
        const dbFindings = await db.select().from(findings).where(eq(findings.testRunId, runBody.run.id));
        expect(dbFindings.length).toBe(runBody.run.findingCount);
      }
    });

    it("4 & 5. Retrieves saved run via API and verifies exact match with PostgreSQL record", async (ctx) => {
      if (!isDbLive) {
        ctx.skip();
        return;
      }
      const runId = createdRunIds[0];
      if (!runId) throw new Error("Run ID not found from previous step");

      const res = await server.inject({
        method: "GET",
        url: `/api/verification/runs/${runId}`,
      });

      expect(res.statusCode).toBe(200);
      const detail = res.json();
      expect(detail.id).toBe(runId);
      expect(detail.policyVersionId).toBeDefined();
      expect(detail.report).toBeDefined();
      expect(detail.report.totalCandidatesExplored).toBeGreaterThan(0);
    });

    it("6. Confirms subsequent list request includes the saved run", async (ctx) => {
      if (!isDbLive) {
        ctx.skip();
        return;
      }
      const runId = createdRunIds[0];
      if (!runId) throw new Error("Run ID not found from previous step");

      const res = await server.inject({
        method: "GET",
        url: "/api/verification/runs",
      });

      expect(res.statusCode).toBe(200);
      const list = res.json();
      expect(list.runs).toBeDefined();
      const found = list.runs.some((r: any) => r.id === runId);
      expect(found).toBe(true);
    });

    it("7. Verifies prior policy versions remain unchanged after creating a new version", async (ctx) => {
      if (!isDbLive) {
        ctx.skip();
        return;
      }
      const policyId = createdPolicyIds[0];
      if (!policyId) throw new Error("Policy ID not found from previous step");

      const v1Rows = await db.select().from(policyVersions).where(eq(policyVersions.policyId, policyId));
      if (!v1Rows[0]) throw new Error("V1 row not found in policyVersions");
      const v1Snapshot = JSON.stringify(v1Rows[0].policyDocument);
      const v1Id = v1Rows[0].id;

      const modifiedPolicy: PolicyDocument = {
        ...validPolicy,
        maxCartTotalMinor: 25000,
      };

      const res = await server.inject({
        method: "POST",
        url: `/api/policies/${policyId}/versions`,
        payload: {
          sourceMandateSnapshot: "Repaired mandate",
          policy: modifiedPolicy,
          intent: validIntent,
          confirmationState: "CONFIRMED",
        },
      });

      expect(res.statusCode).toBe(201);
      const v2 = res.json();
      expect(v2.versionNumber).toBe(2);

      // Verify V1 record in PostgreSQL was not mutated (Immutability Invariant)
      const afterV1Rows = await db.select().from(policyVersions).where(eq(policyVersions.id, v1Id));
      expect(afterV1Rows[0]).toBeDefined();
      expect(JSON.stringify(afterV1Rows[0]?.policyDocument)).toBe(v1Snapshot);
      expect(afterV1Rows[0]?.versionNumber).toBe(1);
    });
  });

  describe("Failure Handling & Standby Mode Verification", () => {
    it("reports honest database status without fabricating live persistence", async () => {
      const healthRes = await server.inject({
        method: "GET",
        url: "/health/ready",
      });

      if (isDbLive) {
        expect(healthRes.statusCode).toBe(200);
      } else {
        expect(healthRes.statusCode).toBe(503);
      }
    });

    it("pure execution POST /api/verification/run functions independently of DB status", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/verification/run",
        payload: {
          policy: validPolicy,
          intent: validIntent,
          searchSpace: testSearchSpace,
          config: { maxCandidates: 10 },
        },
      });

      expect(res.statusCode).toBe(200);
      const report = res.json();
      expect(report.status).toBe("COMPLETED");
      expect(report.totalCandidatesExplored).toBeGreaterThan(0);
    });

    it("preset policy fallback returns clean preset data without fabricating DB records", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/policies",
      });

      expect(res.statusCode).toBe(200);
      const data = res.json();
      expect(data.policies.length).toBeGreaterThan(0);
      if (!isDbLive) {
        const allPresets = data.policies.every((p: any) => p.isPreset === true || Boolean(p.presetId));
        expect(allPresets).toBe(true);
      }
    });
  });

  describe("Phase 4.2 Nonce Replay Defense & Concurrent Spend Serialization (Real PostgreSQL)", () => {
    it("Step 8 [REAL-PG]: rejects nonce replay when same nonce is submitted twice to real PostgreSQL", async (ctx) => {
      if (!isDbLive) {
        ctx.skip();
        return;
      }

      // 1. Setup policy, version, and approval in real database
      const defaultOwner = await ensureDefaultUser(db);
      const testPolicyId = randomUUID();
      createdPolicyIds.push(testPolicyId);

      await db.insert(policies).values({
        id: testPolicyId,
        ownerId: defaultOwner,
        name: `Test Nonce Replay Policy ${Date.now()}`,
        sourceMandate: "Test mandate for nonce replay",
      });

      const pHash = computePolicyHash(validPolicy);
      const [pv] = await db.insert(policyVersions).values({
        id: randomUUID(),
        policyId: testPolicyId,
        ownerId: defaultOwner,
        versionNumber: 1,
        sourceMandateSnapshot: "Test mandate",
        intentSpec: validIntent,
        policyDocument: validPolicy,
        policySchemaVersion: "1.0",
        canonicalizationVersion: "1.0",
        policyHash: pHash,
        confirmationState: "CONFIRMED",
      }).returning();
      if (!pv) throw new Error("Failed to insert policy version");

      // Create qualifying test run for approval FK
      const [tr] = await db.insert(testRuns).values({
        id: randomUUID(),
        ownerId: defaultOwner,
        policyVersionId: pv.id,
        domainId: "test_domain",
        domainVersion: "1.0.0",
        domainDefinition: {},
        runnerVersion: "1.0.0",
        status: "COMPLETED",
        candidateLimit: 10,
        resultSummary: {},
      }).returning();
      if (!tr) throw new Error("Failed to insert test run");
      createdRunIds.push(tr.id);

      const [app] = await db.insert(approvals).values({
        id: randomUUID(),
        ownerId: defaultOwner,
        policyVersionId: pv.id,
        policyHash: pHash,
        qualifyingTestRunId: tr.id,
        scope: { allowAll: true },
        spendLimitMinor: 10000,
        currency: "USD",
        expiresAt: new Date(Date.now() + 3600 * 1000),
      }).returning();
      if (!app) throw new Error("Failed to insert approval");
      createdApprovalIds.push(app.id);

      // 2. Issue a real nonce
      const nonce = await issueCheckoutNonce(db, {
        ownerId: defaultOwner,
        approvalId: app.id,
        policyVersionId: pv.id,
        policyHash: pHash,
        ttlSeconds: 300,
      });

      const testCart = {
        currency: "USD",
        items: [
          {
            sku: "SKU-TEST-1",
            title: "Test Book",
            category: "Books",
            unitPriceMinor: 2500,
            quantity: 1,
          },
        ],
      };

      const testEvidence = {
        quotesVerified: true,
        evidenceComplete: true,
        stale: false,
      };

      // 3. First submission succeeds and creates reservation
      const firstResult = await submitCheckoutProposal(db, {
        ownerId: defaultOwner,
        approvalId: app.id,
        policyVersionId: pv.id,
        policyHash: pHash,
        nonceId: nonce.id,
        cart: testCart,
        evidenceSnapshot: testEvidence,
      });

      expect(firstResult.decision).toBe("ALLOW");
      expect(firstResult.reservation).toBeDefined();
      expect(firstResult.reservation.state).toBe("ORDER_CREATION_PENDING");

      // 4. Second submission with the SAME nonce MUST fail with NonceReplayError
      await expect(
        submitCheckoutProposal(db, {
          ownerId: defaultOwner,
          approvalId: app.id,
          policyVersionId: pv.id,
          policyHash: pHash,
          nonceId: nonce.id,
          cart: testCart,
          evidenceSnapshot: testEvidence,
        })
      ).rejects.toThrowError(/NONCE_REPLAYED/);
    });

    it("Step 9 [REAL-PG]: database engine enforces unique constraint on checkout_proposals.consumed_nonce_id", async (ctx) => {
      if (!isDbLive) {
        ctx.skip();
        return;
      }

      const defaultOwner = await ensureDefaultUser(db);
      const testPolicyId = randomUUID();
      createdPolicyIds.push(testPolicyId);

      await db.insert(policies).values({
        id: testPolicyId,
        ownerId: defaultOwner,
        name: `Test Unique Constraint Policy ${Date.now()}`,
        sourceMandate: "Test mandate",
      });

      const pHash = computePolicyHash(validPolicy);
      const [pv] = await db.insert(policyVersions).values({
        id: randomUUID(),
        policyId: testPolicyId,
        ownerId: defaultOwner,
        versionNumber: 1,
        sourceMandateSnapshot: "Test mandate",
        intentSpec: validIntent,
        policyDocument: validPolicy,
        policySchemaVersion: "1.0",
        canonicalizationVersion: "1.0",
        policyHash: pHash,
        confirmationState: "CONFIRMED",
      }).returning();
      if (!pv) throw new Error("Failed to insert policy version");

      const [tr] = await db.insert(testRuns).values({
        id: randomUUID(),
        ownerId: defaultOwner,
        policyVersionId: pv.id,
        domainId: "test_domain",
        domainVersion: "1.0.0",
        domainDefinition: {},
        runnerVersion: "1.0.0",
        status: "COMPLETED",
        candidateLimit: 10,
        resultSummary: {},
      }).returning();
      if (!tr) throw new Error("Failed to insert test run");
      createdRunIds.push(tr.id);

      const [app] = await db.insert(approvals).values({
        id: randomUUID(),
        ownerId: defaultOwner,
        policyVersionId: pv.id,
        policyHash: pHash,
        qualifyingTestRunId: tr.id,
        scope: { allowAll: true },
        spendLimitMinor: 10000,
        currency: "USD",
        expiresAt: new Date(Date.now() + 3600 * 1000),
      }).returning();
      if (!app) throw new Error("Failed to insert approval");
      createdApprovalIds.push(app.id);

      const nonce = await issueCheckoutNonce(db, {
        ownerId: defaultOwner,
        approvalId: app.id,
        policyVersionId: pv.id,
        policyHash: pHash,
      });

      const cartHash = createHash("sha256").update("cart1").digest("hex");

      // Insert first proposal referencing consumed_nonce_id
      await db.insert(checkoutProposals).values({
        id: randomUUID(),
        ownerId: defaultOwner,
        approvalId: app.id,
        policyVersionId: pv.id,
        policyHash: pHash,
        consumedNonceId: nonce.id,
        cartHash,
        proposedCart: { currency: "USD", items: [] },
        normalizedCart: { currency: "USD", items: [] },
        evidenceSnapshot: {},
        decision: "ALLOW",
        reasonCodes: ["ALL_RULES_PASSED"],
        ruleTrace: [],
        evaluatedAt: new Date(),
      });

      // Attempt second direct insert with same consumed_nonce_id; PostgreSQL must throw 23505 unique constraint violation
      let errorThrown: any = null;
      try {
        await db.insert(checkoutProposals).values({
          id: randomUUID(),
          ownerId: defaultOwner,
          approvalId: app.id,
          policyVersionId: pv.id,
          policyHash: pHash,
          consumedNonceId: nonce.id, // duplicate consumed nonce!
          cartHash,
          proposedCart: { currency: "USD", items: [] },
          normalizedCart: { currency: "USD", items: [] },
          evidenceSnapshot: {},
          decision: "ALLOW",
          reasonCodes: ["ALL_RULES_PASSED"],
          ruleTrace: [],
          evaluatedAt: new Date(),
        });
      } catch (err: any) {
        errorThrown = err;
      }

      expect(errorThrown).toBeDefined();
      expect(errorThrown.code).toBe("23505"); // PostgreSQL unique_violation code
    });

    it("Step 10 [REAL-PG]: serializes concurrent proposals on approval row lock preventing overspend race condition", async (ctx) => {
      if (!isDbLive) {
        ctx.skip();
        return;
      }

      const defaultOwner = await ensureDefaultUser(db);
      const testPolicyId = randomUUID();
      createdPolicyIds.push(testPolicyId);

      await db.insert(policies).values({
        id: testPolicyId,
        ownerId: defaultOwner,
        name: `Test Concurrent Spend Policy ${Date.now()}`,
        sourceMandate: "Test mandate",
      });

      const pHash = computePolicyHash(validPolicy);
      const [pv] = await db.insert(policyVersions).values({
        id: randomUUID(),
        policyId: testPolicyId,
        ownerId: defaultOwner,
        versionNumber: 1,
        sourceMandateSnapshot: "Test mandate",
        intentSpec: validIntent,
        policyDocument: validPolicy,
        policySchemaVersion: "1.0",
        canonicalizationVersion: "1.0",
        policyHash: pHash,
        confirmationState: "CONFIRMED",
      }).returning();
      if (!pv) throw new Error("Failed to insert policy version");

      const [tr] = await db.insert(testRuns).values({
        id: randomUUID(),
        ownerId: defaultOwner,
        policyVersionId: pv.id,
        domainId: "test_domain",
        domainVersion: "1.0.0",
        domainDefinition: {},
        runnerVersion: "1.0.0",
        status: "COMPLETED",
        candidateLimit: 10,
        resultSummary: {},
      }).returning();
      if (!tr) throw new Error("Failed to insert test run");
      createdRunIds.push(tr.id);

      // Approval limit is $100.00 (10000 minor)
      const [app] = await db.insert(approvals).values({
        id: randomUUID(),
        ownerId: defaultOwner,
        policyVersionId: pv.id,
        policyHash: pHash,
        qualifyingTestRunId: tr.id,
        scope: { allowAll: true },
        spendLimitMinor: 10000,
        currency: "USD",
        expiresAt: new Date(Date.now() + 3600 * 1000),
      }).returning();
      if (!app) throw new Error("Failed to insert approval");
      createdApprovalIds.push(app.id);

      // Issue two valid distinct nonces
      const nonceA = await issueCheckoutNonce(db, {
        ownerId: defaultOwner,
        approvalId: app.id,
        policyVersionId: pv.id,
        policyHash: pHash,
      });

      const nonceB = await issueCheckoutNonce(db, {
        ownerId: defaultOwner,
        approvalId: app.id,
        policyVersionId: pv.id,
        policyHash: pHash,
      });

      // Both carts are $60.00 (6000 minor).
      // Alone: 6000 <= 10000 (ALLOW).
      // Combined: 6000 + 6000 = 12000 > 10000 (DENY).
      const cartA = {
        currency: "USD",
        items: [{ sku: "A", title: "Cart A Item", category: "Books", unitPriceMinor: 6000, quantity: 1 }],
      };
      const cartB = {
        currency: "USD",
        items: [{ sku: "B", title: "Cart B Item", category: "Books", unitPriceMinor: 6000, quantity: 1 }],
      };
      const testEvidence = { quotesVerified: true, evidenceComplete: true, stale: false };

      // Dispatch both proposals simultaneously across parallel promises
      const [resA, resB] = await Promise.all([
        submitCheckoutProposal(db, {
          ownerId: defaultOwner,
          approvalId: app.id,
          policyVersionId: pv.id,
          policyHash: pHash,
          nonceId: nonceA.id,
          cart: cartA,
          evidenceSnapshot: testEvidence,
        }),
        submitCheckoutProposal(db, {
          ownerId: defaultOwner,
          approvalId: app.id,
          policyVersionId: pv.id,
          policyHash: pHash,
          nonceId: nonceB.id,
          cart: cartB,
          evidenceSnapshot: testEvidence,
        }),
      ]);

      const decisions = [resA.decision, resB.decision].sort();
      // Exactly one ALLOW and one DENY
      expect(decisions).toEqual(["ALLOW", "DENY"]);

      // The denied one has ReasonCode.LIFETIME_SPEND_LIMIT_EXCEEDED
      const deniedRes = resA.decision === "DENY" ? resA : resB;
      const allowedRes = resA.decision === "ALLOW" ? resA : resB;

      expect(deniedRes.reasonCodes).toContain(ReasonCode.LIFETIME_SPEND_LIMIT_EXCEEDED);
      expect(deniedRes.reservation).toBeNull();
      expect(allowedRes.reservation).toBeDefined();
      expect(allowedRes.reservation.amountMinor).toBe(6000);
    }, 20000);

    it("Step 11 [REAL-PG]: confirms that revoked or expired approvals cannot authorize checkout", async (ctx) => {
      if (!isDbLive) {
        ctx.skip();
        return;
      }

      const defaultOwner = await ensureDefaultUser(db);
      const testPolicyId = randomUUID();
      createdPolicyIds.push(testPolicyId);

      await db.insert(policies).values({
        id: testPolicyId,
        ownerId: defaultOwner,
        name: `Test Revoked/Expired Policy ${Date.now()}`,
        sourceMandate: "Test mandate",
      });

      const pHash = computePolicyHash(validPolicy);
      const [pv] = await db.insert(policyVersions).values({
        id: randomUUID(),
        policyId: testPolicyId,
        ownerId: defaultOwner,
        versionNumber: 1,
        sourceMandateSnapshot: "Test mandate",
        intentSpec: validIntent,
        policyDocument: validPolicy,
        policySchemaVersion: "1.0",
        canonicalizationVersion: "1.0",
        policyHash: pHash,
        confirmationState: "CONFIRMED",
      }).returning();
      if (!pv) throw new Error("Failed to insert policy version");

      const [tr] = await db.insert(testRuns).values({
        id: randomUUID(),
        ownerId: defaultOwner,
        policyVersionId: pv.id,
        domainId: "test_domain",
        domainVersion: "1.0.0",
        domainDefinition: {},
        runnerVersion: "1.0.0",
        status: "COMPLETED",
        candidateLimit: 10,
        resultSummary: {},
      }).returning();
      if (!tr) throw new Error("Failed to insert test run");
      createdRunIds.push(tr.id);

      // 1. Test Revoked Approval
      const [revokedApp] = await db.insert(approvals).values({
        id: randomUUID(),
        ownerId: defaultOwner,
        policyVersionId: pv.id,
        policyHash: pHash,
        qualifyingTestRunId: tr.id,
        scope: {},
        spendLimitMinor: 10000,
        currency: "USD",
        expiresAt: new Date(Date.now() + 3600 * 1000),
        revokedAt: new Date(),
      }).returning();
      if (!revokedApp) throw new Error("Failed to insert revoked approval");
      createdApprovalIds.push(revokedApp.id);

      // Nonce issuance via HTTP must be rejected with 400 REVOKED_APPROVAL
      const nonceRevokedRes = await server.inject({
        method: "POST",
        url: "/api/checkout/nonces",
        payload: {
          approvalId: revokedApp.id,
          policyVersionId: pv.id,
          policyHash: pHash,
          ttlSeconds: 300,
        },
      });
      expect(nonceRevokedRes.statusCode).toBe(400);
      expect(nonceRevokedRes.json().error.code).toBe("REVOKED_APPROVAL");

      // Direct submission against revoked approval must throw REVOKED_APPROVAL
      const dummyNonceId = randomUUID();
      await expect(
        submitCheckoutProposal(db, {
          ownerId: defaultOwner,
          approvalId: revokedApp.id,
          policyVersionId: pv.id,
          policyHash: pHash,
          nonceId: dummyNonceId,
          cart: { currency: "USD", items: [] },
          evidenceSnapshot: {},
        })
      ).rejects.toThrowError(/REVOKED_APPROVAL/);

      // 2. Test Expired Approval
      const [expiredApp] = await db.insert(approvals).values({
        id: randomUUID(),
        ownerId: defaultOwner,
        policyVersionId: pv.id,
        policyHash: pHash,
        qualifyingTestRunId: tr.id,
        scope: {},
        spendLimitMinor: 10000,
        currency: "USD",
        expiresAt: new Date(Date.now() - 3600 * 1000), // expired 1 hour ago
        revokedAt: null,
      }).returning();
      if (!expiredApp) throw new Error("Failed to insert expired approval");
      createdApprovalIds.push(expiredApp.id);

      const nonceExpiredRes = await server.inject({
        method: "POST",
        url: "/api/checkout/nonces",
        payload: {
          approvalId: expiredApp.id,
          policyVersionId: pv.id,
          policyHash: pHash,
          ttlSeconds: 300,
        },
      });
      expect(nonceExpiredRes.statusCode).toBe(400);
      expect(nonceExpiredRes.json().error.code).toBe("EXPIRED_APPROVAL");

      await expect(
        submitCheckoutProposal(db, {
          ownerId: defaultOwner,
          approvalId: expiredApp.id,
          policyVersionId: pv.id,
          policyHash: pHash,
          nonceId: dummyNonceId,
          cart: { currency: "USD", items: [] },
          evidenceSnapshot: {},
        })
      ).rejects.toThrowError(/EXPIRED_APPROVAL/);
    });

    it("Step 12 [REAL-PG]: verifies transaction rollback on failure preserves unconsumed nonce and zero reservations", async (ctx) => {
      if (!isDbLive) {
        ctx.skip();
        return;
      }

      const defaultOwner = await ensureDefaultUser(db);
      const testPolicyId = randomUUID();
      createdPolicyIds.push(testPolicyId);

      await db.insert(policies).values({
        id: testPolicyId,
        ownerId: defaultOwner,
        name: `Test Rollback Policy ${Date.now()}`,
        sourceMandate: "Test mandate",
      });

      const pHash = computePolicyHash(validPolicy);
      const [pv] = await db.insert(policyVersions).values({
        id: randomUUID(),
        policyId: testPolicyId,
        ownerId: defaultOwner,
        versionNumber: 1,
        sourceMandateSnapshot: "Test mandate",
        intentSpec: validIntent,
        policyDocument: validPolicy,
        policySchemaVersion: "1.0",
        canonicalizationVersion: "1.0",
        policyHash: pHash,
        confirmationState: "CONFIRMED",
      }).returning();
      if (!pv) throw new Error("Failed to insert policy version");

      const [tr] = await db.insert(testRuns).values({
        id: randomUUID(),
        ownerId: defaultOwner,
        policyVersionId: pv.id,
        domainId: "test_domain",
        domainVersion: "1.0.0",
        domainDefinition: {},
        runnerVersion: "1.0.0",
        status: "COMPLETED",
        candidateLimit: 10,
        resultSummary: {},
      }).returning();
      if (!tr) throw new Error("Failed to insert test run");
      createdRunIds.push(tr.id);

      const [app] = await db.insert(approvals).values({
        id: randomUUID(),
        ownerId: defaultOwner,
        policyVersionId: pv.id,
        policyHash: pHash,
        qualifyingTestRunId: tr.id,
        scope: {},
        spendLimitMinor: 10000,
        currency: "USD",
        expiresAt: new Date(Date.now() + 3600 * 1000),
      }).returning();
      if (!app) throw new Error("Failed to insert approval");
      createdApprovalIds.push(app.id);

      const nonce = await issueCheckoutNonce(db, {
        ownerId: defaultOwner,
        approvalId: app.id,
        policyVersionId: pv.id,
        policyHash: pHash,
        ttlSeconds: 300,
      });

      // Submit with mismatched currency ("EUR" instead of "USD") to trigger rollback inside transaction
      await expect(
        submitCheckoutProposal(db, {
          ownerId: defaultOwner,
          approvalId: app.id,
          policyVersionId: pv.id,
          policyHash: pHash,
          nonceId: nonce.id,
          cart: { currency: "EUR", items: [{ sku: "X", title: "Item", category: "Books", unitPriceMinor: 1000, quantity: 1 }] },
          evidenceSnapshot: {},
        })
      ).rejects.toThrowError(/CURRENCY_MISMATCH/);

      // Verify that after transaction rollback, the nonce was NOT consumed
      const [persistedNonce] = await db.select().from(checkoutNonces).where(eq(checkoutNonces.id, nonce.id));
      expect(persistedNonce).toBeDefined();
      expect(persistedNonce?.consumedAt).toBeNull();

      // Verify no proposal or reservation was inserted
      const proposals = await db.select().from(checkoutProposals).where(eq(checkoutProposals.consumedNonceId, nonce.id));
      expect(proposals.length).toBe(0);

      const reservations = await db.select().from(spendReservations).where(eq(spendReservations.approvalId, app.id));
      expect(reservations.length).toBe(0);
    });
  });

  describe("Phase 4.3 Server-Side Approval Qualification & Decision D-014 (Real PostgreSQL)", () => {
    it("Step 13 [REAL-PG]: exercises POST /api/approvals with valid qualifying run and confirms persistence", async (ctx) => {
      if (!isDbLive) {
        ctx.skip();
        return;
      }

      const defaultOwner = await ensureDefaultUser(db);
      const testPolicyId = randomUUID();
      createdPolicyIds.push(testPolicyId);

      await db.insert(policies).values({
        id: testPolicyId,
        ownerId: defaultOwner,
        name: `Test Valid Approval Policy ${Date.now()}`,
        sourceMandate: "Test mandate",
      });

      const pHash = computePolicyHash(validPolicy);
      const [pv] = await db.insert(policyVersions).values({
        id: randomUUID(),
        policyId: testPolicyId,
        ownerId: defaultOwner,
        versionNumber: 1,
        sourceMandateSnapshot: "Test mandate",
        intentSpec: validIntent,
        policyDocument: validPolicy,
        policySchemaVersion: "1.0",
        canonicalizationVersion: "1.0",
        policyHash: pHash,
        confirmationState: "CONFIRMED",
      }).returning();
      if (!pv) throw new Error("Failed to insert policy version");

      const [tr] = await db.insert(testRuns).values({
        id: randomUUID(),
        ownerId: defaultOwner,
        policyVersionId: pv.id,
        domainId: "ecommerce_cart",
        domainVersion: "1.0.0",
        domainDefinition: {},
        runnerVersion: "1.0.0",
        status: "COMPLETED",
        candidateLimit: 20,
        resultSummary: { passed: true },
      }).returning();
      if (!tr) throw new Error("Failed to insert test run");
      createdRunIds.push(tr.id);

      // POST /api/approvals with valid payload
      const res = await server.inject({
        method: "POST",
        url: "/api/approvals",
        payload: {
          policyVersionId: pv.id,
          policyHash: pHash,
          qualifyingTestRunId: tr.id,
          spendLimitMinor: 50000,
          currency: "USD",
          expiresInHours: 48,
        },
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.approval).toBeDefined();
      expect(body.approval.id).toBeDefined();
      expect(body.approval.status).toBe("ACTIVE");
      expect(body.approval.spendLimitMinor).toBe(50000);
      expect(body.approval.currency).toBe("USD");
      expect(body.approval.qualifyingTestRunId).toBe(tr.id);
      expect(body.approval.policyVersionId).toBe(pv.id);
      expect(body.approval.policyHash).toBe(pHash);
      createdApprovalIds.push(body.approval.id);

      // Directly verify row in PostgreSQL approvals table
      const [persistedApproval] = await db
        .select()
        .from(approvals)
        .where(eq(approvals.id, body.approval.id));
      expect(persistedApproval).toBeDefined();
      if (!persistedApproval) throw new Error("Approval not persisted in DB");
      expect(persistedApproval.qualifyingTestRunId).toBe(tr.id);
      expect(persistedApproval.policyVersionId).toBe(pv.id);
      expect(Number(persistedApproval.spendLimitMinor)).toBe(50000);
      expect(persistedApproval.currency).toBe("USD");
      expect(persistedApproval.revokedAt).toBeNull();

      // Verify list endpoint includes this approval
      const listRes = await server.inject({
        method: "GET",
        url: `/api/approvals?policyVersionId=${pv.id}`,
      });
      expect(listRes.statusCode).toBe(200);
      const listBody = listRes.json();
      expect(listBody.approvals.some((a: any) => a.id === body.approval.id)).toBe(true);
    });

    it("Step 14 [REAL-PG]: rejects non-qualifying runs (missing, incomplete, version mismatch, hash mismatch)", async (ctx) => {
      if (!isDbLive) {
        ctx.skip();
        return;
      }

      const defaultOwner = await ensureDefaultUser(db);
      const testPolicyId = randomUUID();
      createdPolicyIds.push(testPolicyId);

      await db.insert(policies).values({
        id: testPolicyId,
        ownerId: defaultOwner,
        name: `Test Reject NonQualifying Policy ${Date.now()}`,
        sourceMandate: "Test mandate",
      });

      const pHash = computePolicyHash(validPolicy);
      const [pv1] = await db.insert(policyVersions).values({
        id: randomUUID(),
        policyId: testPolicyId,
        ownerId: defaultOwner,
        versionNumber: 1,
        sourceMandateSnapshot: "Test mandate",
        intentSpec: validIntent,
        policyDocument: validPolicy,
        policySchemaVersion: "1.0",
        canonicalizationVersion: "1.0",
        policyHash: pHash,
        confirmationState: "CONFIRMED",
      }).returning();
      if (!pv1) throw new Error("Failed to insert policy version 1");

      const [pv2] = await db.insert(policyVersions).values({
        id: randomUUID(),
        policyId: testPolicyId,
        ownerId: defaultOwner,
        versionNumber: 2,
        sourceMandateSnapshot: "Test mandate v2",
        intentSpec: validIntent,
        policyDocument: validPolicy,
        policySchemaVersion: "1.0",
        canonicalizationVersion: "1.0",
        policyHash: pHash,
        confirmationState: "CONFIRMED",
      }).returning();
      if (!pv2) throw new Error("Failed to insert policy version 2");

      // 1. Missing test run
      const missingRunId = randomUUID();
      const missingRes = await server.inject({
        method: "POST",
        url: "/api/approvals",
        payload: {
          policyVersionId: pv1.id,
          policyHash: pHash,
          qualifyingTestRunId: missingRunId,
          spendLimitMinor: 50000,
          currency: "USD",
        },
      });
      expect(missingRes.statusCode).toBe(404);
      expect(missingRes.json().error.code).toBe("QUALIFYING_RUN_NOT_FOUND");

      // 2. Incomplete test run (status !== COMPLETED)
      const [incompleteRun] = await db.insert(testRuns).values({
        id: randomUUID(),
        ownerId: defaultOwner,
        policyVersionId: pv1.id,
        domainId: "ecommerce_cart",
        domainVersion: "1.0.0",
        domainDefinition: {},
        runnerVersion: "1.0.0",
        status: "INCOMPLETE",
        candidateLimit: 20,
        resultSummary: {},
      }).returning();
      if (!incompleteRun) throw new Error("Failed to insert incomplete run");
      createdRunIds.push(incompleteRun.id);

      const incompleteRes = await server.inject({
        method: "POST",
        url: "/api/approvals",
        payload: {
          policyVersionId: pv1.id,
          policyHash: pHash,
          qualifyingTestRunId: incompleteRun.id,
          spendLimitMinor: 50000,
          currency: "USD",
        },
      });
      expect(incompleteRes.statusCode).toBe(400);
      expect(incompleteRes.json().error.code).toBe("TEST_RUN_NOT_COMPLETED");

      // 3. Policy version mismatch (run belongs to pv1, request says pv2)
      const [completedRun] = await db.insert(testRuns).values({
        id: randomUUID(),
        ownerId: defaultOwner,
        policyVersionId: pv1.id,
        domainId: "ecommerce_cart",
        domainVersion: "1.0.0",
        domainDefinition: {},
        runnerVersion: "1.0.0",
        status: "COMPLETED",
        candidateLimit: 20,
        resultSummary: {},
      }).returning();
      if (!completedRun) throw new Error("Failed to insert completed run");
      createdRunIds.push(completedRun.id);

      const mismatchVerRes = await server.inject({
        method: "POST",
        url: "/api/approvals",
        payload: {
          policyVersionId: pv2.id,
          policyHash: pHash,
          qualifyingTestRunId: completedRun.id,
          spendLimitMinor: 50000,
          currency: "USD",
        },
      });
      expect(mismatchVerRes.statusCode).toBe(400);
      expect(mismatchVerRes.json().error.code).toBe("POLICY_VERSION_MISMATCH");

      // 4. Policy hash mismatch (forged hash)
      const fakeHash = "f".repeat(64);
      const mismatchHashRes = await server.inject({
        method: "POST",
        url: "/api/approvals",
        payload: {
          policyVersionId: pv1.id,
          policyHash: fakeHash,
          qualifyingTestRunId: completedRun.id,
          spendLimitMinor: 50000,
          currency: "USD",
        },
      });
      expect(mismatchHashRes.statusCode).toBe(400);
      expect(mismatchHashRes.json().error.code).toBe("POLICY_HASH_MISMATCH");

      // Confirm no approvals were created in DB for this run
      const checkApprovals = await db
        .select()
        .from(approvals)
        .where(eq(approvals.qualifyingTestRunId, completedRun.id));
      expect(checkApprovals.length).toBe(0);
    });

    it("Step 15 [REAL-PG]: enforces Decision D-014 finding rules against real PostgreSQL database", async (ctx) => {
      if (!isDbLive) {
        ctx.skip();
        return;
      }

      const defaultOwner = await ensureDefaultUser(db);
      const testPolicyId = randomUUID();
      createdPolicyIds.push(testPolicyId);

      await db.insert(policies).values({
        id: testPolicyId,
        ownerId: defaultOwner,
        name: `Test D-014 Findings Policy ${Date.now()}`,
        sourceMandate: "Test mandate",
      });

      const pHash = computePolicyHash(validPolicy);
      const [pv] = await db.insert(policyVersions).values({
        id: randomUUID(),
        policyId: testPolicyId,
        ownerId: defaultOwner,
        versionNumber: 1,
        sourceMandateSnapshot: "Test mandate",
        intentSpec: validIntent,
        policyDocument: validPolicy,
        policySchemaVersion: "1.0",
        canonicalizationVersion: "1.0",
        policyHash: pHash,
        confirmationState: "CONFIRMED",
      }).returning();
      if (!pv) throw new Error("Failed to insert policy version");

      // Subcase A: Unresolved CRITICAL finding blocks approval
      const [trCritical] = await db.insert(testRuns).values({
        id: randomUUID(),
        ownerId: defaultOwner,
        policyVersionId: pv.id,
        domainId: "ecommerce_cart",
        domainVersion: "1.0.0",
        domainDefinition: {},
        runnerVersion: "1.0.0",
        status: "COMPLETED",
        candidateLimit: 20,
        resultSummary: {},
      }).returning();
      if (!trCritical) throw new Error("Failed to insert test run");
      createdRunIds.push(trCritical.id);

      await db.insert(findings).values({
        id: randomUUID(),
        ownerId: defaultOwner,
        testRunId: trCritical.id,
        policyVersionId: pv.id,
        findingType: "POLICY_VIOLATION",
        severity: "CRITICAL",
        status: "OPEN",
        witness: { cart: {} },
        evidenceSnapshot: {},
        ruleTrace: {},
        reproduction: {},
      });

      const resCrit = await server.inject({
        method: "POST",
        url: "/api/approvals",
        payload: {
          policyVersionId: pv.id,
          policyHash: pHash,
          qualifyingTestRunId: trCritical.id,
          spendLimitMinor: 50000,
          currency: "USD",
        },
      });
      expect(resCrit.statusCode).toBe(400);
      expect(resCrit.json().error.code).toBe("UNRESOLVED_CRITICAL_HIGH_FINDINGS");

      // Subcase B: CRITICAL finding marked ACCEPTED_RISK is forbidden in MVP
      const [trCritRisk] = await db.insert(testRuns).values({
        id: randomUUID(),
        ownerId: defaultOwner,
        policyVersionId: pv.id,
        domainId: "ecommerce_cart",
        domainVersion: "1.0.0",
        domainDefinition: {},
        runnerVersion: "1.0.0",
        status: "COMPLETED",
        candidateLimit: 20,
        resultSummary: {},
      }).returning();
      if (!trCritRisk) throw new Error("Failed to insert test run");
      createdRunIds.push(trCritRisk.id);

      await db.insert(findings).values({
        id: randomUUID(),
        ownerId: defaultOwner,
        testRunId: trCritRisk.id,
        policyVersionId: pv.id,
        findingType: "POLICY_VIOLATION",
        severity: "CRITICAL",
        status: "ACCEPTED_RISK",
        resolutionNote: "VP signed off on risk",
        witness: {},
        evidenceSnapshot: {},
        ruleTrace: {},
        reproduction: {},
      });

      const resCritRisk = await server.inject({
        method: "POST",
        url: "/api/approvals",
        payload: {
          policyVersionId: pv.id,
          policyHash: pHash,
          qualifyingTestRunId: trCritRisk.id,
          spendLimitMinor: 50000,
          currency: "USD",
        },
      });
      expect(resCritRisk.statusCode).toBe(400);
      expect(resCritRisk.json().error.code).toBe("CRITICAL_HIGH_CANNOT_BE_ACCEPTED_RISK");

      // Subcase C: Unresolved HIGH finding blocks approval
      const [trHigh] = await db.insert(testRuns).values({
        id: randomUUID(),
        ownerId: defaultOwner,
        policyVersionId: pv.id,
        domainId: "ecommerce_cart",
        domainVersion: "1.0.0",
        domainDefinition: {},
        runnerVersion: "1.0.0",
        status: "COMPLETED",
        candidateLimit: 20,
        resultSummary: {},
      }).returning();
      if (!trHigh) throw new Error("Failed to insert test run");
      createdRunIds.push(trHigh.id);

      await db.insert(findings).values({
        id: randomUUID(),
        ownerId: defaultOwner,
        testRunId: trHigh.id,
        policyVersionId: pv.id,
        findingType: "POLICY_VIOLATION",
        severity: "HIGH",
        status: "OPEN",
        witness: {},
        evidenceSnapshot: {},
        ruleTrace: {},
        reproduction: {},
      });

      const resHigh = await server.inject({
        method: "POST",
        url: "/api/approvals",
        payload: {
          policyVersionId: pv.id,
          policyHash: pHash,
          qualifyingTestRunId: trHigh.id,
          spendLimitMinor: 50000,
          currency: "USD",
        },
      });
      expect(resHigh.statusCode).toBe(400);
      expect(resHigh.json().error.code).toBe("UNRESOLVED_CRITICAL_HIGH_FINDINGS");

      // Subcase D: Open MEDIUM finding blocks approval
      const [trMed] = await db.insert(testRuns).values({
        id: randomUUID(),
        ownerId: defaultOwner,
        policyVersionId: pv.id,
        domainId: "ecommerce_cart",
        domainVersion: "1.0.0",
        domainDefinition: {},
        runnerVersion: "1.0.0",
        status: "COMPLETED",
        candidateLimit: 20,
        resultSummary: {},
      }).returning();
      if (!trMed) throw new Error("Failed to insert test run");
      createdRunIds.push(trMed.id);

      const [medFinding] = await db.insert(findings).values({
        id: randomUUID(),
        ownerId: defaultOwner,
        testRunId: trMed.id,
        policyVersionId: pv.id,
        findingType: "POLICY_VIOLATION",
        severity: "MEDIUM",
        status: "OPEN",
        witness: {},
        evidenceSnapshot: {},
        ruleTrace: {},
        reproduction: {},
      }).returning();
      if (!medFinding) throw new Error("Failed to insert finding");

      const resMedOpen = await server.inject({
        method: "POST",
        url: "/api/approvals",
        payload: {
          policyVersionId: pv.id,
          policyHash: pHash,
          qualifyingTestRunId: trMed.id,
          spendLimitMinor: 50000,
          currency: "USD",
        },
      });
      expect(resMedOpen.statusCode).toBe(400);
      expect(resMedOpen.json().error.code).toBe("UNRESOLVED_FINDINGS");

      // Subcase E: MEDIUM finding marked ACCEPTED_RISK without rationale is rejected
      await db.update(findings)
        .set({ status: "ACCEPTED_RISK", resolutionNote: "   " })
        .where(eq(findings.id, medFinding.id));

      const resMedNoNote = await server.inject({
        method: "POST",
        url: "/api/approvals",
        payload: {
          policyVersionId: pv.id,
          policyHash: pHash,
          qualifyingTestRunId: trMed.id,
          spendLimitMinor: 50000,
          currency: "USD",
        },
      });
      expect(resMedNoNote.statusCode).toBe(400);
      expect(resMedNoNote.json().error.code).toBe("ACCEPTED_RISK_MISSING_RATIONALE");

      // Subcase F: MEDIUM finding with valid ACCEPTED_RISK rationale is accepted
      await db.update(findings)
        .set({
          status: "ACCEPTED_RISK",
          resolutionNote: "Accepted risk: Vendor catalog delayed by 2 days per IT-204",
        })
        .where(eq(findings.id, medFinding.id));

      const resMedWithNote = await server.inject({
        method: "POST",
        url: "/api/approvals",
        payload: {
          policyVersionId: pv.id,
          policyHash: pHash,
          qualifyingTestRunId: trMed.id,
          spendLimitMinor: 50000,
          currency: "USD",
        },
      });
      expect(resMedWithNote.statusCode).toBe(201);
      const appWithNote = resMedWithNote.json().approval;
      expect(appWithNote.id).toBeDefined();
      createdApprovalIds.push(appWithNote.id);
    }, 15000);

    it("Step 16 [REAL-PG]: verifies transaction rollback leaves zero partial approval records on qualification failure", async (ctx) => {
      if (!isDbLive) {
        ctx.skip();
        return;
      }

      const defaultOwner = await ensureDefaultUser(db);
      const testPolicyId = randomUUID();
      createdPolicyIds.push(testPolicyId);

      await db.insert(policies).values({
        id: testPolicyId,
        ownerId: defaultOwner,
        name: `Test Rollback Qualification Policy ${Date.now()}`,
        sourceMandate: "Test mandate",
      });

      const pHash = computePolicyHash(validPolicy);
      const [pv] = await db.insert(policyVersions).values({
        id: randomUUID(),
        policyId: testPolicyId,
        ownerId: defaultOwner,
        versionNumber: 1,
        sourceMandateSnapshot: "Test mandate",
        intentSpec: validIntent,
        policyDocument: validPolicy,
        policySchemaVersion: "1.0",
        canonicalizationVersion: "1.0",
        policyHash: pHash,
        confirmationState: "CONFIRMED",
      }).returning();
      if (!pv) throw new Error("Failed to insert policy version");

      const [tr] = await db.insert(testRuns).values({
        id: randomUUID(),
        ownerId: defaultOwner,
        policyVersionId: pv.id,
        domainId: "ecommerce_cart",
        domainVersion: "1.0.0",
        domainDefinition: {},
        runnerVersion: "1.0.0",
        status: "COMPLETED",
        candidateLimit: 20,
        resultSummary: {},
      }).returning();
      if (!tr) throw new Error("Failed to insert test run");
      createdRunIds.push(tr.id);

      // Add blocking CRITICAL finding
      await db.insert(findings).values({
        id: randomUUID(),
        ownerId: defaultOwner,
        testRunId: tr.id,
        policyVersionId: pv.id,
        findingType: "POLICY_VIOLATION",
        severity: "CRITICAL",
        status: "OPEN",
        witness: {},
        evidenceSnapshot: {},
        ruleTrace: {},
        reproduction: {},
      });

      // Verify 0 approvals before attempt
      const beforeApprovals = await db
        .select()
        .from(approvals)
        .where(eq(approvals.qualifyingTestRunId, tr.id));
      expect(beforeApprovals.length).toBe(0);

      // Attempt to create approval -> must be rejected
      const res = await server.inject({
        method: "POST",
        url: "/api/approvals",
        payload: {
          policyVersionId: pv.id,
          policyHash: pHash,
          qualifyingTestRunId: tr.id,
          spendLimitMinor: 50000,
          currency: "USD",
        },
      });
      expect(res.statusCode).toBe(400);

      // Verify zero partial or dangling approval records exist in PostgreSQL
      const afterApprovals = await db
        .select()
        .from(approvals)
        .where(eq(approvals.qualifyingTestRunId, tr.id));
      expect(afterApprovals.length).toBe(0);
    });

    it("Step 17 [REAL-PG]: concurrent approval requests against the same qualifying run resolve safely without corrupting state", async (ctx) => {
      if (!isDbLive) {
        ctx.skip();
        return;
      }

      const defaultOwner = await ensureDefaultUser(db);
      const testPolicyId = randomUUID();
      createdPolicyIds.push(testPolicyId);

      await db.insert(policies).values({
        id: testPolicyId,
        ownerId: defaultOwner,
        name: `Test Concurrent Approvals Policy ${Date.now()}`,
        sourceMandate: "Test mandate",
      });

      const pHash = computePolicyHash(validPolicy);
      const [pv] = await db.insert(policyVersions).values({
        id: randomUUID(),
        policyId: testPolicyId,
        ownerId: defaultOwner,
        versionNumber: 1,
        sourceMandateSnapshot: "Test mandate",
        intentSpec: validIntent,
        policyDocument: validPolicy,
        policySchemaVersion: "1.0",
        canonicalizationVersion: "1.0",
        policyHash: pHash,
        confirmationState: "CONFIRMED",
      }).returning();
      if (!pv) throw new Error("Failed to insert policy version");

      const [tr] = await db.insert(testRuns).values({
        id: randomUUID(),
        ownerId: defaultOwner,
        policyVersionId: pv.id,
        domainId: "ecommerce_cart",
        domainVersion: "1.0.0",
        domainDefinition: {},
        runnerVersion: "1.0.0",
        status: "COMPLETED",
        candidateLimit: 20,
        resultSummary: { passed: true },
      }).returning();
      if (!tr) throw new Error("Failed to insert test run");
      createdRunIds.push(tr.id);

      // Issue 2 concurrent approval requests against the same run
      const payload = {
        policyVersionId: pv.id,
        policyHash: pHash,
        qualifyingTestRunId: tr.id,
        spendLimitMinor: 25000,
        currency: "USD",
        expiresInHours: 24,
      };

      const [res1, res2] = await Promise.all([
        server.inject({ method: "POST", url: "/api/approvals", payload }),
        server.inject({ method: "POST", url: "/api/approvals", payload }),
      ]);

      expect(res1.statusCode).toBe(201);
      expect(res2.statusCode).toBe(201);

      const app1 = res1.json().approval;
      const app2 = res2.json().approval;
      expect(app1.id).toBeDefined();
      expect(app2.id).toBeDefined();
      expect(app1.id).not.toBe(app2.id);

      createdApprovalIds.push(app1.id, app2.id);

      // Verify both are persisted independently in real PostgreSQL
      const persistedList = await db
        .select()
        .from(approvals)
        .where(eq(approvals.qualifyingTestRunId, tr.id));
      expect(persistedList.length).toBe(2);
      expect(persistedList.map((a: any) => a.id).sort()).toEqual([app1.id, app2.id].sort());
    });
  });
});
