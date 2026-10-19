import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { Writable } from "node:stream";
import { buildServer } from "../server.js";
import { HealthReadyResponseSchema } from "@warrant/contracts";
import type { FastifyInstance } from "fastify";

describe("API Health Routes", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    server = await buildServer();
  });

  afterAll(async () => {
    await server.close();
  });

  it("GET / returns operational status and links", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("operational");
    expect(body.health).toBe("/health/live");
  });

  it("GET /health/live returns 200 ok with valid liveness contract", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/health/live",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("ok");
    expect(body.service).toBe("warrant-api");
    expect(typeof body.uptime).toBe("number");
    expect(typeof body.timestamp).toBe("string");
  });

  it("GET /health/ready returns 200 and matches schema when database is connected", async () => {
    const readyServer = await buildServer({
      checkDb: async () => ({
        configured: true,
        connected: true,
        latencyMs: 5,
      }),
    });

    try {
      const response = await readyServer.inject({
        method: "GET",
        url: "/health/ready",
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.status).toBe("ready");
      expect(body.database.connected).toBe(true);
      expect(body.database.latencyMs).toBe(5);

      const parsed = HealthReadyResponseSchema.safeParse(body);
      expect(parsed.success).toBe(true);
      expect(body).not.toHaveProperty("environment");
      expect(body.database).not.toHaveProperty("message");
    } finally {
      await readyServer.close();
    }
  });

  it("GET /health/ready returns 503 and sanitized response when database is unavailable", async () => {
    const unreadyServer = await buildServer({
      checkDb: async () => ({
        configured: true,
        connected: false,
        failureCategory: "DB_UNAVAILABLE",
      }),
    });

    try {
      const response = await unreadyServer.inject({
        method: "GET",
        url: "/health/ready",
      });

      expect(response.statusCode).toBe(503);
      const rawPayload = response.payload;
      const body = response.json();

      // Invariant: Matches shared Zod schema
      expect(body.status).toBe("not_ready");
      expect(body.database.connected).toBe(false);
      const parsed = HealthReadyResponseSchema.safeParse(body);
      expect(parsed.success).toBe(true);

      // Security Invariant: Zero leakage of raw database errors, credentials, hosts, or environments
      expect(rawPayload).not.toContain("password");
      expect(rawPayload).not.toContain("postgres");
      expect(rawPayload).not.toContain("authentication failed");
      expect(rawPayload).not.toContain("localhost:5432");
      expect(rawPayload).not.toContain("warrant_dev");
      expect(rawPayload).not.toContain("environment");
      expect(rawPayload).not.toContain("internalError");
      expect(rawPayload).not.toContain("failureCategory");
      expect(rawPayload).not.toContain("message");

      // Verify object properties
      expect(body).not.toHaveProperty("environment");
      expect(body.database).not.toHaveProperty("message");
      expect(body.database).not.toHaveProperty("internalError");
      expect(body.database).not.toHaveProperty("failureCategory");
    } finally {
      await unreadyServer.close();
    }
  });

  it("captures server log output during DB failure and verifies failureCategory is logged without sensitive error text", async () => {
    const capturedLogs: string[] = [];
    const logStream = new Writable({
      write(chunk: Buffer | string, _encoding, callback) {
        capturedLogs.push(chunk.toString());
        callback();
      },
    });

    const sensitiveValues = {
      password: "super_secret_db_password_98765",
      host: "internal-db-node-77.vpc.local",
      user: "financial_admin_service_user",
    };

    const monitoredServer = await buildServer({
      logStream,
      checkDb: async () => ({
        configured: true,
        connected: false,
        failureCategory: "DB_UNAVAILABLE",
      }),
    });

    try {
      const response = await monitoredServer.inject({
        method: "GET",
        url: "/health/ready",
      });

      expect(response.statusCode).toBe(503);

      const allLogs = capturedLogs.join("\n");

      // 1. Verifies that the safe failure category is logged
      expect(allLogs).toContain('"failureCategory":"DB_UNAVAILABLE"');
      expect(allLogs).toContain("Database readiness probe failed: database is not reachable");

      // 2. Verifies that sensitive values do not appear in the server logs
      expect(allLogs).not.toContain(sensitiveValues.password);
      expect(allLogs).not.toContain(sensitiveValues.host);
      expect(allLogs).not.toContain(sensitiveValues.user);
      expect(allLogs).not.toContain("password authentication failed");
      expect(allLogs).not.toContain("stack");

      // 3. Verifies client HTTP payload also does not contain failureCategory or sensitive values
      expect(response.payload).not.toContain(sensitiveValues.password);
      expect(response.payload).not.toContain(sensitiveValues.host);
      expect(response.payload).not.toContain(sensitiveValues.user);
      expect(response.payload).not.toContain("failureCategory");
    } finally {
      await monitoredServer.close();
    }
  });
});
