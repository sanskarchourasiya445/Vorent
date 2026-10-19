/**
 * Canonical enums for Warrant purchase authorization security layer.
 * Directly grounded in docs/API_CONTRACT.md and docs/PROJECT.md.
 */

export const DecisionSchema = {
  ALLOW: "ALLOW",
  DENY: "DENY",
  REVIEW: "REVIEW",
} as const;

export type Decision = (typeof DecisionSchema)[keyof typeof DecisionSchema];

export const RuleOutcomeSchema = {
  PASS: "PASS",
  FAIL: "FAIL",
  UNKNOWN: "UNKNOWN",
} as const;

export type RuleOutcome = (typeof RuleOutcomeSchema)[keyof typeof RuleOutcomeSchema];

export const FindingSeveritySchema = {
  CRITICAL: "CRITICAL",
  HIGH: "HIGH",
  MEDIUM: "MEDIUM",
  LOW: "LOW",
} as const;

export type FindingSeverity = (typeof FindingSeveritySchema)[keyof typeof FindingSeveritySchema];

export const RunStatusSchema = {
  COMPLETED: "COMPLETED",
  INCOMPLETE: "INCOMPLETE",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
} as const;

export type RunStatus = (typeof RunStatusSchema)[keyof typeof RunStatusSchema];

export const PaymentStatusSchema = {
  CREATED: "CREATED",
  PAYER_ACTION_REQUIRED: "PAYER_ACTION_REQUIRED",
  CAPTURE_PENDING: "CAPTURE_PENDING",
  CAPTURED: "CAPTURED",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
  UNKNOWN_REQUIRES_RECONCILIATION: "UNKNOWN_REQUIRES_RECONCILIATION",
} as const;

export type PaymentStatus = (typeof PaymentStatusSchema)[keyof typeof PaymentStatusSchema];

export const ReservationStateSchema = {
  NONE: "NONE",
  ORDER_CREATION_PENDING: "ORDER_CREATION_PENDING",
  RESERVED: "RESERVED",
  COMMITTED: "COMMITTED",
  RELEASED: "RELEASED",
  RECONCILIATION_HOLD: "RECONCILIATION_HOLD",
} as const;

export type ReservationState = (typeof ReservationStateSchema)[keyof typeof ReservationStateSchema];

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

export type ReasonCodeValue = (typeof ReasonCode)[keyof typeof ReasonCode];
