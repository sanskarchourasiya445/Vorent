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
  ArrowRight,
} from "lucide-react";
import type { PaymentOrderPipelineCardProps, PipelineStageInfo } from "../../types/paymentOrder";

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
  className = "",
}: PaymentOrderPipelineCardProps) {
  const isAllow = decision === "ALLOW";
  const isDeny = decision === "DENY";
  const hasReservation = Boolean(reservationId);
  const paypalCreated = Boolean(paypalOrderState?.paypalOrderId);

  // Compute status for the 4 distinct lifecycle stages
  const stages: PipelineStageInfo[] = [
    {
      id: "warrant_gate",
      title: "1. Warrant Policy Gate",
      shortLabel: "Gate Authorization",
      status: !decision
        ? "PENDING"
        : isAllow
        ? "SUCCESS"
        : "FAILED",
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
        : hasReservation
        ? "SUCCESS"
        : "IN_PROGRESS",
      statusText: !isAllow
        ? "Blocked (Gate Denied)"
        : reservationState === "ORDER_CREATION_PENDING"
        ? "ORDER_CREATION_PENDING (Hold Active)"
        : hasReservation
        ? `${reservationState || "RESERVED"}`
        : "Pending Issuance",
      details: reservationState === "ORDER_CREATION_PENDING"
        ? `Temporary spend hold of $${((amountMinor || 0) / 100).toFixed(2)} ${currency} locked on approval; confirmed upon PayPal order creation.`
        : hasReservation
        ? `Reserved $${((amountMinor || 0) / 100).toFixed(2)} ${currency} against approval limit.`
        : isAllow
        ? "Ledger hold queued on backend."
        : "No reservation created for denied proposal.",
    },
    {
      id: "paypal_order",
      title: "3. PayPal Sandbox Order",
      shortLabel: "Order Creation",
      status: !hasReservation
        ? "BLOCKED"
        : paypalOrderState?.isCreating
        ? "IN_PROGRESS"
        : paypalOrderState?.isAmbiguous
        ? "FAILED"
        : paypalOrderState?.error
        ? "FAILED"
        : paypalCreated
        ? "SUCCESS"
        : "PENDING",
      statusText: !hasReservation
        ? "Awaiting Gate & Reservation"
        : paypalOrderState?.isCreating
        ? "Creating in Sandbox..."
        : paypalOrderState?.isAmbiguous
        ? "Reconciliation Hold"
        : paypalOrderState?.error
        ? "Order Creation Failed"
        : paypalCreated
        ? `CREATED (${paypalOrderState?.paypalOrderId?.slice(0, 12)}...)`
        : "Ready for Dispatch",
      details: paypalCreated
        ? `PayPal Order ${paypalOrderState?.paypalOrderId} initialized via server credentials.`
        : paypalOrderState?.isAmbiguous
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
      shortLabel: "Buyer Approval",
      status: "FUTURE_PHASE",
      statusText: "Scheduled for Next Phase",
      details: "Requires buyer browser redirection to PayPal checkout portal. Follow-up milestone.",
    },
  ];

  const isButtonDisabled =
    !onCreatePayPalOrder ||
    Boolean(paypalOrderState?.isCreating) ||
    Boolean(paypalCreated) ||
    Boolean(paypalOrderState?.isAmbiguous);

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
          <span className="text-[11px] text-muted">
            Phase 1 & 2 Active | Phase 3 Connected
          </span>
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

      {/* Stage 3: PayPal Sandbox Order Action Area */}
      <div className="p-4 rounded-panel bg-canvas border border-border space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <CreditCard className="w-4 h-4 text-accent" aria-hidden="true" />
            <span className="text-xs font-bold uppercase tracking-wider text-ink">
              PayPal Sandbox Order Creation
            </span>
          </div>
          <span className="text-[10px] font-mono text-muted bg-surface px-2 py-0.5 rounded border border-border">
            POST /api/payment-orders
          </span>
        </div>

        {/* State: Ambiguous Outcome Alert (Reconciliation Required) */}
        {paypalOrderState?.isAmbiguous && (
          <div
            role="alert"
            className="p-3.5 rounded bg-amber-50 border border-amber-300 text-amber-950 space-y-2 text-xs"
          >
            <div className="flex items-center space-x-2 font-bold text-amber-900">
              <AlertCircle className="w-4 h-4 text-amber-800 shrink-0" />
              <span>Ambiguous Order Creation Outcome — Reconciliation Required</span>
            </div>
            <p className="text-[11px] text-amber-900 leading-relaxed">
              {paypalOrderState.error}
            </p>
            <div className="p-2.5 rounded bg-amber-100/80 border border-amber-300/80 text-[11px] text-amber-950 space-y-1">
              <strong>Recovery Guidance:</strong>
              <p>
                Automatic retry has been blocked to prevent duplicate reservations or double authorization. Please verify the order status in the backend ledger before attempting another operation.
              </p>
            </div>
          </div>
        )}

        {/* State: Standard Order Creation Failure */}
        {!paypalOrderState?.isAmbiguous && paypalOrderState?.error && (
          <div
            role="alert"
            className="p-3.5 rounded bg-red-50 border border-red-200 text-red-950 space-y-1.5 text-xs"
          >
            <div className="flex items-center space-x-2 font-semibold text-red-900">
              <XCircle className="w-4 h-4 text-red-700 shrink-0" />
              <span>Payment Order Dispatch Failed</span>
            </div>
            <p className="text-[11px] text-red-900 leading-relaxed">
              {paypalOrderState.error}
            </p>
          </div>
        )}

        {/* State: Order Created */}
        {paypalCreated && paypalOrderState ? (
          <div className="p-3.5 rounded bg-emerald-50 border border-emerald-300 text-emerald-950 space-y-2 text-xs">
            <div className="flex items-center space-x-2 font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              <span>PayPal Sandbox Order Successfully Initialized</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px]">
              <div>
                PayPal Order ID:{" "}
                <strong className="font-mono">{paypalOrderState.paypalOrderId}</strong>
              </div>
              {paypalOrderState.orderId && (
                <div>
                  Internal Order ID:{" "}
                  <strong className="font-mono">{paypalOrderState.orderId}</strong>
                </div>
              )}
              <div>
                Order Status:{" "}
                <span className="font-mono px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-900 border border-emerald-300">
                  {paypalOrderState.status || "CREATED"}
                </span>
              </div>
              <div>
                Reservation:{" "}
                <span className="font-mono">
                  {paypalOrderState.reservationState || "RESERVED"}
                </span>
              </div>
            </div>

            {paypalOrderState.approvalUrl && (
              <div className="pt-2 border-t border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <span className="text-[11px] text-emerald-900">
                  Buyer approval portal URL generated by PayPal:
                </span>
                <a
                  href={paypalOrderState.approvalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center space-x-1 px-3 py-1.5 rounded text-xs font-semibold bg-emerald-700 text-white hover:bg-emerald-800 transition-colors shadow-xs"
                >
                  <span>Open Buyer Portal</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </div>
        ) : isDeny ? (
          /* State: Denied by Gate */
          <div className="p-3 rounded bg-red-50 border border-red-200 text-red-950 text-xs flex items-start space-x-2">
            <AlertCircle className="w-4 h-4 text-red-700 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-semibold">PayPal Order Dispatch Blocked</span>
              <p className="text-[11px] text-red-900 leading-relaxed">
                The Warrant Gate denied this proposal ({primaryReasonCode}). No spend reservation or PayPal order can be created for non-compliant carts.
              </p>
            </div>
          </div>
        ) : hasReservation ? (
          /* State: Reservation active, ready to create order */
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
                disabled={isButtonDisabled}
                className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-4 py-2 rounded text-xs font-semibold bg-accent text-white hover:bg-accent/90 transition-colors shadow-sm disabled:opacity-50 shrink-0"
              >
                {paypalOrderState?.isCreating ? (
                  <>
                    <Clock className="w-3.5 h-3.5 animate-spin" />
                    <span>Creating PayPal Order...</span>
                  </>
                ) : paypalCreated ? (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Order Created</span>
                  </>
                ) : paypalOrderState?.isAmbiguous ? (
                  <>
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>Reconciliation Required</span>
                  </>
                ) : (
                  <>
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Create PayPal Sandbox Order</span>
                    <ArrowRight className="w-3 h-3" />
                  </>
                )}
              </button>
            </div>
          </div>
        ) : (
          /* State: Gate not evaluated yet */
          <div className="p-3 rounded border border-dashed border-border bg-surface text-center text-xs text-muted">
            Submit cart to Warrant Authorization Gate to initiate the checkout pipeline.
          </div>
        )}
      </div>

      {/* Stage 4: Buyer Approval Information Callout */}
      <div className="p-3.5 rounded border border-purple-200 bg-purple-50/40 text-purple-950 text-xs space-y-1">
        <div className="flex items-center space-x-1.5 font-semibold text-purple-900">
          <UserCheck className="w-4 h-4 text-purple-700 shrink-0" />
          <span>Downstream Stage: Buyer Approval (Future Phase)</span>
        </div>
        <p className="text-[11px] text-purple-900/90 leading-relaxed">
          In production and sandbox PayPal flows, creating an order generates an <code>approve</code> URL. The buyer must authenticate and approve the payment in the PayPal portal before capture can be finalized. This step is isolated and will be exercised in the next integration phase.
        </p>
      </div>
    </article>
  );
}
