import type { FastifyPluginAsync } from "fastify";
import {
  HealthLiveResponseSchema,
  HealthReadyResponseSchema,
  type HealthLiveResponse,
  type HealthReadyResponse,
} from "@warrant/contracts";
import { checkDatabaseConnection, type DbStatus } from "../db/index.js";

const startTime = Date.now();
const SERVICE_NAME = "warrant-api";
const SERVICE_VERSION = "0.1.0";

export interface HealthRoutesOptions {
  checkDb?: () => Promise<DbStatus>;
}

export const healthRoutes: FastifyPluginAsync<HealthRoutesOptions> = async (fastify, opts) => {
  const checkDb = opts.checkDb ?? checkDatabaseConnection;

  // GET /health/live - Liveness probe (does not call external services)
  fastify.get("/health/live", async (_request, reply) => {
    const payload: HealthLiveResponse = {
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - startTime) / 1000),
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
    };

    const parsed = HealthLiveResponseSchema.safeParse(payload);
    if (!parsed.success) {
      return reply.status(500).send({ error: "Health payload validation failed" });
    }

    return reply.status(200).send(parsed.data);
  });

  // GET /health/ready - Readiness probe (checks database connectivity)
  fastify.get("/health/ready", async (request, reply) => {
    const dbStatus = await checkDb();
    const isReady = dbStatus.connected;

    // Log safe failure category server-side only; never log raw errors, passwords, hosts, or connection strings
    if (!isReady) {
      request.log.warn(
        {
          failureCategory: dbStatus.failureCategory ?? "DB_UNAVAILABLE",
          configured: dbStatus.configured,
        },
        "Database readiness probe failed: database is not reachable",
      );
    }

    // Public sanitized payload (zero leakage of internal DB errors or environment)
    const payload: HealthReadyResponse = {
      status: isReady ? "ready" : "not_ready",
      timestamp: new Date().toISOString(),
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      database: {
        configured: dbStatus.configured,
        connected: dbStatus.connected,
        latencyMs: dbStatus.latencyMs,
      },
    };

    const parsed = HealthReadyResponseSchema.safeParse(payload);
    if (!parsed.success) {
      return reply.status(500).send({ error: "Ready payload validation failed" });
    }

    const statusCode = isReady ? 200 : 503;
    return reply.status(statusCode).send(parsed.data);
  });
};
