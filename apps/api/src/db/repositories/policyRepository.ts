import { eq, desc, max, sql, isNull, and } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import {
  type CreatePolicyRequest,
  type CreatePolicyVersionRequest,
  type PolicySummary,
  type PolicyVersionRecord,
  PolicyVersionRecordSchema,
} from "@warrant/contracts";
import { computePolicyHash } from "@warrant/domain";
import { policies, policyVersions, users } from "../schema.js";
import { CANONICAL_POLICY_PRESETS as POLICY_PRESETS } from "@warrant/test-fixtures";
import { logAuditEvent } from "./auditRepository.js";

export const SYSTEM_DEFAULT_USER_SUBJECT = "system:default_owner";

export interface InMemoryPolicy {
  id: string;
  ownerId: string;
  name: string;
  sourceMandate: string;
  currentVersionId: string;
  archivedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface InMemoryPolicyVersion {
  id: string;
  policyId: string;
  ownerId: string;
  versionNumber: number;
  sourceMandateSnapshot: string;
  intentSpec: any;
  policyDocument: any;
  policySchemaVersion: string;
  canonicalizationVersion: string;
  policyHash: string;
  confirmationState: string;
  createdAt: Date;
}

export const inMemoryPolicies = new Map<string, InMemoryPolicy>();
export const inMemoryPolicyVersions = new Map<string, InMemoryPolicyVersion>();

export function normalizeIntentSpec(intentSpec: any, policyDoc?: any, name?: string): any {
  if (!intentSpec || typeof intentSpec !== "object") {
    return {
      name: name || "Purchase Mandate Intent",
      currency: policyDoc?.currency || "USD",
      maxItemPriceMinor: policyDoc?.maxItemPriceMinor,
      maxCartTotalMinor: policyDoc?.maxCartTotalMinor,
      allowedCategories: policyDoc?.allowedCategories,
      prohibitedCategories: policyDoc?.prohibitedCategories,
      requireEvidence: policyDoc?.requireEvidence,
    };
  }
  return {
    ...intentSpec,
    name: intentSpec.name || name || "Purchase Mandate Intent",
    currency: intentSpec.currency || policyDoc?.currency || "USD",
    maxItemPriceMinor: intentSpec.maxItemPriceMinor ?? policyDoc?.maxItemPriceMinor,
    maxCartTotalMinor: intentSpec.maxCartTotalMinor ?? policyDoc?.maxCartTotalMinor,
    allowedCategories: intentSpec.allowedCategories ?? policyDoc?.allowedCategories,
    prohibitedCategories: intentSpec.prohibitedCategories ?? policyDoc?.prohibitedCategories,
    requireEvidence: intentSpec.requireEvidence ?? policyDoc?.requireEvidence,
  };
}

/**
 * Ensures the default owner user exists in the users table.
 * Idempotent: returns existing user UUID or creates one.
 */
export async function ensureDefaultUser(db: any): Promise<string> {
  const fallbackOwnerId = "00000000-0000-0000-0000-000000000001";
  try {
    const existing = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.authSubject, SYSTEM_DEFAULT_USER_SUBJECT))
      .limit(1);

    if (existing.length > 0 && existing[0]?.id) {
      return existing[0].id;
    }

    const newId = randomUUID();
    try {
      const insertBuilder = db.insert(users).values({
        id: newId,
        authSubject: SYSTEM_DEFAULT_USER_SUBJECT,
      });

      if (typeof insertBuilder?.onConflictDoNothing === "function") {
        await insertBuilder.onConflictDoNothing({ target: users.authSubject });
      } else {
        await insertBuilder;
      }
    } catch (err: any) {
      const isConflict =
        err?.code === "23505" ||
        err?.message?.includes("duplicate key") ||
        err?.message?.includes("unique") ||
        err?.constraint?.includes("users_auth_subject");

      if (!isConflict) {
        throw err;
      }
    }

    const fallback = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.authSubject, SYSTEM_DEFAULT_USER_SUBJECT))
      .limit(1);

    if (fallback.length > 0 && fallback[0]?.id) {
      return fallback[0].id;
    }

    return newId;
  } catch (err: any) {
    // When database is unreachable or in standby/offline mode, return stable default fallback
    return fallbackOwnerId;
  }
}

/**
 * Helper to query an existing preset version from the database.
 */
