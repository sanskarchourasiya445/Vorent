import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import type { ApprovalRecord, CreateApprovalRequest } from "@warrant/contracts";
import {
  approvals,
  policyVersions,
  policies,
  testRuns,
  findings,
} from "../schema.js";
import {
  calculateCommittedAndActiveSpend,
  CheckoutError,
} from "./checkoutProposalRepository.js";
import { logAuditEvent } from "./auditRepository.js";

export interface ListApprovalsFilter {
  policyVersionId?: string;
}

/**
 * Lists approvals with calculated consumed spend and current status.
 */
export async function listApprovals(
  db: any,
  filter?: ListApprovalsFilter
): Promise<ApprovalRecord[]> {
  let query = db
    .select({
      id: approvals.id,
      ownerId: approvals.ownerId,
      policyVersionId: approvals.policyVersionId,
      policyHash: approvals.policyHash,
      qualifyingTestRunId: approvals.qualifyingTestRunId,
      spendLimitMinor: approvals.spendLimitMinor,
      currency: approvals.currency,
      expiresAt: approvals.expiresAt,
      revokedAt: approvals.revokedAt,
      createdAt: approvals.createdAt,
      policyName: policies.name,
    })
    .from(approvals)
    .leftJoin(policyVersions, eq(approvals.policyVersionId, policyVersions.id))
    .leftJoin(policies, eq(policyVersions.policyId, policies.id));

  if (filter?.policyVersionId) {
    query = query.where(eq(approvals.policyVersionId, filter.policyVersionId));
  }

  const rawList = await query;
  const result: ApprovalRecord[] = [];

  for (const a of rawList) {
    let consumedSpendMinor = 0;
    try {
      consumedSpendMinor = await calculateCommittedAndActiveSpend(db, a.id);
    } catch {
      consumedSpendMinor = 0;
    }

    const isRevoked = Boolean(a.revokedAt);
    const isExpired = new Date(a.expiresAt).getTime() <= Date.now();
    const status: "ACTIVE" | "EXPIRED" | "REVOKED" = isRevoked
      ? "REVOKED"
      : isExpired
      ? "EXPIRED"
      : "ACTIVE";

    result.push({
      id: a.id,
      ownerId: a.ownerId,
      policyVersionId: a.policyVersionId,
      policyHash: a.policyHash,
      policyName: a.policyName ?? undefined,
      qualifyingTestRunId: a.qualifyingTestRunId,
      spendLimitMinor: Number(a.spendLimitMinor),
      consumedSpendMinor,
      remainingSpendMinor: Math.max(0, Number(a.spendLimitMinor) - consumedSpendMinor),
      currency: a.currency,
      expiresAt: a.expiresAt instanceof Date ? a.expiresAt.toISOString() : a.expiresAt,
      revokedAt: a.revokedAt ? (a.revokedAt instanceof Date ? a.revokedAt.toISOString() : a.revokedAt) : null,
      createdAt: a.createdAt instanceof Date ? a.createdAt.toISOString() : a.createdAt,
      status,
    });
  }

  return result;
}

/**
 * Creates an approval bound to an immutable policy version and qualifying test run.
 * Strictly enforces Decision D-014:
 * 1. Qualifying test run exists and is COMPLETED.
 * 2. Policy version matches and policy hash matches.
 * 3. Unresolved CRITICAL or HIGH findings block approval.
 * 4. MEDIUM or LOW findings must be RESOLVED or ACCEPTED_RISK with non-empty owner rationale.
 * 5. CRITICAL and HIGH findings cannot be ACCEPTED_RISK in MVP.
 */
