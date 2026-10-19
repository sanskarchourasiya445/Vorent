import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "node:crypto";
import {
  CompileIntentRequestSchema,
  ComputeDiffRequestSchema,
  CreatePolicyRequestSchema,
  CreatePolicyVersionRequestSchema,
  PolicyListResponseSchema,
  PolicyVersionListResponseSchema,
  RerunWitnessesResponseSchema,
  type VerificationFinding,
  type WitnessEvaluationResult,
} from "@warrant/contracts";
import {
  compileIntent,
  computePolicyDiff,
  evaluatePolicy,
  proposePolicyRepair,
} from "@warrant/domain";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { policies } from "../db/schema.js";
import {
  createPolicy,
  createPolicyVersion,
  ensureDefaultUser,
  getPolicyVersion,
  listPolicies,
  listPolicyVersions,
} from "../db/repositories/policyRepository.js";
import {
  getFinding,
  getVerificationRun,
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

  // 6. POST /api/policies/compile & POST /api/policies/draft-compile - Natural Language Intent Compilation
  const handleCompile = async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    const parseResult = CompileIntentRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      const issueSummary = parseResult.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: `Invalid intent compilation payload: ${issueSummary}`,
        },
        requestId,
      });
    }

    try {
      const compiled = compileIntent(parseResult.data);
      return reply.status(200).send(compiled);
    } catch (err: unknown) {
      request.log.error({ err, requestId }, "Failed to compile purchase intent");
      return reply.status(500).send({
        error: {
          code: "INTERNAL_ERROR",
          message: "An internal error occurred during intent compilation.",
        },
        requestId,
      });
    }
  };

  fastify.post("/compile", handleCompile);
  fastify.post("/draft-compile", handleCompile);

  // 7. POST /api/policies/diff - Semantic Policy Diffing
  fastify.post("/diff", async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    const parseResult = ComputeDiffRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      const issueSummary = parseResult.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ");
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: `Invalid diff request payload: ${issueSummary}`,
        },
        requestId,
      });
    }

    try {
      const diff = computePolicyDiff(parseResult.data.sourcePolicy, parseResult.data.targetPolicy, {
        sourceVersionId: parseResult.data.sourceVersionId,
        targetPolicyHash: undefined,
      });
      return reply.status(200).send(diff);
    } catch (err: unknown) {
      request.log.error({ err, requestId }, "Failed to compute policy diff");
      return reply.status(500).send({
        error: {
          code: "INTERNAL_ERROR",
          message: "An internal error occurred while computing policy diff.",
        },
        requestId,
      });
    }
  });

  // 8. POST /api/policies/:id/compile - Intent Compilation for Existing Policy
  fastify.post("/:id/compile", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    const { id } = request.params;
    let mandateText = (request.body as any)?.mandateText;

    if (!mandateText) {
      try {
        const rows = await db
          .select({ sourceMandate: policies.sourceMandate, name: policies.name })
          .from(policies)
          .where(eq(policies.id, id))
          .limit(1);
        if (rows.length > 0 && rows[0]?.sourceMandate) {
          mandateText = rows[0].sourceMandate;
        }
      } catch {
        // Fall through
      }
    }

    if (!mandateText) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "Mandate text is required in request body or existing policy.",
        },
        requestId,
      });
    }

    try {
      const compiled = compileIntent({
        mandateText,
        currency: (request.body as any)?.currency,
        policyId: id,
      });
      return reply.status(200).send(compiled);
    } catch (err: unknown) {
      request.log.error({ err, requestId, id }, "Failed to compile intent for policy");
      return reply.status(500).send({
        error: {
          code: "INTERNAL_ERROR",
          message: "An internal error occurred during intent compilation.",
        },
        requestId,
      });
    }
  });

  // 9. GET /api/policies/:id/versions/:vid/diff - Semantic Diff for Version
  fastify.get(
    "/:id/versions/:vid/diff",
    async (
      request: FastifyRequest<{ Params: { id: string; vid: string }; Querystring: { againstVersionId?: string } }>,
      reply: FastifyReply,
    ) => {
      const requestId = extractRequestId(request);
      reply.header("x-request-id", requestId);

      const { id, vid } = request.params;
      const { againstVersionId } = request.query;

      try {
        const currentVersion = await getPolicyVersion(db, vid);
        if (!currentVersion) {
          return reply.status(404).send({
            error: {
              code: "POLICY_NOT_FOUND",
              message: `Policy version '${vid}' was not found.`,
            },
            requestId,
          });
        }

        let compareVersion: any = null;
        if (againstVersionId) {
          compareVersion = await getPolicyVersion(db, againstVersionId);
          if (!compareVersion) {
            return reply.status(404).send({
              error: {
                code: "POLICY_NOT_FOUND",
                message: `Comparison policy version '${againstVersionId}' was not found.`,
              },
              requestId,
            });
          }
        } else {
          // Look for previous version
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
          if (isUuid) {
            const allVersions = await listPolicyVersions(db, id);
            const currentIndex = allVersions.findIndex((v) => v.id === vid || v.versionNumber === currentVersion.versionNumber);
            if (currentIndex >= 0 && currentIndex < allVersions.length - 1) {
              compareVersion = allVersions[currentIndex + 1];
            }
          }
        }

        if (!compareVersion) {
          const initialDiff = computePolicyDiff(
            { schemaVersion: "1.0", currency: currentVersion.policyDocument.currency },
            currentVersion.policyDocument,
            {
              sourceVersionId: undefined,
              targetPolicyHash: currentVersion.policyHash,
            },
          );
          return reply.status(200).send(initialDiff);
        }

        const diff = computePolicyDiff(compareVersion.policyDocument, currentVersion.policyDocument, {
          sourceVersionId: compareVersion.id,
          sourcePolicyHash: compareVersion.policyHash,
          targetPolicyHash: currentVersion.policyHash,
        });
        return reply.status(200).send(diff);
      } catch (err: unknown) {
        request.log.error({ err, requestId, id, vid }, "Failed to compute version diff");
        return reply.status(500).send({
          error: {
            code: "INTERNAL_ERROR",
            message: "An internal error occurred while computing version diff.",
          },
          requestId,
        });
      }
    },
  );

  // 10. POST /api/policies/propose-repair & POST /api/policies/:id/propose-repair - Automated Policy Repair
  const handleProposeRepair = async (
    request: FastifyRequest<{ Params?: { id?: string } }>,
    reply: FastifyReply,
  ) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    const body = (request.body ?? {}) as any;
    const policyVersionId = body.policyVersionId || request.params?.id;

    if (!policyVersionId) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "policyVersionId is required to propose a policy repair.",
        },
        requestId,
      });
    }

    try {
      const version = await getPolicyVersion(db, policyVersionId);
      if (!version) {
        return reply.status(404).send({
          error: {
            code: "POLICY_NOT_FOUND",
            message: `Policy version '${policyVersionId}' was not found.`,
          },
          requestId,
        });
      }

      let findingsList: VerificationFinding[] = body.findings ?? [];
      if (findingsList.length === 0 && body.testRunId) {
        const runDetail = await getVerificationRun(db, body.testRunId);
        if (runDetail && runDetail.report && runDetail.report.findings) {
          findingsList = runDetail.report.findings;
        } else {
          const dbFindings = await listFindings(db, { testRunId: body.testRunId });
          findingsList = dbFindings.map((f) => ({
            findingId: f.id,
            fingerprint: `fp-${f.id}`,
            severity: f.severity,
            violationType: f.findingType as any,
            title: `Finding ${f.id}`,
            description: `Violation of type ${f.findingType}`,
            candidateCart: f.witness,
            evidence: f.evidenceSnapshot as any,
            expectedOutcome: { decision: "DENY" as const },
            actualOutcome: {
              decision: "ALLOW" as const,
              primaryReasonCode: "ALL_RULES_PASSED" as const,
              reasonCodes: ["ALL_RULES_PASSED" as const],
              ruleTrace: [],
              evaluatedAt: f.createdAt,
            },
            reproduction: { candidateIndex: 0, summary: "Reproduce finding" },
            resolutionStatus: f.status,
          }));
        }
      }

      const repairResponse = proposePolicyRepair({
        originalPolicy: version.policyDocument,
        originalIntent: version.intentSpec,
        findings: findingsList,
        instructions: body.instructions,
        sourceVersionId: version.id,
      });

      return reply.status(200).send(repairResponse);
    } catch (err: unknown) {
      request.log.error({ err, requestId, policyVersionId }, "Failed to propose policy repair");
      return reply.status(500).send({
        error: {
          code: "INTERNAL_ERROR",
          message: "An internal error occurred while proposing policy repair.",
        },
        requestId,
      });
    }
  };

  fastify.post("/propose-repair", handleProposeRepair);
  fastify.post("/:id/propose-repair", handleProposeRepair);

  // 11. POST /api/policies/rerun-witnesses, POST /api/policies/:id/rerun-witnesses & POST /api/policies/:id/versions/:vid/rerun-witnesses
  // Witness Cart Re-evaluation & Regression Testing (FR-008)
  const handleRerunWitnesses = async (
    request: FastifyRequest<{ Params?: { id?: string; vid?: string } }>,
    reply: FastifyReply,
  ) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    const body = (request.body ?? {}) as any;
    const policyVersionId = request.params?.vid || body.policyVersionId || request.params?.id;

    if (!policyVersionId) {
      return reply.status(400).send({
        error: {
          code: "VALIDATION_ERROR",
          message: "policyVersionId is required to re-run witness carts.",
        },
        requestId,
      });
    }

    try {
      const version = await getPolicyVersion(db, policyVersionId);
      if (!version) {
        return reply.status(404).send({
          error: {
            code: "POLICY_NOT_FOUND",
            message: `Policy version '${policyVersionId}' was not found.`,
          },
          requestId,
        });
      }

      // Collect witness findings to evaluate
      let findingsToEvaluate: any[] = [];
      if (Array.isArray(body.findingIds) && body.findingIds.length > 0) {
        for (const fId of body.findingIds) {
          const f = await getFinding(db, fId);
          if (f) {
            findingsToEvaluate.push(f);
          }
        }
      } else if (Array.isArray(body.findings) && body.findings.length > 0) {
        findingsToEvaluate = body.findings;
      } else {
        // Find prior findings for this policy
        let candidateFindings = await listFindings(db, { policyVersionId: version.id });
        if (candidateFindings.length === 0 && version.policyId) {
          const allVersions = await listPolicyVersions(db, version.policyId);
          for (const v of allVersions) {
            if (v.id !== version.id) {
              const prevFindings = await listFindings(db, { policyVersionId: v.id });
              candidateFindings.push(...prevFindings);
            }
          }
        }
        findingsToEvaluate = candidateFindings;
      }

      const results: WitnessEvaluationResult[] = [];
      let resolvedCount = 0;
      let unresolvedCount = 0;

      for (const finding of findingsToEvaluate) {
        const witnessCart = finding.witness ?? finding.candidateCart;
        if (!witnessCart) continue;

        const evidence = finding.evidenceSnapshot ?? finding.evidence ?? {
          quotesVerified: true,
          evidenceComplete: true,
        };

        const evalResult = evaluatePolicy({
          policy: version.policyDocument,
          cart: witnessCart,
          evidence,
        });

        const currentDecision = evalResult.decision;
        const currentReasonCodes = evalResult.reasonCodes;
        const previousDecision =
          finding.actualOutcome?.decision ??
          (finding.findingType === "FALSE_POSITIVE_ALLOW" ? "ALLOW" : "ALLOW");
        const expectedDecision =
          finding.expectedOutcome?.decision ??
          (previousDecision === "ALLOW" ? "DENY" : "ALLOW");

        let outcome: "RESOLVED" | "STILL_FAILING" | "REGRESSION" | "UNCHANGED";
        let explanation: string;

        if (currentDecision === expectedDecision) {
          outcome = "RESOLVED";
          explanation = `Defect resolved: policy now evaluates witness cart to expected decision '${expectedDecision}' with reason [${currentReasonCodes.join(", ")}].`;
          resolvedCount++;
          if (finding.id && typeof finding.id === "string") {
            try {
              await resolveFinding(db, finding.id, version.id, explanation);
            } catch {
              // Best-effort DB update
            }
          }
        } else if (currentDecision === previousDecision) {
          outcome = "STILL_FAILING";
          explanation = `Defect persists: policy continues to evaluate witness cart to '${currentDecision}' with reason [${currentReasonCodes.join(", ")}].`;
          unresolvedCount++;
        } else if (previousDecision !== "ALLOW" && currentDecision === "ALLOW" && expectedDecision !== "ALLOW") {
          outcome = "REGRESSION";
          explanation = `Regression detected: witness cart was previously '${previousDecision}' but is now unexpectedly '${currentDecision}'.`;
          unresolvedCount++;
        } else {
          if (currentDecision !== "ALLOW" && expectedDecision === "DENY") {
            outcome = "RESOLVED";
            explanation = `Defect resolved: policy evaluated to non-ALLOW '${currentDecision}' with reason [${currentReasonCodes.join(", ")}].`;
            resolvedCount++;
          } else {
            outcome = "STILL_FAILING";
            explanation = `Defect unresolved: policy evaluated to '${currentDecision}' instead of expected '${expectedDecision}'.`;
            unresolvedCount++;
          }
        }

        results.push({
          findingId: finding.id || finding.findingId || `witness-${results.length + 1}`,
          witnessCart,
          previousDecision,
          currentDecision,
          currentReasonCodes,
          outcome,
          explanation,
        });
      }

      const responsePayload = RerunWitnessesResponseSchema.parse({
        policyVersionId: version.id,
        policyHash: version.policyHash,
        totalWitnesses: results.length,
        resolvedCount,
        unresolvedCount,
        results,
      });

      return reply.status(200).send(responsePayload);
    } catch (err: unknown) {
      request.log.error({ err, requestId, policyVersionId }, "Failed to rerun witness evaluations");
      return reply.status(500).send({
        error: {
          code: "INTERNAL_ERROR",
          message: "An internal error occurred while re-evaluating witness carts.",
        },
        requestId,
      });
    }
  };

  fastify.post("/rerun-witnesses", handleRerunWitnesses);
  fastify.post("/:id/rerun-witnesses", handleRerunWitnesses);
  fastify.post("/:id/versions/:vid/rerun-witnesses", handleRerunWitnesses);
};

