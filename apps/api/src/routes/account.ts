import type { FastifyPluginAsync } from "fastify";
import {
  UpdateProfileRequestSchema,
  UpdatePreferencesRequestSchema,
  ChangePasswordRequestSchema,
  InviteMemberRequestSchema,
} from "@warrant/contracts";
import {
  getUserProfile,
  updateUserProfile,
  getUserPreferences,
  updateUserPreferences,
  changeUserPassword,
  revokeUserSession,
  getUserActivity,
  getUserSessions,
  getConnectedServicesStatus,
  getOrganizationDetails,
  inviteOrganizationMember,
} from "../services/accountService.js";
import {
  extractRequestId,
  extractToken,
  requireAuth,
  createRateLimiter,
} from "./routeUtils.js";
import { createHash } from "node:crypto";

export const accountRateLimiter = createRateLimiter({
  max: 30,
  windowMs: 60 * 1000,
});

export const accountRoutes: FastifyPluginAsync = async (app) => {
  /**
   * GET /api/account/profile
   * Returns authenticated user profile including organization context.
   */
  app.get("/profile", { preHandler: [requireAuth] }, async (request, reply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    const user = request.user!;
    const profile = await getUserProfile(user.id);
    if (!profile) {
      return reply.status(404).send({
        error: {
          code: "USER_NOT_FOUND",
          message: "User profile could not be located.",
        },
        requestId,
      });
    }

    return reply.status(200).send({
      profile,
      requestId,
    });
  });

  /**
   * PATCH /api/account/profile
   * Updates authenticated user profile details.
   */
  app.patch("/profile", { preHandler: [requireAuth, accountRateLimiter] }, async (request, reply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    const parseResult = UpdateProfileRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: parseResult.error.errors[0]?.message || "Invalid profile update payload",
          details: parseResult.error.errors,
        },
        requestId,
      });
    }

    try {
      const user = request.user!;
      const updated = await updateUserProfile(user.id, parseResult.data);
      return reply.status(200).send({
        profile: updated,
        requestId,
      });
    } catch (err: any) {
      request.log.error({ err, requestId }, "Failed to update profile");
      return reply.status(500).send({
        error: {
          code: "UPDATE_FAILED",
          message: err?.message || "Failed to update profile.",
        },
        requestId,
      });
    }
  });

  /**
   * GET /api/account/preferences
   * Returns persisted user preferences.
   */
  app.get("/preferences", { preHandler: [requireAuth] }, async (request, reply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    const user = request.user!;
    const preferences = await getUserPreferences(user.id);

    return reply.status(200).send({
      preferences,
      requestId,
    });
  });

  /**
   * PATCH /api/account/preferences
   * Updates persisted user preferences.
   */
  app.patch("/preferences", { preHandler: [requireAuth, accountRateLimiter] }, async (request, reply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    const parseResult = UpdatePreferencesRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: parseResult.error.errors[0]?.message || "Invalid preferences payload",
        },
        requestId,
      });
    }

    const user = request.user!;
    const updated = await updateUserPreferences(user.id, parseResult.data);

    return reply.status(200).send({
      preferences: updated,
      requestId,
    });
  });

  /**
   * POST /api/account/change-password
   * Updates password securely with scrypt timing-safe verification.
   */
  app.post("/change-password", { preHandler: [requireAuth, accountRateLimiter] }, async (request, reply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    const parseResult = ChangePasswordRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: parseResult.error.errors[0]?.message || "Invalid password change payload",
        },
        requestId,
      });
    }

    try {
      const user = request.user!;
      const rawToken = extractToken(request);
      const currentTokenHash = rawToken ? createHash("sha256").update(rawToken).digest("hex") : undefined;
      await changeUserPassword(user.id, parseResult.data.currentPassword, parseResult.data.newPassword, currentTokenHash);
      return reply.status(200).send({
        success: true,
        message: "Password changed successfully. All other active sessions have been revoked.",
        requestId,
      });
    } catch (err: any) {
      if (err?.message === "INVALID_CURRENT_PASSWORD") {
        return reply.status(401).send({
          error: {
            code: "INVALID_CURRENT_PASSWORD",
            message: "The current password entered is incorrect.",
          },
          requestId,
        });
      }
      return reply.status(500).send({
        error: {
          code: "PASSWORD_CHANGE_FAILED",
          message: "Unable to update password. Please try again.",
        },
        requestId,
      });
    }
  });

  /**
   * DELETE /api/account/sessions/:id
   * Revokes an active session for the authenticated user.
   */
  app.delete("/sessions/:id", { preHandler: [requireAuth, accountRateLimiter] }, async (request, reply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    const { id } = request.params as { id: string };
    const user = request.user!;
    const rawToken = extractToken(request);
    const currentTokenHash = rawToken ? createHash("sha256").update(rawToken).digest("hex") : undefined;

    try {
      const result = await revokeUserSession(user.id, id, currentTokenHash);
      return reply.status(200).send({
        success: true,
        isCurrent: result.isCurrent,
        message: "Session successfully revoked.",
        requestId,
      });
    } catch (err: any) {
      if (err?.message === "SESSION_NOT_FOUND") {
        return reply.status(404).send({
          error: {
            code: "SESSION_NOT_FOUND",
            message: "Session not found or does not belong to the authenticated user.",
          },
          requestId,
        });
      }
      return reply.status(500).send({
        error: {
          code: "REVOKE_FAILED",
          message: "Unable to revoke session. Please try again.",
        },
        requestId,
      });
    }
  });

  /**
   * GET /api/account/activity
   * Returns recent security and governance activity for the user.
   */
  app.get("/activity", { preHandler: [requireAuth] }, async (request, reply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    const user = request.user!;
    const activity = await getUserActivity(user.id);

    return reply.status(200).send({
      activity,
      requestId,
    });
  });

  /**
   * GET /api/account/sessions
   * Lists active sessions for current user.
   */
  app.get("/sessions", { preHandler: [requireAuth] }, async (request, reply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    const user = request.user!;
    const rawToken = extractToken(request);
    const tokenHash = rawToken ? createHash("sha256").update(rawToken).digest("hex") : undefined;

    const sessions = await getUserSessions(user.id, tokenHash);

    return reply.status(200).send({
      sessions,
      requestId,
    });
  });

  /**
   * GET /api/account/integrations
   * Returns real environment and connected services status (PayPal Sandbox, Gemini, DB).
   */
  app.get("/integrations", async (request, reply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    const integrations = await getConnectedServicesStatus();

    return reply.status(200).send({
      integrations,
      requestId,
    });
  });

  /**
   * GET /api/account/organization
   * Returns current user's organization details and workspace members.
   */
  app.get("/organization", { preHandler: [requireAuth] }, async (request, reply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    const user = request.user!;
    const organization = await getOrganizationDetails(user.id);

    return reply.status(200).send({
      organization,
      requestId,
    });
  });

  /**
   * POST /api/account/organization/members
   * Invites/adds a new member to the user's workspace.
   * Requires OWNER or ADMIN role in the organization.
   */
  app.post("/organization/members", { preHandler: [requireAuth, accountRateLimiter] }, async (request, reply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    const parseResult = InviteMemberRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: parseResult.error.errors[0]?.message || "Invalid invite payload",
          details: parseResult.error.errors,
        },
        requestId,
      });
    }

    try {
      const user = request.user!;
      const member = await inviteOrganizationMember(user.id, parseResult.data);
      return reply.status(201).send({
        member,
        requestId,
      });
    } catch (err: any) {
      const statusCode = err.statusCode || 500;
      return reply.status(statusCode).send({
        error: {
          code: err.code || "INVITE_FAILED",
          message: err.message || "Failed to invite organization member.",
        },
        requestId,
      });
    }
  });
};
