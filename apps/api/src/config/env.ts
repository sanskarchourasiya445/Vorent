import dotenv from "dotenv";
import path from "node:path";
import { ServerEnvSchema, type ServerEnv } from "@warrant/contracts";

// Load root .env or local .env
dotenv.config({ path: path.resolve(process.cwd(), "../../.env") });
dotenv.config();

function loadServerEnv(): ServerEnv {
  const result = ServerEnvSchema.safeParse({
    NODE_ENV: process.env.NODE_ENV ?? "development",
    PORT: process.env.PORT ?? 3001,
    HOST: process.env.HOST ?? "0.0.0.0",
    APP_BASE_URL: process.env.APP_BASE_URL ?? "http://localhost:5173",
    DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/warrant_dev",
    PAYPAL_ENV: process.env.PAYPAL_ENV ?? "sandbox",
    PAYPAL_CLIENT_ID: process.env.PAYPAL_CLIENT_ID,
    PAYPAL_CLIENT_SECRET: process.env.PAYPAL_CLIENT_SECRET,
    PAYPAL_WEBHOOK_ID: process.env.PAYPAL_WEBHOOK_ID,
    CHECKOUT_NONCE_TTL_SECONDS: process.env.CHECKOUT_NONCE_TTL_SECONDS ?? 300,
    BUYER_APPROVAL_RESERVATION_TTL_SECONDS: process.env.BUYER_APPROVAL_RESERVATION_TTL_SECONDS ?? 900,
    RECONCILIATION_ALERT_AFTER_SECONDS: process.env.RECONCILIATION_ALERT_AFTER_SECONDS ?? 900,
    SEARCH_MAX_CANDIDATES: process.env.SEARCH_MAX_CANDIDATES ?? 100,
    SEARCH_TIMEOUT_MS: process.env.SEARCH_TIMEOUT_MS ?? 10000,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM ?? "VORENT <notifications@warrant.studio>",
    LOG_LEVEL: process.env.LOG_LEVEL ?? "info",
    CORS_ALLOWED_ORIGINS: process.env.CORS_ALLOWED_ORIGINS ?? "http://localhost:5173",
  });

  if (!result.success) {
    const issues = result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join(", ");
    throw new Error(`Environment validation failed: ${issues}`);
  }

  return result.data;
}

export const env = loadServerEnv();
