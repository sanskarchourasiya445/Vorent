import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import sensible from "@fastify/sensible";
import { healthRoutes, type HealthRoutesOptions } from "./routes/health.js";
import { env } from "./config/env.js";
import { pool } from "./db/index.js";

export interface ServerOptions extends HealthRoutesOptions {
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

  // Register security & utility plugins
  await app.register(sensible);
  await app.register(cors, {
    origin: env.CORS_ALLOWED_ORIGINS.split(",").map((o) => o.trim()),
    credentials: true,
  });

  // Register routes
  await app.register(healthRoutes, { checkDb: options.checkDb });

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
