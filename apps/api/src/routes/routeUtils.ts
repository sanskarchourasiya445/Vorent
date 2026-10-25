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

import type { FastifyReply } from "fastify";
import type { AuthUser, UserRole } from "@warrant/contracts";
import { verifySessionToken } from "../services/authService.js";

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthUser | null;
  }
}

/**
 * Extracts session bearer token from Authorization header or custom header.
 */
export function extractToken(request: FastifyRequest): string | null {
  const authHeader = request.headers["authorization"];
  if (typeof authHeader === "string" && authHeader.toLowerCase().startsWith("bearer ")) {
    return authHeader.slice(7).trim();
  }
  const customHeader = request.headers["x-auth-token"];
  if (typeof customHeader === "string" && customHeader.trim().length > 0) {
    return customHeader.trim();
  }
  return null;
}

/**
 * Populates request.user if a valid session token is provided.
 */
export async function authenticateRequest(request: FastifyRequest): Promise<AuthUser | null> {
  const token = extractToken(request);
  if (!token) {
    request.user = null;
    return null;
  }
  const user = await verifySessionToken(token);
  request.user = user;
  return user;
}

/**
 * Fastify preHandler hook requiring authenticated user.
 */
export async function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const user = await authenticateRequest(request);
  if (!user) {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);
    return reply.status(401).send({
      error: {
        code: "UNAUTHENTICATED",
        message: "Authentication required to access this endpoint.",
      },
      requestId,
    });
  }
}

/**
 * Fastify preHandler hook factory requiring one of the specified roles.
 */
export function requireRoles(allowedRoles: UserRole[]) {
  return async function checkRoles(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const user = await authenticateRequest(request);
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    if (!user) {
      return reply.status(401).send({
        error: {
          code: "UNAUTHENTICATED",
          message: "Authentication required to access this endpoint.",
        },
        requestId,
      });
    }

    if (!allowedRoles.includes(user.role)) {
      return reply.status(403).send({
        error: {
          code: "FORBIDDEN",
          message: `Insufficient permissions. Action requires one of: ${allowedRoles.join(", ")}. Current role: ${user.role}.`,
        },
        requestId,
      });
    }
  };
}

