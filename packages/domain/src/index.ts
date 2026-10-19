/**
 * @warrant/domain
 * Pure deterministic domain rules, policy evaluation, canonicalization, and budget calculations.
 */

export const DOMAIN_PHASE = "Phase 2 Bounded Verification Engine";

export * from "./evaluator.js";
export * from "./precedence.js";
export * from "./search/candidateGenerator.js";
export * from "./verification/fingerprint.js";
export * from "./verification/policyHash.js";
export * from "./verification/verifier.js";
export * from "./compiler/intentCompiler.js";
export * from "./repair/policyDiff.js";
export * from "./repair/policyRepairer.js";

