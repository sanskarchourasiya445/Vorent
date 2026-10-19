import {
  type PolicyDiff,
  type PolicyDocument,
  type PolicyFieldDiff,
  PolicyDiffSchema,
} from "@warrant/contracts";
import { computePolicyHash } from "../verification/policyHash.js";

/**
 * Warrant Phase 2 Policy Semantic Diffing
 *
 * Compares two PolicyDocument instances and produces a structured, human-readable diff
 * identifying all field-level additions, removals, and modifications.
 */

function formatMinor(amountMinor?: number, currency: string = "USD"): string {
  if (amountMinor === undefined) return "none";
  return `${currency} ${(amountMinor / 100).toFixed(2)}`;
}

export function computePolicyDiff(
  source: PolicyDocument,
  target: PolicyDocument,
  options?: {
    sourceVersionId?: string;
    sourcePolicyHash?: string;
    targetPolicyHash?: string;
  },
): PolicyDiff {
  const diffs: PolicyFieldDiff[] = [];

  // 1. Currency
  if (source.currency !== target.currency) {
    diffs.push({
      field: "currency",
      previousValue: source.currency,
      proposedValue: target.currency,
      changeType: "MODIFIED",
      description: `Changed base currency from '${source.currency}' to '${target.currency}'`,
    });
  }

  // 2. Max Item Price
  if (source.maxItemPriceMinor !== target.maxItemPriceMinor) {
    if (source.maxItemPriceMinor === undefined && target.maxItemPriceMinor !== undefined) {
      diffs.push({
        field: "maxItemPriceMinor",
        previousValue: null,
        proposedValue: target.maxItemPriceMinor,
        changeType: "ADDED",
        description: `Added per-item price ceiling of ${formatMinor(target.maxItemPriceMinor, target.currency)}`,
      });
    } else if (source.maxItemPriceMinor !== undefined && target.maxItemPriceMinor === undefined) {
      diffs.push({
        field: "maxItemPriceMinor",
        previousValue: source.maxItemPriceMinor,
        proposedValue: null,
        changeType: "REMOVED",
        description: `Removed per-item price ceiling (was ${formatMinor(source.maxItemPriceMinor, source.currency)})`,
      });
    } else if (source.maxItemPriceMinor !== undefined && target.maxItemPriceMinor !== undefined) {
      const direction = target.maxItemPriceMinor < source.maxItemPriceMinor ? "Tightened" : "Relaxed";
      diffs.push({
        field: "maxItemPriceMinor",
        previousValue: source.maxItemPriceMinor,
        proposedValue: target.maxItemPriceMinor,
        changeType: "MODIFIED",
        description: `${direction} per-item price ceiling from ${formatMinor(source.maxItemPriceMinor, source.currency)} to ${formatMinor(target.maxItemPriceMinor, target.currency)}`,
      });
    }
  }

  // 3. Max Cart Total
  if (source.maxCartTotalMinor !== target.maxCartTotalMinor) {
    if (source.maxCartTotalMinor === undefined && target.maxCartTotalMinor !== undefined) {
      diffs.push({
        field: "maxCartTotalMinor",
        previousValue: null,
        proposedValue: target.maxCartTotalMinor,
        changeType: "ADDED",
        description: `Added whole-cart spending ceiling of ${formatMinor(target.maxCartTotalMinor, target.currency)}`,
      });
    } else if (source.maxCartTotalMinor !== undefined && target.maxCartTotalMinor === undefined) {
      diffs.push({
        field: "maxCartTotalMinor",
        previousValue: source.maxCartTotalMinor,
        proposedValue: null,
        changeType: "REMOVED",
        description: `Removed whole-cart spending ceiling (was ${formatMinor(source.maxCartTotalMinor, source.currency)})`,
      });
    } else if (source.maxCartTotalMinor !== undefined && target.maxCartTotalMinor !== undefined) {
      const direction = target.maxCartTotalMinor < source.maxCartTotalMinor ? "Tightened" : "Relaxed";
      diffs.push({
        field: "maxCartTotalMinor",
        previousValue: source.maxCartTotalMinor,
        proposedValue: target.maxCartTotalMinor,
        changeType: "MODIFIED",
        description: `${direction} whole-cart spending ceiling from ${formatMinor(source.maxCartTotalMinor, source.currency)} to ${formatMinor(target.maxCartTotalMinor, target.currency)}`,
      });
    }
  }

  // 4. Allowed Categories
  const sourceAllowed = new Set(source.allowedCategories ?? []);
  const targetAllowed = new Set(target.allowedCategories ?? []);
  const addedAllowed = Array.from(targetAllowed).filter((c) => !sourceAllowed.has(c));
  const removedAllowed = Array.from(sourceAllowed).filter((c) => !targetAllowed.has(c));

  if (addedAllowed.length > 0 || removedAllowed.length > 0) {
    const parts: string[] = [];
    if (addedAllowed.length > 0) parts.push(`added [${addedAllowed.join(", ")}]`);
    if (removedAllowed.length > 0) parts.push(`removed [${removedAllowed.join(", ")}]`);

    diffs.push({
      field: "allowedCategories",
      previousValue: source.allowedCategories ?? [],
      proposedValue: target.allowedCategories ?? [],
      changeType: "MODIFIED",
      description: `Modified allowed categories: ${parts.join("; ")}`,
    });
  }

  // 5. Prohibited Categories
  const sourceProhibited = new Set(source.prohibitedCategories ?? []);
  const targetProhibited = new Set(target.prohibitedCategories ?? []);
  const addedProhibited = Array.from(targetProhibited).filter((c) => !sourceProhibited.has(c));
  const removedProhibited = Array.from(sourceProhibited).filter((c) => !targetProhibited.has(c));

  if (addedProhibited.length > 0 || removedProhibited.length > 0) {
    const parts: string[] = [];
    if (addedProhibited.length > 0) parts.push(`added [${addedProhibited.join(", ")}]`);
    if (removedProhibited.length > 0) parts.push(`removed [${removedProhibited.join(", ")}]`);

    diffs.push({
      field: "prohibitedCategories",
      previousValue: source.prohibitedCategories ?? [],
      proposedValue: target.prohibitedCategories ?? [],
      changeType: "MODIFIED",
      description: `Modified prohibited categories: ${parts.join("; ")}`,
    });
  }

  // 6. Evidence Requirement
  if (source.requireEvidence !== target.requireEvidence) {
    diffs.push({
      field: "requireEvidence",
      previousValue: source.requireEvidence ?? false,
      proposedValue: target.requireEvidence ?? false,
      changeType: "MODIFIED",
      description: `Changed evidence requirement from ${source.requireEvidence ?? false} to ${target.requireEvidence ?? false}`,
    });
  }

  const hasChanges = diffs.length > 0;
  const previousPolicyHash = options?.sourcePolicyHash || computePolicyHash(source);
  const targetPolicyHash = options?.targetPolicyHash || computePolicyHash(target);

  const summary = hasChanges
    ? `Policy modified across ${diffs.length} field(s): ${diffs.map((d) => d.field).join(", ")}.`
    : "No semantic changes between policy versions.";

  const diffResult: PolicyDiff = {
    previousVersionId: options?.sourceVersionId,
    previousPolicyHash,
    targetPolicyHash,
    diffs,
    hasChanges,
    summary,
  };

  return PolicyDiffSchema.parse(diffResult);
}
