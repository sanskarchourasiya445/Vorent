import { z } from "zod";

/**
 * Server Environment Variables Schema
 * Grounded in docs/ENVIRONMENT.md and hard security rules.
 */
export const ServerEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3001),
  HOST: z.string().default("0.0.0.0"),
  APP_BASE_URL: z.string().url().default("http://localhost:5173"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  
  // Hard security rule: PayPal environment MUST be sandbox in MVP.
  // Startup refuses any other value to prevent accidental live execution.
  PAYPAL_ENV: z.literal("sandbox", {
    errorMap: () => ({ message: "PAYPAL_ENV must be 'sandbox' for MVP. Live mode is prohibited." }),
  }).default("sandbox"),

  // Sandbox credentials (optional during initial Phase 0 foundation)
  PAYPAL_CLIENT_ID: z.string().optional(),
  PAYPAL_CLIENT_SECRET: z.string().optional(),
  PAYPAL_WEBHOOK_ID: z.string().optional(),

  // Nonce & Reservation timing defaults
  CHECKOUT_NONCE_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(300),
  BUYER_APPROVAL_RESERVATION_TTL_SECONDS: z.coerce.number().int().min(60).max(7200).default(900),
  RECONCILIATION_ALERT_AFTER_SECONDS: z.coerce.number().int().min(60).max(86400).default(900),

  // Search limits
  SEARCH_MAX_CANDIDATES: z.coerce.number().int().positive().default(100),
  SEARCH_TIMEOUT_MS: z.coerce.number().int().positive().default(10000),

  // Logging & CORS
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
  CORS_ALLOWED_ORIGINS: z.string().default("http://localhost:5173"),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

/**
 * Client (Vite) Environment Variables Schema
 * Only VITE_ prefixed variables can be exposed to browser bundle.
 */
export const ClientEnvSchema = z.object({
  VITE_API_BASE_URL: z.string().url().default("http://localhost:3001"),
});

export type ClientEnv = z.infer<typeof ClientEnvSchema>;
