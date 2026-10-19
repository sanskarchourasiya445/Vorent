import type { VerificationCoverage, VerificationStatus } from "../../types/verification";
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
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-800" aria-hidden="true" />,
          label: "EXHAUSTIVE RUN COMPLETE",
          styles: "bg-emerald-100 text-emerald-950 border-emerald-300",
        };
      case "BUDGET_EXHAUSTED":
        return {
          icon: <AlertTriangle className="w-4 h-4 text-amber-800" aria-hidden="true" />,
          label: "BUDGET EXHAUSTED (PARTIAL)",
          styles: "bg-amber-100 text-amber-950 border-amber-300",
        };
      case "TIMED_OUT":
        return {
          icon: <Clock className="w-4 h-4 text-amber-800" aria-hidden="true" />,
          label: "SEARCH TIMED OUT (PARTIAL)",
          styles: "bg-amber-100 text-amber-950 border-amber-300",
        };
      case "EMPTY_SEARCH_SPACE":
        return {
          icon: <Info className="w-4 h-4 text-muted" aria-hidden="true" />,
          label: "EMPTY SEARCH SPACE",
          styles: "bg-canvas text-muted border-border",
        };
      case "UNRESOLVED_CASES":
        return {
          icon: <HelpCircle className="w-4 h-4 text-amber-800" aria-hidden="true" />,
          label: "UNRESOLVED CASES PRESENT",
          styles: "bg-amber-100 text-amber-950 border-amber-300",
        };
      case "FAILED":
        return {
          icon: <AlertCircle className="w-4 h-4 text-red-800" aria-hidden="true" />,
          label: "RUN FAILED",
          styles: "bg-red-100 text-red-950 border-red-300",
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
        className="p-6 rounded-panel border border-border bg-surface text-center space-y-2 shadow-sm"
        role="region"
        aria-label="Verification Engine Standby"
      >
        <div className="inline-flex p-3 rounded-full bg-canvas text-muted mb-1">
          <Layers className="w-6 h-6" aria-hidden="true" />
        </div>
        <h3 className="text-sm font-semibold text-ink">Verification Engine in Standby</h3>
        <p className="text-xs text-muted max-w-md mx-auto">
          Configure search dimensions and candidate exploration budget above, then start a verification run
          to identify counterexamples and verify policy boundaries.
        </p>
      </div>
    );
  }

  const percentEvaluated = coverage
    ? Math.min(100, Math.round((coverage.totalCandidatesEvaluated / coverage.candidateBudget) * 100))
    : 0;

  return (
    <div
      className="p-5 md:p-6 rounded-panel border border-border bg-surface space-y-5 shadow-sm"
      role="region"
      aria-label="Verification Run Status and Coverage"
    >
      {/* Illustrative Demo Banner */}
      {isDemoFixture && (
        <div
          role="note"
          className="px-3 py-1.5 rounded text-xs font-semibold tracking-wide uppercase bg-amber-100 text-amber-950 border border-amber-300 flex items-center space-x-1.5"
        >
          <Info className="w-3.5 h-3.5 text-amber-800 shrink-0" aria-hidden="true" />
          <span>Demo Fixture — Illustrative Verification Run (Backend Verification API Offline)</span>
        </div>
      )}

      {/* Header with status badge */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <span className="text-xs uppercase font-bold tracking-wider text-muted">
              Verification Run Status
            </span>
            {isLiveApi && (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-950 border border-emerald-300">
                <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-700" aria-hidden="true" />
                Live API Result
              </span>
            )}
          </div>
          <div className="flex items-center space-x-2.5 mt-1">
            <span
              role="status"
              className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold border tracking-wide shadow-xs ${badge.styles}`}
            >
              {badge.icon}
              <span>{badge.label}</span>
            </span>
            {stopReason && (
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-canvas border border-border text-muted">
                Stop: <strong className="text-ink">{stopReason}</strong>
              </span>
            )}
          </div>
        </div>

        {coverage && (
          <div className="text-xs text-muted font-mono bg-canvas px-3 py-1.5 rounded border border-border space-y-0.5 text-right">
            <div>
              <span>Duration: </span>
              <span className="font-semibold text-ink">{coverage.durationMs}ms</span>
              <span className="mx-2 text-border">|</span>
              <span>Evaluated: </span>
              <span className="text-ink font-semibold">{new Date(coverage.evaluatedAt).toLocaleTimeString()}</span>
            </div>
            {runId && (
              <div className="text-[11px] text-muted">
                Run ID: <span className="font-semibold text-ink">{runId}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {summary && (
        <div className="p-3 rounded bg-canvas border border-border text-xs text-ink space-y-0.5">
          <div className="font-semibold text-[11px] uppercase tracking-wider text-muted">
            Report Summary
          </div>
          <p className="text-muted leading-relaxed">{summary}</p>
        </div>
      )}

      {errorMessage && (
        <div className="p-3.5 rounded bg-red-50 border border-red-200 text-xs text-red-900 flex items-start space-x-2">
          <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" aria-hidden="true" />
          <div>
            <div className="font-semibold">Run Error Encountered</div>
            <div>{errorMessage}</div>
          </div>
        </div>
      )}

      {/* Coverage & Candidate Metrics Grid */}
      {coverage && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div className="p-3 rounded border border-border bg-canvas/40 space-y-1">
            <div className="text-muted text-[11px] font-medium uppercase tracking-wider">Candidates Evaluated</div>
            <div className="text-lg font-bold font-mono text-ink">
              {coverage.totalCandidatesEvaluated} / {coverage.candidateBudget}
            </div>
            <div className="text-[10px] text-muted">
              {coverage.isExhaustive ? "100% of candidate space" : `${percentEvaluated}% budget consumed`}
            </div>
          </div>

          <div className="p-3 rounded border border-border bg-canvas/40 space-y-1">
            <div className="text-muted text-[11px] font-medium uppercase tracking-wider">Search Completeness</div>
            <div className="text-sm font-bold text-ink">
              {coverage.isExhaustive ? (
                <span className="text-emerald-700">Exhaustive</span>
              ) : (
                <span className="text-amber-800">Budget Bound</span>
              )}
            </div>
            <div className="text-[10px] text-muted">
              {coverage.isExhaustive
                ? "Space fully explored"
                : "Unsearched space remains"}
            </div>
          </div>

          <div className="p-3 rounded border border-border bg-canvas/40 space-y-1">
            <div className="text-muted text-[11px] font-medium uppercase tracking-wider">Counterexamples Found</div>
            <div className={`text-lg font-bold font-mono ${counterexampleCount > 0 ? "text-deny" : "text-emerald-700"}`}>
              {counterexampleCount}
            </div>
            <div className="text-[10px] text-muted">
              {counterexampleCount === 0 ? "Zero violations detected" : "Reproducible loopholes"}
            </div>
          </div>

          <div className="p-3 rounded border border-border bg-canvas/40 space-y-1">
            <div className="text-muted text-[11px] font-medium uppercase tracking-wider">Unresolved Cases</div>
            <div className={`text-lg font-bold font-mono ${unresolvedCount > 0 ? "text-amber-800" : "text-muted"}`}>
              {unresolvedCount}
            </div>
            <div className="text-[10px] text-muted">
              {unresolvedCount > 0 ? "Ambiguous evidence (held)" : "No ambiguities"}
            </div>
          </div>
        </div>
      )}

      {/* Exhaustive vs Budget Bound vs Timed Out vs Empty Space Callouts */}
      {coverage && status === "TIMED_OUT" && (
        <div
          role="note"
          className="p-3 rounded bg-amber-50 border border-amber-300 text-xs text-amber-950 space-y-1"
        >
          <div className="font-semibold flex items-center space-x-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-800 shrink-0" aria-hidden="true" />
            <span>Search Duration Limit Reached: Partial Exploration Disclaimer</span>
          </div>
          <p className="text-amber-900 text-[11px] leading-relaxed">
            Exploration halted because the allocated timeout ({coverage.durationMs}ms) was reached before the declared search domain could be exhausted.
            Findings discovered before the timeout are valid counterexamples, but <strong>this run does not prove universal safety</strong>.
          </p>
        </div>
      )}

      {coverage && status === "EMPTY_SEARCH_SPACE" && (
        <div
          role="note"
          className="p-3 rounded bg-blue-50 border border-blue-200 text-xs text-blue-950 space-y-1"
        >
          <div className="font-semibold flex items-center space-x-1.5">
            <Info className="w-3.5 h-3.5 text-blue-700 shrink-0" aria-hidden="true" />
            <span>Empty Search Domain</span>
          </div>
          <p className="text-blue-900 text-[11px] leading-relaxed">
            Zero candidate permutations were generated. The declared search space definition contains no reachable cart combinations.
          </p>
        </div>
      )}

      {coverage && status === "BUDGET_EXHAUSTED" && (
        <div
          role="note"
          className="p-3 rounded bg-amber-50 border border-amber-300 text-xs text-amber-950 space-y-1"
        >
          <div className="font-semibold flex items-center space-x-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-amber-800 shrink-0" aria-hidden="true" />
            <span>Search Budget Exhausted: Partial Exploration Disclaimer</span>
          </div>
          <p className="text-amber-900 text-[11px] leading-relaxed">
            Exploration ceased when candidate budget limit ({coverage.candidateBudget} candidates) was reached.
            This result confirms findings discovered within this budget bound, but <strong>does not prove universal safety</strong>.
            Additional unexplored permutations remain in the input space.
          </p>
        </div>
      )}
    </div>
  );
}
