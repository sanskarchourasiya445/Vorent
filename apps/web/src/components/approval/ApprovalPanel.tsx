import { useState, useEffect, useCallback } from "react";
import type { ApprovalListState, CreateApprovalInput, ApprovalRecord } from "../../types/approval";
import type { SavedVerificationRunSummary, PersistenceLoadState } from "../../types/persistence";
import { fetchApprovals, createApproval, revokeApproval } from "../../api/approvalService";
import { fetchSavedVerificationRuns } from "../../api/persistenceService";
import { AVAILABLE_POLICIES } from "../../api/verificationService";
import {
  FileCheck,
  RefreshCw,
  AlertTriangle,
  PlusCircle,
  ShieldCheck,
  Calendar,
  XCircle,
  Database,
} from "lucide-react";

export function ApprovalPanel() {
  const [loadState, setLoadState] = useState<ApprovalListState>({ state: "LOADING" });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [revokeError, setRevokeError] = useState<string | null>(null);

  // Saved verification runs state for qualifying run selection
  const [runsState, setRunsState] = useState<PersistenceLoadState<SavedVerificationRunSummary[]>>({
    state: "IDLE",
  });
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [useManualRun, setUseManualRun] = useState<boolean>(false);
  const [manualRunId, setManualRunId] = useState<string>("");
  const [manualPolicyId, setManualPolicyId] = useState<string>(AVAILABLE_POLICIES[0]?.id || "");

  // Form limits
  const [spendLimitDollars, setSpendLimitDollars] = useState("60.00");
  const [expiryHours, setExpiryHours] = useState("72");

  const loadData = useCallback(async () => {
    setLoadState({ state: "LOADING" });
    const result = await fetchApprovals();
    setLoadState(result);
  }, []);

  const loadRuns = useCallback(async () => {
    setRunsState({ state: "LOADING" });
    const result = await fetchSavedVerificationRuns();
    setRunsState(result);
    if (result.state === "READY" && result.data.length > 0) {
      // Pick first completed run by default
      const completedRun = result.data.find((r) => r.status === "COMPLETED") || result.data[0];
      setSelectedRunId(completedRun.runId);
      setUseManualRun(false);
    } else {
      setUseManualRun(true);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleOpenCreateModal = () => {
    setShowCreateModal(true);
    setCreateError(null);
    void loadRuns();
  };

  // Derive authoritative run data
  const selectedRun =
    runsState.state === "READY"
      ? runsState.data.find((r) => r.runId === selectedRunId) || null
      : null;

  const effectiveRunId = useManualRun ? manualRunId.trim() : (selectedRun?.runId || "");
  const effectivePolicyId = useManualRun
    ? manualPolicyId
    : (selectedRun?.policyVersionId || "");
  const effectivePolicyHash = useManualRun
    ? (AVAILABLE_POLICIES.find((p) => p.id === manualPolicyId)?.hash || "")
    : (selectedRun?.policyHash || "");
  const effectivePolicyName = useManualRun
    ? (AVAILABLE_POLICIES.find((p) => p.id === manualPolicyId)?.name || manualPolicyId)
    : (selectedRun?.policyName || AVAILABLE_POLICIES.find((p) => p.id === selectedRun?.policyVersionId)?.name || selectedRun?.policyVersionId || "");

  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const isSpendValid = !isNaN(parseFloat(spendLimitDollars)) && parseFloat(spendLimitDollars) > 0;
  const isRunValid = useManualRun ? UUID_REGEX.test(manualRunId.trim()) : Boolean(effectiveRunId.length > 0);
  const isFormValid = isRunValid && isSpendValid && Boolean(effectivePolicyId && effectivePolicyHash);

  const handleCreateApproval = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isFormValid) return;

    setCreating(true);
    setCreateError(null);

    const spendLimitMinor = Math.round(parseFloat(spendLimitDollars) * 100);

    const input: CreateApprovalInput = {
      policyVersionId: effectivePolicyId,
      policyHash: effectivePolicyHash,
      qualifyingTestRunId: effectiveRunId,
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
    setRevokeError(null);
    try {
      await revokeApproval(approvalId);
      void loadData();
    } catch (err) {
      setRevokeError(err instanceof Error ? err.message : "Failed to revoke approval");
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
            onClick={handleOpenCreateModal}
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
              Retry Database Connection
            </button>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {loadState.state === "ERROR" && (
        <div className="p-4 rounded bg-red-50 border border-red-200 text-xs text-red-900 space-y-1">
          <div className="flex items-center space-x-2 font-semibold">
            <XCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>Failed to Retrieve Approvals</span>
          </div>
          <p className="text-[11px] text-red-800">{loadState.message}</p>
        </div>
      )}

      {/* Revocation Error Banner */}
      {revokeError && (
        <div className="p-4 rounded bg-red-50 border border-red-200 text-xs text-red-900 space-y-1">
          <div className="flex items-center space-x-2 font-semibold">
            <XCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>Approval Revocation Failed</span>
          </div>
          <p className="text-[11px] text-red-800">{revokeError}</p>
        </div>
      )}

      {/* Empty State */}
      {loadState.state === "EMPTY" && (
        <div className="p-8 text-center border border-dashed border-border rounded-panel bg-surface space-y-3">
          <ShieldCheck className="w-8 h-8 text-muted mx-auto" />
          <h3 className="font-semibold text-sm text-ink">No Active Approvals Found</h3>
          <p className="text-xs text-muted max-w-sm mx-auto">
            Create an approval checkpoint to authorize payments against an exact verified policy version.
          </p>
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="px-3 py-1.5 text-xs font-semibold rounded bg-accent text-white hover:bg-accent/90"
          >
            Create Initial Approval
          </button>
        </div>
      )}

      {/* Loading State */}
      {loadState.state === "LOADING" && (
        <div className="p-8 text-center border border-border rounded-panel bg-surface space-y-2">
          <RefreshCw className="w-6 h-6 animate-spin text-accent mx-auto" />
          <p className="text-xs text-muted">Retrieving approval checkpoints from ledger...</p>
        </div>
      )}

      {/* Approvals Cards */}
      {loadState.state === "READY" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {loadState.data.map((approval: ApprovalRecord) => {
            const percentUsed =
              approval.spendLimitMinor > 0
                ? Math.min(100, Math.round((approval.consumedSpendMinor / approval.spendLimitMinor) * 100))
                : 0;

            return (
              <div
                key={approval.id}
                className="p-5 rounded-panel border border-border bg-surface space-y-3 shadow-sm hover:border-accent/40 transition-colors"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="space-y-1">
                    <div className="flex items-center space-x-2">
                      <span className="font-bold text-sm text-ink">
                        {approval.policyName || approval.policyVersionId}
                      </span>
                      {approval.status === "ACTIVE" && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                          ACTIVE
                        </span>
                      )}
                      {approval.status === "EXPIRED" && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                          EXPIRED
                        </span>
                      )}
                      {approval.status === "REVOKED" && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-800 border border-red-300">
                          REVOKED
                        </span>
                      )}
                    </div>
                    <div className="font-mono text-[11px] text-muted">
                      Hash: {approval.policyHash.slice(0, 16)}...
                    </div>
                  </div>

                  {approval.status === "ACTIVE" && (
                    <button
                      type="button"
                      onClick={() => void handleRevoke(approval.id)}
                      className="px-2 py-1 rounded text-[11px] font-semibold text-red-800 bg-red-50 hover:bg-red-100 border border-red-200 transition-colors"
                    >
                      Revoke
                    </button>
                  )}
                </div>

                <div className="p-3 rounded bg-canvas border border-border space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted">Spend Consumed:</span>
                    <span className="font-mono font-bold text-ink">
                      ${(approval.consumedSpendMinor / 100).toFixed(2)} / ${(approval.spendLimitMinor / 100).toFixed(2)}{" "}
                      {approval.currency}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[10px] text-muted">
                      <span>Limit Utilization</span>
                      <span>{percentUsed}%</span>
                    </div>
                    <div className="w-full bg-border h-2 rounded-full overflow-hidden">
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
          <div className="bg-surface border border-border rounded-panel p-6 max-w-lg w-full space-y-4 shadow-lg">
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

            <form onSubmit={(e) => void handleCreateApproval(e)} className="space-y-4 text-xs">
              {/* Section 1: Qualifying Verification Run */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block text-[11px] font-semibold text-muted uppercase">
                    Qualifying Verification Run
                  </label>
                  <button
                    type="button"
                    onClick={() => setUseManualRun(!useManualRun)}
                    className="text-[11px] text-accent hover:underline font-medium"
                  >
                    {useManualRun ? "← Select Saved Run" : "Enter Run ID Manually →"}
                  </button>
                </div>

                {runsState.state === "LOADING" && (
                  <div className="p-3 rounded border border-border bg-canvas text-xs text-muted flex items-center space-x-2">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-accent" />
                    <span>Querying saved verification runs from persistence API...</span>
                  </div>
                )}

                {runsState.state === "UNAVAILABLE" && !useManualRun && (
                  <div className="p-3 rounded border border-amber-300 bg-amber-50 text-amber-900 text-xs space-y-1">
                    <div className="font-semibold flex items-center space-x-1.5">
                      <Database className="w-3.5 h-3.5 text-amber-700" />
                      <span>Persistence Standby</span>
                    </div>
                    <p className="text-[11px] text-amber-800">
                      Saved verification runs are currently unavailable because PostgreSQL is in standby mode.
                      Please use manual entry below to specify the qualifying test run ID.
                    </p>
                  </div>
                )}

                {!useManualRun && runsState.state === "READY" && runsState.data.length > 0 && (
                  <div className="space-y-2">
                    <select
                      value={selectedRunId}
                      onChange={(e) => setSelectedRunId(e.target.value)}
                      className="w-full rounded border border-border bg-canvas px-3 py-1.5 text-xs text-ink font-mono"
                    >
                      {runsState.data.map((r) => (
                        <option key={r.runId} value={r.runId}>
                          {r.runId.slice(0, 8)}... | {r.policyName || r.policyVersionId} | {r.status} ({r.findingCount} findings)
                        </option>
                      ))}
                    </select>

                    {selectedRun && (
                      <div className="p-2.5 rounded border border-accent/30 bg-accent/5 space-y-1 text-[11px]">
                        <div className="flex items-center justify-between font-semibold text-ink">
                          <span>Authoritative Run Binding:</span>
                          <span className="text-emerald-700 font-bold">{selectedRun.status}</span>
                        </div>
                        <div className="text-muted">
                          Policy Version: <span className="font-mono text-ink">{selectedRun.policyVersionId}</span>
                        </div>
                        <div className="text-muted truncate">
                          Policy Hash: <span className="font-mono text-ink">{selectedRun.policyHash}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {!useManualRun && runsState.state === "EMPTY" && (
                  <div className="p-3 rounded border border-dashed border-border bg-canvas text-center text-xs text-muted space-y-1">
                    <p>No saved verification runs found on server.</p>
                    <button
                      type="button"
                      onClick={() => setUseManualRun(true)}
                      className="text-xs text-accent font-semibold underline"
                    >
                      Enter Run ID Manually
                    </button>
                  </div>
                )}

                {useManualRun && (
                  <div className="space-y-3 p-3.5 rounded border border-amber-300 bg-amber-50/70 text-amber-950">
                    <div className="flex items-center space-x-1.5 font-semibold text-xs text-amber-900">
                      <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                      <span>Manual Entry Fallback (Unverified Run ID)</span>
                    </div>
                    <p className="text-[11px] text-amber-900 leading-relaxed">
                      <strong>Server Authority Notice:</strong> Supplying a run ID manually does not verify qualification in the client. The backend server remains strictly authoritative and will reject approval creation if the test run does not exist, did not complete with zero policy loopholes, or does not match the exact cryptographic hash of the policy version.
                    </p>

                    <div>
                      <label className="block text-[10px] font-semibold text-muted uppercase mb-1">
                        Qualifying Test Run UUID (Required)
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                        value={manualRunId}
                        onChange={(e) => setManualRunId(e.target.value)}
                        className="w-full rounded border border-border bg-surface px-3 py-1.5 text-xs text-ink font-mono"
                        required
                      />
                      {manualRunId.trim().length > 0 && !UUID_REGEX.test(manualRunId.trim()) && (
                        <span className="text-[10px] text-red-600 block mt-1 font-medium">
                          Must be a valid UUID format (8-4-4-4-12 hex characters).
                        </span>
                      )}
                    </div>

                    <div>
                      <label className="block text-[10px] font-semibold text-muted uppercase mb-1">
                        Bound Policy Version
                      </label>
                      <select
                        value={manualPolicyId}
                        onChange={(e) => setManualPolicyId(e.target.value)}
                        className="w-full rounded border border-border bg-surface px-3 py-1.5 text-xs text-ink"
                      >
                        {AVAILABLE_POLICIES.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.id})
                          </option>
                        ))}
                      </select>
                    </div>

                    {effectivePolicyHash && (
                      <div className="text-[10px] text-muted font-mono truncate space-y-0.5 pt-1 border-t border-amber-200">
                        <div>Policy: <span className="text-ink font-sans">{effectivePolicyName}</span></div>
                        <div>Hash: {effectivePolicyHash}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Section 2: Lifetime Spend Limit */}
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

              {/* Section 3: Expiry Hours */}
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

              <div className="pt-3 flex items-center justify-between border-t border-border">
                <span className="text-[11px] text-muted">
                  {!isRunValid
                    ? useManualRun
                      ? "Valid run UUID required"
                      : "Run selection required"
                    : !isSpendValid
                    ? "Valid spend required"
                    : "Ready to authorize"}
                </span>

                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowCreateModal(false)}
                    className="px-3 py-1.5 rounded text-xs font-medium text-muted hover:text-ink border border-border"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating || !isFormValid}
                    className="px-4 py-1.5 rounded text-xs font-semibold bg-accent text-white hover:bg-accent/90 disabled:opacity-50 transition-colors shadow-sm"
                  >
                    {creating ? "Authorizing..." : "Create Approval"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
