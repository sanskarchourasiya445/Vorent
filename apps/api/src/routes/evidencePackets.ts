import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import {
  buildEvidencePacketForProposal,
  buildEvidencePacketForOrder,
  buildEvidencePacketForPolicyVersion,
  EvidencePacketNotFoundError,
} from "../services/evidencePacketService.js";
import { db } from "../db/index.js";
import { ensureDefaultUser } from "../db/repositories/policyRepository.js";
import { extractRequestId, isDbConnectionError } from "./routeUtils.js";

const ParamIdSchema = z.object({
  id: z.string().min(1),
});

const ParamVersionIdSchema = z.object({
  versionId: z.string().min(1),
});

export const evidencePacketRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  // GET /proposals/:id
  app.get("/proposals/:id", async (request, reply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    const parse = ParamIdSchema.safeParse(request.params);
    if (!parse.success) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid proposal ID parameter.",
        },
        requestId,
      });
    }

    try {
      const ownerId = await ensureDefaultUser(db);
      const packet = await buildEvidencePacketForProposal(parse.data.id, db, ownerId);
      return reply.status(200).send({ packet });
    } catch (err: unknown) {
      if (err instanceof EvidencePacketNotFoundError) {
        return reply.status(404).send({
          error: {
            code: "NOT_FOUND",
            message: err.message,
          },
          requestId,
        });
      }
      if (isDbConnectionError(err)) {
        return reply.status(503).send({
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "Persistence store is currently unavailable in standby mode.",
          },
          requestId,
        });
      }
      request.log.error({ err, requestId }, "Failed to build proposal evidence packet");
      return reply.status(500).send({
        error: {
          code: "INTERNAL_ERROR",
          message: "An internal server error occurred while retrieving evidence packet.",
        },
        requestId,
      });
    }
  });

  // GET /orders/:id
  app.get("/orders/:id", async (request, reply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    const parse = ParamIdSchema.safeParse(request.params);
    if (!parse.success) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid order ID parameter.",
        },
        requestId,
      });
    }

    try {
      const ownerId = await ensureDefaultUser(db);
      const packet = await buildEvidencePacketForOrder(parse.data.id, db, ownerId);
      return reply.status(200).send({ packet });
    } catch (err: unknown) {
      if (err instanceof EvidencePacketNotFoundError) {
        return reply.status(404).send({
          error: {
            code: "NOT_FOUND",
            message: err.message,
          },
          requestId,
        });
      }
      if (isDbConnectionError(err)) {
        return reply.status(503).send({
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "Persistence store is currently unavailable in standby mode.",
          },
          requestId,
        });
      }
      request.log.error({ err, requestId }, "Failed to build order evidence packet");
      return reply.status(500).send({
        error: {
          code: "INTERNAL_ERROR",
          message: "An internal server error occurred while retrieving evidence packet.",
        },
        requestId,
      });
    }
  });

  // GET /policies/:versionId
  app.get("/policies/:versionId", async (request, reply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    const parse = ParamVersionIdSchema.safeParse(request.params);
    if (!parse.success) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid policy version ID parameter.",
        },
        requestId,
      });
    }

    try {
      const packet = await buildEvidencePacketForPolicyVersion(parse.data.versionId, db);
      return reply.status(200).send({ packet });
    } catch (err: unknown) {
      if (err instanceof EvidencePacketNotFoundError) {
        return reply.status(404).send({
          error: {
            code: "NOT_FOUND",
            message: err.message,
          },
          requestId,
        });
      }
      if (isDbConnectionError(err)) {
        return reply.status(503).send({
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "Persistence store is currently unavailable in standby mode.",
          },
          requestId,
        });
      }
      request.log.error({ err, requestId }, "Failed to build policy version evidence packet");
      return reply.status(500).send({
        error: {
          code: "INTERNAL_ERROR",
          message: "An internal server error occurred while retrieving evidence packet.",
        },
        requestId,
      });
    }
  });
};

