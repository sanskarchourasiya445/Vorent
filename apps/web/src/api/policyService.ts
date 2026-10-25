import {
  type PolicySummary,
  type PolicyVersionRecord,
  type PolicyListResponse,
  type PolicyVersionListResponse,
  type CompileIntentRequest,
  type CompileIntentResponse,
  CompileIntentResponseSchema,
  type ComputeDiffRequest,
  type PolicyDiff,
  PolicyDiffSchema,
  type ProposeRepairRequest,
  type ProposeRepairResponse,
  ProposeRepairResponseSchema,
  type CreatePolicyRequest,
  type CreatePolicyVersionRequest,
} from "@warrant/contracts";
import type { PersistenceLoadState } from "../types/persistence";
import { AVAILABLE_POLICIES } from "./verificationService";
import type { PolicyComparisonInput } from "../utils/policyDiff";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

export interface PolicyFetchState {
  summaries: PersistenceLoadState<PolicySummary[]>;
  isPresetFallback: boolean;
}

/**
 * Maps static preset policy options into PolicyComparisonInput format.
 */
export function mapPresetToComparisonInput(id: string): PolicyComparisonInput | null {
  const preset = AVAILABLE_POLICIES.find((p) => p.id === id);
  if (!preset) return null;
  return {
    id: preset.id,
    name: preset.name,
    version: preset.version,
    hash: preset.hash,
    policyHash: preset.hash,
    policyDocument: preset.policyDocument,
  };
}

/**
 * Maps a PolicyVersionRecord from the database into PolicyComparisonInput format.
 */
export function mapVersionRecordToComparisonInput(
  record: PolicyVersionRecord,
): PolicyComparisonInput {
  return {
    id: record.id,
    name: record.name,
    version: `v${record.versionNumber}`,
    hash: record.policyHash,
    policyHash: record.policyHash,
    policyDocument: record.policyDocument,
  };
}

/**
 * Fetches the list of all available policies from GET /api/policies.
 * Falls back gracefully to presets if backend route is unavailable or offline.
 */
export async function fetchPolicySummaries(): Promise<{
  state: PersistenceLoadState<PolicySummary[]>;
  isFallback: boolean;
}> {
  const url = `${API_BASE}/api/policies`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (res.status === 404) {
      // Fallback to static presets
      const fallbackSummaries: PolicySummary[] = AVAILABLE_POLICIES.map((p) => ({
        id: p.id,
        name: p.name,
        sourceMandate: p.description,
        currentVersionId: p.id,
        currentVersionNumber: 1,
        policyHash: p.hash,
        isPreset: true,
        presetId: p.id,
        versionCount: 1,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }));
      return {
        state: { state: "READY", data: fallbackSummaries },
        isFallback: true,
      };
    }

    if (res.status === 503) {
      return {
        state: {
          state: "UNAVAILABLE",
          message:
            "PostgreSQL database is in standby mode. Policy registry persistence is currently unavailable.",
        },
        isFallback: false,
      };
    }

    if (!res.ok) {
      let errorMsg = res.statusText;
      try {
        const json = await res.json();
        if (json && typeof json === "object") {
          errorMsg =
            (json as { error?: { message?: string }; message?: string }).error?.message ||
            (json as { message?: string }).message ||
            errorMsg;
        }
      } catch {
        // fallback
      }
      return {
        state: {
          state: "ERROR",
          message: `Backend returned HTTP ${res.status}: ${errorMsg}`,
        },
        isFallback: false,
      };
    }

    const json = (await res.json()) as PolicyListResponse;
    const policies = json.policies || [];

    if (policies.length === 0) {
      return {
        state: { state: "EMPTY" },
        isFallback: false,
      };
    }

    return {
      state: { state: "READY", data: policies },
      isFallback: false,
    };
  } catch {
    // Network or server unreachable; provide client-side presets with explicit indicator
    const fallbackSummaries: PolicySummary[] = AVAILABLE_POLICIES.map((p) => ({
      id: p.id,
      name: p.name,
      sourceMandate: p.description,
      currentVersionId: p.id,
      currentVersionNumber: 1,
      policyHash: p.hash,
      isPreset: true,
      presetId: p.id,
      versionCount: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    return {
      state: { state: "READY", data: fallbackSummaries },
      isFallback: true,
    };
  }
}

/**
 * Fetches the detail of a policy version from GET /api/policies/:id.
 */
export async function fetchPolicyVersionDetail(
  id: string,
): Promise<PolicyComparisonInput> {
  const url = `${API_BASE}/api/policies/${encodeURIComponent(id)}`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (res.ok) {
      const record = (await res.json()) as PolicyVersionRecord;
      return mapVersionRecordToComparisonInput(record);
    }
  } catch {
    // proceed to fallback
  }

  // Fallback to presets if ID matches a preset
  const preset = mapPresetToComparisonInput(id);
  if (preset) {
    return preset;
  }

  throw new Error(`Policy or version '${id}' could not be loaded from API or local presets.`);
}

/**
 * Fetches all versions for a given policy from GET /api/policies/:id/versions.
 */
export async function fetchPolicyVersions(
  policyId: string,
): Promise<PolicyVersionRecord[]> {
  const url = `${API_BASE}/api/policies/${encodeURIComponent(policyId)}/versions`;

  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });

    if (res.ok) {
      const json = (await res.json()) as PolicyVersionListResponse;
      return json.versions || [];
    }
  } catch {
    // fallback
  }

  // Fallback preset version
  const preset = AVAILABLE_POLICIES.find((p) => p.id === policyId);
  if (preset) {
    return [
      {
        id: preset.id,
        policyId: preset.id,
        name: preset.name,
        versionNumber: 1,
        sourceMandateSnapshot: preset.description,
        intentSpec: preset.intent,
        policyDocument: preset.policyDocument,
        policySchemaVersion: "1.0",
        canonicalizationVersion: "1.0.0",
        policyHash: preset.hash,
        confirmationState: "CONFIRMED",
        createdAt: new Date().toISOString(),
        isPreset: true,
        presetId: preset.id,
      },
    ];
  }

  return [];
}

