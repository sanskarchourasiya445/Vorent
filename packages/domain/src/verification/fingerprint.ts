import { createHash } from "node:crypto";
import type { Cart, Decision, ReasonCodeValue, ViolationType } from "@warrant/contracts";

export interface FingerprintInput {
  violationType: ViolationType;
  expectedDecision: Decision;
  actualDecision: Decision;
  actualPrimaryReasonCode: ReasonCodeValue;
  candidateCart: Cart;
  policyHash?: string;
}

/**
 * Computes a deterministic SHA-256 fingerprint for a counterexample finding.
 * The fingerprint is stable across environments, platforms, and execution runs.
 */
export function computeFindingFingerprint(input: FingerprintInput): string {
  const normalizedItems = input.candidateCart.items
    .map((item) => ({
      category: item.category.toLowerCase().trim(),
      unitPriceMinor: item.unitPriceMinor,
      quantity: item.quantity,
      sku: item.sku,
    }))
    .sort((a, b) => a.sku.localeCompare(b.sku));

  const canonicalPayload = JSON.stringify({
    policyHash: input.policyHash ?? "no-policy-hash",
    violationType: input.violationType,
    expectedDecision: input.expectedDecision,
    actualDecision: input.actualDecision,
    actualPrimaryReasonCode: input.actualPrimaryReasonCode,
    currency: input.candidateCart.currency.toUpperCase().trim(),
    items: normalizedItems,
  });

  return createHash("sha256").update(canonicalPayload, "utf8").digest("hex");
}
