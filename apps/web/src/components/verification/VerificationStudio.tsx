import { useState, useEffect, useCallback } from "react";
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
import { fetchPolicySummaries } from "../../api/policyService";
import { VerificationConfigForm } from "./VerificationConfigForm";
import { VerificationCoverageCard } from "./VerificationCoverageCard";
import { FindingsList } from "./FindingsList";
import { FindingDetailModal } from "./FindingDetailModal";
import { SavedRunsBrowser } from "./SavedRunsBrowser";
import { RepairProposalModal } from "../policy/RepairProposalModal";
import {
  ShieldCheck,
  RefreshCw,
  AlertCircle,
  PlayCircle,
  Database,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Wrench,
  Sparkles,
} from "lucide-react";
import type { PolicyVersionRecord } from "@warrant/contracts";

interface VerificationStudioProps {
  initialPolicyId?: string;
  customPolicyOption?: PolicyOption;
  onNavigateToApproval?: () => void;
  onNavigateToMandate?: () => void;
}

export function VerificationStudio({
  initialPolicyId,
  customPolicyOption,
  onNavigateToApproval,
  onNavigateToMandate,
}: VerificationStudioProps) {
  const [activeTab, setActiveTab] = useState<"RUNNER" | "SAVED_RUNS">("RUNNER");
  const [policies, setPolicies] = useState<PolicyOption[]>([]);
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>(
    customPolicyOption?.id || initialPolicyId || "pol_v1_books_hardware",
  );
  const [policiesLoading, setPoliciesLoading] = useState(true);
  const [policiesError, setPoliciesError] = useState<string | null>(null);

  const [status, setStatus] = useState<VerificationStatus>("IDLE");
  const [runResult, setRunResult] = useState<VerificationRunResult | null>(null);
  const [selectedFinding, setSelectedFinding] = useState<VerificationFinding | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadingSavedReport, setLoadingSavedReport] = useState(false);

  // Repair Modal state
  const [isRepairOpen, setIsRepairOpen] = useState(false);
  const [repairFinding, setRepairFinding] = useState<VerificationFinding | null>(null);
  const [retestMessage, setRetestMessage] = useState<string | null>(null);

  // Load policies: presets + persisted
  const loadPolicies = useCallback(async () => {
    try {
      setPoliciesLoading(true);
      const presetData = await fetchAvailablePolicies();
      let combined: PolicyOption[] = [...presetData];

      if (customPolicyOption && !combined.some((p) => p.id === customPolicyOption.id)) {
        combined.unshift(customPolicyOption);
      }

      // Also merge any persisted policies from the database
      try {
        const persisted = await fetchPolicySummaries();
        if (persisted.state.state === "READY" && persisted.state.data) {
          for (const s of persisted.state.data) {
            if (!combined.some((p) => p.id === s.id || p.id === s.currentVersionId)) {
              combined.push({
                id: s.currentVersionId || s.id,
                version: `v${s.currentVersionNumber}`,
                name: s.name,
                hash: s.policyHash || "hash_unavailable",
                description: s.sourceMandate || s.name,
                limitsSummary: `Policy ID: ${s.id}`,
                policyDocument: {
                  schemaVersion: "1.0",
                  currency: "USD",
                  allowedCategories: ["Hardware", "Reference Books"],
                  prohibitedCategories: ["Weapons / Lasers", "Gift Cards"],
                  requireEvidence: true,
                },
                intent: {
                  name: s.name,
                  currency: "USD",
                  allowedCategories: ["Hardware", "Reference Books"],
                  prohibitedCategories: ["Weapons / Lasers", "Gift Cards"],
                  requireEvidence: true,
                },
                defaultCategories: ["Hardware", "Reference Books"],
                defaultPricePointsMinor: [15000, 25000],
              });
            }
          }
        }
      } catch {
        // Presets remain active
      }

      setPolicies(combined);
      setPoliciesError(null);
    } catch (err) {
      setPoliciesError(err instanceof Error ? err.message : "Failed to load policy versions");
    } finally {
      setPoliciesLoading(false);
    }
  }, [customPolicyOption]);

  useEffect(() => {
    void loadPolicies();
  }, [loadPolicies]);

  useEffect(() => {
    if (customPolicyOption) {
      setSelectedPolicyId(customPolicyOption.id);
    } else if (initialPolicyId) {
      setSelectedPolicyId(initialPolicyId);
    }
  }, [initialPolicyId, customPolicyOption]);

  const handleStartRun = async (config: VerificationConfig, useDemoSimulation?: boolean) => {
    if (status === "RUNNING") return; // Prevent duplicate submissions
    setStatus("RUNNING");
    setErrorMessage(null);
    setRetestMessage(null);
    setSelectedPolicyId(config.policyVersionId);

    try {
      const activePolicyOption = policies.find((p) => p.id === config.policyVersionId) || customPolicyOption;
      const result = await executeVerificationRun(config, {
        useDemoSimulation,
        customPolicyOption: activePolicyOption,
      });
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
      setActiveTab("RUNNER");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : `Failed to load saved report ${runId}`);
    } finally {
      setLoadingSavedReport(false);
    }
  };

  const handleOpenRepairForFinding = (finding: VerificationFinding) => {
    setRepairFinding(finding);
    setIsRepairOpen(true);
  };

  const handlePolicyRepaired = (newVersion: PolicyVersionRecord) => {
    setRetestMessage(
      `Repaired Version v${newVersion.versionNumber} created (${newVersion.id}). Fresh retest required.`,
    );

    const newOption: PolicyOption = {
      id: newVersion.id,
      version: `v${newVersion.versionNumber}`,
      name: newVersion.name,
      hash: newVersion.policyHash,
      description: `Repaired version v${newVersion.versionNumber}`,
      limitsSummary: `Currency: ${newVersion.policyDocument.currency}`,
      policyDocument: newVersion.policyDocument,
      intent: newVersion.intentSpec,
      defaultCategories: newVersion.policyDocument.allowedCategories ?? [],
      defaultPricePointsMinor: newVersion.policyDocument.maxItemPriceMinor
        ? [newVersion.policyDocument.maxItemPriceMinor]
        : [15000],
    };

    setPolicies((prev) => [newOption, ...prev.filter((p) => p.id !== newOption.id)]);
    setSelectedPolicyId(newVersion.id);

    // Immediately trigger fresh retest on the new version
    void handleStartRun(
      {
        policyVersionId: newVersion.id,
        policyHash: newVersion.policyHash,
        dimensions: ["PRICE_BOUNDARIES", "CATEGORY_EVASION"],
        candidateBudget: 500,
      },
      false,
    );
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
          {onNavigateToMandate && (
            <button
              type="button"
              onClick={onNavigateToMandate}
              className="inline-flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-semibold border border-border bg-surface text-ink hover:bg-canvas transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
              <span>Mandate Compiler</span>
            </button>
          )}
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-canvas text-muted border border-border">
            Phase 2: Verify & Inspect
          </span>
        </div>
      </div>

      {/* Honest Bounded Search Limitations Banner */}
      <div
        role="note"
        className="p-3.5 rounded border border-border bg-canvas/60 text-xs text-muted flex items-start space-x-2"
      >
        <AlertTriangle className="w-4 h-4 text-amber-800 shrink-0 mt-0.5" aria-hidden="true" />
        <div className="space-y-0.5">
          <span className="font-semibold text-ink">Finite Bounded Search Engine Notice:</span>
          <p className="leading-relaxed">
            Verification evaluates discrete candidate permutations within declared search dimensions and budget bounds.
            While counterexamples represent <strong>deterministic vulnerabilities</strong>, a run with zero findings
            confirms absence of defects within the explored bounds only — it <strong>never claims mathematical proof of universal safety</strong> across unbounded search spaces.
          </p>
        </div>
      </div>

      {/* Retest Active Banner */}
      {retestMessage && (
        <div className="p-3.5 rounded border border-accent/30 bg-accent/10 text-xs text-ink flex items-center space-x-2">
          <RefreshCw className="w-4 h-4 text-accent animate-spin shrink-0" aria-hidden="true" />
          <span>{retestMessage}</span>
        </div>
      )}

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
                initialPolicyId={selectedPolicyId}
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

              {/* Success Callout & Proceed to Approval */}
              {runResult && status === "COMPLETED" && runResult.counterexampleCount === 0 && runResult.unresolvedCount === 0 && (
                <div className="p-4 rounded border border-emerald-300 bg-emerald-50 text-emerald-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="w-5 h-5 text-emerald-700 shrink-0" aria-hidden="true" />
                    <div>
                      <span className="font-bold text-xs block">
                        Policy Clean: 0 Findings in Explored Bounds
                      </span>
                      <span className="text-[11px] text-emerald-900">
                        Evaluated {runResult.coverage.totalCandidatesEvaluated} permutations. Qualifying test run eligible for Decision D-014 approval.
                      </span>
                    </div>
                  </div>
                  {onNavigateToApproval && (
                    <button
                      type="button"
                      onClick={onNavigateToApproval}
                      className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded text-xs font-semibold bg-emerald-700 text-white hover:bg-emerald-800 transition-colors shadow-xs shrink-0"
                    >
                      <span>Proceed to Approval Checkpoint</span>
                      <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                    </button>
                  )}
                </div>
              )}

              {/* Quick Repair Action for Runs with Counterexamples */}
              {runResult && runResult.counterexampleCount > 0 && status !== "RUNNING" && (
                <div className="p-4 rounded border border-amber-300 bg-amber-50 text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
                  <div className="flex items-center space-x-2">
                    <AlertTriangle className="w-5 h-5 text-amber-800 shrink-0" aria-hidden="true" />
                    <div>
                      <span className="font-bold text-xs block">
                        {runResult.counterexampleCount} Policy Loophole Counterexample(s) Found
                      </span>
                      <span className="text-[11px] text-amber-900">
                        Inspect witness carts below or request an automated policy repair proposal.
                      </span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setRepairFinding(runResult.findings[0] || null);
                      setIsRepairOpen(true);
                    }}
                    className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded text-xs font-semibold bg-accent text-white hover:bg-accent/90 transition-colors shadow-xs shrink-0"
                  >
                    <Wrench className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Propose Policy Repair</span>
                  </button>
                </div>
              )}

              {/* Findings List */}
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
                testRunId={runResult?.runId}
                onClose={() => setSelectedFinding(null)}
                onOpenRepair={handleOpenRepairForFinding}
                onFindingResolved={() => {
                  // Refreshes finding status
                  if (runResult) {
                    setRunResult({ ...runResult });
                  }
                }}
              />

              {/* Automated Policy Repair Proposal Modal */}
              <RepairProposalModal
                isOpen={isRepairOpen}
                onClose={() => setIsRepairOpen(false)}
                policyVersionId={runResult?.policyVersionId || selectedPolicyId}
                testRunId={runResult?.runId}
                finding={repairFinding}
                findings={runResult?.findings}
                onPolicyRepaired={handlePolicyRepaired}
                onRetestRequested={(newVersionId) => {
                  setSelectedPolicyId(newVersionId);
                }}
              />
            </>
          )}
        </>
      )}
    </div>
  );
}
