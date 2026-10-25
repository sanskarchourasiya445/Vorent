import { createHash } from "node:crypto";
import type { PolicyDocument } from "@warrant/contracts";

/**
 * Computes a deterministic SHA-256 canonical hash of a PolicyDocument.
 * Key ordering, array element sorting, and undefined normalization are applied
 * to guarantee identical digests for semantically identical policies.
 */
export function computePolicyHash(policy: PolicyDocument): string {
  const currencyStr = typeof policy?.currency === "string" && policy.currency.length > 0 ? policy.currency : "USD";
  const normalized = {
    schemaVersion: policy?.schemaVersion ?? "1.0",
    currency: currencyStr.toUpperCase().trim(),
    maxItemPriceMinor: policy?.maxItemPriceMinor ?? null,
    maxCartTotalMinor: policy?.maxCartTotalMinor ?? null,
    allowedCategories: policy?.allowedCategories
      ? [...policy.allowedCategories].map((c) => c.trim()).sort()
      : null,
    prohibitedCategories: policy?.prohibitedCategories
      ? [...policy.prohibitedCategories].map((c) => c.trim()).sort()
      : null,
    requireEvidence: policy?.requireEvidence ?? false,
  };

  return createHash("sha256").update(JSON.stringify(normalized), "utf8").digest("hex");
}
