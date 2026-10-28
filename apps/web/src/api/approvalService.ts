import type {
  ApprovalRecord,
  CreateApprovalInput,
  ApprovalListState,
} from "../types/approval";
import { getAuthHeaders } from "./client";

const safeAuthHeaders = () => {
  try {
    return typeof getAuthHeaders === "function" ? getAuthHeaders() : {};
  } catch {
    return {};
  }
};

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

/**
 * Fetches the list of active and historical approvals from the backend.
 * Gracefully handles 404 (unmounted), 503 (database standby), and empty states.
 */
export async function fetchApprovals(): Promise<ApprovalListState> {
  const candidateUrls = [
    `${API_BASE}/api/approvals`,
    `${API_BASE}/api/v1/approvals`,
  ];

  try {
    let response: Response | null = null;
    for (const url of candidateUrls) {
      const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json", ...safeAuthHeaders() },
      });
      if (res.status !== 404) {
        response = res;
        break;
      }
    }

    if (!response) {
      return {
        state: "UNAVAILABLE",
        message:
          "Approval route /api/approvals is not yet mounted on the backend.",
      };
    }

    if (response.status === 503) {
      return {
        state: "UNAVAILABLE",
        message:
          "PostgreSQL database is in standby mode. Approvals will become available once the database connection and migrations are completed.",
      };
    }

    if (!response.ok) {
      let errorMsg = response.statusText;
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
      return {
        state: "ERROR",
        message: `Backend returned HTTP ${response.status}: ${errorMsg}`,
      };
    }

    const json = await response.json();
    const rawList = Array.isArray(json?.approvals)
      ? json.approvals
      : Array.isArray(json?.data)
      ? json.data
      : Array.isArray(json)
      ? json
      : [];

    if (rawList.length === 0) {
      return { state: "EMPTY" };
    }

    const data: ApprovalRecord[] = rawList.map((a: any) => {
      const isExpired = new Date(a.expiresAt).getTime() <= Date.now();
      const isRevoked = Boolean(a.revokedAt);
      const status: "ACTIVE" | "EXPIRED" | "REVOKED" = isRevoked
        ? "REVOKED"
        : isExpired
        ? "EXPIRED"
        : "ACTIVE";

      return {
        id: a.id || a.approvalId || "unknown",
        ownerId: a.ownerId,
        policyVersionId: a.policyVersionId,
        policyHash: a.policyHash || "",
        policyName: a.policyName,
        qualifyingTestRunId: a.qualifyingTestRunId || "",
        spendLimitMinor: a.spendLimitMinor ?? 0,
        consumedSpendMinor: a.consumedSpendMinor ?? 0,
        remainingSpendMinor: typeof a.remainingSpendMinor === "number" ? a.remainingSpendMinor : undefined,
        currency: a.currency || "USD",
        expiresAt: a.expiresAt || new Date().toISOString(),
        revokedAt: a.revokedAt,
        createdAt: a.createdAt || new Date().toISOString(),
        status,
      };
    });

    return {
      state: "READY",
      data,
    };
  } catch (err) {
    return {
      state: "ERROR",
      message: `Network error connecting to approvals API: ${
        err instanceof Error ? err.message : "Connection failed"
      }`,
    };
  }
}

/**
 * Creates an approval bound to an immutable tested policy version.
 */
export async function createApproval(input: CreateApprovalInput): Promise<ApprovalRecord> {
  const url = `${API_BASE}/api/approvals`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      ...safeAuthHeaders(),
    },
    body: JSON.stringify({
      policyVersionId: input.policyVersionId,
      policyHash: input.policyHash,
      qualifyingTestRunId: input.qualifyingTestRunId,
      spendLimitMinor: input.spendLimitMinor,
      currency: input.currency,
      expiresInHours: input.expiresInHours,
    }),
  });

  if (response.status === 404) {
    throw new Error(
      "Approval creation endpoint /api/approvals is not yet mounted on the backend.",
    );
  }

  if (response.status === 503) {
    throw new Error(
      "PostgreSQL database is in standby mode. Persisting policy approvals requires active database persistence.",
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
    throw new Error(`Failed to create approval: ${errorMsg}`);
  }

  const json = await response.json();
  const a = json?.approval || json?.data || json;
  return {
    id: a.id || "unknown",
    policyVersionId: a.policyVersionId,
    policyHash: a.policyHash,
    policyName: a.policyName,
    qualifyingTestRunId: a.qualifyingTestRunId,
    spendLimitMinor: a.spendLimitMinor,
    consumedSpendMinor: a.consumedSpendMinor ?? 0,
    currency: a.currency,
    expiresAt: a.expiresAt,
    revokedAt: a.revokedAt,
    createdAt: a.createdAt,
    status: "ACTIVE",
  };
}

/**
 * Revokes an existing approval.
 */
export async function revokeApproval(approvalId: string): Promise<void> {
  const url = `${API_BASE}/api/approvals/${encodeURIComponent(approvalId)}/revoke`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      ...safeAuthHeaders(),
    },
  });

  if (response.status === 404) {
    throw new Error(
      "Approval revocation endpoint /api/approvals/:id/revoke is not yet mounted on the backend.",
    );
  }

  if (response.status === 503) {
    throw new Error(
      "PostgreSQL database is in standby mode. Revoking policy approvals requires active database persistence.",
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
    throw new Error(`Failed to revoke approval: ${errorMsg}`);
  }
}
