import { randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";

/**
 * Extracts or generates a stable request correlation ID.
 *
 * Priority order:
 * 1. Incoming `x-request-id` header (from client or upstream proxy).
 * 2. Fastify's internally assigned `request.id`.
 * 3. Freshly generated `req_<uuid>` as a last resort.
 */
export function extractRequestId(request: FastifyRequest): string {
  const incoming = request.headers["x-request-id"];
  if (typeof incoming === "string" && incoming.trim().length > 0) {
    return incoming.trim();
  }
  if (request.id) {
    return String(request.id);
  }
  return `req_${randomUUID()}`;
}

/**
 * Returns true when an error represents a transient or permanent database
 * connectivity failure.  Handles PostgreSQL authentication errors (28P01),
 * TCP connection refusals, timeouts, DNS failures, and common driver
 * messages that do not expose raw connection-string details to callers.
 */
export function isDbConnectionError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as Record<string, unknown>;
  if (
    e.code === "28P01" ||
    e.code === "ECONNREFUSED" ||
    e.code === "ETIMEDOUT" ||
    e.code === "ENOTFOUND"
  ) {
    return true;
  }
  if (typeof e.message === "string") {
    const msg = e.message;
    return (
      msg.includes("connection") ||
      msg.includes("authentication failed") ||
      msg.includes("ECONNREFUSED")
    );
  }
  return false;
}
