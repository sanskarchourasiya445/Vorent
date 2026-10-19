import { useState } from "react";
import type { FindingClassification, VerificationFinding } from "../../types/verification";
import { formatReasonCode } from "../../utils/reasonCodeFormatter";
import {
  XCircle,
  AlertTriangle,
  ChevronRight,
  Filter,
  CheckCircle2,
  ShoppingCart,
} from "lucide-react";

interface FindingsListProps {
  findings: VerificationFinding[];
  onSelectFinding: (finding: VerificationFinding) => void;
  selectedFindingId?: string;
  totalEvaluated: number;
}

export function FindingsList({
  findings,
  onSelectFinding,
  selectedFindingId,
  totalEvaluated,
}: FindingsListProps) {
  const [filter, setFilter] = useState<"ALL" | FindingClassification>("ALL");

  const filteredFindings = findings.filter((f) => {
    if (filter === "ALL") return true;
    return f.classification === filter;
  });

  const counterexampleCount = findings.filter((f) => f.classification === "COUNTEREXAMPLE").length;
  const unresolvedCount = findings.filter((f) => f.classification === "UNRESOLVED_AMBIGUITY").length;

  return (
    <div
      className="p-5 md:p-6 rounded-panel border border-border bg-surface space-y-5 shadow-sm"
      role="region"
      aria-label="Verification Findings and Witnesses"
    >
      {/* Header and Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex items-center space-x-2">
          <Filter className="w-4 h-4 text-accent" aria-hidden="true" />
          <h3 className="font-semibold text-sm text-ink">
            Verification Findings ({findings.length})
          </h3>
        </div>

        {findings.length > 0 && (
          <div className="flex items-center space-x-1 bg-canvas p-1 rounded border border-border text-xs">
            <button
              type="button"
              onClick={() => setFilter("ALL")}
              className={`px-2.5 py-1 rounded transition-colors font-medium ${
                filter === "ALL"
                  ? "bg-surface text-ink shadow-xs font-semibold"
                  : "text-muted hover:text-ink"
              }`}
            >
              All ({findings.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("COUNTEREXAMPLE")}
              className={`px-2.5 py-1 rounded transition-colors font-medium flex items-center space-x-1 ${
                filter === "COUNTEREXAMPLE"
                  ? "bg-surface text-deny shadow-xs font-semibold"
                  : "text-muted hover:text-deny"
              }`}
            >
              <span>Counterexamples ({counterexampleCount})</span>
            </button>
            <button
              type="button"
              onClick={() => setFilter("UNRESOLVED_AMBIGUITY")}
              className={`px-2.5 py-1 rounded transition-colors font-medium flex items-center space-x-1 ${
                filter === "UNRESOLVED_AMBIGUITY"
                  ? "bg-surface text-amber-900 shadow-xs font-semibold"
                  : "text-muted hover:text-amber-900"
              }`}
            >
              <span>Unresolved ({unresolvedCount})</span>
            </button>
          </div>
        )}
      </div>

      {/* Empty State: Zero Findings in Run */}
      {findings.length === 0 ? (
        <div className="py-8 text-center space-y-2">
          <div className="inline-flex p-3 rounded-full bg-emerald-50 text-emerald-700 mb-1">
            <CheckCircle2 className="w-6 h-6" aria-hidden="true" />
          </div>
          <h4 className="text-sm font-semibold text-ink">
            No Counterexamples Detected in Explored Bounds
          </h4>
          <p className="text-xs text-muted max-w-md mx-auto">
            Zero policy violations or unresolvable ambiguities were discovered across all {totalEvaluated}{" "}
            evaluated candidate permutations within the configured search dimensions.
          </p>
        </div>
      ) : filteredFindings.length === 0 ? (
        <div className="py-6 text-center text-xs text-muted">
          No findings match the selected classification filter.
        </div>
      ) : (
        <div className="space-y-3">
          {filteredFindings.map((finding) => {
            const isCounterexample = finding.classification === "COUNTEREXAMPLE";
            const isSelected = selectedFindingId === finding.id;
            const primaryFormatted = formatReasonCode(finding.actualResult.primaryReasonCode);

            // Compute total price of cart items
            const totalCents = finding.candidateCart.items.reduce(
              (acc, it) => acc + it.unitPriceMinor * it.quantity,
              0,
            );
            const totalFormatted = (totalCents / 100).toFixed(2);

            return (
              <div
                key={finding.id}
                onClick={() => onSelectFinding(finding)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectFinding(finding);
                  }
                }}
                tabIndex={0}
                role="button"
                aria-pressed={isSelected}
                aria-label={`Inspect finding: ${finding.title}`}
                className={`p-4 rounded border text-left cursor-pointer transition-all space-y-3 ${
                  isSelected
                    ? "border-accent ring-2 ring-accent/30 bg-accent/5"
                    : isCounterexample
                      ? "border-red-200 bg-surface hover:border-red-300 hover:shadow-xs"
                      : "border-amber-200 bg-surface hover:border-amber-300 hover:shadow-xs"
                } focus:outline-none focus-visible:ring-2 focus-visible:ring-accent`}
              >
                {/* Header row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    {isCounterexample ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-red-100 text-red-950 border border-red-300">
                        <XCircle className="w-3 h-3 mr-1 text-red-700" aria-hidden="true" />
                        Counterexample
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-950 border border-amber-300">
                        <AlertTriangle className="w-3 h-3 mr-1 text-amber-800" aria-hidden="true" />
                        Unresolved Ambiguity
                      </span>
                    )}

                    <h4 className="text-xs font-bold text-ink hover:text-accent transition-colors">
                      {finding.title}
                    </h4>
                  </div>

                  <div className="flex items-center space-x-2 text-[11px] shrink-0">
                    <span className="text-muted">
                      Expected: <code className="font-mono text-ink font-semibold">{finding.expectedDecision}</code>
                    </span>
                    <span className="text-muted">→</span>
                    <span>
                      Gate:{" "}
                      <code
                        className={`font-mono font-bold ${
                          finding.actualResult.decision === "DENY"
                            ? "text-deny"
                            : finding.actualResult.decision === "REVIEW"
                              ? "text-amber-800"
                              : "text-allow"
                        }`}
                      >
                        {finding.actualResult.decision}
                      </code>
                    </span>
                    <ChevronRight className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />
                  </div>
                </div>

                {/* Summary */}
                <p className="text-xs text-muted leading-relaxed line-clamp-2">
                  {finding.summary}
                </p>

                {/* Footer metadata: Reason code & cart preview */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-border/60 text-[11px]">
                  <div className="flex items-center space-x-2">
                    <span className="text-muted font-medium">Triggered:</span>
                    <code className="font-mono font-semibold px-1.5 py-0.5 rounded bg-canvas border border-border text-ink text-[10px]">
                      {finding.actualResult.primaryReasonCode}
                    </code>
                    <span className="text-muted hidden sm:inline">({primaryFormatted.headline})</span>
                  </div>

                  <div className="flex items-center space-x-1.5 text-muted font-mono">
                    <ShoppingCart className="w-3 h-3 text-accent" aria-hidden="true" />
                    <span>
                      {finding.candidateCart.items.length} item(s) • ${totalFormatted}{" "}
                      {finding.candidateCart.currency}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
