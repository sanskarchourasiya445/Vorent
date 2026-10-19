import { useState, useEffect } from "react";
import type { ApprovalListState, CreateApprovalInput } from "../../types/approval";
import { fetchApprovals, createApproval, revokeApproval } from "../../api/approvalService";
import { AVAILABLE_POLICIES } from "../../api/verificationService";
import {
  FileCheck,
  RefreshCw,
  AlertTriangle,
  AlertCircle,
  PlusCircle,
  ShieldCheck,
  Calendar,
  XCircle,
  Archive,
} from "lucide-react";

export function ApprovalPanel() {
  const [loadState, setLoadState] = useState<ApprovalListState>({ state: "LOADING" });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Form inputs
  const [selectedPolicyId, setSelectedPolicyId] = useState(AVAILABLE_POLICIES[0]?.id || "");
  const [spendLimitDollars, setSpendLimitDollars] = useState("60.00");
  const [expiryHours, setExpiryHours] = useState("72");

  const loadData = async () => {
    setLoadState({ state: "LOADING" });
    const result = await fetchApprovals();
    setLoadState(result);
  };

  useEffect(() => {
    void loadData();
  }, []);

  const handleCreateApproval = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);

    const policy = AVAILABLE_POLICIES.find((p) => p.id === selectedPolicyId) || AVAILABLE_POLICIES[0];
    const spendLimitMinor = Math.round(parseFloat(spendLimitDollars) * 100);

    const input: CreateApprovalInput = {
      policyVersionId: policy.id,
      policyHash: policy.hash,
      qualifyingTestRunId: "run_qualifying_preflight_001",
      spendLimitMinor,
      currency: "USD",
      expiresInHours: parseInt(expiryHours, 10) || 72,
    };

    try {
      await createApproval(input);
      setShowCreateModal(false);
      void loadData();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create approval");
    } finally {
      setCreating(false);
    }
  };

  const handleRevoke = async (approvalId: string) => {
    try {
      await revokeApproval(approvalId);
      void loadData();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to revoke approval");
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto" role="region" aria-label="Approval Checkpoints Workstation">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <FileCheck className="w-6 h-6 text-accent" aria-hidden="true" />
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink">
              Approval Checkpoints
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-muted mt-1">
            Authorizes an exact verified, immutable policy version with an inclusive lifetime spending limit.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loadState.state === "LOADING"}
            className="inline-flex items-center space-x-1 px-3 py-1.5 rounded text-xs font-semibold bg-canvas hover:bg-border/60 text-ink border border-border transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadState.state === "LOADING" ? "animate-spin" : ""}`} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded text-xs font-semibold bg-accent text-white hover:bg-accent/90 transition-colors shadow-sm"
          >
            <PlusCircle className="w-4 h-4" />
            <span>New Approval</span>
          </button>
        </div>
      </div>

      {/* Standby Banner */}
      {loadState.state === "UNAVAILABLE" && (
        <div className="p-4 rounded bg-amber-50 border border-amber-300 text-xs text-amber-950 space-y-2">
          <div className="flex items-center space-x-2 font-semibold">
            <AlertTriangle className="w-4 h-4 text-amber-800 shrink-0" aria-hidden="true" />
            <span>Approval Store Standby</span>
          </div>
          <p className="text-[11px] text-amber-900 leading-relaxed">
            {loadState.message}
          </p>
          <div className="pt-1 flex items-center justify-between">
            <span className="text-[10px] text-amber-800">
              Live approvals will activate once the backend mounts /api/approvals and database is online.
            </span>
            <button
              type="button"
              onClick={() => void loadData()}
              className="px-2.5 py-1 rounded text-xs font-semibold bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-400 transition-colors"
            >
              Retry Connection
            </button>
          </div>
        </div>
      )}

      {/* Error State */}
      {loadState.state === "ERROR" && (
        <div className="p-4 rounded bg-red-50 border border-red-200 text-xs text-red-950 space-y-2">
          <div className="flex items-center space-x-2 font-semibold text-red-900">
            <AlertCircle className="w-4 h-4 text-red-700 shrink-0" aria-hidden="true" />
            <span>Approvals Retrieval Error</span>
          </div>
          <p className="text-[11px] text-red-900 leading-relaxed">
            {loadState.message}
          </p>
          <button
            type="button"
            onClick={() => void loadData()}
            className="px-2.5 py-1 rounded text-xs font-semibold bg-red-100 hover:bg-red-200 text-red-950 border border-red-300 transition-colors"
          >
            Retry
          </button>
        </div>
      )}

      {/* Loading State */}
      {loadState.state === "LOADING" && (
        <div className="py-12 text-center space-y-3" role="status">
          <RefreshCw className="w-6 h-6 animate-spin text-accent mx-auto" aria-hidden="true" />
          <p className="text-xs text-muted">Loading approvals from database...</p>
        </div>
      )}

      {/* Empty State */}
      {loadState.state === "EMPTY" && (
        <div className="py-12 text-center space-y-2 border border-border rounded-panel bg-surface p-6">
          <div className="inline-flex p-3 rounded-full bg-canvas text-muted mb-1">
            <Archive className="w-6 h-6" aria-hidden="true" />
          </div>
          <h4 className="text-sm font-semibold text-ink">No Active Approvals Found</h4>
          <p className="text-xs text-muted max-w-sm mx-auto">
            Zero purchase approvals have been created yet. Click "New Approval" to authorize a verified policy version.
          </p>
        </div>
      )}

      {/* Ready State - Approvals List */}
      {loadState.state === "READY" && (
        <div className="space-y-3">
          {loadState.data.map((approval) => {
            const spendLimitFormatted = (approval.spendLimitMinor / 100).toFixed(2);
            const consumedFormatted = (approval.consumedSpendMinor / 100).toFixed(2);
            const percentUsed = Math.min(
              100,
              Math.round((approval.consumedSpendMinor / Math.max(1, approval.spendLimitMinor)) * 100),
            );

            return (
              <div
                key={approval.id}
                className="p-4 sm:p-5 rounded-panel border border-border bg-surface space-y-3 shadow-xs"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-2.5">
                  <div className="flex items-center space-x-2">
                    <ShieldCheck className="w-4 h-4 text-accent" />
                    <span className="font-mono text-xs font-bold text-ink">{approval.id}</span>
                    <span
                      className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${
                        approval.status === "ACTIVE"
                          ? "bg-emerald-100 text-emerald-950 border border-emerald-300"
                          : approval.status === "EXPIRED"
                          ? "bg-amber-100 text-amber-950 border border-amber-300"
                          : "bg-red-100 text-red-950 border border-red-300"
                      }`}
                    >
                      {approval.status}
                    </span>
                  </div>

                  {approval.status === "ACTIVE" && (
                    <button
                      type="button"
                      onClick={() => void handleRevoke(approval.id)}
                      className="inline-flex items-center space-x-1 px-2.5 py-1 rounded text-[11px] font-semibold text-red-700 hover:text-red-900 hover:bg-red-50 border border-red-200 transition-colors self-start sm:self-auto"
                    >
                      <XCircle className="w-3.5 h-3.5" />
                      <span>Revoke</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-[11px] text-muted">Bound Policy Version:</span>
                    <div className="font-semibold text-ink">{approval.policyName || approval.policyVersionId}</div>
                    <div className="font-mono text-[10px] text-muted truncate" title={approval.policyHash}>
                      Hash: {approval.policyHash}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-muted">Lifetime Budget Cap:</span>
                      <span className="font-mono font-bold text-ink">
                        ${consumedFormatted} / ${spendLimitFormatted} {approval.currency}
                      </span>
                    </div>
                    <div className="w-full bg-canvas rounded-full h-2 mt-1 border border-border overflow-hidden">
                      <div
                        className="bg-accent h-2 rounded-full transition-all"
                        style={{ width: `${percentUsed}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="text-[10px] text-muted flex flex-wrap items-center gap-x-4 pt-1 border-t border-border">
                  <span className="flex items-center space-x-1">
                    <Calendar className="w-3 h-3 text-muted" />
                    <span>Created: {new Date(approval.createdAt).toLocaleDateString()}</span>
                  </span>
                  <span>Expires: {new Date(approval.expiresAt).toLocaleString()}</span>
                  {approval.qualifyingTestRunId && (
                    <span className="font-mono">Qualifying Run: {approval.qualifyingTestRunId}</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-surface border border-border rounded-panel p-6 max-w-md w-full space-y-4 shadow-lg">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-sm text-ink">Create Policy Approval</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-muted hover:text-ink text-sm font-bold"
              >
                ✕
              </button>
            </div>

            {createError && (
              <div className="p-3 rounded bg-red-50 border border-red-200 text-xs text-red-900">
                {createError}
              </div>
            )}

            <form onSubmit={(e) => void handleCreateApproval(e)} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-muted uppercase mb-1">
                  Target Policy Version
                </label>
                <select
                  value={selectedPolicyId}
                  onChange={(e) => setSelectedPolicyId(e.target.value)}
                  className="w-full rounded border border-border bg-canvas px-3 py-1.5 text-xs text-ink"
                >
                  {AVAILABLE_POLICIES.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.id} v{p.version})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-muted uppercase mb-1">
                  Lifetime Spend Limit (USD)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="1.00"
                  max="10000.00"
                  value={spendLimitDollars}
                  onChange={(e) => setSpendLimitDollars(e.target.value)}
                  className="w-full rounded border border-border bg-canvas px-3 py-1.5 text-xs text-ink font-mono"
                  required
                />
                <span className="text-[10px] text-muted">
                  Cumulative cap across all checkout orders under this approval.
                </span>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-muted uppercase mb-1">
                  Authorization Expiry (Hours)
                </label>
                <input
                  type="number"
                  min="1"
                  max="720"
                  value={expiryHours}
                  onChange={(e) => setExpiryHours(e.target.value)}
                  className="w-full rounded border border-border bg-canvas px-3 py-1.5 text-xs text-ink font-mono"
                  required
                />
              </div>

              <div className="pt-3 flex justify-end space-x-2 border-t border-border">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-3 py-1.5 rounded text-xs font-medium text-muted hover:text-ink border border-border"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-1.5 rounded text-xs font-semibold bg-accent text-white hover:bg-accent/90 disabled:opacity-50"
                >
                  {creating ? "Authorizing..." : "Create Approval"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
