import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { extractRequestId, isDbConnectionError } from "./routeUtils.js";
import {
  type VerificationReport,
  type VerificationRequest,
  PresetVerificationRequestSchema,
  VerificationReportSchema,
  VerificationRequestSchema,
} from "@warrant/contracts";
import { verifyPolicy } from "@warrant/domain";
import {
  CANONICAL_POLICY_PRESETS,
  type CanonicalPolicyPreset,
  buildSearchSpaceForPreset as buildCanonicalSearchSpace,
} from "@warrant/test-fixtures";
import { db } from "../db/index.js";
import {
  getPolicyVersion,
  ensureDefaultUser,
  resolveOrCreatePresetVersion,
} from "../db/repositories/policyRepository.js";
import {
  saveVerificationRun,
  listVerificationRuns,
  getVerificationRun,
  listFindings,
} from "../db/repositories/verificationRunRepository.js";

export const SERVER_BOUNDS = {
  DEFAULT_MAX_CANDIDATES: 500,
  MAX_SERVER_CANDIDATES: 2000,
  MIN_CANDIDATES: 1,
  DEFAULT_TIMEOUT_MS: 5000,
  MAX_SERVER_TIMEOUT_MS: 10000,
  MIN_TIMEOUT_MS: 1,
} as const;

export type PolicyPreset = CanonicalPolicyPreset;
export const POLICY_PRESETS: Record<string, PolicyPreset> = CANONICAL_POLICY_PRESETS;
export const buildSearchSpaceForPreset = buildCanonicalSearchSpace;

