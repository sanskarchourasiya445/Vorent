import { randomUUID, randomBytes, createHash } from "node:crypto";
import { eq, and, inArray, isNull, desc } from "drizzle-orm";
import {
  type Cart,
  type EvidenceSnapshot,
  ReasonCode,
  type Decision,
  type ReservationState,
  type SpendReservationRecord,
} from "@warrant/contracts";
import { evaluatePolicy } from "@warrant/domain";
import {
  approvals,
  checkoutNonces,
  checkoutProposals,
  spendReservations,
  policyVersions,
} from "../schema.js";

export class NonceReplayError extends Error {
  readonly code = "NONCE_REPLAYED";
  constructor(message = "NONCE_REPLAYED: Checkout nonce has already been consumed or replayed") {
    super(message);
    this.name = "NonceReplayError";
  }
}

export class CheckoutError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(`${code}: ${message}`);
    this.name = "CheckoutError";
  }
}

export interface IssueNonceParams {
  ownerId: string;
  approvalId: string;
  policyVersionId: string;
  policyHash: string;
  ttlSeconds?: number;
}

export interface IssuedNonce {
  id: string;
  rawNonce: string;
  nonceHash: string;
  expiresAt: Date;
}

/**
 * Issues a single-use checkout nonce with a SHA-256 digest and bounded expiry.
 * Never persists the raw nonce.
 */
export async function issueCheckoutNonce(
  db: any,
  params: IssueNonceParams
): Promise<IssuedNonce> {
  const nonceId = randomUUID();
  const rawNonce = randomBytes(32).toString("hex");
  const nonceHash = createHash("sha256").update(rawNonce).digest("hex");
  const ttl = params.ttlSeconds ?? 300;
  const expiresAt = new Date(Date.now() + ttl * 1000);

  await db.insert(checkoutNonces).values({
    id: nonceId,
    ownerId: params.ownerId,
    approvalId: params.approvalId,
    policyVersionId: params.policyVersionId,
    policyHash: params.policyHash,
    nonceHash,
    expiresAt,
    consumedAt: null,
  });

  return {
    id: nonceId,
    rawNonce,
    nonceHash,
    expiresAt,
  };
}

/**
 * Calculates cumulative active reservations and committed spend for an approval.
 * MVP Budget Rule: Sums 'ORDER_CREATION_PENDING', 'RESERVED', 'COMMITTED', 'RECONCILIATION_HOLD'.
 * Strictly excludes 'RELEASED'.
 */
export async function calculateCommittedAndActiveSpend(
  tx: any,
  approvalId: string
): Promise<number> {
  const activeStates = [
    "ORDER_CREATION_PENDING",
    "RESERVED",
    "COMMITTED",
    "RECONCILIATION_HOLD",
  ];

  const reservations = await tx
    .select({
      amountMinor: spendReservations.amountMinor,
      state: spendReservations.state,
      approvalId: spendReservations.approvalId,
    })
    .from(spendReservations)
    .where(
      and(
        eq(spendReservations.approvalId, approvalId),
        inArray(spendReservations.state, activeStates)
      )
    );

  let total = 0;
  for (const r of reservations) {
    total += Number(r.amountMinor);
  }
  return total;
}

export interface SubmitCheckoutProposalInput {
  ownerId: string;
  approvalId: string;
  policyVersionId: string;
  policyHash: string;
  nonceId: string;
  cart: Cart;
  evidenceSnapshot: EvidenceSnapshot;
}

export interface SubmitCheckoutProposalResult {
  proposal: any;
  reservation: any | null;
  decision: Decision;
  reasonCodes: string[];
}

/**
 * Submits a checkout proposal within a single serialized transaction.
 * Enforces:
 * 1. PostgreSQL row-level lock on approval (`FOR UPDATE`) to serialize concurrent proposals.
 * 2. Atomic nonce consumption (`WHERE id = $1 AND consumed_at IS NULL`) to prevent replays.
 * 3. Lifetime spend limit validation against all active reservations and committed spend.
 * 4. Deterministic policy evaluation with fail-closed semantics.
 * 5. Atomic reservation creation in ORDER_CREATION_PENDING only when ALLOWed.
 */
