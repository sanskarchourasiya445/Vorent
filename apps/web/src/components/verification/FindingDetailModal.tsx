import { useState, useEffect } from "react";
import type { VerificationFinding } from "../../types/verification";
import { DecisionResultCard } from "../features/DecisionResultCard";
import { adaptEvaluationResultToDecisionCardProps } from "../../utils/decisionAdapter";
import { resolveFinding, acceptFindingRisk } from "../../api/findingsService";
import {
  X,
  AlertTriangle,
  XCircle,
  ShoppingCart,
  Copy,
  Check,
  FileText,
  Wrench,
  ShieldCheck,
  RefreshCw,
  AlertCircle,
} from "lucide-react";

interface FindingDetailModalProps {
  finding: VerificationFinding | null;
  policyVersionId?: string;
  policyHash?: string;
  testRunId?: string;
  onClose: () => void;
  onOpenRepair?: (finding: VerificationFinding) => void;
  onFindingResolved?: () => void;
}

export function FindingDetailModal({
  finding,
  policyVersionId,
  policyHash,
  testRunId,
  onClose,
  onOpenRepair,
  onFindingResolved,
}: FindingDetailModalProps) {
  const [copiedJson, setCopiedJson] = useState(false);

  // Triage state
  const [triageAction, setTriageAction] = useState<"NONE" | "RESOLVE" | "ACCEPT_RISK">("NONE");
  const [resolvedByVersionId, setResolvedByVersionId] = useState("");
  const [resolutionNote, setResolutionNote] = useState("");
  const [riskRationale, setRiskRationale] = useState("");
  const [isSubmittingTriage, setIsSubmittingTriage] = useState(false);
  const [triageError, setTriageError] = useState<string | null>(null);
  const [triageSuccess, setTriageSuccess] = useState<string | null>(null);

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
  const severity = finding.severity || "HIGH";
  const isHighOrCritical = severity === "CRITICAL" || severity === "HIGH";

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
          testRunId,
          classification: finding.classification,
          severity,
          violationType: finding.violationType,
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

  const handleResolve = async () => {
    if (!resolvedByVersionId.trim() || !resolutionNote.trim() || isSubmittingTriage) return;

    setIsSubmittingTriage(true);
    setTriageError(null);
    setTriageSuccess(null);

    try {
      await resolveFinding(finding.id, {
        resolvedByVersionId: resolvedByVersionId.trim(),
        resolutionNote: resolutionNote.trim(),
      });
      setTriageSuccess("Finding resolved successfully with verified repairing policy version.");
      finding.resolutionStatus = "RESOLVED";
      finding.resolvedByVersionId = resolvedByVersionId.trim();
      finding.resolutionNote = resolutionNote.trim();
      if (onFindingResolved) onFindingResolved();
    } catch (err: unknown) {
      setTriageError(err instanceof Error ? err.message : "Failed to resolve finding.");
    } finally {
      setIsSubmittingTriage(false);
    }
  };

  const handleAcceptRisk = async () => {
    if (!riskRationale.trim() || isSubmittingTriage) return;

    // Frontend validation matching Decision D-014 (server will also strictly reject)
    if (isHighOrCritical) {
      setTriageError(
        "Decision D-014 Violation: Risk acceptance is strictly prohibited for CRITICAL and HIGH severity findings. A verified repairing policy version is required.",
      );
      return;
    }

    setIsSubmittingTriage(true);
    setTriageError(null);
    setTriageSuccess(null);

    try {
      await acceptFindingRisk(finding.id, {
        rationale: riskRationale.trim(),
      });
      setTriageSuccess("Risk accepted with required operator rationale.");
      finding.resolutionStatus = "ACCEPTED_RISK";
      if (onFindingResolved) onFindingResolved();
    } catch (err: unknown) {
      setTriageError(err instanceof Error ? err.message : "Failed to accept risk.");
    } finally {
      setIsSubmittingTriage(false);
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
              <div className="flex items-center space-x-2">
                <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
                  {isCounterexample
                    ? "Confirmed Counterexample (Policy Loophole)"
                    : "Unresolved Ambiguity (Fail-Closed Investigation)"}
                </span>
                <span
                  className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-bold uppercase border ${
                    severity === "CRITICAL"
                      ? "bg-red-200 text-red-950 border-red-400"
                      : severity === "HIGH"
                        ? "bg-red-100 text-red-900 border-red-300"
                        : severity === "MEDIUM"
                          ? "bg-amber-100 text-amber-900 border-amber-300"
                          : "bg-slate-100 text-slate-800 border-slate-300"
                  }`}
                >
                  {severity} SEVERITY
                </span>
                {finding.violationType && (
                  <span className="font-mono text-[10px] px-1.5 py-0.2 rounded bg-canvas border border-border text-muted">
                    {finding.violationType}
                  </span>
                )}
                {finding.resolutionStatus && (
                  <span
                    className={`font-mono text-[10px] px-1.5 py-0.2 rounded font-semibold border ${
                      finding.resolutionStatus === "RESOLVED"
                        ? "bg-emerald-100 text-emerald-950 border-emerald-300"
                        : finding.resolutionStatus === "ACCEPTED_RISK"
                          ? "bg-amber-100 text-amber-950 border-amber-300"
                          : "bg-canvas text-muted border-border"
                    }`}
                  >
                    {finding.resolutionStatus}
                  </span>
                )}
              </div>
              <h3 id="finding-modal-title" className="text-base font-bold text-ink mt-0.5">
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
          {/* Summary Banner with Quick Repair Action */}
          <div
            className={`p-3.5 rounded text-xs space-y-2 border ${
              isCounterexample
                ? "bg-red-50/50 border-red-200 text-red-950"
                : "bg-amber-50/50 border-amber-200 text-amber-950"
            }`}
          >
            <div className="flex items-center justify-between">
              <span className="font-semibold text-xs">Finding Analysis:</span>
              {onOpenRepair && (
                <button
                  type="button"
                  onClick={() => onOpenRepair(finding)}
                  className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded text-xs font-semibold bg-accent text-white hover:bg-accent/90 transition-colors shadow-xs"
                >
                  <Wrench className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Propose Policy Repair</span>
                </button>
              )}
            </div>
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
              <span>Reproducible Witness Cart ({finding.candidateCart.items.length} items)</span>
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

          {/* Finding Resolution & Triage Controls */}
          <section aria-labelledby="triage-section" className="space-y-3 pt-2 border-t border-border">
            <div className="flex items-center justify-between">
              <h4 id="triage-section" className="text-xs font-bold uppercase tracking-wider text-ink flex items-center space-x-1.5">
                <ShieldCheck className="w-4 h-4 text-accent" aria-hidden="true" />
                <span>Finding Triage & Governance Resolution</span>
              </h4>
              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => setTriageAction(triageAction === "RESOLVE" ? "NONE" : "RESOLVE")}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors border ${
                    triageAction === "RESOLVE"
                      ? "bg-accent text-white border-accent"
                      : "bg-canvas text-ink border-border hover:bg-canvas/80"
                  }`}
                >
                  Resolve with Version
                </button>
                <button
                  type="button"
                  onClick={() => setTriageAction(triageAction === "ACCEPT_RISK" ? "NONE" : "ACCEPT_RISK")}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors border ${
                    triageAction === "ACCEPT_RISK"
                      ? "bg-accent text-white border-accent"
                      : "bg-canvas text-ink border-border hover:bg-canvas/80"
                  }`}
                >
                  Accept Risk
                </button>
              </div>
            </div>

            {/* Resolve Form */}
            {triageAction === "RESOLVE" && (
              <div className="p-4 rounded border border-border bg-canvas/30 space-y-3 text-xs">
                <div className="font-semibold text-ink">
                  Resolve Finding with Verified Policy Version
                </div>
                <div>
                  <label htmlFor="resolved-by-vid" className="block text-muted text-[11px] mb-1 font-medium">
                    Repairing Policy Version UUID *
                  </label>
                  <input
                    id="resolved-by-vid"
                    type="text"
                    value={resolvedByVersionId}
                    onChange={(e) => setResolvedByVersionId(e.target.value)}
                    placeholder="e.g. 18674b70-b535-465d-a99f-fee8d9de5bf0"
                    className="w-full px-3 py-1.5 rounded border border-border bg-surface text-ink font-mono text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
                <div>
                  <label htmlFor="resolution-note" className="block text-muted text-[11px] mb-1 font-medium">
                    Resolution Note / Audit Explanation *
                  </label>
                  <textarea
                    id="resolution-note"
                    rows={2}
                    value={resolutionNote}
                    onChange={(e) => setResolutionNote(e.target.value)}
                    placeholder="Document how the new policy version eliminates this vulnerability..."
                    className="w-full p-2.5 rounded border border-border bg-surface text-ink text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void handleResolve()}
                  disabled={!resolvedByVersionId.trim() || !resolutionNote.trim() || isSubmittingTriage}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-accent text-white hover:bg-accent/90 disabled:opacity-50 transition-colors"
                >
                  {isSubmittingTriage ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                  <span>Submit Verified Resolution</span>
                </button>
              </div>
            )}

            {/* Accept Risk Form */}
            {triageAction === "ACCEPT_RISK" && (
              <div className="p-4 rounded border border-border bg-canvas/30 space-y-3 text-xs">
                <div className="font-semibold text-ink">
                  Accept Operational Risk (Medium & Low Severity Only)
                </div>

                {isHighOrCritical ? (
                  <div className="p-3 rounded border border-red-300 bg-red-50 text-red-950 space-y-1">
                    <div className="font-bold flex items-center space-x-1.5 text-red-900">
                      <AlertCircle className="w-4 h-4 text-deny" aria-hidden="true" />
                      <span>Decision D-014 Strict Guardrail</span>
                    </div>
                    <p className="text-[11px] leading-relaxed">
                      This finding is classified as <strong>{severity}</strong> severity. Under Decision D-014, Critical and High findings cannot be accepted as risk. A verified repairing policy version is strictly required.
                    </p>
                  </div>
                ) : (
                  <>
                    <div>
                      <label htmlFor="risk-rationale" className="block text-muted text-[11px] mb-1 font-medium">
                        Owner Risk Acceptance Rationale *
                      </label>
                      <textarea
                        id="risk-rationale"
                        rows={2}
                        value={riskRationale}
                        onChange={(e) => setRiskRationale(e.target.value)}
                        placeholder="Explain why this finding is an acceptable business risk..."
                        className="w-full p-2.5 rounded border border-border bg-surface text-ink text-xs focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => void handleAcceptRisk()}
                      disabled={!riskRationale.trim() || isSubmittingTriage}
                      className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-accent text-white hover:bg-accent/90 disabled:opacity-50 transition-colors"
                    >
                      {isSubmittingTriage ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <Check className="w-3.5 h-3.5" aria-hidden="true" />
                      )}
                      <span>Accept Risk</span>
                    </button>
                  </>
                )}
              </div>
            )}

            {/* Triage feedback alerts */}
            {triageError && (
              <div className="p-3 rounded border border-red-300 bg-red-50 text-red-950 text-xs">
                {triageError}
              </div>
            )}
            {triageSuccess && (
              <div className="p-3 rounded border border-emerald-300 bg-emerald-50 text-emerald-950 text-xs flex items-center space-x-2">
                <Check className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
                <span>{triageSuccess}</span>
              </div>
            )}
          </section>
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
