import { z } from "zod";

/**
 * Canonical enums for Warrant purchase authorization security layer.
 * Directly grounded in docs/API_CONTRACT.md and docs/PROJECT.md.
 */

// 1. Decision
export const DecisionValues = ["ALLOW", "DENY", "REVIEW"] as const;
export const DecisionZodSchema = z.enum(DecisionValues);

export const DecisionSchema = {
  ALLOW: "ALLOW",
  DENY: "DENY",
  REVIEW: "REVIEW",
} as const;

export type Decision = z.infer<typeof DecisionZodSchema>;

// 2. RuleOutcome
export const RuleOutcomeValues = ["PASS", "FAIL", "UNKNOWN"] as const;
export const RuleOutcomeZodSchema = z.enum(RuleOutcomeValues);

export const RuleOutcomeSchema = {
  PASS: "PASS",
  FAIL: "FAIL",
  UNKNOWN: "UNKNOWN",
} as const;

export type RuleOutcome = z.infer<typeof RuleOutcomeZodSchema>;

// 3. FindingSeverity
export const FindingSeverityValues = ["CRITICAL", "HIGH", "MEDIUM", "LOW"] as const;
export const FindingSeverityZodSchema = z.enum(FindingSeverityValues);

export const FindingSeveritySchema = {
  CRITICAL: "CRITICAL",
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
} as const;

export type FindingSeverity = z.infer<typeof FindingSeverityZodSchema>;

// 4. RunStatus
export const RunStatusValues = ["COMPLETED", "INCOMPLETE", "FAILED", "CANCELLED"] as const;
export const RunStatusZodSchema = z.enum(RunStatusValues);

export const RunStatusSchema = {
  COMPLETED: "COMPLETED",
  INCOMPLETE: "INCOMPLETE",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

export type RunStatus = z.infer<typeof RunStatusZodSchema>;

// 5. PaymentStatus
export const PaymentStatusValues = [
  "CREATED",
  "PAYER_ACTION_REQUIRED",
  "APPROVED",
  "CAPTURE_PENDING",
  "CAPTURED",
  "FAILED",
  "CANCELLED",
  "UNKNOWN_REQUIRES_RECONCILIATION",
] as const;
export const PaymentStatusZodSchema = z.enum(PaymentStatusValues);

export const PaymentStatusSchema = {
  CREATED: "CREATED",
  PAYER_ACTION_REQUIRED: "PAYER_ACTION_REQUIRED",
  APPROVED: "APPROVED",
  CAPTURE_PENDING: "CAPTURE_PENDING",
  CAPTURED: "CAPTURED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
  UNKNOWN_REQUIRES_RECONCILIATION: "UNKNOWN_REQUIRES_RECONCILIATION",
} as const;

export type PaymentStatus = z.infer<typeof PaymentStatusZodSchema>;

// 6. ReservationState
export const ReservationStateValues = [
  "NONE",
  "ORDER_CREATION_PENDING",
  "RESERVED",
  "COMMITTED",
  "RELEASED",
  "RECONCILIATION_HOLD",
] as const;
export const ReservationStateZodSchema = z.enum(ReservationStateValues);

export const ReservationStateSchema = {
  NONE: "NONE",
  ORDER_CREATION_PENDING: "ORDER_CREATION_PENDING",
  RESERVED: "RESERVED",
  COMMITTED: "COMMITTED",
  RELEASED: "RELEASED",
  RECONCILIATION_HOLD: "RECONCILIATION_HOLD",
} as const;

export type ReservationState = z.infer<typeof ReservationStateZodSchema>;

// 7. ReasonCode
export const ReasonCodeValues = [
  "ALL_RULES_PASSED",
  "PROHIBITED_CATEGORY",
  "ITEM_PRICE_LIMIT_EXCEEDED",
  "CART_TOTAL_LIMIT_EXCEEDED",
  "LIFETIME_SPEND_LIMIT_EXCEEDED",
  "CURRENCY_MISMATCH",
  "UNKNOWN_CATEGORY",
  "MISSING_CRITICAL_EVIDENCE",
  "STALE_EVIDENCE",
  "EXPIRED_APPROVAL",
  "REVOKED_APPROVAL",
  "POLICY_HASH_MISMATCH",
  "NONCE_REPLAYED",
  "NONCE_EXPIRED",
  "INTERNAL_EVALUATION_ERROR",
] as const;
export const ReasonCodeZodSchema = z.enum(ReasonCodeValues);

export const ReasonCode = {
  ALL_RULES_PASSED: "ALL_RULES_PASSED",
  PROHIBITED_CATEGORY: "PROHIBITED_CATEGORY",
  ITEM_PRICE_LIMIT_EXCEEDED: "ITEM_PRICE_LIMIT_EXCEEDED",
  CART_TOTAL_LIMIT_EXCEEDED: "CART_TOTAL_LIMIT_EXCEEDED",
  LIFETIME_SPEND_LIMIT_EXCEEDED: "LIFETIME_SPEND_LIMIT_EXCEEDED",
  CURRENCY_MISMATCH: "CURRENCY_MISMATCH",
  UNKNOWN_CATEGORY: "UNKNOWN_CATEGORY",
  MISSING_CRITICAL_EVIDENCE: "MISSING_CRITICAL_EVIDENCE",
  STALE_EVIDENCE: "STALE_EVIDENCE",
  EXPIRED_APPROVAL: "EXPIRED_APPROVAL",
  REVOKED_APPROVAL: "REVOKED_APPROVAL",
  POLICY_HASH_MISMATCH: "POLICY_HASH_MISMATCH",
  NONCE_REPLAYED: "NONCE_REPLAYED",
  NONCE_EXPIRED: "NONCE_EXPIRED",
  INTERNAL_EVALUATION_ERROR: "INTERNAL_EVALUATION_ERROR",
} as const;

export type ReasonCodeValue = z.infer<typeof ReasonCodeZodSchema>;
