import { useState, useEffect, useCallback } from "react";
import {
  ShieldCheck,
  Play,
  RefreshCw,
  AlertTriangle,
  Database,
  CheckCircle2,
  XCircle,
  HelpCircle,
  AlertCircle,
  Info,
  History,
  PackageCheck,
} from "lucide-react";
import type {
  EvaluationSuiteResult,
  AuditTrailLoadResult,
  EvidencePacketLoadResult,
} from "../../types/evaluation";
import {
  getInitialEvaluationState,
  executeEvaluationReportSuite,
  fetchLivePersistedAudit,
  evaluatePersistedInvariants,
  fetchAuditTrail,
  fetchEvidencePacket,
} from "../../api/evaluationService";
import { InvariantCheckCard } from "./InvariantCheckCard";
import { BoundedSearchLimitsCard } from "./BoundedSearchLimitsCard";
import { AuditTrailCard } from "./AuditTrailCard";
import { EvidencePacketCard } from "./EvidencePacketCard";

interface EvaluationReportPanelProps {
  onNavigateWorkstation?: (workstationId: string) => void;
}

export type EvaluationReportTab = "invariants" | "audit" | "packet";

export function EvaluationReportPanel({ onNavigateWorkstation }: EvaluationReportPanelProps) {
  const [activeTab, setActiveTab] = useState<EvaluationReportTab>("invariants");
  const [suiteResult, setSuiteResult] = useState<EvaluationSuiteResult>(getInitialEvaluationState);
  const [isRunning, setIsRunning] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Audit trail state
  const [auditResult, setAuditResult] = useState<AuditTrailLoadResult>({
    state: "IDLE",
    events: [],
    total: 0,
  });
  const [isAuditLoading, setIsAuditLoading] = useState<boolean>(false);

  // Evidence packet state
  const [packetResult, setPacketResult] = useState<EvidencePacketLoadResult>({
    state: "IDLE",
    packet: null,
  });
  const [isPacketLoading, setIsPacketLoading] = useState<boolean>(false);

  // Load initial live persisted evidence on mount
  const refreshLiveEvidence = useCallback(async () => {
    try {
      const persisted = await fetchLivePersistedAudit();
      const updatedPersistedInvariants = evaluatePersistedInvariants(persisted);

      setSuiteResult((prev) => {
        const mergedInvariants = prev.invariants.map((inv) => {
          const match = updatedPersistedInvariants.find((p) => p.id === inv.id);
          return match || inv;
        });

        const passedChecks = mergedInvariants.filter((i) => i.status === "PASS").length;
        const failedChecks = mergedInvariants.filter((i) => i.status === "FAIL").length;
        const warningChecks = mergedInvariants.filter((i) => i.status === "WARNING").length;
        const untestedChecks = mergedInvariants.filter((i) => i.status === "UNTESTED").length;

        return {
          ...prev,
          persistedEvidence: persisted,
          invariants: mergedInvariants,
          passedChecks,
          failedChecks,
          warningChecks,
          untestedChecks,
        };
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  // Refresh audit trail
  const refreshAudit = useCallback(async () => {
    setIsAuditLoading(true);
    try {
      const res = await fetchAuditTrail();
      setAuditResult(res);
    } catch (err) {
      setAuditResult({
        state: "UNAVAILABLE",
        events: [],
        total: 0,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsAuditLoading(false);
    }
  }, []);

  // Refresh evidence packet
  const refreshPacket = useCallback(async (targetParams?: { entityType?: string; entityId?: string }) => {
    setIsPacketLoading(true);
    try {
      const res = await fetchEvidencePacket(targetParams);
      setPacketResult(res);
    } catch (err) {
      setPacketResult({
        state: "UNAVAILABLE",
        packet: null,
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setIsPacketLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshLiveEvidence();
    void refreshAudit();
    void refreshPacket();
  }, [refreshLiveEvidence, refreshAudit, refreshPacket]);

  // Execute full evaluation suite
  const handleRunSuite = async () => {
    setIsRunning(true);
    setError(null);
    try {
      const result = await executeEvaluationReportSuite();
      setSuiteResult(result);
      // Also refresh audit trail and evidence packet
      void refreshAudit();
      void refreshPacket();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsRunning(false);
    }
  };

  // Group invariants
  const deterministicInvariants = suiteResult.invariants.filter(
    (i) => i.category === "DETERMINISTIC_FIXTURE",
  );
  const persistedInvariants = suiteResult.invariants.filter(
    (i) => i.category === "PERSISTED_RECORDS" || i.category === "GATE_ENFORCEMENT",
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto" data-testid="evaluation-report-panel">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-6 h-6 text-accent" aria-hidden="true" />
            <h1 className="text-xl font-bold tracking-tight text-ink">
              Evaluation Report &amp; Invariant Evidence Hub
            </h1>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-accent/10 text-accent font-bold uppercase tracking-wider border border-accent/20">
              Workstation 9 of 9
            </span>
          </div>
          <p className="text-xs text-muted mt-1">
            Empirical verification of the 6 core security invariants, bounded search limits, immutable audit trail, and verifiable PayPal Sandbox evidence packet export.
          </p>
        </div>

        <div className="flex items-center space-x-2.5">
          <button
            type="button"
            onClick={() => {
              void refreshLiveEvidence();
              void refreshAudit();
              void refreshPacket();
            }}
            disabled={isRunning || isAuditLoading || isPacketLoading}
            className="px-3 py-2 rounded text-xs font-semibold bg-surface border border-border text-ink hover:bg-canvas transition-all duration-150 inline-flex items-center space-x-1.5 shadow-sm disabled:opacity-50"
            data-testid="refresh-evidence-btn"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRunning || isAuditLoading || isPacketLoading ? "animate-spin" : ""}`} aria-hidden="true" />
            <span>Refresh Audit</span>
          </button>

          <button
            type="button"
            onClick={() => void handleRunSuite()}
            disabled={isRunning}
            className="px-4 py-2 rounded text-xs font-semibold bg-accent text-white hover:bg-accent/90 transition-all duration-150 active:scale-[0.98] inline-flex items-center space-x-2 shadow-sm disabled:opacity-60"
            data-testid="run-suite-btn"
          >
            {isRunning ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                <span>Evaluating Invariants...</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 fill-current" aria-hidden="true" />
                <span>Execute Invariant Suite</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Global Error Banner */}
      {error && (
        <div
          className="p-4 rounded-panel bg-rose-50 border border-rose-300 text-rose-900 flex items-start space-x-3 text-xs"
          role="alert"
          data-testid="evaluation-error-banner"
        >
          <AlertCircle className="w-4 h-4 text-rose-700 shrink-0 mt-0.5" aria-hidden="true" />
          <div className="flex-1">
            <h4 className="font-bold">Evaluation Suite Execution Error</h4>
            <p className="mt-0.5">{error}</p>
          </div>
          <button
            type="button"
            onClick={() => void handleRunSuite()}
            className="px-2.5 py-1 rounded bg-rose-200/80 hover:bg-rose-200 text-rose-950 font-semibold text-xs transition-colors shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Sub-Navigation Tabs */}
      <div className="flex border-b border-border space-x-1" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "invariants"}
          onClick={() => setActiveTab("invariants")}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all duration-150 inline-flex items-center space-x-2 ${
            activeTab === "invariants"
              ? "border-accent text-accent font-bold"
              : "border-transparent text-muted hover:text-ink hover:border-border"
          }`}
          data-testid="tab-invariants"
        >
          <ShieldCheck className="w-4 h-4" aria-hidden="true" />
          <span>Security Invariants &amp; Report</span>
          <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-full bg-accent/10 text-accent">
            6 Checks
          </span>
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "audit"}
          onClick={() => setActiveTab("audit")}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all duration-150 inline-flex items-center space-x-2 ${
            activeTab === "audit"
              ? "border-accent text-accent font-bold"
              : "border-transparent text-muted hover:text-ink hover:border-border"
          }`}
          data-testid="tab-audit-trail"
        >
          <History className="w-4 h-4" aria-hidden="true" />
          <span>Audit Trail &amp; Ledger</span>
          {auditResult.events.length > 0 && (
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-full bg-surface border border-border text-ink">
              {auditResult.events.length}
            </span>
          )}
        </button>

        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "packet"}
          onClick={() => setActiveTab("packet")}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-all duration-150 inline-flex items-center space-x-2 ${
            activeTab === "packet"
              ? "border-accent text-accent font-bold"
              : "border-transparent text-muted hover:text-ink hover:border-border"
          }`}
          data-testid="tab-evidence-packet"
        >
          <PackageCheck className="w-4 h-4" aria-hidden="true" />
          <span>Evidence Packet &amp; Export</span>
          {packetResult.packet && (
            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
              READY
            </span>
          )}
        </button>
      </div>

      {/* TAB 1: Security Invariants & Evaluation Report */}
      {activeTab === "invariants" && (
        <div className="space-y-6">
          {/* Database Standby Callout */}
          {suiteResult.persistedEvidence.state === "STANDBY" && (
            <div
              className="p-4 rounded-panel bg-amber-50 border border-amber-300 text-amber-950 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              data-testid="db-standby-banner"
            >
              <div className="flex items-start sm:items-center space-x-2.5">
                <Database className="w-4 h-4 text-amber-700 shrink-0 mt-0.5 sm:mt-0" aria-hidden="true" />
                <div>
                  <span className="font-bold">PostgreSQL Persistence in Standby Mode: </span>
                  <span>
                    Deterministic security invariants remain 100% verifiable in-memory. Persisted order table audit will activate once local PostgreSQL authentication is connected.
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => void refreshLiveEvidence()}
                className="px-3 py-1 rounded bg-amber-200 hover:bg-amber-300 text-amber-900 font-semibold text-xs transition-colors shrink-0 self-start sm:self-auto"
              >
                Retry DB Probe
              </button>
            </div>
          )}

          {/* Status Summary Scoreboard */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-4 rounded-panel bg-surface border border-border shadow-sm flex items-center justify-between">
              <div>
                <span className="text-muted block text-[11px] font-semibold uppercase tracking-wider">
                  Verified Passed
                </span>
                <span className="text-2xl font-bold font-mono text-emerald-700 mt-1 block">
                  {suiteResult.passedChecks}
                  <span className="text-xs font-normal text-muted ml-1">/ {suiteResult.totalChecks}</span>
                </span>
              </div>
              <div className="w-9 h-9 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-700">
                <CheckCircle2 className="w-5 h-5" aria-hidden="true" />
              </div>
            </div>

            <div className="p-4 rounded-panel bg-surface border border-border shadow-sm flex items-center justify-between">
              <div>
                <span className="text-muted block text-[11px] font-semibold uppercase tracking-wider">
                  Detected Violations
                </span>
                <span className="text-2xl font-bold font-mono text-rose-700 mt-1 block">
                  {suiteResult.failedChecks}
                  <span className="text-xs font-normal text-muted ml-1">/ {suiteResult.totalChecks}</span>
                </span>
              </div>
              <div className="w-9 h-9 rounded-full bg-rose-50 flex items-center justify-center text-rose-700">
                <XCircle className="w-5 h-5" aria-hidden="true" />
              </div>
            </div>

            <div className="p-4 rounded-panel bg-surface border border-border shadow-sm flex items-center justify-between">
              <div>
                <span className="text-muted block text-[11px] font-semibold uppercase tracking-wider">
                  Warnings / Standby
                </span>
                <span className="text-2xl font-bold font-mono text-amber-700 mt-1 block">
                  {suiteResult.warningChecks}
                  <span className="text-xs font-normal text-muted ml-1">/ {suiteResult.totalChecks}</span>
                </span>
              </div>
              <div className="w-9 h-9 rounded-full bg-amber-50 flex items-center justify-center text-amber-700">
                <AlertTriangle className="w-5 h-5" aria-hidden="true" />
              </div>
            </div>

            <div className="p-4 rounded-panel bg-surface border border-border shadow-sm flex items-center justify-between">
              <div>
                <span className="text-muted block text-[11px] font-semibold uppercase tracking-wider">
                  Untested Invariants
                </span>
                <span className="text-2xl font-bold font-mono text-slate-600 mt-1 block">
                  {suiteResult.untestedChecks}
                  <span className="text-xs font-normal text-muted ml-1">/ {suiteResult.totalChecks}</span>
                </span>
              </div>
              <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
                <HelpCircle className="w-5 h-5" aria-hidden="true" />
              </div>
            </div>
          </div>

          {/* Untested Initial Banner */}
          {!suiteResult.executedAt && (
            <div className="p-4 rounded-panel bg-accent/5 border border-accent/20 text-xs text-ink flex items-start space-x-3">
              <Info className="w-4 h-4 text-accent shrink-0 mt-0.5" aria-hidden="true" />
              <div>
                <span className="font-bold text-accent">Suite Ready for Execution: </span>
                <span>
                  In accordance with Warrant governance rules, all security invariants initially show as UNTESTED. Click the{" "}
                  <strong>Execute Invariant Suite</strong> button above to run the deterministic fixture suite and verify live PayPal Sandbox gate invariants.
                </span>
              </div>
            </div>
          )}

          {/* SECTION 1: Deterministic Security Invariants */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-ink flex items-center space-x-2">
                  <span>1. Deterministic Security Invariants (Fixture Verification)</span>
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  Evaluated directly against canonical test fixtures to verify defect discovery, defect repair, and fail-closed gate mechanics.
                </p>
              </div>
              <span className="text-xs text-muted font-mono">
                {deterministicInvariants.filter((i) => i.status === "PASS").length} / {deterministicInvariants.length} Passed
              </span>
            </div>

            <div className="space-y-3">
              {deterministicInvariants.map((check) => (
                <InvariantCheckCard key={check.id} check={check} />
              ))}
            </div>
          </div>

          {/* SECTION 2: Persisted Operational & Payment Evidence */}
          <div className="space-y-3 pt-3 border-t border-border">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-ink flex items-center space-x-2">
                  <span>2. Persisted Operational &amp; Payment Evidence (Live Server Audit)</span>
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  Audits live database records across payment orders, spend reservations, reconciliation holds, and cryptographic nonce uniqueness.
                </p>
              </div>
              <span className="text-xs text-muted font-mono">
                {persistedInvariants.filter((i) => i.status === "PASS").length} / {persistedInvariants.length} Passed
              </span>
            </div>

            <div className="space-y-3">
              {persistedInvariants.map((check) => (
                <InvariantCheckCard key={check.id} check={check} />
              ))}
            </div>
          </div>

          {/* SECTION 3: Bounded Search Limits & Known Limitations */}
          <div className="space-y-3 pt-3 border-t border-border">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold uppercase tracking-wider text-ink flex items-center space-x-2">
                  <span>3. Bounded Search Limits &amp; Scope Limitations (NFR-010)</span>
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  Explicit disclosure of finite catalog boundaries, server clamping thresholds, and formal safety guardrails.
                </p>
              </div>
            </div>

            <BoundedSearchLimitsCard limits={suiteResult.limits} />
          </div>
        </div>
      )}

      {/* TAB 2: Audit Trail */}
      {activeTab === "audit" && (
        <AuditTrailCard
          auditResult={auditResult}
          isLoading={isAuditLoading}
          onRefresh={refreshAudit}
        />
      )}

      {/* TAB 3: Evidence Packet & Export */}
      {activeTab === "packet" && (
        <EvidencePacketCard
          packetResult={packetResult}
          isLoading={isPacketLoading}
          onRefresh={refreshPacket}
          onNavigateWorkstation={onNavigateWorkstation}
        />
      )}

      {/* Footer Navigation Cross-Link */}
      {onNavigateWorkstation && (
        <div className="pt-4 border-t border-border flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="text-muted">
            Evaluation verified under Policy: <span className="font-mono text-ink">pol_v1_books_hardware</span>
          </span>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => onNavigateWorkstation("verification")}
              className="px-3 py-1.5 rounded bg-surface border border-border text-ink hover:bg-canvas transition-colors font-medium"
            >
              Open Verification Studio
            </button>
            <button
              type="button"
              onClick={() => onNavigateWorkstation("overview")}
              className="px-3 py-1.5 rounded bg-surface border border-border text-ink hover:bg-canvas transition-colors font-medium"
            >
              Return to System Dashboard
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
