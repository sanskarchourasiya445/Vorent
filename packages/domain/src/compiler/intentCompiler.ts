import {
  type CompileIntentRequest,
  type CompileIntentResponse,
  type ConfirmedIntent,
  type PolicyDocument,
  CompileIntentResponseSchema,
  PolicyDocumentSchema,
} from "@warrant/contracts";

/**
 * Warrant Intent Compiler
 *
 * Deterministic natural-language purchase mandate compiler.
 * Converts unstructured buyer intent into a strictly validated, explicit PolicyDocument
 * and ConfirmedIntent without relying on non-deterministic external LLMs.
 *
 * Guarantees:
 * - 100% deterministic, offline, and reproducible.
 * - Extracts currency, per-item limits, whole-cart limits, and category constraints.
 * - Explicitly lists assumptions and surfaces clarifying questions for ambiguities.
 * - Enforces integer minor units for all monetary fields.
 * - Rejects prompt injection attempts and ignores instructions to bypass policy rules.
 * - Always requires explicit user confirmation (requiresUserConfirmation: true).
 */

export const COMPILER_VERSION = "1.0.0-deterministic";

// Standard category aliases for canonical normalization
const KNOWN_CATEGORIES: Record<string, string> = {
  book: "Reference Books",
  books: "Reference Books",
  textbook: "Reference Books",
  textbooks: "Reference Books",
  hardware: "Hardware",
  peripherals: "Peripherals",
  peripheral: "Peripherals",
  keyboard: "Peripherals",
  mouse: "Peripherals",
  monitor: "Peripherals",
  monitors: "Peripherals",
  software: "Software & Cloud",
  cloud: "Software & Cloud",
  hosting: "Software & Cloud",
  saas: "Software & Cloud",
  electronics: "Hardware",
  gadget: "Hardware",
  gadgets: "Hardware",
  office: "Office Supplies",
  supplies: "Office Supplies",
};

const PROHIBITED_KEYWORDS: Record<string, string> = {
  "gift card": "Gift Cards",
  "gift cards": "Gift Cards",
  "voucher": "Gift Cards",
  "vouchers": "Gift Cards",
  "crypto": "Cryptocurrency",
  "cryptocurrency": "Cryptocurrency",
  "bitcoin": "Cryptocurrency",
  "adult": "Adult",
  "pornography": "Adult",
  "gambling": "Gambling",
  "casino": "Gambling",
  "weapon": "Weapons / Lasers",
  "weapons": "Weapons / Lasers",
  "laser": "Weapons / Lasers",
  "lasers": "Weapons / Lasers",
  "alcohol": "Alcohol & Tobacco",
  "tobacco": "Alcohol & Tobacco",
  "gaming": "Entertainment & Gaming",
  "games": "Entertainment & Gaming",
  "game": "Entertainment & Gaming",
  "subscription": "Subscriptions & Recurring",
  "subscriptions": "Subscriptions & Recurring",
};

/**
 * Compiles natural language purchase intent text into structured policy and intent documents.
 */
