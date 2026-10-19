import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "node:crypto";
import {
  CreateApprovalRequestSchema,
  ApprovalListResponseSchema,
  RevokeApprovalResponseSchema,
} from "@warrant/contracts";
import { db } from "../db/index.js";
import * as policyRepo from "../db/repositories/policyRepository.js";
import * as approvalRepo from "../db/repositories/approvalRepository.js";
import { CheckoutError } from "../db/repositories/checkoutProposalRepository.js";

function extractRequestId(request: FastifyRequest): string {
  const incoming = request.headers["x-request-id"];
  if (typeof incoming === "string" && incoming.trim().length > 0) {
    return incoming.trim();
  }
  return `req_${randomUUID()}`;
}

function isDbConnectionError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as any;
  return (
    e.code === "28P01" ||
    e.code === "ECONNREFUSED" ||
    e.code === "ETIMEDOUT" ||
    e.code === "ENOTFOUND" ||
    (typeof e.message === "string" &&
      (e.message.includes("connection") || e.message.includes("authentication failed") || e.message.includes("ECONNREFUSED")))
  );
}

export const approvalRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. GET / - List approvals
  fastify.get("/", async (request: FastifyRequest<{ Querystring: { policyVersionId?: string } }>, reply: FastifyReply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    try {
      const approvalsList = await approvalRepo.listApprovals(db, request.query);
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
  fastify.post("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

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
      const ownerId = await policyRepo.ensureDefaultUser(db);
      const created = await approvalRepo.createApproval(db, parseResult.data, ownerId);
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
  fastify.post("/:id/revoke", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
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

    try {
      const updated = await approvalRepo.revokeApproval(db, id);
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
