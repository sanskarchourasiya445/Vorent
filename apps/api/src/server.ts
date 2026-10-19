import Fastify, { type FastifyInstance, type FastifyError } from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { randomUUID } from "node:crypto";
import { healthRoutes, type HealthRoutesOptions } from "./routes/health.js";
import { verificationRoutes } from "./routes/verification.js";
import { policyRoutes } from "./routes/policies.js";
import { approvalRoutes } from "./routes/approvals.js";
import { checkoutRoutes } from "./routes/checkout.js";
import { paymentOrderRoutes, type PaymentOrderRoutesOptions } from "./routes/paymentOrders.js";
import { webhookRoutes, type WebhookRoutesOptions } from "./routes/webhooks.js";
import { findingRoutes } from "./routes/findings.js";
import { env } from "./config/env.js";
import { pool } from "./db/index.js";

export interface ServerOptions extends HealthRoutesOptions, PaymentOrderRoutesOptions, WebhookRoutesOptions {
  logStream?: NodeJS.WritableStream;
}

export async function buildServer(options: ServerOptions = {}): Promise<FastifyInstance> {
  const loggerConfig = options.logStream
    ? { level: env.LOG_LEVEL, stream: options.logStream }
    : {
        level: env.LOG_LEVEL,
        serializers: {
          req(req: { method: string; url: string; hostname: string; ip: string }) {
            return {
              method: req.method,
              url: req.url,
              hostname: req.hostname,
              remoteAddress: req.ip,
            };
          },
        },
      };

  const app = Fastify({
    logger: loggerConfig,
  });

  // Standardized error handler: Sanitizes all unhandled framework & runtime errors into contract envelope
  app.setErrorHandler((error: FastifyError, request, reply) => {
    const requestId =
      (typeof request.headers["x-request-id"] === "string" && request.headers["x-request-id"].trim()) ||
      request.id ||
      `req_${randomUUID()}`;
    reply.header("x-request-id", requestId);

    const statusCode =
      typeof error?.statusCode === "number" && error.statusCode >= 400 && error.statusCode < 600
        ? error.statusCode
        : 500;

    let errorCode = "INTERNAL_ERROR";
    let message = "An internal server error occurred.";

    if (statusCode === 400) {
      errorCode = "BAD_REQUEST";
      message = error?.message || "Invalid request payload.";
    } else if (statusCode === 404) {
      errorCode = "NOT_FOUND";
      message = error?.message || "Resource not found.";
    } else if (statusCode === 405) {
      errorCode = "METHOD_NOT_ALLOWED";
      message = error?.message || "Method not allowed.";
    } else {
      request.log.error({ err: error, requestId }, "Unhandled server error");
    }

    return reply.status(statusCode).send({
      error: {
        code: errorCode,
        message,
      },
      requestId,
    });
  });

  // Register security & utility plugins
  await app.register(sensible);
  await app.register(cors, {
    origin: env.CORS_ALLOWED_ORIGINS.split(",").map((o) => o.trim()),
    credentials: true,
  });

  // Register routes
  await app.register(healthRoutes, { checkDb: options.checkDb });
  await app.register(verificationRoutes, { prefix: "/api/verification" });
  await app.register(verificationRoutes, { prefix: "/api/v1/verification" });
  await app.register(policyRoutes, { prefix: "/api/policies" });
  await app.register(policyRoutes, { prefix: "/api/v1/policies" });
  await app.register(approvalRoutes, { prefix: "/api/approvals" });
  await app.register(approvalRoutes, { prefix: "/api/v1/approvals" });
  await app.register(checkoutRoutes, { prefix: "/api/checkout" });
  await app.register(checkoutRoutes, { prefix: "/api/v1/checkout" });
  await app.register(findingRoutes, { prefix: "/api/findings" });
  await app.register(findingRoutes, { prefix: "/api/v1/findings" });
  await app.register(paymentOrderRoutes, { prefix: "/api/payment-orders", paypalService: options.paypalService });
  await app.register(paymentOrderRoutes, { prefix: "/api/v1/payment-orders", paypalService: options.paypalService });
  await app.register(webhookRoutes, { prefix: "/api/webhooks", paypalService: options.paypalService });
  await app.register(webhookRoutes, { prefix: "/api/v1/webhooks", paypalService: options.paypalService });


  // Root welcome route
  app.get("/", async () => {
    return {
      name: "Warrant API",
      status: "operational",
      version: "0.1.0",
      docs: "/docs",
      health: "/health/live",
    };
  });

  return app;
}

async function start() {
  const server = await buildServer();

  const shutdown = async (signal: string) => {
    server.log.info({ signal }, "Shutting down server...");
    try {
      await server.close();
      await pool.end();
      process.exit(0);
    } catch (err) {
      server.log.error({ err }, "Error during shutdown");
      process.exit(1);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));

  try {
    const address = await server.listen({
      port: env.PORT,
      host: env.HOST,
    });
    server.log.info(`Warrant API listening at ${address}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

// Start if run directly
if (process.argv[1] && (process.argv[1].endsWith("server.ts") || process.argv[1].endsWith("server.js"))) {
  void start();
}
