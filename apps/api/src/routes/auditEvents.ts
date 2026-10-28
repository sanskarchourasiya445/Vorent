import type { FastifyInstance, FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { listAuditEvents } from "../db/repositories/auditRepository.js";
import { db } from "../db/index.js";
import {
  extractRequestId,
  isDbConnectionError,
  resolveAuthorizedUserOrReject,
} from "./routeUtils.js";
import { UserRole } from "@warrant/contracts";

const ListAuditEventsQuerySchema = z.object({
  ownerId: z.string().uuid().optional(),
  entityType: z.string().optional(),
  entityId: z.string().optional(),
  eventType: z.string().optional(),
  actorType: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const auditEventRoutes: FastifyPluginAsync = async (app: FastifyInstance) => {
  app.get("/", async (request, reply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    const parseResult = ListAuditEventsQuerySchema.safeParse(request.query);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Invalid query parameters for audit events",
          details: parseResult.error.format(),
        },
        requestId,
      });
    }

    const authResult = await resolveAuthorizedUserOrReject(request, reply, {
      requiredRoles: [UserRole.ADMINISTRATOR, UserRole.FINANCE_AUDITOR],
      allowDefaultFallbackInDev: true,
    });
    if (!authResult) return;

    try {
      const { events, total } = await listAuditEvents(db, parseResult.data);
      return reply.status(200).send({ events, total });
    } catch (err: unknown) {
      if (isDbConnectionError(err)) {
        return reply.status(503).send({
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "Persistence store is currently unavailable in standby mode.",
          },
          requestId,
        });
      }
      request.log.error({ err, requestId }, "Failed to list audit events");
      return reply.status(500).send({
        error: {
          code: "INTERNAL_ERROR",
          message: "An internal server error occurred while retrieving audit events.",
        },
        requestId,
      });
    }
  });
};

