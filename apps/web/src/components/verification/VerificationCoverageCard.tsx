import type { VerificationCoverage, VerificationStatus } from "../../types/verification";
import { HashBadge } from "../ui/HashBadge";
import {
  CheckCircle2,
  AlertTriangle,
  Clock,
  Layers,
  Activity,
  AlertCircle,
  HelpCircle,
  Info,
} from "lucide-react";

interface VerificationCoverageCardProps {
  status: VerificationStatus;
  coverage?: VerificationCoverage;
  counterexampleCount: number;
  unresolvedCount: number;
  isLiveApi?: boolean;
  isDemoFixture?: boolean;
  isSavedRun?: boolean;
  stopReason?: string;
  summary?: string;
  runId?: string;
  errorMessage?: string;
}

export function VerificationCoverageCard({
  status,
  coverage,
  counterexampleCount,
  unresolvedCount,
  isLiveApi = false,
  isDemoFixture = false,
  isSavedRun = false,
  stopReason,
  summary,
  runId,
  errorMessage,
}: VerificationCoverageCardProps) {
  const getStatusBadge = () => {
    switch (status) {
      case "RUNNING":
        return {
          icon: <Activity className="w-4 h-4 animate-spin text-accent" aria-hidden="true" />,
          label: "VERIFICATION RUNNING",
          styles: "bg-accent/10 text-accent border-accent/30",
        };
      case "COMPLETED":
        return {
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-800 dark:text-allow" aria-hidden="true" />,
          label: "EXHAUSTIVE RUN COMPLETE",
          styles: "bg-emerald-100 dark:bg-allow/20 text-emerald-950 dark:text-allow border-emerald-300 dark:border-allow/40",
        };
      case "BUDGET_EXHAUSTED":
        return {
          icon: <AlertTriangle className="w-4 h-4 text-amber-800 dark:text-review" aria-hidden="true" />,
          label: "BUDGET EXHAUSTED (PARTIAL)",
          styles: "bg-amber-100 dark:bg-review/20 text-amber-950 dark:text-review border-amber-300 dark:border-review/40",
        };
      case "TIMED_OUT":
        return {
          icon: <Clock className="w-4 h-4 text-amber-800 dark:text-review" aria-hidden="true" />,
          label: "SEARCH TIMED OUT (PARTIAL)",
          styles: "bg-amber-100 dark:bg-review/20 text-amber-950 dark:text-review border-amber-300 dark:border-review/40",
        };
      case "EMPTY_SEARCH_SPACE":
        return {
          icon: <Info className="w-4 h-4 text-muted" aria-hidden="true" />,
          label: "EMPTY SEARCH SPACE",
          styles: "bg-canvas text-muted border-border",
        };
      case "UNRESOLVED_CASES":
        return {
          icon: <HelpCircle className="w-4 h-4 text-amber-800 dark:text-review" aria-hidden="true" />,
          label: "UNRESOLVED CASES PRESENT",
          styles: "bg-amber-100 dark:bg-review/20 text-amber-950 dark:text-review border-amber-300 dark:border-review/40",
        };
      case "FAILED":
        return {
          icon: <AlertCircle className="w-4 h-4 text-red-800 dark:text-deny" aria-hidden="true" />,
          label: "RUN FAILED",
          styles: "bg-red-100 dark:bg-deny/20 text-red-950 dark:text-deny border-red-300 dark:border-deny/40",
        };
      case "IDLE":
      default:
        return {
          icon: <Clock className="w-4 h-4 text-muted" aria-hidden="true" />,
          label: "STANDBY (IDLE)",
          styles: "bg-canvas text-muted border-border",
        };
    }
  };

  const badge = getStatusBadge();

  if (status === "IDLE") {
    return (
      <div
        className="p-8 rounded-lg border border-dashed border-border bg-surface text-center space-y-3 shadow-2xs"
        role="region"
        aria-label="Verification Engine Standby"
      >
        <div className="w-10 h-10 rounded-full bg-canvas border border-border text-muted mx-auto flex items-center justify-center">
          <Layers className="w-5 h-5 text-accent" aria-hidden="true" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-ink font-sans">Verification Engine in Standby</h3>
          <p className="text-xs text-muted max-w-md mx-auto mt-1 leading-relaxed font-sans">
            Configure search dimensions and candidate exploration budget above, then start a verification run
            to identify counterexamples and verify policy boundaries.
          </p>
        </div>
      </div>
    );
  }

  const percentEvaluated = coverage
    ? Math.min(100, Math.round((coverage.totalCandidatesEvaluated / coverage.candidateBudget) * 100))
    : 0;

  return (
    <div
      className="rounded-lg border border-border bg-surface shadow-2xs overflow-hidden space-y-0 divide-y divide-border"
      role="region"
      aria-label="Verification Run Status and Coverage"
    >
      {/* Illustrative Demo Banner */}
      {isDemoFixture && (
        <div
          role="note"
          className="px-4 py-2 text-xs font-sans font-medium bg-amber-500/10 text-ink border-b border-amber-500/30 flex items-center space-x-2"
        >
          <Info className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden="true" />
          <span>Demo Fixture — Illustrative Verification Run (Backend Verification API Offline)</span>
        </div>
      )}

      {/* Authoritative Decision Focal Point Bar */}
      <div className="p-4 sm:p-5 bg-canvas/30 flex flex-col sm:flex-row sm:items-center justify-between gap-4 font-sans">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs font-medium text-muted">
              Verification Run Status
            </span>
            {isLiveApi && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-sans font-semibold bg-allow/10 text-allow border border-allow/30">
                <CheckCircle2 className="w-3 h-3 mr-1 text-allow" aria-hidden="true" />
                Live API Result
              </span>
            )}
            {isSavedRun && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-sans font-semibold bg-accent/10 text-accent border border-accent/30">
                <Layers className="w-3 h-3 mr-1 text-accent" aria-hidden="true" />
                Saved Database Run
              </span>
            )}
          </div>
          <div className="flex items-center space-x-3 mt-1.5">
            <span
              role="status"
              className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-md text-xs font-sans font-semibold border shadow-2xs ${badge.styles}`}
            >
              {badge.icon}
              <span>{badge.label}</span>
            </span>
            {stopReason && (
              <span className="text-xs font-sans px-2 py-0.5 rounded bg-surface border border-border text-muted">
                Stop: <strong className="text-ink font-mono">{stopReason}</strong>
              </span>
            )}
          </div>
        </div>

        {coverage && (
          <div className="text-xs text-muted font-sans bg-surface px-3 py-2 rounded-md border border-border space-y-0.5 sm:text-right shrink-0">
            <div>
              <span>Duration: </span>
              <span className="font-semibold text-ink font-mono">{coverage.durationMs}ms</span>
              <span className="mx-2 text-border">|</span>
              <span>Evaluated: </span>
              <span className="text-ink font-semibold">{new Date(coverage.evaluatedAt).toLocaleTimeString()}</span>
            </div>
            {runId && (
              <div className="pt-1">
                <HashBadge hash={runId} label="Run ID" prefixLength={8} suffixLength={6} />
              </div>
            )}
          </div>
        )}
      </div>

      {summary && (
        <div className="p-4 bg-surface text-xs text-ink space-y-1 font-sans">
          <div className="font-semibold text-xs text-muted">
            Report Summary
          </div>
          <p className="text-muted leading-relaxed text-xs">{summary}</p>
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 bg-deny/10 border-t border-border text-xs text-deny flex items-start space-x-2 font-sans">
          <AlertCircle className="w-4 h-4 text-deny shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <div className="font-bold">Run Error Encountered</div>
            <div className="font-mono text-[11px]">{errorMessage}</div>
          </div>
        </div>
      )}

      {/* Coverage & Candidate Metrics Grid - Engineered Precision Bar */}
      {coverage && (
        <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border bg-surface text-xs">
          <div className="p-3.5 space-y-1">
            <div className="text-muted text-[11px] font-medium font-sans">Candidates Evaluated</div>
            <div className="text-lg font-bold font-mono text-ink tabular-nums">
              {coverage.totalCandidatesEvaluated} / {coverage.candidateBudget}
            </div>
            <div className="text-[10px] text-muted font-sans">
              {coverage.isExhaustive ? "100% of candidate space" : `${percentEvaluated}% budget consumed`}
            </div>
          </div>

          <div className="p-3.5 space-y-1">
            <div className="text-muted text-[11px] font-medium font-sans">Search Completeness</div>
            <div className="text-sm font-semibold font-sans">
              {coverage.isExhaustive ? (
                <span className="text-allow font-semibold">Exhaustive</span>
              ) : (
                <span className="text-amber-700 dark:text-amber-400 font-semibold">Budget Bound</span>
              )}
            </div>
            <div className="text-[10px] text-muted font-sans">
              {coverage.isExhaustive
                ? "Space fully explored"
                : "Unsearched space remains"}
            </div>
          </div>

          <div className="p-3.5 space-y-1">
            <div className="text-muted text-[11px] font-medium font-sans">Counterexamples Found</div>
            <div className={`text-lg font-bold font-mono tabular-nums ${counterexampleCount > 0 ? "text-deny" : "text-allow"}`}>
              {counterexampleCount}
            </div>
            <div className="text-[10px] text-muted font-sans">
              {counterexampleCount === 0 ? "Zero violations detected" : "Reproducible loopholes"}
            </div>
          </div>

          <div className="p-3.5 space-y-1">
            <div className="text-muted text-[11px] font-medium font-sans">Unresolved Cases</div>
            <div className={`text-lg font-bold font-mono tabular-nums ${unresolvedCount > 0 ? "text-amber-700 dark:text-amber-400" : "text-muted"}`}>
              {unresolvedCount}
            </div>
            <div className="text-[10px] text-muted font-sans">
              {unresolvedCount > 0 ? "Ambiguous evidence (held)" : "No ambiguities"}
            </div>
          </div>
        </div>
      )}

      {/* Exhaustive vs Budget Bound vs Timed Out vs Empty Space Callouts */}
      {coverage && status === "TIMED_OUT" && (
        <div
          role="note"
          className="p-3 rounded-lg bg-review/10 border border-review/40 text-xs text-ink space-y-1"
        >
          <div className="font-semibold flex items-center space-x-1.5 text-review">
            <Clock className="w-3.5 h-3.5 text-review shrink-0" aria-hidden="true" />
            <span>Search Duration Limit Reached: Partial Exploration Disclaimer</span>
          </div>
          <p className="text-muted text-[11px] leading-relaxed">
            Exploration halted because the allocated timeout ({coverage.durationMs}ms) was reached before the declared search domain could be exhausted.
            Findings discovered before the timeout are valid counterexamples, but <strong>this run does not prove universal safety</strong>.
          </p>
        </div>
      )}

      {coverage && status === "EMPTY_SEARCH_SPACE" && (
        <div
          role="note"
          className="p-3 rounded-lg bg-surface border border-border text-xs text-ink space-y-1"
        >
          <div className="font-semibold flex items-center space-x-1.5 text-muted">
            <Info className="w-3.5 h-3.5 text-accent shrink-0" aria-hidden="true" />
            <span>Empty Search Domain</span>
          </div>
          <p className="text-muted text-[11px] leading-relaxed">
            Zero candidate permutations were generated. The declared search space definition contains no reachable cart combinations.
          </p>
        </div>
      )}

      {coverage && status === "BUDGET_EXHAUSTED" && (
        <div
          role="note"
          className="p-3.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs text-ink space-y-1.5"
        >
          <div className="font-semibold flex items-center space-x-1.5 text-review">
            <AlertTriangle className="w-3.5 h-3.5 text-review shrink-0" aria-hidden="true" />
            <span>Search Budget Exhausted: Partial Exploration Disclaimer</span>
          </div>
          <p className="text-ink-muted text-xs leading-relaxed">
            Exploration ceased when candidate budget limit ({coverage.candidateBudget} candidates) was reached.
            This result confirms findings discovered within this budget bound, but <strong className="text-ink">does not prove universal safety</strong>.
            Additional unexplored permutations remain in the input space.
          </p>
        </div>
      )}
    </div>
  );
}
