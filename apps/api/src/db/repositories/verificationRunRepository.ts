import { eq, desc, and, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  type PersistedTestRunDetail,
  type PersistedTestRunSummary,
  type VerificationReport,
  type VerificationRequest,
  type FindingRecord,
  FindingRecordSchema,
  PersistedTestRunDetailSchema,
  PersistedTestRunSummarySchema,
} from "@warrant/contracts";
import { findings, testRuns } from "../schema.js";
import { logAuditEvent } from "./auditRepository.js";

export interface SaveVerificationRunParams {
  ownerId: string;
  policyVersionId: string;
  policyHash?: string;
  request: VerificationRequest;
  report: VerificationReport;
}

export const inMemoryTestRuns = new Map<string, PersistedTestRunDetail>();
export const inMemoryFindings = new Map<string, FindingRecord>();

/**
 * Persists a verification run and its counterexample findings in the database.
 * Preserves immutable input snapshot and full report with in-memory standby fallback.
 */
export async function saveVerificationRun(
  db: any,
  params: SaveVerificationRunParams,
): Promise<PersistedTestRunSummary> {
  const runId = randomUUID();
  const now = new Date();
  const startedAt = new Date(now.getTime() - (params.report.durationMs ?? 0));
  const policyHash = params.policyHash || params.report.policyHash || "0".repeat(64);

  // Store in memory fallback first
  const testRunDetail: PersistedTestRunDetail = PersistedTestRunDetailSchema.parse({
    id: runId,
    policyVersionId: params.policyVersionId,
    policyHash,
    domainId: params.request.searchSpace?.domainVersion ?? "1.0.0",
    domainVersion: params.request.searchSpace?.domainVersion ?? "1.0.0",
    status: params.report.status,
    candidateLimit: params.request.config?.maxCandidates ?? 500,
    candidateCount: params.report.searchSpaceEstimatedSize ?? 0,
    exploredCount: params.report.totalCandidatesExplored,
    findingCount: params.report.findingCount,
    unresolvedCount: params.report.unresolvedCount ?? params.report.findingCount,
    stopReason: params.report.stopReason ?? null,
    exhausted: Boolean(params.report.exhausted),
    durationMs: params.report.durationMs ?? 0,
    domainDefinition: params.request.searchSpace,
    report: params.report,
    startedAt: startedAt.toISOString(),
    finishedAt: now.toISOString(),
    createdAt: now.toISOString(),
  });
  inMemoryTestRuns.set(runId, testRunDetail);

  if (params.report.findings && params.report.findings.length > 0) {
    for (const finding of params.report.findings) {
      const findingId = randomUUID();
      const findingRecord = FindingRecordSchema.parse({
        id: findingId,
        ownerId: params.ownerId,
        testRunId: runId,
        policyVersionId: params.policyVersionId,
        findingType: finding.violationType,
        severity: finding.severity,
        status: "UNRESOLVED",
        witness: finding.candidateCart,
        evidenceSnapshot: finding.evidence ?? {},
        ruleTrace: finding.actualOutcome?.ruleTrace ?? [],
        reproduction: finding.reproduction ?? {},
        createdAt: now.toISOString(),
      });
      inMemoryFindings.set(findingId, findingRecord);
    }
  }

  // Try DB persistence
  try {
    await db.transaction(async (tx: any) => {
      // 1. Insert test run record
      await tx.insert(testRuns).values({
        id: runId,
        ownerId: params.ownerId,
        policyVersionId: params.policyVersionId,
        domainId: params.request.searchSpace?.domainVersion ?? "1.0.0",
        domainVersion: params.request.searchSpace?.domainVersion ?? "1.0.0",
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
            status: "UNRESOLVED",
            witness: finding.candidateCart,
            evidenceSnapshot: finding.evidence ?? {},
            ruleTrace: finding.actualOutcome?.ruleTrace ?? [],
            reproduction: finding.reproduction,
            createdAt: now,
          });
        }
      }

      await logAuditEvent(tx, {
        ownerId: params.ownerId,
        actorType: "SYSTEM",
        eventType: "VERIFICATION_RUN_COMPLETED",
        entityType: "TEST_RUN",
        entityId: runId,
        payload: {
          policyVersionId: params.policyVersionId,
          policyHash,
          status: params.report.status,
          findingCount: params.report.findingCount,
          stopReason: params.report.stopReason,
        },
      });
    });
  } catch {
    // Non-fatal if DB is in standby/unreachable mode
  }

  return PersistedTestRunSummarySchema.parse({
    id: runId,
    policyVersionId: params.policyVersionId,
    policyHash,
    domainId: params.request.searchSpace?.domainVersion ?? "1.0.0",
    domainVersion: params.request.searchSpace?.domainVersion ?? "1.0.0",
    status: params.report.status,
    candidateLimit: params.request.config?.maxCandidates ?? 500,
    candidateCount: params.report.searchSpaceEstimatedSize ?? 0,
    exploredCount: params.report.totalCandidatesExplored,
    findingCount: params.report.findingCount,
    unresolvedCount: params.report.unresolvedCount ?? params.report.findingCount,
    stopReason: params.report.stopReason ?? null,
    exhausted: Boolean(params.report.exhausted),
    durationMs: params.report.durationMs ?? 0,
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

  const memSummaries: PersistedTestRunSummary[] = Array.from(inMemoryTestRuns.values())
    .filter((r) => {
      if (params?.policyVersionId && r.policyVersionId !== params.policyVersionId) return false;
      if (params?.ownerId && (r as any).ownerId && (r as any).ownerId !== params.ownerId) return false;
      return true;
    })
    .map((r) =>
      PersistedTestRunSummarySchema.parse({
        id: r.id,
        policyVersionId: r.policyVersionId,
        policyHash: r.policyHash,
        domainId: r.domainId || "procurement-checkout-domain",
        domainVersion: r.domainVersion || "1.0.0",
        status: r.status,
        candidateLimit: r.candidateLimit,
        candidateCount: r.candidateCount,
        exploredCount: r.exploredCount,
        findingCount: r.findingCount,
        unresolvedCount: r.unresolvedCount,
        stopReason: r.stopReason,
        exhausted: r.exhausted,
        durationMs: r.durationMs,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
        createdAt: r.createdAt,
      }),
    );

  try {
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

    const whereClauses: any[] = [];
    if (params?.policyVersionId) {
      whereClauses.push(eq(testRuns.policyVersionId, params.policyVersionId));
    }
    if (params?.ownerId) {
      whereClauses.push(eq(testRuns.ownerId, params.ownerId));
    }
    if (whereClauses.length > 0) {
      query = query.where(whereClauses.length === 1 ? whereClauses[0] : and(...whereClauses));
    }

    const rows = await query.orderBy(desc(testRuns.createdAt)).limit(limit);

    const results: PersistedTestRunSummary[] = [];
    for (const r of rows) {
      const summary = (r.resultSummary as VerificationReport) || {};
      const policyHash = summary?.policyHash && summary.policyHash.length === 64
        ? summary.policyHash
        : "0".repeat(64);
      const durationMs = typeof summary?.durationMs === "number" ? summary.durationMs : 0;
      const exhausted = Boolean(summary?.exhausted);
      const unresolvedCount = typeof summary?.unresolvedCount === "number" ? summary.unresolvedCount : 0;

      const parsed = PersistedTestRunSummarySchema.safeParse({
        id: r.id,
        policyVersionId: r.policyVersionId,
        policyHash,
        domainId: r.domainId || "procurement-checkout-domain",
        domainVersion: r.domainVersion || "1.0.0",
        status: r.status || "COMPLETED",
        candidateLimit: typeof r.candidateLimit === "number" ? r.candidateLimit : 500,
        candidateCount: typeof r.candidateCount === "number" ? r.candidateCount : 0,
        exploredCount: typeof r.exploredCount === "number" ? r.exploredCount : 0,
        findingCount: typeof r.findingCount === "number" ? r.findingCount : 0,
        unresolvedCount,
        stopReason: r.stopReason ?? null,
        exhausted,
        durationMs,
        startedAt: r.startedAt ? new Date(r.startedAt).toISOString() : null,
        finishedAt: r.finishedAt ? new Date(r.finishedAt).toISOString() : null,
        createdAt: r.createdAt ? new Date(r.createdAt).toISOString() : new Date().toISOString(),
      });
      if (parsed.success) {
        results.push(parsed.data);
      }
    }

    // Merge in-memory records
    const seenIds = new Set(results.map((item) => item.id));
    for (const memItem of memSummaries) {
      if (!seenIds.has(memItem.id)) {
        results.push(memItem);
      }
    }

    return results.slice(0, limit);
  } catch {
    return memSummaries.slice(0, limit);
  }
}

/**
 * Retrieves a specific verification run by ID.
 */
export async function getVerificationRun(
  db: any,
  runId: string,
): Promise<PersistedTestRunDetail | null> {
  const mem = inMemoryTestRuns.get(runId);
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(runId);
  if (!isUuid) {
    return mem ?? null;
  }

  try {
    const rows = await db
      .select()
      .from(testRuns)
      .where(eq(testRuns.id, runId))
      .limit(1);

    if (rows.length === 0) {
      return mem ?? null;
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
  } catch {
    return mem ?? null;
  }
}

/**
 * Lists findings with optional filters.
 */
export async function listFindings(
  db: any,
  params?: {
    testRunId?: string;
    policyVersionId?: string;
    status?: string;
    ownerId?: string;
    limit?: number;
  },
): Promise<FindingRecord[]> {
  const limit = Math.min(params?.limit ?? 50, 100);

  const memFindings = Array.from(inMemoryFindings.values()).filter((f) => {
    if (params?.testRunId && f.testRunId !== params.testRunId) return false;
    if (params?.policyVersionId && f.policyVersionId !== params.policyVersionId) return false;
    if (params?.status) {
      if (params.status === "UNRESOLVED") {
        if (f.status !== "UNRESOLVED" && (f.status as any) !== "OPEN") return false;
      } else if (f.status !== params.status) {
        return false;
      }
    }
    if (params?.ownerId && f.ownerId !== params.ownerId) return false;
    return true;
  });

  try {
    const conditions = [];
    if (params?.testRunId) conditions.push(eq(findings.testRunId, params.testRunId));
    if (params?.policyVersionId) conditions.push(eq(findings.policyVersionId, params.policyVersionId));
    if (params?.status) {
      if (params.status === "UNRESOLVED") {
        conditions.push(or(eq(findings.status, "UNRESOLVED"), eq(findings.status, "OPEN")));
      } else {
        conditions.push(eq(findings.status, params.status));
      }
    }
    if (params?.ownerId) conditions.push(eq(findings.ownerId, params.ownerId));

    let query = db.select().from(findings);
    if (conditions.length > 0) {
      query = query.where(conditions.length === 1 ? conditions[0] : and(...conditions));
    }

    const rows = await query.orderBy(desc(findings.createdAt)).limit(limit);

    const results = rows.map((r: any) =>
      FindingRecordSchema.parse({
        id: r.id,
        ownerId: r.ownerId,
        testRunId: r.testRunId,
        policyVersionId: r.policyVersionId,
        findingType: r.findingType,
        severity: r.severity,
        status: r.status === "OPEN" ? "UNRESOLVED" : r.status,
        witness: r.witness,
        evidenceSnapshot: r.evidenceSnapshot ?? {},
        ruleTrace: r.ruleTrace ?? [],
        reproduction: r.reproduction ?? {},
        resolvedByVersionId: r.resolvedByVersionId,
        resolutionNote: r.resolutionNote,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : new Date(r.createdAt).toISOString(),
        resolvedAt: r.resolvedAt ? (r.resolvedAt instanceof Date ? r.resolvedAt.toISOString() : new Date(r.resolvedAt).toISOString()) : null,
      }),
    );

    const seenIds = new Set(results.map((f: FindingRecord) => f.id));
    for (const mem of memFindings) {
      if (!seenIds.has(mem.id)) {
        results.push(mem);
      }
    }

    return results.slice(0, limit);
  } catch {
    return memFindings.slice(0, limit);
  }
}

/**
 * Retrieves a single finding by ID.
 */
export async function getFinding(
  db: any,
  findingId: string,
): Promise<FindingRecord | null> {
  const mem = inMemoryFindings.get(findingId);
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(findingId);
  if (!isUuid) {
    return mem ?? null;
  }

  try {
    const rows = await db
      .select()
      .from(findings)
      .where(eq(findings.id, findingId))
      .limit(1);

    if (rows.length === 0) {
      return mem ?? null;
    }

    const r = rows[0];
    return FindingRecordSchema.parse({
      id: r.id,
      ownerId: r.ownerId,
      testRunId: r.testRunId,
      policyVersionId: r.policyVersionId,
      findingType: r.findingType,
      severity: r.severity,
      status: r.status === "OPEN" ? "UNRESOLVED" : r.status,
      witness: r.witness,
      evidenceSnapshot: r.evidenceSnapshot ?? {},
      ruleTrace: r.ruleTrace ?? [],
      reproduction: r.reproduction ?? {},
      resolvedByVersionId: r.resolvedByVersionId,
      resolutionNote: r.resolutionNote,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : new Date(r.createdAt).toISOString(),
      resolvedAt: r.resolvedAt ? (r.resolvedAt instanceof Date ? r.resolvedAt.toISOString() : new Date(r.resolvedAt).toISOString()) : null,
    });
  } catch {
    return mem ?? null;
  }
}

/**
 * Resolves a finding by linking it to a repairing policy version.
 */
export async function resolveFinding(
  db: any,
  findingId: string,
  resolvedByVersionId: string,
  resolutionNote: string,
): Promise<FindingRecord> {
  const existing = await getFinding(db, findingId);
  if (!existing) {
    throw new Error(`Finding '${findingId}' was not found.`);
  }

  const now = new Date();
  try {
    await db
      .update(findings)
      .set({
        status: "RESOLVED",
        resolvedByVersionId,
        resolutionNote,
        resolvedAt: now,
      })
      .where(eq(findings.id, findingId));

    await logAuditEvent(db, {
      ownerId: existing.ownerId,
      actorType: "USER",
      eventType: "FINDING_RESOLVED",
      entityType: "FINDING",
      entityId: findingId,
      payload: {
        resolvedByVersionId,
        resolutionNote,
      },
    });
  } catch {
    // Non-fatal if DB is in standby
  }

  const mem = inMemoryFindings.get(findingId);
  if (mem) {
    mem.status = "RESOLVED";
    mem.resolvedByVersionId = resolvedByVersionId;
    mem.resolutionNote = resolutionNote;
    mem.resolvedAt = now.toISOString();
  }

  const updated = await getFinding(db, findingId);
  if (!updated) {
    return {
      ...existing,
      status: "RESOLVED",
      resolvedByVersionId,
      resolutionNote,
      resolvedAt: now.toISOString(),
    };
  }
  return updated;
}

/**
 * Accepts risk for a finding with mandatory owner rationale.
 * Strictly enforces Decision D-014:
 * CRITICAL and HIGH findings cannot be accepted as risk in MVP. Only MEDIUM and LOW are allowed.
 */
export async function acceptRiskFinding(
  db: any,
  findingId: string,
  rationale: string,
): Promise<FindingRecord> {
  const existing = await getFinding(db, findingId);
  if (!existing) {
    throw new Error(`Finding '${findingId}' was not found.`);
  }

  if (existing.severity === "CRITICAL" || existing.severity === "HIGH") {
    throw new Error(`Decision D-014 invariant violation: ${existing.severity} findings cannot be accepted as risk. A policy repair is required.`);
  }

  if (!rationale || rationale.trim().length === 0) {
    throw new Error("A non-empty rationale is mandatory when accepting risk for a finding.");
  }

  const now = new Date();
  try {
    await db
      .update(findings)
      .set({
        status: "ACCEPTED_RISK",
        resolutionNote: rationale.trim(),
        resolvedAt: now,
      })
      .where(eq(findings.id, findingId));

    await logAuditEvent(db, {
      ownerId: existing.ownerId,
      actorType: "USER",
      eventType: "FINDING_RISK_ACCEPTED",
      entityType: "FINDING",
      entityId: findingId,
      payload: {
        rationale: rationale.trim(),
        severity: existing.severity,
      },
    });
  } catch {
    // Non-fatal if DB is in standby
  }

  const mem = inMemoryFindings.get(findingId);
  if (mem) {
    mem.status = "ACCEPTED_RISK";
    mem.resolutionNote = rationale.trim();
    mem.resolvedAt = now.toISOString();
  }

  const updated = await getFinding(db, findingId);
  if (!updated) {
    return {
      ...existing,
      status: "ACCEPTED_RISK",
      resolutionNote: rationale.trim(),
      resolvedAt: now.toISOString(),
    };
  }
  return updated;
}
