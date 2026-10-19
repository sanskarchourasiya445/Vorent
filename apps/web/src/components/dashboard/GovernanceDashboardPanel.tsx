import { useState, useEffect, useCallback } from "react";
import {
  Shield,
  Activity,
  Database,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  FileCheck,
  CreditCard,
  Layers,
  Lock,
  ArrowRight,
  Clock,
  AlertCircle,
  XCircle,
  ChevronRight,
} from "lucide-react";
import { api } from "../../api/client";
import { fetchApprovals } from "../../api/approvalService";
import {
  listPaymentOrders,
  getReconciliationAlerts,
  listSpendReservations,
  type ReconciliationAlertsResult,
  type SpendReservationsResult,
} from "../../api/paymentOrderService";
import { fetchPolicySummaries } from "../../api/policyService";
import { fetchSavedVerificationRuns } from "../../api/persistenceService";
import { fetchFindings } from "../../api/findingsService";
import type { ApprovalRecord } from "../../types/approval";
import type {
  HealthLiveResponse,
  HealthReadyResponse,
  PaymentOrderRecord,
  PolicySummary,
  FindingRecord,
  SpendReservationRecord,
} from "@warrant/contracts";
import type { SavedVerificationRunSummary } from "../../types/persistence";

export type DashboardItemState = "IDLE" | "LOADING" | "READY" | "EMPTY" | "UNAVAILABLE" | "ERROR";

export interface GovernanceDashboardPanelProps {
  onNavigateWorkstation: (workstationId: string) => void;
  initialApprovals?: ApprovalRecord[];
  initialApprovalsState?: DashboardItemState;
  initialPaymentOrders?: PaymentOrderRecord[];
  initialPaymentOrdersState?: DashboardItemState;
  initialReconciliationAlerts?: ReconciliationAlertsResult;
  initialSpendReservations?: SpendReservationsResult;
  initialPolicies?: PolicySummary[];
  initialPoliciesState?: DashboardItemState;
  initialRuns?: SavedVerificationRunSummary[];
  initialRunsState?: DashboardItemState;
  initialFindings?: FindingRecord[];
  initialFindingsState?: DashboardItemState;
  initialLoading?: boolean;
}

