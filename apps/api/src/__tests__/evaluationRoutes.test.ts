import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { FastifyInstance } from "fastify";
import { buildServer } from "../server.js";
import { EvaluationReportResponseSchema } from "@warrant/contracts";

describe("Evaluation Report API Routes (GET /api/evaluation/report)", () => {
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

  it("1. GET /api/evaluation/report returns 200 and matches EvaluationReportResponseSchema", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/evaluation/report",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);

    // Strict schema validation
    const parsed = EvaluationReportResponseSchema.safeParse(body);
    expect(parsed.success).toBe(true);

    // Verify header
    expect(res.headers["x-request-id"]).toBeDefined();

    // Verify metadata
    expect(body.report.meta.evaluatorVersion).toBe("1.0.0");
    expect(body.report.meta.fixturesVersion).toBe("2.0.0");
    expect(body.report.meta.environment).toBe("sandbox");
  });

  it("2. GET /api/v1/evaluation/report returns identical schema-valid report", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/v1/evaluation/report",
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.payload);
    expect(body.report).toBeDefined();
    expect(body.report.securityInvariants).toHaveLength(6);
  });

  it("3. Confirms all six security invariants are evaluated with honest labeling", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/evaluation/report",
    });

    const body = JSON.parse(res.payload);
    const invariants = body.report.securityInvariants;

    expect(invariants).toHaveLength(6);

    const ids = invariants.map((inv: any) => inv.id);
    expect(ids).toEqual(["INV-1", "INV-2", "INV-3", "INV-4", "INV-5", "INV-6"]);

    // Verify INV-1: Centralized Gate Authority
    const inv1 = invariants.find((i: any) => i.id === "INV-1");
    expect(inv1.name).toContain("Centralized Gate Authority");
    expect(["VERIFIED", "FIXTURE_VERIFIED"]).toContain(inv1.status);
    expect(inv1.evidenceDetails).toBeDefined();

    // Verify INV-2: Policy Version & Hash Binding
    const inv2 = invariants.find((i: any) => i.id === "INV-2");
    expect(inv2.name).toContain("Policy Version & Hash Binding");
    expect(["VERIFIED", "FIXTURE_VERIFIED"]).toContain(inv2.status);

    // Verify INV-3: Nonce Anti-Replay
    const inv3 = invariants.find((i: any) => i.id === "INV-3");
    expect(inv3.name).toContain("Nonce Anti-Replay Defense");
    expect(["VERIFIED", "FIXTURE_VERIFIED"]).toContain(inv3.status);

    // Verify INV-4: Atomic Spend Reservation & Concurrency
    const inv4 = invariants.find((i: any) => i.id === "INV-4");
    expect(inv4.name).toContain("Atomic Lifetime Spend Reservation");
    expect(["VERIFIED", "FIXTURE_VERIFIED"]).toContain(inv4.status);

    // Verify INV-5: Evidence Freshness
    const inv5 = invariants.find((i: any) => i.id === "INV-5");
    expect(inv5.name).toContain("Evidence Freshness");
    expect(["VERIFIED", "FIXTURE_VERIFIED"]).toContain(inv5.status);

    // Verify INV-6: Payment Reconciliation & Honest UNTESTED Remote Capture disclosure
    const inv6 = invariants.find((i: any) => i.id === "INV-6");
    expect(inv6.name).toContain("Payment Reconciliation");
    expect(inv6.status).toBe("FIXTURE_VERIFIED");
    expect(inv6.limitations).toContain("UNTESTED");
  });

  it("4. Confirms bounded search summary exposes explicit limits and zero universal claims", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/evaluation/report",
    });

    const body = JSON.parse(res.payload);
    const searchSummary = body.report.boundedSearchSummary;

    expect(searchSummary.declaredCandidateCount).toBeGreaterThan(0);
    expect(searchSummary.exploredCandidateCount).toBeGreaterThan(0);
    expect(searchSummary.searchLimitations).toContain("does not constitute proof of universal safety");
  });

  it("5. Confirms disclosures declare sandbox constraints and honest evaluation scope", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/evaluation/report",
    });

    const body = JSON.parse(res.payload);
    const disclosures = body.report.disclosures;

    expect(disclosures.some((d: string) => d.includes("PayPal Sandbox"))).toBe(true);
    expect(disclosures.some((d: string) => d.includes("finite candidate domains"))).toBe(true);
    expect(disclosures.some((d: string) => d.includes("UNTESTED"))).toBe(true);
  });
});
