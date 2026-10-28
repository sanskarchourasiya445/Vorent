import { useState, useEffect, useCallback } from "react";
import type { ApprovalListState, CreateApprovalInput, ApprovalRecord } from "../../types/approval";
import type { SavedVerificationRunSummary, PersistenceLoadState } from "../../types/persistence";
import { fetchApprovals, createApproval, revokeApproval } from "../../api/approvalService";
import { fetchSavedVerificationRuns } from "../../api/persistenceService";
import { AVAILABLE_POLICIES } from "../../api/verificationService";
import { useFocusTrap } from "../../hooks/useFocusTrap";
import { StatusBadge } from "../ui/StatusBadge";
import { HashBadge } from "../ui/HashBadge";
import { EmptyState } from "../ui/EmptyState";
import { SkeletonApprovalList } from "../ui/Skeleton";
import {
  FileCheck,
  RefreshCw,
  AlertTriangle,
  PlusCircle,
  Calendar,
  XCircle,
  Database,
  X,
  AlertOctagon,
} from "lucide-react";

export function ApprovalPanel() {
  const [loadState, setLoadState] = useState<ApprovalListState>({ state: "LOADING" });
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [confirmingRevokeApproval, setConfirmingRevokeApproval] = useState<ApprovalRecord | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
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

  // Focus traps for modals
  const createModalRef = useFocusTrap(showCreateModal, () => setShowCreateModal(false));
  const revokeModalRef = useFocusTrap(Boolean(confirmingRevokeApproval), () => setConfirmingRevokeApproval(null));

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

  const handleConfirmRevoke = async () => {
    if (!confirmingRevokeApproval) return;
    setIsRevoking(true);
    setRevokeError(null);
    try {
      await revokeApproval(confirmingRevokeApproval.id);
      setConfirmingRevokeApproval(null);
      void loadData();
    } catch (err) {
      setRevokeError(err instanceof Error ? err.message : "Failed to revoke approval");
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <div className="space-y-6 w-full" role="region" aria-label="Approval Checkpoints Workstation">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <FileCheck className="w-4 h-4 text-primary" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-serif font-semibold tracking-tight text-ink">
                Approval Checkpoints
              </h1>
              <p className="text-xs text-muted mt-0.5 font-sans leading-relaxed">
                Authorizes an exact verified, immutable policy version with an inclusive lifetime spending limit.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2 self-start sm:self-auto font-sans">
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loadState.state === "LOADING"}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-sans font-medium border border-border bg-surface hover:bg-surface-subtle text-ink transition-colors disabled:opacity-50 shadow-2xs focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadState.state === "LOADING" ? "animate-spin text-primary" : "text-muted"}`} />
            <span>Refresh</span>
          </button>
          <button
            type="button"
            onClick={handleOpenCreateModal}
            className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded-md text-xs font-sans font-semibold bg-primary text-white hover:bg-primary-hover active:bg-primary-active transition-colors shadow-2xs focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
          >
            <PlusCircle className="w-3.5 h-3.5" />
            <span>New Approval</span>
          </button>
        </div>
      </div>

      {/* Standby Banner */}
      {loadState.state === "UNAVAILABLE" && (
        <div className="p-4 rounded-lg bg-warning/10 border border-warning/30 text-xs text-ink space-y-2 font-sans">
          <div className="flex items-center space-x-2 font-semibold text-warning">
            <AlertTriangle className="w-4 h-4 text-warning shrink-0" aria-hidden="true" />
            <span>Approval Store Standby</span>
          </div>
          <p className="text-[11px] text-muted leading-relaxed font-sans">
            {loadState.message}
          </p>
          <div className="pt-1 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <span className="text-[10px] text-muted font-mono">
              Live approvals will activate once the backend mounts /api/approvals and database is online.
            </span>
            <button
              type="button"
              onClick={() => void loadData()}
              className="px-2.5 py-1 rounded text-xs font-semibold bg-warning/20 hover:bg-warning/30 text-ink border border-warning/40 transition-colors self-start sm:self-auto cursor-pointer"
            >
              Retry Database Connection
            </button>
          </div>
        </div>
      )}

      {/* Error Banner */}
      {loadState.state === "ERROR" && (
        <div className="p-4 rounded-lg bg-deny/10 border border-deny/30 text-xs text-deny space-y-1 font-mono">
          <div className="flex items-center space-x-2 font-semibold">
            <XCircle className="w-4 h-4 text-deny shrink-0" />
            <span>Failed to Retrieve Approvals</span>
          </div>
          <p className="text-[11px] text-muted font-sans">{loadState.message}</p>
        </div>
      )}

      {/* Revocation Error Banner */}
      {revokeError && (
        <div className="p-4 rounded-lg bg-deny/10 border border-deny/30 text-xs text-deny space-y-1 font-mono">
          <div className="flex items-center space-x-2 font-semibold">
            <XCircle className="w-4 h-4 text-deny shrink-0" />
            <span>Approval Revocation Failed</span>
          </div>
          <p className="text-[11px] text-muted font-sans">{revokeError}</p>
        </div>
      )}

      {/* Empty State */}
      {loadState.state === "EMPTY" && (
        <EmptyState
          icon={<FileCheck className="w-6 h-6 mx-auto" />}
          title="No Active Approvals Found"
          description="Create an approval checkpoint to authorize payments against an exact verified policy version."
          action={{
            label: "Create Initial Approval",
            onClick: handleOpenCreateModal,
          }}
        />
      )}

      {/* Loading State */}
      {loadState.state === "LOADING" && (
        <div className="space-y-4">
          <div className="p-3 rounded-lg border border-border bg-surface text-center text-xs text-muted font-mono flex items-center justify-center space-x-2.5">
            <RefreshCw className="w-4 h-4 animate-spin text-accent" />
            <p>Retrieving approval checkpoints from ledger...</p>
          </div>
          <SkeletonApprovalList count={2} />
        </div>
      )}

      {/* Approvals Cards */}
      {loadState.state === "READY" && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {loadState.data.map((approval: ApprovalRecord) => {
            const percentUsed =
              approval.spendLimitMinor > 0
                ? Math.min(100, Math.round((approval.consumedSpendMinor / approval.spendLimitMinor) * 100))
                : 0;
            const remainingMinor = Math.max(0, approval.spendLimitMinor - approval.consumedSpendMinor);

            return (
              <div
                key={approval.id}
                className="flex flex-col justify-between h-full p-5 rounded border border-border bg-surface shadow-2xs hover:border-accent/40 transition-colors min-w-0"
              >
                <div className="flex items-start justify-between gap-3 min-w-0">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <span
                        className="font-bold text-sm text-ink truncate min-w-0 max-w-full"
                        title={approval.policyName || approval.policyVersionId}
                      >
                        {approval.policyName || approval.policyVersionId}
                      </span>
                      <StatusBadge status={approval.status} size="sm" />
                    </div>
                    <div className="font-mono text-[11px] text-muted flex flex-wrap items-center gap-1.5 min-w-0">
                      <span>Hash:</span>
                      <HashBadge hash={approval.policyHash} prefixLength={8} suffixLength={4} showCopy={false} />
                    </div>
                  </div>

                  {approval.status === "ACTIVE" && (
                    <button
                      type="button"
                      onClick={() => setConfirmingRevokeApproval(approval)}
                      className="px-2.5 py-1 rounded text-[11px] font-mono font-semibold text-deny bg-deny/10 hover:bg-deny/20 border border-deny/30 transition-colors focus:outline-none focus:ring-2 focus:ring-deny/30 cursor-pointer shrink-0"
                    >
                      Revoke
                    </button>
                  )}
                </div>

                <div className="my-3.5 p-3 rounded bg-surface-inset border border-border space-y-2.5 flex-1 min-w-0">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted font-medium">Spend Consumed:</span>
                    <span className="font-mono font-bold text-ink tabular-nums">
                      ${(approval.consumedSpendMinor / 100).toFixed(2)} / ${(approval.spendLimitMinor / 100).toFixed(2)}{" "}
                      {approval.currency}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px] text-muted font-mono">
                      <span>Headroom: ${(remainingMinor / 100).toFixed(2)} {approval.currency}</span>
                      <span className="font-semibold text-ink tabular-nums">{percentUsed}%</span>
                    </div>
                    <div className="w-full bg-surface-inset border border-border/60 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          percentUsed >= 90 ? "bg-deny" : percentUsed >= 70 ? "bg-warning" : "bg-allow"
                        }`}
                        style={{ width: `${percentUsed}%` }}
                      />
                    </div>
                  </div>
                </div>

                <div className="text-[11px] text-muted flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-2.5 border-t border-border mt-auto min-w-0">
                  <span className="flex items-center space-x-1 shrink-0">
                    <Calendar className="w-3 h-3 text-muted shrink-0" />
                    <span>Created: {new Date(approval.createdAt).toLocaleDateString()}</span>
                  </span>
                  <span className="shrink-0">Expires: {new Date(approval.expiresAt).toLocaleDateString()}</span>
                  {approval.qualifyingTestRunId && (
                    <span className="font-mono flex items-center gap-1 min-w-0">
                      <span className="text-muted shrink-0">Run:</span>
                      <HashBadge hash={approval.qualifyingTestRunId} prefixLength={8} suffixLength={4} showCopy={false} />
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Revocation Confirmation Dialog */}
      {confirmingRevokeApproval && (
        <div data-lenis-prevent className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-xs p-4 overflow-y-auto">
          <div
            ref={revokeModalRef}
            data-lenis-prevent
            role="dialog"
            aria-modal="true"
            aria-labelledby="revoke-modal-title"
            tabIndex={-1}
            className="bg-surface border border-border rounded p-6 max-w-md w-full space-y-4 shadow-xl focus:outline-none my-auto"
          >
            <div className="flex items-center space-x-2.5 pb-2 border-b border-border">
              <div className="w-8 h-8 rounded bg-deny/10 border border-deny/30 flex items-center justify-center shrink-0">
                <AlertOctagon className="w-4 h-4 text-deny" aria-hidden="true" />
              </div>
              <h3 id="revoke-modal-title" className="font-bold text-sm text-ink font-sans">
                Confirm Checkpoint Revocation
              </h3>
            </div>

            <div className="space-y-3 text-xs">
              <p className="text-ink leading-relaxed">
                Are you sure you want to permanently revoke authorization for{" "}
                <strong>{confirmingRevokeApproval.policyName || confirmingRevokeApproval.policyVersionId}</strong>?
              </p>
              <div className="p-3 rounded bg-surface-inset border border-border space-y-1 font-mono text-[11px]">
                <div className="text-muted">
                  Checkpoint ID: <span className="text-ink">{confirmingRevokeApproval.id}</span>
                </div>
                <div className="text-muted">
                  Spend Consumed:{" "}
                  <span className="text-ink font-semibold tabular-nums">
                    ${(confirmingRevokeApproval.consumedSpendMinor / 100).toFixed(2)} / ${(confirmingRevokeApproval.spendLimitMinor / 100).toFixed(2)} {confirmingRevokeApproval.currency}
                  </span>
                </div>
              </div>
              <p className="text-deny text-[11px] font-mono leading-relaxed">
                Notice: Revocation is immediate and irreversible. It records an APPROVAL_REVOKED audit event and instantly blocks subsequent checkout nonce issuances.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-end space-x-2 border-t border-border">
              <button
                type="button"
                onClick={() => setConfirmingRevokeApproval(null)}
                disabled={isRevoking}
                className="px-3.5 py-1.5 rounded text-xs font-mono font-medium text-muted hover:text-ink border border-border bg-surface-inset hover:bg-surface-raised transition-colors shadow-2xs"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmRevoke()}
                disabled={isRevoking}
                className="inline-flex items-center space-x-1.5 px-3.5 py-1.5 rounded text-xs font-mono font-semibold bg-deny text-white hover:bg-deny/90 active:bg-deny/80 disabled:opacity-50 transition-colors shadow-2xs focus:outline-none focus:ring-2 focus:ring-deny/30"
              >
                {isRevoking && <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />}
                <span>{isRevoking ? "Revoking..." : "Confirm Revocation"}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div
          data-lenis-prevent
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-xs p-4 overflow-y-auto"
        >
          <div
            ref={createModalRef}
            data-lenis-prevent
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-approval-modal-title"
            tabIndex={-1}
            className="bg-surface border border-border rounded p-6 max-w-lg w-full space-y-4 shadow-xl focus:outline-none my-auto"
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 id="create-approval-modal-title" className="font-bold text-sm text-ink font-sans">
                Create Policy Approval Checkpoint
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1 rounded text-muted hover:text-ink hover:bg-surface-raised transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-accent/30"
                aria-label="Close dialog"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {createError && (
              <div className="p-3 rounded-lg bg-deny/10 border border-deny/30 text-xs text-deny font-mono">
                {createError}
              </div>
            )}

            <form onSubmit={(e) => void handleCreateApproval(e)} className="space-y-4 text-xs">
              {/* Section 1: Qualifying Verification Run */}
              <div className="space-y-2 font-sans">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-semibold text-ink">
                    Qualifying Verification Run
                  </label>
                  <button
                    type="button"
                    onClick={() => setUseManualRun(!useManualRun)}
                    className="text-[11px] text-accent hover:underline font-sans font-medium cursor-pointer"
                  >
                    {useManualRun ? "← Select Saved Run" : "Enter Run ID Manually →"}
                  </button>
                </div>

                {runsState.state === "LOADING" && (
                  <div className="p-3 rounded border border-border bg-surface-inset text-xs text-muted flex items-center space-x-2 font-mono">
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-accent" />
                    <span>Querying saved verification runs from persistence API...</span>
                  </div>
                )}

                {runsState.state === "UNAVAILABLE" && !useManualRun && (
                  <div className="p-3 rounded-lg border border-warning/30 bg-warning/10 text-ink text-xs space-y-1 font-mono">
                    <div className="font-semibold flex items-center space-x-1.5 text-warning">
                      <Database className="w-3.5 h-3.5 text-warning" />
                      <span>Persistence Standby</span>
                    </div>
                    <p className="text-[11px] text-muted leading-relaxed font-sans">
                      Saved verification runs are currently unavailable because PostgreSQL is in standby mode.
                      Please use manual entry below to specify the qualifying test run ID.
                    </p>
                  </div>
                )}

                {!useManualRun && runsState.state === "READY" && runsState.data.length > 0 && (
                  <div className="space-y-2">
                    <select
                      id="selected-run-id"
                      name="selectedRunId"
                      aria-label="Select qualifying verification run"
                      value={selectedRunId}
                      onChange={(e) => setSelectedRunId(e.target.value)}
                      className="w-full rounded border border-border bg-surface-inset px-3 py-1.5 text-xs text-ink font-mono focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
                    >
                      {runsState.data.map((r) => (
                        <option key={r.runId} value={r.runId}>
                          {r.runId.slice(0, 8)}... | {r.policyName || r.policyVersionId} | {r.status} ({r.findingCount} findings)
                        </option>
                      ))}
                    </select>

                    {selectedRun && (
                      <div className="p-2.5 rounded border border-accent/30 bg-accent/5 space-y-1 text-[11px] font-mono">
                        <div className="flex items-center justify-between font-semibold text-ink">
                          <span>Authoritative Run Binding:</span>
                          <span className="text-allow font-bold">{selectedRun.status}</span>
                        </div>
                        <div className="text-muted">
                          Policy Version: <span className="text-ink">{selectedRun.policyVersionId}</span>
                        </div>
                        <div className="text-muted truncate">
                          Policy Hash: <span className="text-ink">{selectedRun.policyHash}</span>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {!useManualRun && runsState.state === "EMPTY" && (
                  <div className="p-3 rounded border border-dashed border-border bg-surface-inset text-center text-xs text-muted space-y-1 font-mono">
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
                  <div className="space-y-3 p-3.5 rounded-lg border border-warning/30 bg-warning/10 text-ink font-mono">
                    <div className="flex items-center space-x-1.5 font-semibold text-xs text-warning">
                      <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
                      <span>Manual Entry Fallback (Unverified Run ID)</span>
                    </div>
                    <p className="text-[11px] text-muted leading-relaxed font-sans">
                      <strong>Server Authority Notice:</strong> Supplying a run ID manually does not verify qualification in the client. The backend server remains strictly authoritative and will reject approval creation if the test run does not exist, did not complete with zero policy loopholes, or does not match the exact cryptographic hash of the policy version.
                    </p>

                    <div>
                      <label htmlFor="manual-run-id" className="block text-xs font-semibold text-ink font-sans mb-1">
                        Qualifying Test Run UUID (Required)
                      </label>
                      <input
                        id="manual-run-id"
                        name="manualRunId"
                        type="text"
                        placeholder="e.g. 550e8400-e29b-41d4-a716-446655440000"
                        value={manualRunId}
                        onChange={(e) => setManualRunId(e.target.value)}
                        className="w-full rounded border border-border bg-surface px-3 py-1.5 text-xs text-ink font-mono focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
                        required
                      />
                      {manualRunId.trim().length > 0 && !UUID_REGEX.test(manualRunId.trim()) && (
                        <span className="text-[10px] text-deny block mt-1 font-medium font-sans">
                          Must be a valid UUID format (8-4-4-4-12 hex characters).
                        </span>
                      )}
                    </div>

                    <div>
                      <label htmlFor="manual-policy-id" className="block text-xs font-semibold text-ink font-sans mb-1">
                        Bound Policy Version
                      </label>
                      <select
                        id="manual-policy-id"
                        name="manualPolicyId"
                        value={manualPolicyId}
                        onChange={(e) => setManualPolicyId(e.target.value)}
                        className="w-full rounded border border-border bg-surface px-3 py-1.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all font-sans cursor-pointer"
                      >
                        {AVAILABLE_POLICIES.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name} ({p.id})
                          </option>
                        ))}
                      </select>
                    </div>

                    {effectivePolicyHash && (
                      <div className="text-[10px] text-muted font-mono truncate space-y-0.5 pt-1 border-t border-warning/30">
                        <div>Policy: <span className="text-ink font-sans font-medium">{effectivePolicyName}</span></div>
                        <div>Hash: {effectivePolicyHash}</div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Sections 2 & 3: Financial Parameters (Lifetime Spend Limit & Expiry Hours side-by-side) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 font-sans">
                <div>
                  <label htmlFor="spend-limit-dollars" className="block text-xs font-semibold text-ink mb-1">
                    Lifetime Spend Limit (USD)
                  </label>
                  <input
                    id="spend-limit-dollars"
                    name="spendLimitDollars"
                    type="number"
                    step="0.01"
                    min="1.00"
                    max="10000.00"
                    value={spendLimitDollars}
                    onChange={(e) => setSpendLimitDollars(e.target.value)}
                    className="w-full rounded border border-border bg-surface-inset px-3 py-1.5 text-xs text-ink font-mono focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
                    required
                  />
                  <span className="text-[10px] text-muted">
                    Cumulative cap across all checkout orders.
                  </span>
                </div>

                <div>
                  <label htmlFor="expiry-hours" className="block text-xs font-semibold text-ink mb-1">
                    Authorization Expiry (Hours)
                  </label>
                  <input
                    id="expiry-hours"
                    name="expiryHours"
                    type="number"
                    min="1"
                    max="720"
                    value={expiryHours}
                    onChange={(e) => setExpiryHours(e.target.value)}
                    className="w-full rounded border border-border bg-surface-inset px-3 py-1.5 text-xs text-ink font-mono focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
                    required
                  />
                  <span className="text-[10px] text-muted">
                    Window duration for active execution.
                  </span>
                </div>
              </div>

              <div className="pt-3 flex items-center justify-between border-t border-border">
                <span className="text-[11px] font-mono text-muted">
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
                    className="px-3 py-1.5 rounded text-xs font-mono font-medium text-muted hover:text-ink border border-border bg-surface-inset hover:bg-surface-raised transition-colors shadow-2xs"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={creating || !isFormValid}
                    className="px-4 py-1.5 rounded text-xs font-mono font-semibold bg-accent text-white hover:bg-accent/90 active:bg-accent/80 disabled:opacity-50 transition-colors shadow-2xs focus:outline-none focus:ring-2 focus:ring-accent/30"
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