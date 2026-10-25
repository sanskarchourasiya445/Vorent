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
    <div className="space-y-6 w-full pb-12 sm:pb-16" role="main" aria-label="Verification Studio Workstation">
      {/* Studio Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-4 h-4 text-primary" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-sans font-semibold tracking-tight text-ink">
                Verification Studio
              </h1>
              <p className="text-xs text-muted mt-0.5 font-sans leading-relaxed">
                Test purchasing policies against bounded search permutations, identify reproducible loopholes,
                and inspect witness counterexamples before deployment.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2 self-start sm:self-center">
          {onNavigateToMandate && (
            <button
              type="button"
              onClick={onNavigateToMandate}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-sans font-medium border border-border bg-surface hover:bg-surface-subtle text-ink transition-colors shadow-2xs focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-primary" aria-hidden="true" />
              <span>Mandate Compiler</span>
            </button>
          )}
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-sans font-medium bg-surface text-ink border border-border shadow-2xs">
            Phase 2: Verify &amp; Inspect
          </span>
        </div>
      </div>

      {/* Honest Bounded Search Limitations Banner */}
      <div
        role="note"
        className="p-3.5 rounded-lg border border-border bg-surface text-xs text-ink flex items-start space-x-2.5 shadow-2xs font-sans"
      >
        <AlertTriangle className="w-4 h-4 text-review shrink-0 mt-0.5" aria-hidden="true" />
        <div className="space-y-0.5">
          <span className="font-semibold text-ink">Finite Bounded Search Engine Notice:</span>
          <p className="leading-relaxed text-muted font-sans">
            Verification evaluates discrete candidate permutations within declared search dimensions and budget bounds.
            While counterexamples represent <strong>deterministic vulnerabilities</strong>, a run with zero findings
            confirms absence of defects within the explored bounds only — it <strong>never claims mathematical proof of universal safety</strong> across unbounded search spaces.
          </p>
        </div>
      </div>

      {/* Retest Active Banner */}
      {retestMessage && (
        <div className="p-3.5 rounded-md border border-primary/30 bg-primary/10 text-xs text-ink flex items-center space-x-2 font-sans">
          <RefreshCw className="w-4 h-4 text-primary animate-spin shrink-0" aria-hidden="true" />
          <span>{retestMessage}</span>
        </div>
      )}

      {/* Studio Navigation Tabs */}
      <div className="flex items-center space-x-2 border-b border-border pb-2 text-xs font-sans">
        <button
          type="button"
          onClick={() => setActiveTab("RUNNER")}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md transition-colors font-medium cursor-pointer ${
            activeTab === "RUNNER"
              ? "bg-primary-soft text-primary font-semibold border border-primary/25 shadow-2xs"
              : "text-muted hover:text-ink hover:bg-surface-subtle"
          }`}
        >
          <PlayCircle className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Active Verification Runner</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("SAVED_RUNS")}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md transition-colors font-medium cursor-pointer ${
            activeTab === "SAVED_RUNS"
              ? "bg-primary-soft text-primary font-semibold border border-primary/25 shadow-2xs"
              : "text-muted hover:text-ink hover:bg-surface-subtle"
          }`}
        >
          <Database className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Persisted Runs History</span>
        </button>
      </div>

      {/* Error banner for saved runs operations */}
      {errorMessage && activeTab === "SAVED_RUNS" && (
        <div className="p-3 rounded-md bg-deny/10 border border-deny/30 text-xs text-deny-border flex items-center justify-between font-mono">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-deny shrink-0" aria-hidden="true" />
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
            <div className="p-8 text-center text-xs text-muted space-y-2 font-mono">
              <RefreshCw className="w-5 h-5 animate-spin mx-auto text-accent" aria-hidden="true" />
              <div>Loading policy manifests...</div>
            </div>
          ) : policiesError ? (
            <div className="p-4 rounded-md bg-deny/10 border border-deny/30 text-xs text-deny-border flex items-center space-x-2 font-mono">
              <AlertCircle className="w-4 h-4 text-deny shrink-0" aria-hidden="true" />
              <div>Failed to load policies: {policiesError}</div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                {/* Left Configuration Rail (Desktop: 5-cols balanced, Sticky) */}
                <div className="w-full lg:col-span-5 lg:sticky lg:top-4 space-y-4">
                  <VerificationConfigForm
                    policies={policies}
                    onStartRun={(cfg, useDemo) => void handleStartRun(cfg, useDemo)}
                    isRunning={status === "RUNNING"}
                    initialPolicyId={selectedPolicyId}
                  />
                </div>

                {/* Right Verdict & Coverage Workspace (Desktop: 7-cols balanced, Fluid) */}
                <div className="w-full lg:col-span-7 space-y-6">
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

                  {/* Authoritative Clean Verdict & Proceed to Approval */}
                  {runResult && status === "COMPLETED" && runResult.counterexampleCount === 0 && runResult.unresolvedCount === 0 && (
                    <div className="p-4 sm:p-5 rounded-lg border border-allow/40 bg-allow/10 text-ink flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
                      <div className="flex items-center space-x-3">
                        <div className="w-9 h-9 rounded-md bg-allow/20 border border-allow/30 flex items-center justify-center shrink-0">
                          <CheckCircle2 className="w-5 h-5 text-allow" aria-hidden="true" />
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-sm tracking-tight text-ink font-mono">
                              POLICY CLEAN: 0 FINDINGS IN EXPLORED BOUNDS
                            </span>
                            <span className="px-2 py-0.2 rounded text-[10px] font-mono font-bold bg-allow/20 text-allow border border-allow/30">
                              VERIFIED
                            </span>
                          </div>
                          <span className="text-xs text-muted font-mono mt-0.5 block">
                            Evaluated {runResult.coverage.totalCandidatesEvaluated} permutations. Qualifying test run eligible for Decision D-014 approval.
                          </span>
                        </div>
                      </div>
                      {onNavigateToApproval && (
                        <button
                          type="button"
                          onClick={onNavigateToApproval}
                          className="inline-flex items-center justify-center space-x-1.5 px-4 py-2 rounded-md text-xs font-mono font-semibold bg-allow text-white hover:bg-allow/90 transition-colors shadow-2xs shrink-0 self-start sm:self-auto focus:outline-none focus:ring-2 focus:ring-allow/30"
                        >
                          <span>Proceed to Approval Checkpoint</span>
                          <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  )}

                  {/* Authoritative Defect Verdict & Repair Action for Runs with Counterexamples */}
                  {runResult && runResult.counterexampleCount > 0 && status !== "RUNNING" && (
                    <div className="p-4 sm:p-5 rounded-lg border border-deny/40 bg-deny/10 text-ink flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-2xs">
                      <div className="flex items-center space-x-3">
                        <div className="w-9 h-9 rounded-md bg-deny/20 border border-deny/30 flex items-center justify-center shrink-0">
                          <AlertTriangle className="w-5 h-5 text-deny" aria-hidden="true" />
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-sm tracking-tight text-ink font-mono">
                              {runResult.counterexampleCount} POLICY LOOPHOLE COUNTEREXAMPLE(S) FOUND
                            </span>
                            <span className="px-2 py-0.2 rounded text-[10px] font-mono font-bold bg-deny/20 text-deny border border-deny/30">
                              DEFECT
                            </span>
                          </div>
                          <span className="text-xs text-muted font-mono mt-0.5 block">
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
                        className="inline-flex items-center justify-center space-x-1.5 px-4 py-2 rounded-md text-xs font-mono font-semibold bg-deny text-white hover:bg-deny/90 transition-colors shadow-2xs shrink-0 self-start sm:self-auto focus:outline-none focus:ring-2 focus:ring-deny/30"
                      >
                        <span>Inspect Policy Repair Proposal</span>
                        <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Full-Width Findings Workspace — prevents multi-line text wrapping on witness carts */}
              {runResult && status !== "RUNNING" && (
                <div className="w-full mt-6">
                  <FindingsList
                    findings={runResult.findings}
                    totalEvaluated={runResult.coverage.totalCandidatesEvaluated}
                    onSelectFinding={(f) => setSelectedFinding(f)}
                    selectedFindingId={selectedFinding?.id}
                  />
                </div>
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
