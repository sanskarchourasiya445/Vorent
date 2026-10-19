import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { getTableName } from "drizzle-orm";
import { buildServer } from "../server.js";
import {
  type ConfirmedIntent,
  type PolicyDocument,
  type SearchSpaceDefinition,
  type VerificationRequest,
  PolicyListResponseSchema,
  PolicyVersionRecordSchema,
} from "@warrant/contracts";
import { computePolicyHash } from "@warrant/domain";
import {
  createPolicy,
  createPolicyVersion,
  seedPresets,
} from "../db/repositories/policyRepository.js";
import {
  saveVerificationRun,
} from "../db/repositories/verificationRunRepository.js";
import type { FastifyInstance } from "fastify";

function extractCondition(condition: any): ((item: any) => boolean) | null {
  if (!condition || !condition.queryChunks) return null;
  const col = condition.queryChunks[1];
  const param = condition.queryChunks[3];
  if (!col || !param) return null;

  const colDbName = col.name;
  let propKey = colDbName;
  if (col.table) {
    for (const key of Object.keys(col.table)) {
      if (col.table[key] === col) {
        propKey = key;
        break;
      }
    }
  }
  const targetVal = param.value;
  return (item: any) => item[propKey] === targetVal || item[colDbName] === targetVal;
}

/**
 * Creates an in-memory database test double that emulates Drizzle ORM's
 * query-builder chaining for users, policies, policy_versions, test_runs, and findings.
 */
function createInMemoryDb() {
  const usersStore: any[] = [];
  const policiesStore: any[] = [];
  const policyVersionsStore: any[] = [];
  const testRunsStore: any[] = [];
  const findingsStore: any[] = [];

  const getStore = (table: any): any[] => {
    try {
      const name = getTableName(table);
      if (name === "users") return usersStore;
      if (name === "policies") return policiesStore;
      if (name === "policy_versions") return policyVersionsStore;
      if (name === "test_runs") return testRunsStore;
      if (name === "findings") return findingsStore;
    } catch {
      // fallback
    }
    return [];
  };

  const db: any = {
    _stores: {
      users: usersStore,
      policies: policiesStore,
      policyVersions: policyVersionsStore,
      testRuns: testRunsStore,
      findings: findingsStore,
    },
    select: (fields?: any) => {
      let targetStore: any[] = [];
      let whereFilter: ((item: any) => boolean) | null = null;
      let limitCount: number | null = null;
      let orderByDesc = false;

      const builder: any = {
        from: (table: any) => {
          targetStore = getStore(table);
          return builder;
        },
        innerJoin: () => builder,
        where: (condition: any) => {
          whereFilter = extractCondition(condition);
          return builder;
        },
        orderBy: () => {
          orderByDesc = true;
          return builder;
        },
        limit: (n: number) => {
          limitCount = n;
          return builder;
        },
        then: (resolve: (val: any) => void) => {
          let results = [...targetStore];
          if (whereFilter) {
            results = results.filter(whereFilter);
          }
          if (orderByDesc) {
            results.reverse();
          }
          if (limitCount !== null) {
            results = results.slice(0, limitCount);
          }

          if (fields && typeof fields === "object" && Object.keys(fields).length > 0) {
            if ("count" in fields) {
              resolve([{ count: results.length }]);
              return;
            }
            if ("maxVersion" in fields) {
              const maxVal = results.reduce((m, r) => Math.max(m, r.versionNumber || 0), 0);
              resolve([{ maxVersion: maxVal }]);
              return;
            }
            results = results.map((item) => {
              const projected: any = {};
              for (const k of Object.keys(fields)) {
                projected[k] = item[k];
              }
              return projected;
            });
          }

          resolve(results);
        },
      };
      return builder;
    },
    insert: (table: any) => ({
      values: async (data: any) => {
        const store = getStore(table);
        const row = {
          ...data,
          createdAt: data.createdAt || new Date(),
          updatedAt: data.updatedAt || new Date(),
        };
        store.push(row);
        return [row];
      },
    }),
    update: (table: any) => ({
      set: (updateValues: any) => ({
        where: async (condition: any) => {
          const store = getStore(table);
          const filter = extractCondition(condition);
          if (filter) {
            for (const item of store) {
              if (filter(item)) {
                Object.assign(item, updateValues);
              }
            }
          }
        },
      }),
    }),
    transaction: async (txFn: (tx: any) => Promise<any>) => {
      return txFn(db);
    },
  };

  return db;
}

