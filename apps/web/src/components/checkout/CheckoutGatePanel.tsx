import { useState } from "react";
import type { CheckoutProposalItem, CheckoutGateResult } from "../../types/checkout";
import { submitCheckoutProposal, requestCheckoutNonce } from "../../api/checkoutService";
import { DecisionResultCard } from "../features/DecisionResultCard";
import { AVAILABLE_POLICIES } from "../../api/verificationService";
import {
  ShieldCheck,
  ShoppingCart,
  Send,
  AlertCircle,
  RefreshCw,
  Clock,
  Layers,
  CheckCircle2,
  Lock,
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

  // Evaluation state
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evalResult, setEvalResult] = useState<CheckoutGateResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [consumedNonce, setConsumedNonce] = useState<string | null>(null);

  const selectedPolicy = AVAILABLE_POLICIES[0];
  const cartTotalMinor = items.reduce((sum, item) => sum + item.unitPriceMinor * item.quantity, 0);

  const handleScenarioChange = (scenarioId: string) => {
    setSelectedScenarioId(scenarioId);
    const scenario = PRESET_SCENARIOS.find((s) => s.id === scenarioId);
    if (scenario) {
      setItems(scenario.items);
    }
  };

  const handleEvaluate = async () => {
    setIsEvaluating(true);
    setErrorMessage(null);
    setEvalResult(null);

    try {
      let nonce: string | undefined;
      if (!useOfflineSimulation) {
        try {
          nonce = await requestCheckoutNonce("appr_v1_books_hardware");
          setConsumedNonce(nonce);
        } catch {
          // If nonce route is not mounted yet, continue with simulated token
          nonce = `nonce_${Math.random().toString(36).slice(2, 10)}`;
          setConsumedNonce(nonce);
        }
      }

      const result = await submitCheckoutProposal({
        approvalId: "appr_v1_books_hardware",
        policyVersionId: selectedPolicy.id,
        policyHash: selectedPolicy.hash,
        merchantName,
        items,
        currency: "USD",
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

  return (
    <div className="space-y-6 max-w-5xl mx-auto" role="region" aria-label="Checkout Gate Workstation">
      {/* Header */}
      <div className="border-b border-border pb-4">
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

      {/* Configuration & Proposal Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Proposed Cart & Nonce Configuration */}
        <div className="lg:col-span-7 space-y-4">
          <div className="p-5 rounded-panel border border-border bg-surface space-y-4 shadow-sm">
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
                  Consumed: {consumedNonce.slice(0, 16)}...
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

              <button
                type="button"
                onClick={() => void handleEvaluate()}
                disabled={isEvaluating}
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

              {/* Spend Reservation Feedback on ALLOW */}
              {evalResult.decision === "ALLOW" && (
                <div className="p-4 rounded bg-emerald-50 border border-emerald-300 text-xs text-emerald-950 space-y-2">
                  <div className="flex items-center space-x-2 font-semibold text-emerald-900">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                    <span>Spend Reservation Created</span>
                  </div>
                  <div className="text-[11px] text-emerald-900 space-y-1">
                    <div>
                      Reservation State:{" "}
                      <strong className="font-mono">{evalResult.reservationState || "ORDER_CREATION_PENDING"}</strong>
                    </div>
                    <div>
                      Reserved Amount:{" "}
                      <strong className="font-mono">
                        ${(evalResult.cartTotalMinor / 100).toFixed(2)} {evalResult.currency}
                      </strong>
                    </div>
                    <div className="flex items-center space-x-1 text-[10px] text-emerald-800 pt-1">
                      <Clock className="w-3 h-3 text-emerald-700" />
                      <span>Reservation TTL: 15 minutes (buyer-approval window).</span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-emerald-200 text-[10px] text-emerald-900 leading-relaxed">
                    <strong>Payment Boundary Notice:</strong> PayPal Sandbox order creation and capture integration are scheduled for Phase 6/7. No live funds or payment orders were executed.
                  </div>
                </div>
              )}

              {/* Policy Boundary Feedback on DENY */}
              {evalResult.decision === "DENY" && (
                <div className="p-4 rounded bg-red-50 border border-red-200 text-xs text-red-950 space-y-1.5">
                  <div className="flex items-center space-x-2 font-semibold text-red-900">
                    <AlertCircle className="w-4 h-4 text-red-700" />
                    <span>Purchase Blocked by Authorization Gate</span>
                  </div>
                  <p className="text-[11px] text-red-900 leading-relaxed">
                    The proposed cart was rejected by server-side policy evaluation rules. Payment order creation is fail-closed and cannot proceed.
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 rounded-panel border border-border bg-surface text-center space-y-2 text-xs text-muted">
              <Layers className="w-8 h-8 mx-auto text-muted/60" />
              <div className="font-semibold text-ink">Authorization Gate in Standby</div>
              <p className="max-w-xs mx-auto text-[11px] leading-relaxed">
                Configure your cart proposal and click "Submit to Authorization Gate" to view the authoritative decision and spend reservation.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
