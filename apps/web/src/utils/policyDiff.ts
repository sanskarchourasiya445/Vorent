import type { PolicyDocument } from "@warrant/contracts";

export type ImpactSeverity = "CRITICAL" | "HIGH" | "MODERATE" | "LOW" | "IDENTICAL";

export interface PolicyRuleDiff {
  field: string;
  label: string;
  baseDisplay: string;
  targetDisplay: string;
  baseRaw?: unknown;
  targetRaw?: unknown;
  changed: boolean;
  severity: ImpactSeverity;
  reverificationTrigger: boolean;
  notes?: string;
}

export interface PolicyDiffComparison {
  identical: boolean;
  reverificationRequired: boolean;
  overallSeverity: ImpactSeverity;
  baseId: string;
  targetId: string;
  baseName: string;
  targetName: string;
  baseHash?: string;
  targetHash?: string;
  ruleDiffs: PolicyRuleDiff[];
  criticalTriggers: string[];
  reverificationReasons: string[];
  summary: string;
}

export interface PolicyComparisonInput {
  id: string;
  name?: string;
  version?: string;
  hash?: string;
  policyHash?: string;
  policyDocument: PolicyDocument;
}

function formatCents(minor: number | undefined | null, currency: string = "USD"): string {
  if (minor === undefined || minor === null) {
    return "UNBOUNDED (No Limit)";
  }
  const dollars = (minor / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${currency} $${dollars}`;
}

function formatCategories(cats: string[] | undefined | null): string {
  if (!cats || cats.length === 0) {
    return "None (Unrestricted)";
  }
  return cats.join(", ");
}

/**
 * Computes deterministic differences between two policy versions and assesses
 * whether changes introduce risk or mandate re-verification.
 */
export function computePolicyDiff(
  base: PolicyComparisonInput,
  target: PolicyComparisonInput,
): PolicyDiffComparison {
  const baseDoc = base.policyDocument;
  const targetDoc = target.policyDocument;
  const baseHash = base.hash || base.policyHash;
  const targetHash = target.hash || target.policyHash;

  const ruleDiffs: PolicyRuleDiff[] = [];
  const criticalTriggers: string[] = [];
  const reverificationReasons: string[] = [];

  // 1. Currency
  const baseCurrency = baseDoc.currency || "USD";
  const targetCurrency = targetDoc.currency || "USD";
  const currencyChanged = baseCurrency !== targetCurrency;
  if (currencyChanged) {
    criticalTriggers.push(`Currency changed from ${baseCurrency} to ${targetCurrency}`);
    reverificationReasons.push("Monetary limits are defined in a different currency.");
  }
  ruleDiffs.push({
    field: "currency",
    label: "Currency",
    baseDisplay: baseCurrency,
    targetDisplay: targetCurrency,
    baseRaw: baseCurrency,
    targetRaw: targetCurrency,
    changed: currencyChanged,
    severity: currencyChanged ? "CRITICAL" : "IDENTICAL",
    reverificationTrigger: currencyChanged,
    notes: currencyChanged ? "Currency shift invalidates all prior monetary thresholds" : undefined,
  });

  // 2. Whole-Cart Spending Cap (maxCartTotalMinor)
  const baseCartCap = baseDoc.maxCartTotalMinor;
  const targetCartCap = targetDoc.maxCartTotalMinor;
  const cartCapChanged = baseCartCap !== targetCartCap;
  let cartCapSeverity: ImpactSeverity = "IDENTICAL";
  let cartCapTrigger = false;
  let cartCapNotes: string | undefined;

  if (cartCapChanged) {
    cartCapTrigger = true;
    if (baseCartCap !== undefined && targetCartCap === undefined) {
      cartCapSeverity = "CRITICAL";
      cartCapNotes = "Whole-cart spending cap was REMOVED (Unbounded cart loophole risk).";
      criticalTriggers.push("Whole-cart spending cap removed (now UNBOUNDED)");
      reverificationReasons.push(
        "Cart-level limit is unbounded; multiple purchases could bypass individual item constraints.",
      );
    } else if (
      baseCartCap !== undefined &&
      targetCartCap !== undefined &&
      targetCartCap > baseCartCap
    ) {
      cartCapSeverity = "HIGH";
      cartCapNotes = `Cart spending limit relaxed by +$${((targetCartCap - baseCartCap) / 100).toFixed(2)}`;
      criticalTriggers.push(
        `Cart spending limit increased from ${formatCents(baseCartCap, baseCurrency)} to ${formatCents(targetCartCap, targetCurrency)}`,
      );
      reverificationReasons.push("Increased cart total ceiling requires re-verification against intent.");
    } else if (baseCartCap === undefined && targetCartCap !== undefined) {
      cartCapSeverity = "MODERATE";
      cartCapNotes = `Tightened: Added whole-cart spending limit of ${formatCents(targetCartCap, targetCurrency)}`;
      reverificationReasons.push("Added new cart spending ceiling; requires updated cryptographic approval.");
    } else {
      cartCapSeverity = "MODERATE";
      cartCapNotes = `Tightened: Cart limit lowered from ${formatCents(baseCartCap, baseCurrency)} to ${formatCents(targetCartCap, targetCurrency)}`;
      reverificationReasons.push("Lowered cart limit creates a new policy hash requiring approval.");
    }
  }

  ruleDiffs.push({
    field: "maxCartTotalMinor",
    label: "Whole-Cart Spending Cap",
    baseDisplay: formatCents(baseCartCap, baseCurrency),
    targetDisplay: formatCents(targetCartCap, targetCurrency),
    baseRaw: baseCartCap,
    targetRaw: targetCartCap,
    changed: cartCapChanged,
    severity: cartCapSeverity,
    reverificationTrigger: cartCapTrigger,
    notes: cartCapNotes,
  });

  // 3. Single-Item Price Ceiling (maxItemPriceMinor)
  const baseItemPrice = baseDoc.maxItemPriceMinor;
  const targetItemPrice = targetDoc.maxItemPriceMinor;
  const itemPriceChanged = baseItemPrice !== targetItemPrice;
  let itemPriceSeverity: ImpactSeverity = "IDENTICAL";
  let itemPriceTrigger = false;
  let itemPriceNotes: string | undefined;

  if (itemPriceChanged) {
    itemPriceTrigger = true;
    if (baseItemPrice !== undefined && targetItemPrice === undefined) {
      itemPriceSeverity = "CRITICAL";
      itemPriceNotes = "Single-item price ceiling was REMOVED.";
      criticalTriggers.push("Single-item price ceiling removed (unrestricted item price)");
      reverificationReasons.push("Single items can now be ordered at arbitrary price points.");
    } else if (
      baseItemPrice !== undefined &&
      targetItemPrice !== undefined &&
      targetItemPrice > baseItemPrice
    ) {
      itemPriceSeverity = "HIGH";
      itemPriceNotes = `Item ceiling raised by +$${((targetItemPrice - baseItemPrice) / 100).toFixed(2)}`;
      criticalTriggers.push(
        `Single-item limit increased from ${formatCents(baseItemPrice, baseCurrency)} to ${formatCents(targetItemPrice, targetCurrency)}`,
      );
      reverificationReasons.push("Higher item ceiling allows higher-cost items to be ordered.");
    } else {
      itemPriceSeverity = "MODERATE";
      itemPriceNotes = `Tightened: Item limit reduced from ${formatCents(baseItemPrice, baseCurrency)} to ${formatCents(targetItemPrice, targetCurrency)}`;
      reverificationReasons.push("Item ceiling tightened; requires updated cryptographic approval.");
    }
  }

  ruleDiffs.push({
    field: "maxItemPriceMinor",
    label: "Single-Item Price Limit",
    baseDisplay: formatCents(baseItemPrice, baseCurrency),
    targetDisplay: formatCents(targetItemPrice, targetCurrency),
    baseRaw: baseItemPrice,
    targetRaw: targetItemPrice,
    changed: itemPriceChanged,
    severity: itemPriceSeverity,
    reverificationTrigger: itemPriceTrigger,
    notes: itemPriceNotes,
  });

  // 4. Prohibited Categories (Set diff)
  const baseProhibited = new Set(baseDoc.prohibitedCategories || []);
  const targetProhibited = new Set(targetDoc.prohibitedCategories || []);
  const removedProhibited = [...baseProhibited].filter((c) => !targetProhibited.has(c));
  const addedProhibited = [...targetProhibited].filter((c) => !baseProhibited.has(c));
  const prohibitedChanged = removedProhibited.length > 0 || addedProhibited.length > 0;
  let prohibitedSeverity: ImpactSeverity = "IDENTICAL";
  let prohibitedNotes: string | undefined;

  if (removedProhibited.length > 0) {
    prohibitedSeverity = "HIGH";
    prohibitedNotes = `Relaxed restrictions: ${removedProhibited.join(", ")} no longer prohibited.`;
    criticalTriggers.push(
      `Prohibited categories removed: ${removedProhibited.map((c) => `"${c}"`).join(", ")}`,
    );
    reverificationReasons.push(
      "Previously blocked categories are now permitted, creating evasion risk.",
    );
  } else if (addedProhibited.length > 0) {
    prohibitedSeverity = "LOW";
    prohibitedNotes = `Tightened: Added prohibited categories: ${addedProhibited.join(", ")}`;
    reverificationReasons.push("New category prohibitions require new hash verification.");
  }

  ruleDiffs.push({
    field: "prohibitedCategories",
    label: "Prohibited Categories",
    baseDisplay: formatCategories(baseDoc.prohibitedCategories),
    targetDisplay: formatCategories(targetDoc.prohibitedCategories),
    baseRaw: baseDoc.prohibitedCategories,
    targetRaw: targetDoc.prohibitedCategories,
    changed: prohibitedChanged,
    severity: prohibitedSeverity,
    reverificationTrigger: prohibitedChanged,
    notes: prohibitedNotes,
  });

  // 5. Allowed Categories (Set diff)
  const baseAllowed = new Set(baseDoc.allowedCategories || []);
  const targetAllowed = new Set(targetDoc.allowedCategories || []);
  const addedAllowed = [...targetAllowed].filter((c) => !baseAllowed.has(c));
  const removedAllowed = [...baseAllowed].filter((c) => !targetAllowed.has(c));
  const allowedChanged = addedAllowed.length > 0 || removedAllowed.length > 0;
  let allowedSeverity: ImpactSeverity = "IDENTICAL";
  let allowedNotes: string | undefined;

  if (addedAllowed.length > 0) {
    allowedSeverity = "MODERATE";
    allowedNotes = `Expanded allowed scope: Added ${addedAllowed.join(", ")}`;
    criticalTriggers.push(
      `Allowed categories expanded with: ${addedAllowed.map((c) => `"${c}"`).join(", ")}`,
    );
    reverificationReasons.push("Expanded allowed categories require re-verification against intent.");
  } else if (removedAllowed.length > 0) {
    allowedSeverity = "LOW";
    allowedNotes = `Narrowed allowed scope: Removed ${removedAllowed.join(", ")}`;
    reverificationReasons.push("Removed allowed category creates a new policy hash.");
  }

  ruleDiffs.push({
    field: "allowedCategories",
    label: "Allowed Categories",
    baseDisplay: formatCategories(baseDoc.allowedCategories),
    targetDisplay: formatCategories(targetDoc.allowedCategories),
    baseRaw: baseDoc.allowedCategories,
    targetRaw: targetDoc.allowedCategories,
    changed: allowedChanged,
    severity: allowedSeverity,
    reverificationTrigger: allowedChanged,
    notes: allowedNotes,
  });

  // 6. Evidence Requirement (requireEvidence)
  const baseEvidence = Boolean(baseDoc.requireEvidence);
  const targetEvidence = Boolean(targetDoc.requireEvidence);
  const evidenceChanged = baseEvidence !== targetEvidence;
  let evidenceSeverity: ImpactSeverity = "IDENTICAL";
  let evidenceNotes: string | undefined;

  if (evidenceChanged) {
    if (baseEvidence && !targetEvidence) {
      evidenceSeverity = "CRITICAL";
      evidenceNotes = "Evidence requirement was DISABLED. Purchases no longer require proof.";
      criticalTriggers.push("Evidence requirement disabled (unverified purchases allowed)");
      reverificationReasons.push(
        "Purchases no longer require proof of quotes or vendor invoices.",
      );
    } else {
      evidenceSeverity = "MODERATE";
      evidenceNotes = "Evidence requirement was ENFORCED.";
      reverificationReasons.push("Requiring evidence adds a fail-closed checkpoint.");
    }
  }

  ruleDiffs.push({
    field: "requireEvidence",
    label: "Proof of Evidence Required",
    baseDisplay: baseEvidence ? "Yes (Required)" : "No (Optional)",
    targetDisplay: targetEvidence ? "Yes (Required)" : "No (Optional)",
    baseRaw: baseEvidence,
    targetRaw: targetEvidence,
    changed: evidenceChanged,
    severity: evidenceSeverity,
    reverificationTrigger: evidenceChanged,
    notes: evidenceNotes,
  });

  // 7. Cryptographic Policy Hash
  const hashChanged = Boolean(baseHash && targetHash && baseHash !== targetHash);
  if (hashChanged && reverificationReasons.length === 0) {
    // Metadata or structure changed even if high-level fields match
    reverificationReasons.push(
      "Cryptographic SHA-256 hash changed; previous approvals cannot authorize this policy version.",
    );
  }

  ruleDiffs.push({
    field: "policyHash",
    label: "Policy SHA-256 Hash",
    baseDisplay: baseHash ? `${baseHash.slice(0, 16)}...` : "None",
    targetDisplay: targetHash ? `${targetHash.slice(0, 16)}...` : "None",
    baseRaw: baseHash,
    targetRaw: targetHash,
    changed: hashChanged,
    severity: hashChanged ? "MODERATE" : "IDENTICAL",
    reverificationTrigger: hashChanged,
    notes: hashChanged ? "Cryptographic binding changes; requires new checkout approval" : undefined,
  });

  // Calculate overall severity
  const severities = ruleDiffs.map((d) => d.severity);
  let overallSeverity: ImpactSeverity = "IDENTICAL";
  if (severities.includes("CRITICAL")) {
    overallSeverity = "CRITICAL";
  } else if (severities.includes("HIGH")) {
    overallSeverity = "HIGH";
  } else if (severities.includes("MODERATE")) {
    overallSeverity = "MODERATE";
  } else if (severities.includes("LOW")) {
    overallSeverity = "LOW";
  }

  const identical =
    overallSeverity === "IDENTICAL" &&
    !currencyChanged &&
    !cartCapChanged &&
    !itemPriceChanged &&
    !prohibitedChanged &&
    !allowedChanged &&
    !evidenceChanged &&
    !hashChanged;

  const reverificationRequired = !identical && (criticalTriggers.length > 0 || reverificationReasons.length > 0);

  let summary = "Both policy versions have identical purchase rules and cryptographic hashes.";
  if (overallSeverity === "CRITICAL") {
    summary = `CRITICAL IMPACT: ${criticalTriggers.length} high-risk relaxation(s) detected. Re-verification in Verification Studio is strictly required.`;
  } else if (overallSeverity === "HIGH") {
    summary = `HIGH IMPACT: Spending or restriction relaxation detected (${criticalTriggers.length} trigger(s)). Re-verification recommended before approval.`;
  } else if (overallSeverity === "MODERATE" || overallSeverity === "LOW") {
    summary = `Rules modified (${reverificationReasons.length} difference(s)). Creates a new immutable version and hash requiring approval.`;
  }

  return {
    identical,
    reverificationRequired,
    overallSeverity,
    baseId: base.id,
    targetId: target.id,
    baseName: base.name || base.id,
    targetName: target.name || target.id,
    baseHash,
    targetHash,
    ruleDiffs,
    criticalTriggers,
    reverificationReasons,
    summary,
  };
}