export async function submitCheckoutProposal(
  db: any,
  input: SubmitCheckoutProposalInput
): Promise<SubmitCheckoutProposalResult> {
  return await db.transaction(async (tx: any) => {
    // 1. Serialize checkout proposals per approval using a PostgreSQL row lock
    const approvalsList = await tx
      .select()
      .from(approvals)
      .where(eq(approvals.id, input.approvalId))
      .for("update");

    const approval = approvalsList[0];
    if (!approval) {
      throw new CheckoutError("APPROVAL_NOT_FOUND", `Approval ${input.approvalId} not found`);
    }

    if (approval.revokedAt) {
      throw new CheckoutError("REVOKED_APPROVAL", "Approval has been revoked");
    }

    if (new Date(approval.expiresAt).getTime() <= Date.now()) {
      throw new CheckoutError("EXPIRED_APPROVAL", "Approval has expired");
    }

    if (
      approval.policyVersionId !== input.policyVersionId ||
      approval.policyHash !== input.policyHash
    ) {
      throw new CheckoutError(
        "POLICY_HASH_MISMATCH",
        "Approval does not match target policy version and hash"
      );
    }

    if (approval.currency !== input.cart.currency) {
      throw new CheckoutError(
        "CURRENCY_MISMATCH",
        `Approval currency (${approval.currency}) does not match cart currency (${input.cart.currency})`
      );
    }

    // 2. Validate and atomically consume nonce
    const noncesList = await tx
      .select()
      .from(checkoutNonces)
      .where(eq(checkoutNonces.id, input.nonceId))
      .for("update");

    const nonce = noncesList[0];
    if (!nonce) {
      throw new CheckoutError("NONCE_INVALID", `Nonce ${input.nonceId} not found`);
    }

    if (nonce.approvalId !== input.approvalId) {
      throw new CheckoutError(
        "NONCE_BINDING_MISMATCH",
        "Nonce was not issued for this approval"
      );
    }

    if (
      nonce.policyVersionId !== input.policyVersionId ||
      nonce.policyHash !== input.policyHash
    ) {
      throw new CheckoutError(
        "POLICY_HASH_MISMATCH",
        "Nonce does not match target policy version and hash"
      );
    }

    if (new Date(nonce.expiresAt).getTime() <= Date.now()) {
      throw new CheckoutError("NONCE_EXPIRED", "Checkout nonce has expired");
    }

    if (nonce.consumedAt !== null) {
      throw new NonceReplayError("NONCE_REPLAYED: Checkout nonce has already been consumed");
    }

    // Atomic conditional update
    const consumed = await tx
      .update(checkoutNonces)
      .set({ consumedAt: new Date() })
      .where(and(eq(checkoutNonces.id, nonce.id), isNull(checkoutNonces.consumedAt)))
      .returning();

    if (!consumed || consumed.length === 0) {
      throw new NonceReplayError("NONCE_REPLAYED: Concurrently consumed checkout nonce");
    }

    // 3. Calculate lifetime spend
    const currentSpentAndReserved = await calculateCommittedAndActiveSpend(
      tx,
      input.approvalId
    );

    const cartTotalMinor = input.cart.items.reduce(
      (sum: number, it: any) => sum + it.unitPriceMinor * it.quantity,
      0
    );

    const exceedsLifetimeSpend =
      currentSpentAndReserved + cartTotalMinor > Number(approval.spendLimitMinor);

    // 4. Policy Evaluation
    const versionsList = await tx
      .select()
      .from(policyVersions)
      .where(eq(policyVersions.id, input.policyVersionId));

    const pv = versionsList[0];
    if (!pv || !pv.policyDocument) {
      throw new CheckoutError(
        "POLICY_VERSION_NOT_FOUND",
        `Policy version ${input.policyVersionId} not found`
      );
    }

    const evidence = { ...(input.evidenceSnapshot ?? {}) };
    if (evidence.snapshotTimestamp) {
      const snapTime = new Date(evidence.snapshotTimestamp).getTime();
      const now = Date.now();
      if (isNaN(snapTime) || now - snapTime > 3600000 || snapTime - now > 120000) {
        evidence.stale = true;
      }
    }

    const evalResult = evaluatePolicy({
      policy: pv.policyDocument,
      cart: input.cart,
      evidence,
    });

    let finalDecision: Decision = evalResult.decision;
    let finalReasonCodes: string[] = [...evalResult.reasonCodes];
    let finalRuleTrace: any[] = [...(evalResult.ruleTrace ?? [])];

    if (evalResult.decision === "ALLOW" && exceedsLifetimeSpend) {
      finalDecision = "DENY";
      finalReasonCodes = [ReasonCode.LIFETIME_SPEND_LIMIT_EXCEEDED];
      finalRuleTrace.push({
        ruleId: "rule_lifetime_spend_limit",
        ruleName: "Lifetime Spend Limit Enforcement",
        outcome: "FAIL",
        reasonCode: ReasonCode.LIFETIME_SPEND_LIMIT_EXCEEDED,
        message: `Cart total (${cartTotalMinor}) + active/committed spend (${currentSpentAndReserved}) exceeds approval lifetime spend limit (${approval.spendLimitMinor})`,
      });
    }

    // 5. Persist Checkout Proposal
    const proposalId = randomUUID();
    const cartHash = createHash("sha256")
      .update(JSON.stringify(input.cart))
      .digest("hex");

    const [proposalRecord] = await tx.insert(checkoutProposals).values({
      id: proposalId,
      ownerId: input.ownerId,
      approvalId: input.approvalId,
      policyVersionId: input.policyVersionId,
      policyHash: input.policyHash,
      consumedNonceId: nonce.id,
      cartHash,
      proposedCart: input.cart,
      normalizedCart: input.cart,
      evidenceSnapshot: input.evidenceSnapshot,
      decision: finalDecision,
      reasonCodes: finalReasonCodes,
      ruleTrace: finalRuleTrace,
      evaluatedAt: new Date(),
    }).returning();

    // 6. Atomically reserve spend in ORDER_CREATION_PENDING if ALLOWed
    let reservationRecord: any = null;
    if (finalDecision === "ALLOW") {
      const [res] = await tx.insert(spendReservations).values({
        id: randomUUID(),
        ownerId: input.ownerId,
        approvalId: input.approvalId,
        proposalId,
        amountMinor: cartTotalMinor,
        currency: input.cart.currency,
        state: "ORDER_CREATION_PENDING",
        expiresAt: null,
      }).returning();
      reservationRecord = res;
    }

    return {
      proposal: proposalRecord,
      reservation: reservationRecord,
      decision: finalDecision,
      reasonCodes: finalReasonCodes,
    };
  });
}

