import { useEffect, useState } from "react";
import type {
  SavedVerificationRunSummary,
  PersistenceLoadState,
} from "../../types/persistence";
import { fetchSavedVerificationRuns } from "../../api/persistenceService";
import {
  Database,
  RefreshCw,
  AlertTriangle,
  ChevronRight,
  Archive,
  AlertCircle,
  FileText,
} from "lucide-react";

interface SavedRunsBrowserProps {
  onLoadReport: (runId: string) => Promise<void>;
  isLoadingReport?: boolean;
}

export function SavedRunsBrowser({ onLoadReport, isLoadingReport = false }: SavedRunsBrowserProps) {
  const [loadState, setLoadState] = useState<PersistenceLoadState<SavedVerificationRunSummary[]>>({
    state: "LOADING",
  });
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  const loadRuns = async () => {
    setLoadState({ state: "LOADING" });
    const result = await fetchSavedVerificationRuns();
    setLoadState(result);
  };

  useEffect(() => {
    void loadRuns();
  }, []);

  const handleSelectRun = async (runId: string) => {
    setSelectedRunId(runId);
    try {
      await onLoadReport(runId);
    } catch {
      // Error handled by parent
    } finally {
      setSelectedRunId(null);
    }
  };

  return (
    <div
      className="p-5 md:p-6 rounded-panel border border-border bg-surface space-y-4 shadow-sm"
      role="region"
      aria-label="Persisted Verification Runs History"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center space-x-2">
          <Database className="w-5 h-5 text-accent" aria-hidden="true" />
          <div>
            <h3 className="font-semibold text-sm text-ink">
              Persisted Verification Runs
            </h3>
            <p className="text-[11px] text-muted">
              Historical policy test runs and counterexample witnesses saved in PostgreSQL.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void loadRuns()}
          disabled={loadState.state === "LOADING"}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-canvas hover:bg-border/60 text-ink border border-border transition-colors self-start sm:self-auto disabled:opacity-50"
          title="Refresh saved runs"
        >
          <RefreshCw
            className={`w-3.5 h-3.5 text-muted ${loadState.state === "LOADING" ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          <span>Refresh</span>
        </button>
      </div>

      {/* State Rendering */}
      {loadState.state === "LOADING" && (
        <div className="py-12 text-center space-y-3" role="status">
          <RefreshCw className="w-6 h-6 animate-spin text-accent mx-auto" aria-hidden="true" />
          <p className="text-xs text-muted">Loading persisted verification runs from database...</p>
        </div>
      )}

      {loadState.state === "UNAVAILABLE" && (
        <div className="p-4 rounded bg-amber-50 border border-amber-300 text-xs text-amber-950 space-y-2">
          <div className="flex items-center space-x-2 font-semibold">
            <AlertTriangle className="w-4 h-4 text-amber-800 shrink-0" aria-hidden="true" />
            <span>Database Persistence Standby</span>
          </div>
          <p className="text-[11px] text-amber-900 leading-relaxed">
            {loadState.message}
          </p>
          <div className="pt-1 flex items-center justify-between">
            <span className="text-[10px] text-amber-800">
              Live in-memory runs via POST /api/verification/run remain fully operational.
            </span>
            <button
              type="button"
              onClick={() => void loadRuns()}
              className="px-2.5 py-1 rounded text-xs font-semibold bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-400 transition-colors"
            >
              Retry Connection
            </button>
          </div>
        </div>
      )}

      {loadState.state === "ERROR" && (
        <div className="p-4 rounded bg-red-50 border border-red-200 text-xs text-red-950 space-y-2">
          <div className="flex items-center space-x-2 font-semibold text-red-900">
            <AlertCircle className="w-4 h-4 text-red-700 shrink-0" aria-hidden="true" />
            <span>Persistence Connection Error</span>
          </div>
          <p className="text-[11px] text-red-900 leading-relaxed">
            {loadState.message}
          </p>
          <button
            type="button"
            onClick={() => void loadRuns()}
            className="px-2.5 py-1 rounded text-xs font-semibold bg-red-100 hover:bg-red-200 text-red-950 border border-red-300 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {loadState.state === "EMPTY" && (
        <div className="py-10 text-center space-y-2">
          <div className="inline-flex p-3 rounded-full bg-canvas text-muted mb-1">
            <Archive className="w-6 h-6" aria-hidden="true" />
          </div>
          <h4 className="text-sm font-semibold text-ink">No Saved Verification Runs Found</h4>
          <p className="text-xs text-muted max-w-sm mx-auto">
            Zero historical test runs have been recorded in the database yet. Completed runs will appear here after being saved.
          </p>
        </div>
      )}

      {loadState.state === "READY" && (
        <div className="space-y-2.5">
          {loadState.data.map((run) => {
            const isExhaustive = run.exhausted;
            const hasFindings = run.findingCount > 0;
            const isSelected = selectedRunId === run.runId;

            return (
              <div
                key={run.runId}
                className="p-3.5 rounded border border-border bg-canvas/40 hover:bg-canvas transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center space-x-2">
                    <span className="font-mono font-bold text-ink">
                      {run.runId}
                    </span>
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        run.status === "COMPLETED"
                          ? "bg-emerald-100 text-emerald-950 border border-emerald-300"
                          : "bg-amber-100 text-amber-950 border border-amber-300"
                      }`}
                    >
                      {run.status}
                    </span>
                    {run.stopReason && (
                      <span className="text-[10px] font-mono text-muted">
                        Stop: {run.stopReason}
                      </span>
                    )}
                  </div>

                  <div className="text-[11px] text-muted flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <span>
                      Policy: <strong className="text-ink">{run.policyName || run.policyVersionId}</strong>
                    </span>
                    <span className="font-mono text-[10px]">
                      Hash: {run.policyHash.slice(0, 12)}...
                    </span>
                    <span>
                      Explored: <strong className="text-ink font-mono">{run.totalCandidatesExplored}</strong> candidates
                    </span>
                    <span>
                      Completeness:{" "}
                      <strong className={isExhaustive ? "text-emerald-700" : "text-amber-800"}>
                        {isExhaustive ? "Exhaustive" : "Budget Bound"}
                      </strong>
                    </span>
                  </div>

                  {run.summary && (
                    <p className="text-[11px] text-muted line-clamp-1 italic">
                      "{run.summary}"
                    </p>
                  )}
                </div>

                <div className="flex items-center space-x-3 shrink-0 self-end sm:self-auto">
                  <div className="text-right">
                    <div
                      className={`font-bold font-mono ${
                        hasFindings ? "text-deny" : "text-emerald-700"
                      }`}
                    >
                      {run.findingCount} {run.findingCount === 1 ? "finding" : "findings"}
                    </div>
                    <div className="text-[10px] text-muted">
                      {new Date(run.createdAt).toLocaleDateString()}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => void handleSelectRun(run.runId)}
                    disabled={isLoadingReport || isSelected}
                    className="inline-flex items-center space-x-1 px-3 py-1.5 rounded text-xs font-semibold bg-accent text-white hover:bg-accent/90 disabled:opacity-50 transition-colors shadow-sm"
                  >
                    <FileText className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{isSelected ? "Loading..." : "Open Report"}</span>
                    <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
