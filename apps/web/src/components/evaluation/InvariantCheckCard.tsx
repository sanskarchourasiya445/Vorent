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
          icon: <CheckCircle2 className="w-4 h-4 text-emerald-700" aria-hidden="true" />,
          label: "VERIFIED PASS",
          className: "bg-emerald-50 text-emerald-800 border-emerald-300",
        };
      case "FAIL":
        return {
          icon: <XCircle className="w-4 h-4 text-rose-700" aria-hidden="true" />,
          label: "VIOLATION DETECTED",
          className: "bg-rose-50 text-rose-800 border-rose-300",
        };
      case "WARNING":
        return {
          icon: <AlertTriangle className="w-4 h-4 text-amber-700" aria-hidden="true" />,
          label: "WARNING / STANDBY",
          className: "bg-amber-50 text-amber-800 border-amber-300",
        };
      case "UNTESTED":
      default:
        return {
          icon: <HelpCircle className="w-4 h-4 text-slate-500" aria-hidden="true" />,
          label: "UNTESTED",
          className: "bg-slate-100 text-slate-700 border-slate-300",
        };
    }
  };

  const getProvenanceBadge = () => {
    if (check.status === "UNTESTED" || check.evidenceType === "NONE") {
      return {
        label: "Untested Invariant",
        className: "bg-slate-100 text-slate-700 border-slate-300",
      };
    }
    if (check.evidenceType === "PERSISTED_DATABASE" || check.category === "PERSISTED_RECORDS") {
      return {
        label: "Persisted Database Evidence",
        className: "bg-blue-50 text-blue-800 border-blue-200",
      };
    }
    if (check.evidenceType === "REPRODUCIBLE_SEARCH") {
      return {
        label: "Reproducible Bounded Search",
        className: "bg-cyan-50 text-cyan-800 border-cyan-200",
      };
    }
    return {
      label: "Deterministic Unit Fixture",
      className: "bg-purple-50 text-purple-800 border-purple-200",
    };
  };

  const statusBadge = getStatusBadge();
  const provenanceBadge = getProvenanceBadge();

  return (
    <div
      className="border border-border rounded-panel bg-surface shadow-sm transition-all duration-150 overflow-hidden"
      data-testid={`invariant-card-${check.id.toLowerCase()}`}
    >
      {/* Card Header & Summary */}
      <div className="p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-muted/20 text-ink border border-border">
              {check.id}
            </span>
            <span
              className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-full border ${provenanceBadge.className}`}
              data-testid={`provenance-badge-${check.id.toLowerCase()}`}
            >
              {provenanceBadge.label}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <span
              className={`inline-flex items-center space-x-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusBadge.className}`}
              data-testid={`status-badge-${check.id.toLowerCase()}`}
            >
              {statusBadge.icon}
              <span>{statusBadge.label}</span>
            </span>
          </div>
        </div>

        <h3 className="text-sm sm:text-base font-bold text-ink mt-2">{check.name}</h3>
        <p className="text-xs text-muted mt-1 leading-relaxed">{check.description}</p>

        {/* Evaluation Metrics Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-4 pt-3 border-t border-border/60 text-xs">
          <div>
            <span className="text-muted block text-[11px] font-medium uppercase tracking-wide">
              Input Context
            </span>
            <span className="font-medium text-ink mt-0.5 block">{check.inputSummary}</span>
          </div>

          <div>
            <span className="text-muted block text-[11px] font-medium uppercase tracking-wide">
              Expected vs. Actual Outcome
            </span>
            <div className="mt-0.5 space-y-0.5 font-mono text-[11px]">
              <div>
                <span className="text-muted">Expected: </span>
                <span className="text-ink font-semibold">{check.expectedDecision}</span>
              </div>
              <div>
                <span className="text-muted">Actual: </span>
                <span
                  className={`font-semibold ${
                    check.status === "PASS"
                      ? "text-emerald-700"
                      : check.status === "FAIL"
                      ? "text-rose-700"
                      : check.status === "WARNING"
                      ? "text-amber-700"
                      : "text-slate-500 italic"
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
          <div className="mt-3 p-2.5 rounded bg-canvas/70 border border-border/70 text-xs text-muted flex items-start space-x-2">
            <Shield className="w-3.5 h-3.5 text-accent shrink-0 mt-0.5" aria-hidden="true" />
            <span className="leading-snug">{check.notes}</span>
          </div>
        )}

        {/* Expand/Collapse Accordion Trigger */}
        <div className="mt-3 pt-2 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="inline-flex items-center space-x-1.5 text-xs font-semibold text-accent hover:text-accent/80 transition-colors"
            aria-expanded={isExpanded}
            aria-label={`Toggle proof details for ${check.id}`}
          >
            <span>{isExpanded ? "Hide Verification Details" : "Inspect Verification Proof & Rule Trace"}</span>
            {isExpanded ? (
              <ChevronUp className="w-3.5 h-3.5" aria-hidden="true" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" aria-hidden="true" />
            )}
          </button>

          {check.testedAt && (
            <span className="text-[11px] text-muted font-mono">
              Tested: {new Date(check.testedAt).toLocaleTimeString()}
            </span>
          )}
        </div>
      </div>

      {/* Expanded Verification Details Drawer */}
      {isExpanded && (
        <div className="bg-canvas border-t border-border p-4 sm:p-5 space-y-4 text-xs animate-in fade-in duration-150">
          {/* Evidence Details Disclosure */}
          {check.evidenceDetails && (
            <div className="p-3 rounded bg-surface border border-border">
              <span className="font-semibold text-ink text-xs uppercase tracking-wider block mb-1">
                Audited Evidence Details &amp; Operational State
              </span>
              <p className="text-muted leading-relaxed font-sans">{check.evidenceDetails}</p>
            </div>
          )}

          {/* Known Limitations & Bounded Search Scope */}
          {check.limitations && (
            <div className="p-3 rounded bg-amber-50/60 border border-amber-200 text-amber-950">
              <span className="font-semibold text-xs uppercase tracking-wider block mb-1 text-amber-900">
                Formal Limitations &amp; Search Scope
              </span>
              <p className="text-xs leading-relaxed font-sans text-amber-900/90">{check.limitations}</p>
            </div>
          )}

          {/* Policy Context */}
          {check.policyVersionId && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-muted font-medium">Policy Version:</span>
              <span className="font-mono px-2 py-0.5 rounded bg-surface border border-border text-ink">
                {check.policyVersionId}
              </span>
              {check.policyHash && (
                <>
                  <span className="text-muted font-medium ml-2">SHA-256:</span>
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
              <h4 className="font-semibold text-ink text-xs uppercase tracking-wider mb-2">
                Deterministic Rule Trace
              </h4>
              <div className="border border-border rounded overflow-hidden">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-muted/10 text-muted font-semibold border-b border-border text-[11px]">
                    <tr>
                      <th className="p-2">Rule</th>
                      <th className="p-2">Outcome</th>
                      <th className="p-2">Reason Code</th>
                      <th className="p-2">Message</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border bg-surface font-mono text-[11px]">
                    {check.ruleTrace.map((t, idx) => (
                      <tr key={idx} className="hover:bg-canvas/50">
                        <td className="p-2 font-medium text-ink">{t.ruleName}</td>
                        <td className="p-2">
                          <span
                            className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                              t.outcome === "PASS"
                                ? "bg-emerald-100 text-emerald-800"
                                : t.outcome === "FAIL"
                                ? "bg-rose-100 text-rose-800"
                                : "bg-amber-100 text-amber-800"
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
                <span className="font-semibold text-ink text-xs uppercase tracking-wider flex items-center space-x-1.5">
                  <FileCode className="w-3.5 h-3.5 text-muted" aria-hidden="true" />
                  <span>Verifiable Cryptographic Proof Payload</span>
                </span>
                <button
                  type="button"
                  onClick={handleCopyProof}
                  className="inline-flex items-center space-x-1 text-[11px] font-medium text-muted hover:text-ink transition-colors px-2 py-0.5 rounded bg-surface border border-border"
                  title="Copy JSON proof payload"
                >
                  {copied ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-600" aria-hidden="true" />
                      <span className="text-emerald-700">Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" aria-hidden="true" />
                      <span>Copy JSON</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="p-3 rounded bg-surface border border-border text-[11px] font-mono text-ink overflow-x-auto max-h-48">
                {JSON.stringify(check.rawProof, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