/**
 * Lists spend reservations with optional filtering by approvalId and state.
 */
export async function listSpendReservations(
  db: any,
  params?: {
    ownerId?: string;
    approvalId?: string;
    state?: ReservationState;
    limit?: number;
  }
): Promise<{ reservations: SpendReservationRecord[]; total: number }> {
  const limit = Math.min(params?.limit ?? 50, 100);
  const conditions = [];

  if (params?.ownerId) conditions.push(eq(spendReservations.ownerId, params.ownerId));
  if (params?.approvalId) conditions.push(eq(spendReservations.approvalId, params.approvalId));
  if (params?.state) conditions.push(eq(spendReservations.state, params.state));

  let query = db.select().from(spendReservations);
  if (conditions.length > 0) {
    query = query.where(conditions.length === 1 ? conditions[0] : and(...conditions));
  }

  const rows = await query.orderBy(desc(spendReservations.createdAt)).limit(limit);

  const mapped: SpendReservationRecord[] = rows.map((r: any) => ({
    id: r.id,
    ownerId: r.ownerId,
    approvalId: r.approvalId,
    proposalId: r.proposalId,
    amountMinor: Number(r.amountMinor),
    currency: r.currency,
    state: r.state as ReservationState,
    expiresAt: r.expiresAt ? (r.expiresAt instanceof Date ? r.expiresAt.toISOString() : r.expiresAt) : null,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    updatedAt: r.updatedAt instanceof Date ? r.updatedAt.toISOString() : r.updatedAt,
  }));

  return {
    reservations: mapped,
    total: mapped.length,
  };
}
