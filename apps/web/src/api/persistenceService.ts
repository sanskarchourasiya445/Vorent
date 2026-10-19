import type {
  SavedVerificationRunSummary,
  PersistenceLoadState,
} from "../types/persistence";
import { VerificationReportSchema } from "@warrant/contracts";
import { adaptVerificationReportToRunResult } from "./verificationService";
import type { VerificationRunResult } from "../types/verification";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

/**
 * Fetches the list of saved verification runs from the persistence backend.
 * Honors loading, empty, error, and unavailable (standby) states without
 * ever fabricating mock persistence records.
 */
export async function fetchSavedVerificationRuns(): Promise<
  PersistenceLoadState<SavedVerificationRunSummary[]>
> {
  const candidateUrls = [
    `${API_BASE}/api/verification/runs`,
    `${API_BASE}/api/v1/verification/runs`,
  ];

  try {
    let response: Response | null = null;
    for (const url of candidateUrls) {
      const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json" },
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
          "Persistence route /api/verification/runs is not yet mounted. Database persistence endpoints are currently planned for the backend agent.",
      };
    }

    if (response.status === 503) {
      return {
        state: "UNAVAILABLE",
        message:
          "PostgreSQL database is in standby mode. Persisted test runs will become available once the database connection and migrations are completed.",
      };
    }

    if (!response.ok) {
      let errorMsg = response.statusText;
      try {
        const json = await response.json();
        if (json && typeof json === "object") {
          errorMsg = (json as { error?: { message?: string }; message?: string }).error?.message ||
            (json as { message?: string }).message ||
            errorMsg;
        }
      } catch {
        // use statusText
      }
      return {
        state: "ERROR",
        message: `Backend returned HTTP ${response.status}: ${errorMsg}`,
      };
    }

    const json = await response.json();
    const rawList = Array.isArray(json?.runs)
      ? json.runs
      : Array.isArray(json?.data)
      ? json.data
      : Array.isArray(json)
      ? json
      : [];

    if (rawList.length === 0) {
      return { state: "EMPTY" };
    }

    const data: SavedVerificationRunSummary[] = rawList.map((r: any) => ({
      runId: r.runId || r.id || "unknown",
      id: r.id || r.runId,
      policyVersionId: r.policyVersionId || "unknown",
      policyVersionNumber: r.policyVersionNumber,
      policyName: r.policyName,
      policyHash: r.policyHash || "",
      status: r.status,
      stopReason: r.stopReason,
      exhausted: Boolean(r.exhausted),
      totalCandidatesExplored: r.totalCandidatesExplored ?? r.exploredCount ?? 0,
      findingCount: r.findingCount ?? 0,
      unresolvedCount: r.unresolvedCount ?? 0,
      durationMs: r.durationMs ?? 0,
      createdAt: r.createdAt || new Date().toISOString(),
      summary: r.summary || `Verification run with ${r.findingCount ?? 0} finding(s)`,
    }));

    return {
      state: "READY",
      data,
    };
  } catch (err) {
    return {
      state: "ERROR",
      message: `Network error connecting to persistence API: ${
        err instanceof Error ? err.message : "Connection failed"
      }`,
    };
  }
}

/**
 * Fetches an exact saved verification report by runId from the database.
 * Converts the report into a VerificationRunResult view model.
 */
export async function fetchSavedVerificationReport(
  runId: string,
): Promise<VerificationRunResult> {
  const candidateUrls = [
    `${API_BASE}/api/verification/runs/${encodeURIComponent(runId)}`,
    `${API_BASE}/api/v1/verification/runs/${encodeURIComponent(runId)}`,
  ];

  let response: Response | null = null;
  for (const url of candidateUrls) {
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
    });
    if (res.status !== 404) {
      response = res;
      break;
    }
  }

  if (!response || !response.ok) {
    let errorMsg = response ? `HTTP ${response.status}` : "Route not found (404)";
    if (response) {
      try {
        const json = await response.json();
        if (json && typeof json === "object") {
          errorMsg = (json as { error?: { message?: string }; message?: string }).error?.message ||
            (json as { message?: string }).message ||
            errorMsg;
        }
      } catch {
        // use fallback
      }
    }
    throw new Error(`Failed to load saved verification report (${runId}): ${errorMsg}`);
  }

  const rawJson = await response.json();
  const reportData = rawJson?.report || rawJson?.data || rawJson;
  const parseResult = VerificationReportSchema.safeParse(reportData);

  if (!parseResult.success) {
    throw new Error(
      `Malformed saved verification report: ${parseResult.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }

  // Authoritative saved report from database
  const result = adaptVerificationReportToRunResult(parseResult.data, ["PRICE_BOUNDARIES"], true);
  return {
    ...result,
    isSavedRun: true,
  };
}
