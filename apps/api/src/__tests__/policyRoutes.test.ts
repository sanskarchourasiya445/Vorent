import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { buildServer } from "../server.js";
import type { FastifyInstance } from "fastify";
import { CANONICAL_POLICY_PRESETS } from "@warrant/test-fixtures";

describe("Policy CRUD and Workflow Routes Integration (LEAN-005 & LEAN-007)", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await buildServer({});
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  describe("CRUD routes (policyRoutes)", () => {
    it("GET /api/policies returns list with request-id header", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/policies",
        headers: { "x-request-id": "req-policy-list-test" },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["x-request-id"]).toBe("req-policy-list-test");
      const body = res.json();
      expect(Array.isArray(body.policies)).toBe(true);
      expect(body.total).toBeGreaterThanOrEqual(3);
    });

    it("GET /api/policies/:id returns specific preset policy", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/policies/pol_v1_books_hardware",
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.id).toBeDefined();
      expect(body.policyHash).toBe(CANONICAL_POLICY_PRESETS.pol_v1_books_hardware!.hash);
    });

    it("GET /api/policies/:id returns 404 for unknown policy", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/policies/unknown-non-existent-id",
      });

      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.error.code).toBe("POLICY_NOT_FOUND");
    });

    it("GET /api/policies/:id/versions returns version history for preset", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/policies/pol_v1_books_hardware/versions",
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.policyId).toBe("pol_v1_books_hardware");
      expect(body.total).toBe(1);
    });
  });

  describe("Workflow routes (policyWorkflowRoutes)", () => {
    it("POST /api/policies/compile compiles natural language intent", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/policies/compile",
        headers: { "x-request-id": "req-compile-test" },
        payload: {
          mandateText: "Developer ergonomics up to $250 each. No gaming. Whole cart limit $600.",
          currency: "USD",
        },
      });

      expect(res.statusCode).toBe(200);
      expect(res.headers["x-request-id"]).toBe("req-compile-test");
      const body = res.json();
      expect(body.validation.valid).toBe(true);
      expect(body.candidatePolicy.maxItemPriceMinor).toBe(25000);
    });

    it("POST /api/policies/draft-compile operates as compile alias", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/policies/draft-compile",
        payload: {
          mandateText: "Draft purchase mandate for test.",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.candidatePolicy).toBeDefined();
    });

    it("POST /api/policies/diff computes semantic difference between policies", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/policies/diff",
        payload: {
          sourcePolicy: CANONICAL_POLICY_PRESETS.pol_v1_books_hardware!.policyDocument,
          targetPolicy: CANONICAL_POLICY_PRESETS.pol_v2_strict_peripherals!.policyDocument,
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.hasChanges).toBe(true);
      expect(Array.isArray(body.diffs)).toBe(true);
    });
  });

  describe("Validation & Error handling", () => {
    it("POST /api/policies/compile rejects invalid or empty payload with 400 VALIDATION_ERROR", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/policies/compile",
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toContain("mandateText");
      expect(body.requestId).toBeDefined();
    });

    it("POST /api/policies/diff rejects incomplete diff payload with 400 VALIDATION_ERROR", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/policies/diff",
        payload: {
          sourcePolicy: CANONICAL_POLICY_PRESETS.pol_v1_books_hardware!.policyDocument,
          // targetPolicy is missing!
        },
      });

      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(body.error.message).toContain("targetPolicy");
    });
  });

  describe("Operational v1 compatibility aliases (LEAN-005)", () => {
    it("GET /api/v1/policies is an operational alias for GET /api/policies", async () => {
      const res = await server.inject({
        method: "GET",
        url: "/api/v1/policies",
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.total).toBeGreaterThanOrEqual(3);
    });

    it("POST /api/v1/policies/compile is an operational alias for POST /api/policies/compile", async () => {
      const res = await server.inject({
        method: "POST",
        url: "/api/v1/policies/compile",
        payload: {
          mandateText: "Engineering laptops and monitors up to $300.",
        },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.candidatePolicy).toBeDefined();
    });
  });
});
