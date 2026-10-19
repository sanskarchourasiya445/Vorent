import {
  type FindingRecord,
  type FindingListResponse,
  FindingListResponseSchema,
  FindingRecordSchema,
  type ResolveFindingRequest,
  type AcceptRiskRequest,
} from "@warrant/contracts";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

export interface FetchFindingsRequest {
  testRunId?: string;
  policyVersionId?: string;
  status?: string;
  limit?: number;
}

/**
 * Fetches findings from GET /api/findings with optional filters.
 */
export async function fetchFindings(
  params?: FetchFindingsRequest,
): Promise<FindingListResponse> {
  const query = new URLSearchParams();
  if (params?.testRunId) query.set("testRunId", params.testRunId);
  if (params?.policyVersionId) query.set("policyVersionId", params.policyVersionId);
  if (params?.status) query.set("status", params.status);
  if (params?.limit) query.set("limit", params.limit.toString());

  const queryString = query.toString() ? `?${query.toString()}` : "";
  const url = `${API_BASE}/api/findings${queryString}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    let message = `Failed to fetch findings (HTTP ${res.status})`;
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
  return FindingListResponseSchema.parse(json);
}

/**
 * Fetches finding detail from GET /api/findings/:id.
 */
export async function fetchFindingDetail(id: string): Promise<FindingRecord> {
  const url = `${API_BASE}/api/findings/${encodeURIComponent(id)}`;

  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    let message = `Failed to fetch finding ${id} (HTTP ${res.status})`;
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
  return FindingRecordSchema.parse(json);
}

/**
 * Resolves a finding by linking it to a newly verified policy version.
 * Calls POST /api/findings/:id/resolve.
 */
export async function resolveFinding(
  findingId: string,
  request: ResolveFindingRequest,
): Promise<FindingRecord> {
  const url = `${API_BASE}/api/findings/${encodeURIComponent(findingId)}/resolve`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    let message = `Finding resolution failed (HTTP ${res.status})`;
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
  return FindingRecordSchema.parse(json);
}

/**
 * Accepts risk for a MEDIUM or LOW finding with required operator rationale.
 * Strictly rejected by server for CRITICAL or HIGH findings per Decision D-014.
 * Calls POST /api/findings/:id/accept-risk.
 */
export async function acceptFindingRisk(
  findingId: string,
  request: AcceptRiskRequest,
): Promise<FindingRecord> {
  const url = `${API_BASE}/api/findings/${encodeURIComponent(findingId)}/accept-risk`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(request),
  });

  if (!res.ok) {
    let message = `Risk acceptance failed (HTTP ${res.status})`;
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
  return FindingRecordSchema.parse(json);
}
