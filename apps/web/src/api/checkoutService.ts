import type { CheckoutProposalInput, CheckoutGateResult } from "../types/checkout";
import { ReasonCode } from "@warrant/contracts";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

/**
 * Requests a single-use 256-bit cryptographic checkout nonce bound to an approval.
 */
export async function requestCheckoutNonce(
  approvalId: string,
  policyVersionId?: string,
  policyHash?: string,
): Promise<string> {
  const url = `${API_BASE}/api/checkout/nonces`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      approvalId,
      policyVersionId: policyVersionId || "00000000-0000-0000-0000-000000000000",
      policyHash: policyHash || "0".repeat(64),
      ttlSeconds: 300,
    }),
  });

  if (response.status === 404) {
    throw new Error(
      "Nonce issuance endpoint /api/checkout/nonces is not yet mounted on the backend.",
    );
  }

  if (response.status === 503) {
    throw new Error(
      "PostgreSQL database is in standby mode. Nonce generation requires active database persistence.",
    );
  }

  if (!response.ok) {
    let errorMsg = `HTTP ${response.status}`;
    try {
      const json = await response.json();
      if (json && typeof json === "object") {
        errorMsg =
          (json as { error?: { message?: string }; message?: string }).error?.message ||
          (json as { message?: string }).message ||
          errorMsg;
      }
    } catch {
      // use fallback
    }
    throw new Error(`Failed to request checkout nonce: ${errorMsg}`);
  }

  const json = await response.json();
  return (
    json?.nonceId ||
    json?.id ||
    json?.rawNonce ||
    json?.nonce ||
    json?.data?.nonceId ||
    json?.data?.id ||
    json?.data?.nonce ||
    ""
  );
}

/**
 * Submits a proposed cart and evidence snapshot to the authoritative backend checkout gate.
 */