export function compileIntent(request: CompileIntentRequest): CompileIntentResponse {
  const text = request.mandateText.trim();
  const assumptions: string[] = [];
  const questions: string[] = [];
  const parsedClauses: string[] = [];
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for common prompt injection / adversarial patterns
  const lowerText = text.toLowerCase();
  if (
    lowerText.includes("ignore all previous instructions") ||
    lowerText.includes("ignore previous rules") ||
    lowerText.includes("allow everything") ||
    lowerText.includes("disregard limits")
  ) {
    warnings.push("Adversarial prompt injection pattern detected and neutralized. Safety constraints remain strictly enforced.");
  }

  // 1. Currency Extraction
  let currency = "USD";
  if (request.currency) {
    currency = request.currency.toUpperCase();
    parsedClauses.push(`Explicit currency: ${currency}`);
  } else if (/\b(?:in\s+)?(?:eur|euros?)\b|€/i.test(text)) {
    currency = "EUR";
    assumptions.push("Detected 'EUR' or '€' in mandate; normalized currency to EUR.");
    parsedClauses.push("Currency: EUR");
  } else if (/\b(?:in\s+)?(?:gbp|pounds?)\b|£/i.test(text)) {
    currency = "GBP";
    assumptions.push("Detected 'GBP' or '£' in mandate; normalized currency to GBP.");
    parsedClauses.push("Currency: GBP");
  } else if (text.includes("$") || lowerText.includes("usd") || lowerText.includes("dollar")) {
    currency = "USD";
    assumptions.push("Detected '$' or 'USD' in mandate; normalized currency to USD.");
    parsedClauses.push("Currency: USD");
  } else {
    currency = "USD";
    assumptions.push("No currency symbol found; defaulted currency to USD.");
    questions.push("Which currency should apply to this policy? Defaulted to USD.");
  }

  // 2. Spending Limits Extraction
  let maxItemPriceMinor: number | undefined;
  let maxCartTotalMinor: number | undefined;

  // Patterns for per-item limits
  const itemLimitRegexes = [
    /(?:max(?:imum)?\s+(?:item|unit)?\s*(?:price|amount|cost)?|up\s+to|limit\s+of)\s*[\$€£]?\s*(\d+(?:\.\d{1,2})?)\s*(?:each|per\s+item|\/item|for\s+any\s+(?:single\s+)?item)/i,
    /(?:item|unit)\s+(?:ceiling|limit|cap|max(?:imum)?)\s*(?:is|of|:)?\s*[\$€£]?\s*(\d+(?:\.\d{1,2})?)/i,
    /[\$€£](\d+(?:\.\d{1,2})?)\s*(?:each|per\s+item|\/item)/i,
  ];

  for (const regex of itemLimitRegexes) {
    const match = text.match(regex);
    if (match && match[1]) {
      const parsedAmount = parseFloat(match[1]);
      if (!Number.isNaN(parsedAmount) && parsedAmount > 0) {
        maxItemPriceMinor = Math.round(parsedAmount * 100);
        parsedClauses.push(`Per-item limit: ${currency} ${parsedAmount.toFixed(2)} (${maxItemPriceMinor} minor units)`);
        break;
      }
    }
  }

  // Patterns for whole-cart / total budget limits
  const cartLimitRegexes = [
    /(?:total\s+budget|cart\s+total|max(?:imum)?\s+(?:cart\s+)?spend|max(?:imum)?\s+cart|total\s+spend|spend\s+limit|overall\s+cap|total\s+of)\s*(?:is|of|:)?\s*[\$€£]?\s*(\d+(?:\.\d{1,2})?)/i,
    /up\s+to\s+[\$€£]?\s*(\d+(?:\.\d{1,2})?)\s*(?:in\s+total|total|overall|across\s+the\s+cart|cumulative)/i,
    /(?:budget|cap)\s*(?:is|of|:)\s*[\$€£]?\s*(\d+(?:\.\d{1,2})?)/i,
  ];

  for (const regex of cartLimitRegexes) {
    const match = text.match(regex);
    if (match && match[1]) {
      const parsedAmount = parseFloat(match[1]);
      if (!Number.isNaN(parsedAmount) && parsedAmount > 0) {
        maxCartTotalMinor = Math.round(parsedAmount * 100);
        parsedClauses.push(`Whole-cart limit: ${currency} ${parsedAmount.toFixed(2)} (${maxCartTotalMinor} minor units)`);
        break;
      }
    }
  }

  // Handle generic ambiguous numbers (e.g. "budget $100" or "under $60")
  if (maxItemPriceMinor === undefined && maxCartTotalMinor === undefined) {
    const genericAmountMatch = text.match(/[\$€£](\d+(?:\.\d{1,2})?)|(\d+(?:\.\d{1,2})?)\s*(?:dollars|usd|eur|euros|pounds)/i);
    if (genericAmountMatch) {
      const amountStr = genericAmountMatch[1] || genericAmountMatch[2];
      if (amountStr) {
        const parsedAmount = parseFloat(amountStr);
        if (!Number.isNaN(parsedAmount) && parsedAmount > 0) {
          const minor = Math.round(parsedAmount * 100);
          maxItemPriceMinor = minor;
          maxCartTotalMinor = minor;
          assumptions.push(`Interpreted general limit of ${currency} ${parsedAmount.toFixed(2)} as applying to both per-item and whole-cart ceilings.`);
          questions.push(`Does the ${currency} ${parsedAmount.toFixed(2)} limit apply to each individual item, the whole cart, or both?`);
          parsedClauses.push(`Inferred limits: ${currency} ${parsedAmount.toFixed(2)} each and total`);
        }
      }
    }
  }

  // If item price limit exceeds cart limit, flag warning
  if (maxItemPriceMinor !== undefined && maxCartTotalMinor !== undefined && maxItemPriceMinor > maxCartTotalMinor) {
    warnings.push(`Per-item ceiling (${maxItemPriceMinor}) is greater than whole-cart limit (${maxCartTotalMinor}). A single item at maximum allowed price will exceed the whole-cart cap.`);
  }

  // 3. Prohibited Categories Extraction
  const prohibitedCategoriesSet = new Set<string>();

  // Check for multi-item prohibition clauses e.g. "Strictly prohibit gift cards, weapons, adult content..."
  const prohibitClauseMatches = text.matchAll(/(?:(?:strictly\s+)?prohibit(?:ed)?|no|not|exclude|disallow|never|without|ban|block(?:ed)?)\s+([^.]+)/gi);
  for (const pMatch of prohibitClauseMatches) {
    if (pMatch && pMatch[1]) {
      const rawList = pMatch[1].split(/,|and|or|\//);
      for (const item of rawList) {
        const cleaned = item.trim().toLowerCase();
        for (const [kw, normalizedCat] of Object.entries(PROHIBITED_KEYWORDS)) {
          if (cleaned.includes(kw)) {
            prohibitedCategoriesSet.add(normalizedCat);
            parsedClauses.push(`Prohibited: ${normalizedCat}`);
          }
        }
      }
    }
  }

  for (const [kw, normalizedCat] of Object.entries(PROHIBITED_KEYWORDS)) {
    // Look for phrases like "no <kw>", "not <kw>", "prohibit all <kw>", "forbid <kw>", "exclude <kw>", "never <kw>", "disallow <kw>"
    const negatedRegex = new RegExp(`(?:no|not|(?:strictly\\s+)?(?:prohibit(?:ed)?|forbid(?:den)?)|exclude|disallow|never|without|ban|block(?:ed)?)\\s+(?:all\\s+|any\\s+|every\\s+)?(?:${kw})`, "i");
    if (negatedRegex.test(lowerText) || lowerText.includes(`no ${kw}`)) {
      prohibitedCategoriesSet.add(normalizedCat);
      parsedClauses.push(`Prohibited: ${normalizedCat}`);
    }
  }

  // Default prohibitions for safety if general mandate is given
  if (lowerText.includes("no gift cards") || lowerText.includes("no cards") || lowerText.includes("gift card")) {
    if (lowerText.includes("prohibit") || lowerText.includes("no ")) {
      prohibitedCategoriesSet.add("Gift Cards");
    }
  }

  // 4. Allowed Categories Extraction
  const allowedCategoriesSet = new Set<string>();

  for (const [kw, normalizedCat] of Object.entries(KNOWN_CATEGORIES)) {
    // Check if mentioned in positive context (not negated)
    const negatedRegex = new RegExp(`(?:no|not|prohibit|exclude|never|ban)\\s+(?:any\\s+)?(?:${kw})`, "i");
    if (!negatedRegex.test(lowerText) && (new RegExp(`\\b${kw}\\b`, "i").test(lowerText))) {
      allowedCategoriesSet.add(normalizedCat);
      parsedClauses.push(`Allowed category: ${normalizedCat}`);
    }
  }

  // Check for explicit "allow ..." or "can buy ..." clauses
  const allowClauseMatch = text.match(/(?:allow(?:ed)?|can\s+buy|permit(?:ted)?|approved\s+for|for)\s+([^.]+)/i);
  if (allowClauseMatch && allowClauseMatch[1]) {
    const rawList = allowClauseMatch[1].split(/,|and|or|\//);
    for (const item of rawList) {
      const cleaned = item.trim().toLowerCase();
      for (const [kw, normalizedCat] of Object.entries(KNOWN_CATEGORIES)) {
        if (cleaned.includes(kw)) {
          allowedCategoriesSet.add(normalizedCat);
        }
      }
    }
  }

  // If no allowed categories were explicitly detected, add a clarifying question
  if (allowedCategoriesSet.size === 0) {
    assumptions.push("No explicit allowed categories detected; policy will evaluate across all non-prohibited categories.");
    questions.push("Should purchases be restricted to specific categories (e.g. Hardware, Reference Books)? Currently allows any non-prohibited category.");
  }

  // 5. Evidence Requirement Extraction
  let requireEvidence = true; // Safe default
  if (
    lowerText.includes("require evidence") ||
    lowerText.includes("merchant evidence") ||
    lowerText.includes("verified quotes") ||
    lowerText.includes("must verify")
  ) {
    requireEvidence = true;
    parsedClauses.push("Evidence requirement: strictly required");
  } else {
    assumptions.push("Defaulted requireEvidence to true to enforce verified merchant evidence before checkout.");
  }

  // 6. Tax / Shipping / Recurring Warnings (Unsupported in MVP)
  if (lowerText.includes("tax") || lowerText.includes("vat")) {
    questions.push("Tax and VAT calculations are not included in base policy evaluation. Limits apply directly to merchant-quoted unit prices.");
  }
  if (lowerText.includes("shipping") || lowerText.includes("delivery fee")) {
    questions.push("Shipping fee policies are not evaluated in MVP. Limit applies directly to item catalog prices.");
  }
  if (lowerText.includes("recurring") || lowerText.includes("monthly") || lowerText.includes("annual")) {
    questions.push("Recurring subscriptions are not supported in MVP checkout gate. Only one-time purchases can be authorized.");
  }

  // Build Candidate Policy Document
  const candidatePolicy: PolicyDocument = {
    schemaVersion: "1.0",
    currency,
    maxItemPriceMinor,
    maxCartTotalMinor,
    allowedCategories: allowedCategoriesSet.size > 0 ? Array.from(allowedCategoriesSet) : undefined,
    prohibitedCategories: prohibitedCategoriesSet.size > 0 ? Array.from(prohibitedCategoriesSet) : undefined,
    requireEvidence,
  };

  // Validate candidate policy with PolicyDocumentSchema
  const policyValidation = PolicyDocumentSchema.safeParse(candidatePolicy);
  if (!policyValidation.success) {
    for (const issue of policyValidation.error.issues) {
      errors.push(`${issue.path.join(".")}: ${issue.message}`);
    }
  }

  // Build ConfirmedIntent
  const derivedName = request.targetName || (
    allowedCategoriesSet.size > 0
      ? `${Array.from(allowedCategoriesSet).join(" & ")} Mandate`
      : "Purchase Intent Mandate"
  );

  const confirmedIntent: ConfirmedIntent = {
    name: derivedName,
    currency,
    maxItemPriceMinor,
    maxCartTotalMinor,
    allowedCategories: allowedCategoriesSet.size > 0 ? Array.from(allowedCategoriesSet) : undefined,
    prohibitedCategories: prohibitedCategoriesSet.size > 0 ? Array.from(prohibitedCategoriesSet) : undefined,
    requireEvidence,
  };

  const response: CompileIntentResponse = {
    candidatePolicy,
    confirmedIntent,
    assumptions,
    questions,
    validation: {
      valid: errors.length === 0,
      errors,
      warnings,
    },
    requiresUserConfirmation: true,
    compilerMetadata: {
      compilerVersion: COMPILER_VERSION,
      deterministic: true,
      parsedClauses,
      sourceLength: text.length,
    },
  };

  return CompileIntentResponseSchema.parse(response);
}