async function findExistingPresetVersion(
  targetDb: any,
  preset: any,
): Promise<PolicyVersionRecord | null> {
  const existingPolicies = await targetDb
    .select({
      id: policies.id,
      currentVersionId: policies.currentVersionId,
    })
    .from(policies)
    .where(eq(policies.name, preset.name))
    .limit(1);

  if (existingPolicies.length > 0 && existingPolicies[0]?.currentVersionId) {
    const existingVersion = await targetDb
      .select()
      .from(policyVersions)
      .where(eq(policyVersions.id, existingPolicies[0].currentVersionId))
      .limit(1);

    if (existingVersion.length > 0) {
      const v = existingVersion[0];
      return PolicyVersionRecordSchema.parse({
        id: v.id,
        policyId: v.policyId,
        ownerId: v.ownerId,
        name: preset.name,
        versionNumber: v.versionNumber,
        sourceMandateSnapshot: v.sourceMandateSnapshot,
        intentSpec: normalizeIntentSpec(v.intentSpec, v.policyDocument, preset.name),
        policyDocument: v.policyDocument,
        policySchemaVersion: v.policySchemaVersion,
        canonicalizationVersion: v.canonicalizationVersion,
        policyHash: v.policyHash,
        confirmationState: v.confirmationState,
        createdAt: v.createdAt instanceof Date ? v.createdAt.toISOString() : new Date(v.createdAt).toISOString(),
        isPreset: true,
        presetId: preset.id,
      });
    }
  }

  return null;
}

/**
 * Idempotently resolves a built-in preset ID to a persisted policy_version row in PostgreSQL.
 * If the preset version already exists in the database, returns the existing record.
 * If not, inserts the policy and initial version 1 record bound to ownerId safely under
 * a PostgreSQL transactional advisory lock to prevent concurrent initialization races.
 */