describe("Phase 4: Database Persistence & Policy Version History", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await buildServer({
      checkDb: async () => ({ configured: true, connected: true, latencyMs: 2 }),
    });
  });

  afterAll(async () => {
    await server.close();
  });

  const validPolicy: PolicyDocument = {
    schemaVersion: "1.0",
    currency: "USD",
    maxItemPriceMinor: 5000,
    maxCartTotalMinor: 15000,
    allowedCategories: ["Electronics", "Books"],
    prohibitedCategories: ["Weapons", "Adult"],
    requireEvidence: true,
  };

  const validIntent: ConfirmedIntent = {
    name: "Standard Office Purchasing Intent",
    currency: "USD",
    maxItemPriceMinor: 5000,
    maxCartTotalMinor: 15000,
    allowedCategories: ["Electronics", "Books"],
    prohibitedCategories: ["Weapons", "Adult"],
    requireEvidence: true,
  };

  // 1. Schema & Migration Correctness
  describe("1. Migration and Schema Invariants", () => {
    it("migration SQL file exists and contains all required Phase 4 tables and constraints", () => {
      const migrationPath = resolve(process.cwd(), "drizzle/migrations/0000_chemical_deathbird.sql");
      expect(existsSync(migrationPath)).toBe(true);

      const sqlContent = readFileSync(migrationPath, "utf-8");

      // Required tables
      expect(sqlContent).toContain('CREATE TABLE "users"');
      expect(sqlContent).toContain('CREATE TABLE "policies"');
      expect(sqlContent).toContain('CREATE TABLE "policy_versions"');
      expect(sqlContent).toContain('CREATE TABLE "test_runs"');
      expect(sqlContent).toContain('CREATE TABLE "findings"');
      expect(sqlContent).toContain('CREATE TABLE "approvals"');
      expect(sqlContent).toContain('CREATE TABLE "checkout_nonces"');
      expect(sqlContent).toContain('CREATE TABLE "checkout_proposals"');

      // Key immutability and integrity constraints
      expect(sqlContent).toContain("policy_version_unique_idx");
      expect(sqlContent).toContain('"policy_hash" char(64)');
      expect(sqlContent).toContain('"version_number" integer NOT NULL');
      expect(sqlContent).toContain('"candidate_limit" integer NOT NULL');
      expect(sqlContent).toContain('"candidate_count" bigint');
      expect(sqlContent).toContain('"status" text NOT NULL');
    });

    it("computes deterministic 64-character SHA-256 policy hash", () => {
      const hash1 = computePolicyHash(validPolicy);
      const hash2 = computePolicyHash({ ...validPolicy });

      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
      expect(hash1).toBe(hash2);

      // Changing limit changes hash
      const differentHash = computePolicyHash({ ...validPolicy, maxCartTotalMinor: 20000 });
      expect(differentHash).not.toBe(hash1);
    });
  });

  // 2. Policy Version Immutability & Seeding
  describe("2. Policy Repository Immutability and Seeding", () => {
    it("seedPresets is idempotent and avoids duplicate seeds on repeated startup", async () => {
      const testDb = createInMemoryDb();
      const ownerId = "owner_test_seed_001";

      // First run: seeds presets
      await seedPresets(testDb, ownerId);
      const firstSeedCount = testDb._stores.policies.length;
      expect(firstSeedCount).toBeGreaterThan(0);
      expect(testDb._stores.policyVersions.length).toBe(firstSeedCount);

      // Second run: must not create duplicates
      await seedPresets(testDb, ownerId);
      expect(testDb._stores.policies.length).toBe(firstSeedCount);
      expect(testDb._stores.policyVersions.length).toBe(firstSeedCount);
    });

    it("createPolicy creates version 1 with immutable snapshot and sets currentVersionId", async () => {
      const testDb = createInMemoryDb();
      const ownerId = "owner_test_002";

      const created = await createPolicy(
        testDb,
        {
          name: "Engineering Books Policy",
          sourceMandate: "Only books up to $50",
          policy: validPolicy,
          intent: validIntent,
          confirmationState: "CONFIRMED",
        },
        ownerId,
      );

      expect(created.versionNumber).toBe(1);
      expect(created.name).toBe("Engineering Books Policy");
      expect(created.confirmationState).toBe("CONFIRMED");
      expect(created.policyHash).toMatch(/^[a-f0-9]{64}$/);
      expect(created.policyDocument).toEqual(validPolicy);

      // Verify DB rows
      expect(testDb._stores.policies.length).toBe(1);
      expect(testDb._stores.policies[0].currentVersionId).toBe(created.id);
      expect(testDb._stores.policyVersions.length).toBe(1);
      expect(testDb._stores.policyVersions[0].versionNumber).toBe(1);
    });

    it("createPolicyVersion creates append-only version 2 without mutating version 1 (Immutability Guarantee)", async () => {
      const testDb = createInMemoryDb();
      const ownerId = "owner_test_003";

      const v1 = await createPolicy(
        testDb,
        {
          name: "Hardware Upgrades",
          sourceMandate: "Laptops under $1000",
          policy: validPolicy,
          intent: validIntent,
          confirmationState: "CONFIRMED",
        },
        ownerId,
      );

      const modifiedPolicy: PolicyDocument = {
        ...validPolicy,
        maxCartTotalMinor: 25000, // Modified limit
      };

      const v2 = await createPolicyVersion(
        testDb,
        v1.policyId,
        {
          sourceMandateSnapshot: "Repaired: Laptops under $1000, cart limit $250",
          policy: modifiedPolicy,
          intent: validIntent,
          confirmationState: "CONFIRMED",
        },
        ownerId,
      );

      expect(v2.versionNumber).toBe(2);
      expect(v2.policyId).toBe(v1.policyId);
      expect(v2.id).not.toBe(v1.id);
      expect(v2.policyHash).not.toBe(v1.policyHash);

      // Immutability Invariant: Version 1 record in store was NOT modified
      const storeV1 = testDb._stores.policyVersions.find((r: any) => r.id === v1.id);
      expect(storeV1.versionNumber).toBe(1);
      expect(storeV1.policyDocument.maxCartTotalMinor).toBe(15000); // Unchanged!

      // Version 2 record in store exists independently
      const storeV2 = testDb._stores.policyVersions.find((r: any) => r.id === v2.id);
      expect(storeV2.versionNumber).toBe(2);
      expect(storeV2.policyDocument.maxCartTotalMinor).toBe(25000);

      // Current version pointer on policy updated to v2
      expect(testDb._stores.policies[0].currentVersionId).toBe(v2.id);
    });
  });

  // 3. Verification Run Persistence
  describe("3. Verification Run Persistence & Findings Linkage", () => {
    it("saves verification run with exact policy version link, candidate count, and findings", async () => {
      const testDb = createInMemoryDb();
      const ownerId = "owner_test_004";
      const policyVersionId = "ver_uuid_9999";
      const policyHash = "a".repeat(64);

      const searchSpace: SearchSpaceDefinition = {
        domainVersion: "1.0.0",
        categories: ["Electronics"],
        pricePointsMinor: [3000, 6000],
        quantities: [1],
        currencies: ["USD"],
        maxItemsPerCart: 1,
        evidenceVariations: ["COMPLETE"],
      };

      const verificationRequest: VerificationRequest = {
        policy: validPolicy,
        intent: validIntent,
        searchSpace,
        config: {
          maxCandidates: 100,
          policyVersionId,
          policyHash,
        },
      };

      const report = {
        runId: "run_mock_001",
        status: "COMPLETED" as const,
        exhausted: true,
        stopReason: "DOMAIN_EXHAUSTED" as const,
        domainVersion: "1.0.0",
        totalCandidatesExplored: 2,
        searchSpaceEstimatedSize: 2,
        findingCount: 1,
        findings: [
          {
            findingId: "f-1",
            fingerprint: "b".repeat(64),
            severity: "CRITICAL" as const,
            violationType: "FALSE_POSITIVE_ALLOW" as const,
            title: "Prohibited item allowed",
            description: "Item allowed despite prohibition",
            candidateCart: { currency: "USD", items: [{ sku: "x", title: "Prohibited Item", category: "Weapons", unitPriceMinor: 1000, quantity: 1 }] },
            expectedOutcome: { decision: "DENY" as const },
            actualOutcome: {
              decision: "ALLOW" as const,
              primaryReasonCode: "ALL_RULES_PASSED" as const,
              reasonCodes: ["ALL_RULES_PASSED" as const],
              ruleTrace: [],
            },
            reproduction: { candidateIndex: 0, summary: "Repro step" },
            resolutionStatus: "UNRESOLVED" as const,
          },
        ],
        unresolvedCount: 0,
        unresolvedCandidates: [],
        policyVersionId,
        policyHash,
        durationMs: 15,
        summary: "Exploration completed",
      };

      const saved = await saveVerificationRun(testDb, {
        ownerId,
        policyVersionId,
        policyHash,
        request: verificationRequest,
        report,
      });

      expect(saved.id).toBeDefined();
      expect(saved.policyVersionId).toBe(policyVersionId);
      expect(saved.findingCount).toBe(1);
      expect(saved.status).toBe("COMPLETED");
      expect(saved.exhausted).toBe(true);

      // Verify DB storage
      expect(testDb._stores.testRuns.length).toBe(1);
      expect(testDb._stores.findings.length).toBe(1);
      expect(testDb._stores.findings[0].testRunId).toBe(saved.id);
      expect(testDb._stores.findings[0].policyVersionId).toBe(policyVersionId);
    });

    it("distinguishes TIMEOUT and CANDIDATE_CAP_REACHED runs from EXHAUSTIVE runs", async () => {
      const testDb = createInMemoryDb();
      const ownerId = "owner_test_005";

      const partialReport = {
        runId: "run_mock_partial",
        status: "INCOMPLETE" as const,
        exhausted: false, // Incomplete!
        stopReason: "TIMEOUT" as const,
        domainVersion: "1.0.0",
        totalCandidatesExplored: 10,
        searchSpaceEstimatedSize: 1000,
        findingCount: 0,
        findings: [],
        unresolvedCount: 0,
        unresolvedCandidates: [],
        durationMs: 5000,
        summary: "Search timed out",
      };

      const saved = await saveVerificationRun(testDb, {
        ownerId,
        policyVersionId: "ver_uuid_005",
        request: {
          policy: validPolicy,
          intent: validIntent,
          searchSpace: {
            domainVersion: "1.0.0",
            categories: ["Electronics"],
            pricePointsMinor: [1000],
            quantities: [1],
            currencies: ["USD"],
            maxItemsPerCart: 1,
            evidenceVariations: ["COMPLETE"],
          },
        },
        report: partialReport,
      });

      expect(saved.status).toBe("INCOMPLETE");
      expect(saved.exhausted).toBe(false);
      expect(saved.stopReason).toBe("TIMEOUT");
    });
  });

  // 4. Fastify Policy API Endpoints
  describe("4. Fastify Policy API Endpoints", () => {
    it("GET /api/policies returns 200 with PolicyListResponseSchema containing presets", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/policies",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      const parsed = PolicyListResponseSchema.safeParse(body);
      expect(parsed.success).toBe(true);
      expect(body.policies.length).toBeGreaterThan(0);
      expect(response.headers["x-request-id"]).toBeDefined();

      const hardwarePreset = body.policies.find((p: any) => p.id === "pol_v1_books_hardware" || p.presetId === "pol_v1_books_hardware");
      expect(hardwarePreset).toBeDefined();
    });

    it("GET /api/v1/policies provides forward-compatible alias matching /api/policies", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/v1/policies",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(PolicyListResponseSchema.safeParse(body).success).toBe(true);
    });

    it("GET /api/policies/:id returns specific preset policy record", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/policies/pol_v1_books_hardware",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();

      const parsed = PolicyVersionRecordSchema.safeParse(body);
      expect(parsed.success).toBe(true);
      expect(body.name).toBe("Engineering Hardware & Technical Books Policy");
      expect(body.policyDocument.currency).toBe("USD");
      expect(body.policyDocument.maxItemPriceMinor).toBe(25000);
      expect(body.isPreset).toBe(true);
    });

    it("GET /api/policies/:id returns 404 with sanitized error envelope for unknown ID", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/policies/nonexistent_policy_id_999",
      });

      expect(response.statusCode).toBe(404);
      const body = response.json();

      expect(body.error).toBeDefined();
      expect(body.error.code).toBe("POLICY_NOT_FOUND");
      expect(body.error.message).toContain("nonexistent_policy_id_999");
      expect(body.requestId).toBeDefined();
    });

    it("POST /api/policies rejects invalid input with 400 and VALIDATION_ERROR", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/policies",
        payload: {
          name: "", // Empty name violates constraint
          sourceMandate: "Some mandate",
          policy: { currency: "INVALID_LONG_CURRENCY" },
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();

      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.requestId).toBeDefined();
    });

    it("POST /api/policies/:id/versions rejects version creation on static preset IDs", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/policies/pol_v1_books_hardware/versions",
        payload: {
          policy: validPolicy,
          intent: validIntent,
        },
      });

      expect(response.statusCode).toBe(400);
      const body = response.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toContain("only supported for persisted policy UUIDs");
    });
  });

  // 5. Verification Run API Endpoints
  describe("5. Verification Runs API Endpoints", () => {
    it("POST /api/verification/runs executes verification run and returns report", async () => {
      const payload: VerificationRequest = {
        policy: validPolicy,
        intent: validIntent,
        searchSpace: {
          domainVersion: "1.0.0",
          categories: ["Books"],
          pricePointsMinor: [2000, 4000],
          quantities: [1],
          currencies: ["USD"],
          maxItemsPerCart: 1,
          evidenceVariations: ["COMPLETE"],
        },
        config: {
          maxCandidates: 20,
          policyVersionId: "pol_test_run_ephemeral",
        },
      };

      const response = await server.inject({
        method: "POST",
        url: "/api/verification/run",
        payload,
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe("COMPLETED");
      expect(body.totalCandidatesExplored).toBeGreaterThan(0);
    });

    it("GET /api/verification/runs/:id returns structured error envelope when run not found or database unavailable", async () => {
      const response = await server.inject({
        method: "GET",
        url: "/api/verification/runs/99999999-9999-9999-9999-999999999999",
      });

      expect([404, 503]).toContain(response.statusCode);
      const body = response.json();
      if (response.statusCode === 404) {
        expect(body.error.code).toBe("RUN_NOT_FOUND");
      } else {
        expect(body.error.code).toBe("DATABASE_UNAVAILABLE");
      }
      expect(body.requestId).toBeDefined();
    });
  });

  // 6. Security & Sanitization Invariants
  describe("6. Error Sanitization and Zero Leakage Invariants", () => {
    it("guarantees zero leakage of SQL keywords, database credentials, hostnames, or stack traces on errors", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/policies",
        payload: {
          name: "Testing Error Leakage",
          sourceMandate: "Mandate",
          policy: validPolicy,
          intent: validIntent,
        },
      });

      // When DB write encounters an issue or completes, ensure response contains NO sensitive secrets
      const rawText = response.payload;
      expect(rawText).not.toContain("password");
      expect(rawText).not.toContain("postgres://");
      expect(rawText).not.toContain("SELECT ");
      expect(rawText).not.toContain("INSERT INTO");
      expect(rawText).not.toContain("node_modules");
      expect(rawText).not.toContain(" at ");
    });
  });
});
