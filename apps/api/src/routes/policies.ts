import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { extractRequestId } from "./routeUtils.js";
import {
  CreatePolicyRequestSchema,
  CreatePolicyVersionRequestSchema,
  PolicyListResponseSchema,
  PolicyVersionListResponseSchema,
} from "@warrant/contracts";
import { db } from "../db/index.js";
import {
  createPolicy,
  createPolicyVersion,
  ensureDefaultUser,
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
      const policies = await listPolicies(db);
      const validated = PolicyListResponseSchema.parse({
        policies,
        total: policies.length,
      });
      return reply.status(200).send(validated);
    } catch (err: unknown) {
      request.log.error({ err, requestId }, "Failed to list policies");
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
  fastify.post("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

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
      const ownerId = await ensureDefaultUser(db);
      const createdRecord = await createPolicy(db, parseResult.data, ownerId);
      return reply.status(201).send(createdRecord);
    } catch (err: unknown) {
      request.log.error({ err, requestId }, "Failed to create policy in database");
      return reply.status(500).send({
        error: {
          code: "PERSISTENCE_ERROR",
          message: "Failed to persist policy record in the database.",
        },
        requestId,
      });
    }
  });

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
  fastify.post("/:id/versions", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

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
      const ownerId = await ensureDefaultUser(db);
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
