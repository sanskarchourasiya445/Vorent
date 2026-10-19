import { useState, useEffect, useCallback } from "react";
import {
  CreditCard,
  Search,
  CheckCircle2,
  XCircle,
  AlertCircle,
  RefreshCw,
  UserCheck,
} from "lucide-react";
import {
  getPaymentOrder,
  confirmBuyerApproval,
  capturePaymentOrder,
  cancelPaymentOrder,
  reconcilePaymentOrder,
  PaymentOrderError,
} from "../../api/paymentOrderService";
import type { PaymentOrderRecord, ReservationState } from "@warrant/contracts";

interface TransactionsPanelProps {
  initialOrderId?: string;
}

export function TransactionsPanel({ initialOrderId }: TransactionsPanelProps) {
  const [searchQuery, setSearchQuery] = useState(initialOrderId || "");
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

  const handleReconcile = async () => {
    if (!order) return;
    setActionLoading("reconciling");
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const res = await reconcilePaymentOrder({
        orderId: order.id,
        paypalOrderId: order.providerOrderId || undefined,
      });

      setOrder(res.order);
      setReservationState(res.reservationState);
      setReconciliationNotes(res.notes || null);
      setIsAmbiguous(false);
      setSuccessMessage(
        `Reconciliation complete: status '${res.order.status}', externalStatus '${res.externalStatus || "N/A"}'.`,
      );
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
    <div className="space-y-6 max-w-5xl mx-auto" role="region" aria-label="Transactions Workstation">
      {/* Title */}
      <div className="border-b border-border pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <CreditCard className="w-6 h-6 text-accent" aria-hidden="true" />
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink">
              Transactions & Payment Lifecycle
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-muted mt-1">
            Authoritative PayPal Sandbox order inspection, buyer approval verification, server capture, and ledger reconciliation.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
            SANDBOX MODE
          </span>
        </div>
      </div>

      {/* Lookup Bar */}
      <div className="p-4 rounded-panel border border-border bg-surface space-y-3">
        <label htmlFor="order-search-input" className="block text-xs font-semibold text-ink">
          Look Up Payment Order by ID
        </label>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-muted absolute left-3 top-2.5" />
            <input
              id="order-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Enter internal order UUID (e.g. 12345678-...) or PayPal Order ID"
              className="w-full pl-9 pr-3 py-2 text-xs rounded border border-border bg-canvas text-ink font-mono focus:outline-hidden focus:border-accent"
            />
          </div>
          <button
            type="button"
            onClick={() => void handleFetchOrder(searchQuery)}
            disabled={loading || !searchQuery.trim()}
            className="px-4 py-2 rounded text-xs font-semibold bg-accent text-white hover:bg-accent/90 transition-colors disabled:opacity-50 flex items-center justify-center space-x-1.5"
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

      {/* Alert Messages */}
      {isUnknown && (
        <div
          role="alert"
          className="p-4 rounded bg-amber-50 border border-amber-300 text-amber-950 space-y-2 text-xs"
        >
          <div className="flex items-center space-x-2 font-bold text-amber-900">
            <AlertCircle className="w-4 h-4 text-amber-800 shrink-0" />
            <span>Ambiguous Order State — Reconciliation Hold Active</span>
          </div>
          <p className="text-[11px] text-amber-900 leading-relaxed">
            {errorMessage ||
              "The payment order is in an ambiguous state due to a timeout or conflict. Automatic retries are blocked."}
          </p>
          <div className="pt-1 flex items-center space-x-2">
            <button
              type="button"
              onClick={() => void handleReconcile()}
              disabled={actionLoading === "reconciling"}
              className="px-3 py-1.5 rounded text-xs font-semibold bg-amber-800 text-white hover:bg-amber-900 transition-colors disabled:opacity-50 flex items-center space-x-1"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${actionLoading === "reconciling" ? "animate-spin" : ""}`} />
              <span>Reconcile with PayPal</span>
            </button>
          </div>
        </div>
      )}

      {!isUnknown && errorMessage && (
        <div
          role="alert"
          className="p-3.5 rounded bg-red-50 border border-red-200 text-red-950 text-xs flex items-start space-x-2"
        >
          <XCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
          <p className="text-[11px] text-red-900 leading-relaxed">{errorMessage}</p>
        </div>
      )}

      {successMessage && (
        <div
          role="status"
          className="p-3.5 rounded bg-emerald-50 border border-emerald-300 text-emerald-950 text-xs flex items-start space-x-2"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
          <p className="text-[11px] text-emerald-950 leading-relaxed">{successMessage}</p>
        </div>
      )}

      {/* Order Details View */}
      {order ? (
        <div className="space-y-5">
          {/* Main Record Card */}
          <div className="p-5 rounded-panel border border-border bg-surface shadow-xs space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2 border-b border-border pb-3">
              <div className="flex items-center space-x-3">
                <span
                  className={`px-2.5 py-1 rounded text-xs font-bold font-mono border ${
                    isCaptured
                      ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                      : isApproved
                      ? "bg-blue-100 text-blue-900 border-blue-300"
                      : isCancelled
                      ? "bg-gray-100 text-gray-800 border-gray-300"
                      : isUnknown
                      ? "bg-amber-100 text-amber-900 border-amber-300"
                      : "bg-blue-50 text-blue-900 border-blue-200"
                  }`}
                >
                  {order.status}
                </span>
                <span className="text-sm font-bold text-ink">
                  ${(order.amountMinor / 100).toFixed(2)} {order.currency}
                </span>
              </div>

              <div className="flex items-center space-x-2">
                <span className="text-[11px] text-muted">Reservation:</span>
                <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded bg-canvas border border-border text-ink">
                  {reservationState}
                </span>
                <button
                  type="button"
                  onClick={() => void handleFetchOrder(order.id)}
                  disabled={loading}
                  className="p-1 rounded text-muted hover:text-ink hover:bg-canvas transition-colors"
                  title="Refresh order details"
                  aria-label="Refresh order"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
                </button>
              </div>
            </div>

            {/* Grid of Attributes */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              <div className="p-2.5 rounded bg-canvas border border-border/70 space-y-0.5">
                <span className="text-[10px] uppercase font-bold text-muted block">Internal Order ID</span>
                <span className="font-mono text-ink text-[11px] select-all truncate block">{order.id}</span>
              </div>
              <div className="p-2.5 rounded bg-canvas border border-border/70 space-y-0.5">
                <span className="text-[10px] uppercase font-bold text-muted block">PayPal Provider Order ID</span>
                <span className="font-mono text-ink text-[11px] select-all truncate block">
                  {order.providerOrderId || "None"}
                </span>
              </div>
              <div className="p-2.5 rounded bg-canvas border border-border/70 space-y-0.5">
                <span className="text-[10px] uppercase font-bold text-muted block">Provider Environment</span>
                <span className="font-mono text-ink text-[11px]">{order.provider}</span>
              </div>
              <div className="p-2.5 rounded bg-canvas border border-border/70 space-y-0.5">
                <span className="text-[10px] uppercase font-bold text-muted block">Spend Reservation ID</span>
                <span className="font-mono text-ink text-[11px] select-all truncate block">
                  {order.reservationId}
                </span>
              </div>
              <div className="p-2.5 rounded bg-canvas border border-border/70 space-y-0.5">
                <span className="text-[10px] uppercase font-bold text-muted block">Checkout Proposal ID</span>
                <span className="font-mono text-ink text-[11px] select-all truncate block">
                  {order.proposalId}
                </span>
              </div>
              <div className="p-2.5 rounded bg-canvas border border-border/70 space-y-0.5">
                <span className="text-[10px] uppercase font-bold text-muted block">Idempotency Key</span>
                <span className="font-mono text-muted text-[10px] select-all truncate block">
                  {order.idempotencyKey}
                </span>
              </div>
              {order.payerId && (
                <div className="p-2.5 rounded bg-canvas border border-border/70 space-y-0.5">
                  <span className="text-[10px] uppercase font-bold text-muted block">Verified Payer ID</span>
                  <span className="font-mono text-ink text-[11px]">{order.payerId}</span>
                </div>
              )}
              {order.captureId && (
                <div className="p-2.5 rounded bg-emerald-50/70 border border-emerald-300 space-y-0.5">
                  <span className="text-[10px] uppercase font-bold text-emerald-800 block">PayPal Capture ID</span>
                  <span className="font-mono text-emerald-950 text-[11px] font-bold select-all">
                    {order.captureId}
                  </span>
                </div>
              )}
              <div className="p-2.5 rounded bg-canvas border border-border/70 space-y-0.5">
                <span className="text-[10px] uppercase font-bold text-muted block">Created At</span>
                <span className="text-muted text-[11px]">
                  {new Date(order.createdAt).toLocaleString()}
                </span>
              </div>
            </div>

            {reconciliationNotes && (
              <div className="p-3 rounded bg-blue-50 border border-blue-200 text-xs text-blue-950 space-y-1">
                <span className="font-bold">Reconciliation Report:</span>
                <p className="text-[11px]">{reconciliationNotes}</p>
              </div>
            )}
          </div>

          {/* Action Management Center */}
          <div className="p-5 rounded-panel border border-border bg-surface space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink border-b border-border pb-2">
              Lifecycle Actions & Transitions
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Buyer Approval Verification */}
              <div className="p-4 rounded border border-border bg-canvas space-y-3 text-xs">
                <div className="flex items-center space-x-2 font-bold text-ink">
                  <UserCheck className="w-4 h-4 text-blue-600" />
                  <span>Buyer Approval Verification</span>
                </div>
                <p className="text-[11px] text-muted leading-relaxed">
                  Validate buyer authorization against the PayPal Orders API before unlocking capture.
                </p>

                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <label htmlFor="payer-id-input" className="text-[10px] text-muted">PayerID:</label>
                    <input
                      id="payer-id-input"
                      type="text"
                      value={payerIdInput}
                      onChange={(e) => setPayerIdInput(e.target.value)}
                      placeholder="Optional Payer ID"
                      className="px-2 py-1 text-[11px] font-mono rounded border border-border bg-surface text-ink flex-1"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleConfirmApproval()}
                    disabled={actionLoading === "confirming" || isCaptured || isCancelled}
                    className="w-full py-1.5 rounded text-xs font-semibold bg-blue-700 text-white hover:bg-blue-800 transition-colors disabled:opacity-50 flex items-center justify-center space-x-1"
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
              <div className="p-4 rounded border border-border bg-canvas space-y-3 text-xs">
                <div className="flex items-center space-x-2 font-bold text-ink">
                  <CreditCard className="w-4 h-4 text-emerald-600" />
                  <span>Server-Side Capture</span>
                </div>
                <p className="text-[11px] text-muted leading-relaxed">
                  Execute payment capture with server-side idempotency. Requires <code>APPROVED</code> status.
                </p>

                {showCaptureConfirm ? (
                  <div className="p-3 rounded bg-white border border-emerald-300 space-y-2">
                    <div className="text-[11px] font-bold text-emerald-950">
                      Confirm Capture of ${(order.amountMinor / 100).toFixed(2)} {order.currency}?
                    </div>
                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => void handleCapture()}
                        disabled={actionLoading === "capturing"}
                        className="px-3 py-1.5 rounded text-xs font-semibold bg-emerald-700 text-white hover:bg-emerald-800 transition-colors disabled:opacity-50"
                      >
                        {actionLoading === "capturing" ? "Capturing..." : "Confirm Capture"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCaptureConfirm(false)}
                        className="text-xs text-muted hover:underline"
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
                    className="w-full py-1.5 rounded text-xs font-semibold bg-emerald-700 text-white hover:bg-emerald-800 transition-colors disabled:opacity-50 flex items-center justify-center space-x-1"
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
            </div>

            {/* Bottom Controls: Cancellation & Reconciliation */}
            <div className="pt-3 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div>
                {showCancelConfirm ? (
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      placeholder="Cancellation reason"
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      className="px-2 py-1 text-xs rounded border border-border bg-canvas text-ink w-44"
                    />
                    <button
                      type="button"
                      onClick={() => void handleCancel()}
                      disabled={actionLoading === "cancelling"}
                      className="px-3 py-1 rounded text-xs font-medium bg-red-700 text-white hover:bg-red-800 transition-colors disabled:opacity-50"
                    >
                      {actionLoading === "cancelling" ? "Cancelling..." : "Confirm Cancel"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setShowCancelConfirm(false)}
                      className="text-xs text-muted hover:underline"
                    >
                      Dismiss
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowCancelConfirm(true)}
                    disabled={isCaptured || isCancelled || actionLoading === "cancelling"}
                    className="text-xs text-red-700 hover:text-red-900 font-medium disabled:opacity-40"
                  >
                    {isCancelled ? "Order Cancelled" : "Cancel Order & Release Hold..."}
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => void handleReconcile()}
                disabled={actionLoading === "reconciling"}
                className="px-3 py-1.5 rounded text-xs font-medium border border-border bg-canvas hover:bg-surface text-ink transition-colors disabled:opacity-50 flex items-center space-x-1"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${actionLoading === "reconciling" ? "animate-spin" : ""}`}
                />
                <span>Reconcile Ledger</span>
              </button>
            </div>
          </div>
        </div>
      ) : !loading && searchQuery ? (
        <div className="p-8 text-center border border-dashed border-border rounded-panel bg-surface space-y-2">
          <CreditCard className="w-8 h-8 text-muted mx-auto" />
          <h3 className="font-semibold text-sm text-ink">No Order Record Loaded</h3>
          <p className="text-xs text-muted max-w-sm mx-auto">
            Enter an internal order UUID or PayPal provider order ID to inspect its lifecycle state and available actions.
          </p>
        </div>
      ) : null}
    </div>
  );
}
