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
import { HashBadge } from "../ui/HashBadge";
import { StatusBadge } from "../ui/StatusBadge";

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

  const [showAutomatedTests, setShowAutomatedTests] = useState(false);

  const policiesList: PolicySummary[] =
    policiesState.state === "READY" ? policiesState.data : [];

  const isAutomatedTest = (p: PolicySummary) => {
    const name = p.name.toLowerCase();
    const id = p.id.toLowerCase();
    return (
      name.includes("testing error") ||
      name.includes("integration test policy") ||
      name.includes("test concurrent") ||
      name.includes("test rollback") ||
      name.includes("test d-014") ||
      id.startsWith("test_")
    );
  };

  const curatedList = policiesList.filter((p) => !isAutomatedTest(p));
  const testList = policiesList.filter(isAutomatedTest);

  return (
    <div className="w-full space-y-6">
      {/* Title & Navigation Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <GitCompare className="w-4 h-4 text-primary" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-sans font-semibold tracking-tight text-ink">
                Policy Change Impact &amp; Approval History
              </h1>
              <p className="text-xs text-muted mt-0.5 font-sans leading-relaxed">
                Compare immutable policy versions, detect purchase rule relaxations requiring re-verification, and inspect the approval audit timeline.
              </p>
            </div>
          </div>
        </div>

        {/* Workstation Tab Switcher */}
        <div className="flex items-center space-x-1 p-1 bg-surface border border-border rounded-md shadow-2xs font-sans">
          <button
            type="button"
            onClick={() => setActiveTab("diff")}
            className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors flex items-center space-x-1.5 cursor-pointer ${
              activeTab === "diff"
                ? "bg-primary text-white shadow-2xs"
                : "text-muted hover:text-ink hover:bg-surface-subtle"
            }`}
          >
            <GitCompare className="w-3.5 h-3.5" />
            <span>Impact &amp; Diff Matrix</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("timeline")}
            className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors flex items-center space-x-1.5 cursor-pointer ${
              activeTab === "timeline"
                ? "bg-primary text-white shadow-2xs"
                : "text-muted hover:text-ink hover:bg-surface-subtle"
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Approval History Timeline</span>
          </button>
        </div>
      </div>

      {/* Fallback Banner if using Presets */}
      {isFallback && (
        <div className="p-3.5 rounded-md border border-accent/20 bg-accent/5 text-ink text-xs flex items-center space-x-2.5">
          <Info className="w-4 h-4 text-accent shrink-0" />
          <span>
            <strong>Reference Presets Mode:</strong> Displaying standard reference policies. Custom persisted policies will automatically appear once PostgreSQL persistence is active.
          </span>
        </div>
      )}

      {/* Database Standby Banner */}
      {policiesState.state === "UNAVAILABLE" && (
        <div className="p-4 rounded-md border border-review/40 bg-review/10 text-ink text-xs space-y-1">
          <div className="font-semibold flex items-center space-x-1.5 text-review font-mono">
            <AlertTriangle className="w-4 h-4 text-review" />
            <span>PostgreSQL Persistence Standby</span>
          </div>
          <p className="text-muted font-mono">{policiesState.message}</p>
        </div>
      )}

      {/* Policy List Error Banner */}
      {policiesState.state === "ERROR" && (
        <div className="p-4 rounded-md border border-deny/30 bg-deny/10 text-ink text-xs space-y-2">
          <div className="font-semibold flex items-center space-x-1.5 text-deny-border font-mono">
            <AlertTriangle className="w-4 h-4 text-deny" />
            <span>Failed to Retrieve Policies</span>
          </div>
          <p className="text-muted font-mono">{policiesState.message}</p>
          <button
            type="button"
            onClick={() => void loadPolicies()}
            className="px-3 py-1 text-xs font-mono font-semibold rounded bg-deny text-white hover:opacity-90 transition-opacity"
          >
            Retry
          </button>
        </div>
      )}

      {/* Policy List Empty Banner */}
      {policiesState.state === "EMPTY" && (
        <div className="p-6 rounded-md border border-dashed border-border bg-surface text-center text-xs text-muted font-mono">
          No policy versions found in the policy store.
        </div>
      )}

      {/* MAIN VIEW: Diff & Impact Matrix */}
      {activeTab === "diff" && (
        <div className="space-y-6">
          {/* Version Selection Header */}
          <div className="bg-surface border border-border rounded-lg p-5 space-y-4 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
              <span className="text-xs font-semibold text-ink font-sans">
                Select Policy Versions to Compare
              </span>
              <div className="flex items-center space-x-3">
                <label className="inline-flex items-center space-x-2 px-2.5 py-1 rounded-md text-[11px] font-mono border border-border bg-canvas text-ink cursor-pointer hover:border-accent transition-colors select-none">
                  <input
                    type="checkbox"
                    checked={showAutomatedTests}
                    onChange={(e) => setShowAutomatedTests(e.target.checked)}
                    className="rounded border-border text-accent focus:ring-accent w-3.5 h-3.5"
                    data-testid="toggle-diff-test-policies-btn"
                  />
                  <span>
                    {!showAutomatedTests
                      ? `Showing ${curatedList.length} policies (${testList.length} test policies hidden)`
                      : `Showing all ${policiesList.length} policies (including ${testList.length} test policies)`}
                  </span>
                </label>
                <button
                  type="button"
                  onClick={handleSwap}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-mono font-medium rounded-md border border-border bg-surface hover:bg-canvas text-ink transition-colors shadow-2xs focus:outline-none focus:ring-2 focus:ring-accent/30"
                  title="Swap Base and Target policies"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5 text-accent" />
                  <span>Swap Comparison</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Base Policy Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-mono font-semibold text-muted block">
                  Base Policy Version (Current Standard):
                </label>
                <select
                  value={baseId}
                  onChange={(e) => setBaseId(e.target.value)}
                  className="w-full text-xs font-mono font-medium px-3 py-2 rounded-md border border-border bg-canvas text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
                >
                  {!showAutomatedTests ? (
                    (curatedList.length > 0 ? curatedList : policiesList).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.id})
                      </option>
                    ))
                  ) : (
                    <>
                      <optgroup label="Standard Curated Policies">
                        {curatedList.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.id})
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Automated Test Run Policies">
                        {testList.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.id})
                          </option>
                        ))}
                      </optgroup>
                    </>
                  )}
                </select>
                {baseDetail && baseDetail.hash && (
                  <div className="pt-1">
                    <HashBadge hash={baseDetail.hash} label="Base Hash" />
                  </div>
                )}
              </div>

              {/* Target Policy Selector */}
              <div className="space-y-1.5">
                <label className="text-xs font-mono font-semibold text-muted block">
                  Target Policy Version (Proposed Update):
                </label>
                <select
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  className="w-full text-xs font-mono font-medium px-3 py-2 rounded-md border border-border bg-canvas text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
                >
                  {!showAutomatedTests ? (
                    (curatedList.length > 0 ? curatedList : policiesList).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.id})
                      </option>
                    ))
                  ) : (
                    <>
                      <optgroup label="Standard Curated Policies">
                        {curatedList.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.id})
                          </option>
                        ))}
                      </optgroup>
                      <optgroup label="Automated Test Run Policies">
                        {testList.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.id})
                          </option>
                        ))}
                      </optgroup>
                    </>
                  )}
                </select>
                {targetDetail && targetDetail.hash && (
                  <div className="pt-1">
                    <HashBadge hash={targetDetail.hash} label="Target Hash" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Details Loading or Error */}
          {loadingDetails && (
            <div className="p-6 text-center text-xs text-muted border border-border rounded-md bg-surface animate-pulse font-mono">
              Calculating policy rule diff and re-verification triggers...
            </div>
          )}

          {detailError && (
            <div className="p-4 rounded-md border border-deny/30 bg-deny/10 text-ink text-xs space-y-2">
              <div className="flex items-center space-x-1.5 font-semibold text-deny-border font-mono">
                <AlertTriangle className="w-4 h-4 text-deny" />
                <span>Policy Version Detail Unavailable</span>
              </div>
              <p className="text-muted font-mono">{detailError}</p>
              <button
                type="button"
                onClick={() => {
                  setBaseId("pol_v1_books_hardware");
                  setTargetId("pol_seeded_defect_unbounded_cart");
                }}
                className="px-2.5 py-1 text-xs font-mono font-semibold rounded bg-deny text-white hover:opacity-90 transition-opacity"
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
                className={`p-5 rounded-lg border ${
                  diffComparison.overallSeverity === "CRITICAL"
                    ? "border-deny/40 bg-deny/10 text-ink"
                    : diffComparison.overallSeverity === "HIGH"
                    ? "border-review/40 bg-review/10 text-ink"
                    : diffComparison.overallSeverity === "MODERATE" ||
                      diffComparison.overallSeverity === "LOW"
                    ? "border-accent/30 bg-accent/10 text-ink"
                    : "border-allow/40 bg-allow/10 text-ink"
                } shadow-2xs`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      {diffComparison.overallSeverity === "CRITICAL" && (
                        <AlertTriangle className="w-5 h-5 text-deny" />
                      )}
                      {diffComparison.overallSeverity === "HIGH" && (
                        <AlertTriangle className="w-5 h-5 text-review" />
                      )}
                      {(diffComparison.overallSeverity === "MODERATE" ||
                        diffComparison.overallSeverity === "LOW") && (
                        <Layers className="w-5 h-5 text-accent" />
                      )}
                      {diffComparison.overallSeverity === "IDENTICAL" && (
                        <CheckCircle2 className="w-5 h-5 text-allow" />
                      )}

                      <span className="font-bold text-sm tracking-tight font-sans">
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

                    <p className="text-xs max-w-3xl leading-relaxed text-muted font-mono">
                      {diffComparison.summary}
                    </p>
                  </div>

                  {/* Quick Action: Open in Verification Studio */}
                  {onNavigateToVerification && diffComparison.reverificationRequired && (
                    <button
                      type="button"
                      onClick={() => onNavigateToVerification(diffComparison.targetId)}
                      className="px-3.5 py-1.5 text-xs font-mono font-semibold rounded-md bg-accent text-white hover:opacity-90 active:opacity-100 transition-all shadow-2xs inline-flex items-center space-x-1.5 shrink-0 focus:outline-none focus:ring-2 focus:ring-accent/30"
                    >
                      <Shield className="w-3.5 h-3.5" />
                      <span>Verify Target in Studio</span>
                      <ExternalLink className="w-3 h-3" />
                    </button>
                  )}
                </div>

                {/* Specific Risk Triggers List */}
                {diffComparison.criticalTriggers.length > 0 && (
                  <div className="mt-4 pt-3 border-t border-border/80 space-y-1.5 font-sans">
                    <div className="text-xs font-semibold text-deny-border">
                      Identified Re-Verification Triggers:
                    </div>
                    <ul className="text-xs space-y-1 pl-4 list-disc text-ink">
                      {diffComparison.criticalTriggers.map((trig, idx) => (
                        <li key={idx} className="font-medium">
                          {trig}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="mt-3 pt-2.5 border-t border-border/80 text-[11px] text-muted font-sans">
                  <span className="font-semibold text-ink">Security Boundary Notice:</span> Bounded verification evaluates search spaces within finite candidate budgets. Passing verification runs confirm the absence of counterexamples within the evaluated space; they do not constitute proof of universal safety.
                </div>
              </div>

              {/* Rule Comparison Table */}
              <div className="rounded-lg border border-border bg-surface overflow-hidden shadow-2xs font-sans">
                <div className="px-5 py-3 border-b border-border bg-canvas/30 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <FileCheck className="w-4 h-4 text-accent" />
                    <h3 className="font-semibold text-xs text-ink">
                      Purchase Invariant Comparison Matrix
                    </h3>
                  </div>
                  <span className="text-xs text-muted">
                    {diffComparison.ruleDiffs.filter((d) => d.changed).length} changed rule(s)
                  </span>
                </div>

                <div className="overflow-x-auto max-h-[520px] overflow-y-auto" data-lenis-prevent>
                  <table className="w-full text-left border-collapse text-xs min-w-[640px]">
                    <thead className="sticky top-0 z-10">
                      <tr className="border-b border-border bg-surface text-muted text-[11px] font-medium font-sans shadow-2xs">
                        <th className="py-2.5 px-4 bg-surface">Policy Rule / Invariant</th>
                        <th className="py-2.5 px-4 bg-surface">Base Version ({diffComparison.baseName})</th>
                        <th className="py-2.5 px-4 bg-surface">Target Version ({diffComparison.targetName})</th>
                        <th className="py-2.5 px-4 bg-surface">Change &amp; Impact</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {diffComparison.ruleDiffs.map((diff) => {
                        return (
                          <tr
                            key={diff.field}
                            className={`hover:bg-canvas/30 transition-colors ${
                              diff.severity === "CRITICAL"
                                ? "bg-deny/5"
                                : diff.severity === "HIGH"
                                ? "bg-warning/5"
                                : diff.changed
                                ? "bg-accent/5"
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
                                    <StatusBadge
                                      status={
                                        diff.severity === "CRITICAL"
                                          ? "CRITICAL TRIGGER"
                                          : diff.severity === "HIGH"
                                          ? "TRIGGER"
                                          : "CHANGED"
                                      }
                                      variant={
                                        diff.severity === "CRITICAL"
                                          ? "CRITICAL"
                                          : diff.severity === "HIGH"
                                          ? "HIGH"
                                          : "REVIEW"
                                      }
                                      size="sm"
                                    />
                                  )}
                                  {!diff.changed && (
                                    <StatusBadge status="UNCHANGED" variant="LOW" size="sm" />
                                  )}
                                </div>
                                {diff.notes && (
                                  <p className="text-[11px] text-muted font-mono">{diff.notes}</p>
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
              <div className="p-4 rounded-lg border border-border bg-surface shadow-2xs grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-sans">
                <div className="space-y-1">
                  <span className="font-medium text-muted text-xs block">
                    Base Cryptographic SHA-256 Hash:
                  </span>
                  <code data-lenis-prevent className="font-mono text-ink bg-canvas p-2 rounded-md border border-border block overflow-x-auto select-all text-[11px]">
                    {diffComparison.baseHash || "None (uncompiled)"}
                  </code>
                </div>

                <div className="space-y-1">
                  <span className="font-medium text-muted text-xs block">
                    Target Cryptographic SHA-256 Hash:
                  </span>
                  <code data-lenis-prevent className="font-mono text-ink bg-canvas p-2 rounded-md border border-border block overflow-x-auto select-all text-[11px]">
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
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 text-xs font-mono font-semibold rounded-md bg-accent text-white hover:opacity-90 transition-all shadow-2xs"
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
      <div className="p-3 rounded-md border border-border bg-canvas/40 text-[11px] text-muted flex items-start space-x-2">
        <Info className="w-4 h-4 text-accent shrink-0 mt-0.5" />
        <p>
          <strong className="text-ink">Security Boundary Notice:</strong> Policy comparison highlights purchase invariant differences, and bounded verification tests finite candidate budgets. Passing verification runs confirm absence of counterexamples within the evaluated space; they do not constitute proof of universal safety.
        </p>
      </div>
    </div>
  );
}
