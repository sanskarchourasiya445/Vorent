import { useState, useEffect, useCallback, useMemo } from "react";
import {
  CreditCard,
  Search,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  UserCheck,
  Eye,
  X,
  Scale,
  FileText,
  Lock,
} from "lucide-react";
import {
  getPaymentOrder,
  listPaymentOrders,
  getReconciliationAlerts,
  listPayPalTransactions,
  confirmBuyerApproval,
  capturePaymentOrder,
  cancelPaymentOrder,
  reconcilePaymentOrder,
  getPayPalAuthStatus,
  syncPayPalTransactions,
  createPayPalTestOrder,
  PaymentOrderError,
} from "../../api/paymentOrderService";
import type {
  PaymentOrderRecord,
  ReservationState,
  PayPalAuthStatusResponse,
  PayPalTransaction,
  CreateTestSandboxOrderResponse,
} from "@warrant/contracts";
import { HashBadge } from "../ui/HashBadge";
import { StatusBadge } from "../ui/StatusBadge";
import { Skeleton, SkeletonCodeBlock } from "../ui/Skeleton";

interface TransactionsPanelProps {
  initialOrderId?: string;
}

export function TransactionsPanel({ initialOrderId }: TransactionsPanelProps) {
  const [activeTab, setActiveTab] = useState<"LEDGER" | "RECONCILIATION">("LEDGER");
  const [searchQuery, setSearchQuery] = useState(initialOrderId || "");
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [order, setOrder] = useState<PaymentOrderRecord | null>(null);
  const [reservationState, setReservationState] = useState<ReservationState | string>("RESERVED");
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isAmbiguous, setIsAmbiguous] = useState(false);
  const [reconciliationNotes, setReconciliationNotes] = useState<string | null>(null);
  const [showCaptureConfirm, setShowCaptureConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [payerIdInput, setPayerIdInput] = useState("");

  // PayPal Sandbox Auth & Operations State
  const [authStatus, setAuthStatus] = useState<PayPalAuthStatusResponse | null>(null);
  const [syncingPayPal, setSyncingPayPal] = useState(false);
  const [creatingTestOrder, setCreatingTestOrder] = useState(false);
  const [createdTestOrder, setCreatedTestOrder] = useState<CreateTestSandboxOrderResponse | null>(null);

  // Multi-row overview table state
  const [recentOrders, setRecentOrders] = useState<PaymentOrderRecord[]>([]);
  const [recentOrdersState, setRecentOrdersState] = useState<"IDLE" | "LOADING" | "READY" | "EMPTY" | "UNAVAILABLE" | "ERROR">("IDLE");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");

  // Reconciliation Exception Queue & Alert Data
  const [alertsData, setAlertsData] = useState<{
    unreconciledOrders: PaymentOrderRecord[];
    heldReservations: any[];
    totalAlerts: number;
  }>({ unreconciledOrders: [], heldReservations: [], totalAlerts: 0 });

  // External PayPal Sandbox Transactions
  const [paypalTransactions, setPaypalTransactions] = useState<PayPalTransaction[]>([]);
  const [paypalTxState, setPaypalTxState] = useState<"IDLE" | "LOADING" | "READY" | "EMPTY" | "ERROR">("IDLE");

  const totalSettledMinor = useMemo(() => {
    return recentOrders
      .filter((o) => o.status === "CAPTURED")
      .reduce((sum, o) => sum + (o.amountMinor || 0), 0);
  }, [recentOrders]);

  const heldOrdersCount = useMemo(() => {
    return recentOrders.filter(
      (o) => o.status === "UNKNOWN_REQUIRES_RECONCILIATION" || o.status === "FAILED",
    ).length;
  }, [recentOrders]);

  const loadReconciliationData = useCallback(async () => {
    try {
      const alerts = await getReconciliationAlerts();
      setAlertsData({
        unreconciledOrders: alerts.unreconciledOrders || [],
        heldReservations: alerts.heldReservations || [],
        totalAlerts: alerts.totalAlerts || 0,
      });
    } catch {
      // Non-blocking in standby
    }

    setPaypalTxState("LOADING");
    try {
      const res = await listPayPalTransactions({ pageSize: 20 });
      setPaypalTransactions(res.transactions || []);
      setPaypalTxState(res.transactions && res.transactions.length > 0 ? "READY" : "EMPTY");
    } catch {
      setPaypalTxState("ERROR");
    }
  }, []);

  const loadRecentOrders = useCallback(async () => {
    setRecentOrdersState("LOADING");
    try {
      const res = await listPaymentOrders();
      setRecentOrdersState(res.state);
      setRecentOrders(res.orders || []);
    } catch {
      setRecentOrdersState("ERROR");
    }
    void loadReconciliationData();
  }, [loadReconciliationData]);

  const filteredRecentOrders = useMemo(() => {
    let result = recentOrders;

    // 1. Status Filter
    if (filterStatus === "CAPTURED") {
      result = result.filter((o) => o.status === "CAPTURED");
    } else if (filterStatus === "APPROVED") {
      result = result.filter((o) => o.status === "APPROVED");
    } else if (filterStatus === "PENDING") {
      result = result.filter((o) => o.status === "CREATED" || o.status === "PAYER_ACTION_REQUIRED" || o.status === "CAPTURE_PENDING");
    } else if (filterStatus === "HOLD") {
      result = result.filter(
        (o) => o.status === "UNKNOWN_REQUIRES_RECONCILIATION" || o.status === "FAILED",
      );
    } else if (filterStatus === "CANCELLED") {
      result = result.filter((o) => o.status === "CANCELLED" || o.status === "FAILED");
    }

    // 2. Keyword Search Filter
    if (ledgerSearch.trim()) {
      const q = ledgerSearch.toLowerCase().trim();
      result = result.filter(
        (o) =>
          o.id.toLowerCase().includes(q) ||
          (o.providerOrderId && o.providerOrderId.toLowerCase().includes(q)) ||
          (o.payerId && o.payerId.toLowerCase().includes(q)) ||
          (o.reservationId && o.reservationId.toLowerCase().includes(q)) ||
          o.status.toLowerCase().includes(q),
      );
    }

    return result;
  }, [recentOrders, filterStatus, ledgerSearch]);

  const handleFetchOrder = useCallback(async (idToFetch: string) => {
    if (!idToFetch.trim()) return;
    setLoading(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsAmbiguous(false);

    try {
      const fetched = await getPaymentOrder(idToFetch.trim());
      setOrder(fetched);
      if (fetched.payerId) setPayerIdInput(fetched.payerId);
    } catch (err) {
      if (err instanceof PaymentOrderError) {
        setErrorMessage(`Lookup failed: ${err.message}`);
        setIsAmbiguous(err.isAmbiguous);
      } else {
        setErrorMessage(err instanceof Error ? err.message : "Failed to load payment order.");
      }
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRecentOrders();
    void getPayPalAuthStatus()
      .then((st) => setAuthStatus(st))
      .catch(() => setAuthStatus(null));
  }, [loadRecentOrders]);

  const handleSyncPayPal = async () => {
    setSyncingPayPal(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await syncPayPalTransactions();
      setSuccessMessage(res.message);
      void loadRecentOrders();
    } catch (err: any) {
      setErrorMessage(`PayPal Sandbox sync failed: ${err?.message || String(err)}`);
    } finally {
      setSyncingPayPal(false);
    }
  };

  const handleCreateTestOrder = async () => {
    setCreatingTestOrder(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const res = await createPayPalTestOrder({
        amountMinor: 2500,
        currency: "USD",
        itemDescription: "VORENT Sandbox Verification Order",
      });
      setCreatedTestOrder(res);
      setSuccessMessage(`PayPal test order created: ${res.id} ($25.00 USD).`);
      setSearchQuery(res.id);
      void loadRecentOrders();
    } catch (err: any) {
      setErrorMessage(`Failed to create PayPal test order: ${err?.message || String(err)}`);
    } finally {
      setCreatingTestOrder(false);
    }
  };

  // Inspect URL parameters for PayPal buyer return tokens (?token=...&PayerID=...)
  useEffect(() => {
    if (typeof window !== "undefined" && window.location.search) {
      const params = new URLSearchParams(window.location.search);
      const token = params.get("token");
      const payerId = params.get("PayerID");
      const orderIdParam = params.get("orderId");

      if (token || orderIdParam) {
        const targetId = orderIdParam || token!;
        setSearchQuery(targetId);
        if (payerId) setPayerIdInput(payerId);
        void handleFetchOrder(targetId);
      }
    } else if (initialOrderId) {
      void handleFetchOrder(initialOrderId);
    }
  }, [initialOrderId, handleFetchOrder]);

  const handleConfirmApproval = async () => {
    if (!order) return;
    setActionLoading("confirming");
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsAmbiguous(false);

    try {
      const res = await confirmBuyerApproval({
        orderId: order.id,
        paypalOrderId: order.providerOrderId || undefined,
        payerId: payerIdInput.trim() || undefined,
      });

      setOrder(res.order);
      setReservationState(res.reservationState);
      setSuccessMessage(
        `Buyer approval confirmed by PayPal Orders API. Status is now ${res.order.status}. Next action: ${res.nextAction}.`,
      );
      void loadRecentOrders();
    } catch (err) {
      if (err instanceof PaymentOrderError) {
        setErrorMessage(err.message);
        setIsAmbiguous(err.isAmbiguous);
      } else {
        setErrorMessage(err instanceof Error ? err.message : "Buyer approval check failed.");
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleCapture = async () => {
    if (!order) return;
    setActionLoading("capturing");
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsAmbiguous(false);

    try {
      const res = await capturePaymentOrder({
        orderId: order.id,
        paypalOrderId: order.providerOrderId || undefined,
      });

      setOrder(res.order);
      setReservationState(res.reservationState);
      setSuccessMessage(
        `Payment captured successfully! Capture ID: ${res.captureId}. Amount: $${(res.capturedAmountMinor / 100).toFixed(2)} ${res.currency}.`,
      );
      setShowCaptureConfirm(false);
      void loadRecentOrders();
    } catch (err) {
      if (err instanceof PaymentOrderError) {
        setErrorMessage(err.message);
        setIsAmbiguous(err.isAmbiguous);
      } else {
        setErrorMessage(err instanceof Error ? err.message : "Payment capture failed.");
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancel = async () => {
    if (!order) return;
    setActionLoading("cancelling");
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsAmbiguous(false);

    try {
      const res = await cancelPaymentOrder({
        orderId: order.id,
        paypalOrderId: order.providerOrderId || undefined,
        reason: cancelReason.trim() || undefined,
      });

      setOrder(res.order);
      setReservationState(res.reservationState);
      setSuccessMessage("Order cancelled successfully. Spend reservation has been released.");
      setShowCancelConfirm(false);
      void loadRecentOrders();
    } catch (err) {
      if (err instanceof PaymentOrderError) {
        setErrorMessage(err.message);
        setIsAmbiguous(err.isAmbiguous);
      } else {
        setErrorMessage(err instanceof Error ? err.message : "Failed to cancel order.");
      }
    } finally {
      setActionLoading(null);
    }
  };

  const handleReconcile = async (targetOrderId?: string) => {
    const idToReconcile = targetOrderId || order?.id;
    if (!idToReconcile) return;

    setActionLoading(`reconciling_${idToReconcile}`);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await reconcilePaymentOrder({
        orderId: idToReconcile,
      });

      if (order && order.id === idToReconcile) {
        setOrder(res.order);
        setReservationState(res.reservationState);
        setReconciliationNotes(res.notes || null);
      }
      setIsAmbiguous(false);
      setSuccessMessage(
        `Reconciliation result for ${idToReconcile.slice(0, 8)}: status '${res.order.status}', externalStatus '${res.externalStatus || "N/A"}'. ${res.notes || ""}`,
      );
      void loadRecentOrders();
    } catch (err) {
      if (err instanceof PaymentOrderError) {
        setErrorMessage(err.message);
        setIsAmbiguous(err.isAmbiguous);
      } else {
        setErrorMessage(err instanceof Error ? err.message : "Reconciliation failed.");
      }
    } finally {
      setActionLoading(null);
    }
  };

  const isApproved = order?.status === "APPROVED";
  const isCaptured = order?.status === "CAPTURED";
  const isCancelled = order?.status === "CANCELLED";
  const isUnknown =
    order?.status === "UNKNOWN_REQUIRES_RECONCILIATION" ||
    isAmbiguous ||
    reservationState === "RECONCILIATION_HOLD";

  return (
    <div className="space-y-6 w-full" role="region" aria-label="Transactions Workstation">
      {/* Title & Actions Header */}
      <div className="border-b border-border pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <CreditCard className="w-4 h-4 text-primary" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-serif font-semibold tracking-tight text-ink">
                Transactions &amp; Payment Lifecycle
              </h1>
              <p className="text-xs text-muted mt-0.5 font-sans leading-relaxed">
                Authoritative PayPal Sandbox order inspection, buyer approval verification, server capture, and ledger reconciliation.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center space-x-2 self-start sm:self-auto flex-wrap gap-y-2">
          {alertsData.totalAlerts > 0 && (
            <button
              type="button"
              onClick={() => setActiveTab("RECONCILIATION")}
              className="inline-flex items-center space-x-1.5 h-8 px-2.5 rounded-md text-[11px] font-mono font-bold bg-review-bg text-review border border-review-border hover:bg-review-bg/80 transition-colors shadow-2xs"
            >
              <AlertCircle className="w-3.5 h-3.5 text-review shrink-0 animate-pulse" />
              <span>{alertsData.totalAlerts} Exceptions Pending</span>
            </button>
          )}

          <button
            type="button"
            data-testid="reconcile-orders-v2-btn"
            onClick={handleSyncPayPal}
            disabled={syncingPayPal}
            className="inline-flex items-center space-x-1.5 h-8 px-3 rounded-md text-xs font-semibold bg-primary hover:bg-primary-hover active:bg-primary-active text-white transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
            title="Authoritatively reconcile internal spend reservations against live PayPal capture state"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${syncingPayPal ? "animate-spin text-white" : "text-white/80"}`} />
            <span>{syncingPayPal ? "Reconciling Orders..." : "Reconcile with PayPal Orders v2"}</span>
          </button>

          <button
            type="button"
            onClick={handleCreateTestOrder}
            disabled={creatingTestOrder}
            className="inline-flex items-center space-x-1.5 h-8 px-3 rounded-md text-xs font-semibold bg-primary hover:bg-primary-hover active:bg-primary-active text-white transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
            title="Create a sample test order in PayPal Sandbox"
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>{creatingTestOrder ? "Creating..." : "Create Test Order"}</span>
          </button>
        </div>
      </div>

      {/* Sandbox Connection & Status Bar */}
      {authStatus && (
        <div className="p-3.5 rounded-lg border border-border bg-surface text-xs font-sans space-y-1.5 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              <span className={`w-2 h-2 rounded-full ${authStatus.authenticated ? "bg-allow" : "bg-deny"}`} />
              <span className="font-semibold text-ink">
                PayPal Sandbox {authStatus.authenticated ? "Connected & Authenticated" : "Not Authenticated"}
              </span>
              <span className="text-muted">·</span>
              <span className="text-muted font-mono text-[11px]">OAuth 2.0 Client Credentials</span>
            </div>
            <div className="text-[11px] text-muted">
              {authStatus.hasTransactionSearchScope ? (
                <span className="text-allow font-semibold">Reporting Search Scope Granted</span>
              ) : (
                <span className="text-amber-800 dark:text-amber-300 font-medium">Orders v2 Active · Search Reporting Scope Optional</span>
              )}
            </div>
          </div>
          <p className="text-[11px] text-muted leading-relaxed">
            {authStatus.message}
          </p>
        </div>
      )}

      {/* Test Order Created Notification */}
      {createdTestOrder && (
        <div className="p-4 rounded-lg border border-allow/40 bg-allow/5 text-ink text-xs font-sans space-y-2 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center space-x-2">
              <CheckCircle2 className="w-4 h-4 text-allow shrink-0" />
              <span className="font-bold text-ink">New PayPal Sandbox Test Order Created:</span>
              <span className="font-mono text-ink font-semibold">{createdTestOrder.id}</span>
              <span className="text-muted">(${(createdTestOrder.amountMinor / 100).toFixed(2)} {createdTestOrder.currency})</span>
            </div>
            {createdTestOrder.approvalUrl && (
              <a
                href={createdTestOrder.approvalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center space-x-1.5 px-3 py-1 rounded text-xs font-semibold bg-allow text-white hover:bg-allow/90 transition-colors shadow-2xs self-start sm:self-auto"
              >
                <span>Open Buyer Checkout</span>
                <span className="text-[10px]">&rarr;</span>
              </a>
            )}
          </div>
          <p className="text-[11px] text-muted">
            The test order was dispatched directly to PayPal Sandbox. Open the buyer checkout link in a new tab to complete approval using your Sandbox buyer account, then return and verify status here.
          </p>
        </div>
      )}

      {/* Lookup Bar */}
      <div className="p-4 rounded-lg border border-border bg-surface space-y-3 shadow-2xs">
        <label htmlFor="order-search-input" className="block text-xs font-semibold text-ink font-sans">
          Look Up Payment Order by ID
        </label>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-muted absolute left-3 top-2.5" />
            <input
              id="order-search-input"
              name="orderId"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Enter internal order UUID (e.g. 12345678-...) or PayPal Order ID"
              className="w-full pl-9 pr-3 py-2 text-xs rounded-md border border-border bg-surface-inset text-ink font-mono focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
            />
          </div>
          <button
            type="button"
            onClick={() => void handleFetchOrder(searchQuery)}
            disabled={loading || !searchQuery.trim()}
            className="px-4 py-2 rounded-md text-xs font-sans font-semibold bg-primary text-white hover:bg-primary-hover active:bg-primary-active transition-colors disabled:opacity-50 flex items-center justify-center space-x-1.5 shadow-2xs focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer min-h-[36px]"
          >
            {loading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Fetching...</span>
              </>
            ) : (
              <span>Load Order</span>
            )}
          </button>
        </div>
      </div>

      {/* Loading Skeleton */}
      {loading && !order && (
        <div className="space-y-4" role="status" aria-label="Loading order details...">
          <div className="p-3 rounded-lg border border-border bg-surface-inset text-xs text-muted font-mono flex items-center justify-center space-x-2">
            <RefreshCw className="w-4 h-4 animate-spin text-accent" />
            <span>Fetching payment order from PostgreSQL ledger...</span>
          </div>
          <div className="rounded-xl border border-border bg-surface p-5 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border/50">
              <Skeleton variant="text" className="w-48 h-5" />
              <Skeleton variant="badge" className="w-24 h-5" />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Skeleton variant="rectangular" className="h-16 rounded-lg" />
              <Skeleton variant="rectangular" className="h-16 rounded-lg" />
              <Skeleton variant="rectangular" className="h-16 rounded-lg" />
            </div>
            <SkeletonCodeBlock lines={4} />
          </div>
        </div>
      )}

      {/* Alert Banners */}
      {isUnknown && (
        <div
          role="alert"
          className="p-4 rounded-lg bg-review-bg/50 border border-review-border text-ink space-y-2 text-xs font-mono shadow-2xs"
        >
          <div className="flex items-center space-x-2 font-bold text-review">
            <AlertCircle className="w-4 h-4 text-review shrink-0" />
            <span>Ambiguous Order State — Reconciliation Hold Active</span>
          </div>
          <p className="text-[11px] text-muted leading-relaxed font-sans">
            {errorMessage ||
              "The payment order is in an ambiguous state due to a timeout, conflict, or unconfirmed settlement. Blind automatic retries are blocked to prevent duplicate charges."}
          </p>
          <div className="pt-1 flex items-center space-x-2">
            <button
              type="button"
              onClick={() => void handleReconcile()}
              disabled={actionLoading === `reconciling_${order?.id}`}
              className="px-3 py-1.5 rounded-md text-xs font-mono font-semibold bg-review-bg hover:bg-review-bg/80 text-review border border-review-border transition-colors disabled:opacity-50 flex items-center space-x-1.5 cursor-pointer shadow-2xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${actionLoading === `reconciling_${order?.id}` ? "animate-spin" : ""}`} />
              <span>Reconcile with PayPal</span>
            </button>
          </div>
        </div>
      )}

      {!isUnknown && errorMessage && (
        <div
          role="alert"
          className="p-3.5 rounded-lg bg-deny/10 border border-deny/30 text-deny text-xs flex items-start space-x-2 font-mono shadow-2xs"
        >
          <XCircle className="w-4 h-4 text-deny shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted leading-relaxed font-sans">{errorMessage}</p>
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          className="p-3.5 rounded-lg bg-allow/10 border border-allow/30 text-ink text-xs flex items-start space-x-2 font-mono shadow-2xs"
        >
          <CheckCircle2 className="w-4 h-4 text-allow shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted leading-relaxed font-sans">{successMessage}</p>
        </div>
      )}

      {/* Order Details View (Two-Column Desktop Cockpit) */}
      {order && (
        <div className="rounded-lg border border-border bg-surface p-5 shadow-2xs space-y-4">
          {/* Header Bar */}
          <div className="flex items-center justify-between flex-wrap gap-2 border-b border-border pb-3">
            <div className="flex items-center space-x-3">
              <StatusBadge status={order.status} showDot size="md" />
              <span className="text-base font-bold text-ink font-mono tabular-nums">
                ${(order.amountMinor / 100).toFixed(2)} {order.currency}
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <span className="text-[11px] font-mono text-muted">Reservation:</span>
              <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-surface-inset border border-border text-ink">
                {reservationState}
              </span>
              <button
                type="button"
                onClick={() => void handleFetchOrder(order.id)}
                disabled={loading}
                className="p-1.5 rounded text-muted hover:text-ink hover:bg-surface-raised transition-colors"
                title="Refresh order details"
                aria-label="Refresh order"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-accent" : ""}`} />
              </button>
              <button
                type="button"
                onClick={() => setOrder(null)}
                className="p-1.5 rounded text-muted hover:text-ink hover:bg-surface-raised transition-colors ml-1"
                title="Close inspection"
                aria-label="Close inspection"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Desktop Two-Column Cockpit Layout: Attributes on Left, Actions on Right */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
            {/* Left Column: 9-Tile Attribute Matrix & Notes (7 cols on desktop) */}
            <div className="lg:col-span-7 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 text-xs font-sans">
                <div className="p-2.5 rounded-md bg-surface-inset border border-border space-y-1">
                  <span className="text-[11px] font-medium text-muted block">Internal Order ID</span>
                  <HashBadge hash={order.id} prefixLength={8} suffixLength={6} />
                </div>
                <div className="p-2.5 rounded-md bg-surface-inset border border-border space-y-1">
                  <span className="text-[11px] font-medium text-muted block">PayPal Provider Order ID</span>
                  {order.providerOrderId ? (
                    <HashBadge hash={order.providerOrderId} prefixLength={8} suffixLength={6} />
                  ) : (
                    <span className="text-muted text-[11px] font-mono">None</span>
                  )}
                </div>
                <div className="p-2.5 rounded-md bg-surface-inset border border-border space-y-1">
                  <span className="text-[11px] font-medium text-muted block">Provider Environment</span>
                  <StatusBadge status={order.provider} variant="SANDBOX" size="sm" />
                </div>
                <div className="p-2.5 rounded-md bg-surface-inset border border-border space-y-1">
                  <span className="text-[11px] font-medium text-muted block">Spend Reservation ID</span>
                  <HashBadge hash={order.reservationId} prefixLength={8} suffixLength={6} />
                </div>
                <div className="p-2.5 rounded-md bg-surface-inset border border-border space-y-1">
                  <span className="text-[11px] font-medium text-muted block">Checkout Proposal ID</span>
                  <HashBadge hash={order.proposalId} prefixLength={8} suffixLength={6} />
                </div>
                <div className="p-2.5 rounded-md bg-surface-inset border border-border space-y-1">
                  <span className="text-[11px] font-medium text-muted block">Idempotency Key</span>
                  <HashBadge hash={order.idempotencyKey} prefixLength={8} suffixLength={6} />
                </div>
                {order.payerId && (
                  <div className="p-2.5 rounded-md bg-surface-inset border border-border space-y-0.5">
                    <span className="text-[11px] font-medium text-muted block">Verified Payer ID</span>
                    <span className="font-mono text-ink text-[11px] font-bold">{order.payerId}</span>
                  </div>
                )}
                {order.captureId && (
                  <div className="p-2.5 rounded-md bg-allow/10 border border-allow/30 space-y-0.5">
                    <span className="text-[11px] font-medium text-muted block">PayPal Capture ID</span>
                    <span className="font-mono text-allow text-[11px] font-bold select-all">
                      {order.captureId}
                    </span>
                  </div>
                )}
                <div className="p-2.5 rounded-md bg-surface-inset border border-border space-y-0.5">
                  <span className="text-[11px] font-medium text-muted block">Created Timestamp</span>
                  <span className="text-muted text-[11px] font-mono">
                    {new Date(order.createdAt).toLocaleString()}
                  </span>
                </div>
              </div>

              {reconciliationNotes && (
                <div className="p-3.5 rounded-md bg-accent/10 border border-accent/30 text-xs text-ink space-y-1">
                  <span className="font-semibold font-sans text-accent block">Reconciliation Report:</span>
                  <p className="text-[11px] leading-relaxed font-sans">{reconciliationNotes}</p>
                </div>
              )}
            </div>

            {/* Right Column: Action Management Center (5 cols on desktop) */}
            <div className="lg:col-span-5 p-4 rounded-lg border border-border bg-surface-inset space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink font-mono border-b border-border pb-2">
                Lifecycle Actions &amp; Transitions
              </h3>

              {/* Buyer Approval Verification */}
              <div className="p-3 rounded-md border border-border bg-surface space-y-2.5 text-xs">
                <div className="flex items-center space-x-2 font-bold text-ink">
                  <UserCheck className="w-4 h-4 text-accent" />
                  <span className="font-mono text-xs">Buyer Approval Verification</span>
                </div>
                <p className="text-[11px] text-muted leading-relaxed font-sans">
                  Validate buyer authorization against the PayPal Orders API before unlocking server capture.
                </p>

                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <label htmlFor="payer-id-input" className="text-[10px] text-muted font-mono shrink-0">PayerID:</label>
                    <input
                      id="payer-id-input"
                      type="text"
                      value={payerIdInput}
                      onChange={(e) => setPayerIdInput(e.target.value)}
                      placeholder="Optional Payer ID"
                      className="px-2.5 py-1 text-[11px] font-mono rounded border border-border bg-surface-inset text-ink flex-1 focus:outline-none focus:ring-1 focus:ring-accent"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleConfirmApproval()}
                    disabled={actionLoading === "confirming" || isCaptured || isCancelled}
                    className="w-full py-1.5 rounded-md text-xs font-mono font-semibold bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50 flex items-center justify-center space-x-1 shadow-2xs focus:outline-none focus:ring-2 focus:ring-accent/30 cursor-pointer min-h-[34px]"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 ${actionLoading === "confirming" ? "animate-spin" : ""}`}
                    />
                    <span>
                      {actionLoading === "confirming"
                        ? "Querying PayPal API..."
                        : "Verify Buyer Approval"}
                    </span>
                  </button>
                </div>
              </div>

              {/* Server-Side Capture */}
              <div className="p-3 rounded-md border border-border bg-surface space-y-2.5 text-xs">
                <div className="flex items-center space-x-2 font-bold text-ink">
                  <CreditCard className="w-4 h-4 text-allow" />
                  <span className="font-mono text-xs">Server-Side Capture</span>
                </div>
                <p className="text-[11px] text-muted leading-relaxed font-sans">
                  Execute payment capture with server-side idempotency. Requires <code className="font-mono text-ink">APPROVED</code> status.
                </p>

                {showCaptureConfirm ? (
                  <div className="p-3 rounded-md bg-surface-inset border border-allow-border space-y-2 shadow-2xs">
                    <div className="text-[11px] font-bold text-allow font-mono">
                      Confirm Capture of ${(order.amountMinor / 100).toFixed(2)} {order.currency}?
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => void handleCapture()}
                        disabled={actionLoading === "capturing"}
                        className="px-3 py-1.5 rounded-md text-xs font-mono font-semibold bg-allow text-white hover:bg-allow/90 transition-colors disabled:opacity-50 shadow-2xs cursor-pointer"
                      >
                        {actionLoading === "capturing" ? "Capturing..." : "Confirm Capture"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCaptureConfirm(false)}
                        className="text-xs font-mono text-muted hover:underline cursor-pointer"
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowCaptureConfirm(true)}
                    disabled={!isApproved || actionLoading === "capturing" || isCaptured}
                    className="w-full py-1.5 rounded-md text-xs font-mono font-semibold bg-allow text-white hover:bg-allow/90 transition-colors disabled:opacity-50 flex items-center justify-center space-x-1 shadow-2xs cursor-pointer min-h-[34px]"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>
                      {isCaptured
                        ? "Already Captured"
                        : !isApproved
                        ? "Requires APPROVED Status"
                        : "Execute Capture"}
                    </span>
                  </button>
                )}
              </div>

              {/* Bottom Actions: Cancellation & Reconcile */}
              <div className="pt-2 border-t border-border flex items-center justify-between flex-wrap gap-2 text-xs">
                <div>
                  {showCancelConfirm ? (
                    <div className="flex items-center space-x-2">
                      <input
                        type="text"
                        placeholder="Cancellation reason"
                        value={cancelReason}
                        onChange={(e) => setCancelReason(e.target.value)}
                        className="px-2 py-1 text-xs font-mono rounded border border-border bg-surface text-ink w-36 focus:outline-none focus:ring-1 focus:ring-accent"
                      />
                      <button
                        type="button"
                        onClick={() => void handleCancel()}
                        disabled={actionLoading === "cancelling"}
                        className="px-2.5 py-1 rounded-md text-xs font-mono font-medium bg-deny text-white hover:bg-deny/90 transition-colors disabled:opacity-50 shadow-2xs cursor-pointer"
                      >
                        {actionLoading === "cancelling" ? "Cancelling..." : "Confirm Cancel"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCancelConfirm(false)}
                        className="text-xs font-mono text-muted hover:underline cursor-pointer"
                      >
                        Dismiss
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setShowCancelConfirm(true)}
                      disabled={isCaptured || isCancelled || actionLoading === "cancelling"}
                      className="text-xs font-mono text-deny hover:text-deny/80 font-medium disabled:opacity-40 cursor-pointer"
                    >
                      {isCancelled ? "Order Cancelled" : "Cancel Order & Release Hold..."}
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => void handleReconcile()}
                  disabled={actionLoading === `reconciling_${order.id}`}
                  className="px-3 py-1.5 rounded-md text-xs font-mono font-medium border border-border bg-surface hover:bg-surface-raised text-ink transition-colors disabled:opacity-50 flex items-center space-x-1.5 shadow-2xs cursor-pointer"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${actionLoading === `reconciling_${order.id}` ? "animate-spin text-accent" : ""}`}
                  />
                  <span>Reconcile Ledger</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Tabbed Station Area */}
      <div className="rounded-lg border border-border bg-surface overflow-hidden shadow-2xs">
        {/* Navigation Tabs */}
        <div className="px-4 pt-3 border-b border-border bg-surface-inset flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={() => setActiveTab("LEDGER")}
              className={`px-3.5 py-2 text-xs font-sans font-semibold rounded-t-md transition-colors cursor-pointer flex items-center space-x-1.5 border-b-2 ${
                activeTab === "LEDGER"
                  ? "border-primary text-primary bg-surface"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Orders Ledger ({recentOrders.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("RECONCILIATION")}
              className={`px-3.5 py-2 text-xs font-sans font-semibold rounded-t-md transition-colors cursor-pointer flex items-center space-x-1.5 border-b-2 ${
                activeTab === "RECONCILIATION"
                  ? "border-primary text-primary bg-surface"
                  : "border-transparent text-muted hover:text-ink"
              }`}
            >
              <Scale className="w-3.5 h-3.5" />
              <span>Reconciliation &amp; Exceptions</span>
              {alertsData.totalAlerts > 0 && (
                <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] font-mono font-bold bg-review-bg text-review border border-review-border">
                  {alertsData.totalAlerts}
                </span>
              )}
            </button>
          </div>

          <div className="flex items-center space-x-2 pb-2">
            <button
              type="button"
              onClick={() => void loadRecentOrders()}
              disabled={recentOrdersState === "LOADING"}
              className="inline-flex items-center space-x-1 px-2.5 py-1.5 rounded-md text-[11px] font-mono text-muted hover:text-ink border border-border bg-surface hover:bg-surface-raised transition-colors shadow-2xs cursor-pointer"
              title="Refresh ledger and alerts"
            >
              <RefreshCw className={`w-3 h-3 ${recentOrdersState === "LOADING" ? "animate-spin text-accent" : "text-muted"}`} />
              <span>Refresh All</span>
            </button>
          </div>
        </div>

        {/* TAB 1: ORDERS LEDGER */}
        {activeTab === "LEDGER" && (
          <div className="space-y-0">
            {/* Settlement Summary Header Bar */}
            <div className="p-4 bg-surface-subtle border-b border-border flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center space-x-3">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
                <div>
                  <div className="flex items-center space-x-2">
                    <span className="text-xs font-semibold text-ink font-sans">
                      Recent Payment Orders Ledger
                    </span>
                    {recentOrders.length > 0 && (
                      <span className="text-[10px] font-sans px-2 py-0.5 rounded bg-surface border border-border text-muted font-medium">
                        {recentOrders.length} orders
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-muted font-mono mt-0.5">
                    Total Settled: <strong className="text-ink font-bold tabular-nums">${(totalSettledMinor / 100).toFixed(2)} USD</strong> · Real-Time PayPal Sandbox Settlement
                  </div>
                </div>
              </div>

              {/* Filters & Search on Table */}
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                {/* Search in Ledger */}
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-muted absolute left-2.5 top-2" />
                  <input
                    type="text"
                    value={ledgerSearch}
                    onChange={(e) => setLedgerSearch(e.target.value)}
                    placeholder="Filter ledger rows..."
                    className="pl-8 pr-2.5 py-1 text-xs rounded-md border border-border bg-surface text-ink font-mono focus:outline-none focus:ring-1 focus:ring-accent w-full sm:w-44"
                  />
                  {ledgerSearch && (
                    <button
                      type="button"
                      onClick={() => setLedgerSearch("")}
                      className="absolute right-2 top-2 text-muted hover:text-ink text-xs"
                    >
                      &times;
                    </button>
                  )}
                </div>

                {/* Filter Pills */}
                <div className="inline-flex rounded-md p-0.5 bg-surface border border-border text-[11px] font-sans overflow-x-auto">
                  <button
                    type="button"
                    onClick={() => setFilterStatus("ALL")}
                    className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                      filterStatus === "ALL"
                        ? "bg-primary text-white font-semibold shadow-2xs"
                        : "text-muted hover:text-ink"
                    }`}
                  >
                    All ({recentOrders.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterStatus("CAPTURED")}
                    className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                      filterStatus === "CAPTURED"
                        ? "bg-primary text-white font-semibold shadow-2xs"
                        : "text-muted hover:text-ink"
                    }`}
                  >
                    Captured
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterStatus("APPROVED")}
                    className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                      filterStatus === "APPROVED"
                        ? "bg-primary text-white font-semibold shadow-2xs"
                        : "text-muted hover:text-ink"
                    }`}
                  >
                    Approved
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterStatus("PENDING")}
                    className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                      filterStatus === "PENDING"
                        ? "bg-primary text-white font-semibold shadow-2xs"
                        : "text-muted hover:text-ink"
                    }`}
                  >
                    Pending
                  </button>
                  {heldOrdersCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterStatus("HOLD")}
                      className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                        filterStatus === "HOLD"
                          ? "bg-amber-600 text-white font-semibold shadow-2xs"
                          : "text-amber-600 dark:text-amber-400 hover:text-ink"
                      }`}
                    >
                      Hold ({heldOrdersCount})
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setFilterStatus("CANCELLED")}
                    className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                      filterStatus === "CANCELLED"
                        ? "bg-primary text-white font-semibold shadow-2xs"
                        : "text-muted hover:text-ink"
                    }`}
                  >
                    Cancelled
                  </button>
                </div>
              </div>
            </div>

            {/* Ledger Rows Table */}
            {recentOrdersState === "LOADING" && recentOrders.length === 0 ? (
              <div className="py-8 text-center text-xs text-muted font-mono space-y-2">
                <RefreshCw className="w-5 h-5 animate-spin mx-auto text-accent" />
                <div>Querying payment orders ledger...</div>
              </div>
            ) : filteredRecentOrders.length > 0 ? (
              <div className="overflow-x-auto max-h-[520px] overflow-y-auto" data-lenis-prevent>
                <table className="w-full text-left text-xs border-collapse min-w-[860px]">
                  <thead className="sticky top-0 z-10 shadow-xs bg-surface-inset">
                    <tr className="border-b border-border text-[11px] font-medium text-muted font-sans">
                      <th className="py-2.5 px-3 w-40 bg-surface-inset">Internal Order ID</th>
                      <th className="py-2.5 px-3 w-40 bg-surface-inset">PayPal Order ID</th>
                      <th className="py-2.5 px-3 w-32 bg-surface-inset">Status</th>
                      <th className="py-2.5 px-3 w-28 text-right bg-surface-inset">Amount</th>
                      <th className="py-2.5 px-3 w-36 bg-surface-inset">Reservation</th>
                      <th className="py-2.5 px-3 w-40 bg-surface-inset">Created</th>
                      <th className="py-2.5 px-3 w-24 text-right bg-surface-inset">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filteredRecentOrders.map((rec) => {
                      const isSelected = order?.id === rec.id;
                      return (
                        <tr
                          key={rec.id}
                          onClick={() => {
                            setSearchQuery(rec.id);
                            void handleFetchOrder(rec.id);
                          }}
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" || e.key === " ") {
                              e.preventDefault();
                              setSearchQuery(rec.id);
                              void handleFetchOrder(rec.id);
                            }
                          }}
                          className={`hover:bg-surface-raised transition-colors cursor-pointer group ${
                            isSelected ? "bg-accent/5 font-medium" : ""
                          }`}
                        >
                          <td className="py-2.5 px-3 w-40">
                            <HashBadge hash={rec.id} prefixLength={8} suffixLength={4} showCopy={false} />
                          </td>
                          <td className="py-2.5 px-3 w-40">
                            {rec.providerOrderId ? (
                              <HashBadge hash={rec.providerOrderId} prefixLength={8} suffixLength={4} />
                            ) : (
                              <span className="text-muted text-[11px] font-mono">None</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 w-32">
                            <StatusBadge status={rec.status} size="sm" showDot />
                          </td>
                          <td className="py-2.5 px-3 w-28 text-right font-mono font-bold text-ink tabular-nums">
                            ${(rec.amountMinor / 100).toFixed(2)} {rec.currency}
                          </td>
                          <td className="py-2.5 px-3 w-36">
                            <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-surface-inset border border-border text-muted">
                              {rec.reservationId ? "RESERVED" : "NONE"}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 w-40 text-muted text-[11px] font-mono">
                            {new Date(rec.createdAt).toLocaleDateString()}
                          </td>
                          <td className="py-2.5 px-3 w-24 text-right">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setSearchQuery(rec.id);
                                void handleFetchOrder(rec.id);
                              }}
                              className="inline-flex items-center space-x-1 px-2.5 py-1 rounded text-[11px] font-mono font-semibold border border-border bg-surface text-ink hover:bg-surface-raised group-hover:border-accent/40 transition-colors shadow-2xs cursor-pointer"
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
            ) : (
              <div className="py-8 text-center text-xs text-muted font-mono space-y-1">
                <p>
                  {recentOrders.length === 0
                    ? "No orders found in recent ledger."
                    : `No orders match filter "${filterStatus}"${ledgerSearch ? ` and query "${ledgerSearch}"` : ""}.`}
                </p>
                {ledgerSearch && (
                  <button
                    type="button"
                    onClick={() => setLedgerSearch("")}
                    className="text-xs text-accent hover:underline cursor-pointer"
                  >
                    Clear search filter
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: RECONCILIATION & EXCEPTION QUEUE */}
        {activeTab === "RECONCILIATION" && (
          <div className="space-y-5 p-4 sm:p-5">
            {/* Reconciliation KPI Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs font-sans">
              {/* Card 1: Exception Queue Status */}
              <div className={`p-3.5 rounded-lg border shadow-2xs space-y-1 ${
                alertsData.totalAlerts === 0
                  ? "bg-allow/5 border-allow/30 text-ink"
                  : "bg-review-bg/40 border-review-border text-ink"
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-muted uppercase tracking-wider font-mono">Queue Status</span>
                  {alertsData.totalAlerts === 0 ? (
                    <CheckCircle2 className="w-4 h-4 text-allow" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-review animate-pulse" />
                  )}
                </div>
                <div className="text-base font-bold font-sans">
                  {alertsData.totalAlerts === 0 ? "Ledger Reconciled" : `${alertsData.totalAlerts} Pending Exceptions`}
                </div>
                <div className="text-[11px] text-muted">
                  {alertsData.totalAlerts === 0
                    ? "All spend holds & payment orders reconciled."
                    : "Action required to resolve ambiguous states."}
                </div>
              </div>

              {/* Card 2: Unreconciled Orders */}
              <div className="p-3.5 rounded-lg border border-border bg-surface shadow-2xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-muted uppercase tracking-wider font-mono">Unreconciled Orders</span>
                  <Scale className="w-4 h-4 text-accent" />
                </div>
                <div className="text-base font-bold font-mono text-ink">
                  {alertsData.unreconciledOrders.length}
                </div>
                <div className="text-[11px] text-muted font-sans">
                  Orders requiring probe confirmation.
                </div>
              </div>

              {/* Card 3: Held Spend Reservations */}
              <div className="p-3.5 rounded-lg border border-border bg-surface shadow-2xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-medium text-muted uppercase tracking-wider font-mono">Held Reservations</span>
                  <Lock className="w-4 h-4 text-muted" />
                </div>
                <div className="text-base font-bold font-mono text-ink">
                  {alertsData.heldReservations.length}
                </div>
                <div className="text-[11px] text-muted font-sans">
                  Budget held pending settlement resolution.
                </div>
              </div>

              {/* Card 4: Run Reconciliation Action */}
              <div className="p-3.5 rounded-lg border border-border bg-surface shadow-2xs flex flex-col justify-between space-y-2">
                <div>
                  <span className="text-[11px] font-medium text-muted uppercase tracking-wider font-mono block">Orders v2 Reconciliation</span>
                  <span className="text-xs text-muted block mt-0.5">Authoritatively query PayPal Orders API for all orders and settle holds.</span>
                </div>
                <button
                  type="button"
                  data-testid="batch-reconcile-orders-v2-btn"
                  onClick={handleSyncPayPal}
                  disabled={syncingPayPal}
                  className="w-full py-1.5 rounded-md text-xs font-mono font-semibold bg-primary hover:bg-primary-hover active:bg-primary-active text-white transition-colors disabled:opacity-50 flex items-center justify-center space-x-1.5 shadow-2xs cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${syncingPayPal ? "animate-spin" : ""}`} />
                  <span>{syncingPayPal ? "Reconciling..." : "Reconcile with PayPal Orders v2"}</span>
                </button>
              </div>
            </div>

            {/* Active Reconciliation Exception Queue */}
            <div className="rounded-lg border border-border bg-surface overflow-hidden shadow-2xs space-y-0">
              <div className="p-3.5 bg-surface-inset border-b border-border flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 text-review shrink-0" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-ink font-mono">
                    Reconciliation Exception Queue
                  </h3>
                  <span className="text-[10px] font-sans px-2 py-0.5 rounded bg-surface border border-border text-muted font-medium">
                    {alertsData.totalAlerts} items
                  </span>
                </div>
                <div className="text-[11px] text-muted font-sans">
                  Automatic blind retries are blocked while on hold.
                </div>
              </div>

              {alertsData.totalAlerts === 0 ? (
                <div className="py-10 text-center space-y-2 text-xs text-muted font-sans">
                  <CheckCircle2 className="w-8 h-8 text-allow mx-auto" />
                  <div className="font-bold text-ink">Zero Reconciliation Exceptions</div>
                  <p className="max-w-md mx-auto text-[11px] text-muted">
                    All payment orders and spend reservations are in authoritative confirmed states (CAPTURED, COMMITTED, or RELEASED).
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto" data-lenis-prevent>
                  <table className="w-full text-left text-xs border-collapse min-w-[840px]">
                    <thead className="bg-surface-subtle">
                      <tr className="border-b border-border text-[11px] font-medium text-muted font-sans">
                        <th className="py-2.5 px-3 w-40 bg-surface-subtle">Target Entity</th>
                        <th className="py-2.5 px-3 w-28 bg-surface-subtle">Type</th>
                        <th className="py-2.5 px-3 w-28 bg-surface-subtle">Amount</th>
                        <th className="py-2.5 px-3 w-36 bg-surface-subtle">Hold State</th>
                        <th className="py-2.5 px-3 min-w-[200px] bg-surface-subtle">Exception Rationale</th>
                        <th className="py-2.5 px-3 w-48 text-right bg-surface-subtle">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border font-mono text-xs">
                      {/* Unreconciled Orders */}
                      {alertsData.unreconciledOrders.map((ord) => (
                        <tr key={ord.id} className="hover:bg-surface-raised transition-colors">
                          <td className="py-2.5 px-3 w-40">
                            <HashBadge hash={ord.id} prefixLength={8} suffixLength={4} />
                          </td>
                          <td className="py-2.5 px-3 w-28 text-muted text-[11px]">
                            Payment Order
                          </td>
                          <td className="py-2.5 px-3 w-28 font-bold text-ink tabular-nums">
                            ${(ord.amountMinor / 100).toFixed(2)} {ord.currency}
                          </td>
                          <td className="py-2.5 px-3 w-36">
                            <StatusBadge status={ord.status} size="sm" showDot />
                          </td>
                          <td className="py-2.5 px-3 min-w-[200px] text-muted text-[11px] font-sans">
                            Ambiguous network outcome or unconfirmed settlement. Safe probe required.
                          </td>
                          <td className="py-2.5 px-3 w-48 text-right">
                            <div className="inline-flex items-center space-x-1.5">
                              <button
                                type="button"
                                onClick={() => void handleReconcile(ord.id)}
                                disabled={actionLoading === `reconciling_${ord.id}`}
                                className="px-2.5 py-1 rounded text-[11px] font-mono font-semibold bg-review-bg text-review border border-review-border hover:bg-review-bg/80 transition-colors shadow-2xs cursor-pointer"
                              >
                                {actionLoading === `reconciling_${ord.id}` ? "Probing..." : "Reconcile"}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setSearchQuery(ord.id);
                                  void handleFetchOrder(ord.id);
                                }}
                                className="px-2 py-1 rounded text-[11px] font-mono text-muted hover:text-ink border border-border bg-surface hover:bg-surface-raised transition-colors shadow-2xs cursor-pointer"
                              >
                                Inspect
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}

                      {/* Held Spend Reservations */}
                      {alertsData.heldReservations.map((res: any) => (
                        <tr key={res.id} className="hover:bg-surface-raised transition-colors">
                          <td className="py-2.5 px-3 w-40">
                            <HashBadge hash={res.id} prefixLength={8} suffixLength={4} />
                          </td>
                          <td className="py-2.5 px-3 w-28 text-muted text-[11px]">
                            Spend Hold
                          </td>
                          <td className="py-2.5 px-3 w-28 font-bold text-ink tabular-nums">
                            ${((res.amountMinor || 0) / 100).toFixed(2)} {res.currency || "USD"}
                          </td>
                          <td className="py-2.5 px-3 w-36">
                            <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-review-bg text-review border border-review-border">
                              RECONCILIATION_HOLD
                            </span>
                          </td>
                          <td className="py-2.5 px-3 min-w-[200px] text-muted text-[11px] font-sans">
                            Budget locked on approval to prevent overspending until transaction is confirmed.
                          </td>
                          <td className="py-2.5 px-3 w-48 text-right">
                            <button
                              type="button"
                              onClick={handleSyncPayPal}
                              disabled={syncingPayPal}
                              className="px-2.5 py-1 rounded text-[11px] font-mono font-semibold border border-border bg-surface hover:bg-surface-raised text-ink transition-colors shadow-2xs cursor-pointer"
                            >
                              Sync Ledger
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* External PayPal Settlement Matching Verification Table */}
            <div className="rounded-lg border border-border bg-surface overflow-hidden shadow-2xs space-y-0">
              <div className="p-3.5 bg-surface-inset border-b border-border flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center space-x-2">
                  <CreditCard className="w-4 h-4 text-accent shrink-0" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-ink font-mono">
                    PayPal External Settlement Records &amp; Matching Matrix
                  </h3>
                </div>
                <div className="text-[11px] text-muted font-sans">
                  Source: PayPal Transaction Search Reporting API
                </div>
              </div>

              {paypalTxState === "LOADING" ? (
                <div className="py-8 text-center text-xs text-muted font-mono space-y-2">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto text-accent" />
                  <div>Querying PayPal Sandbox Transaction Search API...</div>
                </div>
              ) : paypalTransactions.length > 0 ? (
                <div className="overflow-x-auto" data-lenis-prevent>
                  <table className="w-full text-left text-xs border-collapse min-w-[860px]">
                    <thead className="bg-surface-subtle">
                      <tr className="border-b border-border text-[11px] font-medium text-muted font-sans">
                        <th className="py-2.5 px-3 w-36 bg-surface-subtle">PayPal Tx ID</th>
                        <th className="py-2.5 px-3 w-36 bg-surface-subtle">Reference / Order ID</th>
                        <th className="py-2.5 px-3 w-28 bg-surface-subtle">Amount</th>
                        <th className="py-2.5 px-3 w-32 bg-surface-subtle">Provider Status</th>
                        <th className="py-2.5 px-3 w-36 bg-surface-subtle">Reconciliation Match</th>
                        <th className="py-2.5 px-3 min-w-[200px] bg-surface-subtle">Matching Rationale</th>
                        <th className="py-2.5 px-3 w-28 text-right bg-surface-subtle">Initiated</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border font-mono text-xs">
                      {paypalTransactions.map((tx) => (
                        <tr key={tx.transactionId} className="hover:bg-surface-raised transition-colors">
                          <td className="py-2.5 px-3 w-36 font-semibold text-ink">
                            <HashBadge hash={tx.transactionId} prefixLength={8} suffixLength={4} />
                          </td>
                          <td className="py-2.5 px-3 w-36 text-muted">
                            {tx.paypalReferenceId ? (
                              <HashBadge hash={tx.paypalReferenceId} prefixLength={8} suffixLength={4} />
                            ) : (
                              <span className="text-[11px] text-muted">N/A</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 w-28 font-bold text-ink tabular-nums">
                            ${(tx.amountMinor / 100).toFixed(2)} {tx.currency}
                          </td>
                          <td className="py-2.5 px-3 w-32">
                            <StatusBadge status={tx.status} size="sm" showDot />
                          </td>
                          <td className="py-2.5 px-3 w-36">
                            {tx.syncedToLedger ? (
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-allow/10 text-allow border border-allow/30">
                                <CheckCircle2 className="w-3 h-3 text-allow" />
                                <span>MATCHED</span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-surface-inset text-muted border border-border">
                                <span>EXTERNAL</span>
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 min-w-[200px] text-muted text-[11px] font-sans">
                            {tx.syncedToLedger
                              ? `Matched with database order #${tx.associatedOrderId?.slice(0, 8)}. Amount & currency verified.`
                              : "External PayPal transaction not initiated via current session ledger."}
                          </td>
                          <td className="py-2.5 px-3 w-28 text-right text-muted text-[11px]">
                            {new Date(tx.initiationDate).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-muted font-sans space-y-1">
                  <p>No transactions returned by PayPal Sandbox reporting search.</p>
                  <p className="text-[11px] text-muted">
                    If 'Transaction Search' scope is not active in the developer dashboard, fallback synchronization matches active database orders directly.
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
