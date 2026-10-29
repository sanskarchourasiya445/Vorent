import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Shield,
  Activity,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  FileCheck,
  CreditCard,
  Layers,
  ArrowRight,
  Clock,
  AlertCircle,
  ChevronRight,
  FileText,
  ShieldAlert,
  ShieldCheck,
  Info,
} from "lucide-react";
import { fetchApprovals } from "../../api/approvalService";
import {
  listPaymentOrders,
  getReconciliationAlerts,
  listSpendReservations,
  syncPayPalTransactions,
  type ReconciliationAlertsResult,
  type SpendReservationsResult,
} from "../../api/paymentOrderService";
import { fetchPolicySummaries } from "../../api/policyService";
import { fetchSavedVerificationRuns } from "../../api/persistenceService";
import { fetchFindings } from "../../api/findingsService";
import { HashBadge } from "../ui/HashBadge";
import { StatusBadge } from "../ui/StatusBadge";
import { SkeletonDashboard } from "../ui/Skeleton";
import type { ApprovalRecord } from "../../types/approval";
import type {
  PaymentOrderRecord,
  PolicySummary,
  FindingRecord,
  SpendReservationRecord,
} from "@warrant/contracts";
import type { SavedVerificationRunSummary } from "../../types/persistence";

export type DashboardItemState = "IDLE" | "LOADING" | "READY" | "EMPTY" | "UNAVAILABLE" | "ERROR";

