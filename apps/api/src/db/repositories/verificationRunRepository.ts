import { eq, desc } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  type PersistedTestRunDetail,
  type PersistedTestRunSummary,
  type VerificationReport,
  type VerificationRequest,
  PersistedTestRunDetailSchema,
  PersistedTestRunSummarySchema,
} from "@warrant/contracts";
import { findings, testRuns } from "../schema.js";

export interface SaveVerificationRunParams {
  ownerId: string;
  policyVersionId: string;
  policyHash?: string;
  request: VerificationRequest;
  report: VerificationReport;
}

/**
 * Persists a verification run and its counterexample findings in the database.
 * Preserves immutable input snapshot and full report.
 */
export async function saveVerificationRun(
  db: any,
  params: SaveVerificationRunParams,
): Promise<PersistedTestRunSummary> {
  const runId = randomUUID();
  const now = new Date();
  const startedAt = new Date(now.getTime() - (params.report.durationMs ?? 0));
  const policyHash = params.policyHash || params.report.policyHash || "0".repeat(64);

  await db.transaction(async (tx: any) => {
    // 1. Insert test run record
    await tx.insert(testRuns).values({
      id: runId,
      ownerId: params.ownerId,
      policyVersionId: params.policyVersionId,
      domainId: params.request.searchSpace.domainVersion ?? "1.0.0",
      domainVersion: params.request.searchSpace.domainVersion ?? "1.0.0",
      domainDefinition: params.request.searchSpace,
      runnerVersion: "1.0.0",
      status: params.report.status,
      candidateLimit: params.request.config?.maxCandidates ?? 500,
      candidateCount: params.report.searchSpaceEstimatedSize,
      exploredCount: params.report.totalCandidatesExplored,
      findingCount: params.report.findingCount,
      stopReason: params.report.stopReason,
      startedAt,
      finishedAt: now,
      resultSummary: params.report,
      createdAt: now,
    });

    // 2. Insert any findings
    if (params.report.findings && params.report.findings.length > 0) {
      for (const finding of params.report.findings) {
        await tx.insert(findings).values({
          id: randomUUID(),
          ownerId: params.ownerId,
          testRunId: runId,
          policyVersionId: params.policyVersionId,
          findingType: finding.violationType,
          severity: finding.severity,
          status: "OPEN",
          witness: finding.candidateCart,
          evidenceSnapshot: finding.evidence ?? {},
          ruleTrace: finding.actualOutcome.ruleTrace ?? [],
          reproduction: finding.reproduction,
          createdAt: now,
        });
      }
    }
  });

  return PersistedTestRunSummarySchema.parse({
    id: runId,
    policyVersionId: params.policyVersionId,
    policyHash,
    domainId: params.request.searchSpace.domainVersion ?? "1.0.0",
    domainVersion: params.request.searchSpace.domainVersion ?? "1.0.0",
    status: params.report.status,
    candidateLimit: params.request.config?.maxCandidates ?? 500,
    candidateCount: params.report.searchSpaceEstimatedSize,
    exploredCount: params.report.totalCandidatesExplored,
    findingCount: params.report.findingCount,
    unresolvedCount: params.report.unresolvedCount,
    stopReason: params.report.stopReason,
    exhausted: params.report.exhausted,
    durationMs: params.report.durationMs,
    startedAt: startedAt.toISOString(),
    finishedAt: now.toISOString(),
    createdAt: now.toISOString(),
  });
}

/**
 * Lists recent persisted verification runs.
 */
export async function listVerificationRuns(
  db: any,
  params?: {
    ownerId?: string;
    policyVersionId?: string;
    limit?: number;
  },
): Promise<PersistedTestRunSummary[]> {
  const limit = Math.min(params?.limit ?? 50, 100);

  let query = db
    .select({
      id: testRuns.id,
      policyVersionId: testRuns.policyVersionId,
      domainId: testRuns.domainId,
      domainVersion: testRuns.domainVersion,
      status: testRuns.status,
      candidateLimit: testRuns.candidateLimit,
      candidateCount: testRuns.candidateCount,
      exploredCount: testRuns.exploredCount,
      findingCount: testRuns.findingCount,
      stopReason: testRuns.stopReason,
      resultSummary: testRuns.resultSummary,
      startedAt: testRuns.startedAt,
      finishedAt: testRuns.finishedAt,
      createdAt: testRuns.createdAt,
    })
    .from(testRuns);

  if (params?.policyVersionId) {
    query = query.where(eq(testRuns.policyVersionId, params.policyVersionId));
  }

  const rows = await query.orderBy(desc(testRuns.createdAt)).limit(limit);

  return rows.map((r: any) => {
    const summary = r.resultSummary as VerificationReport;
    const policyHash = summary?.policyHash || "0".repeat(64);
    const durationMs = summary?.durationMs ?? 0;
    const exhausted = summary?.exhausted ?? false;
    const unresolvedCount = summary?.unresolvedCount ?? 0;

    return PersistedTestRunSummarySchema.parse({
      id: r.id,
      policyVersionId: r.policyVersionId,
      policyHash,
      domainId: r.domainId,
      domainVersion: r.domainVersion,
      status: r.status,
      candidateLimit: r.candidateLimit,
      candidateCount: r.candidateCount,
      exploredCount: r.exploredCount,
      findingCount: r.findingCount,
      unresolvedCount,
      stopReason: r.stopReason,
      exhausted,
      durationMs,
      startedAt: r.startedAt ? new Date(r.startedAt).toISOString() : null,
      finishedAt: r.finishedAt ? new Date(r.finishedAt).toISOString() : null,
      createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
    });
  });
}

/**
 * Retrieves a specific verification run by ID.
 */
export async function getVerificationRun(
  db: any,
  runId: string,
): Promise<PersistedTestRunDetail | null> {
  const rows = await db
    .select()
    .from(testRuns)
    .where(eq(testRuns.id, runId))
    .limit(1);

  if (rows.length === 0) {
    return null;
  }

  const r = rows[0];
  const report = r.resultSummary as VerificationReport;
  const policyHash = report?.policyHash || "0".repeat(64);
  const durationMs = report?.durationMs ?? 0;
  const exhausted = report?.exhausted ?? false;
  const unresolvedCount = report?.unresolvedCount ?? 0;

  return PersistedTestRunDetailSchema.parse({
    id: r.id,
    policyVersionId: r.policyVersionId,
    policyHash,
    domainId: r.domainId,
    domainVersion: r.domainVersion,
    status: r.status,
    candidateLimit: r.candidateLimit,
    candidateCount: r.candidateCount,
    exploredCount: r.exploredCount,
    findingCount: r.findingCount,
    unresolvedCount,
    stopReason: r.stopReason,
    exhausted,
    durationMs,
    domainDefinition: r.domainDefinition,
    report,
    startedAt: r.startedAt ? new Date(r.startedAt).toISOString() : null,
    finishedAt: r.finishedAt ? new Date(r.finishedAt).toISOString() : null,
    createdAt: new Date(r.createdAt).toISOString(),
  });
}
