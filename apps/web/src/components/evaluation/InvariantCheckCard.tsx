import { useState } from "react";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  Shield,
  FileCode,
} from "lucide-react";
import type { SecurityInvariantCheck } from "../../types/evaluation";

interface InvariantCheckCardProps {
  check: SecurityInvariantCheck;
}

export function InvariantCheckCard({ check }: InvariantCheckCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopyProof = () => {
    if (check.rawProof) {
      navigator.clipboard.writeText(JSON.stringify(check.rawProof, null, 2));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  // Status-specific styling
  const getStatusBadge = () => {
    switch (check.status) {
      case "PASS":
        return {
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-700 dark:text-allow" aria-hidden="true" />,
          label: "VERIFIED PASS",
          className: "bg-emerald-50 dark:bg-allow/10 text-emerald-800 dark:text-allow border-emerald-300 dark:border-allow/30",
        };
      case "FAIL":
        return {
          icon: <XCircle className="w-4 h-4 text-rose-700 dark:text-deny" aria-hidden="true" />,
          label: "VIOLATION DETECTED",
          className: "bg-rose-50 dark:bg-deny/10 text-rose-800 dark:text-deny border-rose-300 dark:border-deny/30",
        };
      case "WARNING":
        return {
          icon: <AlertTriangle className="w-4 h-4 text-amber-700 dark:text-warning" aria-hidden="true" />,
          label: "WARNING / STANDBY",
          className: "bg-amber-50 dark:bg-warning/10 text-amber-800 dark:text-warning border-amber-300 dark:border-warning/30",
        };
      case "UNTESTED":
      default:
        return {
          icon: <HelpCircle className="w-4 h-4 text-slate-500 dark:text-muted" aria-hidden="true" />,
          label: "UNTESTED",
          className: "bg-slate-100 dark:bg-surface-inset text-slate-700 dark:text-muted border-slate-300 dark:border-border",
        };
    }
  };

  const getProvenanceBadge = () => {
    if (check.status === "UNTESTED" || check.evidenceType === "NONE") {
      return {
        label: "Untested Invariant",
        className: "bg-surface-inset text-muted border-border",
      };
    }
    if (check.evidenceType === "PERSISTED_DATABASE" || check.category === "PERSISTED_RECORDS") {
      return {
        label: "Persisted Database Evidence",
        className: "bg-info/10 text-info border-info/30",
      };
    }
    if (check.evidenceType === "REPRODUCIBLE_SEARCH") {
      return {
        label: "Reproducible Bounded Search",
        className: "bg-primary/10 text-primary border-primary/30",
      };
    }
    return {
      label: "Deterministic Unit Fixture",
      className: "bg-purple-50 dark:bg-purple-950/40 text-purple-800 dark:text-purple-300 border-purple-200 dark:border-purple-800/40",
    };
  };

  const statusBadge = getStatusBadge();
  const provenanceBadge = getProvenanceBadge();

  return (
    <div
      className="border border-border rounded bg-surface shadow-2xs transition-all duration-150 overflow-hidden"
      data-testid={`invariant-card-${check.id.toLowerCase()}`}
    >
      {/* Card Header & Summary */}
      <div className="p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-surface-inset text-ink border border-border">
              {check.id}
            </span>
            <span
              className={`text-[10px] font-mono uppercase tracking-wider font-semibold px-2 py-0.5 rounded border ${provenanceBadge.className}`}
              data-testid={`provenance-badge-${check.id.toLowerCase()}`}
            >
              {provenanceBadge.label}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <span
              className={`inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded text-xs font-mono font-semibold border ${statusBadge.className}`}
              data-testid={`status-badge-${check.id.toLowerCase()}`}
            >
              {statusBadge.icon}
              <span>{statusBadge.label}</span>
            </span>
          </div>
        </div>

        <h3 className="text-sm sm:text-base font-bold text-ink font-sans mt-2">{check.name}</h3>
        <p className="text-xs text-muted mt-1 leading-relaxed font-sans">{check.description}</p>

        {/* Evaluation Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4 pt-3 border-t border-border text-xs">
          <div>
            <span className="text-muted block text-[11px] font-semibold font-mono uppercase tracking-wide">
              Input Context
            </span>
            <span className="font-medium text-ink mt-0.5 block font-sans">{check.inputSummary}</span>
          </div>

          <div>
            <span className="text-muted block text-[11px] font-semibold font-mono uppercase tracking-wide">
              Expected vs. Actual Outcome
            </span>
            <div className="mt-1 space-y-1.5 font-mono text-[11px]">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-muted">Expected:</span>
                <span className="px-1.5 py-0.5 rounded bg-surface border border-border text-ink font-semibold">
                  {check.expectedDecision}
                </span>
              </div>
              <div className="flex flex-wrap items-start gap-1.5">
                <span className="text-muted">Actual:</span>
                <span
                  className={`px-1.5 py-0.5 rounded border font-semibold break-words leading-normal max-w-full inline-block ${
                    check.status === "PASS"
                      ? "bg-allow/10 text-allow border-allow/30"
                      : check.status === "FAIL"
                      ? "bg-deny/10 text-deny border-deny/30"
                      : check.status === "WARNING"
                      ? "bg-review/10 text-review border-review/30"
                      : "bg-surface text-muted border-border italic"
                  }`}
                >
                  {check.actualDecision || "Not evaluated yet"}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Auditor Notes */}
        {check.notes && (
          <div className="mt-3 p-2.5 rounded bg-surface-inset border border-border text-xs text-muted flex items-start space-x-2 font-mono">
            <Shield className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" aria-hidden="true" />
            <span className="leading-snug font-sans">{check.notes}</span>
          </div>
        )}

        {/* Expand/Collapse Accordion Trigger */}
        <div className="mt-3 pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-border/40 min-w-0">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="inline-flex items-center space-x-1.5 text-xs font-mono font-semibold text-accent hover:text-accent/80 transition-colors cursor-pointer"
            aria-expanded={isExpanded}
            aria-label={`Toggle proof details for ${check.id}`}
          >
            <span>{isExpanded ? "Hide Verification Details" : "Inspect Verification Details"}</span>
            {isExpanded ? (
              <ChevronUp className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            )}
          </button>

          {check.testedAt && (
            <span className="text-[11px] text-muted font-mono shrink-0">
              Tested: {new Date(check.testedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </span>
          )}
        </div>
      </div>

      {/* Expanded Verification Details Drawer */}
      {isExpanded && (
        <div className="bg-surface-inset border-t border-border p-4 sm:p-5 space-y-4 text-xs animate-in fade-in duration-150">
          {/* Evidence Details Disclosure */}
          {check.evidenceDetails && (
            <div className="p-3 rounded bg-surface border border-border">
              <span className="font-semibold text-ink text-xs font-mono uppercase tracking-wider block mb-1">
                Audited Evidence Details &amp; Operational State
              </span>
              <p className="text-muted leading-relaxed font-sans">{check.evidenceDetails}</p>
            </div>
          )}

          {/* Known Limitations & Bounded Search Scope */}
          {check.limitations && (
            <div className="p-3 rounded-lg bg-warning/10 border border-warning/30 text-ink">
              <span className="font-semibold text-xs font-mono uppercase tracking-wider block mb-1 text-warning">
                Formal Limitations &amp; Search Scope
              </span>
              <p className="text-xs leading-relaxed font-sans text-muted">{check.limitations}</p>
            </div>
          )}

          {/* Policy Context */}
          {check.policyVersionId && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted font-mono font-medium">Policy Version:</span>
              <span className="font-mono px-2 py-0.5 rounded bg-surface border border-border text-ink">
                {check.policyVersionId}
              </span>
              {check.policyHash && (
                <>
                  <span className="text-muted font-mono font-medium ml-2">SHA-256:</span>
                  <span
                    className="font-mono text-[11px] text-muted px-2 py-0.5 rounded bg-surface border border-border"
                    title={check.policyHash}
                  >
                    {check.policyHash.slice(0, 16)}...
                  </span>
                </>
              )}
            </div>
          )}

          {/* Rule Evaluation Trace */}
          {check.ruleTrace && check.ruleTrace.length > 0 && (
            <div>
              <h4 className="font-semibold text-ink text-xs font-mono uppercase tracking-wider mb-2">
                Deterministic Rule Trace
              </h4>
              <div data-lenis-prevent className="border border-border rounded overflow-x-auto bg-surface">
                <table className="w-full text-left border-collapse text-xs min-w-[520px]">
                  <thead className="bg-canvas text-muted font-mono font-semibold border-b border-border text-[11px]">
                    <tr>
                      <th className="p-2">Rule</th>
                      <th className="p-2">Outcome</th>
                      <th className="p-2">Reason Code</th>
                      <th className="p-2">Message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-surface font-mono text-[11px]">
                    {check.ruleTrace.map((t, idx) => (
                      <tr key={idx} className="hover:bg-surface-raised">
                        <td className="p-2 font-medium text-ink">{t.ruleName}</td>
                        <td className="p-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              t.outcome === "PASS"
                                ? "bg-allow/15 text-allow border border-allow/30"
                                : t.outcome === "FAIL"
                                ? "bg-deny/15 text-deny border border-deny/30"
                                : "bg-warning/15 text-warning border border-warning/30"
                            }`}
                          >
                            {t.outcome}
                          </span>
                        </td>
                        <td className="p-2 text-muted">{t.reasonCode || "—"}</td>
                        <td className="p-2 font-sans text-xs text-ink">{t.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Raw Proof Data Block */}
          {check.rawProof && (
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="font-semibold text-ink text-xs font-mono uppercase tracking-wider flex items-center space-x-1.5">
                  <FileCode className="w-3.5 h-3.5 text-muted" aria-hidden="true" />
                  <span>Verifiable Cryptographic Proof Payload</span>
                </span>
                <button
                  type="button"
                  onClick={handleCopyProof}
                  className="inline-flex items-center space-x-1 text-[11px] font-mono font-medium text-muted hover:text-ink transition-colors px-2 py-0.5 rounded bg-surface border border-border shadow-2xs"
                  title="Copy JSON proof payload"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-700 dark:text-allow" aria-hidden="true" />
                      <span className="text-emerald-700 dark:text-allow">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" aria-hidden="true" />
                      <span>Copy JSON</span>
                    </>
                  )}
                </button>
              </div>
              <pre data-lenis-prevent className="p-3 rounded bg-canvas border border-border text-[11px] font-mono text-ink overflow-x-auto max-h-48">
                {JSON.stringify(check.rawProof, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
