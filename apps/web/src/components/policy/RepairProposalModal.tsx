import { useState, useEffect } from "react";
import {
  Wrench,
  X,
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  RefreshCw,
  Layers,
  FileCode,
  ShieldCheck,
  Check,
} from "lucide-react";
import { proposeRepair, createPolicyVersion } from "../../api/policyService";
import type { ProposeRepairResponse, PolicyVersionRecord, VerificationFinding as ContractFinding } from "@warrant/contracts";
import type { VerificationFinding } from "../../types/verification";

interface RepairProposalModalProps {
  isOpen: boolean;
  onClose: () => void;
  policyVersionId: string;
  testRunId?: string;
  finding?: VerificationFinding | null;
  findings?: VerificationFinding[];
  onPolicyRepaired?: (newVersion: PolicyVersionRecord) => void;
  onRetestRequested?: (newVersionId: string) => void;
}

export function RepairProposalModal({
  isOpen,
  onClose,
  policyVersionId,
  testRunId,
  finding,
  findings,
  onPolicyRepaired,
  onRetestRequested,
}: RepairProposalModalProps) {
  const [instructions] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [proposal, setProposal] = useState<ProposeRepairResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [isApplying, setIsApplying] = useState(false);
  const [appliedVersion, setAppliedVersion] = useState<PolicyVersionRecord | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Automatically request initial proposal when modal opens
  useEffect(() => {
    if (!isOpen || !policyVersionId) {
      setProposal(null);
      setError(null);
      setAppliedVersion(null);
      setApplyError(null);
      return;
    }

    let isMounted = true;
    const loadProposal = async () => {
      setIsLoading(true);
      setError(null);
      try {
        // Collect findings to address
        const targetedFindings: ContractFinding[] = [];
        if (finding) {
          targetedFindings.push({
            findingId: finding.id,
            fingerprint: finding.fingerprint || `fp-${finding.id}`,
            severity: (finding.severity as any) || "HIGH",
            violationType: (finding.violationType as any) || "FALSE_POSITIVE_ALLOW",
            title: finding.title,
            description: finding.summary,
            candidateCart: finding.candidateCart,
            evidence: finding.candidateEvidence as any,
            expectedOutcome: { decision: finding.expectedDecision },
            actualOutcome: finding.actualResult,
            reproduction: {
              candidateIndex: 0,
              summary: finding.reproductionNotes[0] || "Reproduce",
            },
            resolutionStatus: "UNRESOLVED",
          });
        } else if (findings && findings.length > 0) {
          for (const f of findings) {
            targetedFindings.push({
              findingId: f.id,
              fingerprint: f.fingerprint || `fp-${f.id}`,
              severity: (f.severity as any) || "HIGH",
              violationType: (f.violationType as any) || "FALSE_POSITIVE_ALLOW",
              title: f.title,
              description: f.summary,
              candidateCart: f.candidateCart,
              evidence: f.candidateEvidence as any,
              expectedOutcome: { decision: f.expectedDecision },
              actualOutcome: f.actualResult,
              reproduction: {
                candidateIndex: 0,
                summary: f.reproductionNotes[0] || "Reproduce",
              },
              resolutionStatus: "UNRESOLVED",
            });
          }
        }

        const res = await proposeRepair({
          policyVersionId,
          testRunId,
          findings: targetedFindings.length > 0 ? targetedFindings : undefined,
          instructions: instructions.trim() || undefined,
        });

        if (isMounted) {
          setProposal(res);
        }
      } catch (err: unknown) {
        if (isMounted) {
          setError(err instanceof Error ? err.message : "Failed to generate repair proposal.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    void loadProposal();
    return () => {
      isMounted = false;
    };
  }, [isOpen, policyVersionId, testRunId, finding]);

  if (!isOpen) return null;

  const handleApplyRepair = async () => {
    if (!proposal || isApplying) return;

    setIsApplying(true);
    setApplyError(null);

    try {
      // Create new immutable policy version in database
      const newRecord = await createPolicyVersion(policyVersionId, {
        intent: proposal.repairedIntent,
        policy: proposal.repairedPolicy,
        sourceMandateSnapshot: `Automated repair: ${proposal.rationale}`,
        confirmationState: "CONFIRMED",
      });

      setAppliedVersion(newRecord);
      if (onPolicyRepaired) {
        onPolicyRepaired(newRecord);
      }
    } catch (err: unknown) {
      setApplyError(err instanceof Error ? err.message : "Failed to persist repaired version.");
    } finally {
      setIsApplying(false);
    }
  };

  const handleRetest = () => {
    if (appliedVersion && onRetestRequested) {
      onRetestRequested(appliedVersion.id);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-ink/40 backdrop-blur-xs overflow-y-auto"
      role="dialog"
      aria-modal="true"
      aria-labelledby="repair-modal-title"
    >
      <div className="relative w-full max-w-3xl max-h-[90vh] flex flex-col rounded-panel border border-border bg-surface shadow-xl overflow-hidden my-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-border bg-canvas/40">
          <div className="flex items-center space-x-2.5">
            <Wrench className="w-5 h-5 text-accent shrink-0" aria-hidden="true" />
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-muted block">
                Automated Policy Repair & Semantic Diff
              </span>
              <h3 id="repair-modal-title" className="text-base font-bold text-ink">
                Propose Targeted Loophole Repair
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded text-muted hover:text-ink hover:bg-canvas transition-colors"
            title="Close modal (Esc)"
            aria-label="Close modal"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 text-xs">
          {/* Target version information */}
          <div className="flex items-center justify-between p-3 rounded bg-canvas border border-border text-[11px] text-muted">
            <div>
              Target Policy Version: <code className="font-mono text-ink font-semibold">{policyVersionId}</code>
            </div>
            {testRunId && (
              <div>
                Source Test Run: <code className="font-mono text-ink">{testRunId}</code>
              </div>
            )}
          </div>

          {/* Loading State */}
          {isLoading && (
            <div className="py-12 text-center space-y-3">
              <RefreshCw className="w-6 h-6 animate-spin text-accent mx-auto" aria-hidden="true" />
              <div className="font-semibold text-ink text-sm">Synthesizing Policy Repair...</div>
              <p className="text-muted text-xs max-w-md mx-auto">
                Analyzing counterexample witness carts, calculating minimum field-level constraint adjustments, and computing semantic diff.
              </p>
            </div>
          )}

          {/* Error State */}
          {error && (
            <div className="p-4 rounded border border-red-300 bg-red-50 text-red-950 space-y-1">
              <div className="font-bold text-red-900 flex items-center space-x-1.5">
                <AlertTriangle className="w-4 h-4 text-deny" aria-hidden="true" />
                <span>Repair Generation Error</span>
              </div>
              <p>{error}</p>
            </div>
          )}

          {/* Proposal Content */}
          {proposal && !isLoading && (
            <div className="space-y-5">
              {/* Rationale & Remediation Summary */}
              <div className="p-4 rounded border border-accent/20 bg-accent/5 space-y-2">
                <div className="font-bold text-ink flex items-center space-x-1.5">
                  <ShieldCheck className="w-4 h-4 text-accent" aria-hidden="true" />
                  <span>Proposed Repair Rationale</span>
                </div>
                <p className="text-ink leading-relaxed">{proposal.rationale}</p>
                <div className="text-[11px] text-muted">
                  Addressed Findings: <strong>{proposal.addressedFindings.length}</strong>
                </div>
              </div>

              {/* Addressed Findings Remedies */}
              {proposal.addressedFindings.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-bold uppercase tracking-wider text-muted text-[11px]">
                    Remediated Loophole Findings
                  </h4>
                  <div className="space-y-1.5">
                    {proposal.addressedFindings.map((remedy, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded border border-border bg-canvas/40 space-y-1 text-xs"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-ink">{remedy.remedyAction}</span>
                          <span className="font-mono text-[10px] text-muted">{remedy.violationType}</span>
                        </div>
                        <p className="text-muted">{remedy.explanation}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Field-Level Policy Diff */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold uppercase tracking-wider text-muted text-[11px] flex items-center space-x-1.5">
                    <FileCode className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
                    <span>Field-Level Semantic Policy Diff ({proposal.diff.diffs.length} fields)</span>
                  </h4>
                  <span className="text-[11px] text-muted font-mono">{proposal.diff.summary}</span>
                </div>

                <div className="rounded border border-border overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-canvas border-b border-border text-[11px] text-muted uppercase tracking-wider">
                      <tr>
                        <th className="p-2.5">Field</th>
                        <th className="p-2.5">Change</th>
                        <th className="p-2.5">Original Value</th>
                        <th className="p-2.5">Proposed Repaired Value</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {proposal.diff.diffs.map((d, idx) => {
                        const changeBadge =
                          d.changeType === "ADDED"
                            ? "bg-emerald-100 text-emerald-950 border-emerald-300"
                            : d.changeType === "REMOVED"
                              ? "bg-red-100 text-red-950 border-red-300"
                              : d.changeType === "MODIFIED"
                                ? "bg-amber-100 text-amber-950 border-amber-300"
                                : "bg-canvas text-muted border-border";

                        return (
                          <tr key={idx} className="hover:bg-canvas/40">
                            <td className="p-2.5 font-mono font-semibold text-ink">{d.field}</td>
                            <td className="p-2.5">
                              <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold uppercase border ${changeBadge}`}>
                                {d.changeType}
                              </span>
                            </td>
                            <td className="p-2.5 font-mono text-muted text-[11px]">
                              {d.previousValue !== undefined ? JSON.stringify(d.previousValue) : "—"}
                            </td>
                            <td className="p-2.5 font-mono font-semibold text-ink text-[11px]">
                              {d.proposedValue !== undefined ? JSON.stringify(d.proposedValue) : "—"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Retest Required Invariant Banner */}
              <div
                role="note"
                className="p-3.5 rounded border border-amber-300 bg-amber-50 text-amber-950 space-y-1"
              >
                <div className="font-bold flex items-center space-x-1.5 text-amber-900">
                  <AlertTriangle className="w-4 h-4 text-amber-800" aria-hidden="true" />
                  <span>Mandatory Fresh Retest Requirement (Decision D-014)</span>
                </div>
                <p className="text-[11px] leading-relaxed text-amber-900">
                  Applying this repair will create an append-only, immutable new version. Existing approvals remain bound to their original policy version hash.
                  A <strong>fresh verification run</strong> is strictly required on the new version before it can be submitted for approval or authorize checkout.
                </p>
              </div>

              {/* Persistence Error */}
              {applyError && (
                <div className="p-3 rounded bg-red-50 border border-red-200 text-red-900">
                  {applyError}
                </div>
              )}

              {/* Version Created Confirmation */}
              {appliedVersion && (
                <div className="p-3.5 rounded border border-emerald-300 bg-emerald-50 text-emerald-950 flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
                    <span>
                      Created Version <strong>v{appliedVersion.versionNumber}</strong> (<code className="font-mono text-xs">{appliedVersion.id}</code>).
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleRetest}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-accent text-white hover:bg-accent/90 transition-colors shadow-xs"
                  >
                    <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Retest Now in Studio</span>
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between p-4 border-t border-border bg-canvas/30">
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-1.5 rounded text-xs font-semibold border border-border bg-surface text-ink hover:bg-canvas transition-colors"
          >
            Cancel
          </button>

          {!appliedVersion ? (
            <button
              type="button"
              onClick={() => void handleApplyRepair()}
              disabled={!proposal || isApplying || isLoading}
              className="inline-flex items-center space-x-1.5 px-4 py-1.5 rounded text-xs font-semibold bg-accent text-white hover:bg-accent/90 disabled:opacity-50 transition-colors shadow-xs"
            >
              {isApplying ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  <span>Applying Repair...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>Apply as New Policy Version</span>
                </>
              )}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleRetest}
              className="inline-flex items-center space-x-1.5 px-4 py-1.5 rounded text-xs font-semibold bg-accent text-white hover:bg-accent/90 transition-colors shadow-xs"
            >
              <Layers className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Retest Repaired Version</span>
              <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
