import type { ReasonCodeValue } from "@warrant/contracts";

/**
 * Deterministic severity precedence for reason codes.
 * Definite policy violations (DENY) strictly precede review conditions (REVIEW),
 * which strictly precede success baseline (ALLOW).
 */
export const REASON_CODE_SEVERITY_ORDER: readonly ReasonCodeValue[] = [
  // 1. Definite Policy Violations & Security Preconditions (DENY)
  "PROHIBITED_CATEGORY",
  "ITEM_PRICE_LIMIT_EXCEEDED",
  "CART_TOTAL_LIMIT_EXCEEDED",
  "LIFETIME_SPEND_LIMIT_EXCEEDED",
  "CURRENCY_MISMATCH",
  "POLICY_HASH_MISMATCH",
  "EXPIRED_APPROVAL",
  "REVOKED_APPROVAL",
  "NONCE_REPLAYED",
  "NONCE_EXPIRED",

  // 2. Review Reasons & Ambiguity (REVIEW)
  "UNKNOWN_CATEGORY",
  "MISSING_CRITICAL_EVIDENCE",
  "STALE_EVIDENCE",
  "INTERNAL_EVALUATION_ERROR",

  // 3. Success Baseline (ALLOW)
  "ALL_RULES_PASSED",
] as const;

export const DENY_REASON_CODES: ReadonlySet<ReasonCodeValue> = new Set([
  "PROHIBITED_CATEGORY",
  "ITEM_PRICE_LIMIT_EXCEEDED",
  "CART_TOTAL_LIMIT_EXCEEDED",
  "LIFETIME_SPEND_LIMIT_EXCEEDED",
  "CURRENCY_MISMATCH",
  "POLICY_HASH_MISMATCH",
  "EXPIRED_APPROVAL",
  "REVOKED_APPROVAL",
  "NONCE_REPLAYED",
  "NONCE_EXPIRED",
]);

export const REVIEW_REASON_CODES: ReadonlySet<ReasonCodeValue> = new Set([
  "UNKNOWN_CATEGORY",
  "MISSING_CRITICAL_EVIDENCE",
  "STALE_EVIDENCE",
  "INTERNAL_EVALUATION_ERROR",
]);

/**
 * Sorts reason codes deterministically according to backend security severity precedence.
 * Removes duplicates and ensures DENY reasons precede REVIEW reasons.
 */
export function sortReasonCodes(reasons: readonly ReasonCodeValue[]): ReasonCodeValue[] {
  const unique = Array.from(new Set(reasons));
  return unique.sort((a, b) => {
    const indexA = REASON_CODE_SEVERITY_ORDER.indexOf(a);
    const indexB = REASON_CODE_SEVERITY_ORDER.indexOf(b);
    const orderA = indexA === -1 ? 999 : indexA;
    const orderB = indexB === -1 ? 999 : indexB;
    return orderA - orderB;
  });
}
