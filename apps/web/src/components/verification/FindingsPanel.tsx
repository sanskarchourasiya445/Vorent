import { useState, useEffect, useCallback } from "react";
import {
  Filter,
  RefreshCw,
  Search,
  ShoppingCart,
  ChevronRight,
  Database,
  Table,
  LayoutList,
  Eye,
} from "lucide-react";
import { fetchFindings } from "../../api/findingsService";
import type { FindingRecord } from "@warrant/contracts";
import type { VerificationFinding } from "../../types/verification";
import { FindingDetailModal } from "./FindingDetailModal";
import { RepairProposalModal } from "../policy/RepairProposalModal";
import { HashBadge } from "../ui/HashBadge";
import { StatusBadge } from "../ui/StatusBadge";
import { EmptyState } from "../ui/EmptyState";
import { SkeletonFindingsList } from "../ui/Skeleton";

export function FindingsPanel() {
  const [findings, setFindings] = useState<FindingRecord[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [viewMode, setViewMode] = useState<"TABLE" | "CARDS">("TABLE");

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
    <div className="w-full space-y-6" role="region" aria-label="Governance Findings and Witnesses">
      {/* Workstation Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-[6px] bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Filter className="w-4 h-4 text-primary" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-sans font-semibold tracking-tight text-ink">
                Findings &amp; Witnesses
              </h1>
              <p className="text-xs text-muted mt-0.5 font-sans leading-relaxed">
                Persisted verification findings, witness carts, counterexamples, and Decision D-014 governance triage.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void loadFindings()}
          disabled={isLoading}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-sans font-medium border border-border bg-surface text-ink hover:bg-surface-subtle transition-colors self-start sm:self-auto shadow-2xs focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin text-primary" : "text-muted"}`} aria-hidden="true" />
          <span>Refresh Findings</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="p-3.5 rounded-lg border border-border bg-surface flex flex-wrap items-center justify-between gap-3 text-xs shadow-2xs font-sans">
        <div className="flex flex-wrap items-center gap-2">
          {/* Status Filter */}
          <div className="flex items-center space-x-1">
            <span className="text-muted font-medium">Status:</span>
            {["ALL", "UNRESOLVED", "RESOLVED", "ACCEPTED_RISK"].map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
                  statusFilter === st
                    ? "bg-primary-soft text-primary border border-primary/25"
                    : "bg-surface-inset text-muted border border-border hover:text-ink"
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
                className={`px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                  severityFilter === sev
                    ? "bg-primary text-white font-semibold shadow-2xs"
                    : "bg-surface-inset text-muted border border-border hover:text-ink"
                }`}
              >
                {sev}
              </button>
            ))}
          </div>
        </div>

        {/* Search Input & View Switcher */}
        <div className="flex items-center space-x-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-56">
            <label htmlFor="findings-search" className="sr-only">
              Search findings
            </label>
            <Search className="w-3.5 h-3.5 text-muted absolute left-2.5 top-2.5" aria-hidden="true" />
            <input
              id="findings-search"
              name="findingsSearch"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search findings by ID, type..."
              className="w-full pl-8 pr-3 py-1.5 rounded-md border border-border bg-surface-inset text-ink text-xs focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
            />
          </div>

          <div className="flex items-center rounded-md border border-border bg-surface-inset p-0.5">
            <button
              type="button"
              onClick={() => setViewMode("TABLE")}
              className={`p-1.5 rounded transition-colors ${
                viewMode === "TABLE" ? "bg-surface text-ink shadow-xs" : "text-muted hover:text-ink"
              }`}
              title="Table view"
              aria-label="Table view"
            >
              <Table className="w-3.5 h-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("CARDS")}
              className={`p-1.5 rounded transition-colors ${
                viewMode === "CARDS" ? "bg-surface text-ink shadow-xs" : "text-muted hover:text-ink"
              }`}
              title="Card view"
              aria-label="Card view"
            >
              <LayoutList className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Loading State */}
      {isLoading ? (
        <div className="space-y-4">
          <div className="p-3 rounded-lg border border-border bg-surface-inset text-center text-xs text-muted flex items-center justify-center space-x-2.5">
            <RefreshCw className="w-4 h-4 animate-spin text-accent" aria-hidden="true" />
            <span>Retrieving findings from persistence store...</span>
          </div>
          <SkeletonFindingsList count={3} />
        </div>
      ) : error ? (
        <div className="p-4 rounded-lg border border-review/40 bg-review/10 text-ink text-xs space-y-2">
          <div className="font-bold flex items-center space-x-1.5 text-review">
            <Database className="w-4 h-4 text-review" aria-hidden="true" />
            <span>Persistence Store Notice</span>
          </div>
          <p className="leading-relaxed text-muted">
            {error.includes("503") || error.includes("DATABASE_UNAVAILABLE")
              ? "PostgreSQL database is in standby mode. Persisted findings query requires local database connection."
              : error}
          </p>
        </div>
      ) : filteredFindings.length === 0 ? (
        <EmptyState
          icon={<Filter className="w-6 h-6 mx-auto" />}
          title="No Findings Match Filter"
          description={
            findings.length === 0
              ? "Zero persisted findings in the database. Run bounded verification in Verification Studio to record findings."
              : "Try adjusting the status or severity filter above."
          }
        />
      ) : viewMode === "TABLE" ? (
        /* Structured Table Matrix for Rapid Scanning */
        <div className="rounded-lg border border-border bg-surface overflow-hidden shadow-2xs">
          <div className="overflow-x-auto max-h-[520px] overflow-y-auto" data-lenis-prevent>
            <table className="w-full text-left text-xs border-collapse min-w-[1040px]">
              <thead className="sticky top-0 z-10 shadow-xs">
                <tr className="border-b border-border bg-surface-inset text-[11px] font-medium text-muted font-sans">
                  <th className="py-2.5 px-3 w-44 bg-surface-inset">Severity &amp; Status</th>
                  <th className="py-2.5 px-3 w-52 bg-surface-inset">Loophole Type</th>
                  <th className="py-2.5 px-3 w-44 bg-surface-inset">Policy Version</th>
                  <th className="py-2.5 px-3 w-48 bg-surface-inset">Witness Cart</th>
                  <th className="py-2.5 px-3 w-44 bg-surface-inset">Finding ID</th>
                  <th className="py-2.5 px-3 text-right w-28 bg-surface-inset">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredFindings.map((f) => {
                  const itemCount = f.witness?.items?.length || 0;
                  const totalMinor =
                    f.witness?.items?.reduce(
                      (acc: number, it: any) => acc + (it.unitPriceMinor ?? 0) * (it.quantity ?? 1),
                      0
                    ) || 0;

                  return (
                    <tr
                      key={f.id}
                      onClick={() => setSelectedFinding(mapRecordToFinding(f))}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedFinding(mapRecordToFinding(f));
                        }
                      }}
                      className="hover:bg-surface-raised transition-colors cursor-pointer group"
                    >
                      <td className="py-2.5 px-3 w-44">
                        <div className="flex items-center space-x-1.5">
                          <StatusBadge status={f.severity} size="sm" />
                          <StatusBadge status={f.status} size="sm" />
                        </div>
                      </td>
                      <td className="py-2.5 px-3 w-52">
                        <span className="font-mono font-semibold text-ink">{f.findingType}</span>
                      </td>
                      <td className="py-2.5 px-3 w-44">
                        <HashBadge hash={f.policyVersionId} prefixLength={8} suffixLength={0} showCopy={false} />
                      </td>
                      <td className="py-2.5 px-3 w-48">
                        <div className="flex items-center space-x-1.5 font-mono text-[11px] text-ink">
                          <ShoppingCart className="w-3.5 h-3.5 text-accent shrink-0" aria-hidden="true" />
                          <span>
                            {itemCount} item(s) • ${(totalMinor / 100).toFixed(2)}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 w-44">
                        <HashBadge hash={f.id} prefixLength={8} suffixLength={4} />
                      </td>
                      <td className="py-2.5 px-3 text-right w-28">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFinding(mapRecordToFinding(f));
                          }}
                          className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold border border-border bg-surface hover:bg-surface-raised text-ink group-hover:border-accent/40 transition-colors shadow-2xs"
                        >
                          <Eye className="w-3 h-3 text-accent" aria-hidden="true" />
                          <span>Inspect</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Expanded Card View */
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
                className="p-4 rounded-lg border border-border bg-surface hover:border-accent/40 hover:shadow-xs transition-all cursor-pointer space-y-2.5 text-xs text-left shadow-2xs"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center space-x-2">
                    <StatusBadge status={f.severity} size="sm" />
                    <StatusBadge status={f.status} size="sm" />
                    <span className="font-semibold text-ink font-mono">{f.findingType}</span>
                  </div>

                  <div className="flex items-center space-x-2 text-[11px] text-muted">
                    <span>Policy: <code className="font-mono text-ink">{f.policyVersionId.slice(0, 8)}</code></span>
                    <ChevronRight className="w-4 h-4 text-muted" aria-hidden="true" />
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted pt-1 border-t border-border">
                  <div className="flex items-center space-x-2">
                    <HashBadge hash={f.id} label="Finding" prefixLength={8} suffixLength={4} />
                    <span>•</span>
                    <span>Run: <code className="font-mono text-ink">{f.testRunId.slice(0, 8)}</code></span>
                  </div>

                  <div className="flex items-center space-x-2 font-mono text-ink">
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