export async function submitCheckoutProposal(
  input: CheckoutProposalInput,
): Promise<CheckoutGateResult> {
  const cartTotalMinor = input.items.reduce(
    (sum, item) => sum + item.unitPriceMinor * item.quantity,
    0,
  );

  // Explicit Offline Simulation Mode
  if (input.useOfflineSimulation) {
    // Pure simulation for local verification without fabricating DB state
    const hasProhibited = input.items.some(
      (item) => item.category.toLowerCase().includes("gift card") || item.category.toLowerCase().includes("weapon"),
    );
    const hasExorbitantItem = input.items.some((item) => item.unitPriceMinor > 25000);
    const isOverCartCap = cartTotalMinor > 60000;

    let decision: "ALLOW" | "DENY" | "REVIEW" = "ALLOW";
    let primaryReasonCode: string = ReasonCode.ALL_RULES_PASSED;
    const reasonCodes: string[] = [];

    if (input.evidenceVariation === "MISSING") {
      decision = "REVIEW";
      primaryReasonCode = ReasonCode.MISSING_CRITICAL_EVIDENCE;
      reasonCodes.push(ReasonCode.MISSING_CRITICAL_EVIDENCE);
    } else if (input.evidenceVariation === "STALE") {
      decision = "REVIEW";
      primaryReasonCode = ReasonCode.STALE_EVIDENCE;
      reasonCodes.push(ReasonCode.STALE_EVIDENCE);
    } else if (hasProhibited) {
      decision = "DENY";
      primaryReasonCode = ReasonCode.PROHIBITED_CATEGORY;
      reasonCodes.push(ReasonCode.PROHIBITED_CATEGORY);
    } else if (hasExorbitantItem) {
      decision = "DENY";
      primaryReasonCode = ReasonCode.ITEM_PRICE_LIMIT_EXCEEDED;
      reasonCodes.push(ReasonCode.ITEM_PRICE_LIMIT_EXCEEDED);
    } else if (isOverCartCap) {
      decision = "DENY";
      primaryReasonCode = ReasonCode.CART_TOTAL_LIMIT_EXCEEDED;
      reasonCodes.push(ReasonCode.CART_TOTAL_LIMIT_EXCEEDED);
    } else {
      reasonCodes.push(ReasonCode.ALL_RULES_PASSED);
    }

    return {
      proposalId: `sim_prop_${Date.now()}`,
      approvalId: input.approvalId,
      decision,
      primaryReasonCode,
      reasonCodes,
      cartTotalMinor,
      currency: input.currency,
      policyVersionId: input.policyVersionId || "pol_v1_books_hardware",
      policyHash: input.policyHash || "93258bd2e0e10160490d8d690e79028c1886f96de0806b749e1822619a3cbbb5",
      reservationId: decision === "ALLOW" ? `sim_res_${Date.now()}` : undefined,
      reservationState: decision === "ALLOW" ? "ORDER_CREATION_PENDING" : undefined,
      evaluatedAt: new Date().toISOString(),
      isLiveApi: false,
      isDemoSimulation: true,
    };
  }

  // Live Backend Gate Execution
  const candidateUrls = [
    `${API_BASE}/api/checkout/proposals`,
    `${API_BASE}/api/v1/checkout/proposals`,
  ];

  // Construct evidence payload reflecting configured evidence quality
  const evidenceSnapshot =
    input.evidenceVariation === "MISSING"
      ? {
          evidenceComplete: false,
          quotesVerified: false,
          evidenceFresh: false,
          snapshotTimestamp: new Date().toISOString(),
          timestamp: new Date().toISOString(),
          merchantConfidence: 0.1,
          itemCategorizations: {},
        }
      : input.evidenceVariation === "STALE"
        ? {
            evidenceComplete: true,
            quotesVerified: true,
            evidenceFresh: false,
            stale: true,
            snapshotTimestamp: new Date(Date.now() - 14 * 86400000).toISOString(),
            timestamp: new Date(Date.now() - 14 * 86400000).toISOString(),
            merchantConfidence: 0.9,
            itemCategorizations: Object.fromEntries(
              input.items.map((i) => [i.id, { category: i.category, confidence: 0.9 }]),
            ),
          }
        : {
            evidenceComplete: true,
            quotesVerified: true,
            evidenceFresh: true,
            stale: false,
            snapshotTimestamp: new Date().toISOString(),
            timestamp: new Date().toISOString(),
            merchantConfidence: 1.0,
            itemCategorizations: Object.fromEntries(
              input.items.map((i) => [i.id, { category: i.category, confidence: 1.0 }]),
            ),
          };

  let response: Response | null = null;
  for (const url of candidateUrls) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        approvalId: input.approvalId,
        policyVersionId: input.policyVersionId,
        policyHash: input.policyHash,
        nonceId: input.nonceId || input.nonce,
        cart: {
          currency: input.currency,
          items: input.items.map((i) => ({
            sku: i.id,
            name: i.name,
            category: i.category,
            unitPriceMinor: i.unitPriceMinor,
            quantity: i.quantity,
          })),
        },
        evidenceSnapshot,
      }),
    });

    if (res.status !== 404) {
      response = res;
      break;
    }
  }

  if (!response) {
    throw new Error(
      "Checkout gate endpoint /api/checkout/proposals is not yet mounted on the backend. You can use 'Offline Simulation' mode to test the authorization gate workflow.",
    );
  }

  if (response.status === 503) {
    throw new Error(
      "PostgreSQL database is in standby mode. Persisting checkout proposals and spend reservations requires active database connectivity.",
    );
  }

  if (response.status === 409) {
    throw new Error(
      "Nonce Replay Detected: The single-use checkout nonce was already consumed or expired.",
    );
  }

  if (!response.ok) {
    let errorMsg = `HTTP ${response.status}`;
    try {
      const json = await response.json();
      if (json && typeof json === "object") {
        errorMsg =
          (json as { error?: { message?: string }; message?: string }).error?.message ||
          (json as { message?: string }).message ||
          errorMsg;
      }
    } catch {
      // use fallback
    }
    throw new Error(`Checkout gate evaluation error: ${errorMsg}`);
  }

  const json = await response.json();
  const proposal = json?.proposal || json?.data || json;
  const reservation = json?.reservation;
  const decision = json?.decision || proposal?.decision || "DENY";
  const reasonCodes = json?.reasonCodes || proposal?.reasonCodes || [];

  return {
    proposalId: proposal.id || proposal.proposalId || `prop_${Date.now()}`,
    approvalId: proposal.approvalId || input.approvalId,
    decision,
    primaryReasonCode:
      reasonCodes[0] ||
      proposal?.primaryReasonCode ||
      (decision === "ALLOW" ? ReasonCode.ALL_RULES_PASSED : ReasonCode.INTERNAL_EVALUATION_ERROR),
    reasonCodes,
    ruleTrace: proposal.ruleTrace || [],
    cartTotalMinor: proposal.cartTotalMinor ?? cartTotalMinor,
    currency: proposal.currency || input.currency,
    policyVersionId: proposal.policyVersionId || input.policyVersionId,
    policyHash: proposal.policyHash || input.policyHash,
    reservationId: reservation?.id || proposal.reservationId,
    reservationState: reservation?.state || proposal.reservationState,
    evaluatedAt: proposal.evaluatedAt || new Date().toISOString(),
    isLiveApi: true,
    isDemoSimulation: false,
  };
}
