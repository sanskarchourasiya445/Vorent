import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import {
  extractRequestId,
  isDbConnectionError,
  authenticateRequest,
  resolveAuthorizedUserOrReject,
} from "./routeUtils.js";
import {
  CreatePolicyRequestSchema,
  CreatePolicyVersionRequestSchema,
  RenamePolicyRequestSchema,
  PolicyListResponseSchema,
  PolicyVersionListResponseSchema,
  UserRole,
} from "@warrant/contracts";
import { db } from "../db/index.js";
import {
  createPolicy,
  createPolicyVersion,
  renamePolicy,
  archivePolicy,
  getPolicyVersion,
  listPolicies,
  listPolicyVersions,
} from "../db/repositories/policyRepository.js";

/**
 * Standard policy CRUD and retrieval routes:
 * Listing, querying, creating policies, and version history.
 */
export const policyRoutes: FastifyPluginAsync = async (fastify) => {
  // 1. GET /api/policies - List all policies
  fastify.get("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    try {
      const user = await authenticateRequest(request);
      const filterOwnerId =
        user && (user.role === UserRole.ADMINISTRATOR || user.role === UserRole.FINANCE_AUDITOR)
          ? undefined
          : user?.id;

      const policies = await listPolicies(db, filterOwnerId);
      const validated = PolicyListResponseSchema.parse({
        policies,
        total: policies.length,
      });
      return reply.status(200).send(validated);
    } catch (err: unknown) {
      request.log.error({ err, requestId }, "Failed to list policies");
      if (isDbConnectionError(err)) {
        return reply.status(503).send({
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "Persistence store is currently unavailable in standby mode.",
          },
          requestId,
        });
      }
      return reply.status(500).send({
        error: {
          code: "INTERNAL_ERROR",
          message: "An internal error occurred while retrieving policy list.",
        },
        requestId,
      });
    }
  });

  // 2. GET /api/policies/:id - Retrieve specific policy or version
  fastify.get("/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    const { id } = request.params;
    if (!id || typeof id !== "string") {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Policy identifier parameter is required.",
        },
        requestId,
      });
    }

    try {
      const policyVersion = await getPolicyVersion(db, id);
      if (!policyVersion) {
        return reply.status(404).send({
          error: {
            code: "POLICY_NOT_FOUND",
            message: `Policy or version '${id}' not found.`,
          },
          requestId,
        });
      }

      return reply.status(200).send(policyVersion);
    } catch (err: unknown) {
      request.log.error({ err, requestId, id }, "Failed to retrieve policy");
      if (isDbConnectionError(err)) {
        return reply.status(503).send({
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "Persistence store is currently unavailable in standby mode.",
          },
          requestId,
        });
      }
      return reply.status(500).send({
        error: {
          code: "INTERNAL_ERROR",
          message: "An internal error occurred while retrieving policy record.",
        },
        requestId,
      });
    }
  });

  // 3. POST /api/policies - Create a new policy and initial version
  fastify.post(
    "/",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = extractRequestId(request);
      reply.header("x-request-id", requestId);

      const authResult = await resolveAuthorizedUserOrReject(request, reply, {
        requiredRoles: [UserRole.APPROVER, UserRole.ADMINISTRATOR],
        allowDefaultFallbackInDev: true,
      });
      if (!authResult) return;
      const { ownerId } = authResult;

      const parseResult = CreatePolicyRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        const issueSummary = parseResult.error.issues
          .map((i: { path: (string | number)[]; message: string }) => `${i.path.join(".")}: ${i.message}`)
          .join("; ");

        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: `Invalid policy payload: ${issueSummary}`,
          },
          requestId,
        });
      }

      try {
        const createdRecord = await createPolicy(db, parseResult.data, ownerId);
        return reply.status(201).send(createdRecord);
      } catch (err: any) {
        if (err.statusCode === 409 || err.code === "POLICY_NAME_EXISTS") {
          return reply.status(409).send({
            error: {
              code: "POLICY_NAME_EXISTS",
              message: err.message || "A policy with this name already exists.",
            },
            requestId,
          });
        }

        request.log.error({ err, requestId }, "Failed to create policy in database");
        if (isDbConnectionError(err)) {
          return reply.status(503).send({
            error: {
              code: "DATABASE_UNAVAILABLE",
              message: "Persistence store is currently unavailable in standby mode.",
            },
            requestId,
          });
        }
        return reply.status(500).send({
          error: {
            code: "PERSISTENCE_ERROR",
            message: "Failed to persist policy record in the database.",
          },
          requestId,
        });
      }
    }
  );

  // 3.1 PATCH /api/policies/:id - Rename a policy
  fastify.patch<{ Params: { id: string } }>(
    "/:id",
    async (request, reply) => {
      const requestId = extractRequestId(request);
      reply.header("x-request-id", requestId);

      const authResult = await resolveAuthorizedUserOrReject(request, reply, {
        requiredRoles: [UserRole.APPROVER, UserRole.ADMINISTRATOR],
        allowDefaultFallbackInDev: true,
      });
      if (!authResult) return;
      const { ownerId } = authResult;

      const { id } = request.params;
      const parseResult = RenamePolicyRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: parseResult.error.errors[0]?.message || "Invalid policy name",
          },
          requestId,
        });
      }

      try {
        const updated = await renamePolicy(db, id, parseResult.data.name, ownerId);
        return reply.status(200).send(updated);
      } catch (err: any) {
        const statusCode = err.statusCode || 500;
        return reply.status(statusCode).send({
          error: {
            code: err.code || "RENAME_FAILED",
            message: err.message || "Failed to rename policy",
          },
          requestId,
        });
      }
    }
  );

  // 3.2 DELETE /api/policies/:id - Archive a policy
  fastify.delete<{ Params: { id: string } }>(
    "/:id",
    async (request, reply) => {
      const requestId = extractRequestId(request);
      reply.header("x-request-id", requestId);

      const authResult = await resolveAuthorizedUserOrReject(request, reply, {
        requiredRoles: [UserRole.ADMINISTRATOR],
        allowDefaultFallbackInDev: true,
      });
      if (!authResult) return;
      const { ownerId } = authResult;

      const { id } = request.params;
      try {
        const result = await archivePolicy(db, id, ownerId);
        return reply.status(200).send({
          success: true,
          archived: true,
          id: result.policyId,
          policyId: result.policyId,
          message: "Policy successfully archived.",
          requestId,
        });
      } catch (err: any) {
        const statusCode = err.statusCode || 500;
        return reply.status(statusCode).send({
          error: {
            code: err.code || "ARCHIVE_FAILED",
            message: err.message || "Failed to archive policy",
          },
          requestId,
        });
      }
    }
  );

  // 4. GET /api/policies/:id/versions - List all versions for a policy
  fastify.get("/:id/versions", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    const { id } = request.params;

    try {
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      if (!isUuid) {
        // Preset policies only have 1 built-in version
        const presetVersion = await getPolicyVersion(db, id);
        if (!presetVersion) {
          return reply.status(404).send({
            error: {
              code: "POLICY_NOT_FOUND",
              message: `Policy '${id}' not found.`,
            },
            requestId,
          });
        }
        return reply.status(200).send({
          policyId: id,
          name: presetVersion.name,
          versions: [presetVersion],
          total: 1,
        });
      }

      const versions = await listPolicyVersions(db, id);
      if (versions.length === 0) {
        return reply.status(404).send({
          error: {
            code: "POLICY_NOT_FOUND",
            message: `Policy with ID '${id}' not found.`,
          },
          requestId,
        });
      }

      const validated = PolicyVersionListResponseSchema.parse({
        policyId: id,
        name: versions[0]?.name ?? "Policy",
        versions,
        total: versions.length,
      });

      return reply.status(200).send(validated);
    } catch (err: unknown) {
      request.log.error({ err, requestId, id }, "Failed to list policy versions");
      if (isDbConnectionError(err)) {
        return reply.status(503).send({
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "Persistence store is currently unavailable in standby mode.",
          },
          requestId,
        });
      }
      return reply.status(500).send({
        error: {
          code: "INTERNAL_ERROR",
          message: "An internal error occurred while listing policy versions.",
        },
        requestId,
      });
    }
  });

  // 5. POST /api/policies/:id/versions - Create a new immutable version for an existing policy
  fastify.post<{ Params: { id: string } }>(
    "/:id/versions",
    async (request, reply) => {
      const requestId = extractRequestId(request);
      reply.header("x-request-id", requestId);

      const authResult = await resolveAuthorizedUserOrReject(request, reply, {
        requiredRoles: [UserRole.APPROVER, UserRole.ADMINISTRATOR],
        allowDefaultFallbackInDev: true,
      });
      if (!authResult) return;
      const { ownerId } = authResult;

      const { id } = request.params;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
      if (!isUuid) {
        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: "Creating new versions is only supported for persisted policy UUIDs, not static presets.",
          },
          requestId,
        });
      }

      const parseResult = CreatePolicyVersionRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        const issueSummary = parseResult.error.issues
          .map((i: { path: (string | number)[]; message: string }) => `${i.path.join(".")}: ${i.message}`)
          .join("; ");

        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: `Invalid policy version payload: ${issueSummary}`,
          },
          requestId,
        });
      }

      try {
        const newVersion = await createPolicyVersion(db, id, parseResult.data, ownerId);
        return reply.status(201).send(newVersion);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("not found")) {
        return reply.status(404).send({
          error: {
            code: "POLICY_NOT_FOUND",
            message: msg,
          },
          requestId,
        });
      }

      request.log.error({ err, requestId, id }, "Failed to create policy version in database");
      if (isDbConnectionError(err)) {
        return reply.status(503).send({
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "Persistence store is currently unavailable in standby mode.",
          },
          requestId,
        });
      }
      return reply.status(500).send({
        error: {
          code: "PERSISTENCE_ERROR",
          message: "Failed to persist new policy version in the database.",
        },
        requestId,
      });
    }
  });
};
