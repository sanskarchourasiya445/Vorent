import { ReasonCode, type ReasonCodeValue } from "@warrant/contracts";

export interface FormattedReason {
  code: string;
  headline: string;
  description: string;
}

/**
 * Deterministic presentation dictionary mapping canonical backend reason codes
 * to operator-facing headlines and honest explanations.
 */
const REASON_DICTIONARY: Record<ReasonCodeValue, { headline: string; description: string }> = {
  [ReasonCode.ALL_RULES_PASSED]: {
    headline: "All Evaluated Constraints Satisfied",
    description:
      "All deterministic policy constraints passed. This confirms proposal compliance with the approved policy; it does not constitute proof of universal safety.",
  },
  [ReasonCode.PROHIBITED_CATEGORY]: {
    headline: "Prohibited Category Detected",
    description:
      "Item belongs to a category explicitly prohibited by the approved purchasing policy.",
  },
  [ReasonCode.ITEM_PRICE_LIMIT_EXCEEDED]: {
    headline: "Item Price Limit Exceeded",
    description:
      "An item price exceeds the maximum allowable per-item limit defined in the policy.",
  },
  [ReasonCode.CART_TOTAL_LIMIT_EXCEEDED]: {
    headline: "Cart Total Limit Exceeded",
    description:
      "The aggregate cart price exceeds the maximum single-transaction limit defined in the policy.",
  },
  [ReasonCode.LIFETIME_SPEND_LIMIT_EXCEEDED]: {
    headline: "Lifetime Spend Limit Exceeded",
    description:
      "This transaction would exceed the remaining authorized lifetime spending budget.",
  },
  [ReasonCode.CURRENCY_MISMATCH]: {
    headline: "Currency Mismatch",
    description:
      "The proposed transaction currency does not match the ISO currency code mandated by the policy.",
  },
  [ReasonCode.UNKNOWN_CATEGORY]: {
    headline: "Unverified Product Category",
    description:
      "The product category could not be verified against trusted catalog classifications; manual review is required.",
  },
  [ReasonCode.MISSING_CRITICAL_EVIDENCE]: {
    headline: "Missing Critical Evidence",
    description:
      "Required product attributes or merchant evidence were not supplied in the proposal payload.",
  },
  [ReasonCode.STALE_EVIDENCE]: {
    headline: "Stale Product Evidence",
    description:
      "The catalog evidence has exceeded freshness limits established by the policy constraints.",
  },
  [ReasonCode.EXPIRED_APPROVAL]: {
    headline: "Policy Approval Expired",
    description:
      "The explicit user approval associated with this policy version has passed its expiration timestamp.",
  },
  [ReasonCode.REVOKED_APPROVAL]: {
    headline: "Policy Approval Revoked",
    description:
      "The approval record authorizing this policy version has been explicitly revoked by the owner.",
  },
  [ReasonCode.POLICY_HASH_MISMATCH]: {
    headline: "Policy Hash Mismatch",
    description:
      "The proposal was compiled against a policy version whose SHA-256 hash does not match the active approved hash.",
  },
  [ReasonCode.NONCE_REPLAYED]: {
    headline: "Replayed Checkout Nonce",
    description:
      "The single-use checkout authorization nonce has already been consumed; replay attempts fail closed.",
  },
  [ReasonCode.NONCE_EXPIRED]: {
    headline: "Expired Checkout Nonce",
    description:
      "The single-use checkout authorization nonce has exceeded its time-to-live window.",
  },
  [ReasonCode.INTERNAL_EVALUATION_ERROR]: {
    headline: "Internal Evaluation Error",
    description:
      "An unexpected failure occurred in the deterministic rule engine; the gate failed closed.",
  },
};

/**
 * Normalizes legacy or doc-variant reason code strings to canonical dictionary keys.
 */
const REASON_CODE_ALIASES: Record<string, ReasonCodeValue> = {
  CATEGORY_PROHIBITED: ReasonCode.PROHIBITED_CATEGORY,
  CATEGORY_UNKNOWN: ReasonCode.UNKNOWN_CATEGORY,
  EVIDENCE_INSUFFICIENT: ReasonCode.MISSING_CRITICAL_EVIDENCE,
  EVIDENCE_STALE: ReasonCode.STALE_EVIDENCE,
  ITEM_PRICE_EXCEEDED: ReasonCode.ITEM_PRICE_LIMIT_EXCEEDED,
  CART_TOTAL_EXCEEDED: ReasonCode.CART_TOTAL_LIMIT_EXCEEDED,
  BUDGET_EXCEEDED: ReasonCode.LIFETIME_SPEND_LIMIT_EXCEEDED,
};

/**
 * Transforms a raw SCREAMING_SNAKE_CASE string into a clean Title Case string.
 */
function toTitleCase(snakeStr: string): string {
  return snakeStr
    .toLowerCase()
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");
}

/**
 * Formats a backend reason code into a human-readable headline and description.
 * Always returns a valid, safe FormattedReason object even for unknown codes.
 */
export function formatReasonCode(code: string | ReasonCodeValue): FormattedReason {
  if (!code || typeof code !== "string") {
    return {
      code: "UNKNOWN",
      headline: "Unspecified Evaluation Result",
      description: "No reason code was supplied by the evaluation engine.",
    };
  }

  // Check direct canonical match
  if (code in REASON_DICTIONARY) {
    const entry = REASON_DICTIONARY[code as ReasonCodeValue];
    return {
      code,
      headline: entry.headline,
      description: entry.description,
    };
  }

  // Check historical doc alias match
  if (code in REASON_CODE_ALIASES) {
    const canonicalKey = REASON_CODE_ALIASES[code];
    const entry = REASON_DICTIONARY[canonicalKey];
    return {
      code,
      headline: entry.headline,
      description: entry.description,
    };
  }

  // Graceful fallback for unknown / forward-compatible reason codes
  return {
    code,
    headline: toTitleCase(code),
    description: `Unrecognized reason code returned by evaluator: ${code}. Evaluation failed closed.`,
  };
}
