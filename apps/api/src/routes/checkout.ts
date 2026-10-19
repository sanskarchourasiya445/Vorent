import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import {
  CreateCheckoutNonceRequestSchema,
  SubmitCheckoutProposalRequestSchema,
  SubmitCheckoutProposalResponseSchema,
  SpendReservationListResponseSchema,
} from "@warrant/contracts";
import { db } from "../db/index.js";
import { approvals } from "../db/schema.js";
import * as policyRepo from "../db/repositories/policyRepository.js";
import * as checkoutRepo from "../db/repositories/checkoutProposalRepository.js";

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

export const checkoutRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. POST /nonces - Issue single-use checkout nonce
  fastify.post("/nonces", async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    const parseResult = CreateCheckoutNonceRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: "BAD_REQUEST",
          message: "Invalid nonce request payload.",
          details: parseResult.error.format(),
        },
        requestId,
      });
    }

    try {
      const ownerId = await policyRepo.ensureDefaultUser(db);
      const { approvalId, policyVersionId, policyHash, ttlSeconds } = parseResult.data;

      // Verify approval exists and is valid before issuing nonce
      const approvalList = await db
        .select()
        .from(approvals)
        .where(eq(approvals.id, approvalId));

      const approval = approvalList[0];
      if (!approval) {
        return reply.status(404).send({
          error: {
            code: "APPROVAL_NOT_FOUND",
            message: `Approval ${approvalId} not found`,
          },
          requestId,
        });
      }

      if (approval.revokedAt) {
        return reply.status(400).send({
          error: {
            code: "REVOKED_APPROVAL",
            message: "Cannot issue nonce for revoked approval",
          },
          requestId,
        });
      }

      if (new Date(approval.expiresAt).getTime() <= Date.now()) {
        return reply.status(400).send({
          error: {
            code: "EXPIRED_APPROVAL",
            message: "Cannot issue nonce for expired approval",
          },
          requestId,
        });
      }

      if (approval.policyVersionId !== policyVersionId || approval.policyHash !== policyHash) {
        return reply.status(400).send({
          error: {
            code: "POLICY_HASH_MISMATCH",
            message: "Approval does not match target policy version and hash",
          },
          requestId,
        });
      }

      const nonce = await checkoutRepo.issueCheckoutNonce(db, {
        ownerId,
        approvalId,
        policyVersionId,
        policyHash,
        ttlSeconds,
      });

      return reply.status(201).send({
        id: nonce.id,
        nonceId: nonce.id,
        rawNonce: nonce.rawNonce,
        nonce: nonce.rawNonce,
        nonceHash: nonce.nonceHash,
        expiresAt: nonce.expiresAt.toISOString(),
        consumedAt: null,
        createdAt: new Date().toISOString(),
      });
    } catch (err: unknown) {
      if (isDbConnectionError(err)) {
        request.log.warn({ err, requestId }, "Database unavailable when issuing checkout nonce");
        return reply.status(503).send({
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "Persistence store is currently unavailable in standby mode.",
          },
          requestId,
        });
      }

      request.log.error({ err, requestId }, "Failed to issue checkout nonce");
      return reply.status(500).send({
        error: {
          code: "INTERNAL_ERROR",
          message: "An internal error occurred while issuing checkout nonce.",
        },
        requestId,
      });
    }
  });

  // 2. POST /proposals - Submit and evaluate checkout proposal
  fastify.post("/proposals", async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    const parseResult = SubmitCheckoutProposalRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: "BAD_REQUEST",
          message: "Invalid checkout proposal request payload.",
          details: parseResult.error.format(),
        },
        requestId,
      });
    }

    try {
      const ownerId = await policyRepo.ensureDefaultUser(db);
      const result = await checkoutRepo.submitCheckoutProposal(db, {
        ownerId,
        approvalId: parseResult.data.approvalId,
        policyVersionId: parseResult.data.policyVersionId,
        policyHash: parseResult.data.policyHash,
        nonceId: parseResult.data.nonceId,
        cart: parseResult.data.cart,
        evidenceSnapshot: parseResult.data.evidenceSnapshot,
      });

      const responsePayload = {
        proposal: {
          id: result.proposal.id,
          ownerId: result.proposal.ownerId,
          approvalId: result.proposal.approvalId,
          policyVersionId: result.proposal.policyVersionId,
          policyHash: result.proposal.policyHash,
          consumedNonceId: result.proposal.consumedNonceId,
          cartHash: result.proposal.cartHash,
          proposedCart: result.proposal.proposedCart,
          normalizedCart: result.proposal.normalizedCart,
          evidenceSnapshot: result.proposal.evidenceSnapshot,
          decision: result.proposal.decision,
          reasonCodes: result.proposal.reasonCodes,
          ruleTrace: result.proposal.ruleTrace,
          evaluatedAt: result.proposal.evaluatedAt instanceof Date
            ? result.proposal.evaluatedAt.toISOString()
            : result.proposal.evaluatedAt,
          createdAt: result.proposal.createdAt instanceof Date
            ? result.proposal.createdAt.toISOString()
            : result.proposal.createdAt,
        },
        reservation: result.reservation
          ? {
              id: result.reservation.id,
              ownerId: result.reservation.ownerId,
              approvalId: result.reservation.approvalId,
              proposalId: result.reservation.proposalId,
              amountMinor: Number(result.reservation.amountMinor),
              currency: result.reservation.currency,
              state: result.reservation.state,
              expiresAt: result.reservation.expiresAt
                ? (result.reservation.expiresAt instanceof Date
                    ? result.reservation.expiresAt.toISOString()
                    : result.reservation.expiresAt)
                : null,
              createdAt: result.reservation.createdAt instanceof Date
                ? result.reservation.createdAt.toISOString()
                : result.reservation.createdAt,
              updatedAt: result.reservation.updatedAt instanceof Date
                ? result.reservation.updatedAt.toISOString()
                : result.reservation.updatedAt,
            }
          : null,
        decision: result.decision,
        reasonCodes: result.reasonCodes,
      };

      const validated = SubmitCheckoutProposalResponseSchema.parse(responsePayload);
      return reply.status(201).send(validated);
    } catch (err: unknown) {
      if (isDbConnectionError(err)) {
        request.log.warn({ err, requestId }, "Database unavailable when submitting checkout proposal");
        return reply.status(503).send({
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "Persistence store is currently unavailable in standby mode.",
          },
          requestId,
        });
      }

      if (
        err instanceof checkoutRepo.NonceReplayError ||
        (err && typeof err === "object" && ((err as any).name === "NonceReplayError" || (err as any).code === "NONCE_REPLAYED"))
      ) {
        request.log.warn({ err, requestId }, "Nonce replay detected in proposal submission");
        return reply.status(409).send({
          error: {
            code: "NONCE_REPLAYED",
            message: (err as any).message,
          },
          requestId,
        });
      }

      if (
        err instanceof checkoutRepo.CheckoutError ||
        (err && typeof err === "object" && ((err as any).name === "CheckoutError" || typeof (err as any).code === "string"))
      ) {
        const errorObj = err as any;
        const isNotFound =
          errorObj.code === "APPROVAL_NOT_FOUND" ||
          errorObj.code === "POLICY_VERSION_NOT_FOUND";
        const statusCode = isNotFound ? 404 : 400;
        return reply.status(statusCode).send({
          error: {
            code: errorObj.code,
            message: errorObj.message,
          },
          requestId,
        });
      }

      request.log.error({ err, requestId }, "Failed to submit checkout proposal");
      return reply.status(500).send({
        error: {
          code: "INTERNAL_ERROR",
          message: "An internal error occurred while evaluating checkout proposal.",
        },
        requestId,
      });
    }
  });

  // 3. GET /reservations - List spend reservations
  fastify.get(
    "/reservations",
    async (
      request: FastifyRequest<{
        Querystring: { approvalId?: string; state?: string; limit?: number };
      }>,
      reply: FastifyReply
    ) => {
      const requestId = extractRequestId(request);
      reply.header("x-request-id", requestId);

      try {
        const ownerId = await policyRepo.ensureDefaultUser(db);
        const { approvalId, state, limit } = request.query;

        const result = await checkoutRepo.listSpendReservations(db, {
          ownerId,
          approvalId,
          state: state as any,
          limit: limit ? Number(limit) : undefined,
        });

        const validated = SpendReservationListResponseSchema.parse(result);
        return reply.status(200).send(validated);
      } catch (err: unknown) {
        if (isDbConnectionError(err)) {
          return reply.status(503).send({
            error: {
              code: "DATABASE_UNAVAILABLE",
              message: "Database service is currently in standby.",
            },
            requestId,
          });
        }
        return reply.status(500).send({
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to list spend reservations.",
          },
          requestId,
        });
      }
    }
  );
};
