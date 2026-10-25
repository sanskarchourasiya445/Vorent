import { useEffect, useState, useCallback } from "react";
import {
  Clock,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Ban,
  RefreshCw,
  Copy,
  Check,
  Database,
  Calendar,
} from "lucide-react";
import { fetchApprovals, revokeApproval } from "../../api/approvalService";
import type { ApprovalRecord, ApprovalListState } from "../../types/approval";

interface Props {
  selectedPolicyHash?: string;
  onSelectPolicyVersion?: (policyVersionId: string) => void;
}

export function ApprovalHistoryTimeline({
  selectedPolicyHash,
  onSelectPolicyVersion,
}: Props) {
  const [listState, setListState] = useState<ApprovalListState>({ state: "LOADING" });
  const [copiedHash, setCopiedHash] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);
  const [filterActiveOnly, setFilterActiveOnly] = useState<boolean>(false);

  const loadApprovals = useCallback(async () => {
    setListState({ state: "LOADING" });
    setRevokeError(null);
    const result = await fetchApprovals();
    setListState(result);
  }, []);

  useEffect(() => {
    void loadApprovals();
  }, [loadApprovals]);

  const handleCopyHash = (hash: string) => {
    navigator.clipboard?.writeText(hash);
    setCopiedHash(hash);
    setTimeout(() => setCopiedHash(null), 2000);
  };

  const handleRevoke = async (id: string) => {
    if (!confirm("Are you sure you want to revoke this approval? Once revoked, checkout requests bound to this approval will be immediately blocked.")) {
      return;
    }

    setRevokingId(id);
    setRevokeError(null);
    try {
      await revokeApproval(id);
      await loadApprovals();
    } catch (err) {
      setRevokeError(err instanceof Error ? err.message : "Failed to revoke approval.");
    } finally {
      setRevokingId(null);
    }
  };

  const formatAmount = (minor: number, currency: string) => {
    const amount = (minor / 100).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    return `${currency} $${amount}`;
  };

  const formatRelativeTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoString;
    }
  };

  return (
    <div className="space-y-4">
      {/* Timeline Controls Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div className="flex items-center space-x-2">
          <Clock className="w-4 h-4 text-accent" />
          <h3 className="font-semibold text-sm text-ink tracking-tight">
            Approval History Timeline
          </h3>
          {listState.state === "READY" && (
            <span className="text-xs px-2 py-0.5 rounded-full bg-accent/10 text-accent font-medium">
              {listState.data.length} recorded
            </span>
          )}
        </div>

        <div className="flex items-center space-x-2">
          <label className="flex items-center space-x-1.5 text-xs text-muted cursor-pointer hover:text-ink">
            <input
              type="checkbox"
              checked={filterActiveOnly}
              onChange={(e) => setFilterActiveOnly(e.target.checked)}
              className="rounded border-border text-accent focus:ring-accent"
            />
            <span>Active only</span>
          </label>

          <button
            type="button"
            onClick={() => void loadApprovals()}
            disabled={listState.state === "LOADING"}
            className="inline-flex items-center space-x-1 px-2.5 py-1 text-xs font-medium rounded border border-border bg-surface hover:bg-canvas text-muted hover:text-ink transition-colors disabled:opacity-50"
            title="Refresh approval timeline"
            aria-label="Refresh approvals"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${
                listState.state === "LOADING" ? "animate-spin text-accent" : ""
              }`}
            />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {revokeError && (
        <div className="p-3 rounded border border-deny/30 bg-deny/10 text-deny text-xs flex items-start space-x-2">
          <AlertTriangle className="w-4 h-4 text-deny shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-semibold">Failed to revoke approval</p>
            <p className="text-ink">{revokeError}</p>
          </div>
        </div>
      )}

      {/* Loading State */}
      {listState.state === "LOADING" && (
        <div className="p-8 text-center space-y-3 rounded-panel border border-border bg-surface">
          <RefreshCw className="w-6 h-6 animate-spin text-accent mx-auto" />
          <p className="text-xs text-muted">Retrieving approval checkpoint history from API...</p>
        </div>
      )}

      {/* Database Standby State */}
      {listState.state === "UNAVAILABLE" && (
        <div className="p-6 rounded-lg border border-review/40 bg-review/10 text-ink space-y-3">
          <div className="flex items-center space-x-2">
            <Database className="w-5 h-5 text-review" />
            <h4 className="font-semibold text-sm">PostgreSQL Standby: Persistence Unavailable</h4>
          </div>
          <p className="text-xs text-muted">
            {listState.message ||
              "The approval record ledger requires active PostgreSQL database persistence. When the database is in standby mode, historical approvals cannot be queried."}
          </p>
          <div className="pt-2">
            <button
              type="button"
              onClick={() => void loadApprovals()}
              className="px-3 py-1.5 text-xs font-medium rounded bg-review text-white hover:bg-review/90 transition-colors"
            >
              Retry Database Connection
            </button>
          </div>
        </div>
      )}

      {/* Error State */}
      {listState.state === "ERROR" && (
        <div className="p-6 rounded-lg border border-deny/40 bg-deny/10 text-ink space-y-3">
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-5 h-5 text-deny" />
            <h4 className="font-semibold text-sm text-deny">Failed to Load Approval Timeline</h4>
          </div>
          <p className="text-xs text-muted">{listState.message}</p>
          <button
            type="button"
            onClick={() => void loadApprovals()}
            className="px-3 py-1.5 text-xs font-medium rounded bg-deny text-white hover:bg-deny/90 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty State */}
      {listState.state === "EMPTY" && (
        <div className="p-8 rounded-panel border border-dashed border-border bg-surface text-center space-y-3">
          <ShieldCheck className="w-8 h-8 text-muted mx-auto" />
          <h4 className="font-semibold text-sm text-ink">No Approvals Recorded Yet</h4>
          <p className="text-xs text-muted max-w-sm mx-auto">
            Approvals bind tested policy versions to lifetime spend limits. Once an immutable policy version passes verification, approve it in the Approval Checkpoints workstation.
          </p>
        </div>
      )}

      {/* Timeline List */}
      {listState.state === "READY" && (
        <div className="space-y-3">
          {listState.data
            .filter((a) => (filterActiveOnly ? a.status === "ACTIVE" : true))
            .map((approval: ApprovalRecord) => {
              const isSelectedPolicy =
                Boolean(selectedPolicyHash) && approval.policyHash === selectedPolicyHash;
              const percentConsumed =
                approval.spendLimitMinor > 0
                  ? Math.min(
                      100,
                      Math.round(
                        (approval.consumedSpendMinor / approval.spendLimitMinor) * 100,
                      ),
                    )
                  : 0;

              return (
                <div
                  key={approval.id}
                  className={`p-4 rounded-panel border transition-all ${
                    isSelectedPolicy
                      ? "border-accent bg-accent/5 ring-1 ring-accent"
                      : "border-border bg-surface hover:border-muted"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    {/* Top Row: Policy Name & Status */}
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="font-semibold text-sm text-ink">
                          {approval.policyName || `Policy ${approval.policyVersionId.slice(0, 8)}`}
                        </span>

                        {/* Status Badge */}
                        {approval.status === "ACTIVE" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-allow/10 text-allow border border-allow/30">
                            <CheckCircle2 className="w-3 h-3 mr-1" /> ACTIVE
                          </span>
                        )}
                        {approval.status === "EXPIRED" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-review/10 text-review border border-review/30">
                            <Clock className="w-3 h-3 mr-1" /> EXPIRED
                          </span>
                        )}
                        {approval.status === "REVOKED" && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-deny/10 text-deny border border-deny/30">
                            <Ban className="w-3 h-3 mr-1" /> REVOKED
                          </span>
                        )}

                        {isSelectedPolicy && (
                          <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded bg-accent text-white">
                            Selected Version
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-muted flex items-center space-x-2">
                        <span className="font-mono">ID: {approval.id.slice(0, 8)}...</span>
                        <span>•</span>
                        <span>Run: <code className="font-mono text-ink">{approval.qualifyingTestRunId.slice(0, 8)}...</code></span>
                      </div>
                    </div>

                    {/* Revoke Action */}
                    {approval.status === "ACTIVE" && (
                      <button
                        type="button"
                        onClick={() => void handleRevoke(approval.id)}
                        disabled={revokingId === approval.id}
                        className="px-2.5 py-1 text-xs font-semibold rounded border border-deny/30 bg-deny/10 text-deny hover:bg-deny/20 transition-colors disabled:opacity-50 cursor-pointer"
                      >
                        {revokingId === approval.id ? "Revoking..." : "Revoke Approval"}
                      </button>
                    )}
                  </div>

                  {/* Spend Consumption Progress */}
                  <div className="mt-3 pt-3 border-t border-border/60 space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted">Spend Consumption:</span>
                      <span className="font-semibold text-ink">
                        {formatAmount(approval.consumedSpendMinor, approval.currency)} /{" "}
                        {formatAmount(approval.spendLimitMinor, approval.currency)}
                        <span className="text-muted ml-1 font-normal">({percentConsumed}%)</span>
                      </span>
                    </div>

                    <div className="w-full h-1.5 rounded-full bg-border overflow-hidden">
                      <div
                        className={`h-full transition-all duration-300 ${
                          percentConsumed >= 100
                            ? "bg-deny"
                            : percentConsumed >= 75
                            ? "bg-review"
                            : "bg-allow"
                        }`}
                        style={{ width: `${percentConsumed}%` }}
                      />
                    </div>
                  </div>

                  {/* Cryptographic Hash Row */}
                  <div className="mt-3 pt-2.5 border-t border-border/60 flex flex-wrap items-center justify-between gap-1 text-[11px]">
                    <div className="flex items-center space-x-1.5 max-w-full">
                      <span className="text-muted shrink-0">Policy Hash:</span>
                      <code className="font-mono text-ink bg-canvas px-1.5 py-0.5 rounded border border-border overflow-x-auto select-all">
                        {approval.policyHash}
                      </code>
                      <button
                        type="button"
                        onClick={() => handleCopyHash(approval.policyHash)}
                        className="p-1 text-muted hover:text-ink rounded transition-colors"
                        title="Copy 64-char SHA-256 Hash"
                        aria-label="Copy hash"
                      >
                        {copiedHash === approval.policyHash ? (
                          <Check className="w-3.5 h-3.5 text-allow" />
                        ) : (
                          <Copy className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>

                    {/* Expiration or Revocation info */}
                    <div className="flex items-center space-x-2 text-muted">
                      <Calendar className="w-3 h-3 text-muted" />
                      {approval.revokedAt ? (
                        <span className="text-deny font-medium">
                          Revoked on {formatRelativeTime(approval.revokedAt)}
                        </span>
                      ) : (
                        <span>
                          {new Date(approval.expiresAt).getTime() <= Date.now()
                            ? `Expired on ${formatRelativeTime(approval.expiresAt)}`
                            : `Expires ${formatRelativeTime(approval.expiresAt)}`}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Quick-select version button */}
                  {onSelectPolicyVersion && (
                    <div className="mt-2.5 flex justify-end">
                      <button
                        type="button"
                        onClick={() => onSelectPolicyVersion(approval.policyVersionId)}
                        className="text-xs text-accent hover:underline font-medium inline-flex items-center"
                      >
                        Compare this version in Diff View →
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

          {listState.data.filter((a) => (filterActiveOnly ? a.status === "ACTIVE" : true)).length === 0 && (
            <div className="p-6 text-center text-xs text-muted border border-border rounded bg-surface">
              No active approvals found. Toggle "Active only" off to view expired or revoked records.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
