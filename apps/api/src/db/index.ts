import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "../config/env.js";

import * as schema from "./schema.js";

const { Pool } = pg;

function getEffectiveConnectionString(rawUrl?: string): string | undefined {
  if (!rawUrl) return undefined;
  if (rawUrl.includes("sslmode=require") && !rawUrl.includes("uselibpqcompat=true")) {
    return rawUrl + (rawUrl.includes("?") ? "&" : "?") + "uselibpqcompat=true";
  }
  return rawUrl;
}

export const pool = new Pool({
  connectionString: getEffectiveConnectionString(env.DATABASE_URL),
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000, // 10s timeout to absorb Neon serverless wake-up latency
});

// Guard against unhandled errors on idle clients in PgBouncer pooler mode
pool.on("error", (err) => {
  console.error("[PostgresPool:Error] Unexpected idle client error:", err.message);
});

export const db = drizzle(pool, { schema });
export type Database = typeof db;
export * from "./schema.js";

export interface DbStatus {
  configured: boolean;
  connected: boolean;
  latencyMs?: number;
  failureCategory?: "DB_UNAVAILABLE";
}

export async function checkDatabaseConnection(): Promise<DbStatus> {
  const start = Date.now();
  try {
    const client = await pool.connect();
    try {
      await client.query("SELECT 1");
      const latencyMs = Date.now() - start;
      return {
        configured: true,
        connected: true,
        latencyMs,
      };
    } finally {
      client.release();
    }
  } catch {
    // Avoid retaining or propagating raw database error messages, usernames, or connection details
    return {
      configured: true,
      connected: false,
      failureCategory: "DB_UNAVAILABLE",
    };
  }
}
