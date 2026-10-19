import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { env } from "../config/env.js";

import * as schema from "./schema.js";

const { Pool } = pg;

export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 3000,
});

export const db = drizzle(pool, { schema });
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