export async function createApproval(
  db: any,
  input: CreateApprovalRequest,
  ownerId: string
): Promise<ApprovalRecord> {
  const runInTx = typeof db.transaction === "function" ? (cb: any) => db.transaction(cb) : (cb: any) => cb(db);
  return await runInTx(async (tx: any) => {
    // 1. Verify qualifying test run exists
    const testRunsList = await tx
      .select()
      .from(testRuns)
      .where(eq(testRuns.id, input.qualifyingTestRunId));

    const run = testRunsList[0];
    if (!run) {
      throw new CheckoutError(
        "QUALIFYING_RUN_NOT_FOUND",
        `Qualifying test run ${input.qualifyingTestRunId} not found`
      );
    }

    if (run.status !== "COMPLETED") {
      throw new CheckoutError(
        "TEST_RUN_NOT_COMPLETED",
        `Qualifying test run must be in COMPLETED status (current: ${run.status})`
      );
    }

    if (run.policyVersionId !== input.policyVersionId) {
      throw new CheckoutError(
        "POLICY_VERSION_MISMATCH",
        `Qualifying test run policyVersionId (${run.policyVersionId}) does not match requested version (${input.policyVersionId})`
      );
    }

    // 2. Verify policy version exists and hash matches
    const policyVersionsList = await tx
      .select({
        id: policyVersions.id,
        policyId: policyVersions.policyId,
        policyHash: policyVersions.policyHash,
        policyName: policies.name,
      })
      .from(policyVersions)
      .leftJoin(policies, eq(policyVersions.policyId, policies.id))
      .where(eq(policyVersions.id, input.policyVersionId));

    const pv = policyVersionsList[0];
    if (!pv) {
      throw new CheckoutError(
        "POLICY_VERSION_NOT_FOUND",
        `Policy version ${input.policyVersionId} not found`
      );
    }

    if (pv.policyHash !== input.policyHash) {
      throw new CheckoutError(
        "POLICY_HASH_MISMATCH",
        `Policy hash mismatch for version ${input.policyVersionId}`
      );
    }

    // 3. Verify findings under Decision D-014
    const findingsList = await tx
      .select()
      .from(findings)
      .where(eq(findings.testRunId, input.qualifyingTestRunId));

    // First: CRITICAL and HIGH findings can NEVER be ACCEPTED_RISK in MVP
    const criticalOrHighAcceptedRisk = findingsList.filter(
      (f: any) =>
        (f.severity === "CRITICAL" || f.severity === "HIGH") &&
        f.status === "ACCEPTED_RISK"
    );
    if (criticalOrHighAcceptedRisk.length > 0) {
      const f = criticalOrHighAcceptedRisk[0];
      throw new CheckoutError(
        "CRITICAL_HIGH_CANNOT_BE_ACCEPTED_RISK",
        `CRITICAL and HIGH findings cannot be accepted as risk in MVP (Decision D-014). Finding ${f.id} is ${f.severity}.`
      );
    }

    // Check CRITICAL and HIGH findings must be RESOLVED
    const unresolvedCriticalOrHigh = findingsList.filter(
      (f: any) =>
        (f.severity === "CRITICAL" || f.severity === "HIGH") &&
        f.status !== "RESOLVED"
    );

    if (unresolvedCriticalOrHigh.length > 0) {
      throw new CheckoutError(
        "UNRESOLVED_CRITICAL_HIGH_FINDINGS",
        `Approval blocked by ${unresolvedCriticalOrHigh.length} unresolved CRITICAL or HIGH finding(s) (Decision D-014)`
      );
    }

    // Check MEDIUM and LOW findings & ACCEPTED_RISK rationale
    for (const f of findingsList) {
      if (f.severity === "MEDIUM" || f.severity === "LOW") {
        if (f.status === "OPEN") {
          throw new CheckoutError(
            "UNRESOLVED_FINDINGS",
            `MEDIUM and LOW findings must be RESOLVED or marked ACCEPTED_RISK with owner rationale (Decision D-014). Finding ${f.id} is OPEN.`
          );
        }
        if (f.status === "ACCEPTED_RISK") {
          if (!f.resolutionNote || f.resolutionNote.trim().length === 0) {
            throw new CheckoutError(
              "ACCEPTED_RISK_MISSING_RATIONALE",
              `ACCEPTED_RISK findings require a non-empty resolution note / rationale (Decision D-014). Finding ${f.id} has no rationale.`
            );
          }
        }
      }
    }

    // 4. Calculate expiration and insert approval
    const expiresInHours = input.expiresInHours ?? 24;
    const expiresAt = new Date(Date.now() + expiresInHours * 3600 * 1000);
    const approvalId = randomUUID();
    const now = new Date();

    const [created] = await tx
      .insert(approvals)
      .values({
        id: approvalId,
        ownerId,
        policyVersionId: input.policyVersionId,
        policyHash: input.policyHash,
        qualifyingTestRunId: input.qualifyingTestRunId,
        scope: {},
        spendLimitMinor: input.spendLimitMinor,
        currency: input.currency,
        expiresAt,
        revokedAt: null,
        createdAt: now,
      })
      .returning();

    await logAuditEvent(tx, {
      ownerId,
      actorType: "USER",
      eventType: "APPROVAL_CREATED",
      entityType: "APPROVAL",
      entityId: approvalId,
      payload: {
        policyVersionId: input.policyVersionId,
        policyHash: input.policyHash,
        spendLimitMinor: input.spendLimitMinor,
        currency: input.currency,
        expiresAt: expiresAt.toISOString(),
      },
    });

    return {
      id: created.id,
      ownerId: created.ownerId,
      policyVersionId: created.policyVersionId,
      policyHash: created.policyHash,
      policyName: pv.policyName ?? undefined,
      qualifyingTestRunId: created.qualifyingTestRunId,
      spendLimitMinor: Number(created.spendLimitMinor),
      consumedSpendMinor: 0,
      remainingSpendMinor: Number(created.spendLimitMinor),
      currency: created.currency,
      expiresAt: created.expiresAt instanceof Date ? created.expiresAt.toISOString() : created.expiresAt,
      revokedAt: null,
      createdAt: created.createdAt instanceof Date ? created.createdAt.toISOString() : created.createdAt,
      status: "ACTIVE",
    };
  });
}

