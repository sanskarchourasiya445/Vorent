import { useState } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Copy,
  Check,
  Shield,
  Clock,
  Layers,
  Info,
} from "lucide-react";
import type { DecisionResultCardProps } from "../../types/decision";
import { formatReasonCode } from "../../utils/reasonCodeFormatter";

export function DecisionResultCard({
  decision,
  primaryReasonCode,
  reasonCodes = [],
  policyVersionId,
  policyHash,
  evidenceItems = [],
  uncertaintyNotes = [],
  evaluatorVersion,
  timestamp,
  isDemoFixture = false,
  className = "",
}: DecisionResultCardProps) {
  const [copiedHash, setCopiedHash] = useState(false);

  // Fallback to first reasonCode if primaryReasonCode is not explicitly provided
  const effectivePrimaryCode = primaryReasonCode || (reasonCodes.length > 0 ? reasonCodes[0] : "");
  const primaryFormatted = formatReasonCode(effectivePrimaryCode);

  // Secondary codes: all codes in reasonCodes excluding the primary one, preserving backend order
  const secondaryCodes = reasonCodes.filter((code) => code !== effectivePrimaryCode);

  // Visual decision state styling tokens (grounded in docs/DESIGN.md)
  const isAllow = decision === "ALLOW";
  const isDeny = decision === "DENY";
  const isReview = decision === "REVIEW";

  const containerStyles = isAllow
    ? "border-emerald-300 bg-emerald-50/40 text-ink"
    : isDeny
      ? "border-red-300 bg-red-50/40 text-ink"
      : "border-amber-300 bg-amber-50/50 text-ink";

  const badgeStyles = isAllow
    ? "bg-emerald-700 text-white border-emerald-800"
    : isDeny
      ? "bg-red-700 text-white border-red-800"
      : "bg-amber-800 text-white border-amber-900";

  const handleCopyHash = async () => {
    if (!policyHash) return;
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(policyHash);
        setCopiedHash(true);
        setTimeout(() => setCopiedHash(false), 2000);
      }
    } catch {
      // Clipboard failure fallback
    }
  };

  const truncatedHash =
    policyHash && policyHash.length > 16
      ? `${policyHash.slice(0, 8)}...${policyHash.slice(-8)}`
      : policyHash;

  return (
    <article
      className={`rounded-panel border ${containerStyles} p-5 md:p-6 shadow-sm transition-all space-y-5 ${className}`}
      aria-labelledby="decision-card-title"
    >
      {/* Demo Fixture Alert Banner */}
      {isDemoFixture && (
        <div
          role="note"
          className="px-3 py-1.5 rounded text-xs font-semibold tracking-wide uppercase bg-amber-100 text-amber-950 border border-amber-300 flex items-center space-x-1.5"
        >
          <Info className="w-3.5 h-3.5 text-amber-800 flex-shrink-0" />
          <span>Demo Fixture — Illustrative Data Only (Not an Authorized Decision)</span>
        </div>
      )}

      {/* Header Bar: Status Badge + Decision Title + Policy Context */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-4">
        <div className="flex items-center space-x-3">
          {/* Triple-Signaled State: Icon + Color + Explicit Text */}
          <span
            role="status"
            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold tracking-wider border shadow-xs ${badgeStyles}`}
          >
            {isAllow && <CheckCircle2 className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" aria-hidden="true" />}
            {isDeny && <XCircle className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" aria-hidden="true" />}
            {isReview && <AlertTriangle className="w-3.5 h-3.5 mr-1.5 flex-shrink-0" aria-hidden="true" />}
            <span>{decision}</span>
          </span>

          <h3 id="decision-card-title" className="text-base font-semibold tracking-tight text-ink">
            {isAllow && "Transaction Authorized"}
            {isDeny && "Transaction Refused by Gate"}
            {isReview && "Verification Hold — Manual Review Required"}
          </h3>
        </div>

        {/* Policy Version & Cryptographic Hash */}
        {(policyVersionId || policyHash) && (
          <div className="flex items-center space-x-2 text-xs text-muted font-mono bg-surface px-2.5 py-1 rounded border border-border">
            <Shield className="w-3.5 h-3.5 text-accent flex-shrink-0" aria-hidden="true" />
            {policyVersionId && <span className="font-semibold text-ink">{policyVersionId}</span>}
            {policyHash && (
              <span className="flex items-center space-x-1">
                <span className="text-muted/60">#</span>
                <span title={`Full Hash: ${policyHash}`}>{truncatedHash}</span>
                <button
                  type="button"
                  onClick={handleCopyHash}
                  className="ml-1 p-0.5 text-muted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 rounded transition-colors"
                  title="Copy full cryptographic SHA-256 hash"
                  aria-label={copiedHash ? "Policy hash copied to clipboard" : "Copy full policy hash"}
                >
                  {copiedHash ? (
                    <Check className="w-3 h-3 text-emerald-700" aria-hidden="true" />
                  ) : (
                    <Copy className="w-3 h-3" aria-hidden="true" />
                  )}
                  <span className="sr-only" role="status">
                    {copiedHash ? "Policy hash copied to clipboard" : ""}
                  </span>
                </button>
              </span>
            )}
          </div>
        )}
      </header>

      {/* Primary Reason Section */}
      <section aria-labelledby="primary-reason-heading" className="space-y-1.5">
        <div className="flex items-center space-x-2">
          <span className="text-xs uppercase font-bold tracking-wider text-muted">
            Primary Deterministic Rule Outcome
          </span>
          {effectivePrimaryCode && (
            <code className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-surface border border-border text-ink">
              {effectivePrimaryCode}
            </code>
          )}
        </div>
        <h4 id="primary-reason-heading" className="text-sm font-semibold text-ink">
          {primaryFormatted.headline}
        </h4>
        <p className="text-xs text-muted leading-relaxed max-w-3xl">
          {primaryFormatted.description}
        </p>
      </section>

      {/* Additional / Secondary Reason Codes */}
      {secondaryCodes.length > 0 && (
        <section aria-labelledby="secondary-reasons-heading" className="space-y-2 pt-2 border-t border-border/40">
          <h4 id="secondary-reasons-heading" className="text-xs font-semibold uppercase tracking-wider text-muted">
            Additional Evaluated Constraints ({secondaryCodes.length})
          </h4>
          <ul className="space-y-1.5 text-xs">
            {secondaryCodes.map((code) => {
              const formatted = formatReasonCode(code);
              return (
                <li
                  key={code}
                  className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-2 p-2 rounded bg-surface/70 border border-border/60"
                >
                  <code className="font-mono font-semibold text-ink shrink-0">{code}</code>
                  <span className="text-muted font-medium">— {formatted.headline}:</span>
                  <span className="text-muted">{formatted.description}</span>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Uncertainty & Review Conditions (Rendered on REVIEW or when notes supplied) */}
      {(uncertaintyNotes.length > 0 || isReview) && (
        <section
          aria-labelledby="uncertainty-heading"
          className="p-3.5 rounded bg-amber-50 border border-amber-300 text-xs text-amber-950 space-y-1.5"
        >
          <div className="flex items-center space-x-1.5 font-bold tracking-tight">
            <AlertTriangle className="w-4 h-4 text-amber-800 flex-shrink-0" aria-hidden="true" />
            <h4 id="uncertainty-heading" className="text-amber-950 font-semibold">
              Conditions Requiring Resolution (Fail-Closed Gate)
            </h4>
          </div>
          {uncertaintyNotes.length > 0 ? (
            <ul className="list-disc list-inside space-y-1 text-amber-900 pl-1">
              {uncertaintyNotes.map((note, idx) => (
                <li key={idx}>{note}</li>
              ))}
            </ul>
          ) : (
            <p className="text-amber-900">
              Deterministic rule evaluation identified missing evidence or unresolvable rule ambiguity.
              This transaction is held in a fail-closed state and cannot proceed to order creation without
              an authoritative policy repair or verified evidence.
            </p>
          )}
        </section>
      )}

      {/* Inspectable Evidence Attributes (Rendered only when supplied) */}
      {evidenceItems.length > 0 && (
        <section aria-labelledby="evidence-heading" className="space-y-2 pt-2 border-t border-border/40">
          <h4 id="evidence-heading" className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center space-x-1.5">
            <Layers className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
            <span>Associated Evidence Snapshot</span>
          </h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 text-xs">
            {evidenceItems.map((item, idx) => (
              <div key={idx} className="p-2.5 rounded bg-surface border border-border space-y-1">
                <div className="text-muted text-[11px] font-medium">{item.label}</div>
                <div className="font-semibold text-ink font-mono break-all">{item.value}</div>
                {item.observedAt && (
                  <div className="text-[10px] text-muted flex items-center space-x-1 pt-0.5">
                    <Clock className="w-3 h-3 text-muted/60" aria-hidden="true" />
                    <span>Observed: {item.observedAt}</span>
                  </div>
                )}
                <div className="flex flex-wrap gap-1 pt-1">
                  {item.verified !== undefined && (
                    <span
                      className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold border ${
                        item.verified
                          ? "bg-emerald-100 text-emerald-950 border-emerald-300"
                          : "bg-amber-100 text-amber-950 border-amber-300"
                      }`}
                    >
                      {item.verified ? "Verified Authenticity" : "Unverified Merchant Claim"}
                    </span>
                  )}
                  {item.isStale && (
                    <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-950 border-amber-300">
                      Stale Evidence
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Diagnostic & Audit Footer */}
      {(timestamp || evaluatorVersion) && (
        <footer className="flex flex-wrap items-center justify-between text-[11px] text-muted pt-2 border-t border-border/40 gap-2">
          {evaluatorVersion && (
            <div>
              Engine: <span className="font-mono text-ink">{evaluatorVersion}</span>
            </div>
          )}
          {timestamp && (
            <div>
              Evaluated at: <span className="font-mono text-ink">{timestamp}</span>
            </div>
          )}
        </footer>
      )}
    </article>
  );
}
