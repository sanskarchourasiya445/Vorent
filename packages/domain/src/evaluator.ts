import {
  type Decision,
  type EvaluatePolicyInput,
  type PolicyEvaluationResult,
  type ReasonCodeValue,
  type RuleEvaluationTrace,
  EvaluatePolicyInputSchema,
  PolicyEvaluationResultSchema,
} from "@warrant/contracts";
import { DENY_REASON_CODES, REVIEW_REASON_CODES, sortReasonCodes } from "./precedence.js";

const EVALUATOR_VERSION = "1.0.0";

/**
 * Pure, deterministic purchase policy evaluator for Warrant.
 *
 * Characteristics:
 * - Strictly zero I/O (no DB, no network, no clock, no filesystem, no LLM).
 * - Integer minor units only for monetary amounts (no floating-point money).
 * - Limits are inclusive (unitPriceMinor <= maxItemPriceMinor is compliant).
 * - Implements strict security precedence: DENY trumps REVIEW.
 * - Guarantee: reasonCodes is non-empty and always contains primaryReasonCode.
 */
export function evaluatePolicy(input: EvaluatePolicyInput): PolicyEvaluationResult {
  try {
    // 1. Validate input schema
    const parsedInput = EvaluatePolicyInputSchema.safeParse(input);
    if (!parsedInput.success) {
      const errorDetails = parsedInput.error.issues
        .map((issue) => `${issue.path.join(".")}: ${issue.message}`)
        .join("; ");

      const fallbackCurrency =
        typeof (input as any)?.policy?.currency === "string" && (input as any).policy.currency.length === 3
          ? (input as any).policy.currency.toUpperCase()
          : typeof (input as any)?.cart?.currency === "string" && (input as any).cart.currency.length === 3
          ? (input as any).cart.currency.toUpperCase()
          : "UNKNOWN";

      const fallbackResult: PolicyEvaluationResult = {
        decision: "REVIEW",
        primaryReasonCode: "MISSING_CRITICAL_EVIDENCE",
        reasonCodes: ["MISSING_CRITICAL_EVIDENCE"],
        ruleTrace: [
          {
            ruleId: "input_schema_validation",
            ruleName: "Input Schema Validation",
            outcome: "UNKNOWN",
            reasonCode: "MISSING_CRITICAL_EVIDENCE",
            message: `Evaluation input failed schema validation: ${errorDetails}`,
          },
        ],
        metadata: {
          evaluatorVersion: EVALUATOR_VERSION,
          itemCount: 0,
          cartTotalMinor: 0,
          currency: fallbackCurrency,
        },
      };

      return PolicyEvaluationResultSchema.parse(fallbackResult);
    }

    const { policy, cart, evidence } = parsedInput.data;
    const traces: RuleEvaluationTrace[] = [];
    const triggeredReasons: ReasonCodeValue[] = [];

    // 2. Check for empty cart
    if (cart.items.length === 0) {
      traces.push({
        ruleId: "empty_cart_check",
        ruleName: "Cart Non-Empty Check",
        outcome: "UNKNOWN",
        reasonCode: "MISSING_CRITICAL_EVIDENCE",
        message: "Cart contains no items to evaluate.",
      });

      return PolicyEvaluationResultSchema.parse({
        decision: "REVIEW",
        primaryReasonCode: "MISSING_CRITICAL_EVIDENCE",
        reasonCodes: ["MISSING_CRITICAL_EVIDENCE"],
        ruleTrace: traces,
        metadata: {
          evaluatorVersion: EVALUATOR_VERSION,
          itemCount: 0,
          cartTotalMinor: 0,
          currency: cart.currency,
        },
      });
    }

    // 3. Currency Match Check (Definite Violation if mismatched)
    let currencyMismatch = false;
    if (cart.currency.toUpperCase() !== policy.currency.toUpperCase()) {
      currencyMismatch = true;
      triggeredReasons.push("CURRENCY_MISMATCH");
      traces.push({
        ruleId: "cart_currency_match",
        ruleName: "Cart Currency Match",
        outcome: "FAIL",
        reasonCode: "CURRENCY_MISMATCH",
        message: `Cart currency '${cart.currency}' does not match policy currency '${policy.currency}'.`,
      });
    }

    for (const item of cart.items) {
      if (item.currency && item.currency.toUpperCase() !== policy.currency.toUpperCase()) {
        currencyMismatch = true;
        triggeredReasons.push("CURRENCY_MISMATCH");
        traces.push({
          ruleId: `item_currency_match_${item.sku}`,
          ruleName: "Item Currency Match",
          outcome: "FAIL",
          reasonCode: "CURRENCY_MISMATCH",
          message: `Item '${item.sku}' currency '${item.currency}' does not match policy currency '${policy.currency}'.`,
        });
        break;
      }
    }

    if (!currencyMismatch) {
      traces.push({
        ruleId: "currency_check",
        ruleName: "Currency Check",
        outcome: "PASS",
        message: `All currencies match policy currency '${policy.currency}'.`,
      });
    }

    // 4. Item-Level Validation & Limits
    let hasProhibitedCategory = false;
    let hasItemPriceLimitExceeded = false;

    const prohibitedSet = new Set(
      (policy.prohibitedCategories ?? [])
        .map((c) => c.toLowerCase().trim())
        .filter((c) => c.length > 0),
    );
    const normalizedAllowed = (policy.allowedCategories ?? [])
      .map((c) => c.toLowerCase().trim())
      .filter((c) => c.length > 0);
    const allowedSet = normalizedAllowed.length > 0 ? new Set(normalizedAllowed) : null;

    let calculatedCartTotalMinor = 0;

    for (const item of cart.items) {
      const itemCategory = item.category.toLowerCase().trim();

      // Quantity check
      if (item.quantity <= 0) {
        triggeredReasons.push("MISSING_CRITICAL_EVIDENCE");
        traces.push({
          ruleId: `item_quantity_${item.sku}`,
          ruleName: "Item Quantity Validity",
          outcome: "UNKNOWN",
          reasonCode: "MISSING_CRITICAL_EVIDENCE",
          message: `Item '${item.sku}' has invalid quantity ${item.quantity}. Quantity must be positive integer.`,
        });
      }

      // Accumulate total using integer minor arithmetic with overflow guards
      const effectiveQty = Math.max(0, item.quantity);
      const itemTotal = item.unitPriceMinor * effectiveQty;

      if (!Number.isSafeInteger(itemTotal) || !Number.isSafeInteger(calculatedCartTotalMinor + itemTotal)) {
        triggeredReasons.push("CART_TOTAL_LIMIT_EXCEEDED");
        traces.push({
          ruleId: `arithmetic_overflow_${item.sku}`,
          ruleName: "Monetary Calculation Overflow",
          outcome: "FAIL",
          reasonCode: "CART_TOTAL_LIMIT_EXCEEDED",
          message: `Cart total calculation exceeded maximum safe integer limit on item '${item.sku}'.`,
        });
        calculatedCartTotalMinor = Number.MAX_SAFE_INTEGER;
      } else {
        calculatedCartTotalMinor += itemTotal;
      }

      // Prohibited categories check
      if (prohibitedSet.has(itemCategory)) {
        hasProhibitedCategory = true;
        triggeredReasons.push("PROHIBITED_CATEGORY");
        traces.push({
          ruleId: `prohibited_category_${item.sku}`,
          ruleName: "Prohibited Category Rule",
          outcome: "FAIL",
          reasonCode: "PROHIBITED_CATEGORY",
          message: `Item '${item.sku}' category '${item.category}' is explicitly prohibited by policy.`,
        });
      } else if (allowedSet && !allowedSet.has(itemCategory)) {
        // Category is not in the explicit allowed list
        hasProhibitedCategory = true;
        triggeredReasons.push("PROHIBITED_CATEGORY");
        traces.push({
          ruleId: `unallowed_category_${item.sku}`,
          ruleName: "Allowed Categories Rule",
          outcome: "FAIL",
          reasonCode: "PROHIBITED_CATEGORY",
          message: `Item '${item.sku}' category '${item.category}' is not in policy allowed categories list.`,
        });
      }

      // Unknown category check
      const isUnknownInEvidence = evidence?.unknownCategories?.some(
        (uc) => uc.toLowerCase().trim() === itemCategory,
      );
      if (itemCategory === "unknown" || isUnknownInEvidence) {
        triggeredReasons.push("UNKNOWN_CATEGORY");
        traces.push({
          ruleId: `unknown_category_${item.sku}`,
          ruleName: "Category Classification Check",
          outcome: "UNKNOWN",
          reasonCode: "UNKNOWN_CATEGORY",
          message: `Item '${item.sku}' category '${item.category}' is unknown or unverified.`,
        });
      }

      // Inclusive Item Price Limit Check
      if (policy.maxItemPriceMinor !== undefined) {
        if (item.unitPriceMinor > policy.maxItemPriceMinor) {
          hasItemPriceLimitExceeded = true;
          triggeredReasons.push("ITEM_PRICE_LIMIT_EXCEEDED");
          traces.push({
            ruleId: `max_item_price_${item.sku}`,
            ruleName: "Item Price Ceiling",
            outcome: "FAIL",
            reasonCode: "ITEM_PRICE_LIMIT_EXCEEDED",
            message: `Item '${item.sku}' unit price ${item.unitPriceMinor} exceeds inclusive limit of ${policy.maxItemPriceMinor}.`,
          });
        }
      }
    }

    // Record PASS traces for item-level checks if clean
    if (!hasProhibitedCategory) {
      traces.push({
        ruleId: "prohibited_categories_check",
        ruleName: "Prohibited Categories Check",
        outcome: "PASS",
        message: "No prohibited categories found in cart items.",
      });
    }

    if (policy.maxItemPriceMinor !== undefined && !hasItemPriceLimitExceeded) {
      traces.push({
        ruleId: "item_price_limit_check",
        ruleName: "Item Price Ceiling Check",
        outcome: "PASS",
        message: `All item unit prices are within inclusive limit of ${policy.maxItemPriceMinor}.`,
      });
    }

    // 5. Whole-Cart Spending Ceiling Check (Inclusive)
    if (policy.maxCartTotalMinor !== undefined) {
      if (calculatedCartTotalMinor > policy.maxCartTotalMinor) {
        triggeredReasons.push("CART_TOTAL_LIMIT_EXCEEDED");
        traces.push({
          ruleId: "cart_total_limit",
          ruleName: "Cart Total Ceiling",
          outcome: "FAIL",
          reasonCode: "CART_TOTAL_LIMIT_EXCEEDED",
          message: `Cart total ${calculatedCartTotalMinor} exceeds inclusive limit of ${policy.maxCartTotalMinor}.`,
        });
      } else {
        traces.push({
          ruleId: "cart_total_limit",
          ruleName: "Cart Total Ceiling",
          outcome: "PASS",
          message: `Cart total ${calculatedCartTotalMinor} is within inclusive limit of ${policy.maxCartTotalMinor}.`,
        });
      }
    }

    // 6. Evidence Sufficiency & Freshness Check
    if (policy.requireEvidence) {
      if (!evidence || evidence.evidenceComplete !== true || evidence.quotesVerified !== true) {
        triggeredReasons.push("MISSING_CRITICAL_EVIDENCE");
        traces.push({
          ruleId: "evidence_completeness",
          ruleName: "Evidence Completeness Check",
          outcome: "UNKNOWN",
          reasonCode: "MISSING_CRITICAL_EVIDENCE",
          message: !evidence
            ? "Policy requires merchant evidence verification, but no evidence snapshot was provided."
            : "Critical merchant quote evidence or price verification is incomplete or unverified.",
        });
      }
    } else if (evidence) {
      if (evidence.evidenceComplete === false || evidence.quotesVerified === false) {
        triggeredReasons.push("MISSING_CRITICAL_EVIDENCE");
        traces.push({
          ruleId: "evidence_completeness",
          ruleName: "Evidence Completeness Check",
          outcome: "UNKNOWN",
          reasonCode: "MISSING_CRITICAL_EVIDENCE",
          message: "Critical merchant quote evidence or price verification is incomplete or unverified.",
        });
      }
    }

    if (evidence) {
      if (evidence.stale === true) {
        triggeredReasons.push("STALE_EVIDENCE");
        traces.push({
          ruleId: "evidence_freshness",
          ruleName: "Evidence Freshness Check",
          outcome: "UNKNOWN",
          reasonCode: "STALE_EVIDENCE",
          message: "Merchant quote or evidence snapshot is stale.",
        });
      }

      if (evidence.staleCategories && evidence.staleCategories.length > 0) {
        const staleSet = new Set(evidence.staleCategories.map((sc) => sc.toLowerCase().trim()));
        for (const item of cart.items) {
          if (staleSet.has(item.category.toLowerCase().trim())) {
            triggeredReasons.push("STALE_EVIDENCE");
            traces.push({
              ruleId: `evidence_stale_category_${item.sku}`,
              ruleName: "Category Evidence Freshness",
              outcome: "UNKNOWN",
              reasonCode: "STALE_EVIDENCE",
              message: `Evidence for category '${item.category}' on item '${item.sku}' is stale.`,
            });
            break;
          }
        }
      }
    }

    // 7. Decision Resolution and Precedence Ordering
    // Sort triggered reasons deterministically
    const sortedReasons = sortReasonCodes(triggeredReasons);

    let decision: Decision;
    let finalReasonCodes: ReasonCodeValue[];
    let primaryReasonCode: ReasonCodeValue;

    const hasDenyReason = sortedReasons.some((code) => DENY_REASON_CODES.has(code));
    const hasReviewReason = sortedReasons.some((code) => REVIEW_REASON_CODES.has(code));

    if (hasDenyReason) {
      // DENY trumps REVIEW when both coexist
      decision = "DENY";
      finalReasonCodes = sortedReasons;
      // Primary reason is guaranteed to be the highest-precedence DENY reason
      primaryReasonCode = sortedReasons.find((code) => DENY_REASON_CODES.has(code))!;
    } else if (hasReviewReason) {
      decision = "REVIEW";
      finalReasonCodes = sortedReasons;
      // Primary reason is guaranteed to be the highest-precedence REVIEW reason
      primaryReasonCode = sortedReasons.find((code) => REVIEW_REASON_CODES.has(code))!;
    } else {
      // Compliant cart
      decision = "ALLOW";
      finalReasonCodes = ["ALL_RULES_PASSED"];
      primaryReasonCode = "ALL_RULES_PASSED";
      traces.push({
        ruleId: "evaluation_summary",
        ruleName: "Policy Evaluation Summary",
        outcome: "PASS",
        reasonCode: "ALL_RULES_PASSED",
        message: "All policy rules and constraints satisfied.",
      });
    }

    const result: PolicyEvaluationResult = {
      decision,
      primaryReasonCode,
      reasonCodes: finalReasonCodes,
      ruleTrace: traces,
      metadata: {
        evaluatorVersion: EVALUATOR_VERSION,
        itemCount: cart.items.length,
        cartTotalMinor: calculatedCartTotalMinor,
        currency: policy.currency,
      },
    };

    // Validate output conforming to shared contract before returning
    return PolicyEvaluationResultSchema.parse(result);
  } catch (err) {
    // Unhandled exception fallback: fail-safely into REVIEW with internal evaluation error
    const safeErrorResult: PolicyEvaluationResult = {
      decision: "REVIEW",
      primaryReasonCode: "INTERNAL_EVALUATION_ERROR",
      reasonCodes: ["INTERNAL_EVALUATION_ERROR"],
      ruleTrace: [
        {
          ruleId: "evaluator_internal_exception",
          ruleName: "Evaluator Exception Handler",
          outcome: "FAIL",
          reasonCode: "INTERNAL_EVALUATION_ERROR",
          message: `Unhandled evaluator exception: ${err instanceof Error ? err.message : String(err)}`,
        },
      ],
      metadata: {
        evaluatorVersion: EVALUATOR_VERSION,
        itemCount: 0,
        cartTotalMinor: 0,
        currency: "UNKNOWN",
      },
    };
    return safeErrorResult;
  }
}