/**
 * Revokes an active approval. Revocation is permanent and prevents any future checkout authorization.
 */
export async function revokeApproval(
  db: any,
  approvalId: string
): Promise<ApprovalRecord> {
  const existingList = await db
    .select()
    .from(approvals)
    .where(eq(approvals.id, approvalId));

  const existing = existingList[0];
  if (!existing) {
    throw new CheckoutError(
      "APPROVAL_NOT_FOUND",
      `Approval ${approvalId} not found`
    );
  }

  const now = new Date();
  const [updated] = await db
    .update(approvals)
    .set({ revokedAt: now })
    .where(eq(approvals.id, approvalId))
    .returning();

  let consumedSpendMinor = 0;
  try {
    consumedSpendMinor = await calculateCommittedAndActiveSpend(db, approvalId);
  } catch {
    consumedSpendMinor = 0;
  }

  await logAuditEvent(db, {
    ownerId: existing.ownerId,
    actorType: "USER",
    eventType: "APPROVAL_REVOKED",
    entityType: "APPROVAL",
    entityId: approvalId,
    payload: {
      revokedAt: now.toISOString(),
      consumedSpendMinor,
    },
  });

  return {
    id: updated.id,
    ownerId: updated.ownerId,
    policyVersionId: updated.policyVersionId,
    policyHash: updated.policyHash,
    qualifyingTestRunId: updated.qualifyingTestRunId,
    spendLimitMinor: Number(updated.spendLimitMinor),
    consumedSpendMinor,
    remainingSpendMinor: Math.max(0, Number(updated.spendLimitMinor) - consumedSpendMinor),
    currency: updated.currency,
    expiresAt: updated.expiresAt instanceof Date ? updated.expiresAt.toISOString() : updated.expiresAt,
    revokedAt: now.toISOString(),
    createdAt: updated.createdAt instanceof Date ? updated.createdAt.toISOString() : updated.createdAt,
    status: "REVOKED",
  };
}