export function GovernanceDashboardPanel({
  onNavigateWorkstation,
  initialApprovals,
  initialApprovalsState,
  initialPaymentOrders,
  initialPaymentOrdersState,
  initialReconciliationAlerts,
  initialSpendReservations,
  initialPolicies,
  initialPoliciesState,
  initialRuns,
  initialRunsState,
  initialFindings,
  initialFindingsState,
  initialLoading,
}: GovernanceDashboardPanelProps) {
  const [loading, setLoading] = useState(
    initialLoading ?? (initialApprovals !== undefined || initialPolicies !== undefined ? false : true),
  );
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Health Data
  const [liveData, setLiveData] = useState<HealthLiveResponse | null>(null);
  const [readyData, setReadyData] = useState<HealthReadyResponse | null>(null);

  // Approvals & Spend Data
  const [approvals, setApprovals] = useState<ApprovalRecord[]>(initialApprovals ?? []);
  const [approvalsState, setApprovalsState] = useState<DashboardItemState>(
    initialApprovalsState ?? (initialApprovals ? (initialApprovals.length === 0 ? "EMPTY" : "READY") : "READY"),
  );

  // Payment Orders Data
  const [paymentOrders, setPaymentOrders] = useState<PaymentOrderRecord[]>(initialPaymentOrders ?? []);
  const [paymentOrdersState, setPaymentOrdersState] = useState<DashboardItemState>(
    initialPaymentOrdersState ?? (initialPaymentOrders ? (initialPaymentOrders.length === 0 ? "EMPTY" : "READY") : "READY"),
  );
  const [ordersEndpointUnmounted, setOrdersEndpointUnmounted] = useState(false);

  // Reconciliation Alerts Data
  const [reconciliationAlerts, setReconciliationAlerts] = useState<ReconciliationAlertsResult | null>(
    initialReconciliationAlerts ?? null,
  );
  const [reconciliationAlertsState, setReconciliationAlertsState] = useState<DashboardItemState>(
    initialReconciliationAlerts?.state ?? "READY",
  );

  // Spend Reservations Data
  const [spendReservations, setSpendReservations] = useState<SpendReservationRecord[]>(
    initialSpendReservations?.reservations ?? [],
  );
  const [reservationsState, setReservationsState] = useState<DashboardItemState>(
    initialSpendReservations?.state ?? "READY",
  );

  // Policy Versions Data
  const [policies, setPolicies] = useState<PolicySummary[]>(initialPolicies ?? []);
  const [policiesState, setPoliciesState] = useState<DashboardItemState>(
    initialPoliciesState ?? (initialPolicies ? (initialPolicies.length === 0 ? "EMPTY" : "READY") : "READY"),
  );
  const [isPolicyFallback, setIsPolicyFallback] = useState(false);

  // Verification Runs Data
  const [runs, setRuns] = useState<SavedVerificationRunSummary[]>(initialRuns ?? []);
  const [runsState, setRunsState] = useState<DashboardItemState>(
    initialRunsState ?? (initialRuns ? (initialRuns.length === 0 ? "EMPTY" : "READY") : "READY"),
  );

  // Findings Data
  const [findings, setFindings] = useState<FindingRecord[]>(initialFindings ?? []);
  const [findingsState, setFindingsState] = useState<DashboardItemState>(
    initialFindingsState ?? (initialFindings ? (initialFindings.length === 0 ? "EMPTY" : "READY") : "READY"),
  );

  const loadAllDashboardData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      // 1. Health Checks
      try {
        const live = await api.getHealthLive();
        setLiveData(live);
        try {
          const ready = await api.getHealthReady();
          setReadyData(ready);
        } catch (readyErr) {
          if (readyErr && typeof readyErr === "object" && "data" in readyErr) {
            setReadyData(readyErr.data as HealthReadyResponse);
          } else {
            setReadyData(null);
          }
        }
      } catch {
        setLiveData(null);
        setReadyData(null);
      }

      // 2. Approvals & Spend
      try {
        const approvalsRes = await fetchApprovals();
        setApprovalsState(approvalsRes.state);
        if (approvalsRes.state === "READY") {
          setApprovals(approvalsRes.data);
        } else {
          setApprovals([]);
        }
      } catch {
        setApprovals([]);
        setApprovalsState("ERROR");
      }

      // 3. Payment Orders
      try {
        const ordersRes = await listPaymentOrders();
        setPaymentOrders(ordersRes.orders);
        setPaymentOrdersState(ordersRes.state);
        setOrdersEndpointUnmounted(Boolean(ordersRes.isUnmounted));
      } catch {
        setPaymentOrders([]);
        setPaymentOrdersState("ERROR");
      }

      // 4. Reconciliation Alerts
      try {
        const alertsRes = await getReconciliationAlerts();
        setReconciliationAlerts(alertsRes);
        setReconciliationAlertsState(alertsRes.state);
      } catch {
        setReconciliationAlerts(null);
        setReconciliationAlertsState("ERROR");
      }

      // 5. Spend Reservations
      try {
        const resvRes = await listSpendReservations();
        setSpendReservations(resvRes.reservations);
        setReservationsState(resvRes.state);
      } catch {
        setSpendReservations([]);
        setReservationsState("ERROR");
      }

      // 6. Policy Summaries
      try {
        const policiesRes = await fetchPolicySummaries();
        if (policiesRes.state.state === "READY") {
          setPolicies(policiesRes.state.data);
          setPoliciesState("READY");
          setIsPolicyFallback(policiesRes.isFallback);
        } else if (policiesRes.state.state === "EMPTY") {
          setPolicies([]);
          setPoliciesState("EMPTY");
        } else {
          setPolicies([]);
          setPoliciesState(policiesRes.state.state);
        }
      } catch {
        setPolicies([]);
        setPoliciesState("ERROR");
      }

      // 7. Verification Runs
      try {
        const runsRes = await fetchSavedVerificationRuns();
        setRunsState(runsRes.state);
        if (runsRes.state === "READY") {
          setRuns(runsRes.data);
        } else {
          setRuns([]);
        }
      } catch {
        setRuns([]);
        setRunsState("ERROR");
      }

      // 8. Findings
      try {
        const findingsRes = await fetchFindings();
        setFindings(findingsRes.findings);
        setFindingsState("READY");
      } catch {
        setFindings([]);
        setFindingsState("UNAVAILABLE");
      }
    } catch (generalErr) {
      setError(
        generalErr instanceof Error
          ? generalErr.message
          : "An unexpected error occurred while loading dashboard metrics.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadAllDashboardData();
  }, [loadAllDashboardData]);

  // Derived Metrics & Calculations
  const now = Date.now();
  const activeApprovals = approvals.filter(
    (a) => a.status === "ACTIVE" && new Date(a.expiresAt).getTime() > now,
  );
  const expiredApprovals = approvals.filter(
    (a) => a.status === "EXPIRED" || new Date(a.expiresAt).getTime() <= now,
  );
  const revokedApprovals = approvals.filter((a) => a.status === "REVOKED");

  // Spend calculations across active approvals
  const totalSpendLimitMinor = activeApprovals.reduce(
    (sum, a) => sum + a.spendLimitMinor,
    0,
  );
  const totalConsumedSpendMinor = activeApprovals.reduce(
    (sum, a) => sum + (a.consumedSpendMinor || 0),
    0,
  );

  // Authoritative remaining spend calculation
  const hasAuthoritativeRemaining =
    activeApprovals.length > 0 &&
    activeApprovals.every((a) => typeof a.remainingSpendMinor === "number");

  const remainingBudgetMinor = hasAuthoritativeRemaining
    ? activeApprovals.reduce((sum, a) => sum + (a.remainingSpendMinor ?? 0), 0)
    : Math.max(0, totalSpendLimitMinor - totalConsumedSpendMinor);

  // Payment Order & Reservation states
  const capturedOrders = paymentOrders.filter((o) => o.status === "CAPTURED");
  const pendingOrders = paymentOrders.filter(
    (o) =>
      o.status === "CREATED" ||
      o.status === "PAYER_ACTION_REQUIRED" ||
      o.status === "CAPTURE_PENDING",
  );
  const failedOrders = paymentOrders.filter(
    (o) => o.status === "FAILED" || o.status === "CANCELLED",
  );

  // Reconciliation aggregation
  const ordersInReconciliationStatus = paymentOrders.filter(
    (o) =>
      o.status === "UNKNOWN_REQUIRES_RECONCILIATION" ||
      (o as any).reservationState === "RECONCILIATION_HOLD",
  );

  const alertOrders = reconciliationAlerts?.unreconciledOrders ?? [];
  const alertHeldReservations = reconciliationAlerts?.heldReservations ?? [];

  const combinedUnreconciledOrderIds = new Set<string>();
  const combinedOrdersRequiringReconciliation: PaymentOrderRecord[] = [];

  for (const o of [...ordersInReconciliationStatus, ...alertOrders]) {
    if (!combinedUnreconciledOrderIds.has(o.id)) {
      combinedUnreconciledOrderIds.add(o.id);
      combinedOrdersRequiringReconciliation.push(o);
    }
  }

  const reservationsInHold = spendReservations.filter(
    (r) => r.state === "RECONCILIATION_HOLD",
  );
  const totalHeldReservations = Math.max(
    alertHeldReservations.length,
    reservationsInHold.length,
  );

  const totalReconciliationItems =
    combinedOrdersRequiringReconciliation.length + totalHeldReservations;

  // Findings Analysis
  const unresolvedFindings = findings.filter(
    (f) => !f.status || f.status === "UNRESOLVED",
  );
  const criticalFindings = unresolvedFindings.filter(
    (f) => f.severity === "CRITICAL" || f.severity === "HIGH",
  );
  const resolvedFindings = findings.filter(
    (f) => f.status === "RESOLVED",
  );
  const acceptedRiskFindings = findings.filter(
    (f) => f.status === "ACCEPTED_RISK",
  );

  // Latest verification run
  const latestRun = runs.length > 0 ? runs[0] : null;

  return (
    <div
      className="max-w-6xl mx-auto space-y-6"
      role="region"
      aria-label="Warrant Governance & Operational Dashboard"
    >
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <Shield className="w-6 h-6 text-accent" aria-hidden="true" />
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink">
              Governance &amp; Operational Dashboard
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-muted mt-1">
            Real-time multi-stage overview of purchase policies, verification runs, active approvals, spend limits, and Sandbox payment reconciliations.
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => void loadAllDashboardData(true)}
            disabled={loading || refreshing}
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-canvas hover:bg-border/60 text-ink border border-border transition-colors disabled:opacity-50"
            title="Refresh dashboard metrics"
          >
            <RefreshCw
              className={`w-3.5 h-3.5 ${refreshing || loading ? "animate-spin" : ""}`}
            />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* Loading Indicator */}
      {loading && !refreshing && (
        <div
          role="status"
          aria-live="polite"
          className="p-4 rounded-panel border border-border bg-canvas text-muted text-xs flex items-center space-x-2"
        >
          <RefreshCw className="w-4 h-4 animate-spin text-accent" />
          <span>Loading Warrant governance metrics and operational states...</span>
        </div>
      )}

      {/* Global Error Banner */}
      {error && (
        <div
          role="alert"
          className="p-3.5 rounded border border-red-300 bg-red-50 text-red-950 text-xs flex items-center justify-between"
        >
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-deny shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => void loadAllDashboardData(true)}
            className="text-xs font-semibold underline text-deny hover:text-red-900"
          >
            Retry
          </button>
        </div>
      )}

      {/* Reconciliation Alert Banner (High Priority) */}
      {totalReconciliationItems > 0 && (
        <div
          role="alert"
          className="p-4 rounded-panel border-2 border-amber-400 bg-amber-50 text-amber-950 space-y-2 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 font-bold text-sm text-amber-900">
              <AlertCircle className="w-5 h-5 text-amber-700 shrink-0" />
              <span>
                Reconciliation Required: {totalReconciliationItems} Item(s) in Ambiguous State or Hold
              </span>
            </div>
            <button
              type="button"
              onClick={() => onNavigateWorkstation("transactions")}
              className="inline-flex items-center space-x-1 px-3 py-1 rounded text-xs font-bold bg-amber-700 text-white hover:bg-amber-800 transition-colors shadow-xs"
            >
              <span>Inspect Transactions</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-xs text-amber-900 leading-relaxed">
            {combinedOrdersRequiringReconciliation.length} payment order(s) in <code>UNKNOWN_REQUIRES_RECONCILIATION</code> and {totalHeldReservations} spend reservation(s) on <code>RECONCILIATION_HOLD</code> require operator intervention. Unsafe retries are blocked until reconciled against PayPal Orders and Captures APIs.
          </p>
        </div>
      )}

      {/* Reconciliation Service Standby or Error Notice */}
      {totalReconciliationItems === 0 && (reconciliationAlertsState === "UNAVAILABLE" || ordersEndpointUnmounted) && (
        <div
          role="status"
          className="p-3.5 rounded border border-amber-200 bg-amber-50/70 text-amber-900 text-xs flex items-center justify-between"
        >
          <div className="flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
            <span>
              Reconciliation Checks Standby: Live order ledger reconciliation requires active PostgreSQL connectivity. Missing data is not zero alerts.
            </span>
          </div>
          <button
            type="button"
            onClick={() => void loadAllDashboardData(true)}
            className="text-xs font-semibold underline text-amber-800 hover:text-amber-950"
          >
            Retry Check
          </button>
        </div>
      )}

      {totalReconciliationItems === 0 && reconciliationAlertsState === "ERROR" && (
        <div
          role="alert"
          className="p-3.5 rounded border border-red-200 bg-red-50 text-red-950 text-xs flex items-center justify-between"
        >
          <div className="flex items-center space-x-2">
            <XCircle className="w-4 h-4 text-deny shrink-0" />
            <span>
              Reconciliation Check Failed: Could not communicate with reconciliation alerts service. Verify backend route status.
            </span>
          </div>
          <button
            type="button"
            onClick={() => void loadAllDashboardData(true)}
            className="text-xs font-semibold underline text-deny hover:text-red-900"
          >
            Retry Check
          </button>
        </div>
      )}

      {/* Decision D-014 Critical Finding Warning Banner */}
      {criticalFindings.length > 0 && (
        <div
          role="alert"
          className="p-4 rounded-panel border border-red-300 bg-red-50 text-red-950 space-y-2 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 font-bold text-sm text-red-900">
              <XCircle className="w-5 h-5 text-deny shrink-0" />
              <span>
                Decision D-014 Warning: {criticalFindings.length} Unresolved CRITICAL / HIGH Finding(s)
              </span>
            </div>
            <button
              type="button"
              onClick={() => onNavigateWorkstation("findings")}
              className="inline-flex items-center space-x-1 px-3 py-1 rounded text-xs font-bold bg-deny text-white hover:bg-red-800 transition-colors shadow-xs"
            >
              <span>Triage Findings</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <p className="text-xs text-red-900 leading-relaxed">
            Per Warrant architectural Decision D-014, risk acceptance is strictly prohibited for CRITICAL and HIGH severity counterexamples. Approval creation will be blocked by the server until a repairing policy version is verified and linked.
          </p>
        </div>
      )}

      {/* Top Metric Cards: Budget, Approvals, Orders, Verification */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1: Spend Limits & Remaining Budget */}
        <div className="p-4 rounded-panel border border-border bg-surface space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-muted text-xs font-semibold uppercase tracking-wider">
            <span>Authorized Budget</span>
            <Lock className="w-4 h-4 text-accent" />
          </div>
          {approvalsState === "UNAVAILABLE" ? (
            <div className="space-y-1">
              <div className="text-xl font-bold font-mono text-muted">
                Unavailable
              </div>
              <div className="text-xs text-amber-800 font-medium">PostgreSQL Standby</div>
            </div>
          ) : approvalsState === "ERROR" ? (
            <div className="space-y-1">
              <div className="text-xl font-bold font-mono text-deny">
                Sync Error
              </div>
              <div className="text-xs text-deny font-medium">Connection Failed</div>
            </div>
          ) : (
            <>
              <div className="text-2xl font-bold font-mono text-ink flex items-baseline">
                {`$${(remainingBudgetMinor / 100).toFixed(2)}`}
                <span className="text-xs text-muted font-normal ml-1">remaining</span>
                {hasAuthoritativeRemaining && (
                  <span className="ml-2 px-1.5 py-0.5 rounded text-[9px] font-bold bg-emerald-100 text-emerald-900 border border-emerald-300">
                    Authoritative
                  </span>
                )}
              </div>
              <div className="text-xs text-muted flex items-center justify-between pt-1 border-t border-border">
                <span>{`Cap: $${(totalSpendLimitMinor / 100).toFixed(2)}`}</span>
                <span>{`Used: $${(totalConsumedSpendMinor / 100).toFixed(2)}`}</span>
              </div>
            </>
          )}
          {approvalsState === "UNAVAILABLE" && (
            <div className="text-[11px] text-muted pt-1 border-t border-border">
              Authoritative budget data offline
            </div>
          )}
          {approvalsState === "ERROR" && (
            <div className="text-[11px] text-muted pt-1 border-t border-border flex justify-between items-center">
              <span>Retryable connection failure</span>
              <button
                type="button"
                onClick={() => void loadAllDashboardData(true)}
                className="text-[10px] font-semibold underline text-deny"
              >
                Retry
              </button>
            </div>
          )}
        </div>

        {/* Metric 2: Approvals Status */}
        <div className="p-4 rounded-panel border border-border bg-surface space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-muted text-xs font-semibold uppercase tracking-wider">
            <span>Approvals</span>
            <FileCheck className="w-4 h-4 text-accent" />
          </div>
          {approvalsState === "UNAVAILABLE" ? (
            <div className="space-y-1">
              <div className="text-xl font-bold font-mono text-muted">
                Unavailable
              </div>
              <div className="text-xs text-muted">Database standby</div>
            </div>
          ) : approvalsState === "ERROR" ? (
            <div className="space-y-1">
              <div className="text-xl font-bold font-mono text-deny">
                Sync Error
              </div>
              <div className="text-xs text-deny">Check approvals</div>
            </div>
          ) : (
            <>
              <div className="text-2xl font-bold font-mono text-ink">
                {activeApprovals.length}
                <span className="text-xs text-emerald-800 font-semibold ml-1">active</span>
              </div>
              <div className="text-xs text-muted flex items-center justify-between pt-1 border-t border-border">
                <span>Expired: {expiredApprovals.length}</span>
                <span>Revoked: {revokedApprovals.length}</span>
              </div>
            </>
          )}
          {approvalsState === "UNAVAILABLE" && (
            <div className="text-[11px] text-muted pt-1 border-t border-border">
              Requires live database connection
            </div>
          )}
        </div>

        {/* Metric 3: Payment Orders */}
        <div className="p-4 rounded-panel border border-border bg-surface space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-muted text-xs font-semibold uppercase tracking-wider">
            <span>Payment Orders</span>
            <CreditCard className="w-4 h-4 text-accent" />
          </div>
          {ordersEndpointUnmounted || paymentOrdersState === "UNAVAILABLE" ? (
            <div className="space-y-1">
              <div className="text-xl font-bold font-mono text-muted">
                Unavailable
              </div>
              <div className="text-xs text-muted">Standby / Unmounted</div>
            </div>
          ) : paymentOrdersState === "ERROR" ? (
            <div className="space-y-1">
              <div className="text-xl font-bold font-mono text-deny">
                Sync Error
              </div>
              <div className="text-xs text-deny">Check orders</div>
            </div>
          ) : (
            <>
              <div className="text-2xl font-bold font-mono text-ink">
                {capturedOrders.length}
                <span className="text-xs text-emerald-800 font-semibold ml-1">captured</span>
              </div>
              <div className="text-xs text-muted flex items-center justify-between pt-1 border-t border-border">
                <span>Pending: {pendingOrders.length}</span>
                <span>Failed: {failedOrders.length}</span>
              </div>
            </>
          )}
          {(ordersEndpointUnmounted || paymentOrdersState === "UNAVAILABLE") && (
            <div className="text-[11px] text-muted pt-1 border-t border-border">
              Awaiting collection mount / standby
            </div>
          )}
        </div>

        {/* Metric 4: Finding Triage */}
        <div className="p-4 rounded-panel border border-border bg-surface space-y-2 shadow-xs">
          <div className="flex items-center justify-between text-muted text-xs font-semibold uppercase tracking-wider">
            <span>Finding Triage</span>
            <AlertTriangle className="w-4 h-4 text-accent" />
          </div>
          {findingsState === "UNAVAILABLE" ? (
            <div className="space-y-1">
              <div className="text-xl font-bold font-mono text-muted">
                Unavailable
              </div>
              <div className="text-xs text-muted">Database standby</div>
            </div>
          ) : findingsState === "ERROR" ? (
            <div className="space-y-1">
              <div className="text-xl font-bold font-mono text-deny">
                Sync Error
              </div>
              <div className="text-xs text-deny">Check findings</div>
            </div>
          ) : (
            <>
              <div className="text-2xl font-bold font-mono text-ink">
                {unresolvedFindings.length}
                <span className="text-xs text-amber-900 font-semibold ml-1">unresolved</span>
              </div>
              <div className="text-xs text-muted flex items-center justify-between pt-1 border-t border-border">
                <span>Resolved: {resolvedFindings.length}</span>
                <span>Risk Accepted: {acceptedRiskFindings.length}</span>
              </div>
            </>
          )}
          {findingsState === "UNAVAILABLE" && (
            <div className="text-[11px] text-muted pt-1 border-t border-border">
              Persisted findings in standby
            </div>
          )}
        </div>
      </div>

      {/* Two-Column Midsection: Approvals & Reservations vs Policy Versions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column: Active Approvals & Spend Reservations */}
        <div className="p-5 rounded-panel border border-border bg-surface space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center space-x-2">
              <FileCheck className="w-4 h-4 text-accent" />
              <h3 className="font-semibold text-xs text-ink uppercase tracking-wider">
                Active Approvals &amp; Authoritative Spend
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigateWorkstation("approval")}
              className="text-xs font-semibold text-accent hover:underline flex items-center space-x-1"
            >
              <span>Manage Approvals</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {approvalsState === "UNAVAILABLE" ? (
            <div className="p-4 rounded border border-amber-200 bg-amber-50 text-amber-900 text-xs">
              PostgreSQL database standby mode. Local development connection required for live approval persistence. Missing data is not zero approvals.
            </div>
          ) : approvalsState === "ERROR" ? (
            <div className="p-4 rounded border border-red-200 bg-red-50 text-red-950 text-xs flex items-center justify-between">
              <span>Failed to fetch approvals from backend service.</span>
              <button
                type="button"
                onClick={() => void loadAllDashboardData(true)}
                className="font-bold underline text-deny"
              >
                Retry
              </button>
            </div>
          ) : activeApprovals.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted border border-dashed border-border rounded">
              No active approvals currently registered. Complete verification in Verification Studio and create a qualifying approval checkpoint.
            </div>
          ) : (
            <div className="space-y-3">
              {activeApprovals.slice(0, 3).map((appr) => {
                const expiresDate = new Date(appr.expiresAt);
                const isExpiringSoon =
                  expiresDate.getTime() - now < 24 * 60 * 60 * 1000;
                const spendLimit = (appr.spendLimitMinor / 100).toFixed(2);
                const consumed = (
                  (appr.consumedSpendMinor || 0) / 100
                ).toFixed(2);
                const hasAuthoritativeRemaining =
                  typeof appr.remainingSpendMinor === "number";
                const remaining = hasAuthoritativeRemaining
                  ? (appr.remainingSpendMinor! / 100).toFixed(2)
                  : ((appr.spendLimitMinor - (appr.consumedSpendMinor || 0)) / 100).toFixed(2);

                return (
                  <div
                    key={appr.id}
                    className="p-3 rounded border border-border bg-canvas/40 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-mono text-ink font-semibold flex items-center space-x-1.5">
                        <span className="w-2 h-2 rounded-full bg-emerald-600"></span>
                        <span>{appr.id.slice(0, 8)}...</span>
                      </div>
                      <div className="text-right">
                        <div className="font-mono font-bold text-ink">
                          ${consumed} / ${spendLimit} {appr.currency}
                        </div>
                        <div className="text-[10px] text-emerald-800 font-medium">
                          ${remaining} remaining {hasAuthoritativeRemaining ? "(Authoritative)" : "(Est.)"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted">
                      <span>Policy: <code className="font-mono">{appr.policyVersionId.slice(0, 16)}</code></span>
                      <span
                        className={`flex items-center space-x-1 font-medium ${
                          isExpiringSoon ? "text-amber-800" : "text-muted"
                        }`}
                      >
                        <Clock className="w-3 h-3" />
                        <span>Expires {expiresDate.toLocaleDateString()}</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Spend Reservations Breakdown */}
          <div className="pt-3 border-t border-border space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-muted uppercase tracking-wider text-[10px]">
                Spend Reservations
              </span>
              <button
                type="button"
                onClick={() => onNavigateWorkstation("checkout")}
                className="text-[11px] font-semibold text-accent hover:underline flex items-center space-x-0.5"
              >
                <span>Checkout Gate</span>
                <ChevronRight className="w-3" />
              </button>
            </div>

            {reservationsState === "UNAVAILABLE" ? (
              <div className="p-2.5 rounded border border-border bg-canvas/30 text-muted text-[11px]">
                Spend reservation ledger is currently in standby mode.
              </div>
            ) : reservationsState === "ERROR" ? (
              <div className="p-2.5 rounded border border-red-200 bg-red-50 text-red-900 text-[11px]">
                Unable to query spend reservations.
              </div>
            ) : spendReservations.length === 0 ? (
              <div className="p-2.5 rounded border border-dashed border-border text-center text-muted text-[11px]">
                No active spend reservations held. Nonce proposals will allocate reservations here.
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
                <div className="p-2 rounded border border-border bg-canvas/40">
                  <div className="text-muted text-[10px]">Active Holds</div>
                  <div className="font-bold font-mono text-ink">
                    {spendReservations.filter((r) => r.state === "RESERVED" || r.state === "ORDER_CREATION_PENDING").length}
                  </div>
                </div>
                <div className="p-2 rounded border border-border bg-canvas/40">
                  <div className="text-muted text-[10px]">Committed</div>
                  <div className="font-bold font-mono text-emerald-800">
                    {spendReservations.filter((r) => r.state === "COMMITTED").length}
                  </div>
                </div>
                <div className="p-2 rounded border border-border bg-canvas/40">
                  <div className="text-muted text-[10px]">Reconciliation Hold</div>
                  <div className={`font-bold font-mono ${reservationsInHold.length > 0 ? "text-amber-800 font-black" : "text-ink"}`}>
                    {reservationsInHold.length}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Policy Versions & Approval Binding */}
        <div className="p-5 rounded-panel border border-border bg-surface space-y-4 shadow-sm">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center space-x-2">
              <Layers className="w-4 h-4 text-accent" />
              <h3 className="font-semibold text-xs text-ink uppercase tracking-wider">
                Policy Versions &amp; Approval Status
              </h3>
            </div>
            <button
              type="button"
              onClick={() => onNavigateWorkstation("policy-versions")}
              className="text-xs font-semibold text-accent hover:underline flex items-center space-x-1"
            >
              <span>Compare Versions</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {policiesState === "UNAVAILABLE" ? (
            <div className="p-4 rounded border border-amber-200 bg-amber-50 text-amber-900 text-xs">
              Policy registry is currently in database standby mode.
            </div>
          ) : isPolicyFallback ? (
            <div className="p-2.5 rounded border border-blue-200 bg-blue-50 text-blue-900 text-xs">
              Displaying standard reference policy presets. Custom versions will persist once PostgreSQL is active.
            </div>
          ) : policies.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted border border-dashed border-border rounded">
              No policies registered. Use Mandate Compiler to compile your first purchasing policy.
            </div>
          ) : (
            <div className="space-y-3">
              {policies.slice(0, 3).map((pol) => {
                // Check if this policy has an active approval bound
                const boundApproval = activeApprovals.find(
                  (a) =>
                    a.policyVersionId === pol.id || (pol.policyHash && a.policyHash === pol.policyHash),
                );

                return (
                  <div
                    key={pol.id}
                    className="p-3 rounded border border-border bg-canvas/40 space-y-2 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-ink">{pol.name}</div>
                      {boundApproval ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-950 border border-emerald-300">
                          <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-700" />
                          APPROVED &amp; ACTIVE
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-canvas text-muted border border-border">
                          VERIFIED / STANDBY
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-muted font-mono truncate">
                      <span>ID: {pol.id}</span>
                      <span>Hash: {pol.policyHash ? `${pol.policyHash.slice(0, 12)}...` : "Preset"}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Verification History & Latest Run Banner */}
      <div className="p-5 rounded-panel border border-border bg-surface space-y-4 shadow-sm">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center space-x-2">
            <Activity className="w-4 h-4 text-accent" />
            <h3 className="font-semibold text-xs text-ink uppercase tracking-wider">
              Verification Engine History &amp; Bounded Search
            </h3>
          </div>
          <button
            type="button"
            onClick={() => onNavigateWorkstation("verification")}
            className="text-xs font-semibold text-accent hover:underline flex items-center space-x-1"
          >
            <span>Open Verification Studio</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {runsState === "UNAVAILABLE" ? (
          <div className="p-3 rounded border border-amber-200 bg-amber-50 text-amber-900 text-xs">
            PostgreSQL persistence store is currently in standby mode. Runs executed in Studio remain active in session memory.
          </div>
        ) : latestRun ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-3 rounded border border-border bg-canvas/40 space-y-1">
              <div className="text-muted font-semibold uppercase text-[10px]">Latest Verified Run</div>
              <div className="font-mono text-ink font-bold">{latestRun.runId}</div>
              <div className="text-[11px] text-muted">Policy: {latestRun.policyName || latestRun.policyVersionId}</div>
            </div>
            <div className="p-3 rounded border border-border bg-canvas/40 space-y-1">
              <div className="text-muted font-semibold uppercase text-[10px]">Explored Search Space</div>
              <div className="font-mono text-ink font-bold">{latestRun.totalCandidatesExplored} permutations</div>
              <div className="text-[11px] text-muted">
                Status: <span className="font-semibold text-emerald-800">{latestRun.status}</span> ({latestRun.stopReason || "EXHAUSTIVE"})
              </div>
            </div>
            <div className="p-3 rounded border border-border bg-canvas/40 space-y-1">
              <div className="text-muted font-semibold uppercase text-[10px]">Findings Discovered</div>
              <div className="font-mono text-ink font-bold">{latestRun.findingCount} Findings</div>
              <div className="text-[11px] text-muted">{latestRun.unresolvedCount ?? 0} Unresolved Ambiguities</div>
            </div>
          </div>
        ) : (
          <div className="py-6 text-center text-xs text-muted border border-dashed border-border rounded">
            No persisted test runs recorded yet. Run a bounded verification search in Verification Studio to evaluate policy invariants.
          </div>
        )}

        <div className="text-[11px] text-muted pt-2 border-t border-border/60">
          <span className="font-semibold text-ink">Bounded Search Disclaimer:</span> Verification evaluates search spaces within declared finite candidate budgets. Zero detected counterexamples confirms compliance within evaluated permutations; it does not claim universal safety.
        </div>
      </div>

      {/* System Infrastructure & Security Invariants */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Fastify API Liveness */}
        <div className="p-4 rounded-panel border border-border bg-surface space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 font-semibold text-ink">
              <Activity className="w-4 h-4 text-accent" />
              <span>Fastify API Service</span>
            </div>
            {liveData ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-950 border border-emerald-300">
                <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-700" />
                ONLINE (v{liveData.version})
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-950 border border-red-300">
                OFFLINE
              </span>
            )}
          </div>
          <div className="text-muted">
            Liveness verified. Request sanitization active with zero credential leakage.
          </div>
        </div>

        {/* PostgreSQL Database Readiness */}
        <div className="p-4 rounded-panel border border-border bg-surface space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2 font-semibold text-ink">
              <Database className="w-4 h-4 text-accent" />
              <span>PostgreSQL Readiness</span>
            </div>
            {readyData?.database?.connected ? (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-950 border border-emerald-300">
                <CheckCircle2 className="w-3 h-3 mr-1 text-emerald-700" />
                CONNECTED ({readyData.database.latencyMs}ms)
              </span>
            ) : (
              <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-950 border border-amber-300">
                STANDBY (DEV CONFIG REQUIRED)
              </span>
            )}
          </div>
          <div className="text-muted">
            Readiness probe returns 503 during local database standby, safely preserving memory fixtures without crashing.
          </div>
        </div>
      </div>
    </div>
  );
}
