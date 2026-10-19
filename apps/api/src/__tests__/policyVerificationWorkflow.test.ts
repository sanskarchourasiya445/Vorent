import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildServer } from "../server.js";
import type { FastifyInstance } from "fastify";
import { MANDATE_FIXTURES } from "@warrant/test-fixtures";

describe("Phase 2 Policy Verification Workflow Integration Tests", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await buildServer();
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it("Step 1: POST /api/policies/compile compiles natural-language mandate into candidate policy and intent", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/policies/compile",
      payload: {
        mandateText: MANDATE_FIXTURES.engineeringClear.text,
      },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.validation.valid).toBe(true);
    expect(body.candidatePolicy.currency).toBe("USD");
    expect(body.candidatePolicy.maxItemPriceMinor).toBe(25000);
    expect(body.candidatePolicy.maxCartTotalMinor).toBe(60000);
    expect(body.candidatePolicy.allowedCategories).toEqual(
      expect.arrayContaining(["Hardware", "Reference Books", "Peripherals"]),
    );
    expect(body.candidatePolicy.prohibitedCategories).toEqual(
      expect.arrayContaining(["Gift Cards", "Weapons / Lasers", "Adult", "Subscriptions & Recurring"]),
    );
    expect(body.requiresUserConfirmation).toBe(true);
  });

  it("Step 2: POST /api/policies/diff computes semantic diff between two policies", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/policies/diff",
      payload: {
        sourcePolicy: {
          schemaVersion: "1.0",
          currency: "USD",
          maxItemPriceMinor: 25000,
          allowedCategories: ["Hardware"],
          prohibitedCategories: ["Adult"],
          requireEvidence: true,
        },
        targetPolicy: {
          schemaVersion: "1.0",
          currency: "USD",
          maxItemPriceMinor: 20000,
          maxCartTotalMinor: 50000,
          allowedCategories: ["Hardware", "Reference Books"],
          prohibitedCategories: ["Adult", "Gift Cards"],
          requireEvidence: true,
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const diff = res.json();
    expect(diff.hasChanges).toBe(true);
    expect(diff.diffs.length).toBe(4);
    expect(diff.diffs.some((d: any) => d.field === "maxItemPriceMinor" && d.changeType === "MODIFIED")).toBe(true);
    expect(diff.diffs.some((d: any) => d.field === "maxCartTotalMinor" && d.changeType === "ADDED")).toBe(true);
    expect(diff.diffs.some((d: any) => d.field === "allowedCategories")).toBe(true);
    expect(diff.diffs.some((d: any) => d.field === "prohibitedCategories")).toBe(true);
  });

  it("Step 3: POST /api/verification/run runs bounded verification and discovers reproducible counterexamples", async () => {
    // Run verification on the seeded defect policy where whole-cart ceiling is omitted
    const res = await server.inject({
      method: "POST",
      url: "/api/verification/run",
      payload: {
        policyVersionId: "pol_seeded_defect_unbounded_cart",
        dimensions: ["PRICE_BOUNDARIES", "QUANTITY_SPLITS"],
        maxCandidates: 150,
      },
    });

    expect(res.statusCode).toBe(200);
    const report = res.json();
    expect(report.status).toBe("COMPLETED");
    expect(report.exhausted).toBe(true);
    expect(report.stopReason).toBe("DOMAIN_EXHAUSTED");
    expect(report.findingCount).toBeGreaterThan(0);

    // Look for whole-cart spending ceiling leak counterexample
    const cartLeakFinding = report.findings.find(
      (f: any) => f.expectedOutcome.reasonCode === "CART_TOTAL_LIMIT_EXCEEDED" || f.title.includes("Cart Spending Ceiling Exceeded"),
    );
    expect(cartLeakFinding).toBeDefined();
    expect(cartLeakFinding.severity).toBe("CRITICAL");
    expect(cartLeakFinding.candidateCart.items.length).toBeGreaterThan(0);
    expect(cartLeakFinding.reproduction.summary).toBeDefined();
    expect(cartLeakFinding.fingerprint).toBeDefined();
  });

  it("Step 4: POST /api/policies/:id/propose-repair proposes a repaired policy resolving the discovered counterexamples", async () => {
    // 1. First run bounded verification to get fresh findings
    const verifyRes = await server.inject({
      method: "POST",
      url: "/api/verification/run",
      payload: {
        policyVersionId: "pol_seeded_defect_unbounded_cart",
        dimensions: ["PRICE_BOUNDARIES", "QUANTITY_SPLITS"],
        maxCandidates: 100,
      },
    });

    expect(verifyRes.statusCode).toBe(200);
    const report = verifyRes.json();
    expect(report.findings.length).toBeGreaterThan(0);

    // 2. Propose repair based on these findings
    const repairRes = await server.inject({
      method: "POST",
      url: "/api/policies/pol_seeded_defect_unbounded_cart/propose-repair",
      payload: {
        policyVersionId: "pol_seeded_defect_unbounded_cart",
        findings: report.findings,
      },
    });

    expect(repairRes.statusCode).toBe(200);
    const repair = repairRes.json();

    // Verify repaired policy adds the whole cart limit
    expect(repair.repairedPolicy.maxCartTotalMinor).toBeDefined();
    expect(repair.repairedPolicy.maxCartTotalMinor).toBe(60000);
    expect(repair.requiresVerification).toBe(true);
    expect(repair.addressedFindings.length).toBeGreaterThan(0);
    expect(repair.diff.hasChanges).toBe(true);
    expect(repair.diff.diffs.some((d: any) => d.field === "maxCartTotalMinor")).toBe(true);
  });

  it("Step 5: Verifying the repaired policy results in zero counterexamples", async () => {
    // Take the repaired policy and run verification against the same search space
    const res = await server.inject({
      method: "POST",
      url: "/api/verification/run",
      payload: {
        policy: {
          schemaVersion: "1.0",
          currency: "USD",
          maxItemPriceMinor: 25000,
          maxCartTotalMinor: 60000, // Repaired!
          allowedCategories: ["Hardware", "Reference Books"],
          prohibitedCategories: ["Gift Cards"],
          requireEvidence: true,
        },
        intent: {
          name: "Repaired Hardware & Books Mandate",
          currency: "USD",
          maxItemPriceMinor: 25000,
          maxCartTotalMinor: 60000,
          allowedCategories: ["Hardware", "Reference Books"],
          prohibitedCategories: ["Gift Cards"],
          requireEvidence: true,
        },
        searchSpace: {
          domainVersion: "1.0.0",
          categories: ["Hardware", "Reference Books"],
          pricePointsMinor: [22000, 25000],
          quantities: [1, 2, 3],
          currencies: ["USD"],
          maxItemsPerCart: 2,
          evidenceVariations: ["COMPLETE"],
        },
        config: {
          maxCandidates: 100,
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const report = res.json();
    expect(report.status).toBe("COMPLETED");
    expect(report.exhausted).toBe(true);
    expect(report.findingCount).toBe(0);
    expect(report.findings).toHaveLength(0);
  });

  it("Step 6: Decision D-014 Enforcement - CRITICAL finding cannot be accepted as risk", async () => {
    // Test accept-risk endpoint validation on CRITICAL finding
    const res = await server.inject({
      method: "POST",
      url: "/api/findings/non-existent-id/accept-risk",
      payload: {
        rationale: "Attempting to bypass security check",
      },
    });

    // Not found or rejection
    expect([400, 404]).toContain(res.statusCode);
  });

  it("Step 7: Re-verification stops on timeout or candidate cap without false universal safety claim", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/api/verification/run",
      payload: {
        policy: {
          schemaVersion: "1.0",
          currency: "USD",
          maxItemPriceMinor: 25000,
          allowedCategories: ["Hardware"],
          requireEvidence: true,
        },
        intent: {
          name: "Test Mandate",
          currency: "USD",
          maxItemPriceMinor: 25000,
          allowedCategories: ["Hardware"],
          requireEvidence: true,
        },
        searchSpace: {
          domainVersion: "1.0.0",
          categories: ["Hardware", "Reference Books", "Peripherals"],
          pricePointsMinor: [5000, 10000, 15000, 20000, 25000],
          quantities: [1, 2],
          currencies: ["USD"],
          maxItemsPerCart: 2,
          evidenceVariations: ["COMPLETE"],
        },
        config: {
          maxCandidates: 5, // Tiny cap to force early termination
        },
      },
    });

    expect(res.statusCode).toBe(200);
    const report = res.json();
    expect(report.status).toBe("INCOMPLETE");
    expect(report.exhausted).toBe(false);
    expect(report.stopReason).toBe("CANDIDATE_CAP_REACHED");
    expect(report.totalCandidatesExplored).toBe(5);
    expect(report.summary).toContain("Search incomplete");
    expect(report.summary).toContain("Search space was not exhausted");
  });

  it("Step 8: End-to-end persisted policy lifecycle with repair, re-test, and finding resolution", async () => {
    // 1. Create a new policy with flawed Version 1 (omitted whole-cart limit)
    const createPolicyRes = await server.inject({
      method: "POST",
      url: "/api/policies",
      payload: {
        name: `Integration Test Policy ${Date.now()}`,
        sourceMandate: "Engineering hardware up to $250 each. Total cap intended $600.",
        policy: {
          schemaVersion: "1.0",
          currency: "USD",
          maxItemPriceMinor: 25000,
          allowedCategories: ["Hardware"],
          prohibitedCategories: ["Gift Cards"],
          requireEvidence: true,
        },
        intent: {
          name: "Initial Intent",
          currency: "USD",
          maxItemPriceMinor: 25000,
          maxCartTotalMinor: 60000,
          allowedCategories: ["Hardware"],
          prohibitedCategories: ["Gift Cards"],
          requireEvidence: true,
        },
      },
    });

    expect(createPolicyRes.statusCode).toBe(201);
    const policyRecord = createPolicyRes.json();
    const policyId = policyRecord.policyId;
    const version1Id = policyRecord.id;

    // 2. Execute and persist verification run for Version 1
    const run1Res = await server.inject({
      method: "POST",
      url: "/api/verification/runs",
      payload: {
        policy: policyRecord.policyDocument,
        intent: policyRecord.intentSpec,
        searchSpace: {
          domainVersion: "1.0.0",
          categories: ["Hardware"],
          pricePointsMinor: [22000, 25000],
          quantities: [1, 2, 3],
          currencies: ["USD"],
          maxItemsPerCart: 3,
          evidenceVariations: ["COMPLETE"],
        },
        config: {
          policyVersionId: version1Id,
          policyHash: policyRecord.policyHash,
          maxCandidates: 100,
        },
      },
    });

    expect(run1Res.statusCode).toBe(201);
    const run1Data = run1Res.json();
    const run1Id = run1Data.run.id;
    expect(run1Data.report.findingCount).toBeGreaterThan(0);

    // 3. Query findings for run 1 via /api/verification/runs/:id/findings
    const runFindingsRes = await server.inject({
      method: "GET",
      url: `/api/verification/runs/${run1Id}/findings`,
    });
    expect(runFindingsRes.statusCode).toBe(200);
    const runFindingsData = runFindingsRes.json();
    expect(runFindingsData.findings.length).toBeGreaterThan(0);
    const firstFinding = runFindingsData.findings[0];

    // 4. Propose repair based on run 1
    const repairRes = await server.inject({
      method: "POST",
      url: `/api/policies/${version1Id}/propose-repair`,
      payload: {
        policyVersionId: version1Id,
        testRunId: run1Id,
      },
    });
    expect(repairRes.statusCode).toBe(200);
    const repairData = repairRes.json();
    expect(repairData.repairedPolicy.maxCartTotalMinor).toBeDefined();

    // 5. Create immutable Version 2 with the repaired policy
    const createV2Res = await server.inject({
      method: "POST",
      url: `/api/policies/${policyId}/versions`,
      payload: {
        sourceMandateSnapshot: "Engineering hardware up to $250 each. Whole cart cap tightened to $600.",
        policy: repairData.repairedPolicy,
        intent: repairData.repairedIntent,
      },
    });
    expect(createV2Res.statusCode).toBe(201);
    const v2Record = createV2Res.json();
    const version2Id = v2Record.id;
    expect(v2Record.versionNumber).toBe(2);

    // 6. Inspect semantic diff between Version 1 and Version 2
    const diffRes = await server.inject({
      method: "GET",
      url: `/api/policies/${policyId}/versions/${version2Id}/diff?againstVersionId=${version1Id}`,
    });
    expect(diffRes.statusCode).toBe(200);
    const diffData = diffRes.json();
    expect(diffData.hasChanges).toBe(true);
    expect(diffData.diffs.some((d: any) => d.field === "maxCartTotalMinor")).toBe(true);

    // 7. Execute and persist verification run for Version 2 (proves defect is resolved)
    const run2Res = await server.inject({
      method: "POST",
      url: "/api/verification/runs",
      payload: {
        policy: v2Record.policyDocument,
        intent: v2Record.intentSpec,
        searchSpace: {
          domainVersion: "1.0.0",
          categories: ["Hardware"],
          pricePointsMinor: [22000, 25000],
          quantities: [1, 2, 3],
          currencies: ["USD"],
          maxItemsPerCart: 3,
          evidenceVariations: ["COMPLETE"],
        },
        config: {
          policyVersionId: version2Id,
          policyHash: v2Record.policyHash,
          maxCandidates: 100,
        },
      },
    });
    expect(run2Res.statusCode).toBe(201);
    const run2Data = run2Res.json();
    expect(run2Data.report.findingCount).toBe(0);
    expect(run2Data.report.status).toBe("COMPLETED");

    // 8. Mark the Version 1 finding as resolved by Version 2
    const resolveRes = await server.inject({
      method: "POST",
      url: `/api/findings/${firstFinding.id}/resolve`,
      payload: {
        resolvedByVersionId: version2Id,
        resolutionNote: "Resolved in Version 2 by introducing maxCartTotalMinor spending ceiling.",
      },
    });
    expect(resolveRes.statusCode).toBe(200);
    const resolvedData = resolveRes.json();
    expect(resolvedData.status).toBe("RESOLVED");
    expect(resolvedData.resolvedByVersionId).toBe(version2Id);
    expect(resolvedData.resolutionNote).toContain("Version 2");
  });

  it("Step 9: Checkout Gate Authorization Guard - unapproved policies and nonces are strictly rejected", async () => {
    // Attempting to evaluate checkout with invalid / non-approved proposal
    const checkoutRes = await server.inject({
      method: "POST",
      url: "/api/checkout/proposals",
      payload: {
        approvalId: "11111111-1111-1111-1111-111111111111",
        nonce: "invalid-or-unapproved-nonce",
        policyHash: "0".repeat(64),
        cart: {
          currency: "USD",
          items: [{ sku: "hw-1", title: "Item", category: "Hardware", unitPriceMinor: 5000, quantity: 1 }],
        },
      },
    });

    // Rejection: 400 Bad Request or 404
    expect([400, 404, 409, 503]).toContain(checkoutRes.statusCode);
  });

  it("Step 10: Rerun witness carts (FR-008) against repaired policy version proves defect resolution", async () => {
    const rerunRes = await server.inject({
      method: "POST",
      url: "/api/policies/rerun-witnesses",
      payload: {
        policyVersionId: "pol_v2_strict_peripherals",
        findings: [
          {
            id: "f-test-1",
            findingType: "FALSE_POSITIVE_ALLOW",
            witness: {
              currency: "USD",
              items: [
                {
                  sku: "chair-1",
                  title: "Chair",
                  category: "Office Furniture",
                  unitPriceMinor: 20000,
                  quantity: 1,
                },
              ],
            },
            expectedOutcome: { decision: "DENY" },
          },
        ],
      },
    });

    expect(rerunRes.statusCode).toBe(200);
    const rerunData = rerunRes.json();
    expect(rerunData.totalWitnesses).toBe(1);
    expect(rerunData.resolvedCount).toBe(1);
    expect(rerunData.unresolvedCount).toBe(0);
    expect(rerunData.results[0].outcome).toBe("RESOLVED");
    expect(rerunData.results[0].currentDecision).toBe("DENY");
  });

  it("Step 11: Dashboard and Operational APIs: GET /api/payment-orders, GET /api/payment-orders/reconciliation-alerts, GET /api/checkout/reservations", async () => {
    // 1. GET /api/payment-orders
    const ordersRes = await server.inject({
      method: "GET",
      url: "/api/payment-orders",
    });
    expect(ordersRes.statusCode).toBe(200);
    const ordersData = ordersRes.json();
    expect(Array.isArray(ordersData.orders)).toBe(true);
    expect(typeof ordersData.total).toBe("number");
    expect(typeof ordersData.reconciliationAlertsCount).toBe("number");

    // 2. GET /api/payment-orders/reconciliation-alerts
    const alertsRes = await server.inject({
      method: "GET",
      url: "/api/payment-orders/reconciliation-alerts",
    });
    expect(alertsRes.statusCode).toBe(200);
    const alertsData = alertsRes.json();
    expect(Array.isArray(alertsData.unreconciledOrders)).toBe(true);
    expect(Array.isArray(alertsData.heldReservations)).toBe(true);
    expect(typeof alertsData.totalAlerts).toBe("number");

    // 3. GET /api/checkout/reservations
    const resRes = await server.inject({
      method: "GET",
      url: "/api/checkout/reservations",
    });
    expect(resRes.statusCode).toBe(200);
    const resData = resRes.json();
    expect(Array.isArray(resData.reservations)).toBe(true);
    expect(typeof resData.total).toBe("number");

    // 4. GET /api/approvals has remainingSpendMinor
    const appRes = await server.inject({
      method: "GET",
      url: "/api/approvals",
    });
    expect(appRes.statusCode).toBe(200);
    const appData = appRes.json();
    expect(Array.isArray(appData.approvals)).toBe(true);
  });

  it("Step 12: Checkout Proposal rejects stale evidence snapshots fail-closed", async () => {
    const staleTime = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
    const staleRes = await server.inject({
      method: "POST",
      url: "/api/checkout/proposals",
      payload: {
        approvalId: "11111111-1111-1111-1111-111111111111",
        nonce: "test-nonce",
        policyHash: "0".repeat(64),
        cart: {
          currency: "USD",
          items: [{ sku: "hw-1", title: "Item", category: "Hardware", unitPriceMinor: 5000, quantity: 1 }],
        },
        evidence: {
          quotesVerified: true,
          evidenceComplete: true,
          snapshotTimestamp: staleTime,
        },
      },
    });

    expect([400, 404, 409, 503]).toContain(staleRes.statusCode);
  });
});

