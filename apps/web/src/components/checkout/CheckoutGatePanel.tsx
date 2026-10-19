import { useState, useEffect, useCallback } from "react";
import type { CheckoutProposalItem, CheckoutGateResult } from "../../types/checkout";
import type { ApprovalListState } from "../../types/approval";
import { submitCheckoutProposal, requestCheckoutNonce } from "../../api/checkoutService";
import { fetchApprovals } from "../../api/approvalService";
import { DecisionResultCard } from "../features/DecisionResultCard";
import { PaymentOrderPipelineCard } from "./PaymentOrderPipelineCard";
import { createPaymentOrder, PaymentOrderError } from "../../api/paymentOrderService";
import type { PayPalOrderPresentationState } from "../../types/paymentOrder";
import { AVAILABLE_POLICIES } from "../../api/verificationService";
import {
  ShieldCheck,
  ShoppingCart,
  Send,
  AlertCircle,
  RefreshCw,
  Layers,
  Lock,
  Database,
  FileCheck,
} from "lucide-react";

interface PresetScenario {
  id: string;
  name: string;
  description: string;
  items: CheckoutProposalItem[];
}

const PRESET_SCENARIOS: PresetScenario[] = [
  {
    id: "compliant_book",
    name: "Compliant Books Purchase ($45.00)",
    description: "Authorized technical reference book complying with all limits and categories.",
    items: [
      {
        id: "item_book_01",
        name: "Designing Data-Intensive Applications",
        category: "Reference Books",
        unitPriceMinor: 4500,
        quantity: 1,
      },
    ],
  },
  {
    id: "prohibited_gift_card",
    name: "Prohibited Gift Card Loophole ($50.00)",
    description: "Attempts to purchase a gift card under the $250 item ceiling. Violates prohibited category rule.",
    items: [
      {
        id: "item_card_01",
        name: "Electronic Retail Gift Card",
        category: "Gift Cards",
        unitPriceMinor: 5000,
        quantity: 1,
      },
    ],
  },
  {
    id: "exorbitant_hardware",
    name: "Exorbitant Hardware Limit ($750.00)",
    description: "Item price exceeds the $250.00 item ceiling and $600.00 cart total limit.",
    items: [
      {
        id: "item_gpu_01",
        name: "High-Performance Workstation GPU",
        category: "Hardware",
        unitPriceMinor: 75000,
        quantity: 1,
      },
    ],
  },
  {
    id: "quantity_split_cart",
    name: "Quantity Split Exceeding Cart Cap ($660.00)",
    description: "3 items @ $220.00 each pass per-item limit ($250), but cart total ($660) exceeds the $600 cap.",
    items: [
      {
        id: "item_board_01",
        name: "Ergonomic Mechanical Keyboard",
        category: "Hardware",
        unitPriceMinor: 22000,
        quantity: 3,
      },
    ],
  },
];