/**
 * Compiles a natural-language purchase mandate into a structured policy candidate.
 * Calls POST /api/policies/compile.
 */
export async function compileIntent(
  request: CompileIntentRequest,
): Promise<CompileIntentResponse> {
  const url = `${API_BASE}/api/policies/compile`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    let message = `Compilation failed with HTTP ${res.status}`;
    try {
      const errJson = await res.json();
      if (errJson && typeof errJson === "object") {
        message = errJson.error?.message || errJson.message || message;
      }
    } catch {
      // fallback
    }
    throw new Error(message);
  }

  const json = await res.json();
  return CompileIntentResponseSchema.parse(json);
}

/**
 * Compiles a natural-language mandate using the bounded LLM Assistant.
 * Calls POST /api/mandates/compile-llm with automatic deterministic fallback.
 */
export async function compileIntentLLM(
  request: CompileIntentRequest,
): Promise<CompileIntentResponse> {
  const url = `${API_BASE}/api/mandates/compile-llm`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    let message = `LLM compilation failed with HTTP ${res.status}`;
    try {
      const errJson = await res.json();
      if (errJson && typeof errJson === "object") {
        message = errJson.error?.message || errJson.message || message;
      }
    } catch {
      // fallback
    }
    throw new Error(message);
  }

  const json = await res.json();
  return CompileIntentResponseSchema.parse(json);
}

/**
 * Computes a semantic field-level diff between two policy documents.
 * Calls POST /api/policies/diff.
 */
export async function computeDiff(
  request: ComputeDiffRequest,
): Promise<PolicyDiff> {
  const url = `${API_BASE}/api/policies/diff`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    let message = `Diff calculation failed with HTTP ${res.status}`;
    try {
      const errJson = await res.json();
      if (errJson && typeof errJson === "object") {
        message = errJson.error?.message || errJson.message || message;
      }
    } catch {
      // fallback
    }
    throw new Error(message);
  }

  const json = await res.json();
  return PolicyDiffSchema.parse(json);
}

/**
 * Fetches semantic diff for an existing version against another or its predecessor.
 * Calls GET /api/policies/:id/versions/:vid/diff.
 */
export async function fetchVersionDiff(
  policyId: string,
  versionId: string,
  againstVersionId?: string,
): Promise<PolicyDiff> {
  const query = againstVersionId ? `?againstVersionId=${encodeURIComponent(againstVersionId)}` : "";
  const url = `${API_BASE}/api/policies/${encodeURIComponent(policyId)}/versions/${encodeURIComponent(versionId)}/diff${query}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    let message = `Version diff failed with HTTP ${res.status}`;
    try {
      const errJson = await res.json();
      if (errJson && typeof errJson === "object") {
        message = errJson.error?.message || errJson.message || message;
      }
    } catch {
      // fallback
    }
    throw new Error(message);
  }

  const json = await res.json();
  return PolicyDiffSchema.parse(json);
}

/**
 * Generates an automated policy repair proposal addressing verification findings.
 * Calls POST /api/policies/propose-repair.
 */
export async function proposeRepair(
  request: ProposeRepairRequest,
): Promise<ProposeRepairResponse> {
  const url = `${API_BASE}/api/policies/propose-repair`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    let message = `Repair proposal failed with HTTP ${res.status}`;
    try {
      const errJson = await res.json();
      if (errJson && typeof errJson === "object") {
        message = errJson.error?.message || errJson.message || message;
      }
    } catch {
      // fallback
    }
    throw new Error(message);
  }

  const json = await res.json();
  return ProposeRepairResponseSchema.parse(json);
}

/**
 * Persists a new policy and its Version 1 record.
 * Calls POST /api/policies.
 */
export async function createPolicy(
  request: CreatePolicyRequest,
): Promise<PolicyVersionRecord> {
  const url = `${API_BASE}/api/policies`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    let message = `Policy creation failed with HTTP ${res.status}`;
    try {
      const errJson = await res.json();
      if (errJson && typeof errJson === "object") {
        message = errJson.error?.message || errJson.message || message;
      }
    } catch {
      // fallback
    }
    throw new Error(message);
  }

  return (await res.json()) as PolicyVersionRecord;
}

/**
 * Appends a new immutable version to an existing policy.
 * Calls POST /api/policies/:id/versions.
 */
export async function createPolicyVersion(
  policyId: string,
  request: CreatePolicyVersionRequest,
): Promise<PolicyVersionRecord> {
  const url = `${API_BASE}/api/policies/${encodeURIComponent(policyId)}/versions`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    let message = `Version creation failed with HTTP ${res.status}`;
    try {
      const errJson = await res.json();
      if (errJson && typeof errJson === "object") {
        message = errJson.error?.message || errJson.message || message;
      }
    } catch {
      // fallback
    }
    throw new Error(message);
  }

  return (await res.json()) as PolicyVersionRecord;
}
