import { useState, useEffect } from "react";
import type {
  PolicyOption,
  VerificationConfig,
  VerificationFinding,
  VerificationRunResult,
  VerificationStatus,
} from "../../types/verification";
import {
  fetchAvailablePolicies,
  executeVerificationRun,
} from "../../api/verificationService";
import { fetchSavedVerificationReport } from "../../api/persistenceService";
import { VerificationConfigForm } from "./VerificationConfigForm";
import { VerificationCoverageCard } from "./VerificationCoverageCard";
import { FindingsList } from "./FindingsList";
import { FindingDetailModal } from "./FindingDetailModal";
import { SavedRunsBrowser } from "./SavedRunsBrowser";
import { ShieldCheck, RefreshCw, AlertCircle, PlayCircle, Database } from "lucide-react";

interface VerificationStudioProps {
  initialPolicyId?: string;
}

export function VerificationStudio({ initialPolicyId }: VerificationStudioProps) {
  const [activeTab, setActiveTab] = useState<"RUNNER" | "SAVED_RUNS">("RUNNER");
  const [policies, setPolicies] = useState<PolicyOption[]>([]);
  const [policiesLoading, setPoliciesLoading] = useState(true);
  const [policiesError, setPoliciesError] = useState<string | null>(null);

  const [status, setStatus] = useState<VerificationStatus>("IDLE");
  const [runResult, setRunResult] = useState<VerificationRunResult | null>(null);
  const [selectedFinding, setSelectedFinding] = useState<VerificationFinding | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadingSavedReport, setLoadingSavedReport] = useState(false);

  // Load available policies
  useEffect(() => {
    let mounted = true;
    const loadPolicies = async () => {
      try {
        setPoliciesLoading(true);
        const data = await fetchAvailablePolicies();
        if (mounted) {
          setPolicies(data);
          setPoliciesError(null);
        }
      } catch (err) {
        if (mounted) {
          setPoliciesError(err instanceof Error ? err.message : "Failed to load policy versions");
        }
      } finally {
        if (mounted) {
          setPoliciesLoading(false);
        }
      }
    };
    void loadPolicies();
    return () => {
      mounted = false;
    };
  }, []);

  const handleStartRun = async (config: VerificationConfig, useDemoSimulation?: boolean) => {
    if (status === "RUNNING") return; // Prevent duplicate submissions
    setStatus("RUNNING");
    setErrorMessage(null);
    try {
      const result = await executeVerificationRun(config, { useDemoSimulation });
      setRunResult(result);
      setStatus(result.status);
    } catch (err) {
      setStatus("FAILED");
      const msg = err instanceof Error ? err.message : "Verification probe execution failed";
      setErrorMessage(msg);
      setRunResult(null);
    }
  };

  const handleLoadSavedReport = async (runId: string) => {
    setLoadingSavedReport(true);
    setErrorMessage(null);
    try {
      const result = await fetchSavedVerificationReport(runId);
      setRunResult(result);
      setStatus(result.status);
      setActiveTab("RUNNER"); // Return to runner view to inspect loaded report
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : `Failed to load saved report ${runId}`);
    } finally {
      setLoadingSavedReport(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto" role="main" aria-label="Verification Studio Workstation">
      {/* Studio Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-6 h-6 text-accent" aria-hidden="true" />
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink">
              Verification Studio
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-muted mt-1">
            Test purchasing policies against bounded search permutations, identify reproducible loopholes,
            and inspect witness counterexamples before deployment.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-canvas text-muted border border-border">
            Workstation 5 of 9
          </span>
        </div>
      </div>

      {/* Studio Navigation Tabs */}
      <div className="flex items-center space-x-2 border-b border-border pb-2 text-xs">
        <button
          type="button"
          onClick={() => setActiveTab("RUNNER")}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded transition-colors font-medium ${
            activeTab === "RUNNER"
              ? "bg-accent/10 text-accent font-semibold border border-accent/20"
              : "text-muted hover:text-ink hover:bg-canvas"
          }`}
        >
          <PlayCircle className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Active Verification Runner</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("SAVED_RUNS")}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded transition-colors font-medium ${
            activeTab === "SAVED_RUNS"
              ? "bg-accent/10 text-accent font-semibold border border-accent/20"
              : "text-muted hover:text-ink hover:bg-canvas"
          }`}
        >
          <Database className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Persisted Runs History</span>
        </button>
      </div>

      {/* Error banner for saved runs operations */}
      {errorMessage && activeTab === "SAVED_RUNS" && (
        <div className="p-3 rounded bg-red-50 border border-red-200 text-xs text-red-900 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-700 shrink-0" aria-hidden="true" />
            <span>{errorMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="text-muted hover:text-ink text-[11px] font-medium"
          >
            Dismiss
          </button>
        </div>
      )}

      {activeTab === "SAVED_RUNS" ? (
        <SavedRunsBrowser
          onLoadReport={handleLoadSavedReport}
          isLoadingReport={loadingSavedReport}
        />
      ) : (
        <>
          {/* Policies Loading / Error State */}
          {policiesLoading ? (
            <div className="p-8 text-center text-xs text-muted space-y-2">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto text-accent" aria-hidden="true" />
              <div>Loading policy manifests...</div>
            </div>
          ) : policiesError ? (
            <div className="p-4 rounded bg-red-50 border border-red-200 text-xs text-red-900 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 text-red-700 shrink-0" aria-hidden="true" />
              <div>Failed to load policies: {policiesError}</div>
            </div>
          ) : (
            <>
              {/* Configuration Form */}
              <VerificationConfigForm
                policies={policies}
                onStartRun={(cfg, useDemo) => void handleStartRun(cfg, useDemo)}
                isRunning={status === "RUNNING"}
                initialPolicyId={initialPolicyId}
              />

              {/* Verification Status & Search Coverage */}
              <VerificationCoverageCard
                status={status}
                coverage={runResult?.coverage}
                counterexampleCount={runResult?.counterexampleCount ?? 0}
                unresolvedCount={runResult?.unresolvedCount ?? 0}
                isLiveApi={runResult?.isLiveApi}
                isDemoFixture={runResult?.isDemoFixture}
                isSavedRun={runResult?.isSavedRun}
                stopReason={runResult?.stopReason}
                summary={runResult?.summary}
                runId={runResult?.runId}
                errorMessage={errorMessage ?? runResult?.errorMessage}
              />

              {/* Findings List (Rendered when a run has produced findings or confirmed 0 findings) */}
              {runResult && status !== "RUNNING" && (
                <FindingsList
                  findings={runResult.findings}
                  totalEvaluated={runResult.coverage.totalCandidatesEvaluated}
                  onSelectFinding={(f) => setSelectedFinding(f)}
                  selectedFindingId={selectedFinding?.id}
                />
              )}

              {/* Finding Detail Modal / Drawer */}
              <FindingDetailModal
                finding={selectedFinding}
                policyVersionId={runResult?.policyVersionId}
                policyHash={runResult?.policyHash}
                onClose={() => setSelectedFinding(null)}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
