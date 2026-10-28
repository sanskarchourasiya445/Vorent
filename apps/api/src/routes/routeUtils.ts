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
import { env } from "../config/env.js";
import { db } from "../db/index.js";
import { ensureDefaultUser } from "../db/repositories/policyRepository.js";

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

export interface ResolveIdentityOptions {
  requiredRoles?: UserRole[];
  allowDefaultFallbackInDev?: boolean;
}

/**
 * Authoritatively resolves user identity and enforces production trust boundary.
 *
 * In production:
 * - Unauthenticated requests strictly fail-closed with HTTP 401 UNAUTHENTICATED.
 * - Missing or invalid credentials NEVER silently fall back to a default user.
 * - Authenticated callers must hold one of the required roles (if specified), or receive HTTP 403.
 *
 * In non-production (development & test):
 * - If user credentials are provided, validates role and binds to real user ID.
 * - If no credentials and allowDefaultFallbackInDev is true, safely returns default owner for local test harness.
 */
export async function resolveAuthorizedUserOrReject(
  request: FastifyRequest,
  reply: FastifyReply,
  options: ResolveIdentityOptions = {}
): Promise<{ user: AuthUser | null; ownerId: string } | null> {
  const requestId = extractRequestId(request);
  reply.header("x-request-id", requestId);

  const user = await authenticateRequest(request);

  if (user) {
    if (options.requiredRoles && !options.requiredRoles.includes(user.role)) {
      reply.status(403).send({
        error: {
          code: "FORBIDDEN",
          message: `User role ${user.role} is not authorized for this action. Requires one of: ${options.requiredRoles.join(", ")}.`,
        },
        requestId,
      });
      return null;
    }
    return { user, ownerId: user.id };
  }

  // Strict Production & Staging Trust Boundary:
  // In production or staging (or when default fallback is disabled), ANY unauthenticated call fails closed with 401
  const isStrictEnv = env.NODE_ENV === "production" || (env.NODE_ENV as string) === "staging";
  if (isStrictEnv || !options.allowDefaultFallbackInDev) {
    reply.status(401).send({
      error: {
        code: "UNAUTHENTICATED",
        message: "Authentication required to access this endpoint.",
      },
      requestId,
    });
    return null;
  }

  // Explicit, documented test/development fallback ONLY when NOT in production
  try {
    const defaultOwnerId = await ensureDefaultUser(db);
    return { user: null, ownerId: defaultOwnerId };
  } catch (err: unknown) {
    if (isDbConnectionError(err)) {
      reply.status(503).send({
        error: {
          code: "DATABASE_UNAVAILABLE",
          message: "Persistence store is currently unavailable in standby mode.",
        },
        requestId,
      });
      return null;
    }
    throw err;
  }
}

/**
 * Global registry of active rate limiter stores so tests can reset them cleanly.
 */
const rateLimitStores = new Set<Map<string, number[]>>();

/**
 * Resets all active rate limiter windows. Useful for tests.
 */
export function resetRateLimits(): void {
  for (const store of rateLimitStores) {
    store.clear();
  }
}

/**
 * Default key generator based on user ID (if authenticated), token, or validated client IP.
 * Relies on Fastify's validated `request.ip` (governed by trustProxy configuration),
 * preventing direct untrusted clients from spoofing raw X-Forwarded-For headers.
 */
function defaultRateLimitKeyGenerator(request: FastifyRequest): string {
  if (request.user?.id) {
    return `user:${request.user.id}`;
  }
  const token = extractToken(request);
  if (token) {
    return `token:${token}`;
  }
  const clientIp = request.ip || (request.socket as any)?.remoteAddress || "127.0.0.1";
  return `ip:${clientIp}`;
}

export interface RateLimiterOptions {
  max: number;
  windowMs: number;
  keyGenerator?: (req: FastifyRequest) => string;
}

/**
 * Creates a lightweight, zero-dependency in-memory sliding window rate limiter hook for Fastify.
 */
export function createRateLimiter(options: {
  max: number;
  windowMs: number;
  keyGenerator?: (req: FastifyRequest) => string;
}): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  const store = new Map<string, number[]>();
  rateLimitStores.add(store);

  const keyGen = options.keyGenerator ?? defaultRateLimitKeyGenerator;

  return async function rateLimiterHook(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    const now = Date.now();
    const key = keyGen(request);
    const windowStart = now - options.windowMs;

    const timestamps = store.get(key) || [];
    const validTimestamps = timestamps.filter((t) => t > windowStart);

    // Periodic sweep if store grows very large
    if (store.size > 10000) {
      for (const [k, ts] of store.entries()) {
        const active = ts.filter((t) => t > windowStart);
        if (active.length === 0) store.delete(k);
        else store.set(k, active);
      }
    }

    // If limit reached, calculate reset and reject with HTTP 429
    if (validTimestamps.length >= options.max) {
      store.set(key, validTimestamps);
      const oldestTimestamp = validTimestamps[0] ?? now;
      const resetMs = Math.max(0, oldestTimestamp + options.windowMs - now);
      const resetSeconds = Math.max(1, Math.ceil(resetMs / 1000));
      const requestId = extractRequestId(request);

      reply.header("x-request-id", requestId);
      reply.header("x-ratelimit-limit", options.max);
      reply.header("x-ratelimit-remaining", 0);
      reply.header("x-ratelimit-reset", resetSeconds);
      reply.header("retry-after", resetSeconds);

      return reply.status(429).send({
        error: {
          code: "RATE_LIMIT_EXCEEDED",
          message: "Too many requests. Please try again later.",
        },
        requestId,
      });
    }

    // Record this request
    validTimestamps.push(now);
    store.set(key, validTimestamps);

    const remaining = Math.max(0, options.max - validTimestamps.length);
    const oldestTimestamp = validTimestamps[0] ?? now;
    const resetMs = Math.max(0, oldestTimestamp + options.windowMs - now);
    const resetSeconds = Math.max(1, Math.ceil(resetMs / 1000));

    reply.header("x-ratelimit-limit", options.max);
    reply.header("x-ratelimit-remaining", remaining);
    reply.header("x-ratelimit-reset", resetSeconds);
  };
}


