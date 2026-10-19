import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "node:crypto";
import {
  AcceptRiskRequestSchema,
  FindingListResponseSchema,
  ResolveFindingRequestSchema,
} from "@warrant/contracts";
import { db } from "../db/index.js";
import {
  acceptRiskFinding,
  getFinding,
  listFindings,
  resolveFinding,
} from "../db/repositories/verificationRunRepository.js";

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
      (e.message.includes("connection") || e.message.includes("authentication failed")))
  );
}

export const findingRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. GET / - List findings
  fastify.get(
    "/",
    async (
      request: FastifyRequest<{
        Querystring: {
          testRunId?: string;
          policyVersionId?: string;
          status?: string;
          limit?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const requestId = extractRequestId(request);
      reply.header("x-request-id", requestId);

      try {
        const limit = request.query.limit ? parseInt(request.query.limit, 10) : 50;
        const findingsList = await listFindings(db, {
          testRunId: request.query.testRunId,
          policyVersionId: request.query.policyVersionId,
          status: request.query.status,
          limit: Number.isNaN(limit) ? 50 : limit,
        });

        const validated = FindingListResponseSchema.parse({
          findings: findingsList,
          total: findingsList.length,
        });
        return reply.status(200).send(validated);
      } catch (err: unknown) {
        if (isDbConnectionError(err)) {
          return reply.status(503).send({
            error: {
              code: "DATABASE_UNAVAILABLE",
              message: "Persistence store is currently unavailable.",
            },
            requestId,
          });
        }
        request.log.error({ err, requestId }, "Failed to list findings");
        return reply.status(500).send({
          error: {
            code: "INTERNAL_ERROR",
            message: "An internal error occurred while listing findings.",
          },
          requestId,
        });
      }
    },
  );

  // 2. GET /:id - Retrieve finding details
  fastify.get("/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    const { id } = request.params;
    try {
      const finding = await getFinding(db, id);
      if (!finding) {
        return reply.status(404).send({
          error: {
            code: "FINDING_NOT_FOUND",
            message: `Finding '${id}' was not found.`,
          },
          requestId,
        });
      }
      return reply.status(200).send(finding);
    } catch (err: unknown) {
      if (isDbConnectionError(err)) {
        return reply.status(503).send({
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "Persistence store is currently unavailable.",
          },
          requestId,
        });
      }
      request.log.error({ err, requestId, id }, "Failed to get finding");
      return reply.status(500).send({
        error: {
          code: "INTERNAL_ERROR",
          message: "An internal error occurred while retrieving finding.",
        },
        requestId,
      });
    }
  });

  // 3. POST /:id/resolve - Resolve finding with repairing version
  fastify.post(
    "/:id/resolve",
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const requestId = extractRequestId(request);
      reply.header("x-request-id", requestId);

      const { id } = request.params;
      const parseResult = ResolveFindingRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        const issues = parseResult.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ");
        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: `Invalid resolution payload: ${issues}`,
          },
          requestId,
        });
      }

      try {
        const updated = await resolveFinding(
          db,
          id,
          parseResult.data.resolvedByVersionId,
          parseResult.data.resolutionNote,
        );
        return reply.status(200).send(updated);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("not found")) {
          return reply.status(404).send({
            error: {
              code: "FINDING_NOT_FOUND",
              message: msg,
            },
            requestId,
          });
        }
        if (isDbConnectionError(err)) {
          return reply.status(503).send({
            error: {
              code: "DATABASE_UNAVAILABLE",
              message: "Persistence store is currently unavailable.",
            },
            requestId,
          });
        }
        request.log.error({ err, requestId, id }, "Failed to resolve finding");
        return reply.status(500).send({
          error: {
            code: "INTERNAL_ERROR",
            message: "An internal error occurred while resolving finding.",
          },
          requestId,
        });
      }
    },
  );

  // 4. POST /:id/accept-risk - Accept risk for MEDIUM/LOW finding
  fastify.post(
    "/:id/accept-risk",
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const requestId = extractRequestId(request);
      reply.header("x-request-id", requestId);

      const { id } = request.params;
      const parseResult = AcceptRiskRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        const issues = parseResult.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ");
        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: `Invalid accept-risk payload: ${issues}`,
          },
          requestId,
        });
      }

      try {
        const updated = await acceptRiskFinding(db, id, parseResult.data.rationale);
        return reply.status(200).send(updated);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes("not found")) {
          return reply.status(404).send({
            error: {
              code: "FINDING_NOT_FOUND",
              message: msg,
            },
            requestId,
          });
        }
        if (msg.includes("Decision D-014")) {
          return reply.status(400).send({
            error: {
              code: "RISK_ACCEPTANCE_NOT_PERMITTED",
              message: msg,
            },
            requestId,
          });
        }
        if (isDbConnectionError(err)) {
          return reply.status(503).send({
            error: {
              code: "DATABASE_UNAVAILABLE",
              message: "Persistence store is currently unavailable.",
            },
            requestId,
          });
        }
        request.log.error({ err, requestId, id }, "Failed to accept risk for finding");
        return reply.status(500).send({
          error: {
            code: "INTERNAL_ERROR",
            message: "An internal error occurred while accepting risk for finding.",
          },
          requestId,
        });
      }
    },
  );
};
