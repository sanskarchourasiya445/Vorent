import { eq, desc, max, sql } from "drizzle-orm";
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
import { POLICY_PRESETS } from "../../routes/verification.js";

export const SYSTEM_DEFAULT_USER_SUBJECT = "system:default_owner";

/**
 * Ensures the default owner user exists in the users table.
 * Idempotent: returns existing user UUID or creates one.
 */
export async function ensureDefaultUser(db: any): Promise<string> {
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.authSubject, SYSTEM_DEFAULT_USER_SUBJECT))
    .limit(1);

  if (existing.length > 0 && existing[0]?.id) {
    return existing[0].id;
  }

  const newId = randomUUID();
  await db.insert(users).values({
    id: newId,
    authSubject: SYSTEM_DEFAULT_USER_SUBJECT,
  });

  return newId;
}

/**
 * Seeds built-in policy presets into the database idempotently.
 * Never inserts duplicates on repeated startup.
 */
export async function seedPresets(db: any, ownerId: string): Promise<void> {
  for (const presetKey of Object.keys(POLICY_PRESETS)) {
    const preset = POLICY_PRESETS[presetKey];
    if (!preset) continue;

    // Check if preset already exists by name for this owner
    const existing = await db
      .select({ id: policies.id })
      .from(policies)
      .where(eq(policies.name, preset.name))
      .limit(1);

    if (existing.length > 0) {
      continue; // Preset already seeded
    }

    const policyId = randomUUID();
    const versionId = randomUUID();
    const policyHash = computePolicyHash(preset.policy);

    // 1. Create policy row
    await db.insert(policies).values({
      id: policyId,
      ownerId,
      name: preset.name,
      sourceMandate: preset.intent.name,
      currentVersionId: versionId,
    });

    // 2. Create version 1 row
    await db.insert(policyVersions).values({
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
  }
}

/**
 * Lists all policies. If database is available, combines DB records with preset manifests.
 */
export async function listPolicies(db: any, _ownerId?: string): Promise<PolicySummary[]> {
  try {
    const dbPolicies = await db
      .select({
        id: policies.id,
        name: policies.name,
        sourceMandate: policies.sourceMandate,
        currentVersionId: policies.currentVersionId,
        createdAt: policies.createdAt,
        updatedAt: policies.updatedAt,
      })
      .from(policies)
      .orderBy(desc(policies.updatedAt));

    const summaries: PolicySummary[] = [];

    for (const p of dbPolicies) {
      let versionNumber = 1;
      let policyHash = "";
      let versionCount = 1;

      if (p.currentVersionId) {
        const v = await db
          .select({
            versionNumber: policyVersions.versionNumber,
            policyHash: policyVersions.policyHash,
          })
          .from(policyVersions)
          .where(eq(policyVersions.id, p.currentVersionId))
          .limit(1);

        if (v.length > 0) {
          versionNumber = v[0].versionNumber;
          policyHash = v[0].policyHash;
        }
      }

      const countRes = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(policyVersions)
        .where(eq(policyVersions.policyId, p.id));

      if (countRes.length > 0 && countRes[0]?.count) {
        versionCount = countRes[0].count;
      }

      // Check if this policy matches a preset
      const matchedPreset = Object.values(POLICY_PRESETS).find((pr) => pr.name === p.name);

      summaries.push({
        id: p.id,
        name: p.name,
        sourceMandate: p.sourceMandate,
        currentVersionId: p.currentVersionId,
        currentVersionNumber: versionNumber,
        policyHash,
        isPreset: Boolean(matchedPreset),
        presetId: matchedPreset?.id,
        versionCount,
        createdAt: p.createdAt ? new Date(p.createdAt).toISOString() : new Date().toISOString(),
        updatedAt: p.updatedAt ? new Date(p.updatedAt).toISOString() : new Date().toISOString(),
      });
    }

    return summaries;
  } catch {
    // If DB is unavailable, return built-in presets formatted as PolicySummary
    return getPresetSummaries();
  }
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
          intentSpec: v.intentSpec,
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

      // Try match on policies.id -> fetch current version
      const policyRecord = await db
        .select()
        .from(policies)
        .where(eq(policies.id, identifier))
        .limit(1);

      if (policyRecord.length > 0 && policyRecord[0].currentVersionId) {
        return getPolicyVersion(db, policyRecord[0].currentVersionId);
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
          intentSpec: v.intentSpec,
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

  // Fallback to in-memory preset if matched
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
 */
export async function createPolicy(
  db: any,
  input: CreatePolicyRequest,
  ownerId: string,
): Promise<PolicyVersionRecord> {
  const policyId = randomUUID();
  const versionId = randomUUID();
  const policyHash = computePolicyHash(input.policy);
  const now = new Date();

  await db.transaction(async (tx: any) => {
    await tx.insert(policies).values({
      id: policyId,
      ownerId,
      name: input.name,
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
  });

  return PolicyVersionRecordSchema.parse({
    id: versionId,
    policyId,
    ownerId,
    name: input.name,
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
  const policyRecord = await db
    .select({ name: policies.name, sourceMandate: policies.sourceMandate })
    .from(policies)
    .where(eq(policies.id, policyId))
    .limit(1);

  if (policyRecord.length === 0) {
    throw new Error(`Policy with ID '${policyId}' not found.`);
  }

  const policyName = policyRecord[0].name;
  const mandateSnapshot = input.sourceMandateSnapshot || policyRecord[0].sourceMandate;

  // Determine next version number
  const versionRes = await db
    .select({ maxVersion: max(policyVersions.versionNumber) })
    .from(policyVersions)
    .where(eq(policyVersions.policyId, policyId));

  const currentMax = versionRes[0]?.maxVersion ?? 0;
  const nextVersionNumber = currentMax + 1;

  const versionId = randomUUID();
  const policyHash = computePolicyHash(input.policy);
  const now = new Date();

  await db.transaction(async (tx: any) => {
    // 1. Insert new immutable version
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

    // 2. Update current version pointer on policy
    await tx
      .update(policies)
      .set({
        currentVersionId: versionId,
        updatedAt: now,
      })
      .where(eq(policies.id, policyId));
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
      intentSpec: r.intentSpec,
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