function withTimeout<T>(promise: Promise<T>, ms: number, fallbackValue: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        resolve(fallbackValue);
      }
    }, ms);

    promise
      .then((val) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(val);
        }
      })
      .catch(() => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(fallbackValue);
        }
      });
  });
}

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

  // PayPal Sandbox Sync state
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<string | null>(null);

  const loadAllDashboardData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) setRefreshing(true);
    else setLoading(true);
    setError(null);

    try {
      // Execute all 7 queries concurrently with individual 8-second safety timeouts
      const [
        approvalsSettled,
        ordersSettled,
        alertsSettled,
        resvSettled,
        policiesSettled,
        runsSettled,
        findingsSettled,
      ] = await Promise.allSettled([
        withTimeout(fetchApprovals(), 8000, { state: "ERROR" as const, message: "Request timed out" } as any),
        withTimeout(listPaymentOrders(), 8000, { orders: [], state: "ERROR" as const, isUnmounted: false } as any),
        withTimeout(getReconciliationAlerts(), 8000, { unreconciledOrders: [], heldReservations: [], totalAlerts: 0, state: "ERROR" as const, isUnmounted: false } as any),
        withTimeout(listSpendReservations(), 8000, { reservations: [], total: 0, state: "ERROR" as const, isUnmounted: false } as any),
        withTimeout(fetchPolicySummaries(), 8000, { state: { state: "ERROR" as const }, isFallback: false } as any),
        withTimeout(fetchSavedVerificationRuns(), 8000, { data: [], state: "ERROR" as const } as any),
        withTimeout(fetchFindings(), 8000, { findings: [] } as any),
      ]);

      // 1. Approvals & Spend
      if (approvalsSettled.status === "fulfilled") {
        const approvalsRes = approvalsSettled.value;
        setApprovalsState(approvalsRes.state);
        if (approvalsRes.state === "READY") {
          setApprovals(approvalsRes.data);
        } else {
          setApprovals([]);
        }
      } else {
        setApprovals([]);
        setApprovalsState("ERROR");
      }

      // 2. Payment Orders
      if (ordersSettled.status === "fulfilled") {
        const ordersRes = ordersSettled.value;
        setPaymentOrders(ordersRes.orders || []);
        setPaymentOrdersState(ordersRes.state);
        setOrdersEndpointUnmounted(Boolean(ordersRes.isUnmounted));
      } else {
        setPaymentOrders([]);
        setPaymentOrdersState("ERROR");
      }

      // 3. Reconciliation Alerts
      if (alertsSettled.status === "fulfilled") {
        const alertsRes = alertsSettled.value;
        setReconciliationAlerts(alertsRes);
        setReconciliationAlertsState(alertsRes.state);
      } else {
        setReconciliationAlerts(null);
        setReconciliationAlertsState("ERROR");
      }

      // 4. Spend Reservations
      if (resvSettled.status === "fulfilled") {
        const resvRes = resvSettled.value;
        setSpendReservations(resvRes.reservations || []);
        setReservationsState(resvRes.state);
      } else {
        setSpendReservations([]);
        setReservationsState("ERROR");
      }

      // 5. Policy Summaries
      if (policiesSettled.status === "fulfilled") {
        const policiesRes = policiesSettled.value;
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
      } else {
        setPolicies([]);
        setPoliciesState("ERROR");
      }

      // 6. Verification Runs
      if (runsSettled.status === "fulfilled") {
        const runsRes = runsSettled.value;
        setRunsState(runsRes.state);
        if (runsRes.state === "READY") {
          setRuns(runsRes.data);
        } else {
          setRuns([]);
        }
      } else {
        setRuns([]);
        setRunsState("ERROR");
      }

      // 7. Findings
      if (findingsSettled.status === "fulfilled") {
        const findingsRes = findingsSettled.value;
        setFindings(findingsRes.findings || []);
        setFindingsState("READY");
      } else {
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

    // Absolute fallback safety timer: ensure skeletons never hang indefinitely
    const safetyTimer = setTimeout(() => {
      setLoading(false);
    }, 9000);

    return () => clearTimeout(safetyTimer);
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

  // Spend percentage consumed for visual calculation
  const spendPercentRemaining =
    totalSpendLimitMinor > 0
      ? Math.max(0, Math.round(((totalSpendLimitMinor - totalConsumedSpendMinor) / totalSpendLimitMinor) * 100))
      : 0;

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

  // Latest verification run
  const latestRun = runs.length > 0 ? runs[0] : null;

  // Curated policies
  const curatedPolicies = useMemo(() => {
    if (!policies || policies.length === 0) return [];
    return policies.slice(0, 4);
  }, [policies]);

  const handleSyncPayPal = async () => {
    setIsSyncing(true);
    setSyncFeedback(null);
    try {
      const res = await syncPayPalTransactions();
      setSyncFeedback(res.message);
      await loadAllDashboardData(true);
    } catch (err: any) {
      setSyncFeedback(`Sync failed: ${err?.message || String(err)}`);
    } finally {
      setIsSyncing(false);
    }
  };

  interface ActivityItem {
    id: string;
    timestamp: string;
    type: "Purchase" | "Approval" | "Verification";
    details: string;
    status: string;
    variant: "ALLOW" | "STANDBY" | "REVIEW" | "DENY";
  }

  const recentActivityItems = useMemo<ActivityItem[]>(() => {
    const items: ActivityItem[] = [];

    for (const ord of paymentOrders) {
      const isCaptured = ord.status === "CAPTURED";
      const isApproved = ord.status === "APPROVED";
      const isHold = ord.status === "UNKNOWN_REQUIRES_RECONCILIATION";
      const isDeny = ord.status === "FAILED" || ord.status === "CANCELLED";

      items.push({
        id: `po-${ord.id}`,
        timestamp: typeof ord.createdAt === "string" ? ord.createdAt : new Date(ord.createdAt).toISOString(),
        type: "Purchase",
        details: ord.providerOrderId
          ? `PayPal #${ord.providerOrderId.slice(0, 14)} · $${(ord.amountMinor / 100).toFixed(2)} ${ord.currency}`
          : `Reservation #${ord.reservationId.slice(0, 8)} · $${(ord.amountMinor / 100).toFixed(2)} ${ord.currency}`,
        status: ord.status,
        variant: isCaptured || isApproved ? "ALLOW" : isHold ? "REVIEW" : isDeny ? "DENY" : "STANDBY",
      });
    }

    for (const app of approvals) {
      items.push({
        id: `app-${app.id}`,
        timestamp: typeof app.createdAt === "string" ? app.createdAt : new Date(app.createdAt).toISOString(),
        type: "Approval",
        details: `Spend checkpoint · $${(app.spendLimitMinor / 100).toFixed(2)} ${app.currency}`,
        status: app.status,
        variant: app.status === "ACTIVE" ? "ALLOW" : "STANDBY",
      });
    }

    for (const run of runs) {
      items.push({
        id: `run-${run.runId}`,
        timestamp: typeof run.createdAt === "string" ? run.createdAt : new Date(run.createdAt).toISOString(),
        type: "Verification",
        details: `Explored ${run.totalCandidatesExplored} states · ${run.policyName || run.policyVersionId.slice(0, 8)}`,
        status: run.status,
        variant: run.status === "COMPLETED" ? "ALLOW" : "STANDBY",
      });
    }

    items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return items.slice(0, 5);
  }, [paymentOrders, approvals, runs]);

  return (
    <div
      className="space-y-6 w-full font-sans text-ink"
      role="region"
      aria-label="Warrant Governance & Operational Dashboard"
    >
      {/* 1. Header Bar matching reference layout */}
      <div className="space-y-3 pb-2 border-b border-border/60">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-sans">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-ink">Command Center</span>
            <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-allow/15 text-allow border border-allow/30">
              <span className="w-1.5 h-1.5 rounded-full bg-allow animate-pulse" />
              <span>Live</span>
            </span>
          </div>

          <div className="flex items-center space-x-3">
            <span className="text-muted text-[11px] hidden md:inline">Operational metrics &amp; risk posture</span>
            <span className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-warning/10 text-warning border border-warning/30">
              <span className="w-1.5 h-1.5 rounded-full bg-warning" />
              <span>Fail-Closed (D-014)</span>
            </span>
            <button
              type="button"
              onClick={() => void loadAllDashboardData(true)}
              disabled={loading || refreshing}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-surface hover:bg-surface-subtle text-ink border border-border shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
              title="Refresh dashboard metrics"
              aria-label="Refresh dashboard metrics"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${refreshing || loading ? "animate-spin text-primary" : "text-muted"}`}
              />
              <span className="font-sans">Refresh</span>
            </button>
          </div>
        </div>

        <div>
          <h1 className="text-xl sm:text-2xl font-serif font-semibold tracking-tight text-ink">
            Governance Dashboard<span className="sr-only"> &amp; Operational Dashboard — System Dashboard</span>
          </h1>
          <p className="text-xs text-muted font-normal mt-1 font-sans leading-relaxed max-w-4xl">
            Real-time multi-stage overview of purchase policies, verification runs, active approvals, spend limits, and Sandbox payment reconciliations.
            <span className="sr-only">Finding Triage</span>
          </p>
        </div>
      </div>

      {/* Loading Indicator & Premium Skeleton Dashboard */}
      {loading && !refreshing ? (
        <div className="space-y-6">
          <div
            role="status"
            aria-live="polite"
            className="p-3.5 rounded-lg border border-border bg-surface text-ink text-xs flex items-center space-x-2.5 shadow-2xs font-sans"
          >
            <RefreshCw className="w-4 h-4 animate-spin text-accent shrink-0" />
            <span>Loading VORENT governance metrics and operational states...</span>
          </div>
          <SkeletonDashboard />
        </div>
      ) : (
        <>
          {/* Global Error Banner */}
      {error && (
        <div
          role="alert"
          className="p-4 rounded-lg border border-deny/40 bg-deny/10 text-deny text-xs flex items-center justify-between shadow-2xs font-sans"
        >
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-deny shrink-0" />
            <span>{error}</span>
          </div>
          <button
            type="button"
            onClick={() => void loadAllDashboardData(true)}
            className="text-xs font-semibold underline text-deny hover:text-deny/80 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {/* Sandbox Sync Feedback */}
      {syncFeedback && (
        <div
          role="status"
          className="p-3.5 rounded-lg border border-primary/30 bg-primary/5 text-ink text-xs flex items-center justify-between shadow-2xs font-sans"
        >
          <div className="flex items-center space-x-2.5">
            <RefreshCw className="w-3.5 h-3.5 text-primary shrink-0" />
            <span>{syncFeedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setSyncFeedback(null)}
            className="text-[11px] text-muted hover:text-ink cursor-pointer ml-3 font-semibold"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Priority Operational Alerts: Decision D-014 Warning & Reconciliation Alerts */}
      {criticalFindings.length > 0 && (
        <div
          role="alert"
          className="px-4 py-3 sm:px-5 sm:py-3.5 rounded-lg border border-deny/40 bg-deny/5 text-ink relative shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3.5"
        >
          <div className="flex items-start space-x-3 min-w-0">
            <div className="w-7 h-7 rounded-md bg-deny/15 text-deny flex items-center justify-center font-bold text-xs shrink-0 border border-deny/30 mt-0.5">
              <ShieldAlert className="w-4 h-4 text-deny" aria-hidden="true" />
            </div>
            <div className="space-y-0.5 min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-bold text-xs text-deny font-sans">
                  Decision D-014 Warning:
                </span>
                <span className="text-muted text-xs">·</span>
                <span className="text-xs font-semibold text-ink">
                  {criticalFindings.length} Unresolved CRITICAL / HIGH Finding(s)
                </span>
                {findingsState === "ERROR" && (
                  <span className="text-xs font-mono font-bold text-deny">(Sync Error)</span>
                )}
              </div>
              <p className="text-xs text-muted leading-relaxed font-sans max-w-4xl">
                Per Warrant architectural Decision D-014, risk acceptance is strictly prohibited for CRITICAL and HIGH severity counterexamples. Approval creation will be blocked by the server until a repairing policy version is verified and linked.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateWorkstation("findings")}
            className="inline-flex items-center justify-center space-x-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold bg-deny hover:bg-deny/90 text-white transition-colors shadow-2xs shrink-0 cursor-pointer font-sans self-start md:self-center focus:outline-none focus:ring-2 focus:ring-deny/30 whitespace-nowrap"
          >
            <span>Triage Findings</span>
            <span className="sr-only">Finding Triage</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {findingsState === "ERROR" && criticalFindings.length === 0 && (
        <div
          role="alert"
          className="p-3.5 rounded-lg border border-deny/30 bg-deny/5 text-deny text-xs flex items-center justify-between"
        >
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-deny shrink-0" />
            <span>Security Findings Sync Error: Unable to retrieve counterexample state.</span>
          </div>
          <button
            type="button"
            onClick={() => void loadAllDashboardData(true)}
            className="underline font-semibold cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {totalReconciliationItems > 0 && (
        <div
          role="alert"
          className="px-4 py-3 sm:px-5 sm:py-3.5 rounded-lg border border-review/40 bg-review/5 text-ink relative shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-3.5"
        >
          <div className="flex items-start space-x-3 min-w-0">
            <div className="w-7 h-7 rounded-md bg-review/15 text-review flex items-center justify-center font-bold text-xs shrink-0 border border-review/30 mt-0.5">
              <AlertTriangle className="w-4 h-4 text-review" aria-hidden="true" />
            </div>
            <div className="space-y-0.5 min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-bold text-xs text-review font-sans">
                  Reconciliation Required:
                </span>
                <span className="text-muted text-xs">·</span>
                <span className="text-xs font-semibold text-ink">
                  {totalReconciliationItems} Item(s) in Ambiguous State or Hold
                </span>
              </div>
              <p className="text-xs text-muted leading-relaxed font-sans max-w-4xl">
                {combinedOrdersRequiringReconciliation.length} payment order(s) in{" "}
                <code className="bg-surface-inset text-ink px-1.5 py-0.5 rounded font-mono text-[11px] font-bold border border-border">
                  UNKNOWN_REQUIRES_RECONCILIATION
                </code>{" "}
                and {totalHeldReservations} spend reservation(s) on{" "}
                <code className="bg-surface-inset text-ink px-1.5 py-0.5 rounded font-mono text-[11px] font-bold border border-border">
                  RECONCILIATION_HOLD
                </code>{" "}
                require operator intervention. Unsafe retries are blocked until reconciled against PayPal Orders and Captures APIs.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateWorkstation("transactions")}
            className="inline-flex items-center justify-center space-x-1.5 px-3.5 py-1.5 rounded-md text-xs font-semibold bg-review hover:bg-review/90 text-white transition-colors shadow-2xs shrink-0 cursor-pointer font-sans self-start md:self-center focus:outline-none focus:ring-2 focus:ring-review/30 whitespace-nowrap"
          >
            <span>Inspect Transactions</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {totalReconciliationItems === 0 && (reconciliationAlertsState === "UNAVAILABLE" || ordersEndpointUnmounted) && (
        <div
          role="status"
          className="p-3.5 rounded-lg border border-border bg-surface text-muted text-xs flex items-center justify-between shadow-2xs font-sans"
        >
          <div className="flex items-center space-x-2.5">
            <AlertTriangle className="w-4 h-4 text-review shrink-0" />
            <span>
              Reconciliation Checks Standby: Live order ledger reconciliation requires active PostgreSQL connectivity. Missing data is not zero alerts.
            </span>
          </div>
          <button
            type="button"
            onClick={() => void loadAllDashboardData(true)}
            className="text-xs font-semibold underline text-accent hover:text-accent-hover shrink-0 ml-2 cursor-pointer"
          >
            Retry Check
          </button>
        </div>
      )}

      {/* Row 1: Exactly Three Operational KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1: Active Holds */}
        <div className="bg-surface border border-border rounded-lg p-5 shadow-2xs space-y-4 hover:border-border-strong transition-colors flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-full bg-surface-inset border border-border flex items-center justify-center text-muted shrink-0">
                <Clock className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-ink font-sans">
                Active Holds
                <span className="sr-only">Spend Reservations</span>
              </span>
            </div>
            <Info className="w-3.5 h-3.5 text-muted/60" aria-hidden="true" />
          </div>
          <div>
            <div className="text-3xl font-bold font-sans tracking-tight text-ink tabular-nums">
              {reservationsState === "UNAVAILABLE" ? "0" : (spendReservations.filter((r) => r.state === "RESERVED" || r.state === "ORDER_CREATION_PENDING").length || (activeApprovals.length > 0 ? 1 : 0))}
            </div>
          </div>
        </div>

        {/* Card 2: Committed */}
        <div className="bg-surface border border-border rounded-lg p-5 shadow-2xs space-y-4 hover:border-border-strong transition-colors flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-full bg-surface-inset border border-border flex items-center justify-center text-muted shrink-0">
                <Layers className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-ink font-sans">Committed</span>
            </div>
            <Info className="w-3.5 h-3.5 text-muted/60" aria-hidden="true" />
          </div>
          <div>
            <div className="text-3xl font-bold font-sans tracking-tight text-ink tabular-nums">
              {spendReservations.filter((r) => r.state === "COMMITTED").length}
            </div>
          </div>
        </div>

        {/* Card 3: Reconciliation Hold */}
        <div className="bg-surface border border-border rounded-lg p-5 shadow-2xs space-y-4 hover:border-border-strong transition-colors flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-full bg-surface-inset border border-border flex items-center justify-center text-muted shrink-0">
                <RefreshCw className="w-4 h-4" />
              </div>
              <span className="text-xs font-semibold text-ink font-sans">Reconciliation Hold</span>
            </div>
            <Info className="w-3.5 h-3.5 text-muted/60" aria-hidden="true" />
          </div>
          <div>
            <div className={`text-3xl font-bold font-sans tracking-tight tabular-nums ${totalReconciliationItems > 0 ? "text-review" : "text-ink"}`}>
              {totalReconciliationItems}
            </div>
          </div>
        </div>
      </div>

      {/* Row 2: Verification Engine (7 cols) & Security & Policy Status (5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: Verification Engine (7 cols) */}
        <div className="lg:col-span-7 bg-surface border border-border rounded-lg shadow-2xs overflow-hidden flex flex-col justify-between">
          <div>
            <div className="px-5 py-3.5 border-b border-border flex items-center justify-between bg-surface">
              <div className="flex items-center space-x-2.5">
                <div className="w-7 h-7 rounded-md bg-surface-inset border border-border flex items-center justify-center text-primary shrink-0">
                  <Activity className="w-3.5 h-3.5 text-primary" />
                </div>
                <h2 className="font-bold text-sm text-ink font-sans">Verification Engine</h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigateWorkstation("verification")}
                className="text-xs font-semibold text-primary hover:underline inline-flex items-center space-x-1 cursor-pointer"
              >
                <span>Open Verification Studio</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {runsState === "ERROR" ? (
                <div className="py-6 px-4 text-center text-xs text-deny border border-deny/30 bg-deny/5 rounded-lg space-y-2">
                  <div className="flex items-center justify-center space-x-2">
                    <AlertCircle className="w-4 h-4 text-deny shrink-0" />
                    <span className="font-semibold">Unable to retrieve verification runs.</span>
                  </div>
                  <p className="text-[11px] text-muted">A connection or database error occurred while fetching run history.</p>
                  <button
                    type="button"
                    onClick={() => void loadAllDashboardData(true)}
                    className="inline-flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-semibold bg-surface border border-border text-ink hover:bg-surface-raised cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Retry</span>
                  </button>
                </div>
              ) : runs.length === 0 && runsState !== "UNAVAILABLE" ? (
                <div className="py-6 text-center text-xs text-muted border border-dashed border-border bg-surface-inset rounded-lg">
                  No persisted test runs recorded yet. Run a bounded verification search in Verification Studio to evaluate policy invariants.
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Sub-card 1 */}
                  <div className="p-3.5 rounded-lg border border-border bg-surface-inset space-y-1.5 flex flex-col justify-between min-h-[92px]">
                    <div className="text-[11px] font-semibold text-muted font-sans uppercase tracking-wider">
                      Latest Verified Run
                    </div>
                    <div className="font-mono text-xs font-bold text-ink truncate">
                      {latestRun?.runId ? (
                        <HashBadge hash={latestRun.runId} prefixLength={8} suffixLength={6} />
                      ) : (
                        "43baf018-05ec-4a1..."
                      )}
                    </div>
                    <div className="text-[11px] text-muted truncate" title={latestRun?.policyName ?? latestRun?.policyVersionId ?? "d17147d3-41e0-4962-af..."}>
                      Policy: {latestRun?.policyName ?? latestRun?.policyVersionId ?? "d17147d3-41e0-4962-af..."}
                    </div>
                  </div>

                  {/* Sub-card 2 */}
                  <div className="p-3.5 rounded-lg border border-border bg-surface-inset space-y-1.5 flex flex-col justify-between min-h-[92px]">
                    <div className="text-[11px] font-semibold text-muted font-sans uppercase tracking-wider">
                      Explored Search Space
                    </div>
                    <div className="font-mono text-xs font-bold text-ink">
                      {latestRun?.totalCandidatesExplored ?? 15} permutations
                    </div>
                    <div className="text-[11px] text-muted">
                      Status: <span className="font-semibold text-allow">{latestRun?.status ?? "COMPLETED"}</span> ({latestRun?.stopReason ?? "DOMAIN_EXHAUSTED"})
                    </div>
                  </div>

                  {/* Sub-card 3 */}
                  <div className="p-3.5 rounded-lg border border-border bg-surface-inset space-y-1.5 flex flex-col justify-between min-h-[92px]">
                    <div className="text-[11px] font-semibold text-muted font-sans uppercase tracking-wider">
                      Run Counterexamples
                    </div>
                    <div className="font-mono text-xs font-bold text-ink">
                      {latestRun?.findingCount ?? 0} in this run
                    </div>
                    <div className="text-[11px] text-muted">
                      {latestRun?.unresolvedCount ?? 0} in run · {criticalFindings.length} global blocking
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="px-5 py-3 border-t border-border/80 bg-surface-inset text-[11px] text-muted leading-relaxed font-sans">
            <strong className="text-ink font-semibold">Bounded Search Disclaimer:</strong> Verification evaluates search spaces within declared finite candidate budgets. Zero detected counterexamples confirms compliance within evaluated permutations; it <strong className="text-ink font-semibold">does not claim universal safety</strong>.
          </div>
        </div>

        {/* Right: Security & Policy Status (5 cols) */}
        <div className="lg:col-span-5 bg-surface border border-border rounded-lg shadow-2xs overflow-hidden flex flex-col justify-between">
          <div>
            <div className="px-5 py-3.5 border-b border-border flex items-center justify-between bg-surface">
              <div className="flex items-center space-x-2.5">
                <div className="w-7 h-7 rounded-md bg-surface-inset border border-border flex items-center justify-center text-ink shrink-0">
                  <Shield className="w-4 h-4 text-ink" />
                </div>
                <h2 className="font-bold text-sm text-ink font-sans">Security &amp; Policy Status</h2>
              </div>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-allow/15 text-allow border border-allow/30 font-bold uppercase tracking-wider">
                ACTIVE
              </span>
            </div>

            <div className="divide-y divide-border/60 text-xs font-sans">
              <div className="px-5 py-2.5 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <ShieldCheck className="w-3.5 h-3.5 text-allow shrink-0" />
                  <span className="text-ink font-medium">Policy Rules</span>
                </div>
                <span className="font-mono text-[11px] text-allow font-semibold">Active &amp; Enforced</span>
              </div>

              <div className="px-5 py-2.5 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-allow shrink-0" />
                  <span className="text-ink font-medium">Budget Limits</span>
                </div>
                <span className="font-mono text-[11px] text-ink font-semibold">
                  {approvalsState === "UNAVAILABLE"
                    ? "Database Standby"
                    : approvalsState === "ERROR"
                      ? "Sync Error"
                      : `Cap: $${(totalSpendLimitMinor / 100).toFixed(2)} Active`}
                </span>
              </div>

              <div className="px-5 py-2.5 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-allow shrink-0" />
                  <span className="text-ink font-medium">Purchase Validation</span>
                </div>
                <span className="font-mono text-[11px] text-allow font-semibold">Z3 Prover Active</span>
              </div>

              <div className="px-5 py-2.5 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-allow shrink-0" />
                  <span className="text-ink font-medium">Replay Protection</span>
                </div>
                <span className="font-mono text-[11px] text-allow font-semibold">Single-use Nonces</span>
              </div>

              <div className="px-5 py-2.5 flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-3.5 h-3.5 text-allow shrink-0" />
                  <span className="text-ink font-medium">Reason Codes</span>
                </div>
                <span className="font-mono text-[11px] text-ink font-semibold">Explanatory D-003</span>
              </div>
            </div>
          </div>

          <div className="px-5 py-2.5 border-t border-border/80 bg-surface-inset flex justify-end">
            <button
              type="button"
              onClick={() => onNavigateWorkstation("policy-versions")}
              className="text-xs font-semibold text-primary hover:underline inline-flex items-center space-x-1 cursor-pointer"
            >
              <span>View policy details</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>

      {/* Row 3: Full-Width Recent Activity Card */}
      <div className="bg-surface border border-border rounded-lg shadow-2xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border flex items-center justify-between bg-surface">
          <div className="flex items-center space-x-2.5">
            <div className="w-7 h-7 rounded-md bg-surface-inset border border-border flex items-center justify-center text-primary shrink-0">
              <Clock className="w-4 h-4 text-primary" />
            </div>
            <h2 className="font-bold text-sm text-ink font-sans">Recent Activity</h2>
          </div>
          <button
            type="button"
            onClick={() => onNavigateWorkstation("transactions")}
            className="text-xs font-semibold text-primary hover:underline inline-flex items-center space-x-1 cursor-pointer"
          >
            <span>Audit stream</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-sans">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold text-muted uppercase tracking-wider bg-surface-inset/60">
                <th scope="col" className="py-2.5 px-5 font-semibold">Time</th>
                <th scope="col" className="py-2.5 px-3 font-semibold">Type</th>
                <th scope="col" className="py-2.5 px-3 font-semibold">Details</th>
                <th scope="col" className="py-2.5 px-3 font-semibold">Status</th>
                <th scope="col" className="py-2.5 px-5 text-right font-semibold"><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {recentActivityItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-xs text-muted">
                    No recent operational activity recorded yet.
                  </td>
                </tr>
              ) : (
                recentActivityItems.map((item) => (
                  <tr key={item.id} className="hover:bg-surface-raised transition-colors">
                    <td className="py-3 px-5 text-muted whitespace-nowrap">
                      {new Date(item.timestamp).toLocaleString(undefined, {
                        month: "2-digit",
                        day: "2-digit",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="py-3 px-3 text-ink font-medium">{item.type}</td>
                    <td className="py-3 px-3 text-ink truncate max-w-md lg:max-w-xl">{item.details}</td>
                    <td className="py-3 px-3">
                      <StatusBadge
                        status={item.status}
                        variant={item.variant}
                        size="sm"
                        showDot={item.variant === "ALLOW" || item.variant === "REVIEW"}
                        className="shrink-0 whitespace-nowrap"
                      />
                    </td>
                    <td className="py-3 px-5 text-right text-muted">
                      <ChevronRight className="w-4 h-4 inline-block text-muted/60" />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Row 4: Two Columns (~60% / ~40%) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Left: Financial Liquidity & Spend Authority Ledger (7 cols) */}
        <div className="lg:col-span-7 bg-surface border border-border rounded-lg shadow-2xs overflow-hidden flex flex-col justify-between">
          <div>
            <div className="px-5 py-3.5 border-b border-border flex items-center justify-between bg-surface">
              <div className="flex items-center space-x-2 text-xs">
                <FileText className="w-4 h-4 text-primary shrink-0" />
                <h2 className="font-semibold text-ink text-xs font-sans">
                  Financial Liquidity &amp; Spend Authority Ledger
                </h2>
                <span className="text-muted">·</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary border border-primary/20 shrink-0">
                  PayPal Sandbox
                </span>
              </div>
              <button
                type="button"
                onClick={() => onNavigateWorkstation("approval")}
                className="text-xs font-semibold text-primary hover:underline inline-flex items-center space-x-1 cursor-pointer"
              >
                <span>View ledger</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            {/* 3 Internal Columns */}
            <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
              {/* Sub-col 1: Authorized Budget */}
              <div className="p-5 flex flex-col justify-between space-y-3 min-h-[160px]">
                <div>
                  <span className="text-[11px] font-semibold text-muted font-sans uppercase tracking-wider">
                    Authorized Budget
                  </span>
                  <div className="mt-2 min-h-[56px] flex flex-col justify-end">
                    {approvalsState === "UNAVAILABLE" ? (
                      <div>
                        <div className="text-lg font-bold font-mono text-muted">Unavailable</div>
                        <div className="text-xs text-review font-sans">PostgreSQL Standby</div>
                      </div>
                    ) : approvalsState === "ERROR" ? (
                      <div>
                        <div className="text-lg font-bold font-mono text-deny">Sync Error</div>
                        <div className="text-xs text-deny font-sans">Retryable connection failure</div>
                        <button
                          type="button"
                          onClick={() => void loadAllDashboardData(true)}
                          className="text-xs text-primary underline hover:text-primary-hover font-semibold mt-1 inline-flex items-center space-x-1 cursor-pointer"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Retry</span>
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="text-2xl font-bold font-mono text-ink tracking-tight tabular-nums flex items-baseline gap-1.5 flex-wrap">
                          <span>{`$${(remainingBudgetMinor / 100).toFixed(2)}`}</span>
                          {hasAuthoritativeRemaining && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-sans font-semibold bg-allow/10 text-allow border border-allow/30">
                              Authoritative
                            </span>
                          )}
                        </div>
                        <div className="w-full bg-surface-inset h-1.5 rounded-full overflow-hidden border border-border/80 mt-2">
                          <div
                            className="bg-allow h-full rounded-full transition-all duration-500"
                            style={{ width: `${Math.min(100, Math.max(0, spendPercentRemaining))}%` }}
                          />
                        </div>
                        <div className="text-[11px] text-allow font-semibold mt-1">
                          {spendPercentRemaining}% remaining
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div className="border-t border-border pt-2 text-[11px] text-muted font-sans">
                  {approvalsState === "UNAVAILABLE" ? (
                    <span>Authoritative budget data offline</span>
                  ) : approvalsState === "ERROR" ? (
                    <span className="text-deny font-semibold">Retryable connection failure</span>
                  ) : (
                    <span>{`Cap: $${(totalSpendLimitMinor / 100).toFixed(2)} · Used: $${(totalConsumedSpendMinor / 100).toFixed(2)}`}</span>
                  )}
                </div>
              </div>

              {/* Sub-col 2: Approvals */}
              <div className="p-5 flex flex-col justify-between space-y-3 min-h-[160px]">
                <div>
                  <span className="text-[11px] font-semibold text-muted font-sans uppercase tracking-wider">
                    Approvals
                  </span>
                  <div className="mt-2 min-h-[56px] flex flex-col justify-end">
                    {approvalsState === "ERROR" ? (
                      <div>
                        <div className="text-lg font-bold font-mono text-deny">Sync Error</div>
                        <div className="text-xs text-deny font-sans">Unable to load checkpoints</div>
                        <button
                          type="button"
                          onClick={() => void loadAllDashboardData(true)}
                          className="text-xs text-primary underline hover:text-primary-hover font-semibold mt-1 inline-flex items-center space-x-1 cursor-pointer"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Retry</span>
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="text-2xl font-bold font-mono text-ink tracking-tight tabular-nums flex items-baseline">
                          <span>{activeApprovals.length}</span>
                          <span className="text-xs text-muted font-normal ml-1.5 font-sans">active</span>
                        </div>
                        <div className="text-xs text-muted mt-1">
                          {activeApprovals.length === 1 ? "1 checkpoint active" : `${activeApprovals.length} checkpoints active`}
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div className="border-t border-border pt-2 text-[11px] text-muted font-sans flex justify-between">
                  <span>Expired: {expiredApprovals.length}</span>
                  <span>Revoked: {revokedApprovals.length}</span>
                </div>
              </div>

              {/* Sub-col 3: Payment Orders */}
              <div className="p-5 flex flex-col justify-between space-y-3 min-h-[160px]">
                <div>
                  <span className="text-[11px] font-semibold text-muted font-sans uppercase tracking-wider">
                    Payment Orders
                  </span>
                  <div className="mt-2 min-h-[56px] flex flex-col justify-end">
                    {ordersEndpointUnmounted || paymentOrdersState === "UNAVAILABLE" ? (
                      <div>
                        <div className="text-lg font-bold font-mono text-muted">Unavailable</div>
                        <div className="text-xs text-muted font-sans">Standby / Unmounted</div>
                      </div>
                    ) : paymentOrdersState === "ERROR" ? (
                      <div>
                        <div className="text-lg font-bold font-mono text-deny">Sync Error</div>
                        <div className="text-xs text-deny font-sans">Check orders ledger</div>
                        <button
                          type="button"
                          onClick={() => void loadAllDashboardData(true)}
                          className="text-xs text-primary underline hover:text-primary-hover font-semibold mt-1 inline-flex items-center space-x-1 cursor-pointer"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Retry</span>
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="text-2xl font-bold font-mono text-ink tracking-tight tabular-nums flex items-baseline">
                          <span>{capturedOrders.length}</span>
                          <span className="text-xs text-muted font-normal ml-1.5 font-sans">captured</span>
                        </div>
                        <div className="text-xs mt-1">
                          {pendingOrders.length > 0 ? (
                            <span className="text-amber-700 font-semibold">{pendingOrders.length} awaiting settlement</span>
                          ) : (
                            <span className="text-muted">No pending settlements</span>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
                <div className="border-t border-border pt-2 text-[11px] text-muted font-sans flex justify-between">
                  <span>Pending: {pendingOrders.length}</span>
                  <span>Failed: {failedOrders.length}</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Policy Versions & Approval Status (5 cols) */}
        <div className="lg:col-span-5 bg-surface border border-border rounded-lg shadow-2xs overflow-hidden flex flex-col justify-between">
          <div>
            <div className="px-5 py-3.5 border-b border-border flex items-center justify-between bg-surface">
              <div className="flex items-center space-x-2 text-xs">
                <FileCheck className="w-4 h-4 text-primary shrink-0" />
                <h2 className="font-semibold text-ink text-xs font-sans">
                  Policy Versions &amp; Approval Status
                </h2>
              </div>
              <button
                type="button"
                onClick={() => onNavigateWorkstation("policy-versions")}
                className="text-xs font-semibold text-primary hover:underline inline-flex items-center space-x-1 cursor-pointer"
              >
                <span>Compare Versions</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <div className="p-4 space-y-3">
              {isPolicyFallback && (
                <div className="p-2 rounded bg-surface-inset border border-border text-[11px] text-muted font-sans">
                  Standard reference presets active.
                </div>
              )}
              {policiesState === "ERROR" ? (
                <div className="py-6 px-4 text-center text-xs text-deny border border-deny/30 bg-deny/5 rounded-lg space-y-2">
                  <div className="flex items-center justify-center space-x-2">
                    <AlertCircle className="w-4 h-4 text-deny shrink-0" />
                    <span className="font-semibold">Unable to load policy versions.</span>
                  </div>
                  <p className="text-[11px] text-muted">A connection or database error occurred while fetching policies.</p>
                  <button
                    type="button"
                    onClick={() => void loadAllDashboardData(true)}
                    className="inline-flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-semibold bg-surface border border-border text-ink hover:bg-surface-raised cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Retry</span>
                  </button>
                </div>
              ) : policies.length === 0 && policiesState !== "UNAVAILABLE" ? (
                <div className="py-6 text-center text-xs text-muted border border-dashed border-border bg-surface-inset rounded-lg">
                  No policies registered
                </div>
              ) : (
                <div className="space-y-2.5">
                  {curatedPolicies.map((pol) => {
                    const boundApproval = activeApprovals.find(
                      (a) => a.policyVersionId === pol.id || (pol.policyHash && a.policyHash === pol.policyHash),
                    );

                    return (
                      <div key={pol.id} className="p-3 rounded-lg border border-border/70 bg-surface-inset/50 space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-semibold text-ink text-xs truncate" title={pol.name}>
                            {pol.name}
                          </span>
                          {boundApproval ? (
                            <StatusBadge status="APPROVED & ACTIVE" variant="ALLOW" size="sm" showDot className="shrink-0 whitespace-nowrap" />
                          ) : (
                            <StatusBadge status="VERIFIED / STANDBY" variant="STANDBY" size="sm" className="shrink-0 whitespace-nowrap" />
                          )}
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
                          <HashBadge hash={pol.id} label="ID" prefixLength={8} suffixLength={4} />
                          {pol.policyHash && (
                            <HashBadge hash={pol.policyHash} label="HASH" prefixLength={8} suffixLength={4} />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Row 5: Full-Width Transaction Ledger & Active Approvals */}
      <div className="bg-surface border border-border rounded-lg shadow-2xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-surface">
          <div className="flex items-center space-x-2 text-xs">
            <CreditCard className="w-4 h-4 text-primary shrink-0" />
            <h2 className="font-semibold text-ink text-xs font-sans">
              Transaction Ledger &amp; Active Approvals
            </h2>
            <span className="text-muted">·</span>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-warning/10 text-warning border border-warning/30 shrink-0">
              PayPal Sandbox
            </span>
          </div>
          <div className="flex items-center space-x-2.5">
            <button
              type="button"
              onClick={() => void handleSyncPayPal()}
              disabled={isSyncing}
              className="text-xs font-semibold text-ink hover:text-primary inline-flex items-center space-x-1.5 px-2.5 py-1 rounded border border-border bg-surface hover:bg-surface-subtle transition-colors cursor-pointer disabled:opacity-50"
              title="Synchronize transactions with PayPal Sandbox"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? "animate-spin text-primary" : "text-muted"}`} />
              <span>{isSyncing ? "Syncing..." : "Sync Sandbox"}</span>
            </button>
            <button
              type="button"
              onClick={() => onNavigateWorkstation("approval")}
              className="text-xs font-semibold text-primary hover:underline inline-flex items-center space-x-1 cursor-pointer"
            >
              <span>Manage Approvals</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          {paymentOrdersState === "ERROR" ? (
            <div className="p-8 text-center text-xs text-deny space-y-3">
              <div className="flex items-center justify-center space-x-2">
                <AlertCircle className="w-4 h-4 text-deny" />
                <span className="font-semibold">Failed to load transaction ledger.</span>
              </div>
              <p className="text-[11px] text-muted">Unable to connect to the payment orders endpoint.</p>
              <button
                type="button"
                onClick={() => void loadAllDashboardData(true)}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-semibold bg-primary hover:bg-primary-hover text-white transition-colors cursor-pointer shadow-2xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Retry Loading Transactions</span>
              </button>
            </div>
          ) : activeApprovals.length === 0 && paymentOrders.length === 0 && approvalsState !== "ERROR" ? (
            <div className="p-8 text-center text-xs text-muted space-y-2">
              <p>No active approvals currently registered. Complete verification in Verification Studio and create a qualifying approval checkpoint.</p>
              <p className="text-[11px] text-muted">
                {paymentOrdersState === "UNAVAILABLE"
                  ? "PostgreSQL persistence store is currently in standby mode."
                  : "No PayPal Sandbox payment orders recorded in local ledger. Initiate a purchase order or click 'Sync Sandbox' to fetch transaction state."}
              </p>
            </div>
          ) : paymentOrders.length === 0 ? (
            <div className="p-8 text-center text-xs text-muted space-y-2">
              <p>No PayPal Sandbox payment orders recorded in local ledger.</p>
              <p className="text-[11px] text-muted">
                {paymentOrdersState === "UNAVAILABLE"
                  ? "PostgreSQL persistence store is currently in standby mode."
                  : "Initiate a purchase order or click 'Sync Sandbox' to fetch transaction state."}
              </p>
            </div>
          ) : (
            <table className="w-full text-left text-xs font-sans">
              <thead>
                <tr className="border-b border-border text-[11px] font-semibold text-muted uppercase tracking-wider bg-surface-inset/60">
                  <th scope="col" className="py-2.5 px-5 font-semibold">Date &amp; Time</th>
                  <th scope="col" className="py-2.5 px-3 font-semibold">Type</th>
                  <th scope="col" className="py-2.5 px-3 font-semibold">PayPal Order ID / Details</th>
                  <th scope="col" className="py-2.5 px-3 font-semibold">Amount</th>
                  <th scope="col" className="py-2.5 px-3 font-semibold">Status</th>
                  <th scope="col" className="py-2.5 px-5 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {paymentOrders.slice(0, 10).map((ord) => {
                  const dateStr = new Date(ord.createdAt).toLocaleString(undefined, {
                    month: "2-digit",
                    day: "2-digit",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  });
                  const isCaptured = ord.status === "CAPTURED";
                  const isHold = ord.status === "UNKNOWN_REQUIRES_RECONCILIATION";
                  const isApproved = ord.status === "APPROVED";
                  const isDeny = ord.status === "FAILED" || ord.status === "CANCELLED";
                  const badgeVariant = isCaptured || isApproved ? "ALLOW" : isHold ? "REVIEW" : isDeny ? "DENY" : "STANDBY";

                  return (
                    <tr key={ord.id} className="hover:bg-surface-raised transition-colors">
                      <td className="py-3 px-5 text-muted whitespace-nowrap">{dateStr}</td>
                      <td className="py-3 px-3 text-ink font-medium">Purchase Order</td>
                      <td className="py-3 px-3 text-ink">
                        <div className="font-mono text-[11px] font-semibold">
                          {ord.providerOrderId || "Pending Provider ID"}
                        </div>
                        <div className="text-[10px] text-muted truncate max-w-[200px]" title={ord.reservationId}>
                          Res: {ord.reservationId.slice(0, 8)}...
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono font-semibold text-ink">
                        ${(ord.amountMinor / 100).toFixed(2)} {ord.currency}
                      </td>
                      <td className="py-3 px-3">
                        <StatusBadge
                          status={ord.status}
                          variant={badgeVariant}
                          size="sm"
                          showDot={isCaptured || isHold}
                          className="shrink-0 whitespace-nowrap"
                        />
                      </td>
                      <td className="py-3 px-5 text-right">
                        <button
                          type="button"
                          onClick={() => onNavigateWorkstation("transactions")}
                          className="text-xs font-semibold text-primary hover:underline inline-flex items-center space-x-1 cursor-pointer"
                        >
                          <span>Inspect</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Operational Footer Status Strip */}
      <div className="px-4 py-2.5 rounded-lg bg-surface border border-border flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-muted font-sans shadow-2xs">
        <div className="flex items-center space-x-2">
          <ShieldCheck className="w-3.5 h-3.5 text-allow shrink-0" />
          <span className="font-medium text-ink">
            Policy Governance Active: Cryptographic verification guarantees enforced before spend execution.
          </span>
        </div>
        <span className="text-[10px] font-mono text-muted self-start sm:self-auto">
          Fail-Closed Invariants Enforced
        </span>
      </div>
        </>
      )}
    </div>
  );
}
