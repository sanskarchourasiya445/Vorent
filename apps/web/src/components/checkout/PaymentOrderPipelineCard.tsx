import { useState } from "react";
import {
  ShieldCheck,
  Lock,
  CreditCard,
  UserCheck,
  CheckCircle2,
  XCircle,
  Clock,
  ExternalLink,
  AlertCircle,
  RefreshCw,
  Ban,
  ArrowRight,
  HelpCircle,
} from "lucide-react";
import type { PaymentOrderPipelineCardProps, PipelineStageInfo } from "../../types/paymentOrder";
import type { PaymentStatus, ReservationState } from "@warrant/contracts";

export function PaymentOrderPipelineCard({
  decision,
  primaryReasonCode,
  reservationId,
  reservationState,
  amountMinor,
  currency = "USD",
  isDemoSimulation = false,
  paypalOrderState,
  onCreatePayPalOrder,
  onConfirmBuyerApproval,
  onCapturePaymentOrder,
  onCancelPaymentOrder,
  onReconcilePaymentOrder,
  onRefreshOrderDetails,
  className = "",
}: PaymentOrderPipelineCardProps) {
  const [showCaptureConfirm, setShowCaptureConfirm] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [customPayerId, setCustomPayerId] = useState("");

  const isAllow = decision === "ALLOW";
  const isDeny = decision === "DENY";
  const hasReservation = Boolean(reservationId);
  const paypalCreated = Boolean(paypalOrderState?.paypalOrderId || paypalOrderState?.orderId);

  const status: PaymentStatus | undefined = paypalOrderState?.status;
  const currentReservationState: ReservationState | string | undefined =
    paypalOrderState?.reservationState || reservationState;

  const isApproved = status === "APPROVED";
  const isCaptured = status === "CAPTURED";
  const isCancelled = status === "CANCELLED";
  const isFailed = status === "FAILED";
  const isCapturePending = status === "CAPTURE_PENDING";
  const isUnknown =
    status === "UNKNOWN_REQUIRES_RECONCILIATION" ||
    Boolean(paypalOrderState?.isAmbiguous) ||
    currentReservationState === "RECONCILIATION_HOLD";

  // Compute status for the 4 distinct lifecycle stages
  const stages: PipelineStageInfo[] = [
    {
      id: "warrant_gate",
      title: "1. Warrant Policy Gate",
      shortLabel: "Gate Authorization",
      status: !decision ? "PENDING" : isAllow ? "SUCCESS" : "FAILED",
      statusText: !decision
        ? "Awaiting Evaluation"
        : isAllow
        ? "ALLOW (Authorized)"
        : `DENY (${primaryReasonCode || "Violation"})`,
      details: isAllow
        ? "All policy rules satisfied. Authorization granted."
        : "Transaction denied by policy gate. Downstream pipeline blocked.",
    },
    {
      id: "spend_reservation",
      title: "2. Spend Reservation",
      shortLabel: "Ledger Hold",
      status: !isAllow
        ? "BLOCKED"
        : isCaptured
        ? "SUCCESS"
        : isCancelled
        ? "FAILED"
        : isUnknown
        ? "FAILED"
        : hasReservation
        ? "SUCCESS"
        : "IN_PROGRESS",
      statusText: !isAllow
        ? "Blocked (Gate Denied)"
        : !hasReservation
        ? "Pending Issuance"
        : currentReservationState === "COMMITTED"
        ? "COMMITTED (Ledger Settled)"
        : currentReservationState === "RELEASED"
        ? "RELEASED (Hold Restored)"
        : currentReservationState === "RECONCILIATION_HOLD"
        ? "RECONCILIATION_HOLD (Locked)"
        : currentReservationState === "ORDER_CREATION_PENDING"
        ? "ORDER_CREATION_PENDING (Hold Active)"
        : `${currentReservationState || "RESERVED"}`,
      details:
        !isAllow
          ? "No reservation created for denied proposal."
          : !hasReservation
          ? "Submit cart to Warrant Authorization Gate to initiate the checkout pipeline."
          : currentReservationState === "COMMITTED"
          ? `Spend commitment of $${((amountMinor || 0) / 100).toFixed(2)} ${currency} finalized on ledger.`
          : currentReservationState === "RELEASED"
          ? `Reservation released; spend limit restored.`
          : currentReservationState === "RECONCILIATION_HOLD"
          ? `Spend hold locked for reconciliation to prevent double-spending.`
          : currentReservationState === "ORDER_CREATION_PENDING"
          ? `Temporary spend hold of $${((amountMinor || 0) / 100).toFixed(2)} ${currency} locked on approval; confirmed upon PayPal order creation.`
          : `Reserved $${((amountMinor || 0) / 100).toFixed(2)} ${currency} against approval limit.`,
    },
    {
      id: "paypal_order",
      title: "3. PayPal Sandbox Order",
      shortLabel: "Order Creation",
      status: !hasReservation
        ? "BLOCKED"
        : paypalOrderState?.isCreating
        ? "IN_PROGRESS"
        : isUnknown
        ? "FAILED"
        : paypalOrderState?.error && !paypalCreated
        ? "FAILED"
        : paypalCreated
        ? "SUCCESS"
        : "PENDING",
      statusText: !hasReservation
        ? "Awaiting Gate & Reservation"
        : paypalOrderState?.isCreating
        ? "Creating in Sandbox..."
        : isUnknown
        ? "Reconciliation Hold"
        : paypalOrderState?.error && !paypalCreated
        ? "Order Creation Failed"
        : paypalCreated
        ? `CREATED (${paypalOrderState?.paypalOrderId?.slice(0, 12) || "PayPal"}...)`
        : "Ready for Dispatch",
      details: paypalCreated
        ? `PayPal Order ${paypalOrderState?.paypalOrderId || ""} initialized.`
        : isUnknown
        ? "Ambiguous outcome detected. Automatic retry disabled to prevent duplicates."
        : paypalOrderState?.error
        ? paypalOrderState.error
        : hasReservation
        ? "Dispatches proposalId and reservationId to POST /api/payment-orders."
        : "Order creation requires active spend reservation.",
    },
    {
      id: "buyer_approval",
      title: "4. Buyer Approval & Capture",
      shortLabel: "Approval & Capture",
      status: !paypalCreated
        ? "BLOCKED"
        : isCaptured
        ? "SUCCESS"
        : isApproved
        ? "IN_PROGRESS"
        : isCapturePending
        ? "IN_PROGRESS"
        : isCancelled
        ? "FAILED"
        : isFailed
        ? "FAILED"
        : isUnknown
        ? "FAILED"
        : "PENDING",
      statusText: !paypalCreated
        ? "Awaiting Order Creation"
        : isCaptured
        ? "CAPTURED (Complete)"
        : isApproved
        ? "APPROVED (Ready for Capture)"
        : isCapturePending
        ? "CAPTURE_PENDING"
        : isCancelled
        ? "CANCELLED"
        : isFailed
        ? "FAILED"
        : isUnknown
        ? "RECONCILIATION_HOLD"
        : "Awaiting Buyer Action",
      details: isCaptured
        ? `Payment successfully captured (ID: ${paypalOrderState?.captureId || "confirmed"}).`
        : isApproved
        ? "Buyer approval verified by PayPal API. Capture action unlocked."
        : isCapturePending
        ? "Capture dispatched to PayPal. Awaiting settlement."
        : isCancelled
        ? "Order cancelled before capture."
        : isUnknown
        ? "Outcome uncertain; hold active pending reconciliation."
        : paypalOrderState?.approvalUrl
        ? "Buyer redirect URL generated. Requires buyer authorization in PayPal."
        : "Awaiting buyer authorization and server-side capture.",
    },
  ];

  const isCreateButtonDisabled =
    !onCreatePayPalOrder ||
    Boolean(paypalOrderState?.isCreating) ||
    Boolean(paypalCreated) ||
    Boolean(paypalOrderState?.isAmbiguous);

  const isCaptureActionEligible = isApproved && !isCaptured && !isCancelled && !isUnknown;
  const isCancelActionEligible =
    paypalCreated && !isCaptured && !isCancelled && status !== "CAPTURE_PENDING";

  return (
    <article
      className={`rounded-panel border border-border bg-surface p-5 shadow-sm space-y-5 ${className}`}
      role="region"
      aria-label="Payment Order Pipeline"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
        <div className="flex items-center space-x-2">
          <CreditCard className="w-5 h-5 text-accent shrink-0" aria-hidden="true" />
          <h3 className="text-sm font-bold tracking-tight text-ink">
            Checkout Execution Pipeline
          </h3>
        </div>
        <div className="flex items-center space-x-2">
          {isDemoSimulation && (
            <span className="text-[10px] font-semibold uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-900 border border-amber-300">
              Offline Simulation
            </span>
          )}
          <span className="text-[11px] font-medium text-muted">
            Phase 1 Lifecycle Active
          </span>
          {paypalCreated && onRefreshOrderDetails && (
            <button
              type="button"
              onClick={() => void onRefreshOrderDetails()}
              disabled={paypalOrderState?.isRefreshing}
              className="p-1 rounded text-muted hover:text-ink hover:bg-canvas transition-colors"
              title="Refresh order details from backend"
              aria-label="Refresh order details"
            >
              <RefreshCw
                className={`w-3.5 h-3.5 ${paypalOrderState?.isRefreshing ? "animate-spin" : ""}`}
              />
            </button>
          )}
        </div>
      </div>

      {/* 4-Stage Stepper Track */}
      <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 list-none p-0 m-0" role="list">
        {stages.map((stage, idx) => {
          let badgeColor = "bg-muted/10 border-border text-muted";
          let icon = <Clock className="w-4 h-4 text-muted shrink-0" aria-hidden="true" />;

          if (stage.status === "SUCCESS") {
            badgeColor = "bg-emerald-50 border-emerald-300 text-emerald-950";
            icon = <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />;
          } else if (stage.status === "FAILED") {
            badgeColor = "bg-red-50 border-red-300 text-red-950";
            icon = <XCircle className="w-4 h-4 text-red-700 shrink-0" aria-hidden="true" />;
          } else if (stage.status === "BLOCKED") {
            badgeColor = "bg-canvas border-border/80 text-muted";
            icon = <Lock className="w-4 h-4 text-muted/60 shrink-0" aria-hidden="true" />;
          } else if (stage.status === "IN_PROGRESS") {
            badgeColor = "bg-blue-50 border-blue-300 text-blue-950";
            icon = <Clock className="w-4 h-4 text-blue-700 animate-spin shrink-0" aria-hidden="true" />;
          } else if (stage.status === "FUTURE_PHASE") {
            badgeColor = "bg-purple-50/60 border-purple-200 text-purple-950";
            icon = <UserCheck className="w-4 h-4 text-purple-700 shrink-0" aria-hidden="true" />;
          }

          return (
            <li
              key={stage.id}
              className={`p-3 rounded border ${badgeColor} flex flex-col justify-between space-y-2`}
              role="listitem"
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase font-bold tracking-wider text-muted">
                    Step {idx + 1}
                  </span>
                  {icon}
                </div>
                <div className="text-xs font-semibold text-ink leading-snug">
                  {stage.title}
                </div>
              </div>

              <div className="space-y-1 pt-1 border-t border-border/40">
                <div className="text-[11px] font-mono font-medium truncate">
                  {stage.statusText}
                </div>
                <div className="text-[10px] text-muted leading-tight">
                  {stage.details}
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {/* Main Interaction Area */}
      <div className="p-4 rounded-panel bg-canvas border border-border space-y-4">
        {/* Header line */}
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="flex items-center space-x-2">
            <CreditCard className="w-4 h-4 text-accent" aria-hidden="true" />
            <span className="text-xs font-bold uppercase tracking-wider text-ink">
              PayPal Lifecycle Execution
            </span>
          </div>
          <span className="text-[10px] font-mono text-muted bg-surface px-2 py-0.5 rounded border border-border">
            {paypalCreated ? "Lifecycle Active" : "POST /api/payment-orders"}
          </span>
        </div>

        {/* Ambiguous Outcome Alert (Reconciliation Required) */}
        {isUnknown && (
          <div
            role="alert"
            className="p-3.5 rounded bg-amber-50 border border-amber-300 text-amber-950 space-y-2 text-xs"
          >
            <div className="flex items-center space-x-2 font-bold text-amber-900">
              <AlertCircle className="w-4 h-4 text-amber-800 shrink-0" />
              <span>Ambiguous Payment Outcome — Reconciliation Hold Active</span>
            </div>
            <p className="text-[11px] text-amber-900 leading-relaxed">
              {paypalOrderState?.error ||
                "A network timeout or uncertain outcome occurred. Spend reservation is on RECONCILIATION_HOLD to prevent double charging."}
            </p>
            <div className="p-2.5 rounded bg-amber-100/80 border border-amber-300/80 text-[11px] text-amber-950 space-y-2">
              <div>
                <strong>Recovery Guidance:</strong> Automatic retry is strictly blocked. Use the authoritative reconciliation endpoint below to safely query the PayPal ledger.
              </div>
              {onReconcilePaymentOrder && (
                <button
                  type="button"
                  onClick={() => void onReconcilePaymentOrder()}
                  disabled={paypalOrderState?.isReconciling}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded font-semibold text-xs bg-amber-800 text-white hover:bg-amber-900 transition-colors disabled:opacity-50"
                >
                  <RefreshCw
                    className={`w-3.5 h-3.5 ${paypalOrderState?.isReconciling ? "animate-spin" : ""}`}
                  />
                  <span>
                    {paypalOrderState?.isReconciling
                      ? "Reconciling with PayPal..."
                      : "Reconcile with PayPal APIs"}
                  </span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Standard API Failure Alert */}
        {!isUnknown && paypalOrderState?.error && (
          <div
            role="alert"
            className="p-3.5 rounded bg-red-50 border border-red-200 text-red-950 space-y-1.5 text-xs"
          >
            <div className="flex items-center space-x-2 font-semibold text-red-900">
              <XCircle className="w-4 h-4 text-red-700 shrink-0" />
              <span>Payment Lifecycle Action Error</span>
            </div>
            <p className="text-[11px] text-red-900 leading-relaxed">
              {paypalOrderState.error}
            </p>
          </div>
        )}

        {/* State A: Before Order Creation */}
        {!paypalCreated && !isDeny && hasReservation && (
          <div className="space-y-3">
            <div className="p-3 rounded bg-blue-50/80 border border-blue-200 text-blue-950 text-xs space-y-1">
              <div className="flex items-center space-x-1.5 font-semibold text-blue-900">
                <ShieldCheck className="w-4 h-4 text-blue-700" />
                <span>Prerequisites Satisfied for Sandbox Order Creation</span>
              </div>
              <p className="text-[11px] text-blue-900 leading-relaxed">
                Warrant authorization is <strong>ALLOW</strong> and spend hold <code>{reservationId}</code> is active in <code>{reservationState || "ORDER_CREATION_PENDING"}</code> state on the ledger.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
              <div className="text-[11px] text-muted space-y-0.5">
                <div>
                  Payload Target: <code>{`{ proposalId, reservationId }`}</code>
                </div>
                <div className="text-[10px] text-muted">
                  Dispatches exclusively server-trusted proposal & reservation UUIDs.
                </div>
              </div>

              <button
                type="button"
                onClick={onCreatePayPalOrder}
                disabled={isCreateButtonDisabled}
                className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-4 py-2 rounded text-xs font-semibold bg-accent text-white hover:bg-accent/90 transition-colors shadow-sm disabled:opacity-50 shrink-0"
              >
                {paypalOrderState?.isCreating ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Creating Order in PayPal Sandbox...</span>
                  </>
                ) : (
                  <>
                    <span>Create PayPal Sandbox Order</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* State B: Denied by Gate */}
        {!paypalCreated && isDeny && (
          <div className="p-3 rounded bg-red-50 border border-red-200 text-red-950 text-xs flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-semibold">PayPal Order Dispatch Blocked</span>
              <p className="text-[11px] text-red-900 leading-relaxed">
                The Warrant Gate denied this proposal ({primaryReasonCode}). No spend reservation or PayPal order can be created for non-compliant carts.
              </p>
            </div>
          </div>
        )}

        {/* State C: Order Exists — Comprehensive Lifecycle Card */}
        {paypalCreated && (
          <div className="space-y-4">
            {/* Order Attributes Grid */}
            <div className="p-3.5 rounded bg-surface border border-border text-xs space-y-3">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div className="flex items-center space-x-2">
                  <span className="font-bold text-ink text-xs">Payment Order Details</span>
                  {/* Status Badge */}
                  <span
                    className={`font-mono px-2 py-0.5 rounded text-[10px] font-bold border ${
                      isCaptured
                        ? "bg-emerald-100 text-emerald-900 border-emerald-300"
                        : isApproved
                        ? "bg-blue-100 text-blue-900 border-blue-300"
                        : isCancelled
                        ? "bg-gray-100 text-gray-800 border-gray-300"
                        : isUnknown
                        ? "bg-amber-100 text-amber-900 border-amber-300"
                        : isFailed
                        ? "bg-red-100 text-red-900 border-red-300"
                        : "bg-blue-50 text-blue-900 border-blue-200"
                    }`}
                  >
                    STATUS: {status || "CREATED"}
                  </span>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-[11px] text-muted">Reservation:</span>
                  <span
                    className={`font-mono text-[10px] font-semibold px-2 py-0.5 rounded border ${
                      currentReservationState === "COMMITTED"
                        ? "bg-emerald-50 text-emerald-900 border-emerald-300"
                        : currentReservationState === "RELEASED"
                        ? "bg-gray-100 text-gray-700 border-gray-300"
                        : currentReservationState === "RECONCILIATION_HOLD"
                        ? "bg-amber-100 text-amber-900 border-amber-300"
                        : "bg-blue-50 text-blue-900 border-blue-200"
                    }`}
                  >
                    {currentReservationState || "RESERVED"}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 pt-2 border-t border-border/60 text-[11px]">
                <div>
                  <span className="text-muted block text-[10px] uppercase font-bold">PayPal Order ID</span>
                  <strong className="font-mono text-ink select-all">
                    {paypalOrderState?.paypalOrderId || "N/A"}
                  </strong>
                </div>
                <div>
                  <span className="text-muted block text-[10px] uppercase font-bold">Internal Order ID</span>
                  <span className="font-mono text-muted text-[10px] truncate block select-all">
                    {paypalOrderState?.orderId || "N/A"}
                  </span>
                </div>
                <div>
                  <span className="text-muted block text-[10px] uppercase font-bold">Authorized Amount</span>
                  <strong className="font-mono text-ink">
                    ${((amountMinor || paypalOrderState?.amountMinor || 0) / 100).toFixed(2)}{" "}
                    {currency || paypalOrderState?.currency || "USD"}
                  </strong>
                </div>
                {paypalOrderState?.payerId && (
                  <div>
                    <span className="text-muted block text-[10px] uppercase font-bold">Verified Payer ID</span>
                    <strong className="font-mono text-ink">{paypalOrderState.payerId}</strong>
                  </div>
                )}
                {paypalOrderState?.captureId && (
                  <div>
                    <span className="text-muted block text-[10px] uppercase font-bold">PayPal Capture ID</span>
                    <strong className="font-mono text-emerald-800">{paypalOrderState.captureId}</strong>
                  </div>
                )}
                {paypalOrderState?.createdAt && (
                  <div>
                    <span className="text-muted block text-[10px] uppercase font-bold">Created Timestamp</span>
                    <span className="text-muted text-[10px]">
                      {new Date(paypalOrderState.createdAt).toLocaleString()}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Stage 4A: Buyer Approval Action (When CREATED or PAYER_ACTION_REQUIRED) */}
            {!isApproved && !isCaptured && !isCancelled && !isUnknown && (
              <div className="p-3.5 rounded bg-blue-50/70 border border-blue-200 text-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 font-semibold text-blue-950">
                    <UserCheck className="w-4 h-4 text-blue-700" />
                    <span>Buyer Approval Required</span>
                  </div>
                  <span className="text-[10px] font-semibold uppercase text-blue-800 bg-blue-100 px-2 py-0.5 rounded border border-blue-300">
                    Step 1 of 2
                  </span>
                </div>

                <p className="text-[11px] text-blue-900 leading-relaxed">
                  The buyer must authorize the payment in the PayPal Sandbox portal. Browser redirects are treated as untrusted; clicking "Verify Buyer Approval" validates the actual state against the PayPal Orders API.
                </p>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                  {paypalOrderState?.approvalUrl && (
                    <a
                      href={paypalOrderState.approvalUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center space-x-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-blue-700 text-white hover:bg-blue-800 transition-colors shadow-xs"
                    >
                      <span>Open Buyer Portal</span>
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}

                  {onConfirmBuyerApproval && (
                    <button
                      type="button"
                      onClick={() => void onConfirmBuyerApproval(customPayerId || undefined)}
                      disabled={paypalOrderState?.isConfirmingApproval}
                      className="inline-flex items-center justify-center space-x-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-accent text-white hover:bg-accent/90 transition-colors shadow-xs disabled:opacity-50"
                    >
                      <RefreshCw
                        className={`w-3.5 h-3.5 ${
                          paypalOrderState?.isConfirmingApproval ? "animate-spin" : ""
                        }`}
                      />
                      <span>
                        {paypalOrderState?.isConfirmingApproval
                          ? "Validating with PayPal API..."
                          : "Verify Buyer Approval"}
                      </span>
                    </button>
                  )}
                </div>

                {/* Optional PayerID field for manual return confirmation */}
                <div className="pt-2 border-t border-blue-200/60 flex items-center space-x-2 text-[11px]">
                  <span className="text-blue-900 text-[10px]">Return PayerID (Optional):</span>
                  <input
                    type="text"
                    value={customPayerId}
                    onChange={(e) => setCustomPayerId(e.target.value)}
                    placeholder="e.g. 7XYZ..."
                    className="px-2 py-1 text-[11px] font-mono rounded border border-blue-300 bg-white text-ink w-36"
                  />
                </div>
              </div>
            )}

            {/* Stage 4B: Capture Action Area (When APPROVED) */}
            {isApproved && !isCaptured && (
              <div className="p-3.5 rounded bg-emerald-50 border border-emerald-300 text-xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2 font-bold text-emerald-950">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                    <span>Buyer Approved — Eligible for Server-Side Capture</span>
                  </div>
                  <span className="text-[10px] font-bold uppercase text-emerald-900 bg-emerald-100 px-2 py-0.5 rounded border border-emerald-300">
                    Ready for Capture
                  </span>
                </div>

                <p className="text-[11px] text-emerald-950 leading-relaxed">
                  Buyer authorization is authoritatively confirmed by PayPal. Clicking "Capture Payment" will commit the spend on the ledger and capture the funds in PayPal Sandbox.
                </p>

                {/* Confirmation Box to prevent accidental triggers */}
                {showCaptureConfirm ? (
                  <div className="p-3 rounded bg-white border border-emerald-300 space-y-2">
                    <div className="text-[11px] font-bold text-emerald-950">
                      Confirm Server Capture of $
                      {((amountMinor || paypalOrderState?.amountMinor || 0) / 100).toFixed(2)}{" "}
                      {currency || paypalOrderState?.currency || "USD"}?
                    </div>
                    <p className="text-[10px] text-muted leading-tight">
                      This action will initiate the PayPal capture request and commit the spend reservation. Duplicate clicks are blocked.
                    </p>
                    <div className="flex items-center space-x-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setShowCaptureConfirm(false);
                          if (onCapturePaymentOrder) void onCapturePaymentOrder();
                        }}
                        disabled={paypalOrderState?.isCapturing}
                        className="px-3 py-1.5 rounded text-xs font-semibold bg-emerald-700 text-white hover:bg-emerald-800 transition-colors disabled:opacity-50 flex items-center space-x-1.5"
                      >
                        {paypalOrderState?.isCapturing ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>Capturing Payment...</span>
                          </>
                        ) : (
                          <>
                            <span>Confirm & Capture</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </>
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowCaptureConfirm(false)}
                        disabled={paypalOrderState?.isCapturing}
                        className="px-2.5 py-1.5 rounded text-xs text-muted hover:bg-muted/10 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center space-x-2">
                    <button
                      type="button"
                      onClick={() => setShowCaptureConfirm(true)}
                      disabled={!isCaptureActionEligible || paypalOrderState?.isCapturing}
                      className="px-4 py-2 rounded text-xs font-semibold bg-emerald-700 text-white hover:bg-emerald-800 transition-colors shadow-xs disabled:opacity-50 flex items-center space-x-1.5"
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Capture Payment</span>
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* Stage 4C: Captured Success Banner */}
            {isCaptured && (
              <div className="p-3.5 rounded bg-emerald-50 border border-emerald-300 text-emerald-950 text-xs space-y-2">
                <div className="flex items-center space-x-2 font-bold text-emerald-900">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                  <span>Payment Successfully Captured & Committed</span>
                </div>
                <p className="text-[11px] text-emerald-950 leading-relaxed">
                  The payment has settled. PayPal capture ID <code>{paypalOrderState?.captureId}</code> is linked, and the spend reservation has transitioned to <code>COMMITTED</code>.
                </p>
              </div>
            )}

            {/* Stage 4D: Cancelled Banner */}
            {isCancelled && (
              <div className="p-3.5 rounded bg-gray-50 border border-gray-300 text-gray-900 text-xs space-y-1">
                <div className="flex items-center space-x-2 font-bold text-gray-800">
                  <Ban className="w-4 h-4 text-gray-600" />
                  <span>Payment Order Cancelled</span>
                </div>
                <p className="text-[11px] text-gray-700 leading-relaxed">
                  The order was cancelled prior to capture. The spend reservation has been released and available budget restored.
                </p>
              </div>
            )}

            {/* Order Cancellation Controls (Available when uncaptured) */}
            {isCancelActionEligible && (
              <div className="pt-2 border-t border-border/60 flex items-center justify-between flex-wrap gap-2">
                <div className="text-[10px] text-muted flex items-center space-x-1">
                  <HelpCircle className="w-3 h-3 text-muted/60" />
                  <span>Cancellation safely releases the spend reservation if uncaptured.</span>
                </div>

                {showCancelConfirm ? (
                  <div className="flex items-center space-x-2">
                    <input
                      type="text"
                      placeholder="Reason (optional)"
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      className="px-2 py-1 text-[11px] rounded border border-border bg-surface text-ink w-36"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setShowCancelConfirm(false);
                        if (onCancelPaymentOrder) void onCancelPaymentOrder(cancelReason);
                      }}
                      disabled={paypalOrderState?.isCancelling}
                      className="px-2.5 py-1 rounded text-xs font-medium bg-red-700 text-white hover:bg-red-800 transition-colors disabled:opacity-50"
                    >
                      {paypalOrderState?.isCancelling ? "Cancelling..." : "Confirm Cancel"}
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
                    disabled={paypalOrderState?.isCancelling}
                    className="text-xs text-red-700 hover:text-red-900 font-medium transition-colors"
                  >
                    Cancel Order...
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
}