export function CheckoutGatePanel() {
  const [selectedScenarioId, setSelectedScenarioId] = useState(PRESET_SCENARIOS[0].id);
  const [items, setItems] = useState<CheckoutProposalItem[]>(PRESET_SCENARIOS[0].items);
  const [merchantName, setMerchantName] = useState("Acme Dev Supplies Ltd.");
  const [useOfflineSimulation, setUseOfflineSimulation] = useState(false);

  // Real approvals state
  const [approvalsState, setApprovalsState] = useState<ApprovalListState>({ state: "LOADING" });
  const [selectedApprovalId, setSelectedApprovalId] = useState<string>("");
  const [useManualApproval, setUseManualApproval] = useState<boolean>(false);
  const [manualApprovalId, setManualApprovalId] = useState<string>("");
  const [manualPolicyId, setManualPolicyId] = useState<string>(AVAILABLE_POLICIES[0]?.id || "");

  // Evaluation state
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evalResult, setEvalResult] = useState<CheckoutGateResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [consumedNonce, setConsumedNonce] = useState<string | null>(null);

  // PayPal Sandbox Order creation state
  const [paypalOrderState, setPaypalOrderState] = useState<PayPalOrderPresentationState | null>(null);
  const [isCreatingPayPalOrder, setIsCreatingPayPalOrder] = useState(false);

  const cartTotalMinor = items.reduce((sum, item) => sum + item.unitPriceMinor * item.quantity, 0);

  const loadApprovals = useCallback(async () => {
    setApprovalsState({ state: "LOADING" });
    const result = await fetchApprovals();
    setApprovalsState(result);

    if (result.state === "READY" && result.data.length > 0) {
      // Pick first active, non-expired approval
      const now = Date.now();
      const active = result.data.find(
        (a) => a.status === "ACTIVE" && new Date(a.expiresAt).getTime() > now,
      );
      if (active) {
        setSelectedApprovalId(active.id);
        setUseManualApproval(false);
      } else {
        setSelectedApprovalId(result.data[0].id);
      }
    }
  }, []);

  useEffect(() => {
    void loadApprovals();
  }, [loadApprovals]);

  const handleScenarioChange = (scenarioId: string) => {
    setSelectedScenarioId(scenarioId);
    const scenario = PRESET_SCENARIOS.find((s) => s.id === scenarioId);
    if (scenario) {
      setItems(scenario.items);
    }
  };

  // Derive authoritative approval record
  const selectedApproval =
    approvalsState.state === "READY"
      ? approvalsState.data.find((a) => a.id === selectedApprovalId) || null
      : null;

  const isSelectedApprovalValid =
    Boolean(selectedApproval) &&
    selectedApproval?.status === "ACTIVE" &&
    new Date(selectedApproval.expiresAt).getTime() > Date.now();

  const effectiveApprovalId = useManualApproval
    ? manualApprovalId.trim()
    : (selectedApproval?.id || "");

  const effectivePolicyVersionId = useManualApproval
    ? manualPolicyId
    : (selectedApproval?.policyVersionId || "");

  const effectivePolicyHash = useManualApproval
    ? (AVAILABLE_POLICIES.find((p) => p.id === manualPolicyId)?.hash || "")
    : (selectedApproval?.policyHash || "");

  const effectiveCurrency = useManualApproval
    ? "USD"
    : (selectedApproval?.currency || "USD");

  const isLiveConfigValid =
    useOfflineSimulation ||
    (Boolean(effectiveApprovalId) &&
      Boolean(effectivePolicyVersionId) &&
      Boolean(effectivePolicyHash) &&
      (useManualApproval || isSelectedApprovalValid));

  const handleEvaluate = async () => {
    if (!isLiveConfigValid) return;
    if (isCreatingPayPalOrder) return;
    if (paypalOrderState?.isAmbiguous) {
      setErrorMessage(
        "A previous payment order is in an ambiguous reconciliation hold. Discarding or re-evaluating without resolving the hold could lead to duplicate orders. Please resolve the order outcome before submitting a new proposal.",
      );
      return;
    }

    setIsEvaluating(true);
    setErrorMessage(null);
    setEvalResult(null);
    setPaypalOrderState(null);

    try {
      let nonce: string | undefined;
      if (!useOfflineSimulation) {
        nonce = await requestCheckoutNonce(
          effectiveApprovalId,
          effectivePolicyVersionId,
          effectivePolicyHash,
        );
        setConsumedNonce(nonce);
      }

      const result = await submitCheckoutProposal({
        approvalId: effectiveApprovalId,
        policyVersionId: effectivePolicyVersionId,
        policyHash: effectivePolicyHash,
        merchantName,
        items,
        currency: effectiveCurrency,
        nonce,
        useOfflineSimulation,
      });

      setEvalResult(result);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Checkout evaluation failed");
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleCreatePayPalOrder = async () => {
    if (isCreatingPayPalOrder) return;
    if (
      !evalResult ||
      evalResult.decision !== "ALLOW" ||
      !evalResult.proposalId ||
      !evalResult.reservationId
    ) {
      return;
    }

    if (evalResult.isDemoSimulation) {
      setPaypalOrderState({
        error:
          "Offline Simulation: PayPal Sandbox payment orders require active PostgreSQL persistence and live Warrant gate authorization.",
        isCreating: false,
      });
      return;
    }

    setIsCreatingPayPalOrder(true);
    setPaypalOrderState((prev) => ({
      ...(prev || {}),
      isCreating: true,
      error: undefined,
      isAmbiguous: false,
    }));

    try {
      const response = await createPaymentOrder({
        proposalId: evalResult.proposalId,
        reservationId: evalResult.reservationId,
      });

      setPaypalOrderState({
        orderId: response.order.id,
        paypalOrderId: response.paypalOrderId,
        provider: response.order.provider,
        status: response.order.status,
        reservationState: response.reservationState,
        approvalUrl: response.approvalUrl,
        isCreating: false,
      });
    } catch (err) {
      if (err instanceof PaymentOrderError) {
        setPaypalOrderState({
          error: err.message,
          errorCode: err.code,
          isAmbiguous: err.isAmbiguous,
          isCreating: false,
        });
      } else {
        setPaypalOrderState({
          error: err instanceof Error ? err.message : "Failed to create PayPal Sandbox order.",
          isCreating: false,
        });
      }
    } finally {
      setIsCreatingPayPalOrder(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto" role="region" aria-label="Checkout Gate Workstation">
      {/* Header */}
      <div className="border-b border-border pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center space-x-2">
            <ShieldCheck className="w-6 h-6 text-accent" aria-hidden="true" />
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink">
              Checkout Authorization Gate
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-muted mt-1">
            Enforces server-side purchase authorization against approved policy rules before any payment operation.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void loadApprovals()}
          disabled={approvalsState.state === "LOADING"}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-canvas hover:bg-border/60 text-ink border border-border transition-colors disabled:opacity-50 shrink-0 self-start sm:self-auto"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${approvalsState.state === "LOADING" ? "animate-spin" : ""}`} />
          <span>Refresh Approvals</span>
        </button>
      </div>

      {/* Configuration & Proposal Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Proposed Cart & Nonce Configuration */}
        <div className="lg:col-span-7 space-y-4">
          <div className="p-5 rounded-panel border border-border bg-surface space-y-4 shadow-sm">
            {/* Bound Approval Selector */}
            <div className="space-y-2 border-b border-border pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <FileCheck className="w-4 h-4 text-accent" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-ink">
                    Authoritative Approval Checkpoint
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setUseManualApproval(!useManualApproval)}
                  className="text-[11px] text-accent hover:underline font-medium"
                >
                  {useManualApproval ? "← Select From Ledger" : "Enter Approval ID →"}
                </button>
              </div>

              {approvalsState.state === "LOADING" && (
                <div className="p-2.5 rounded border border-border bg-canvas text-xs text-muted flex items-center space-x-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-accent" />
                  <span>Loading active approvals from server...</span>
                </div>
              )}

              {approvalsState.state === "UNAVAILABLE" && !useManualApproval && (
                <div className="p-3 rounded border border-amber-300 bg-amber-50 text-amber-950 text-xs space-y-1">
                  <div className="flex items-center space-x-1.5 font-semibold text-amber-900">
                    <Database className="w-3.5 h-3.5 text-amber-700" />
                    <span>PostgreSQL Standby Mode</span>
                  </div>
                  <p className="text-[11px] text-amber-800 leading-relaxed">
                    Live approvals cannot be queried from the database. Please specify an approval ID manually or use labeled offline simulation.
                  </p>
                </div>
              )}

              {!useManualApproval && approvalsState.state === "READY" && (
                <div className="space-y-2">
                  {approvalsState.data.length === 0 ? (
                    <div className="p-3 rounded border border-dashed border-border bg-canvas text-xs text-muted text-center space-y-1">
                      <p>No approvals exist in the database ledger.</p>
                      <button
                        type="button"
                        onClick={() => setUseManualApproval(true)}
                        className="text-xs text-accent underline font-semibold"
                      >
                        Enter Approval ID Manually
                      </button>
                    </div>
                  ) : (
                    <>
                      <select
                        value={selectedApprovalId}
                        onChange={(e) => setSelectedApprovalId(e.target.value)}
                        className="w-full rounded border border-border bg-canvas px-3 py-1.5 text-xs text-ink font-mono"
                      >
                        {approvalsState.data.map((a) => {
                          const isExpired = new Date(a.expiresAt).getTime() <= Date.now();
                          const statusTag = a.status === "ACTIVE" && !isExpired ? "ACTIVE" : isExpired ? "EXPIRED" : a.status;
                          return (
                            <option key={a.id} value={a.id}>
                              [{statusTag}] {a.policyName || a.policyVersionId} | Rem: ${(((a.spendLimitMinor - a.consumedSpendMinor)) / 100).toFixed(2)} {a.currency} ({a.id.slice(0, 8)}...)
                            </option>
                          );
                        })}
                      </select>

                      {selectedApproval && (
                        <div
                          className={`p-3 rounded border text-xs space-y-1.5 ${
                            isSelectedApprovalValid
                              ? "border-emerald-300 bg-emerald-50/60 text-emerald-950"
                              : "border-amber-300 bg-amber-50/60 text-amber-950"
                          }`}
                        >
                          <div className="flex items-center justify-between font-semibold">
                            <span>Status: {selectedApproval.status}</span>
                            <span>
                              Available Spend: $
                              {(
                                (selectedApproval.spendLimitMinor - selectedApproval.consumedSpendMinor) /
                                100
                              ).toFixed(2)}{" "}
                              {selectedApproval.currency}
                            </span>
                          </div>
                          <div className="text-[11px] text-muted space-y-0.5">
                            <div>
                              Policy Version: <span className="font-mono text-ink">{selectedApproval.policyVersionId}</span>
                            </div>
                            <div className="truncate">
                              Policy Hash: <span className="font-mono text-ink">{selectedApproval.policyHash}</span>
                            </div>
                          </div>
                          {!isSelectedApprovalValid && (
                            <p className="text-[11px] text-red-800 font-semibold pt-1">
                              ⚠️ This approval is {selectedApproval.status === "ACTIVE" ? "EXPIRED" : selectedApproval.status}. Gate evaluation will be blocked by backend.
                            </p>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {useManualApproval && (
                <div className="p-3 rounded border border-border bg-canvas space-y-2 text-xs">
                  <div>
                    <label className="block text-[10px] font-semibold text-muted uppercase mb-1">
                      Approval ID (UUID)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 11111111-1111-1111-1111-111111111111"
                      value={manualApprovalId}
                      onChange={(e) => setManualApprovalId(e.target.value)}
                      className="w-full rounded border border-border bg-surface px-3 py-1.5 text-xs text-ink font-mono"
                      required
                    />
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
                    <div className="text-[10px] text-muted font-mono truncate">
                      Derived Hash: {effectivePolicyHash}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Cart Header */}
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center space-x-2">
                <ShoppingCart className="w-4 h-4 text-accent" />
                <h3 className="font-semibold text-xs text-ink uppercase tracking-wider">
                  Proposed Cart Manifest
                </h3>
              </div>
              <span className="font-mono text-xs font-bold text-ink">
                Total: ${(cartTotalMinor / 100).toFixed(2)} USD
              </span>
            </div>

            {/* Scenario Picker */}
            <div>
              <label className="block text-[11px] font-semibold text-muted uppercase mb-1">
                Cart Proposal Scenario
              </label>
              <select
                value={selectedScenarioId}
                onChange={(e) => handleScenarioChange(e.target.value)}
                className="w-full rounded border border-border bg-canvas px-3 py-1.5 text-xs text-ink"
              >
                {PRESET_SCENARIOS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted mt-1">
                {PRESET_SCENARIOS.find((s) => s.id === selectedScenarioId)?.description}
              </p>
            </div>

            {/* Merchant Details */}
            <div>
              <label className="block text-[11px] font-semibold text-muted uppercase mb-1">
                Merchant
              </label>
              <input
                type="text"
                value={merchantName}
                onChange={(e) => setMerchantName(e.target.value)}
                className="w-full rounded border border-border bg-canvas px-3 py-1.5 text-xs text-ink"
              />
            </div>

            {/* Cart Line Items */}
            <div className="space-y-2">
              <div className="text-[11px] font-semibold text-muted uppercase">Line Items</div>
              {items.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded border border-border bg-canvas/40 flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-semibold text-ink">{item.name}</div>
                    <div className="text-[10px] text-muted">Category: {item.category}</div>
                  </div>
                  <div className="text-right font-mono">
                    <div>
                      {item.quantity} × ${(item.unitPriceMinor / 100).toFixed(2)}
                    </div>
                    <div className="font-bold text-ink">
                      ${((item.unitPriceMinor * item.quantity) / 100).toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Nonce & Anti-Replay Info */}
            <div className="p-3 rounded bg-canvas border border-border text-[11px] text-muted space-y-1">
              <div className="flex items-center space-x-1.5 font-semibold text-ink">
                <Lock className="w-3.5 h-3.5 text-accent" />
                <span>Single-Use Cryptographic Nonce</span>
              </div>
              <p className="text-[10px] text-muted leading-relaxed">
                A 256-bit single-use token will be atomically issued and consumed during proposal evaluation to prevent replay and double-submission.
              </p>
              {consumedNonce && (
                <div className="font-mono text-[10px] text-accent truncate">
                  Consumed Nonce: {consumedNonce.slice(0, 16)}...
                </div>
              )}
            </div>

            {/* Mode & Submit Button */}
            <div className="pt-2 border-t border-border space-y-3">
              <div className="flex items-center justify-between text-xs">
                <label className="flex items-center space-x-2 cursor-pointer text-muted hover:text-ink">
                  <input
                    type="checkbox"
                    checked={useOfflineSimulation}
                    onChange={(e) => setUseOfflineSimulation(e.target.checked)}
                    className="rounded border-border text-accent focus:ring-accent"
                  />
                  <span>Use Offline Simulation</span>
                </label>
                <span className="text-[10px] text-muted font-mono">
                  {useOfflineSimulation ? "SIMULATION MODE" : "POST /api/checkout/proposals"}
                </span>
              </div>

              {!isLiveConfigValid && !useOfflineSimulation && (
                <div className="p-2.5 rounded bg-amber-50 border border-amber-300 text-xs text-amber-950 flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <p className="text-[11px] leading-relaxed">
                    Select a valid active approval checkpoint above before submitting to the live gate, or check "Use Offline Simulation".
                  </p>
                </div>
              )}

              {paypalOrderState?.isAmbiguous && (
                <div className="p-2.5 rounded bg-amber-50 border border-amber-300 text-xs text-amber-950 flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <p className="text-[11px] leading-relaxed">
                    A payment order is under an ambiguous reconciliation hold. Gate re-evaluation is locked to prevent duplicate spend.
                  </p>
                </div>
              )}

              <button
                type="button"
                onClick={() => void handleEvaluate()}
                disabled={
                  isEvaluating ||
                  !isLiveConfigValid ||
                  isCreatingPayPalOrder ||
                  Boolean(paypalOrderState?.isAmbiguous)
                }
                className="w-full inline-flex items-center justify-center space-x-2 py-2 rounded font-semibold text-xs bg-accent text-white hover:bg-accent/90 transition-colors shadow-sm disabled:opacity-50"
              >
                {isEvaluating ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Evaluating Against Policy Gate...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>Submit to Authorization Gate</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Right Column: Gate Decision & Reservation Feedback */}
        <div className="lg:col-span-5 space-y-4">
          {errorMessage && (
            <div className="p-4 rounded bg-red-50 border border-red-200 text-xs text-red-950 space-y-1">
              <div className="flex items-center space-x-1.5 font-semibold text-red-900">
                <AlertCircle className="w-4 h-4 text-red-700 shrink-0" />
                <span>Gate Submission Error</span>
              </div>
              <p className="text-[11px] text-red-900 leading-relaxed">{errorMessage}</p>
            </div>
          )}

          {evalResult ? (
            <div className="space-y-4">
              <DecisionResultCard
                decision={evalResult.decision}
                primaryReasonCode={evalResult.primaryReasonCode}
                reasonCodes={evalResult.reasonCodes}
                policyVersionId={evalResult.policyVersionId}
                policyHash={evalResult.policyHash}
                timestamp={evalResult.evaluatedAt}
                isDemoFixture={evalResult.isDemoSimulation}
              />

              {/* Payment Order Execution Pipeline Card (Stages 1-4) */}
              <PaymentOrderPipelineCard
                decision={evalResult.decision}
                primaryReasonCode={evalResult.primaryReasonCode}
                reservationId={evalResult.reservationId}
                reservationState={evalResult.reservationState}
                amountMinor={evalResult.cartTotalMinor}
                currency={evalResult.currency}
                isDemoSimulation={evalResult.isDemoSimulation}
                paypalOrderState={paypalOrderState || undefined}
                onCreatePayPalOrder={
                  evalResult.decision === "ALLOW" && evalResult.reservationId
                    ? () => void handleCreatePayPalOrder()
                    : undefined
                }
              />
            </div>
          ) : (
            <div className="p-8 text-center border border-dashed border-border rounded-panel bg-surface space-y-3">
              <Layers className="w-8 h-8 text-muted mx-auto" />
              <h3 className="font-semibold text-sm text-ink">Gate Evaluation Ready</h3>
              <p className="text-xs text-muted max-w-xs mx-auto">
                Submit the cart manifest to evaluate compliance against the approved policy rules and issue a single-use spend reservation.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
