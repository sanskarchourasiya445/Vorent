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
import { VerificationConfigForm } from "./VerificationConfigForm";
import { VerificationCoverageCard } from "./VerificationCoverageCard";
import { FindingsList } from "./FindingsList";
import { FindingDetailModal } from "./FindingDetailModal";
import { ShieldCheck, RefreshCw, AlertCircle } from "lucide-react";

interface VerificationStudioProps {
  initialPolicyId?: string;
}

export function VerificationStudio({ initialPolicyId }: VerificationStudioProps) {
  const [policies, setPolicies] = useState<PolicyOption[]>([]);
  const [policiesLoading, setPoliciesLoading] = useState(true);
  const [policiesError, setPoliciesError] = useState<string | null>(null);

  const [status, setStatus] = useState<VerificationStatus>("IDLE");
  const [runResult, setRunResult] = useState<VerificationRunResult | null>(null);
  const [selectedFinding, setSelectedFinding] = useState<VerificationFinding | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

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

  const handleStartRun = async (config: VerificationConfig) => {
    setStatus("RUNNING");
    setErrorMessage(null);
    try {
      const result = await executeVerificationRun(config);
      setRunResult(result);
      setStatus(result.status);
    } catch (err) {
      setStatus("FAILED");
      const msg = err instanceof Error ? err.message : "Verification probe execution failed";
      setErrorMessage(msg);
      setRunResult(null);
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
            onStartRun={(cfg) => void handleStartRun(cfg)}
            isRunning={status === "RUNNING"}
            initialPolicyId={initialPolicyId}
          />

          {/* Verification Status & Search Coverage */}
          <VerificationCoverageCard
            status={status}
            coverage={runResult?.coverage}
            counterexampleCount={runResult?.counterexampleCount ?? 0}
            unresolvedCount={runResult?.unresolvedCount ?? 0}
            isDemoFixture={runResult?.isDemoFixture}
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
    </div>
  );
}
