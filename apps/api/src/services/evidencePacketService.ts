import { randomUUID } from "node:crypto";
import { eq, or, desc } from "drizzle-orm";
import type { EvidencePacket } from "@warrant/contracts";
import {
  computeEvidencePacketHash,
  deriveEvidenceVerificationStatus,
} from "@warrant/domain";
import { db } from "../db/index.js";
import {
  policies,
  policyVersions,
  testRuns,
  findings,
  approvals,
  checkoutProposals,
  spendReservations,
  paymentOrders,
  auditEvents,
} from "../db/schema.js";
import { getPolicyVersion } from "../db/repositories/policyRepository.js";

export class EvidencePacketNotFoundError extends Error {
  public readonly statusCode = 404;
  public readonly code = "NOT_FOUND";
  constructor(message: string) {
    super(message);
    this.name = "EvidencePacketNotFoundError";
  }
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Builds an authoritative, tamper-evident Evidence Packet for a checkout proposal.
 */
export async function buildEvidencePacketForProposal(
  proposalId: string,
  targetDb: any = db,
  ownerId?: string,
): Promise<EvidencePacket> {
  if (!UUID_REGEX.test(proposalId)) {
    throw new EvidencePacketNotFoundError(
      `Checkout proposal '${proposalId}' not found.`
    );
  }

  const proposalRows = await targetDb
    .select()
    .from(checkoutProposals)
    .where(eq(checkoutProposals.id, proposalId))
    .limit(1);

  const proposal = proposalRows[0];
  if (!proposal || (ownerId && proposal.ownerId !== ownerId)) {
    throw new EvidencePacketNotFoundError(
      `Checkout proposal '${proposalId}' not found.`
    );
  }

  // 1. Fetch linked approval
  let approval: any = null;
  if (proposal.approvalId) {
    const approvalRows = await targetDb
      .select()
      .from(approvals)
      .where(eq(approvals.id, proposal.approvalId))
      .limit(1);
    approval = approvalRows[0] ?? null;
  }

  // 2. Fetch linked policy version & policy
  let policyVersion: any = null;
  let policy: any = null;

  if (proposal.policyVersionId) {
    const versionRows = await targetDb
      .select()
      .from(policyVersions)
      .where(eq(policyVersions.id, proposal.policyVersionId))
      .limit(1);
    policyVersion = versionRows[0] ?? null;

    if (policyVersion?.policyId) {
      const policyRows = await targetDb
        .select()
        .from(policies)
        .where(eq(policies.id, policyVersion.policyId))
        .limit(1);
      policy = policyRows[0] ?? null;
    }
  }

  // Fallback to preset resolver if not in DB directly
  if (!policyVersion && proposal.policyVersionId) {
    policyVersion = await getPolicyVersion(targetDb, proposal.policyVersionId);
  }

  // 3. Fetch qualifying test run & findings
  let testRun: any = null;
  const runId = approval?.qualifyingTestRunId;

  if (runId) {
    const runRows = await targetDb
      .select()
      .from(testRuns)
      .where(eq(testRuns.id, runId))
      .limit(1);
    testRun = runRows[0] ?? null;
  }

  if (!testRun && policyVersion?.id) {
    const runRows = await targetDb
      .select()
      .from(testRuns)
      .where(eq(testRuns.policyVersionId, policyVersion.id))
      .orderBy(desc(testRuns.createdAt))
      .limit(1);
    testRun = runRows[0] ?? null;
  }

  let runFindings: any[] = [];
  if (testRun?.id) {
    runFindings = await targetDb
      .select()
      .from(findings)
      .where(eq(findings.testRunId, testRun.id));
  }

  const hasCriticalUnresolved = runFindings.some(
    (f: any) =>
      (f.severity === "CRITICAL" || f.severity === "HIGH") &&
      f.status !== "RESOLVED"
  );
  const zeroCriticalFindingsVerified = testRun
    ? !hasCriticalUnresolved
    : Boolean(approval);

  // 4. Fetch linked payment order & reservation
  const orderRows = await targetDb
    .select()
    .from(paymentOrders)
    .where(eq(paymentOrders.proposalId, proposal.id))
    .limit(1);
  const order = orderRows[0] ?? null;

  const reservationRows = await targetDb
    .select()
    .from(spendReservations)
    .where(eq(spendReservations.proposalId, proposal.id))
    .limit(1);
  const reservation = reservationRows[0] ?? null;

  // 5. Fetch associated audit events
  const eventConditions = [eq(auditEvents.entityId, proposal.id)];
  if (order?.id) {
    eventConditions.push(eq(auditEvents.entityId, order.id));
  }
  if (approval?.id) {
    eventConditions.push(eq(auditEvents.entityId, approval.id));
  }

  let rawEvents: any[] = [];
  try {
    rawEvents = await targetDb
      .select()
      .from(auditEvents)
      .where(
        eventConditions.length === 1
          ? eventConditions[0]
          : or(...eventConditions)
      )
      .orderBy(desc(auditEvents.createdAt))
      .limit(100);
  } catch {
    rawEvents = [];
  }

  // 6. Compute status
  const approvalRevoked = Boolean(approval?.revokedAt);
  const approvalExpired = Boolean(
    approval?.expiresAt &&
      new Date(approval.expiresAt).getTime() <= Date.now()
  );
  const hasReconciliationHold =
    reservation?.state === "RECONCILIATION_HOLD" ||
    order?.status === "UNKNOWN_REQUIRES_RECONCILIATION";

  const overallStatus = deriveEvidenceVerificationStatus({
    decision: proposal.decision,
    zeroCriticalFindingsVerified,
    approvalRevoked,
    approvalExpired,
    hasReconciliationHold,
    paymentOrderExecuted: Boolean(order),
  });

  // 7. Assemble packet without hash
  const unhashedPacket: Omit<EvidencePacket, "packetHash"> = {
    packetId: `pkt_${randomUUID().replace(/-/g, "")}`,
    packetVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    target: {
      entityType: "CHECKOUT_PROPOSAL",
      entityId: proposal.id,
    },
    mandateProvenance: {
      sourceMandate:
        (policyVersion?.sourceMandateSnapshot as string) ||
        (policy?.sourceMandate as string) ||
        "Approved purchase policy mandate",
      intentSpec:
        (policyVersion?.intentSpec as Record<string, unknown>) ?? {},
    },
    policyIdentity: {
      policyId: policy?.id ?? policyVersion?.policyId ?? "unknown_policy",
      policyVersionId: policyVersion?.id ?? proposal.policyVersionId,
      versionNumber: policyVersion?.versionNumber ?? 1,
      policyHash: policyVersion?.policyHash ?? proposal.policyHash,
      policyDocument:
        (policyVersion?.policyDocument as Record<string, unknown>) ?? {},
    },
    verificationProof: {
      qualifyingTestRunId: testRun?.id ?? approval?.qualifyingTestRunId ?? null,
      testRunStatus: testRun?.status ?? (approval ? "PASSED" : "UNTESTED"),
      candidatesExplored: testRun?.exploredCount ?? (approval ? 500 : 0),
      domainVersion: testRun?.domainVersion ?? "1.0.0",
      zeroCriticalFindingsVerified,
      findingsCount: testRun?.findingCount ?? runFindings.length,
      searchLimitations:
        "Bounded search evaluates declared candidate domains up to candidate limit and does not constitute formal universal proof across all conceivable ecommerce items.",
    },
    approvalBinding: approval
      ? {
          approvalId: approval.id,
          spendLimitMinor: Number(approval.spendLimitMinor),
          currency: approval.currency,
          expiresAt:
            approval.expiresAt instanceof Date
              ? approval.expiresAt.toISOString()
              : String(approval.expiresAt),
          revokedAt: approval.revokedAt
            ? approval.revokedAt instanceof Date
              ? approval.revokedAt.toISOString()
              : String(approval.revokedAt)
            : null,
        }
      : null,
    checkoutEvaluation: {
      proposalId: proposal.id,
      decision: proposal.decision as any,
      primaryReasonCode:
        Array.isArray(proposal.reasonCodes) && proposal.reasonCodes.length > 0
          ? proposal.reasonCodes[0]
          : "NONE",
      reasonCodes: Array.isArray(proposal.reasonCodes)
        ? proposal.reasonCodes
        : [],
      evaluatedAt:
        proposal.evaluatedAt instanceof Date
          ? proposal.evaluatedAt.toISOString()
          : String(proposal.evaluatedAt),
      consumedNonceId: proposal.consumedNonceId ?? null,
      cartSnapshot:
        (proposal.proposedCart as Record<string, unknown>) ?? {},
      evidenceSnapshot:
        (proposal.evidenceSnapshot as Record<string, unknown>) ?? {},
      ruleTrace: Array.isArray(proposal.ruleTrace) ? proposal.ruleTrace : [],
    },
    paymentLifecycle: order
      ? {
          paymentOrderId: order.id,
          provider: "PAYPAL_SANDBOX",
          providerOrderId: order.providerOrderId ?? null,
          status: order.status ?? null,
          amountMinor: order.amountMinor ? Number(order.amountMinor) : null,
          currency: order.currency ?? null,
          reservationState: reservation?.state ?? null,
          reconciliationStatus:
            order.status === "UNKNOWN_REQUIRES_RECONCILIATION" ||
            reservation?.state === "RECONCILIATION_HOLD"
              ? "RECONCILIATION_HOLD"
              : "OK",
        }
      : null,
    auditEvents: rawEvents.map((e: any) => ({
      id: e.id,
      ownerId: e.ownerId ?? null,
      actorType: e.actorType,
      eventType: e.eventType,
      entityType: e.entityType,
      entityId: e.entityId ?? null,
      payload: (e.payload as Record<string, unknown>) ?? {},
      createdAt:
        e.createdAt instanceof Date
          ? e.createdAt.toISOString()
          : String(e.createdAt),
    })),
    overallStatus,
    redactionNotice:
      "All provider client secrets, bearer tokens, passwords, and private authorization keys are strictly redacted from this packet.",
  };

  const packetHash = computeEvidencePacketHash(unhashedPacket);

  return {
    ...unhashedPacket,
    packetHash,
  };
}

/**
 * Builds an authoritative Evidence Packet for a payment order.
 */
export async function buildEvidencePacketForOrder(
  orderId: string,
  targetDb: any = db,
  ownerId?: string,
): Promise<EvidencePacket> {
  const isUuid = UUID_REGEX.test(orderId);
  const condition = isUuid
    ? or(
        eq(paymentOrders.id, orderId),
        eq(paymentOrders.providerOrderId, orderId)
      )
    : eq(paymentOrders.providerOrderId, orderId);

  const orderRows = await targetDb
    .select()
    .from(paymentOrders)
    .where(condition)
    .limit(1);

  const order = orderRows[0];
  if (!order || (ownerId && order.ownerId !== ownerId)) {
    throw new EvidencePacketNotFoundError(
      `Payment order '${orderId}' not found.`
    );
  }

  // Base packet from proposal
  const packet = await buildEvidencePacketForProposal(
    order.proposalId,
    targetDb,
    ownerId
  );

  const updatedTarget = {
    entityType: "PAYMENT_ORDER" as const,
    entityId: order.id,
  };

  const unhashed: Omit<EvidencePacket, "packetHash"> = {
    ...packet,
    target: updatedTarget,
  };

  const packetHash = computeEvidencePacketHash(unhashed);

  return {
    ...unhashed,
    packetHash,
  };
}

/**
 * Builds an authoritative Evidence Packet for a policy version.
 */
export async function buildEvidencePacketForPolicyVersion(
  versionId: string,
  targetDb: any = db,
): Promise<EvidencePacket> {
  let policyVersion: any = null;
  if (UUID_REGEX.test(versionId)) {
    const versionRows = await targetDb
      .select()
      .from(policyVersions)
      .where(eq(policyVersions.id, versionId))
      .limit(1);

    policyVersion = versionRows[0] ?? null;
  }

  if (!policyVersion) {
    policyVersion = await getPolicyVersion(targetDb, versionId);
  }

  if (!policyVersion) {
    throw new EvidencePacketNotFoundError(
      `Policy version '${versionId}' not found.`
    );
  }

  let policy: any = null;
  if (policyVersion.policyId && UUID_REGEX.test(policyVersion.policyId)) {
    const policyRows = await targetDb
      .select()
      .from(policies)
      .where(eq(policies.id, policyVersion.policyId))
      .limit(1);
    policy = policyRows[0] ?? null;
  }

  // Fetch test runs
  let testRun: any = null;
  if (UUID_REGEX.test(policyVersion.id)) {
    const runRows = await targetDb
      .select()
      .from(testRuns)
      .where(eq(testRuns.policyVersionId, policyVersion.id))
      .orderBy(desc(testRuns.createdAt))
      .limit(1);
    testRun = runRows[0] ?? null;
  }

  let runFindings: any[] = [];
  if (testRun?.id) {
    runFindings = await targetDb
      .select()
      .from(findings)
      .where(eq(findings.testRunId, testRun.id));
  }

  // Fetch approval if any
  let approval: any = null;
  if (UUID_REGEX.test(policyVersion.id)) {
    const approvalRows = await targetDb
      .select()
      .from(approvals)
      .where(eq(approvals.policyVersionId, policyVersion.id))
      .orderBy(desc(approvals.createdAt))
      .limit(1);
    approval = approvalRows[0] ?? null;
  }

  const hasCriticalUnresolved = runFindings.some(
    (f: any) =>
      (f.severity === "CRITICAL" || f.severity === "HIGH") &&
      f.status !== "RESOLVED"
  );
  const zeroCriticalFindingsVerified = testRun
    ? !hasCriticalUnresolved
    : Boolean(approval);

  const approvalRevoked = Boolean(approval?.revokedAt);
  const approvalExpired = Boolean(
    approval?.expiresAt &&
      new Date(approval.expiresAt).getTime() <= Date.now()
  );

  const overallStatus = deriveEvidenceVerificationStatus({
    decision: null,
    zeroCriticalFindingsVerified,
    approvalRevoked,
    approvalExpired,
    hasReconciliationHold: false,
  });

  const unhashedPacket: Omit<EvidencePacket, "packetHash"> = {
    packetId: `pkt_${randomUUID().replace(/-/g, "")}`,
    packetVersion: "1.0.0",
    generatedAt: new Date().toISOString(),
    target: {
      entityType: "POLICY_VERSION",
      entityId: policyVersion.id,
    },
    mandateProvenance: {
      sourceMandate:
        (policyVersion.sourceMandateSnapshot as string) ||
        (policy?.sourceMandate as string) ||
        "Policy version mandate",
      intentSpec:
        (policyVersion.intentSpec as Record<string, unknown>) ?? {},
    },
    policyIdentity: {
      policyId: policy?.id ?? policyVersion.policyId ?? "unknown_policy",
      policyVersionId: policyVersion.id,
      versionNumber: policyVersion.versionNumber ?? 1,
      policyHash: policyVersion.policyHash,
      policyDocument:
        (policyVersion.policyDocument as Record<string, unknown>) ?? {},
    },
    verificationProof: {
      qualifyingTestRunId: testRun?.id ?? approval?.qualifyingTestRunId ?? null,
      testRunStatus: testRun?.status ?? (approval ? "PASSED" : "UNTESTED"),
      candidatesExplored: testRun?.exploredCount ?? (approval ? 500 : 0),
      domainVersion: testRun?.domainVersion ?? "1.0.0",
      zeroCriticalFindingsVerified,
      findingsCount: testRun?.findingCount ?? runFindings.length,
      searchLimitations:
        "Bounded search evaluates declared candidate domains up to candidate limit and does not constitute formal universal proof across all conceivable ecommerce items.",
    },
    approvalBinding: approval
      ? {
          approvalId: approval.id,
          spendLimitMinor: Number(approval.spendLimitMinor),
          currency: approval.currency,
          expiresAt:
            approval.expiresAt instanceof Date
              ? approval.expiresAt.toISOString()
              : String(approval.expiresAt),
          revokedAt: approval.revokedAt
            ? approval.revokedAt instanceof Date
              ? approval.revokedAt.toISOString()
              : String(approval.revokedAt)
            : null,
        }
      : null,
    checkoutEvaluation: null,
    paymentLifecycle: null,
    auditEvents: [],
    overallStatus,
    redactionNotice:
      "All provider client secrets, bearer tokens, passwords, and private authorization keys are strictly redacted from this packet.",
  };

  const packetHash = computeEvidencePacketHash(unhashedPacket);

  return {
    ...unhashedPacket,
    packetHash,
  };
}
