import { describe, it, expect } from "vitest";
import { ServerEnvSchema } from "../env.js";

describe("Environment Validation & Security Guardrails", () => {
  it("accepts valid sandbox configuration", () => {
    const validConfig = {
      NODE_ENV: "development",
      PORT: 3001,
      HOST: "0.0.0.0",
      APP_BASE_URL: "http://localhost:5173",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/warrant_dev",
      PAYPAL_ENV: "sandbox",
    };

    const parsed = ServerEnvSchema.safeParse(validConfig);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.PAYPAL_ENV).toBe("sandbox");
      expect(parsed.data.CHECKOUT_NONCE_TTL_SECONDS).toBe(300);
      expect(parsed.data.BUYER_APPROVAL_RESERVATION_TTL_SECONDS).toBe(900);
    }
  });

  it("strictly prohibits live PayPal environment in MVP", () => {
    const liveConfig = {
      NODE_ENV: "production",
      PORT: 3001,
      HOST: "0.0.0.0",
      APP_BASE_URL: "https://warrant.example.com",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/warrant_prod",
      PAYPAL_ENV: "live", // Prohibited!
    };

    const parsed = ServerEnvSchema.safeParse(liveConfig);
    expect(parsed.success).toBe(false);
  });
});
