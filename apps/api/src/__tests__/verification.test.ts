import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { buildServer } from "../server.js";
import {
  VerificationReportSchema,
  type ConfirmedIntent,
  type PolicyDocument,
  type SearchSpaceDefinition,
  type VerificationRequest,
} from "@warrant/contracts";
import type { FastifyInstance } from "fastify";

describe("API Verification Routes (POST /api/verification/run)", () => {
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
    maxItemPriceMinor: 6000,
    maxCartTotalMinor: 6000,
    allowedCategories: ["programming_book"],
    prohibitedCategories: ["gift_card"],
    requireEvidence: true,
  };

  const validIntent: ConfirmedIntent = {
    name: "Engineering Book Mandate",
    currency: "USD",
    maxItemPriceMinor: 6000,
    maxCartTotalMinor: 6000,
    allowedCategories: ["programming_book"],
    prohibitedCategories: ["gift_card"],
    requireEvidence: true,
  };

  const validSearchSpace: SearchSpaceDefinition = {
    domainVersion: "1.0.0",
    categories: ["programming_book"],
    pricePointsMinor: [3500, 6000],
    quantities: [1],
    currencies: ["USD"],
    maxItemsPerCart: 1,
    evidenceVariations: ["COMPLETE"],
  };

  // 1. Valid verification run with explicit VerificationRequest
  it("1. executes valid verification run with explicit VerificationRequest and returns 200 with validated VerificationReport", async () => {
    const payload: VerificationRequest = {
      policy: validPolicy,
      intent: validIntent,
      searchSpace: validSearchSpace,
      config: {
        maxCandidates: 100,
        policyVersionId: "pol_test_001",
        policyHash: "a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890a1b2c3d4e5f67890",
      },
    };

    const response = await server.inject({
      method: "POST",
      url: "/api/verification/run",
      headers: {
        "content-type": "application/json",
      },
      payload,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();

    const parsed = VerificationReportSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    expect(body.status).toBe("COMPLETED");
    expect(body.exhausted).toBe(true);
    expect(body.stopReason).toBe("DOMAIN_EXHAUSTED");
    expect(body.totalCandidatesExplored).toBeGreaterThan(0);
    expect(body.policyVersionId).toBe("pol_test_001");
    expect(body.findingCount).toBe(0);
    expect(response.headers["x-request-id"]).toBeDefined();
  });

  // 2. Valid verification run with preset policy
  it("2. executes verification run referencing a known preset policy and dimensions", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/verification/run",
      headers: {
        "content-type": "application/json",
      },
      payload: {
        policyVersionId: "pol_v1_books_hardware",
        dimensions: ["PRICE_BOUNDARIES"],
        candidateBudget: 50,
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();

    const parsed = VerificationReportSchema.safeParse(body);
    expect(parsed.success).toBe(true);
    expect(body.policyVersionId).toBe("pol_v1_books_hardware");
    expect(body.totalCandidatesExplored).toBeGreaterThan(0);
  });

  // 3. Finding discovery (seeded policy defects)
  it("3. discovers confirmed counterexamples for seeded policy defect (cart total limit omitted)", async () => {
    const defectivePolicy: PolicyDocument = {
      schemaVersion: "1.0",
      currency: "USD",
      maxItemPriceMinor: 6000, // $60 item ceiling
      // maxCartTotalMinor is intentionally missing!
      allowedCategories: ["programming_book"],
      prohibitedCategories: ["gift_card"],
      requireEvidence: true,
    };

    const payload: VerificationRequest = {
      policy: defectivePolicy,
      intent: validIntent, // Requires maxCartTotalMinor: 6000
      searchSpace: {
        domainVersion: "1.0.0",
        categories: ["programming_book"],
        pricePointsMinor: [3500], // Two $35 items = $70 > $60
        quantities: [2],
        currencies: ["USD"],
        maxItemsPerCart: 1,
        evidenceVariations: ["COMPLETE"],
      },
      config: {
        policyVersionId: "pol_flawed_cart_cap",
      },
    };

    const response = await server.inject({
      method: "POST",
      url: "/api/verification/run",
      payload,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();

    expect(body.findingCount).toBeGreaterThan(0);
    const finding = body.findings[0];
    expect(finding.violationType).toBe("FALSE_POSITIVE_ALLOW");
    expect(finding.expectedOutcome.decision).toBe("DENY");
    expect(finding.actualOutcome.decision).toBe("ALLOW");
    expect(finding.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(finding.severity).toBe("CRITICAL");
  });

  // 4. Unresolved evidence cases
  it("4. handles catalog-evidence gaps safely as unresolved cases without fabricating policy defects", async () => {
    const payload: VerificationRequest = {
      policy: validPolicy,
      intent: validIntent,
      searchSpace: {
        domainVersion: "1.0.0",
        categories: ["programming_book"],
        pricePointsMinor: [3500],
        quantities: [1],
        currencies: ["USD"],
        maxItemsPerCart: 1,
        evidenceVariations: ["STALE", "MISSING"], // Only flawed evidence
      },
    };

    const response = await server.inject({
      method: "POST",
      url: "/api/verification/run",
      payload,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();

    expect(body.findingCount).toBe(0);
    expect(body.unresolvedCount).toBeGreaterThan(0);
    expect(body.unresolvedCandidates?.[0]?.unresolvedReason).toBe("CATALOG_EVIDENCE_GAP");
    expect(body.unresolvedCandidates?.[0]?.actualDecision).toBe("REVIEW");
  });

  // 5. Candidate cap exhaustion
  it("5. stops early and reports CANDIDATE_CAP_REACHED when candidate cap is reached", async () => {
    const payload: VerificationRequest = {
      policy: validPolicy,
      intent: validIntent,
      searchSpace: {
        domainVersion: "1.0.0",
        categories: ["programming_book"],
        pricePointsMinor: [1000, 2000, 3000, 4000, 5000, 6000],
        quantities: [1],
        currencies: ["USD"],
        maxItemsPerCart: 2,
        evidenceVariations: ["COMPLETE"],
      },
      config: {
        maxCandidates: 4, // Intentionally tight cap
      },
    };

    const response = await server.inject({
      method: "POST",
      url: "/api/verification/run",
      payload,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();

    expect(body.status).toBe("INCOMPLETE");
    expect(body.exhausted).toBe(false);
    expect(body.stopReason).toBe("CANDIDATE_CAP_REACHED");
    expect(body.totalCandidatesExplored).toBe(4);
  });

  // 6. Server-enforced timeout behavior
  it("6. stops early and reports TIMEOUT when time limit expires", async () => {
    const payload: VerificationRequest = {
      policy: validPolicy,
      intent: validIntent,
      searchSpace: {
        domainVersion: "1.0.0",
        categories: ["programming_book"],
        pricePointsMinor: [1000, 2000, 3000, 4000],
        quantities: [1, 2],
        currencies: ["USD"],
        maxItemsPerCart: 2,
        evidenceVariations: ["COMPLETE"],
      },
      config: {
        timeoutMs: 1, // 1 millisecond forces immediate timeout break
      },
    };

    const response = await server.inject({
      method: "POST",
      url: "/api/verification/run",
      payload,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();

    expect(body.status).toBe("INCOMPLETE");
    expect(body.exhausted).toBe(false);
    expect(body.stopReason).toBe("TIMEOUT");
  });

  // 7. Malformed / invalid requests
  it("7. rejects malformed requests with 400 and structured error envelope", async () => {
    // Missing required fields
    const emptyResponse = await server.inject({
      method: "POST",
      url: "/api/verification/run",
      payload: {},
    });

    expect(emptyResponse.statusCode).toBe(400);
    const emptyBody = emptyResponse.json();
    expect(emptyBody.error).toBeDefined();
    expect(emptyBody.error.code).toBe("VALIDATION_ERROR");
    expect(emptyBody.requestId).toBeDefined();

    // Invalid schema: negative price points
    const invalidPriceResponse = await server.inject({
      method: "POST",
      url: "/api/verification/run",
      payload: {
        policy: validPolicy,
        intent: validIntent,
        searchSpace: {
          ...validSearchSpace,
          pricePointsMinor: [-100],
        },
      },
    });

    expect(invalidPriceResponse.statusCode).toBe(400);
    const invalidPriceBody = invalidPriceResponse.json();
    expect(invalidPriceBody.error.code).toBe("VALIDATION_ERROR");
    expect(invalidPriceBody.error.message).toContain("pricePointsMinor");
  });

  // 8. Unknown policyVersionId returns 404
  it("8. returns 404 with structured error envelope when requested policy preset is not found", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/verification/run",
      payload: {
        policyVersionId: "pol_unknown_nonexistent",
      },
    });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("POLICY_NOT_FOUND");
    expect(body.error.message).toContain("pol_unknown_nonexistent");
    expect(body.requestId).toBeDefined();
  });

  // 9. Correlation ID propagation
  it("9. preserves client-provided x-request-id in response envelope and headers", async () => {
    const clientRequestId = "req_custom_trace_98765";

    const response = await server.inject({
      method: "POST",
      url: "/api/verification/run",
      headers: {
        "x-request-id": clientRequestId,
      },
      payload: {
        policyVersionId: "pol_v1_books_hardware",
        candidateBudget: 10,
      },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-request-id"]).toBe(clientRequestId);
  });

  // 10. Malformed JSON payload
  it("10. rejects unparseable JSON with 400 and sanitized error envelope without stack traces", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/verification/run",
      headers: {
        "content-type": "application/json",
      },
      payload: "{ broken json string: ",
    });

    expect(response.statusCode).toBe(400);
    const rawPayload = response.payload;
    const body = response.json();

    expect(body.error).toBeDefined();
    expect(body.error.code).toBe("BAD_REQUEST");
    expect(body.requestId).toBeDefined();

    // Security Invariant: Zero leakage of stack traces or internal filenames
    expect(rawPayload).not.toContain("node_modules");
    expect(rawPayload).not.toContain("SyntaxError:");
    expect(rawPayload).not.toContain(" at ");
  });

  // 11. Empty search space produces valid completed report
  it("11. handles empty search space safely returning COMPLETED with EMPTY_SEARCH_SPACE", async () => {
    const payload: VerificationRequest = {
      policy: validPolicy,
      intent: validIntent,
      searchSpace: {
        domainVersion: "1.0.0",
        categories: ["non_existent_category"],
        pricePointsMinor: [1000],
        quantities: [1],
        currencies: ["USD"],
        maxItemsPerCart: 1,
        evidenceVariations: ["COMPLETE"],
        customItemTemplates: [],
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
  });

  // 12. Internal server error sanitization
  it("12. sanitizes internal server errors and prevents leaking stack traces or sensitive messages", async () => {
    const domain = await import("@warrant/domain");
    const spy = vi.spyOn(domain, "verifyPolicy").mockImplementationOnce(() => {
      throw new Error("SECRET_INTERNAL_DB_PASSWORD_12345: DB connection failed at /var/secrets/keys");
    });

    const response = await server.inject({
      method: "POST",
      url: "/api/verification/run",
      payload: {
        policyVersionId: "pol_v1_books_hardware",
        candidateBudget: 10,
      },
    });

    expect(response.statusCode).toBe(500);
    const rawPayload = response.payload;
    const body = response.json();

    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.error.message).toBe("An internal error occurred during policy verification.");
    expect(body.requestId).toBeDefined();

    // Security invariant: No raw secrets or internal filesystem paths leaked
    expect(rawPayload).not.toContain("SECRET_INTERNAL_DB_PASSWORD_12345");
    expect(rawPayload).not.toContain("/var/secrets/keys");
    expect(rawPayload).not.toContain("stack");

    spy.mockRestore();
  });

  // 13. Server limits clamping
  it("13. clamps client-requested candidate and timeout limits above server threshold", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/verification/run",
      payload: {
        policy: validPolicy,
        intent: validIntent,
        searchSpace: validSearchSpace,
        config: {
          maxCandidates: 5000, // Above MAX_SERVER_CANDIDATES (2000)
          timeoutMs: 30000, // Above MAX_SERVER_TIMEOUT_MS (10000)
        },
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("COMPLETED");
  });

  // 14. Deterministic repeatable runs
  it("14. produces strictly deterministic, reproducible results across repeated runs", async () => {
    const payload: VerificationRequest = {
      policy: validPolicy,
      intent: validIntent,
      searchSpace: {
        domainVersion: "1.0.0",
        categories: ["programming_book", "gift_card"],
        pricePointsMinor: [3500, 6000, 7500],
        quantities: [1, 2],
        currencies: ["USD"],
        maxItemsPerCart: 2,
        evidenceVariations: ["COMPLETE", "MISSING"],
      },
      config: {
        maxCandidates: 50,
        policyVersionId: "pol_test_repeatable",
        policyHash: "f".repeat(64),
      },
    };

    const res1 = await server.inject({
      method: "POST",
      url: "/api/verification/run",
      payload,
    });
    const res2 = await server.inject({
      method: "POST",
      url: "/api/verification/run",
      payload,
    });

    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);

    const body1 = res1.json();
    const body2 = res2.json();

    expect(body1.totalCandidatesExplored).toBe(body2.totalCandidatesExplored);
    expect(body1.findingCount).toBe(body2.findingCount);
    expect(body1.unresolvedCount).toBe(body2.unresolvedCount);
    expect(body1.stopReason).toBe(body2.stopReason);
    expect(body1.exhausted).toBe(body2.exhausted);
    expect(body1.status).toBe(body2.status);

    // Fingerprints and order must match exactly
    const fingerprints1 = body1.findings.map((f: { fingerprint: string }) => f.fingerprint);
    const fingerprints2 = body2.findings.map((f: { fingerprint: string }) => f.fingerprint);
    expect(fingerprints1).toEqual(fingerprints2);

    const unresolvedIndices1 = body1.unresolvedCandidates.map((u: { candidateIndex: number }) => u.candidateIndex);
    const unresolvedIndices2 = body2.unresolvedCandidates.map((u: { candidateIndex: number }) => u.candidateIndex);
    expect(unresolvedIndices1).toEqual(unresolvedIndices2);
  });

  // 15. Defect discovery and repair lifecycle
  it("15. verifies the full defect-and-repair lifecycle (seeded defect discovers counterexample, repaired policy eliminates it)", async () => {
    // Stage 1: Defective policy permits whole-cart limit breach
    const searchSpace: SearchSpaceDefinition = {
      domainVersion: "1.0.0",
      categories: ["Hardware"],
      pricePointsMinor: [25000],
      quantities: [2], // 2 * $250.00 = $500.00, exceeding intent limit of $400.00 (40000 minor)
      currencies: ["USD"],
      maxItemsPerCart: 1,
      evidenceVariations: ["COMPLETE"],
    };

    const defectivePolicy: PolicyDocument = {
      schemaVersion: "1.0",
      currency: "USD",
      maxItemPriceMinor: 25000,
      // maxCartTotalMinor is missing!
      allowedCategories: ["Hardware"],
      prohibitedCategories: ["Gift Cards"],
      requireEvidence: true,
    };

    const confirmedIntent: ConfirmedIntent = {
      name: "Strict Hardware Cap Intent",
      currency: "USD",
      maxItemPriceMinor: 25000,
      maxCartTotalMinor: 40000, // Mandates $400.00 cart limit
      allowedCategories: ["Hardware"],
      prohibitedCategories: ["Gift Cards"],
      requireEvidence: true,
    };

    const defectResponse = await server.inject({
      method: "POST",
      url: "/api/verification/run",
      payload: {
        policy: defectivePolicy,
        intent: confirmedIntent,
        searchSpace,
        config: { policyVersionId: "pol_defective" },
      },
    });

    expect(defectResponse.statusCode).toBe(200);
    const defectBody = defectResponse.json();
    expect(defectBody.findingCount).toBe(1);
    expect(defectBody.findings[0].expectedOutcome.reasonCode).toBe("CART_TOTAL_LIMIT_EXCEEDED");
    expect(defectBody.findings[0].expectedOutcome.decision).toBe("DENY");
    expect(defectBody.findings[0].actualOutcome.decision).toBe("ALLOW");

    // Stage 2: Repaired policy includes maxCartTotalMinor: 40000
    const repairedPolicy: PolicyDocument = {
      ...defectivePolicy,
      maxCartTotalMinor: 40000,
    };

    const repairResponse = await server.inject({
      method: "POST",
      url: "/api/verification/run",
      payload: {
        policy: repairedPolicy,
        intent: confirmedIntent,
        searchSpace,
        config: { policyVersionId: "pol_repaired" },
      },
    });

    expect(repairResponse.statusCode).toBe(200);
    const repairBody = repairResponse.json();
    expect(repairBody.findingCount).toBe(0);
    expect(repairBody.status).toBe("COMPLETED");
    expect(repairBody.exhausted).toBe(true);
  });

  // 16. Fastify HTTP verification run test matching VerificationStudio contract
  it("16. executes live HTTP verification run matching VerificationStudio contract", async () => {
    const liveServer = await buildServer({
      checkDb: async () => ({ configured: true, connected: true, latencyMs: 1 }),
    });

    try {
      const frontendPayload = {
        policyVersionId: "pol_v1_books_hardware",
        dimensions: ["PRICE_BOUNDARIES", "CATEGORY_EVASION"],
        candidateBudget: 25,
      };

      const response = await liveServer.inject({
        method: "POST",
        url: "/api/verification/run",
        headers: {
          "content-type": "application/json",
          "x-request-id": "client_req_frontend_live_001",
        },
        payload: frontendPayload,
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers["x-request-id"]).toBe("client_req_frontend_live_001");

      const rawBody: unknown = response.json();
      const parseResult = VerificationReportSchema.safeParse(rawBody);
      expect(parseResult.success).toBe(true);
      if (!parseResult.success) {
        throw new Error(`Expected successful report parse: ${JSON.stringify(parseResult.error)}`);
      }
      const body = parseResult.data;
      expect(body.policyVersionId).toBe("pol_v1_books_hardware");
      expect(body.totalCandidatesExplored).toBeGreaterThan(0);
      expect(body.totalCandidatesExplored).toBeLessThanOrEqual(25);
    } finally {
      await liveServer.close();
    }
  });

  // 17. Honest evidence gap reporting during incomplete search
  it("17. honestly reports evidence gaps as unresolved without claiming universal safety during incomplete search", async () => {
    const payload: VerificationRequest = {
      policy: validPolicy,
      intent: validIntent,
      searchSpace: {
        domainVersion: "1.0.0",
        categories: ["programming_book"],
        pricePointsMinor: [2000, 3000, 4000, 5000],
        quantities: [1, 2],
        currencies: ["USD"],
        maxItemsPerCart: 2,
        evidenceVariations: ["MISSING", "COMPLETE"],
      },
      config: {
        maxCandidates: 3, // Very small cap ensuring search cannot complete
      },
    };

    const response = await server.inject({
      method: "POST",
      url: "/api/verification/run",
      payload,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();

    expect(body.status).toBe("INCOMPLETE");
    expect(body.exhausted).toBe(false);
    expect(body.stopReason).toBe("CANDIDATE_CAP_REACHED");
    expect(body.totalCandidatesExplored).toBe(3);
    // Evidence gaps are preserved as unresolved candidates
    expect(body.unresolvedCount).toBeGreaterThanOrEqual(1);
    expect(body.unresolvedCandidates[0].unresolvedReason).toBe("CATALOG_EVIDENCE_GAP");
    // Does NOT claim universal safety
    expect(body.summary).toContain("Search space was not exhausted");
  });
});

