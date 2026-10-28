import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import {
  CreateApprovalRequestSchema,
  ApprovalListResponseSchema,
  RevokeApprovalResponseSchema,
  UserRole,
} from "@warrant/contracts";
import { db } from "../db/index.js";
import * as approvalRepo from "../db/repositories/approvalRepository.js";
import { CheckoutError } from "../db/repositories/checkoutProposalRepository.js";
import {
  extractRequestId,
  isDbConnectionError,
  resolveAuthorizedUserOrReject,
} from "./routeUtils.js";
import { emailService } from "../services/emailService.js";

export const approvalRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. GET / - List approvals
  fastify.get("/", async (request: FastifyRequest<{ Querystring: { policyVersionId?: string } }>, reply: FastifyReply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    try {
      const authResult = await resolveAuthorizedUserOrReject(request, reply, {
        allowDefaultFallbackInDev: true,
      });
      if (!authResult) return;
      const { user, ownerId } = authResult;
      const isElevated = user && (user.role === UserRole.ADMINISTRATOR || user.role === UserRole.APPROVER || user.role === UserRole.FINANCE_AUDITOR);
      const filterOwnerId = isElevated ? undefined : ownerId;

      const approvalsList = await approvalRepo.listApprovals(db, {
        ...request.query,
        ownerId: filterOwnerId,
      });
      const validated = ApprovalListResponseSchema.parse({
        approvals: approvalsList,
        total: approvalsList.length,
      });
      return reply.status(200).send(validated);
    } catch (err: unknown) {
      if (isDbConnectionError(err)) {
        request.log.warn({ err, requestId }, "Database unavailable when listing approvals");
        return reply.status(503).send({
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "Persistence store is currently unavailable in standby mode.",
          },
          requestId,
        });
      }
      request.log.error({ err, requestId }, "Failed to list approvals");
      return reply.status(500).send({
        error: {
          code: "INTERNAL_ERROR",
          message: "An internal error occurred while retrieving approvals list.",
        },
        requestId,
      });
    }
  });

  // 2. POST / - Create approval with Decision D-014 verification
  fastify.post(
    "/",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = extractRequestId(request);
      reply.header("x-request-id", requestId);

      const authResult = await resolveAuthorizedUserOrReject(request, reply, {
        requiredRoles: [UserRole.APPROVER, UserRole.ADMINISTRATOR],
        allowDefaultFallbackInDev: false,
      });
      if (!authResult) return;
      const { user, ownerId } = authResult;

      const parseResult = CreateApprovalRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: {
            code: "BAD_REQUEST",
            message: "Invalid approval creation request payload.",
            details: parseResult.error.format(),
          },
          requestId,
        });
      }

      try {
        const created = await approvalRepo.createApproval(db, parseResult.data, ownerId);

        // Asynchronous, non-blocking email notification
        emailService.dispatchApprovalGrantedAsync(
          {
            recipientEmail: user?.email || "governance@warrant.studio",
            recipientName: user?.name || undefined,
            approvalId: created.id,
            policyId: created.policyVersionId,
            policyHash: created.policyHash,
            spendCap: created.spendLimitMinor / 100,
            currency: created.currency,
            expiresAt: created.expiresAt instanceof Date ? created.expiresAt.toISOString() : String(created.expiresAt),
            grantedBy: user?.name || user?.email || "System Governance",
          },
          ownerId,
        );

        return reply.status(201).send({ approval: created });
      } catch (err: unknown) {
      if (isDbConnectionError(err)) {
        request.log.warn({ err, requestId }, "Database unavailable when creating approval");
        return reply.status(503).send({
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "Persistence store is currently unavailable in standby mode.",
          },
          requestId,
        });
      }

      if (
        err instanceof CheckoutError ||
        (err && typeof err === "object" && (err as any).name === "CheckoutError") ||
        (err && typeof (err as any)?.code === "string" && !isDbConnectionError(err))
      ) {
        const errorObj = err as any;
        const isNotFound =
          errorObj.code === "POLICY_VERSION_NOT_FOUND" ||
          errorObj.code === "QUALIFYING_RUN_NOT_FOUND";
        const statusCode = isNotFound ? 404 : 400;
        return reply.status(statusCode).send({
          error: {
            code: errorObj.code,
            message: errorObj.message,
          },
          requestId,
        });
      }

      request.log.error({ err, requestId }, "Failed to create approval");
      return reply.status(500).send({
        error: {
          code: "INTERNAL_ERROR",
          message: "An internal error occurred while creating approval.",
        },
        requestId,
      });
    }
  });

  // 3. POST /:id/revoke - Revoke approval
  fastify.post<{ Params: { id: string } }>(
    "/:id/revoke",
    async (request, reply) => {
      const requestId = extractRequestId(request);
      reply.header("x-request-id", requestId);

      const { id } = request.params;
      if (!id || typeof id !== "string") {
        return reply.status(400).send({
          error: {
            code: "BAD_REQUEST",
            message: "Invalid approval ID parameter.",
          },
          requestId,
        });
      }

      const authResult = await resolveAuthorizedUserOrReject(request, reply, {
        requiredRoles: [UserRole.APPROVER, UserRole.ADMINISTRATOR],
        allowDefaultFallbackInDev: false,
      });
      if (!authResult) return;
      const { user } = authResult;

      try {
        const updated = await approvalRepo.revokeApproval(db, id);

        // Asynchronous, non-blocking email notification
        emailService.dispatchApprovalRevokedAsync(
          {
            recipientEmail: user?.email || "governance@warrant.studio",
            approvalId: updated.id,
            policyId: updated.policyVersionId,
            revokedReason: "Explicitly revoked by policy administrator",
            revokedAt:
              updated.revokedAt instanceof Date
                ? updated.revokedAt.toISOString()
                : (updated.revokedAt ?? new Date().toISOString()),
            revokedBy: user?.name || user?.email || "Policy Administrator",
          },
          updated.ownerId || undefined,
        );

        const validated = RevokeApprovalResponseSchema.parse({
          success: true,
          approval: updated,
        });
        return reply.status(200).send(validated);
      } catch (err: unknown) {
      if (isDbConnectionError(err)) {
        request.log.warn({ err, requestId, id }, "Database unavailable when revoking approval");
        return reply.status(503).send({
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "Persistence store is currently unavailable in standby mode.",
          },
          requestId,
        });
      }

      if (
        err instanceof CheckoutError ||
        (err && typeof err === "object" && (err as any).name === "CheckoutError") ||
        (err && typeof (err as any)?.code === "string")
      ) {
        const errorObj = err as any;
        if (errorObj.code === "APPROVAL_NOT_FOUND") {
          return reply.status(404).send({
            error: {
              code: errorObj.code,
              message: errorObj.message,
            },
            requestId,
          });
        }
        return reply.status(400).send({
          error: {
            code: errorObj.code,
            message: errorObj.message,
          },
          requestId,
        });
      }

      request.log.error({ err, requestId, id }, "Failed to revoke approval");
      return reply.status(500).send({
        error: {
          code: "INTERNAL_ERROR",
          message: "An internal error occurred while revoking approval.",
        },
        requestId,
      });
    }
  });
};
