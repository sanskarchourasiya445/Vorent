import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import { buildServer } from "../server.js";
import type { FastifyInstance } from "fastify";
import { createRateLimiter, resetRateLimits } from "../routes/routeUtils.js";

describe("Rate Limiting Architecture & Defense (Requirement R2)", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await buildServer({
      checkDb: async () => ({ configured: true, connected: true, latencyMs: 1 }),
    });
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    resetRateLimits();
  });

  describe("Unit: createRateLimiter Hook Factory", () => {
    it("permits requests within configured window and sets accurate rate limit headers", async () => {
      let customApp: FastifyInstance | null = null;
      try {
        const { default: Fastify } = await import("fastify");
        customApp = Fastify();
        const testLimiter = createRateLimiter({ max: 3, windowMs: 60000 });

        customApp.get("/test", { preHandler: [testLimiter] }, async () => ({ status: "ok" }));
        await customApp.ready();

        // Request 1: remaining = 2
        const res1 = await customApp.inject({ method: "GET", url: "/test" });
        expect(res1.statusCode).toBe(200);
        expect(res1.headers["x-ratelimit-limit"]).toBe("3");
        expect(res1.headers["x-ratelimit-remaining"]).toBe("2");
        expect(Number(res1.headers["x-ratelimit-reset"])).toBeGreaterThan(0);

        // Request 2: remaining = 1
        const res2 = await customApp.inject({ method: "GET", url: "/test" });
        expect(res2.statusCode).toBe(200);
        expect(res2.headers["x-ratelimit-remaining"]).toBe("1");

        // Request 3: remaining = 0
        const res3 = await customApp.inject({ method: "GET", url: "/test" });
        expect(res3.statusCode).toBe(200);
        expect(res3.headers["x-ratelimit-remaining"]).toBe("0");

        // Request 4: threshold exceeded -> HTTP 429
        const res4 = await customApp.inject({ method: "GET", url: "/test" });
        expect(res4.statusCode).toBe(429);
        expect(res4.headers["x-ratelimit-limit"]).toBe("3");
        expect(res4.headers["x-ratelimit-remaining"]).toBe("0");
        expect(Number(res4.headers["x-ratelimit-reset"])).toBeGreaterThan(0);
        expect(Number(res4.headers["retry-after"])).toBeGreaterThan(0);

        const body = res4.json();
        expect(body.error).toBeDefined();
        expect(body.error.code).toBe("RATE_LIMIT_EXCEEDED");
        expect(body.error.message).toBe("Too many requests. Please try again later.");
        expect(body.requestId).toBeDefined();
      } finally {
        if (customApp) await customApp.close();
      }
    });

    it("resets counters completely when resetRateLimits() is invoked", async () => {
      let customApp: FastifyInstance | null = null;
      try {
        const { default: Fastify } = await import("fastify");
        customApp = Fastify();
        const testLimiter = createRateLimiter({ max: 2, windowMs: 60000 });

        customApp.get("/reset-test", { preHandler: [testLimiter] }, async () => ({ status: "ok" }));
        await customApp.ready();

        await customApp.inject({ method: "GET", url: "/reset-test" });
        await customApp.inject({ method: "GET", url: "/reset-test" });

        // Third should fail
        const blocked = await customApp.inject({ method: "GET", url: "/reset-test" });
        expect(blocked.statusCode).toBe(429);

        // Reset rate limits
        resetRateLimits();

        // Immediately following reset, requests should succeed again
        const fresh = await customApp.inject({ method: "GET", url: "/reset-test" });
        expect(fresh.statusCode).toBe(200);
        expect(fresh.headers["x-ratelimit-remaining"]).toBe("1");
      } finally {
        if (customApp) await customApp.close();
      }
    });

    it("supports custom keyGenerator for tenant or user partitioning", async () => {
      let customApp: FastifyInstance | null = null;
      try {
        const { default: Fastify } = await import("fastify");
        customApp = Fastify();
        const partitionedLimiter = createRateLimiter({
          max: 2,
          windowMs: 60000,
          keyGenerator: (req) => (req.headers["x-tenant-id"] as string) || "anonymous",
        });

        customApp.get("/tenant-test", { preHandler: [partitionedLimiter] }, async () => ({ status: "ok" }));
        await customApp.ready();

        // Tenant A: 2 requests
        await customApp.inject({ method: "GET", url: "/tenant-test", headers: { "x-tenant-id": "tenant-A" } });
        await customApp.inject({ method: "GET", url: "/tenant-test", headers: { "x-tenant-id": "tenant-A" } });
        const tenantABlocked = await customApp.inject({
          method: "GET",
          url: "/tenant-test",
          headers: { "x-tenant-id": "tenant-A" },
        });
        expect(tenantABlocked.statusCode).toBe(429);

        // Tenant B: unaffected by Tenant A's consumption
        const tenantBAllowed = await customApp.inject({
          method: "GET",
          url: "/tenant-test",
          headers: { "x-tenant-id": "tenant-B" },
        });
        expect(tenantBAllowed.statusCode).toBe(200);
        expect(tenantBAllowed.headers["x-ratelimit-remaining"]).toBe("1");
      } finally {
        if (customApp) await customApp.close();
      }
    });
  });

  describe("Integration: Authentication Route Rate Limiting (/api/auth/*)", () => {
    it("enforces rate limit on POST /api/auth/register (10 requests max)", async () => {
      const clientIp = "192.168.10.50";

      // 10 requests allowed (using validation-failing payload to test rate limiter preHandler in milliseconds without slow scrypt CPU hashing)
      for (let i = 0; i < 10; i++) {
        const res = await server.inject({
          method: "POST",
          url: "/api/auth/register",
          headers: { "x-forwarded-for": clientIp },
          payload: {
            email: "invalid-email-format",
          },
        });
        expect(res.statusCode).toBe(400);
        expect(res.headers["x-ratelimit-limit"]).toBe("10");
        expect(res.headers["x-ratelimit-remaining"]).toBe(String(9 - i));
      }

      // 11th request: rejected with 429
      const blockedRes = await server.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { "x-forwarded-for": clientIp },
        payload: {
          email: "invalid-email-format",
        },
      });

      expect(blockedRes.statusCode).toBe(429);
      expect(blockedRes.headers["x-ratelimit-limit"]).toBe("10");
      expect(blockedRes.headers["x-ratelimit-remaining"]).toBe("0");
      expect(Number(blockedRes.headers["x-ratelimit-reset"])).toBeGreaterThan(0);

      const json = blockedRes.json();
      expect(json.error.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(json.error.message).toBe("Too many requests. Please try again later.");
      expect(json.requestId).toBeDefined();

      // Requests from a different IP are not blocked
      const differentIpRes = await server.inject({
        method: "POST",
        url: "/api/auth/register",
        headers: { "x-forwarded-for": "192.168.10.51" },
        payload: {
          email: "invalid-email-format",
        },
      });
      expect(differentIpRes.statusCode).toBe(400);
    }, 15000);

    it("enforces rate limit on POST /api/auth/login (10 requests max)", async () => {
      const clientIp = "192.168.10.60";

      // 10 login attempts allowed (testing rate limiter hook without triggering slow password hash verification)
      for (let i = 0; i < 10; i++) {
        const res = await server.inject({
          method: "POST",
          url: "/api/auth/login",
          headers: { "x-forwarded-for": clientIp },
          payload: {
            email: "invalid-email-format",
          },
        });
        expect(res.statusCode).toBe(400);
        expect(res.headers["x-ratelimit-limit"]).toBe("10");
        expect(res.headers["x-ratelimit-remaining"]).toBe(String(9 - i));
      }

      // 11th login attempt: rejected with 429
      const blockedRes = await server.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: { "x-forwarded-for": clientIp },
        payload: {
          email: "invalid-email-format",
        },
      });

      expect(blockedRes.statusCode).toBe(429);
      expect(blockedRes.headers["x-ratelimit-limit"]).toBe("10");
      expect(blockedRes.headers["x-ratelimit-remaining"]).toBe("0");
      expect(blockedRes.json().error.code).toBe("RATE_LIMIT_EXCEEDED");
    }, 15000);
  });

  describe("Integration: Verification Route Rate Limiting (/api/verification/*)", () => {
    it("enforces rate limit on POST /api/verification/run (30 requests max)", async () => {
      const clientIp = "192.168.20.10";

      const validVerificationPayload = {
        policy: {
          schemaVersion: "1.0",
          currency: "USD",
          maxItemPriceMinor: 5000,
          maxCartTotalMinor: 5000,
          allowedCategories: ["books"],
          requireEvidence: true,
        },
        intent: {
          name: "Book Policy",
          currency: "USD",
          maxItemPriceMinor: 5000,
          maxCartTotalMinor: 5000,
          allowedCategories: ["books"],
          requireEvidence: true,
        },
        searchSpace: {
          domainVersion: "1.0.0",
          categories: ["books"],
          pricePointsMinor: [3000, 5000],
          quantities: [1],
          currencies: ["USD"],
          maxItemsPerCart: 1,
          evidenceVariations: ["COMPLETE"],
        },
      };

      // 30 verification calls allowed
      for (let i = 0; i < 30; i++) {
        const res = await server.inject({
          method: "POST",
          url: "/api/verification/run",
          headers: { "x-forwarded-for": clientIp },
          payload: validVerificationPayload,
        });
        expect(res.statusCode).toBe(200);
        expect(res.headers["x-ratelimit-limit"]).toBe("30");
        expect(res.headers["x-ratelimit-remaining"]).toBe(String(29 - i));
      }

      // 31st verification call: rejected with 429
      const blockedRes = await server.inject({
        method: "POST",
        url: "/api/verification/run",
        headers: { "x-forwarded-for": clientIp },
        payload: validVerificationPayload,
      });

      expect(blockedRes.statusCode).toBe(429);
      expect(blockedRes.headers["x-ratelimit-limit"]).toBe("30");
      expect(blockedRes.headers["x-ratelimit-remaining"]).toBe("0");
      expect(blockedRes.json().error.code).toBe("RATE_LIMIT_EXCEEDED");
      expect(blockedRes.json().requestId).toBeDefined();

      // Calling resetRateLimits() restores access immediately
      resetRateLimits();

      const restoredRes = await server.inject({
        method: "POST",
        url: "/api/verification/run",
        headers: { "x-forwarded-for": clientIp },
        payload: validVerificationPayload,
      });
      expect(restoredRes.statusCode).toBe(200);
      expect(restoredRes.headers["x-ratelimit-remaining"]).toBe("29");
    });
  });

  describe("Reverse-Proxy Security & Anti-Spoofing Topology (Requirement R3)", () => {
    it("extracts true client IP and rejects client-prepended spoofed hops behind trusted reverse proxy", async () => {
      // In trusted proxy topology (Render/ALB -> Fastify), the reverse proxy appends the real client IP.
      // If a malicious client injects `X-Forwarded-For: 1.1.1.1` to spoof their identity,
      // the proxy delivers `X-Forwarded-For: 1.1.1.1, 203.0.113.195`.
      // Fastify must identify 203.0.113.195 as the real client IP and refuse to rate limit 1.1.1.1.
      const proxyServer = await buildServer({
        trustProxy: ["loopback", "linklocal", "uniquelocal"],
      });
      try {
        await proxyServer.ready();
        const clientRealIp = "203.0.113.195";
        const spoofedHops = "1.1.1.1, 2.2.2.2";

        for (let i = 0; i < 10; i++) {
          const res = await proxyServer.inject({
            method: "POST",
            url: "/api/auth/login",
            // Simulates upstream trusted proxy forwarding socket from loopback with multi-hop chain
            headers: { "x-forwarded-for": `${spoofedHops}, ${clientRealIp}` },
            payload: { email: "invalid-email" },
          });
          expect(res.statusCode).toBe(400);
          expect(res.headers["x-ratelimit-remaining"]).toBe(String(9 - i));
        }

        // 11th request with a different spoofed prefix but same real client IP MUST be blocked (429)
        const blocked = await proxyServer.inject({
          method: "POST",
          url: "/api/auth/login",
          headers: { "x-forwarded-for": `9.9.9.9, ${clientRealIp}` },
          payload: { email: "invalid-email" },
        });
        expect(blocked.statusCode).toBe(429);
        expect(blocked.json().error.code).toBe("RATE_LIMIT_EXCEEDED");
      } finally {
        await proxyServer.close();
      }
    });

    it("ignores X-Forwarded-For completely when an untrusted client connects directly to Fastify", async () => {
      // If an untrusted direct connection reaches Fastify (e.g. socket remoteAddress 198.51.100.44),
      // Fastify must ignore any X-Forwarded-For header and bind rate limits strictly to 198.51.100.44.
      const directServer = await buildServer({
        trustProxy: ["loopback", "linklocal", "uniquelocal"],
      });
      try {
        await directServer.ready();
        const untrustedSocketIp = "198.51.100.44";

        for (let i = 0; i < 10; i++) {
          const res = await directServer.inject({
            method: "POST",
            url: "/api/auth/login",
            remoteAddress: untrustedSocketIp,
            // Attacker attempts to evade rate limits by rotating spoofed X-Forwarded-For on each request
            headers: { "x-forwarded-for": `10.0.0.${i + 1}` },
            payload: { email: "invalid-email" },
          });
          expect(res.statusCode).toBe(400);
          expect(res.headers["x-ratelimit-remaining"]).toBe(String(9 - i));
        }

        // 11th attempt with yet another spoofed IP MUST be blocked because the actual socket IP is exhausted
        const blocked = await directServer.inject({
          method: "POST",
          url: "/api/auth/login",
          remoteAddress: untrustedSocketIp,
          headers: { "x-forwarded-for": "10.0.0.99" },
          payload: { email: "invalid-email" },
        });
        expect(blocked.statusCode).toBe(429);
        expect(blocked.json().error.code).toBe("RATE_LIMIT_EXCEEDED");
      } finally {
        await directServer.close();
      }
    });
  });
});
