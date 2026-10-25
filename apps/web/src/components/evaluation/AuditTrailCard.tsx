import { useState, useMemo } from "react";
import {
  History,
  RefreshCw,
  Search,
  Filter,
  Database,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Copy,
  Check,
  User,
  Bot,
  Cpu,
  Radio,
  FileText,
} from "lucide-react";
import type { AuditTrailLoadResult, AuditEventRecord } from "../../types/evaluation";

interface AuditTrailCardProps {
  auditResult: AuditTrailLoadResult;
  isLoading: boolean;
  onRefresh: () => void;
}

export function AuditTrailCard({ auditResult, isLoading, onRefresh }: AuditTrailCardProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedActor, setSelectedActor] = useState<string>("ALL");
  const [selectedEntityType, setSelectedEntityType] = useState<string>("ALL");
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyPayload = (event: AuditEventRecord) => {
    navigator.clipboard.writeText(JSON.stringify(event.payload, null, 2));
    setCopiedId(event.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getActorBadge = (actorType: string) => {
    switch (actorType) {
      case "USER":
        return {
          icon: <User className="w-3 h-3" aria-hidden="true" />,
          label: "USER",
          className: "bg-blue-50 text-blue-800 border-blue-200",
        };
      case "AGENT":
        return {
          icon: <Bot className="w-3 h-3" aria-hidden="true" />,
          label: "AGENT",
          className: "bg-purple-50 text-purple-800 border-purple-200",
        };
      case "PAYPAL_WEBHOOK":
        return {
          icon: <Radio className="w-3 h-3" aria-hidden="true" />,
          label: "WEBHOOK",
          className: "bg-amber-50 text-amber-800 border-amber-200",
        };
      case "SYSTEM":
      default:
        return {
          icon: <Cpu className="w-3 h-3" aria-hidden="true" />,
          label: "SYSTEM",
          className: "bg-slate-100 text-slate-800 border-slate-200",
        };
    }
  };

  const getEventTypeBadgeClass = (eventType: string) => {
    if (eventType.includes("ORDER") || eventType.includes("PAYMENT")) {
      return "bg-emerald-50 text-emerald-800 border-emerald-200";
    }
    if (eventType.includes("RESERVATION")) {
      return "bg-indigo-50 text-indigo-800 border-indigo-200";
    }
    if (eventType.includes("APPROVAL")) {
      return "bg-cyan-50 text-cyan-800 border-cyan-200";
    }
    if (eventType.includes("POLICY")) {
      return "bg-blue-50 text-blue-800 border-blue-200";
    }
    if (eventType.includes("VERIFICATION") || eventType.includes("FINDING")) {
      return "bg-purple-50 text-purple-800 border-purple-200";
    }
    return "bg-slate-50 text-slate-700 border-border";
  };

  // Filter events
  const filteredEvents = useMemo(() => {
    if (!Array.isArray(auditResult.events)) return [];

    return auditResult.events.filter((event) => {
      // Actor filter
      if (selectedActor !== "ALL" && event.actorType !== selectedActor) {
        return false;
      }
      // Entity type filter
      if (selectedEntityType !== "ALL" && event.entityType !== selectedEntityType) {
        return false;
      }
      // Search term
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchesEntityId = (event.entityId || "").toLowerCase().includes(query);
        const matchesEventType = event.eventType.toLowerCase().includes(query);
        const matchesActor = event.actorType.toLowerCase().includes(query);
        const matchesPayload = JSON.stringify(event.payload).toLowerCase().includes(query);
        return matchesEntityId || matchesEventType || matchesActor || matchesPayload;
      }
      return true;
    });
  }, [auditResult.events, selectedActor, selectedEntityType, searchTerm]);

  return (
    <div className="border border-border rounded-panel bg-surface shadow-sm overflow-hidden" data-testid="audit-trail-card">
      {/* Header */}
      <div className="p-4 sm:p-5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <History className="w-5 h-5 text-accent" aria-hidden="true" />
            <h2 className="text-base font-bold text-ink tracking-tight">
              Immutable Audit Trail &amp; Provenance Ledger
            </h2>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-accent/10 text-accent font-semibold border border-accent/20">
              Append-Only
            </span>
          </div>
          <p className="text-xs text-muted mt-1 leading-relaxed">
            Cryptographic ledger tracking security-critical events across policy compilation, bounded search verification, buyer approvals, gate nonces, and PayPal Sandbox order creation.
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="px-3 py-1.5 rounded text-xs font-semibold bg-surface border border-border text-ink hover:bg-canvas transition-all duration-150 inline-flex items-center space-x-1.5 shadow-sm disabled:opacity-50 shrink-0 self-start sm:self-auto"
          data-testid="refresh-audit-trail-btn"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} aria-hidden="true" />
          <span>Refresh Audit Trail</span>
        </button>
      </div>

      {/* Database Standby Banner */}
      {auditResult.state === "STANDBY" && (
        <div
          className="m-4 p-4 rounded-panel bg-amber-50 border border-amber-300 text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
          role="alert"
          data-testid="audit-standby-banner"
        >
          <div className="flex items-start sm:items-center space-x-2.5">
            <Database className="w-4 h-4 text-amber-700 shrink-0 mt-0.5 sm:mt-0" aria-hidden="true" />
            <div>
              <span className="font-bold">Database Persistence in Standby: </span>
              <span>
                {auditResult.message || "PostgreSQL database is currently in standby mode. Persisted audit events require an active database connection."}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="px-3 py-1 rounded bg-amber-200 hover:bg-amber-300 text-amber-900 font-semibold text-xs transition-colors shrink-0 self-start sm:self-auto"
          >
            Retry Connection
          </button>
        </div>
      )}

      {/* Unavailable Data Banner */}
      {auditResult.state === "UNAVAILABLE" && (
        <div
          className="m-4 p-4 rounded-panel bg-slate-50 border border-slate-300 text-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
          role="alert"
          data-testid="audit-unavailable-banner"
        >
          <div className="flex items-start sm:items-center space-x-2.5">
            <AlertTriangle className="w-4 h-4 text-slate-600 shrink-0 mt-0.5 sm:mt-0" aria-hidden="true" />
            <div>
              <span className="font-bold">Audit Service Unavailable: </span>
              <span>{auditResult.message || "Unable to reach audit trail endpoint."}</span>
            </div>
          </div>
          <button
            type="button"
            onClick={onRefresh}
            className="px-3 py-1 rounded bg-slate-200 hover:bg-slate-300 text-slate-900 font-semibold text-xs transition-colors shrink-0 self-start sm:self-auto"
          >
            Retry Fetch
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="p-4 border-b border-border bg-canvas/40 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs">
        <div className="relative flex-1">
          <Search className="w-3.5 h-3.5 text-muted absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by Entity ID, Event Type, or payload content..."
            className="w-full pl-9 pr-3 py-1.5 rounded border border-border bg-surface text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-accent text-xs"
            data-testid="audit-search-input"
          />
        </div>

        <div className="flex items-center space-x-2 overflow-x-auto">
          <div className="flex items-center space-x-1 shrink-0">
            <Filter className="w-3.5 h-3.5 text-muted" aria-hidden="true" />
            <span className="text-muted font-medium text-[11px] uppercase tracking-wider">Actor:</span>
            <select
              value={selectedActor}
              onChange={(e) => setSelectedActor(e.target.value)}
              className="px-2 py-1 rounded border border-border bg-surface text-ink text-xs focus:outline-none focus:ring-1 focus:ring-accent font-mono"
              data-testid="actor-filter-select"
            >
              <option value="ALL">All Actors</option>
              <option value="USER">USER</option>
              <option value="AGENT">AGENT</option>
              <option value="SYSTEM">SYSTEM</option>
              <option value="PAYPAL_WEBHOOK">PAYPAL_WEBHOOK</option>
            </select>
          </div>

          <div className="flex items-center space-x-1 shrink-0">
            <span className="text-muted font-medium text-[11px] uppercase tracking-wider">Entity:</span>
            <select
              value={selectedEntityType}
              onChange={(e) => setSelectedEntityType(e.target.value)}
              className="px-2 py-1 rounded border border-border bg-surface text-ink text-xs focus:outline-none focus:ring-1 focus:ring-accent font-mono"
              data-testid="entity-type-filter-select"
            >
              <option value="ALL">All Entities</option>
              <option value="PAYMENT_ORDER">Payment Orders</option>
              <option value="SPEND_RESERVATION">Spend Reservations</option>
              <option value="APPROVAL">Approvals</option>
              <option value="CHECKOUT_PROPOSAL">Checkout Proposals</option>
              <option value="TEST_RUN">Verification Runs</option>
              <option value="POLICY_VERSION">Policy Versions</option>
            </select>
          </div>
        </div>
      </div>

      {/* Content Area */}
      <div className="p-4 sm:p-5">
        {isLoading ? (
          <div className="p-8 text-center text-muted space-y-2" data-testid="audit-loading">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-accent" aria-hidden="true" />
            <p className="text-xs font-medium">Querying authoritative audit trail...</p>
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="p-8 text-center border border-dashed border-border rounded-panel bg-canvas/30" data-testid="audit-empty-state">
            <FileText className="w-8 h-8 text-muted/60 mx-auto mb-2" aria-hidden="true" />
            <h3 className="text-xs font-bold text-ink">Zero Audit Events Found</h3>
            <p className="text-xs text-muted mt-1 max-w-sm mx-auto">
              {searchTerm || selectedActor !== "ALL" || selectedEntityType !== "ALL"
                ? "No audit events match your current filter criteria. Try clearing search filters."
                : "No audit events recorded in the system yet. Run a verification test or checkout proposal to generate verifiable audit records."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between text-xs text-muted font-mono mb-1">
              <span>
                Showing {filteredEvents.length} of {auditResult.events.length} events
              </span>
              {auditResult.message && <span className="text-[11px] italic">{auditResult.message}</span>}
            </div>

            <div className="border border-border rounded overflow-hidden">
              <table className="w-full text-left border-collapse text-xs" data-testid="audit-events-table">
                <thead className="bg-muted/10 text-muted font-semibold border-b border-border text-[11px]">
                  <tr>
                    <th className="p-2.5">Timestamp</th>
                    <th className="p-2.5">Actor</th>
                    <th className="p-2.5">Event Type</th>
                    <th className="p-2.5">Entity Target</th>
                    <th className="p-2.5 text-right">Details</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border bg-surface font-mono text-[11px]">
                  {filteredEvents.map((event) => {
                    const actorBadge = getActorBadge(event.actorType);
                    const isExpanded = expandedEventId === event.id;

                    return (
                      <tr key={event.id} className="hover:bg-canvas/50 transition-colors">
                        <td className="p-2.5 whitespace-nowrap text-muted font-sans text-xs">
                          {new Date(event.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </td>
                        <td className="p-2.5">
                          <span className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold border ${actorBadge.className}`}>
                            {actorBadge.icon}
                            <span>{actorBadge.label}</span>
                          </span>
                        </td>
                        <td className="p-2.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-semibold border ${getEventTypeBadgeClass(event.eventType)}`}>
                            {event.eventType}
                          </span>
                        </td>
                        <td className="p-2.5 font-mono text-ink">
                          <span className="text-muted mr-1.5">{event.entityType}:</span>
                          <span className="font-semibold">{event.entityId || "N/A"}</span>
                        </td>
                        <td className="p-2.5 text-right font-sans">
                          <button
                            type="button"
                            onClick={() => setExpandedEventId(isExpanded ? null : event.id)}
                            className="inline-flex items-center space-x-1 text-xs font-semibold text-accent hover:text-accent/80 transition-colors"
                            aria-expanded={isExpanded}
                            data-testid={`inspect-event-${event.id}`}
                          >
                            <span>{isExpanded ? "Close" : "Inspect"}</span>
                            {isExpanded ? (
                              <ChevronUp className="w-3 h-3" aria-hidden="true" />
                            ) : (
                              <ChevronDown className="w-3 h-3" aria-hidden="true" />
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Active Expanded Event Payload Viewer */}
            {expandedEventId && (
              <div className="p-4 rounded-panel bg-canvas border border-border animate-in fade-in duration-150" data-testid="expanded-audit-event">
                {(() => {
                  const activeEvent = filteredEvents.find((e) => e.id === expandedEventId);
                  if (!activeEvent) return null;

                  return (
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <span className="font-mono text-xs font-bold text-ink">Event ID: {activeEvent.id}</span>
                          <span className="text-[11px] text-muted">({activeEvent.createdAt})</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleCopyPayload(activeEvent)}
                          className="inline-flex items-center space-x-1 text-xs font-medium text-muted hover:text-ink transition-colors px-2 py-1 rounded bg-surface border border-border"
                          data-testid="copy-event-payload-btn"
                        >
                          {copiedId === activeEvent.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600" aria-hidden="true" />
                              <span className="text-emerald-700 font-semibold">Copied Payload</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5" aria-hidden="true" />
                              <span>Copy JSON Payload</span>
                            </>
                          )}
                        </button>
                      </div>
                      <pre className="p-3 rounded bg-surface border border-border text-[11px] font-mono text-ink overflow-x-auto max-h-60">
                        {JSON.stringify(activeEvent.payload, null, 2)}
                      </pre>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
