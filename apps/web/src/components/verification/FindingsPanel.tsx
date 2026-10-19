import { useState, useEffect, useCallback } from "react";
import {
  Filter,
  RefreshCw,
  Search,
  ShoppingCart,
  ChevronRight,
  Database,
} from "lucide-react";
import { fetchFindings } from "../../api/findingsService";
import type { FindingRecord } from "@warrant/contracts";
import type { VerificationFinding } from "../../types/verification";
import { FindingDetailModal } from "./FindingDetailModal";
import { RepairProposalModal } from "../policy/RepairProposalModal";

export function FindingsPanel() {
  const [findings, setFindings] = useState<FindingRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedFinding, setSelectedFinding] = useState<VerificationFinding | null>(null);
  const [isRepairOpen, setIsRepairOpen] = useState(false);
  const [repairFinding, setRepairFinding] = useState<VerificationFinding | null>(null);

  const loadFindings = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetchFindings({
        status: statusFilter !== "ALL" ? statusFilter : undefined,
        limit: 100,
      });
      setFindings(res.findings);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to load findings");
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void loadFindings();
  }, [loadFindings]);

  // Convert FindingRecord to VerificationFinding view model for modal
  const mapRecordToFinding = (f: FindingRecord): VerificationFinding => {
    const candidateCart = (f.witness as any) || { currency: "USD", items: [] };
    return {
      id: f.id,
      title: `Finding #${f.id.slice(0, 8)}: ${f.findingType}`,
      summary: `Discovered defect in policy ${f.policyVersionId}`,
      classification: "COUNTEREXAMPLE",
      expectedDecision: "DENY",
      actualResult: {
        decision: "ALLOW",
        primaryReasonCode: (f.ruleTrace?.[0] as any)?.reasonCode || "ALL_RULES_PASSED",
        reasonCodes: [],
        ruleTrace: (f.ruleTrace as any) || [],
      },
      candidateCart,
      candidateEvidence: (f.evidenceSnapshot as any) || {},
      reproductionNotes: [(f.reproduction as any)?.summary || "Inspect witness cart for reproduction"],
      severity: f.severity,
      violationType: f.findingType,
      resolutionStatus: f.status,
      fingerprint: `fp-${f.id}`,
      resolvedByVersionId: f.resolvedByVersionId,
      resolutionNote: f.resolutionNote,
    };
  };

  const filteredFindings = findings.filter((f) => {
    if (severityFilter !== "ALL" && f.severity !== severityFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return (
        f.id.toLowerCase().includes(q) ||
        f.findingType.toLowerCase().includes(q) ||
        f.policyVersionId.toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="max-w-5xl mx-auto space-y-6" role="region" aria-label="Governance Findings and Witnesses">
      {/* Workstation Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <Filter className="w-6 h-6 text-accent" aria-hidden="true" />
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink">
              Findings & Witnesses
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-muted mt-1">
            Persisted verification findings, witness carts, counterexamples, and Decision D-014 governance triage.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadFindings()}
          disabled={isLoading}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs font-semibold border border-border bg-surface text-ink hover:bg-canvas transition-colors self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} aria-hidden="true" />
          <span>Refresh Findings</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-4 rounded-panel border border-border bg-surface flex flex-wrap items-center justify-between gap-3 text-xs shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter */}
          <div className="flex items-center space-x-1">
            <span className="text-muted font-medium">Status:</span>
            {["ALL", "UNRESOLVED", "RESOLVED", "ACCEPTED_RISK"].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold transition-colors ${
                  statusFilter === st
                    ? "bg-accent/15 text-accent border border-accent/30"
                    : "bg-canvas text-muted border border-border hover:text-ink"
                }`}
              >
                {st}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-border hidden sm:block" />

          {/* Severity Filter */}
          <div className="flex items-center space-x-1">
            <span className="text-muted font-medium">Severity:</span>
            {["ALL", "CRITICAL", "HIGH", "MEDIUM", "LOW"].map((sev) => (
              <button
                key={sev}
                type="button"
                onClick={() => setSeverityFilter(sev)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium transition-colors ${
                  severityFilter === sev
                    ? "bg-ink text-white"
                    : "bg-canvas text-muted border border-border hover:text-ink"
                }`}
              >
                {sev}
              </button>
            ))}
          </div>
        </div>

        {/* Search Input */}
        <div className="relative w-full sm:w-60">
          <Search className="w-3.5 h-3.5 text-muted absolute left-2.5 top-2.5" aria-hidden="true" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search findings by ID, type..."
            className="w-full pl-8 pr-3 py-1.5 rounded border border-border bg-canvas/30 text-ink text-xs focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>

      {/* Loading State */}
      {isLoading ? (
        <div className="p-12 text-center text-xs text-muted space-y-2">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-accent" aria-hidden="true" />
          <div>Retrieving findings from persistence store...</div>
        </div>
      ) : error ? (
        <div className="p-5 rounded-panel border border-amber-300 bg-amber-50 text-amber-950 text-xs space-y-2">
          <div className="font-bold flex items-center space-x-1.5 text-amber-900">
            <Database className="w-4 h-4 text-amber-800" aria-hidden="true" />
            <span>Persistence Store Notice</span>
          </div>
          <p className="leading-relaxed">
            {error.includes("503") || error.includes("DATABASE_UNAVAILABLE")
              ? "PostgreSQL database is in standby mode. Persisted findings query requires local database connection."
              : error}
          </p>
        </div>
      ) : filteredFindings.length === 0 ? (
        <div className="p-12 text-center border border-border rounded-panel bg-surface space-y-2">
          <div className="inline-flex p-3 rounded-full bg-canvas text-muted mb-1">
            <Filter className="w-6 h-6" aria-hidden="true" />
          </div>
          <h3 className="text-sm font-semibold text-ink">No Findings Match Filter</h3>
          <p className="text-xs text-muted max-w-sm mx-auto">
            {findings.length === 0
              ? "Zero persisted findings in the database. Run bounded verification in Verification Studio to record findings."
              : "Try adjusting the status or severity filter above."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredFindings.map((f) => {
            const itemCount = f.witness?.items?.length || 0;
            const totalMinor =
              f.witness?.items?.reduce((acc: number, it: any) => acc + (it.unitPriceMinor ?? 0) * (it.quantity ?? 1), 0) || 0;

            return (
              <div
                key={f.id}
                onClick={() => setSelectedFinding(mapRecordToFinding(f))}
                tabIndex={0}
                role="button"
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSelectedFinding(mapRecordToFinding(f));
                  }
                }}
                className="p-4 rounded border border-border bg-surface hover:border-accent/40 hover:shadow-xs transition-all cursor-pointer space-y-2.5 text-xs text-left"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    <span
                      className={`inline-block px-1.5 py-0.2 rounded text-[10px] font-bold uppercase border ${
                        f.severity === "CRITICAL"
                          ? "bg-red-200 text-red-950 border-red-400"
                          : f.severity === "HIGH"
                            ? "bg-red-100 text-red-900 border-red-300"
                            : f.severity === "MEDIUM"
                              ? "bg-amber-100 text-amber-900 border-amber-300"
                              : "bg-slate-100 text-slate-800 border-slate-300"
                      }`}
                    >
                      {f.severity}
                    </span>

                    <span
                      className={`font-mono text-[10px] px-1.5 py-0.2 rounded font-semibold border ${
                        f.status === "RESOLVED"
                          ? "bg-emerald-100 text-emerald-950 border-emerald-300"
                          : f.status === "ACCEPTED_RISK"
                            ? "bg-amber-100 text-amber-950 border-amber-300"
                            : "bg-canvas text-muted border-border"
                      }`}
                    >
                      {f.status}
                    </span>

                    <span className="font-semibold text-ink font-mono">{f.findingType}</span>
                  </div>

                  <div className="flex items-center space-x-2 text-[11px] text-muted">
                    <span>Policy: <code className="font-mono text-ink">{f.policyVersionId.slice(0, 8)}</code></span>
                    <ChevronRight className="w-4 h-4 text-muted" aria-hidden="true" />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted pt-1 border-t border-border/60">
                  <div className="flex items-center space-x-2">
                    <span>Finding ID: <code className="font-mono text-ink">{f.id}</code></span>
                    <span>•</span>
                    <span>Run: <code className="font-mono text-ink">{f.testRunId.slice(0, 8)}</code></span>
                  </div>

                  <div className="flex items-center space-x-2 font-mono">
                    <ShoppingCart className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
                    <span>
                      {itemCount} item(s) • ${(totalMinor / 100).toFixed(2)} {f.witness?.currency || "USD"}
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Finding Detail Modal */}
      <FindingDetailModal
        finding={selectedFinding}
        policyVersionId={selectedFinding?.candidateCart ? undefined : undefined}
        onClose={() => setSelectedFinding(null)}
        onOpenRepair={(f) => {
          setRepairFinding(f);
          setIsRepairOpen(true);
        }}
        onFindingResolved={() => {
          void loadFindings();
        }}
      />

      {/* Automated Policy Repair Modal */}
      {selectedFinding && (
        <RepairProposalModal
          isOpen={isRepairOpen}
          onClose={() => setIsRepairOpen(false)}
          policyVersionId={selectedFinding.id}
          finding={repairFinding}
          onPolicyRepaired={() => {
            void loadFindings();
          }}
        />
      )}
    </div>
  );
}