export async function resolveOrCreatePresetVersion(
  db: any,
  presetId: string,
  ownerId: string,
): Promise<PolicyVersionRecord | null> {
  const preset = POLICY_PRESETS[presetId] || Object.values(POLICY_PRESETS).find((p) => p.id === presetId);
  if (!preset) return null;

  // 1. Fast-path check: If preset already exists, return immediately without locking
  const existing = await findExistingPresetVersion(db, preset);
  if (existing) {
    return existing;
  }

  // 2. Concurrency-safe initialization inside transaction with PostgreSQL advisory lock
  return await db.transaction(async (tx: any) => {
    // Acquire PostgreSQL transactional advisory lock scoped to this preset ID
    try {
      if (typeof tx.execute === "function") {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtext(${'warrant:preset:' + preset.id}))`
        );
      }
    } catch {
      // Non-PostgreSQL or in-memory test doubles that don't support pg_advisory_xact_lock
    }

    // Double-checked locking: re-check if another concurrent transaction initialized the preset while waiting for the lock
    const existingUnderLock = await findExistingPresetVersion(tx, preset);
    if (existingUnderLock) {
      return existingUnderLock;
    }

    // 3. Insert policy and version 1 idempotently
    const policyId = randomUUID();
    const versionId = randomUUID();
    const policyHash = preset.hash || computePolicyHash(preset.policy);

    await tx.insert(policies).values({
      id: policyId,
      ownerId,
      name: preset.name,
      sourceMandate: preset.intent.name,
      currentVersionId: versionId,
    });

    await tx.insert(policyVersions).values({
      id: versionId,
      policyId,
      ownerId,
      versionNumber: 1,
      sourceMandateSnapshot: preset.intent.name,
      intentSpec: preset.intent,
      policyDocument: preset.policy,
      policySchemaVersion: preset.policy.schemaVersion ?? "1.0",
      canonicalizationVersion: "1.0.0",
      policyHash,
      confirmationState: "CONFIRMED",
    });

    return PolicyVersionRecordSchema.parse({
      id: versionId,
      policyId,
      ownerId,
      name: preset.name,
      versionNumber: 1,
      sourceMandateSnapshot: preset.intent.name,
      intentSpec: preset.intent,
      policyDocument: preset.policy,
      policySchemaVersion: preset.policy.schemaVersion ?? "1.0",
      canonicalizationVersion: "1.0.0",
      policyHash,
      confirmationState: "CONFIRMED",
      createdAt: new Date().toISOString(),
      isPreset: true,
      presetId: preset.id,
    });
  });
}

/**
 * Seeds built-in policy presets into the database idempotently.
 * Never inserts duplicates on repeated startup.
 */
export async function seedPresets(db: any, ownerId: string): Promise<void> {
  for (const presetKey of Object.keys(POLICY_PRESETS)) {
    await resolveOrCreatePresetVersion(db, presetKey, ownerId);
  }
}

/**
 * Lists all policies. If database is available, combines DB records with preset manifests.
 * Also merges in-memory custom policies if running in standby/fallback mode.
 */
export async function listPolicies(db: any, ownerId?: string, includeArchived = false): Promise<PolicySummary[]> {
  const summaries: PolicySummary[] = [];
  const seenIds = new Set<string>();

  try {
    const query = db
      .select({
        id: policies.id,
        name: policies.name,
        sourceMandate: policies.sourceMandate,
        currentVersionId: policies.currentVersionId,
        archivedAt: policies.archivedAt,
        createdAt: policies.createdAt,
        updatedAt: policies.updatedAt,
      })
      .from(policies);

    let whereClause = includeArchived ? undefined : isNull(policies.archivedAt);
    if (ownerId) {
      whereClause = whereClause
        ? and(whereClause, eq(policies.ownerId, ownerId))
        : eq(policies.ownerId, ownerId);
    }

    const dbPolicies = whereClause
      ? await query.where(whereClause).orderBy(desc(policies.updatedAt))
      : await query.orderBy(desc(policies.updatedAt));

    // Batch fetch all policy versions for all policies in one query to avoid N+1 query waterfall
    let allVersions: any[] = [];
    try {
      allVersions = await db
        .select({
          id: policyVersions.id,
          policyId: policyVersions.policyId,
          versionNumber: policyVersions.versionNumber,
          policyHash: policyVersions.policyHash,
        })
        .from(policyVersions);
    } catch {
      // Fallback if batch query fails
    }

    const versionById = new Map<string, { versionNumber: number; policyHash: string }>();
    const versionsByPolicyId = new Map<string, { id: string; versionNumber: number; policyHash: string }[]>();

    for (const v of allVersions) {
      versionById.set(v.id, { versionNumber: v.versionNumber, policyHash: v.policyHash });
      const list = versionsByPolicyId.get(v.policyId) || [];
      list.push({ id: v.id, versionNumber: v.versionNumber, policyHash: v.policyHash });
      versionsByPolicyId.set(v.policyId, list);
    }

    for (const p of dbPolicies) {
      let versionNumber = 1;
      let policyHash = "";
      let effectiveCurrentVersionId = p.currentVersionId;
      const policyVList = versionsByPolicyId.get(p.id) || [];
      const versionCount = policyVList.length > 0 ? policyVList.length : 1;

      if (p.currentVersionId && versionById.has(p.currentVersionId)) {
        const v = versionById.get(p.currentVersionId)!;
        versionNumber = v.versionNumber;
        policyHash = v.policyHash;
      } else if (policyVList.length > 0) {
        const sorted = [...policyVList].sort((a, b) => b.versionNumber - a.versionNumber);
        const latest = sorted[0];
        if (latest) {
          versionNumber = latest.versionNumber;
          policyHash = latest.policyHash;
          if (!effectiveCurrentVersionId) {
            effectiveCurrentVersionId = latest.id;
          }
        }
      }

      // Check if this policy matches a preset
      const matchedPreset = Object.values(POLICY_PRESETS).find((pr) => pr.name === p.name);
      if (!policyHash && matchedPreset) {
        policyHash = matchedPreset.hash;
      }

      seenIds.add(p.id);
      summaries.push({
        id: p.id,
        name: p.name,
        sourceMandate: p.sourceMandate,
        currentVersionId: effectiveCurrentVersionId,
        currentVersionNumber: versionNumber,
        policyHash: policyHash || undefined,
        isPreset: Boolean(matchedPreset),
        presetId: matchedPreset?.id,
        versionCount,
        createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: p.updatedAt ? new Date(p.updatedAt).toISOString() : new Date().toISOString(),
      });
    }
  } catch {
    // If DB is unavailable, continue with in-memory policies + presets
  }

  // Merge in-memory custom policies
  for (const [id, mem] of inMemoryPolicies.entries()) {
    if (!seenIds.has(id)) {
      if (!includeArchived && mem.archivedAt) continue;
      if (ownerId && mem.ownerId !== ownerId) continue;
      const memV = inMemoryPolicyVersions.get(mem.currentVersionId);
      summaries.push({
        id: mem.id,
        name: mem.name,
        sourceMandate: mem.sourceMandate,
        currentVersionId: mem.currentVersionId,
        currentVersionNumber: memV?.versionNumber ?? 1,
        policyHash: memV?.policyHash,
        isPreset: false,
        versionCount: 1,
        createdAt: mem.createdAt.toISOString(),
        updatedAt: mem.updatedAt.toISOString(),
      });
      seenIds.add(id);
    }
  }

  // Combine with preset summaries for any preset not yet in DB/memory
  const presetSummaries = getPresetSummaries();
  for (const preset of presetSummaries) {
    const alreadyPresent = summaries.some(
      (s) => s.id === preset.id || s.presetId === preset.id || s.name === preset.name
    );
    if (!alreadyPresent) {
      summaries.push(preset);
    }
  }

  return summaries;
}

/**
 * Returns built-in presets as PolicySummary array.
 */
export function getPresetSummaries(): PolicySummary[] {
  return Object.values(POLICY_PRESETS).map((preset) => ({
    id: preset.id,
    name: preset.name,
    sourceMandate: preset.intent.name,
    currentVersionId: preset.id,
    currentVersionNumber: 1,
    policyHash: preset.hash,
    isPreset: true,
    presetId: preset.id,
    versionCount: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
}

/**
 * Retrieves a specific policy version by ID, version ID, or preset ID.
 */
export async function getPolicyVersion(
  db: any,
  identifier: string,
): Promise<PolicyVersionRecord | null> {
  // 1. Check if identifier is a known preset
  const preset = POLICY_PRESETS[identifier] || Object.values(POLICY_PRESETS).find((p) => p.id === identifier);

  try {
    // Check if identifier is a UUID
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier);

    if (isUuid) {
      // Try direct match on policy_versions.id
      const directVersion = await db
        .select()
        .from(policyVersions)
        .where(eq(policyVersions.id, identifier))
        .limit(1);

      if (directVersion.length > 0) {
        const v = directVersion[0];
        const p = await db
          .select({ name: policies.name })
          .from(policies)
          .where(eq(policies.id, v.policyId))
          .limit(1);

        const matchedPreset = Object.values(POLICY_PRESETS).find((pr) => pr.name === p[0]?.name);

        return PolicyVersionRecordSchema.parse({
          id: v.id,
          policyId: v.policyId,
          ownerId: v.ownerId,
          name: p[0]?.name ?? "Unnamed Policy",
          versionNumber: v.versionNumber,
          sourceMandateSnapshot: v.sourceMandateSnapshot,
          intentSpec: normalizeIntentSpec(v.intentSpec, v.policyDocument, p[0]?.name),
          policyDocument: v.policyDocument,
          policySchemaVersion: v.policySchemaVersion,
          canonicalizationVersion: v.canonicalizationVersion,
          policyHash: v.policyHash,
          confirmationState: v.confirmationState,
          createdAt: new Date(v.createdAt).toISOString(),
          isPreset: Boolean(matchedPreset),
          presetId: matchedPreset?.id,
        });
      }

      // Try match on policies.id -> fetch current version or latest version
      const policyRecord = await db
        .select()
        .from(policies)
        .where(eq(policies.id, identifier))
        .limit(1);

      if (policyRecord.length > 0) {
        if (policyRecord[0].currentVersionId) {
          const cv = await getPolicyVersion(db, policyRecord[0].currentVersionId);
          if (cv) return cv;
        }

        // If currentVersionId is null or not found, find the latest version for this policy
        const latestVersions = await db
          .select()
          .from(policyVersions)
          .where(eq(policyVersions.policyId, identifier))
          .orderBy(desc(policyVersions.versionNumber))
          .limit(1);

        if (latestVersions.length > 0) {
          const v = latestVersions[0];
          const matchedPreset = Object.values(POLICY_PRESETS).find((pr) => pr.name === policyRecord[0].name);

          // Self-heal: update currentVersionId on the policy record
          try {
            await db
              .update(policies)
              .set({ currentVersionId: v.id })
              .where(eq(policies.id, identifier));
          } catch {
            // Non-blocking self-heal
          }

          return PolicyVersionRecordSchema.parse({
            id: v.id,
            policyId: v.policyId,
            ownerId: v.ownerId,
            name: policyRecord[0].name ?? "Unnamed Policy",
            versionNumber: v.versionNumber,
            sourceMandateSnapshot: v.sourceMandateSnapshot,
            intentSpec: normalizeIntentSpec(v.intentSpec, v.policyDocument, policyRecord[0].name),
            policyDocument: v.policyDocument,
            policySchemaVersion: v.policySchemaVersion,
            canonicalizationVersion: v.canonicalizationVersion,
            policyHash: v.policyHash,
            confirmationState: v.confirmationState,
            createdAt: new Date(v.createdAt).toISOString(),
            isPreset: Boolean(matchedPreset),
            presetId: matchedPreset?.id,
          });
        }
      }
    }

    // Try finding by preset name if matched
    if (preset) {
      const dbMatch = await db
        .select({
          id: policyVersions.id,
          policyId: policyVersions.policyId,
          ownerId: policyVersions.ownerId,
          versionNumber: policyVersions.versionNumber,
          sourceMandateSnapshot: policyVersions.sourceMandateSnapshot,
          intentSpec: policyVersions.intentSpec,
          policyDocument: policyVersions.policyDocument,
          policySchemaVersion: policyVersions.policySchemaVersion,
          canonicalizationVersion: policyVersions.canonicalizationVersion,
          policyHash: policyVersions.policyHash,
          confirmationState: policyVersions.confirmationState,
          createdAt: policyVersions.createdAt,
        })
        .from(policyVersions)
        .innerJoin(policies, eq(policyVersions.policyId, policies.id))
        .where(eq(policies.name, preset.name))
        .orderBy(desc(policyVersions.versionNumber))
        .limit(1);

      if (dbMatch.length > 0) {
        const v = dbMatch[0];
        return PolicyVersionRecordSchema.parse({
          id: v.id,
          policyId: v.policyId,
          ownerId: v.ownerId,
          name: preset.name,
          versionNumber: v.versionNumber,
          sourceMandateSnapshot: v.sourceMandateSnapshot,
          intentSpec: normalizeIntentSpec(v.intentSpec, v.policyDocument, preset.name),
          policyDocument: v.policyDocument,
          policySchemaVersion: v.policySchemaVersion,
          canonicalizationVersion: v.canonicalizationVersion,
          policyHash: v.policyHash,
          confirmationState: v.confirmationState,
          createdAt: new Date(v.createdAt).toISOString(),
          isPreset: true,
          presetId: preset.id,
        });
      }
    }
  } catch {
    // If DB error, proceed to fallback
  }

  // 3. Fallback to in-memory custom policy versions
  const memVersion = inMemoryPolicyVersions.get(identifier);
  if (memVersion) {
    const memPolicy = inMemoryPolicies.get(memVersion.policyId);
    return PolicyVersionRecordSchema.parse({
      id: memVersion.id,
      policyId: memVersion.policyId,
      ownerId: memVersion.ownerId,
      name: memPolicy?.name || "Custom Policy",
      versionNumber: memVersion.versionNumber,
      sourceMandateSnapshot: memVersion.sourceMandateSnapshot,
      intentSpec: normalizeIntentSpec(memVersion.intentSpec, memVersion.policyDocument, memPolicy?.name),
      policyDocument: memVersion.policyDocument,
      policySchemaVersion: memVersion.policySchemaVersion,
      canonicalizationVersion: memVersion.canonicalizationVersion,
      policyHash: memVersion.policyHash,
      confirmationState: memVersion.confirmationState,
      createdAt: memVersion.createdAt.toISOString(),
      isPreset: false,
    });
  }

  // Check if identifier is inMemory policyId
  const memPolicy = inMemoryPolicies.get(identifier);
  if (memPolicy) {
    if (memPolicy.currentVersionId) {
      const cv = await getPolicyVersion(db, memPolicy.currentVersionId);
      if (cv) return cv;
    }
    const memVersions = Array.from(inMemoryPolicyVersions.values()).filter((v) => v.policyId === identifier);
    if (memVersions.length > 0) {
      memVersions.sort((a, b) => b.versionNumber - a.versionNumber);
      const firstMemVersion = memVersions[0];
      if (firstMemVersion) {
        return getPolicyVersion(db, firstMemVersion.id);
      }
    }
  }

  // 4. Fallback to in-memory preset if matched
  if (preset) {
    return PolicyVersionRecordSchema.parse({
      id: preset.id,
      policyId: preset.id,
      name: preset.name,
      versionNumber: 1,
      sourceMandateSnapshot: preset.intent.name,
      intentSpec: preset.intent,
      policyDocument: preset.policy,
      policySchemaVersion: preset.policy.schemaVersion ?? "1.0",
      canonicalizationVersion: "1.0.0",
      policyHash: preset.hash,
      confirmationState: "CONFIRMED",
      createdAt: new Date().toISOString(),
      isPreset: true,
      presetId: preset.id,
    });
  }

  return null;
}

/**
 * Creates a brand new policy and initial version 1 record.
 * Handles duplicate name checks, PostgreSQL persistence, and in-memory registration.
 */
export async function createPolicy(
  db: any,
  input: CreatePolicyRequest,
  ownerId: string,
): Promise<PolicyVersionRecord> {
  const trimmedName = input.name.trim();
  if (!trimmedName) {
    const error: any = new Error("Policy name cannot be empty.");
    error.statusCode = 400;
    error.code = "VALIDATION_ERROR";
    throw error;
  }

  // Duplicate name check in memory
  const duplicateMem = Array.from(inMemoryPolicies.values()).find(
    (p) => p.name.toLowerCase() === trimmedName.toLowerCase() && !p.archivedAt
  );
  if (duplicateMem) {
    const error: any = new Error(`A policy named '${trimmedName}' already exists.`);
    error.statusCode = 409;
    error.code = "POLICY_NAME_EXISTS";
    throw error;
  }

  const policyId = randomUUID();
  const versionId = randomUUID();
  const policyHash = computePolicyHash(input.policy);
  const now = new Date();

  // Try DB
  try {
    const existing = await db
      .select({ id: policies.id })
      .from(policies)
      .where(and(eq(policies.name, trimmedName), isNull(policies.archivedAt)))
      .limit(1);

    if (existing.length > 0) {
      const error: any = new Error(`A policy named '${trimmedName}' already exists.`);
      error.statusCode = 409;
      error.code = "POLICY_NAME_EXISTS";
      throw error;
    }

    await db.transaction(async (tx: any) => {
      await tx.insert(policies).values({
        id: policyId,
        ownerId,
        name: trimmedName,
        sourceMandate: input.sourceMandate,
        currentVersionId: versionId,
        createdAt: now,
        updatedAt: now,
      });

      await tx.insert(policyVersions).values({
        id: versionId,
        policyId,
        ownerId,
        versionNumber: 1,
        sourceMandateSnapshot: input.sourceMandate,
        intentSpec: input.intent,
        policyDocument: input.policy,
        policySchemaVersion: input.policy.schemaVersion ?? "1.0",
        canonicalizationVersion: "1.0.0",
        policyHash,
        confirmationState: input.confirmationState ?? "CONFIRMED",
        createdAt: now,
      });

      await logAuditEvent(tx, {
        ownerId,
        actorType: "USER",
        eventType: "POLICY_CREATED",
        entityType: "POLICY",
        entityId: policyId,
        payload: {
          name: trimmedName,
          sourceMandate: input.sourceMandate,
          initialVersionId: versionId,
          policyHash,
        },
      });
    });
  } catch (err: any) {
    if (err.statusCode === 409 || err.code === "POLICY_NAME_EXISTS") {
      throw err;
    }
    // Non-fatal if DB is in standby/unavailable mode
  }

  // Register in memory fallback store
  inMemoryPolicies.set(policyId, {
    id: policyId,
    ownerId,
    name: trimmedName,
    sourceMandate: input.sourceMandate,
    currentVersionId: versionId,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
  });

  inMemoryPolicyVersions.set(versionId, {
    id: versionId,
    policyId,
    ownerId,
    versionNumber: 1,
    sourceMandateSnapshot: input.sourceMandate,
    intentSpec: input.intent,
    policyDocument: input.policy,
    policySchemaVersion: input.policy.schemaVersion ?? "1.0",
    canonicalizationVersion: "1.0.0",
    policyHash,
    confirmationState: input.confirmationState ?? "CONFIRMED",
    createdAt: now,
  });

  return PolicyVersionRecordSchema.parse({
    id: versionId,
    policyId,
    ownerId,
    name: trimmedName,
    versionNumber: 1,
    sourceMandateSnapshot: input.sourceMandate,
    intentSpec: input.intent,
    policyDocument: input.policy,
    policySchemaVersion: input.policy.schemaVersion ?? "1.0",
    canonicalizationVersion: "1.0.0",
    policyHash,
    confirmationState: input.confirmationState ?? "CONFIRMED",
    createdAt: now.toISOString(),
    isPreset: false,
  });
}

/**
 * Creates a new version for an existing policy.
 * IMMUTABILITY GUARANTEE: Does NOT overwrite or mutate existing versions;
 * increments version_number and creates an append-only snapshot record.
 */
export async function createPolicyVersion(
  db: any,
  policyId: string,
  input: CreatePolicyVersionRequest,
  ownerId: string,
): Promise<PolicyVersionRecord> {
  const versionId = randomUUID();
  const policyHash = computePolicyHash(input.policy);
  const now = new Date();

  let policyName = "Unknown Policy";
  let mandateSnapshot = input.sourceMandateSnapshot || "";
  let nextVersionNumber = 1;
  let dbFound = false;

  // 1. Try DB
  try {
    const policyRecord = await db
      .select({ name: policies.name, sourceMandate: policies.sourceMandate })
      .from(policies)
      .where(eq(policies.id, policyId))
      .limit(1);

    if (policyRecord.length > 0) {
      dbFound = true;
      policyName = policyRecord[0].name;
      mandateSnapshot = input.sourceMandateSnapshot || policyRecord[0].sourceMandate;

      const versionRes = await db
        .select({ maxVersion: max(policyVersions.versionNumber) })
        .from(policyVersions)
        .where(eq(policyVersions.policyId, policyId));

      const currentMax = versionRes[0]?.maxVersion ?? 0;
      nextVersionNumber = currentMax + 1;

      await db.transaction(async (tx: any) => {
        await tx.insert(policyVersions).values({
          id: versionId,
          policyId,
          ownerId,
          versionNumber: nextVersionNumber,
          sourceMandateSnapshot: mandateSnapshot,
          intentSpec: input.intent,
          policyDocument: input.policy,
          policySchemaVersion: input.policy.schemaVersion ?? "1.0",
          canonicalizationVersion: "1.0.0",
          policyHash,
          confirmationState: input.confirmationState ?? "CONFIRMED",
          createdAt: now,
        });

        await tx
          .update(policies)
          .set({
            currentVersionId: versionId,
            updatedAt: now,
          })
          .where(eq(policies.id, policyId));

        await logAuditEvent(tx, {
          ownerId,
          actorType: "USER",
          eventType: "POLICY_VERSION_CREATED",
          entityType: "POLICY_VERSION",
          entityId: versionId,
          payload: {
            policyId,
            versionNumber: nextVersionNumber,
            policyHash,
            name: policyName,
          },
        });
      });
    }
  } catch {
    // DB offline or unavailable
  }

  // 2. In-memory check if DB not found
  if (!dbFound) {
    const memPolicy = inMemoryPolicies.get(policyId);
    if (!memPolicy) {
      throw new Error(`Policy with ID '${policyId}' not found.`);
    }
    policyName = memPolicy.name;
    mandateSnapshot = input.sourceMandateSnapshot || memPolicy.sourceMandate;

    const existingVersions = Array.from(inMemoryPolicyVersions.values()).filter(
      (v) => v.policyId === policyId
    );
    const maxVer = existingVersions.reduce((m, v) => Math.max(m, v.versionNumber), 0);
    nextVersionNumber = maxVer + 1;

    memPolicy.currentVersionId = versionId;
    memPolicy.updatedAt = now;
  }

  // Update memory store
  inMemoryPolicyVersions.set(versionId, {
    id: versionId,
    policyId,
    ownerId,
    versionNumber: nextVersionNumber,
    sourceMandateSnapshot: mandateSnapshot,
    intentSpec: input.intent,
    policyDocument: input.policy,
    policySchemaVersion: input.policy.schemaVersion ?? "1.0",
    canonicalizationVersion: "1.0.0",
    policyHash,
    confirmationState: input.confirmationState ?? "CONFIRMED",
    createdAt: now,
  });

  return PolicyVersionRecordSchema.parse({
    id: versionId,
    policyId,
    ownerId,
    name: policyName,
    versionNumber: nextVersionNumber,
    sourceMandateSnapshot: mandateSnapshot,
    intentSpec: input.intent,
    policyDocument: input.policy,
    policySchemaVersion: input.policy.schemaVersion ?? "1.0",
    canonicalizationVersion: "1.0.0",
    policyHash,
    confirmationState: input.confirmationState ?? "CONFIRMED",
    createdAt: now.toISOString(),
    isPreset: false,
  });
}

/**
 * Renames an existing policy.
 */
export async function renamePolicy(
  db: any,
  policyId: string,
  newName: string,
  ownerId: string,
): Promise<PolicySummary> {
  const trimmed = newName.trim();
  if (!trimmed) {
    const error: any = new Error("Policy name cannot be empty.");
    error.statusCode = 400;
    error.code = "VALIDATION_ERROR";
    throw error;
  }

  const now = new Date();

  // Try DB
  let updatedInDb = false;
  try {
    const existing = await db
      .select({ id: policies.id })
      .from(policies)
      .where(and(eq(policies.name, trimmed), isNull(policies.archivedAt)))
      .limit(1);

    if (existing.length > 0 && existing[0].id !== policyId) {
      const error: any = new Error(`A policy named '${trimmed}' already exists.`);
      error.statusCode = 409;
      error.code = "POLICY_NAME_EXISTS";
      throw error;
    }

    const [updated] = await db
      .update(policies)
      .set({ name: trimmed, updatedAt: now })
      .where(eq(policies.id, policyId))
      .returning();

    if (updated) {
      updatedInDb = true;
      await logAuditEvent(db, {
        ownerId,
        actorType: "USER",
        eventType: "POLICY_UPDATED",
        entityType: "POLICY",
        entityId: policyId,
        payload: { newName: trimmed },
      });
    }
  } catch (err: any) {
    if (err.statusCode) throw err;
  }

  // Update in memory
  const memPolicy = inMemoryPolicies.get(policyId);
  if (memPolicy) {
    memPolicy.name = trimmed;
    memPolicy.updatedAt = now;
  } else if (!updatedInDb) {
    const error: any = new Error(`Policy '${policyId}' not found.`);
    error.statusCode = 404;
    error.code = "POLICY_NOT_FOUND";
    throw error;
  }

  const version = await getPolicyVersion(db, policyId);
  return {
    id: policyId,
    name: trimmed,
    sourceMandate: memPolicy?.sourceMandate || version?.sourceMandateSnapshot || "",
    currentVersionId: memPolicy?.currentVersionId || version?.id,
    currentVersionNumber: version?.versionNumber ?? 1,
    policyHash: version?.policyHash,
    isPreset: false,
    versionCount: 1,
    createdAt: memPolicy?.createdAt ? memPolicy.createdAt.toISOString() : now.toISOString(),
    updatedAt: now.toISOString(),
  };
}

/**
 * Archives (soft-deletes) an existing policy.
 */
export async function archivePolicy(
  db: any,
  policyId: string,
  ownerId: string,
): Promise<{ success: boolean; policyId: string }> {
  const now = new Date();

  let archivedInDb = false;
  try {
    const [updated] = await db
      .update(policies)
      .set({ archivedAt: now, updatedAt: now })
      .where(eq(policies.id, policyId))
      .returning();

    if (updated) {
      archivedInDb = true;
      await logAuditEvent(db, {
        ownerId,
        actorType: "USER",
        eventType: "POLICY_ARCHIVED",
        entityType: "POLICY",
        entityId: policyId,
        payload: { archivedAt: now.toISOString() },
      });
    }
  } catch {
    // Non-fatal if DB is offline
  }

  const memPolicy = inMemoryPolicies.get(policyId);
  if (memPolicy) {
    memPolicy.archivedAt = now;
    memPolicy.updatedAt = now;
  } else if (!archivedInDb) {
    const error: any = new Error(`Policy '${policyId}' not found.`);
    error.statusCode = 404;
    error.code = "POLICY_NOT_FOUND";
    throw error;
  }

  return { success: true, policyId };
}

/**
 * Lists all versions of a specific policy in descending version order.
 */
export async function listPolicyVersions(
  db: any,
  policyId: string,
): Promise<PolicyVersionRecord[]> {
  const policyRecord = await db
    .select({ name: policies.name })
    .from(policies)
    .where(eq(policies.id, policyId))
    .limit(1);

  const policyName = policyRecord[0]?.name ?? "Unknown Policy";

  const rows = await db
    .select()
    .from(policyVersions)
    .where(eq(policyVersions.policyId, policyId))
    .orderBy(desc(policyVersions.versionNumber));

  return rows.map((r: any) =>
    PolicyVersionRecordSchema.parse({
      id: r.id,
      policyId: r.policyId,
      ownerId: r.ownerId,
      name: policyName,
      versionNumber: r.versionNumber,
      sourceMandateSnapshot: r.sourceMandateSnapshot,
      intentSpec: normalizeIntentSpec(r.intentSpec, r.policyDocument, policyName),
      policyDocument: r.policyDocument,
      policySchemaVersion: r.policySchemaVersion,
      canonicalizationVersion: r.canonicalizationVersion,
      policyHash: r.policyHash,
      confirmationState: r.confirmationState,
      createdAt: new Date(r.createdAt).toISOString(),
      isPreset: false,
    }),
  );
}
