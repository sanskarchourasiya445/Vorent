import { useState, useEffect } from "react";
import type { VerificationFinding } from "../../types/verification";
import { DecisionResultCard } from "../features/DecisionResultCard";
import { adaptEvaluationResultToDecisionCardProps } from "../../utils/decisionAdapter";
import {
  X,
  AlertTriangle,
  XCircle,
  ShoppingCart,
  Copy,
  Check,
  FileText,
} from "lucide-react";

interface FindingDetailModalProps {
  finding: VerificationFinding | null;
  policyVersionId?: string;
  policyHash?: string;
  onClose: () => void;
}

export function FindingDetailModal({
  finding,
  policyVersionId,
  policyHash,
  onClose,
}: FindingDetailModalProps) {
  const [copiedJson, setCopiedJson] = useState(false);

  // Close on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  if (!finding) return null;

  const isCounterexample = finding.classification === "COUNTEREXAMPLE";

  // Adapt evaluation result directly using the Phase 1 pure adapter
  const cardProps = adaptEvaluationResultToDecisionCardProps(finding.actualResult, {
    policyVersionId,
    policyHash,
    evidence: finding.candidateEvidence,
    isDemoFixture: false,
  });

  const handleCopyJson = async () => {
    try {
      const payload = JSON.stringify(
        {
          findingId: finding.id,
          classification: finding.classification,
          expectedDecision: finding.expectedDecision,
          actualDecision: finding.actualResult.decision,
          primaryReasonCode: finding.actualResult.primaryReasonCode,
          reasonCodes: finding.actualResult.reasonCodes,
          cart: finding.candidateCart,
          evidence: finding.candidateEvidence,
          reproduction: finding.reproductionNotes,
        },
        null,
        2,
      );
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(payload);
        setCopiedJson(true);
        setTimeout(() => setCopiedJson(false), 2000);
      }
    } catch {
      // Clipboard fallback
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="finding-modal-title"
    >
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-panel border border-border bg-surface shadow-xl overflow-hidden my-auto">
        {/* Modal Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border bg-canvas/40">
          <div className="flex items-center space-x-2.5">
            {isCounterexample ? (
              <XCircle className="w-5 h-5 text-deny shrink-0" aria-hidden="true" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-800 shrink-0" aria-hidden="true" />
            )}
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted block">
                {isCounterexample
                  ? "Confirmed Counterexample (Policy Loophole)"
                  : "Unresolved Ambiguity (Fail-Closed Investigation)"}
              </span>
              <h3 id="finding-modal-title" className="text-base font-bold text-ink">
                {finding.title}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded text-muted hover:text-ink hover:bg-canvas transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            title="Close finding details (Esc)"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">
          {/* Summary Banner */}
          <div
            className={`p-3.5 rounded text-xs space-y-1 border ${
              isCounterexample
                ? "bg-red-50/50 border-red-200 text-red-950"
                : "bg-amber-50/50 border-amber-200 text-amber-950"
            }`}
          >
            <div className="font-semibold text-xs">Finding Analysis:</div>
            <p className="leading-relaxed">{finding.summary}</p>
          </div>

          {/* Embedded Phase 1 Authoritative DecisionResultCard */}
          <section aria-labelledby="decision-card-section" className="space-y-2">
            <h4 id="decision-card-section" className="text-xs font-bold uppercase tracking-wider text-muted">
              Authoritative Gate Outcome
            </h4>
            <DecisionResultCard {...cardProps} />
          </section>

          {/* Reproducible Candidate Cart */}
          <section aria-labelledby="candidate-cart-section" className="space-y-2">
            <h4
              id="candidate-cart-section"
              className="text-xs font-bold uppercase tracking-wider text-muted flex items-center space-x-1.5"
            >
              <ShoppingCart className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
              <span>Reproducible Candidate Cart ({finding.candidateCart.items.length} items)</span>
            </h4>
            <div className="rounded border border-border overflow-hidden text-xs">
              <table className="w-full text-left border-collapse">
                <thead className="bg-canvas border-b border-border text-[11px] text-muted uppercase tracking-wider">
                  <tr>
                    <th className="p-2.5">SKU / Title</th>
                    <th className="p-2.5">Category</th>
                    <th className="p-2.5 text-right">Qty</th>
                    <th className="p-2.5 text-right">Unit Price</th>
                    <th className="p-2.5 text-right">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {finding.candidateCart.items.map((item, idx) => {
                    const unitPrice = (item.unitPriceMinor / 100).toFixed(2);
                    const lineTotal = ((item.unitPriceMinor * item.quantity) / 100).toFixed(2);
                    return (
                      <tr key={idx} className="hover:bg-canvas/40">
                        <td className="p-2.5">
                          <div className="font-semibold text-ink">{item.title}</div>
                          <div className="font-mono text-[11px] text-muted">{item.sku}</div>
                        </td>
                        <td className="p-2.5 text-muted">{item.category}</td>
                        <td className="p-2.5 text-right font-mono">{item.quantity}</td>
                        <td className="p-2.5 text-right font-mono">${unitPrice}</td>
                        <td className="p-2.5 text-right font-mono font-semibold text-ink">
                          ${lineTotal} {finding.candidateCart.currency}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

          {/* Reproduction Guidance */}
          {finding.reproductionNotes.length > 0 && (
            <section aria-labelledby="reproduction-section" className="space-y-2">
              <h4
                id="reproduction-section"
                className="text-xs font-bold uppercase tracking-wider text-muted flex items-center space-x-1.5"
              >
                <FileText className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
                <span>Deterministic Reproduction Steps</span>
              </h4>
              <ol className="list-decimal list-inside space-y-1.5 text-xs text-ink p-3 rounded bg-canvas border border-border">
                {finding.reproductionNotes.map((step, idx) => (
                  <li key={idx} className="leading-relaxed">
                    {step}
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        {/* Modal Footer with Copy Payload Action */}
        <div className="flex items-center justify-between p-4 border-t border-border bg-canvas/30">
          <button
            type="button"
            onClick={handleCopyJson}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs font-semibold border border-border bg-surface text-ink hover:bg-canvas transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {copiedJson ? (
              <Check className="w-3.5 h-3.5 text-emerald-700" aria-hidden="true" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-muted" aria-hidden="true" />
            )}
            <span>{copiedJson ? "Payload Copied!" : "Copy Candidate Payload (JSON)"}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded text-xs font-semibold bg-accent text-white hover:bg-accent/90 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
