import { useEffect, useState, useMemo, useCallback } from "react";
import {
  GitCompare,
  AlertTriangle,
  CheckCircle2,
  ArrowRightLeft,
  Shield,
  FileCheck,
  History,
  Layers,
  ExternalLink,
  Info,
} from "lucide-react";
import {
  fetchPolicySummaries,
  fetchPolicyVersionDetail,
} from "../../api/policyService";
import {
  computePolicyDiff,
  type PolicyComparisonInput,
  type PolicyDiffComparison,
} from "../../utils/policyDiff";
import { ApprovalHistoryTimeline } from "./ApprovalHistoryTimeline";
import type { PolicySummary } from "@warrant/contracts";
import type { PersistenceLoadState } from "../../types/persistence";

interface Props {
  initialBasePolicyId?: string;
  initialTargetPolicyId?: string;
  onNavigateToVerification?: (policyId: string) => void;
  onNavigateToApproval?: () => void;
}

export function PolicyChangeImpactPanel({
  initialBasePolicyId,
  initialTargetPolicyId,
  onNavigateToVerification,
  onNavigateToApproval,
}: Props) {
  const [activeTab, setActiveTab] = useState<"diff" | "timeline">("diff");
  const [policiesState, setPoliciesState] = useState<PersistenceLoadState<PolicySummary[]>>({
    state: "LOADING",
  });
  const [isFallback, setIsFallback] = useState(false);

  // Selected policy IDs
  const [baseId, setBaseId] = useState<string>(
    initialBasePolicyId || "pol_v1_books_hardware",
  );
  const [targetId, setTargetId] = useState<string>(
    initialTargetPolicyId || "pol_seeded_defect_unbounded_cart",
  );

  // Loaded full details
  const [baseDetail, setBaseDetail] = useState<PolicyComparisonInput | null>(null);
  const [targetDetail, setTargetDetail] = useState<PolicyComparisonInput | null>(null);
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  // Load policy list
  const loadPolicies = useCallback(async () => {
    setPoliciesState({ state: "LOADING" });
    const result = await fetchPolicySummaries();
    setPoliciesState(result.state);
    setIsFallback(result.isFallback);

    if (result.state.state === "READY" && result.state.data.length > 0) {
      const list = result.state.data;
      if (!list.some((p) => p.id === baseId)) {
        setBaseId(list[0].id);
      }
      if (!list.some((p) => p.id === targetId)) {
        setTargetId(list[1]?.id || list[0].id);
      }
    }
  }, [baseId, targetId]);

  useEffect(() => {
    void loadPolicies();
  }, [loadPolicies]);

  // Load details whenever baseId or targetId changes
  useEffect(() => {
    let cancelled = false;
    async function loadDetails() {
      setLoadingDetails(true);
      setDetailError(null);
      try {
        const [baseRes, targetRes] = await Promise.all([
          fetchPolicyVersionDetail(baseId),
          fetchPolicyVersionDetail(targetId),
        ]);
        if (!cancelled) {
          setBaseDetail(baseRes);
          setTargetDetail(targetRes);
        }
      } catch (err) {
        if (!cancelled) {
          setDetailError(
            err instanceof Error ? err.message : "Failed to load policy version details.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoadingDetails(false);
        }
      }
    }

    if (baseId && targetId) {
      void loadDetails();
    }

    return () => {
      cancelled = true;
    };
  }, [baseId, targetId]);

  // Compute diff
  const diffComparison: PolicyDiffComparison | null = useMemo(() => {
    if (!baseDetail || !targetDetail) return null;
    return computePolicyDiff(baseDetail, targetDetail);
  }, [baseDetail, targetDetail]);

  const handleSwap = () => {
    setBaseId(targetId);
    setTargetId(baseId);
  };

  const handleSelectFromTimeline = (versionId: string) => {
    setTargetId(versionId);
    setActiveTab("diff");
  };

  const policiesList: PolicySummary[] =
    policiesState.state === "READY" ? policiesState.data : [];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Title & Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-ink flex items-center space-x-2">
            <GitCompare className="w-6 h-6 text-accent" />
            <span>Policy Change Impact & Approval History</span>
          </h1>
          <p className="text-sm text-muted mt-1">
            Compare immutable policy versions, detect purchase rule relaxations requiring re-verification, and inspect the approval audit timeline.
          </p>
        </div>

        {/* Workstation Tab Switcher */}
        <div className="flex items-center space-x-1 p-1 bg-surface border border-border rounded-lg">
          <button
            type="button"
            onClick={() => setActiveTab("diff")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center space-x-1.5 ${
              activeTab === "diff"
                ? "bg-accent text-white shadow-sm"
                : "text-muted hover:text-ink hover:bg-canvas"
            }`}
          >
            <GitCompare className="w-3.5 h-3.5" />
            <span>Impact & Diff Matrix</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("timeline")}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center space-x-1.5 ${
              activeTab === "timeline"
                ? "bg-accent text-white shadow-sm"
                : "text-muted hover:text-ink hover:bg-canvas"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Approval History Timeline</span>
          </button>
        </div>
      </div>

      {/* Fallback Banner if using Presets */}
      {isFallback && (
        <div className="p-3.5 rounded border border-blue-200 bg-blue-50/70 text-blue-900 text-xs flex items-center space-x-2.5">
          <Info className="w-4 h-4 text-blue-600 shrink-0" />
          <span>
            <strong>Reference Presets Mode:</strong> Displaying standard reference policies. Custom persisted policies will automatically appear once PostgreSQL persistence is active.
          </span>
        </div>
      )}

      {/* Database Standby Banner */}
      {policiesState.state === "UNAVAILABLE" && (
        <div className="p-4 rounded border border-amber-300 bg-amber-50 text-amber-900 text-xs space-y-1">
          <div className="font-semibold flex items-center space-x-1.5">
            <AlertTriangle className="w-4 h-4 text-amber-600" />
            <span>PostgreSQL Persistence Standby</span>
          </div>
          <p className="text-amber-800">{policiesState.message}</p>
        </div>
      )}

      {/* Policy List Error Banner */}
      {policiesState.state === "ERROR" && (
        <div className="p-4 rounded border border-red-300 bg-red-50 text-red-900 text-xs space-y-2">
          <div className="font-semibold flex items-center space-x-1.5">
            <AlertTriangle className="w-4 h-4 text-red-600" />
            <span>Failed to Retrieve Policies</span>
          </div>
          <p className="text-red-800">{policiesState.message}</p>
          <button
            type="button"
            onClick={() => void loadPolicies()}
            className="px-3 py-1 text-xs font-semibold rounded bg-red-600 text-white hover:bg-red-700 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Policy List Empty Banner */}
      {policiesState.state === "EMPTY" && (
        <div className="p-6 rounded border border-dashed border-border bg-surface text-center text-xs text-muted">
          No policy versions found in the policy store.
        </div>
      )}

      {/* MAIN VIEW: Diff & Impact Matrix */}
      {activeTab === "diff" && (
        <div className="space-y-6">
          {/* Version Selection Header */}
          <div className="p-5 rounded-panel border border-border bg-surface space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                Select Policy Versions to Compare
              </span>
              <button
                type="button"
                onClick={handleSwap}
                className="inline-flex items-center space-x-1.5 px-3 py-1 text-xs font-medium rounded border border-border bg-canvas hover:bg-surface text-ink transition-colors"
                title="Swap Base and Target policies"
              >
                <ArrowRightLeft className="w-3.5 h-3.5 text-accent" />
                <span>Swap Comparison</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Base Policy Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted block">
                  Base Policy Version (Current Standard):
                </label>
                <select
                  value={baseId}
                  onChange={(e) => setBaseId(e.target.value)}
                  className="w-full text-xs font-medium px-3 py-2 rounded border border-border bg-canvas text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  {policiesList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.id})
                    </option>
                  ))}
                </select>
                {baseDetail && (
                  <div className="text-[11px] text-muted flex items-center space-x-2 pt-1 font-mono">
                    <span>Hash: {baseDetail.hash?.slice(0, 16)}...</span>
                  </div>
                )}
              </div>

              {/* Target Policy Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-muted block">
                  Target Policy Version (Proposed Update):
                </label>
                <select
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  className="w-full text-xs font-medium px-3 py-2 rounded border border-border bg-canvas text-ink focus:outline-none focus:ring-1 focus:ring-accent"
                >
                  {policiesList.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.id})
                    </option>
                  ))}
                </select>
                {targetDetail && (
                  <div className="text-[11px] text-muted flex items-center space-x-2 pt-1 font-mono">
                    <span>Hash: {targetDetail.hash?.slice(0, 16)}...</span>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Details Loading or Error */}
          {loadingDetails && (
            <div className="p-6 text-center text-xs text-muted border border-border rounded-panel bg-surface animate-pulse">
              Calculating policy rule diff and re-verification triggers...
            </div>
          )}

          {detailError && (
            <div className="p-4 rounded border border-red-300 bg-red-50 text-red-900 text-xs space-y-2">
              <div className="flex items-center space-x-1.5 font-semibold">
                <AlertTriangle className="w-4 h-4 text-red-600" />
                <span>Policy Version Detail Unavailable</span>
              </div>
              <p className="text-red-800">{detailError}</p>
              <button
                type="button"
                onClick={() => {
                  setBaseId("pol_v1_books_hardware");
                  setTargetId("pol_seeded_defect_unbounded_cart");
                }}
                className="px-2.5 py-1 text-xs font-semibold rounded bg-red-600 text-white hover:bg-red-700 transition-colors"
              >
                Reset to Standard Presets
              </button>
            </div>
          )}

          {/* Re-Verification Trigger Banner & Impact Summary */}
          {diffComparison && !loadingDetails && (
            <div className="space-y-4">
              {/* Severity Banner */}
              <div
                className={`p-5 rounded-panel border ${
                  diffComparison.overallSeverity === "CRITICAL"
                    ? "border-red-300 bg-red-50/90 text-red-950"
                    : diffComparison.overallSeverity === "HIGH"
                    ? "border-amber-300 bg-amber-50/90 text-amber-950"
                    : diffComparison.overallSeverity === "MODERATE" ||
                      diffComparison.overallSeverity === "LOW"
                    ? "border-blue-300 bg-blue-50/90 text-blue-950"
                    : "border-emerald-300 bg-emerald-50/90 text-emerald-950"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      {diffComparison.overallSeverity === "CRITICAL" && (
                        <AlertTriangle className="w-5 h-5 text-red-600" />
                      )}
                      {diffComparison.overallSeverity === "HIGH" && (
                        <AlertTriangle className="w-5 h-5 text-amber-600" />
                      )}
                      {(diffComparison.overallSeverity === "MODERATE" ||
                        diffComparison.overallSeverity === "LOW") && (
                        <Layers className="w-5 h-5 text-blue-600" />
                      )}
                      {diffComparison.overallSeverity === "IDENTICAL" && (
                        <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                      )}

                      <span className="font-bold text-sm tracking-tight">
                        {diffComparison.overallSeverity === "CRITICAL"
                          ? "RE-VERIFICATION STRICTLY REQUIRED (High-Risk Relaxation)"
                          : diffComparison.overallSeverity === "HIGH"
                          ? "RE-VERIFICATION REQUIRED (Spending / Restriction Change)"
                          : diffComparison.overallSeverity === "MODERATE" ||
                            diffComparison.overallSeverity === "LOW"
                          ? "POLICY MODIFIED (New Cryptographic Hash)"
                          : "POLICIES IDENTICAL (No Rule Differences)"}
                      </span>
                    </div>

                    <p className="text-xs max-w-3xl leading-relaxed">
                      {diffComparison.summary}
                    </p>
                  </div>

                  {/* Quick Action: Open in Verification Studio */}
                  {onNavigateToVerification && diffComparison.reverificationRequired && (
                    <button
                      type="button"
                      onClick={() => onNavigateToVerification(diffComparison.targetId)}
                      className="px-3.5 py-1.5 text-xs font-semibold rounded bg-accent text-white hover:bg-accent/90 transition-colors shadow-sm inline-flex items-center space-x-1.5 shrink-0"
                    >
                      <Shield className="w-3.5 h-3.5" />
                      <span>Verify Target in Studio</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Specific Risk Triggers List */}
                {diffComparison.criticalTriggers.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-red-200/60 dark:border-red-900/40 space-y-1.5">
                    <div className="text-[11px] font-bold uppercase tracking-wider text-red-900">
                      Identified Re-Verification Triggers:
                    </div>
                    <ul className="text-xs space-y-1 pl-4 list-disc">
                      {diffComparison.criticalTriggers.map((trig, idx) => (
                        <li key={idx} className="font-medium">
                          {trig}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-3 pt-2.5 border-t border-border/50 text-[11px] opacity-85">
                  <span className="font-semibold">Security Boundary Notice:</span> Bounded verification evaluates search spaces within finite candidate budgets. Passing verification runs confirm the absence of counterexamples within the evaluated space; they do not constitute proof of universal safety.
                </div>
              </div>

              {/* Rule Comparison Table */}
              <div className="rounded-panel border border-border bg-surface overflow-hidden">
                <div className="px-5 py-3 border-b border-border bg-canvas/60 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <FileCheck className="w-4 h-4 text-accent" />
                    <h3 className="font-semibold text-xs text-ink uppercase tracking-wider">
                      Purchase Invariant Comparison Matrix
                    </h3>
                  </div>
                  <span className="text-xs text-muted">
                    {diffComparison.ruleDiffs.filter((d) => d.changed).length} changed rule(s)
                  </span>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-border bg-canvas/30 text-muted uppercase text-[10px] tracking-wider font-semibold">
                        <th className="py-2.5 px-4">Policy Rule / Invariant</th>
                        <th className="py-2.5 px-4">Base Version ({diffComparison.baseName})</th>
                        <th className="py-2.5 px-4">Target Version ({diffComparison.targetName})</th>
                        <th className="py-2.5 px-4">Change & Impact</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {diffComparison.ruleDiffs.map((diff) => {
                        return (
                          <tr
                            key={diff.field}
                            className={`hover:bg-canvas/40 transition-colors ${
                              diff.severity === "CRITICAL"
                                ? "bg-red-50/40"
                                : diff.severity === "HIGH"
                                ? "bg-amber-50/40"
                                : diff.changed
                                ? "bg-blue-50/20"
                                : ""
                            }`}
                          >
                            <td className="py-3 px-4 font-semibold text-ink whitespace-nowrap">
                              {diff.label}
                            </td>
                            <td className="py-3 px-4 font-mono text-muted">
                              {diff.baseDisplay}
                            </td>
                            <td className="py-3 px-4 font-mono font-medium text-ink">
                              {diff.targetDisplay}
                            </td>
                            <td className="py-3 px-4">
                              <div className="space-y-1">
                                <div className="flex items-center space-x-1.5">
                                  {diff.reverificationTrigger && (
                                    <span
                                      className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                                        diff.severity === "CRITICAL"
                                          ? "bg-red-100 text-red-900 border border-red-300"
                                          : diff.severity === "HIGH"
                                          ? "bg-amber-100 text-amber-900 border border-amber-300"
                                          : "bg-blue-100 text-blue-900 border border-blue-300"
                                      }`}
                                    >
                                      {diff.severity === "CRITICAL"
                                        ? "CRITICAL TRIGGER"
                                        : diff.severity === "HIGH"
                                        ? "TRIGGER"
                                        : "CHANGED"}
                                    </span>
                                  )}
                                  {!diff.changed && (
                                    <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-canvas text-muted border border-border">
                                      UNCHANGED
                                    </span>
                                  )}
                                </div>
                                {diff.notes && (
                                  <p className="text-[11px] text-muted">{diff.notes}</p>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Side-by-side Cryptographic Fingerprints */}
              <div className="p-4 rounded-panel border border-border bg-surface grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="space-y-1">
                  <span className="font-semibold text-muted text-[11px] uppercase tracking-wider block">
                    Base Cryptographic SHA-256 Hash:
                  </span>
                  <code className="font-mono text-ink bg-canvas p-2 rounded border border-border block overflow-x-auto select-all text-[11px]">
                    {diffComparison.baseHash || "None (uncompiled)"}
                  </code>
                </div>

                <div className="space-y-1">
                  <span className="font-semibold text-muted text-[11px] uppercase tracking-wider block">
                    Target Cryptographic SHA-256 Hash:
                  </span>
                  <code className="font-mono text-ink bg-canvas p-2 rounded border border-border block overflow-x-auto select-all text-[11px]">
                    {diffComparison.targetHash || "None (uncompiled)"}
                  </code>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SECOND VIEW: Approval History Timeline */}
      {activeTab === "timeline" && (
        <div className="space-y-4">
          {onNavigateToApproval && (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onNavigateToApproval}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded bg-accent text-white hover:bg-accent/90 transition-colors shadow-sm"
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Open Approval Checkpoints</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          )}
          <ApprovalHistoryTimeline
            selectedPolicyHash={targetDetail?.hash}
            onSelectPolicyVersion={handleSelectFromTimeline}
          />
        </div>
      )}

      {/* Permanent Security Boundary Notice */}
      <div className="p-3 rounded border border-border bg-canvas/40 text-[11px] text-muted flex items-start space-x-2">
        <Info className="w-4 h-4 text-accent shrink-0 mt-0.5" />
        <p>
          <strong className="text-ink">Security Boundary Notice:</strong> Policy comparison highlights purchase invariant differences, and bounded verification tests finite candidate budgets. Passing verification runs confirm absence of counterexamples within the evaluated space; they do not constitute proof of universal safety.
        </p>
      </div>
    </div>
  );
}
