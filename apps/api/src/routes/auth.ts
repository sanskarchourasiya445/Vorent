import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import {
  RegisterRequestSchema,
  LoginRequestSchema,
  UserRole,
} from "@warrant/contracts";
import {
  registerUser,
  loginUser,
  revokeSessionToken,
  CANONICAL_STARTER_USERS,
} from "../services/authService.js";
import {
  extractRequestId,
  extractToken,
  requireAuth,
  createRateLimiter,
} from "./routeUtils.js";

export const authRateLimiter = createRateLimiter({
  max: 10,
  windowMs: 60 * 1000,
});

export const authRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  /**
   * POST /api/auth/register
   * Section 7.2: Public registration with least-privileged role (REQUESTER).
   */
  app.post("/register", { preHandler: [authRateLimiter] }, async (request, reply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    const parseResult = RegisterRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: parseResult.error.errors[0]?.message || "Invalid registration data",
          details: parseResult.error.errors,
        },
        requestId,
      });
    }

    try {
      const session = await registerUser(parseResult.data);
      return reply.status(201).send({
        ...session,
        requestId,
      });
    } catch (err: any) {
      if (err?.message === "EMAIL_ALREADY_EXISTS") {
        return reply.status(409).send({
          error: {
            code: "EMAIL_ALREADY_EXISTS",
            message: "An account with this email address already exists.",
          },
          requestId,
        });
      }
      request.log.error({ err, requestId }, "Registration failure");
      return reply.status(500).send({
        error: {
          code: "REGISTRATION_FAILED",
          message: "Unable to complete registration. Please try again.",
        },
        requestId,
      });
    }
  });

  /**
   * POST /api/auth/login
   * Validates credentials and returns session token + user profile.
   */
  app.post("/login", { preHandler: [authRateLimiter] }, async (request, reply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    const parseResult = LoginRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: parseResult.error.errors[0]?.message || "Invalid login data",
        },
        requestId,
      });
    }

    try {
      const session = await loginUser(parseResult.data);
      return reply.status(200).send({
        ...session,
        requestId,
      });
    } catch (err: any) {
      if (err?.message === "ACCOUNT_DISABLED") {
        return reply.status(403).send({
          error: {
            code: "ACCOUNT_DISABLED",
            message: "This account has been disabled. Please contact an administrator.",
          },
          requestId,
        });
      }
      return reply.status(401).send({
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Invalid email or password.",
        },
        requestId,
      });
    }
  });

  /**
   * POST /api/auth/logout
   * Revokes the current session token.
   */
  app.post("/logout", async (request, reply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    const token = extractToken(request);
    if (token) {
      await revokeSessionToken(token);
    }

    return reply.status(200).send({
      success: true,
      requestId,
    });
  });

  /**
   * GET /api/auth/me
   * Returns current authenticated user profile.
   */
  app.get("/me", { preHandler: [requireAuth] }, async (request, reply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    return reply.status(200).send({
      user: request.user,
      requestId,
    });
  });

  /**
   * GET /api/auth/personas
   * Provides available starter personas for testing each role
   * (ADMINISTRATOR, APPROVER, FINANCE_AUDITOR, REQUESTER)
   */
  app.get("/personas", async (request, reply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    const personas = CANONICAL_STARTER_USERS.map((p) => ({
      email: p.email,
      name: p.name,
      role: p.role,
      passwordHint: p.plainPassword,
    }));

    return reply.status(200).send({
      personas,
      roles: Object.values(UserRole),
      requestId,
    });
  });
};
