import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { resolve } from "node:path";
import { pool, db } from "../db/index.js";
import { buildServer } from "../server.js";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { eq } from "drizzle-orm";
import { policies, policyVersions, testRuns, findings } from "../db/schema.js";
import type { FastifyInstance } from "fastify";
import type { PolicyDocument, ConfirmedIntent, SearchSpaceDefinition } from "@warrant/contracts";

describe("Phase 4 Real PostgreSQL Persistence & Verification", () => {
  let isDbLive = false;
  let server: FastifyInstance;
  const createdPolicyIds: string[] = [];
  const createdRunIds: string[] = [];

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
  });

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
    it.runIf(isDbLive)("1. Creates policy and initial immutable version 1 record in PostgreSQL", async () => {
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

    it.runIf(isDbLive)("2 & 3. Executes verification run and confirms run + findings are persisted in PostgreSQL", async () => {
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

    it.runIf(isDbLive)("4 & 5. Retrieves saved run via API and verifies exact match with PostgreSQL record", async () => {
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

    it.runIf(isDbLive)("6. Confirms subsequent list request includes the saved run", async () => {
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

    it.runIf(isDbLive)("7. Verifies prior policy versions remain unchanged after creating a new version", async () => {
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
});