export const verificationRoutes: FastifyPluginAsync = async (fastify) => {
  // Handler for verification run
  const handleVerificationRun = async (request: FastifyRequest, reply: FastifyReply, persistRun: boolean = false) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    const body = request.body;
    if (!body || typeof body !== "object") {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request body must be a non-empty JSON object.",
        },
        requestId,
      });
    }

    let verificationRequest: VerificationRequest;

    // Branch 1: Explicit VerificationRequest payload with policy and search space
    if ("policy" in body || "searchSpace" in body) {
      const parsed = VerificationRequestSchema.safeParse(body);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
          .join("; ");

        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: `Verification request schema validation failed: ${issues}`,
          },
          requestId,
        });
      }

      const reqData = parsed.data;
      const rawCandidates = reqData.config?.maxCandidates ?? SERVER_BOUNDS.DEFAULT_MAX_CANDIDATES;
      const rawTimeout = reqData.config?.timeoutMs ?? SERVER_BOUNDS.DEFAULT_TIMEOUT_MS;

      const serverMaxCandidates = Math.max(
        SERVER_BOUNDS.MIN_CANDIDATES,
        Math.min(rawCandidates, SERVER_BOUNDS.MAX_SERVER_CANDIDATES),
      );
      const serverTimeoutMs = Math.max(
        SERVER_BOUNDS.MIN_TIMEOUT_MS,
        Math.min(rawTimeout, SERVER_BOUNDS.MAX_SERVER_TIMEOUT_MS),
      );

      verificationRequest = {
        policy: reqData.policy,
        intent: reqData.intent,
        searchSpace: reqData.searchSpace,
        config: {
          ...reqData.config,
          maxCandidates: serverMaxCandidates,
          timeoutMs: serverTimeoutMs,
        },
      };
    }
    // Branch 2: Preset-referenced verification request
    else if ("policyVersionId" in body) {
      const parsed = PresetVerificationRequestSchema.safeParse(body);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
          .join("; ");

        return reply.status(400).send({
          error: {
            code: "VALIDATION_ERROR",
            message: `Preset verification request schema validation failed: ${issues}`,
          },
          requestId,
        });
      }

      const presetData = parsed.data;
      let preset = POLICY_PRESETS[presetData.policyVersionId];

      if (!preset) {
        // Try looking up dynamic policy version from database
        try {
          const dbVersion = await getPolicyVersion(db, presetData.policyVersionId);
          if (dbVersion) {
            preset = {
              id: dbVersion.id,
              name: dbVersion.name,
              version: String(dbVersion.versionNumber),
              hash: dbVersion.policyHash,
              description: dbVersion.name,
              limitsSummary: `Version ${dbVersion.versionNumber}`,
              policy: dbVersion.policyDocument,
              policyDocument: dbVersion.policyDocument,
              intent: dbVersion.intentSpec,
              defaultCategories: dbVersion.policyDocument.allowedCategories ?? ["General"],
              defaultPricePointsMinor: [
                Math.floor((dbVersion.policyDocument.maxItemPriceMinor ?? 10000) * 0.5),
                dbVersion.policyDocument.maxItemPriceMinor ?? 10000,
              ],
            };
          }
        } catch {
          // If DB lookup fails, continue to not found check
        }
      }

      if (!preset) {
        return reply.status(404).send({
          error: {
            code: "POLICY_NOT_FOUND",
            message: `Policy version '${presetData.policyVersionId}' was not found.`,
          },
          requestId,
        });
      }

      const searchSpace = buildSearchSpaceForPreset(preset, presetData.dimensions);
      const requestedBudget =
        presetData.candidateBudget ?? presetData.maxCandidates ?? SERVER_BOUNDS.DEFAULT_MAX_CANDIDATES;
      const requestedTimeout = presetData.timeoutMs ?? SERVER_BOUNDS.DEFAULT_TIMEOUT_MS;

      const serverMaxCandidates = Math.max(
        SERVER_BOUNDS.MIN_CANDIDATES,
        Math.min(requestedBudget, SERVER_BOUNDS.MAX_SERVER_CANDIDATES),
      );
      const serverTimeoutMs = Math.max(
        SERVER_BOUNDS.MIN_TIMEOUT_MS,
        Math.min(requestedTimeout, SERVER_BOUNDS.MAX_SERVER_TIMEOUT_MS),
      );

      verificationRequest = {
        policy: preset.policy,
        intent: preset.intent,
        searchSpace,
        config: {
          maxCandidates: serverMaxCandidates,
          timeoutMs: serverTimeoutMs,
          stopOnFirstFinding: presetData.stopOnFirstFinding ?? false,
          policyVersionId: preset.id,
          policyHash: presetData.policyHash ?? preset.hash,
        },
      };
    } else {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Request must specify either an explicit 'policy' object or a recognized 'policyVersionId'.",
        },
        requestId,
      });
    }

    // Execute deterministic bounded verification
    let report: VerificationReport;
    try {
      report = verifyPolicy(verificationRequest);
    } catch (err: unknown) {
      request.log.error({ err, requestId }, "Deterministic verification execution error");
      return reply.status(500).send({
        error: {
          code: "INTERNAL_ERROR",
          message: "An internal error occurred during policy verification.",
        },
        requestId,
      });
    }

    // Validate outgoing report against contract schema
    const validated = VerificationReportSchema.parse(report);

    // Save to database if persistence is requested
    if (persistRun || (request.query as any)?.persist === "true") {
      try {
        const ownerId = await ensureDefaultUser(db);
        let targetPolicyVersionId = verificationRequest.config?.policyVersionId || "unknown";
        let targetPolicyHash = verificationRequest.config?.policyHash || validated.policyHash;

        // If targetPolicyVersionId is a preset ID or not a valid UUID, resolve to its persisted DB UUID
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetPolicyVersionId);
        if (!isUuid || POLICY_PRESETS[targetPolicyVersionId]) {
          const resolved = await resolveOrCreatePresetVersion(db, targetPolicyVersionId, ownerId);
          if (resolved) {
            targetPolicyVersionId = resolved.id;
            targetPolicyHash = resolved.policyHash;
          }
        }

        const reportToSave = {
          ...validated,
          policyVersionId: targetPolicyVersionId,
          policyHash: targetPolicyHash,
        };

        const savedRun = await saveVerificationRun(db, {
          ownerId,
          policyVersionId: targetPolicyVersionId,
          policyHash: targetPolicyHash,
          request: verificationRequest,
          report: reportToSave,
        });

        return reply.status(201).send({
          run: savedRun,
          report: reportToSave,
        });
      } catch (err: unknown) {
        request.log.error({ err, requestId }, "Failed to persist verification run to database");
        return reply.status(500).send({
          error: {
            code: "PERSISTENCE_ERROR",
            message: "Failed to persist verification run to database.",
          },
          requestId,
        });
      }
    }

    return reply.status(200).send(validated);
  };

  // GET /runs - List recent saved verification runs
  fastify.get("/runs", async (request: FastifyRequest<{ Querystring: { policyVersionId?: string; limit?: string } }>, reply: FastifyReply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    try {
      const limit = request.query?.limit ? parseInt(request.query.limit, 10) : 50;
      const runs = await listVerificationRuns(db, {
        policyVersionId: request.query?.policyVersionId,
        limit: Number.isNaN(limit) ? 50 : limit,
      });

      return reply.status(200).send({
        runs,
        total: runs.length,
      });
    } catch (err: unknown) {
      if (isDbConnectionError(err)) {
        request.log.warn({ err, requestId }, "Database unavailable when listing verification runs");
        return reply.status(503).send({
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "Persistence store is currently unavailable.",
          },
          requestId,
        });
      }
      request.log.error({ err, requestId }, "Failed to list verification runs");
      return reply.status(500).send({
        error: {
          code: "INTERNAL_ERROR",
          message: "An internal error occurred while listing verification runs.",
        },
        requestId,
      });
    }
  });

  // GET /runs/:id - Retrieve specific saved verification run
  fastify.get("/runs/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    const { id } = request.params;
    try {
      const run = await getVerificationRun(db, id);
      if (!run) {
        return reply.status(404).send({
          error: {
            code: "RUN_NOT_FOUND",
            message: `Verification run '${id}' was not found.`,
          },
          requestId,
        });
      }

      return reply.status(200).send(run);
    } catch (err: unknown) {
      if (isDbConnectionError(err)) {
        request.log.warn({ err, requestId, id }, "Database unavailable when retrieving verification run");
        return reply.status(503).send({
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "Persistence store is currently unavailable.",
          },
          requestId,
        });
      }
      request.log.error({ err, requestId, id }, "Failed to retrieve verification run");
      return reply.status(500).send({
        error: {
          code: "INTERNAL_ERROR",
          message: "An internal error occurred while retrieving verification run.",
        },
        requestId,
      });
    }
  });

  // GET /runs/:id/findings - List findings for a specific verification run
  fastify.get("/runs/:id/findings", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    const { id } = request.params;
    try {
      const findingsList = await listFindings(db, { testRunId: id });
      return reply.status(200).send({
        testRunId: id,
        findings: findingsList,
        total: findingsList.length,
      });
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
      request.log.error({ err, requestId, id }, "Failed to list findings for run");
      return reply.status(500).send({
        error: {
          code: "INTERNAL_ERROR",
          message: "An internal error occurred while retrieving run findings.",
        },
        requestId,
      });
    }
  });

  // POST /runs - Execute and persist verification run
  fastify.post("/runs", (request, reply) => handleVerificationRun(request, reply, true));

  // POST /run - Pure execution (Phase 3 contract)
  fastify.post("/run", (request, reply) => handleVerificationRun(request, reply, false));

  // POST / (convenience alias)
  fastify.post("/", (request, reply) => handleVerificationRun(request, reply, false));
};
