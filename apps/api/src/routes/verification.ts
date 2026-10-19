import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "node:crypto";
import {
  type ConfirmedIntent,
  type PolicyDocument,
  type SearchDimension,
  type SearchSpaceDefinition,
  type VerificationReport,
  type VerificationRequest,
  PresetVerificationRequestSchema,
  VerificationReportSchema,
  VerificationRequestSchema,
} from "@warrant/contracts";
import { verifyPolicy } from "@warrant/domain";

export const SERVER_BOUNDS = {
  DEFAULT_MAX_CANDIDATES: 500,
  MAX_SERVER_CANDIDATES: 2000,
  MIN_CANDIDATES: 1,
  DEFAULT_TIMEOUT_MS: 5000,
  MAX_SERVER_TIMEOUT_MS: 10000,
  MIN_TIMEOUT_MS: 1,
} as const;

export interface PolicyPreset {
  id: string;
  name: string;
  version: string;
  hash: string;
  policy: PolicyDocument;
  intent: ConfirmedIntent;
  defaultCategories: string[];
  defaultPricePointsMinor: number[];
}

export const POLICY_PRESETS: Record<string, PolicyPreset> = {
  pol_v1_books_hardware: {
    id: "pol_v1_books_hardware",
    name: "Engineering Hardware & Technical Books Policy",
    version: "1.0.0",
    hash: "a4f912b7e53c4d89a290bc9812efaa43217d8900fe5b81a91e5d7a810b45cd2e",
    policy: {
      schemaVersion: "1.0",
      currency: "USD",
      maxItemPriceMinor: 25000, // $250.00
      maxCartTotalMinor: 60000, // $600.00
      allowedCategories: ["Hardware", "Reference Books", "Peripherals"],
      prohibitedCategories: ["Weapons / Lasers", "Adult", "Gift Cards"],
      requireEvidence: true,
    },
    intent: {
      name: "Engineering Hardware & Technical Books Mandate",
      currency: "USD",
      maxItemPriceMinor: 25000,
      maxCartTotalMinor: 60000,
      allowedCategories: ["Hardware", "Reference Books", "Peripherals"],
      prohibitedCategories: ["Weapons / Lasers", "Adult", "Gift Cards"],
      requireEvidence: true,
    },
    defaultCategories: ["Hardware", "Reference Books", "Peripherals"],
    defaultPricePointsMinor: [15000, 24900, 25000, 25100, 30000],
  },
  pol_v2_strict_peripherals: {
    id: "pol_v2_strict_peripherals",
    name: "Strict Ergonomic Peripherals Mandate",
    version: "2.1.0-draft",
    hash: "8e71fa480cb12da970392bc13d5a42099fbc9018e4726d1b8207f901abcf8912",
    policy: {
      schemaVersion: "1.0",
      currency: "USD",
      maxItemPriceMinor: 15000, // $150.00
      maxCartTotalMinor: 30000, // $300.00
      allowedCategories: ["Ergonomic Peripherals", "Monitors", "Keypads"],
      prohibitedCategories: ["Gaming", "Entertainment"],
      requireEvidence: true,
    },
    intent: {
      name: "Strict Ergonomic Peripherals Mandate",
      currency: "USD",
      maxItemPriceMinor: 15000,
      maxCartTotalMinor: 30000,
      allowedCategories: ["Ergonomic Peripherals", "Monitors", "Keypads"],
      prohibitedCategories: ["Gaming", "Entertainment"],
      requireEvidence: true,
    },
    defaultCategories: ["Ergonomic Peripherals", "Monitors", "Keypads"],
    defaultPricePointsMinor: [8000, 14900, 15000, 15100, 20000],
  },
  pol_seeded_defect_unbounded_cart: {
    id: "pol_seeded_defect_unbounded_cart",
    name: "Defective Policy: Whole-Cart Spending Limit Omitted",
    version: "1.0.0-flawed",
    hash: "b7e4521098acdf512345678901234567890abcdef1234567890abcdef1234567",
    policy: {
      schemaVersion: "1.0",
      currency: "USD",
      maxItemPriceMinor: 25000, // $250.00 item ceiling set
      // maxCartTotalMinor is intentionally omitted to discover CART_TOTAL_LIMIT_EXCEEDED counterexample
      allowedCategories: ["Hardware", "Reference Books"],
      prohibitedCategories: ["Gift Cards"],
      requireEvidence: true,
    },
    intent: {
      name: "Mandate with Whole-Cart Cap of $600",
      currency: "USD",
      maxItemPriceMinor: 25000,
      maxCartTotalMinor: 60000, // $600.00 whole-cart ceiling
      allowedCategories: ["Hardware", "Reference Books"],
      prohibitedCategories: ["Gift Cards"],
      requireEvidence: true,
    },
    defaultCategories: ["Hardware", "Reference Books"],
    defaultPricePointsMinor: [22000, 25000], // 3 items @ $220.00 = $660.00 > $600.00
  },
};

export function buildSearchSpaceForPreset(
  preset: PolicyPreset,
  dimensions: SearchDimension[] = ["PRICE_BOUNDARIES"],
): SearchSpaceDefinition {
  const categories = [...preset.defaultCategories];
  if (dimensions.includes("CATEGORY_EVASION")) {
    if (preset.intent.prohibitedCategories) {
      categories.push(...preset.intent.prohibitedCategories);
    }
    categories.push("Office Furnishing / Ergonomics");
  }

  const pricePointsMinor = [...preset.defaultPricePointsMinor];
  if (dimensions.includes("PRICE_BOUNDARIES") && preset.intent.maxItemPriceMinor) {
    const limit = preset.intent.maxItemPriceMinor;
    pricePointsMinor.push(Math.max(0, limit - 100), limit, limit + 100);
  }

  const quantities = dimensions.includes("QUANTITY_SPLITS") ? [1, 2, 3] : [1];
  const maxItemsPerCart = dimensions.includes("QUANTITY_SPLITS") ? 2 : 1;
  const currencies = dimensions.includes("CURRENCY_MUTATION")
    ? ["USD", "EUR"]
    : [preset.policy.currency];
  const evidenceVariations: ("COMPLETE" | "MISSING" | "STALE")[] = dimensions.includes("EVIDENCE_FRESHNESS")
    ? ["COMPLETE", "STALE", "MISSING"]
    : ["COMPLETE"];

  return {
    domainVersion: "1.0.0",
    categories: Array.from(new Set(categories.filter((c) => Boolean(c) && c.trim().length > 0))),
    pricePointsMinor: Array.from(new Set(pricePointsMinor.filter((p) => p >= 0))),
    quantities,
    currencies,
    maxItemsPerCart,
    evidenceVariations,
  };
}

function extractRequestId(request: FastifyRequest): string {
  const headerId = request.headers["x-request-id"];
  if (typeof headerId === "string" && headerId.trim().length > 0) {
    return headerId.trim();
  }
  return request.id || `req_${randomUUID()}`;
}

export const verificationRoutes: FastifyPluginAsync = async (fastify) => {
  // Handler for verification run
  const handleVerificationRun = async (request: FastifyRequest, reply: FastifyReply) => {
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
      const preset = POLICY_PRESETS[presetData.policyVersionId];
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
    try {
      const report: VerificationReport = verifyPolicy(verificationRequest);

      // Validate outgoing report against contract schema
      const validated = VerificationReportSchema.parse(report);
      return reply.status(200).send(validated);
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
  };

  // POST /run
  fastify.post("/run", handleVerificationRun);

  // POST / (convenience if prefix contains /run or if mounted directly)
  fastify.post("/", handleVerificationRun);
};
