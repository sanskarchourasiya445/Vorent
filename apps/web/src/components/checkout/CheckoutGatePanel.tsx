import { useState, useEffect, useCallback } from "react";
import type { CheckoutProposalItem, CheckoutGateResult } from "../../types/checkout";
import type { ApprovalListState } from "../../types/approval";
import { ReasonCode } from "@warrant/contracts";
import { submitCheckoutProposal, requestCheckoutNonce } from "../../api/checkoutService";
import { fetchApprovals } from "../../api/approvalService";
import { DecisionResultCard } from "../features/DecisionResultCard";
import { PaymentOrderPipelineCard } from "./PaymentOrderPipelineCard";
import {
  createPaymentOrder,
  getPaymentOrder,
  confirmBuyerApproval,
  cancelPaymentOrder,
  capturePaymentOrder,
  reconcilePaymentOrder,
  PaymentOrderError,
} from "../../api/paymentOrderService";
import type { PayPalOrderPresentationState } from "../../types/paymentOrder";
import { AVAILABLE_POLICIES } from "../../api/verificationService";
import { HashBadge } from "../ui/HashBadge";
import { StatusBadge } from "../ui/StatusBadge";
import { EmptyState } from "../ui/EmptyState";
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
  ShieldAlert,
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
  const [evidenceVariation, setEvidenceVariation] = useState<"COMPLETE" | "STALE" | "MISSING">("COMPLETE");

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
        evidenceVariation,
      });

      setEvalResult(result);
    } catch (err) {
      if (err instanceof Error && err.message.includes("Nonce Replay Detected")) {
        setEvalResult({
          proposalId: `replay_blocked_${Date.now()}`,
          approvalId: effectiveApprovalId,
          decision: "DENY",
          primaryReasonCode: ReasonCode.NONCE_REPLAYED,
          reasonCodes: [ReasonCode.NONCE_REPLAYED],
          cartTotalMinor,
          currency: effectiveCurrency,
          policyVersionId: effectivePolicyVersionId,
          policyHash: effectivePolicyHash,
          evaluatedAt: new Date().toISOString(),
          isLiveApi: true,
          isDemoSimulation: false,
        });
      } else {
        setErrorMessage(err instanceof Error ? err.message : "Checkout evaluation failed");
      }
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleTamperPriceHike = async () => {
    if (!isLiveConfigValid && !useOfflineSimulation) return;
    const tampered: CheckoutProposalItem[] = [
      {
        id: "item_gpu_01",
        name: "High-Performance Workstation GPU (Tampered Price $1,299.00)",
        category: "Hardware",
        unitPriceMinor: 129900,
        quantity: 2,
      },
    ];
    setItems(tampered);

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
        items: tampered,
        currency: effectiveCurrency,
        nonce,
        useOfflineSimulation,
        evidenceVariation,
      });

      setEvalResult(result);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Price hike evaluation failed");
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleTamperProhibitedSku = async () => {
    if (!isLiveConfigValid && !useOfflineSimulation) return;
    const tampered: CheckoutProposalItem[] = [
      {
        id: "proh-amazon-giftcard-001",
        name: "$100 Digital Gift Card (Prohibited Loophole)",
        category: "Gift Cards",
        unitPriceMinor: 10000,
        quantity: 1,
      },
    ];
    setItems(tampered);

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
        items: tampered,
        currency: effectiveCurrency,
        nonce,
        useOfflineSimulation,
        evidenceVariation,
      });

      setEvalResult(result);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Prohibited SKU evaluation failed");
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleTamperNonceReplay = async () => {
    if (!isLiveConfigValid && !useOfflineSimulation) return;
    setIsEvaluating(true);
    setErrorMessage(null);
    setEvalResult(null);
    setPaypalOrderState(null);

    try {
      if (useOfflineSimulation) {
        setEvalResult({
          proposalId: `replay_blocked_${Date.now()}`,
          approvalId: effectiveApprovalId,
          decision: "DENY",
          primaryReasonCode: "NONCE_REPLAYED",
          reasonCodes: ["NONCE_REPLAYED"],
          cartTotalMinor,
          currency: effectiveCurrency,
          policyVersionId: effectivePolicyVersionId,
          policyHash: effectivePolicyHash,
          evaluatedAt: new Date().toISOString(),
          isLiveApi: false,
          isDemoSimulation: true,
        });
        return;
      }

      let replayNonce = consumedNonce;
      if (!replayNonce) {
        const fresh = await requestCheckoutNonce(
          effectiveApprovalId,
          effectivePolicyVersionId,
          effectivePolicyHash,
        );
        await submitCheckoutProposal({
          approvalId: effectiveApprovalId,
          policyVersionId: effectivePolicyVersionId,
          policyHash: effectivePolicyHash,
          merchantName,
          items,
          currency: effectiveCurrency,
          nonce: fresh,
          useOfflineSimulation: false,
          evidenceVariation,
        });
        replayNonce = fresh;
        setConsumedNonce(fresh);
      }

      const result = await submitCheckoutProposal({
        approvalId: effectiveApprovalId,
        policyVersionId: effectivePolicyVersionId,
        policyHash: effectivePolicyHash,
        merchantName,
        items,
        currency: effectiveCurrency,
        nonce: replayNonce,
        useOfflineSimulation: false,
        evidenceVariation,
      });

      setEvalResult(result);
    } catch (err) {
      if (err instanceof Error && err.message.includes("Nonce Replay Detected")) {
        setEvalResult({
          proposalId: `replay_blocked_${Date.now()}`,
          approvalId: effectiveApprovalId,
          decision: "DENY",
          primaryReasonCode: ReasonCode.NONCE_REPLAYED,
          reasonCodes: [ReasonCode.NONCE_REPLAYED],
          cartTotalMinor,
          currency: effectiveCurrency,
          policyVersionId: effectivePolicyVersionId,
          policyHash: effectivePolicyHash,
          evaluatedAt: new Date().toISOString(),
          isLiveApi: true,
          isDemoSimulation: false,
        });
      } else {
        setErrorMessage(err instanceof Error ? err.message : "Nonce replay evaluation failed");
      }
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

  const handleConfirmBuyerApproval = async (payerId?: string) => {
    if (!paypalOrderState?.orderId && !paypalOrderState?.paypalOrderId) return;
    if (paypalOrderState.isConfirmingApproval) return;

    setPaypalOrderState((prev) => ({
      ...(prev || {}),
      isConfirmingApproval: true,
      error: undefined,
    }));

    try {
      const response = await confirmBuyerApproval({
        orderId: paypalOrderState.orderId,
        paypalOrderId: paypalOrderState.paypalOrderId,
        payerId,
      });

      setPaypalOrderState((prev) => ({
        ...(prev || {}),
        orderId: response.order.id,
        paypalOrderId: response.paypalOrderId,
        status: response.order.status,
        reservationState: response.reservationState,
        payerId: response.order.payerId || payerId || prev?.payerId,
        nextAction: response.nextAction,
        isConfirmingApproval: false,
        error: undefined,
      }));
    } catch (err) {
      if (err instanceof PaymentOrderError) {
        setPaypalOrderState((prev) => ({
          ...(prev || {}),
          error: err.message,
          errorCode: err.code,
          isAmbiguous: err.isAmbiguous,
          isConfirmingApproval: false,
        }));
      } else {
        setPaypalOrderState((prev) => ({
          ...(prev || {}),
          error: err instanceof Error ? err.message : "Failed to confirm buyer approval.",
          isConfirmingApproval: false,
        }));
      }
    }
  };

  const handleCapturePaymentOrder = async () => {
    if (!paypalOrderState?.orderId && !paypalOrderState?.paypalOrderId) return;
    if (paypalOrderState.isCapturing) return;

    setPaypalOrderState((prev) => ({
      ...(prev || {}),
      isCapturing: true,
      error: undefined,
    }));

    try {
      const response = await capturePaymentOrder({
        orderId: paypalOrderState.orderId,
        paypalOrderId: paypalOrderState.paypalOrderId,
      });

      setPaypalOrderState((prev) => ({
        ...(prev || {}),
        orderId: response.order.id,
        paypalOrderId: response.paypalOrderId,
        status: response.status,
        reservationState: response.reservationState,
        captureId: response.captureId,
        capturedAmountMinor: response.capturedAmountMinor,
        captureSuccess: true,
        isCapturing: false,
        error: undefined,
      }));
    } catch (err) {
      if (err instanceof PaymentOrderError) {
        setPaypalOrderState((prev) => ({
          ...(prev || {}),
          error: err.message,
          errorCode: err.code,
          isAmbiguous: err.isAmbiguous,
          isCapturing: false,
        }));
      } else {
        setPaypalOrderState((prev) => ({
          ...(prev || {}),
          error: err instanceof Error ? err.message : "Failed to capture payment order.",
          isCapturing: false,
        }));
      }
    }
  };

  const handleCancelPaymentOrder = async (reason?: string) => {
    if (!paypalOrderState?.orderId && !paypalOrderState?.paypalOrderId) return;
    if (paypalOrderState.isCancelling) return;

    setPaypalOrderState((prev) => ({
      ...(prev || {}),
      isCancelling: true,
      error: undefined,
    }));

    try {
      const response = await cancelPaymentOrder({
        orderId: paypalOrderState.orderId,
        paypalOrderId: paypalOrderState.paypalOrderId,
        reason,
      });

      setPaypalOrderState((prev) => ({
        ...(prev || {}),
        orderId: response.order.id,
        status: response.order.status,
        reservationState: response.reservationState,
        cancellationSuccess: response.cancelled,
        isCancelling: false,
        error: undefined,
      }));
    } catch (err) {
      if (err instanceof PaymentOrderError) {
        setPaypalOrderState((prev) => ({
          ...(prev || {}),
          error: err.message,
          errorCode: err.code,
          isAmbiguous: err.isAmbiguous,
          isCancelling: false,
        }));
      } else {
        setPaypalOrderState((prev) => ({
          ...(prev || {}),
          error: err instanceof Error ? err.message : "Failed to cancel payment order.",
          isCancelling: false,
        }));
      }
    }
  };

  const handleReconcilePaymentOrder = async () => {
    if (!paypalOrderState?.orderId && !paypalOrderState?.paypalOrderId) return;
    if (paypalOrderState.isReconciling) return;

    setPaypalOrderState((prev) => ({
      ...(prev || {}),
      isReconciling: true,
      error: undefined,
    }));

    try {
      const response = await reconcilePaymentOrder({
        orderId: paypalOrderState.orderId,
        paypalOrderId: paypalOrderState.paypalOrderId,
      });

      setPaypalOrderState((prev) => ({
        ...(prev || {}),
        orderId: response.order.id,
        paypalOrderId: response.order.providerOrderId || prev?.paypalOrderId,
        status: response.order.status,
        reservationState: response.reservationState,
        captureId: response.order.captureId || prev?.captureId,
        payerId: response.order.payerId || prev?.payerId,
        reconciliationNotes: response.notes,
        isAmbiguous: false,
        isReconciling: false,
        error: undefined,
      }));
    } catch (err) {
      if (err instanceof PaymentOrderError) {
        setPaypalOrderState((prev) => ({
          ...(prev || {}),
          error: err.message,
          errorCode: err.code,
          isAmbiguous: err.isAmbiguous,
          isReconciling: false,
        }));
      } else {
        setPaypalOrderState((prev) => ({
          ...(prev || {}),
          error: err instanceof Error ? err.message : "Failed to reconcile payment order.",
          isReconciling: false,
        }));
      }
    }
  };

  const handleRefreshOrderDetails = async () => {
    if (!paypalOrderState?.orderId) return;

    setPaypalOrderState((prev) => ({
      ...(prev || {}),
      isRefreshing: true,
      error: undefined,
    }));

    try {
      const order = await getPaymentOrder(paypalOrderState.orderId);
      setPaypalOrderState((prev) => ({
        ...(prev || {}),
        orderId: order.id,
        paypalOrderId: order.providerOrderId || prev?.paypalOrderId,
        status: order.status,
        captureId: order.captureId || prev?.captureId,
        payerId: order.payerId || prev?.payerId,
        amountMinor: order.amountMinor,
        currency: order.currency,
        createdAt:
          typeof order.createdAt === "string" ? order.createdAt : order.createdAt.toISOString(),
        updatedAt:
          typeof order.updatedAt === "string" ? order.updatedAt : order.updatedAt.toISOString(),
        isRefreshing: false,
        error: undefined,
      }));
    } catch (err) {
      setPaypalOrderState((prev) => ({
        ...(prev || {}),
        isRefreshing: false,
        error: err instanceof Error ? err.message : "Failed to refresh order details.",
      }));
    }
  };

  return (
    <div className="space-y-6 w-full" role="region" aria-label="Checkout Gate Workstation">
      {/* Header */}
      <div className="border-b border-border pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center space-x-3.5">
            <div className="w-10 h-10 rounded-lg bg-surface-inset border border-border flex items-center justify-center text-primary shrink-0">
              <ShieldCheck className="w-5 h-5 text-primary" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-sans font-semibold tracking-tight text-ink">
                Checkout Authorization Gate
              </h1>
              <p className="text-xs text-muted font-normal mt-0.5 font-sans leading-relaxed">
                Enforces server-side purchase authorization against approved policy rules before any payment operation.
              </p>
            </div>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void loadApprovals()}
          disabled={approvalsState.state === "LOADING"}
          className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs font-mono font-medium bg-surface hover:bg-surface-raised text-ink border border-border transition-colors disabled:opacity-50 shrink-0 self-start sm:self-auto shadow-2xs focus:outline-none focus:ring-2 focus:ring-accent/30"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${approvalsState.state === "LOADING" ? "animate-spin text-accent" : "text-muted"}`} />
          <span>Refresh Approvals</span>
        </button>
      </div>

      {/* Configuration & Proposal Grid */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
        {/* Left Column: Proposed Cart & Nonce Configuration */}
        <div className="md:col-span-6 space-y-4">
          <div className="rounded border border-border bg-surface space-y-4 shadow-2xs p-5">
            {/* Bound Approval Selector */}
            <div className="space-y-2 border-b border-border pb-4 font-sans">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <FileCheck className="w-4 h-4 text-accent" />
                  <span className="text-xs font-semibold text-ink">
                    Authoritative Approval Checkpoint
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setUseManualApproval(!useManualApproval)}
                  className="text-[11px] text-accent hover:underline font-medium cursor-pointer"
                >
                  {useManualApproval ? "← Select From Ledger" : "Enter Approval ID →"}
                </button>
              </div>

              {approvalsState.state === "LOADING" && (
                <div className="p-2.5 rounded border border-border bg-surface-inset text-xs text-muted flex items-center space-x-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-accent" />
                  <span>Loading active approvals from server...</span>
                </div>
              )}

              {approvalsState.state === "UNAVAILABLE" && !useManualApproval && (
                <div className="p-3 rounded-lg border border-warning/30 bg-warning/10 text-ink text-xs space-y-1">
                  <div className="flex items-center space-x-1.5 font-semibold text-warning">
                    <Database className="w-3.5 h-3.5 text-warning" />
                    <span className="text-xs font-semibold">PostgreSQL Standby Mode</span>
                  </div>
                  <p className="text-[11px] text-muted leading-relaxed font-sans">
                    Live approvals cannot be queried from the database. Please specify an approval ID manually or use labeled offline simulation.
                  </p>
                </div>
              )}

              {!useManualApproval && approvalsState.state === "READY" && (
                <div className="space-y-2">
                  {approvalsState.data.length === 0 ? (
                    <div className="p-3 rounded border border-dashed border-border bg-surface-inset text-xs text-muted text-center space-y-1 font-mono">
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
                        id="approval-select"
                        name="approvalId"
                        aria-label="Select authoritative approval checkpoint"
                        value={selectedApprovalId}
                        onChange={(e) => setSelectedApprovalId(e.target.value)}
                        className="w-full rounded border border-border bg-surface-inset px-3 py-1.5 text-xs text-ink font-mono focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
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
                          className={`p-3 rounded-lg border text-xs space-y-1.5 font-mono ${
                            isSelectedApprovalValid
                              ? "border-allow/30 bg-allow/10 text-ink"
                              : "border-warning/30 bg-warning/10 text-ink"
                          }`}
                        >
                          <div className="flex items-center justify-between font-semibold">
                            <div className="flex items-center space-x-2">
                              <span className="text-muted text-[11px]">STATUS:</span>
                              <StatusBadge status={selectedApproval.status} size="sm" showDot />
                            </div>
                            <span className="text-xs tabular-nums">
                              Available Spend: $
                              {(
                                (selectedApproval.spendLimitMinor - selectedApproval.consumedSpendMinor) /
                                100
                              ).toFixed(2)}{" "}
                              {selectedApproval.currency}
                            </span>
                          </div>
                          <div className="text-[11px] text-muted space-y-1 pt-1">
                            <div>
                              Policy Version: <span className="text-ink font-medium">{selectedApproval.policyVersionId}</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-1.5 max-w-full">
                              <HashBadge hash={selectedApproval.policyHash} label="Policy Hash" />
                            </div>
                          </div>
                          {!isSelectedApprovalValid && (
                            <p className="text-[11px] text-deny font-semibold pt-1">
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
                <div className="p-3 rounded border border-border bg-surface-inset space-y-2 text-xs font-sans">
                  <div>
                    <label htmlFor="manual-approval-id" className="block text-xs font-semibold text-ink mb-1">
                      Approval ID (UUID)
                    </label>
                    <input
                      id="manual-approval-id"
                      name="manualApprovalId"
                      type="text"
                      placeholder="e.g. 11111111-1111-1111-1111-111111111111"
                      value={manualApprovalId}
                      onChange={(e) => setManualApprovalId(e.target.value)}
                      className="w-full rounded border border-border bg-surface px-3 py-1.5 text-xs text-ink font-mono focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
                      required
                    />
                  </div>
                  <div>
                    <label htmlFor="manual-policy-id" className="block text-xs font-semibold text-ink mb-1">
                      Bound Policy Version
                    </label>
                    <select
                      id="manual-policy-id"
                      name="manualPolicyId"
                      value={manualPolicyId}
                      onChange={(e) => setManualPolicyId(e.target.value)}
                      className="w-full rounded border border-border bg-surface px-3 py-1.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent font-sans cursor-pointer"
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
            <div className="flex items-center justify-between border-b border-border pb-3 font-sans">
              <div className="flex items-center space-x-2">
                <ShoppingCart className="w-4 h-4 text-accent" />
                <h3 className="font-semibold text-xs text-ink">
                  Proposed Cart Manifest
                </h3>
              </div>
              <span className="font-mono text-xs font-bold text-ink tabular-nums">
                Total: ${(cartTotalMinor / 100).toFixed(2)} USD
              </span>
            </div>

            {/* Interactive Tamper Presets (Video Scene 4 & Invariant Verification) */}
            <div className="p-3.5 rounded-lg border border-red-500/30 bg-red-500/5 space-y-2.5 font-sans">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-deny flex items-center space-x-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 text-deny shrink-0" />
                  <span>One-Click Tamper Attacks (Video Verification)</span>
                </span>
                <span className="text-[10px] font-mono text-muted uppercase">Invariants 1, 2 &amp; 5</span>
              </div>
              <p className="text-[11px] text-muted leading-relaxed">
                Simulate shopping agent mutations and post-approval attacks against the pre-PayPal gate. The gate intercepts attacks and blocks order creation.
              </p>
              <div className="grid grid-cols-1 gap-2 pt-1">
                <button
                  type="button"
                  data-testid="tamper-price-hike-btn"
                  onClick={() => void handleTamperPriceHike()}
                  disabled={isEvaluating || (!isLiveConfigValid && !useOfflineSimulation)}
                  className="w-full inline-flex items-center justify-between px-3 py-2 rounded text-xs font-mono font-medium border border-deny/30 bg-surface hover:bg-deny/10 text-deny transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
                >
                  <span className="font-semibold">Tamper: Post-Approval Price Hike (+$100.00)</span>
                  <span className="text-[10px] text-muted font-sans hidden sm:inline">&rarr; DENY (SPEND_LIMIT_EXCEEDED)</span>
                </button>
                <button
                  type="button"
                  data-testid="tamper-prohibited-sku-btn"
                  onClick={() => void handleTamperProhibitedSku()}
                  disabled={isEvaluating || (!isLiveConfigValid && !useOfflineSimulation)}
                  className="w-full inline-flex items-center justify-between px-3 py-2 rounded text-xs font-mono font-medium border border-deny/30 bg-surface hover:bg-deny/10 text-deny transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
                >
                  <span className="font-semibold">Tamper: Prohibited SKU Swap (Gift Card)</span>
                  <span className="text-[10px] text-muted font-sans hidden sm:inline">&rarr; DENY (PROHIBITED_CATEGORY)</span>
                </button>
                <button
                  type="button"
                  data-testid="tamper-nonce-replay-btn"
                  onClick={() => void handleTamperNonceReplay()}
                  disabled={isEvaluating || (!isLiveConfigValid && !useOfflineSimulation)}
                  className="w-full inline-flex items-center justify-between px-3 py-2 rounded text-xs font-mono font-medium border border-deny/30 bg-surface hover:bg-deny/10 text-deny transition-colors cursor-pointer disabled:opacity-50 shadow-2xs"
                >
                  <span className="font-semibold">Tamper: Nonce Replay</span>
                  <span className="text-[10px] text-muted font-sans hidden sm:inline">&rarr; DENY (NONCE_REPLAYED)</span>
                </button>
              </div>
            </div>

            {/* Scenario Picker */}
            <div className="font-sans">
              <label htmlFor="scenario-select" className="block text-xs font-semibold text-ink mb-1">
                Cart Proposal Scenario
              </label>
              <select
                id="scenario-select"
                name="scenarioId"
                value={selectedScenarioId}
                onChange={(e) => handleScenarioChange(e.target.value)}
                className="w-full rounded border border-border bg-surface-inset px-3 py-1.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent font-sans cursor-pointer"
              >
                {PRESET_SCENARIOS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <p className="text-[11px] text-muted mt-1 font-sans">
                {PRESET_SCENARIOS.find((s) => s.id === selectedScenarioId)?.description}
              </p>
            </div>

            {/* Merchant Details */}
            <div className="font-sans">
              <label htmlFor="merchant-name-input" className="block text-xs font-semibold text-ink mb-1">
                Merchant
              </label>
              <input
                id="merchant-name-input"
                name="merchantName"
                type="text"
                value={merchantName}
                onChange={(e) => setMerchantName(e.target.value)}
                className="w-full rounded border border-border bg-surface-inset px-3 py-1.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent font-sans"
              />
            </div>

            {/* Evidence & Categorization Quality Selector */}
            <div className="font-sans">
              <label htmlFor="evidence-variation-select" className="block text-xs font-semibold text-ink mb-1">
                Evidence &amp; Categorization Quality
              </label>
              <select
                id="evidence-variation-select"
                name="evidenceVariation"
                value={evidenceVariation}
                onChange={(e) => setEvidenceVariation(e.target.value as "COMPLETE" | "STALE" | "MISSING")}
                className="w-full rounded border border-border bg-surface-inset px-3 py-1.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent font-sans cursor-pointer"
              >
                <option value="COMPLETE">Verified &amp; Fresh Evidence (Categorized, Fresh Timestamp)</option>
                <option value="STALE">Stale Evidence (14 Days Old — Evaluates to REVIEW)</option>
                <option value="MISSING">Missing Critical Evidence (Low Confidence / Uncategorized — Evaluates to REVIEW)</option>
              </select>
              <p className="text-[11px] text-muted mt-1 font-sans">
                Decision D-003: Unreliable or missing critical evidence yields fail-closed REVIEW, preventing unauthorized order creation.
              </p>
            </div>

            {/* Cart Line Items */}
            <div className="space-y-2 font-sans">
              <div className="text-xs font-semibold text-muted">Line Items</div>
              {items.map((item) => (
                <div
                  key={item.id}
                  className="p-3 rounded border border-border bg-surface-inset flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-semibold text-ink font-sans">{item.name}</div>
                    <div className="text-[10px] text-muted font-sans">Category: {item.category}</div>
                  </div>
                  <div className="text-right font-mono">
                    <div className="text-muted tabular-nums">
                      {item.quantity} × ${(item.unitPriceMinor / 100).toFixed(2)}
                    </div>
                    <div className="font-bold text-ink tabular-nums">
                      ${((item.unitPriceMinor * item.quantity) / 100).toFixed(2)}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Nonce & Anti-Replay Info */}
            <div className="p-3 rounded bg-surface-inset border border-border text-[11px] text-muted space-y-1 font-sans">
              <div className="flex items-center space-x-1.5 font-semibold text-ink">
                <Lock className="w-3.5 h-3.5 text-accent" />
                <span className="text-xs font-semibold">Single-Use Cryptographic Nonce</span>
              </div>
              <p className="text-[10px] text-muted leading-relaxed font-sans">
                A 256-bit single-use token will be atomically issued and consumed during proposal evaluation to prevent replay and double-submission.
              </p>
              {consumedNonce && (
                <div className="pt-1">
                  <HashBadge hash={consumedNonce} label="Consumed Nonce" prefixLength={10} suffixLength={8} />
                </div>
              )}
            </div>

            {/* Mode & Submit Button */}
            <div className="pt-2 border-t border-border space-y-3">
              <div className="flex items-center justify-between text-xs">
                <label htmlFor="use-offline-simulation-checkbox" className="flex items-center space-x-2 cursor-pointer text-muted hover:text-ink font-sans">
                  <input
                    id="use-offline-simulation-checkbox"
                    name="useOfflineSimulation"
                    type="checkbox"
                    checked={useOfflineSimulation}
                    onChange={(e) => setUseOfflineSimulation(e.target.checked)}
                    className="rounded border-border text-accent focus:ring-accent"
                  />
                  <span className="text-xs">Use Offline Simulation</span>
                </label>
                <span className="text-[10px] text-muted font-mono">
                  {useOfflineSimulation ? "SIMULATION MODE" : "POST /api/checkout/proposals"}
                </span>
              </div>

              {!isLiveConfigValid && !useOfflineSimulation && (
                <div className="p-2.5 rounded-lg bg-warning/10 border border-warning/30 text-xs text-ink flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                  <p className="text-[11px] leading-relaxed font-sans text-muted">
                    Select a valid active approval checkpoint above before submitting to the live gate, or check "Use Offline Simulation".
                  </p>
                </div>
              )}

              {paypalOrderState?.isAmbiguous && (
                <div className="p-2.5 rounded-lg bg-warning/10 border border-warning/30 text-xs text-ink flex items-start space-x-2">
                  <AlertCircle className="w-4 h-4 text-warning shrink-0 mt-0.5" />
                  <p className="text-[11px] leading-relaxed font-sans text-muted">
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
                className="w-full inline-flex items-center justify-center space-x-2 py-2.5 rounded font-mono font-semibold text-xs bg-accent text-white hover:bg-accent/90 active:bg-accent/80 transition-colors shadow-2xs disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-accent/30 cursor-pointer"
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
        <div className="md:col-span-6 space-y-4">
          {errorMessage && (
            <div className="p-4 rounded-lg bg-deny/10 border border-deny/30 text-xs text-deny space-y-1">
              <div className="flex items-center space-x-1.5 font-semibold">
                <AlertCircle className="w-4 h-4 text-deny shrink-0" />
                <span>Gate Submission Error</span>
              </div>
              <p className="text-[11px] text-muted leading-relaxed font-sans">{errorMessage}</p>
            </div>
          )}

          {evalResult ? (
            <>
              <DecisionResultCard
                decision={evalResult.decision}
                primaryReasonCode={evalResult.primaryReasonCode}
                reasonCodes={evalResult.reasonCodes}
                policyVersionId={evalResult.policyVersionId}
                policyHash={evalResult.policyHash}
                timestamp={evalResult.evaluatedAt}
                isDemoFixture={evalResult.isDemoSimulation}
              />

              {/* Payment Order Execution Pipeline Card (Stages 1-4) — Balanced Inside Right Column */}
              <div className="w-full pt-2">
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
                  onConfirmBuyerApproval={handleConfirmBuyerApproval}
                  onCapturePaymentOrder={handleCapturePaymentOrder}
                  onCancelPaymentOrder={handleCancelPaymentOrder}
                  onReconcilePaymentOrder={handleReconcilePaymentOrder}
                  onRefreshOrderDetails={handleRefreshOrderDetails}
                />
              </div>
            </>
          ) : (
            <EmptyState
              icon={<Layers className="w-8 h-8 mx-auto" />}
              title="Gate Evaluation Ready"
              description="Submit the cart manifest to evaluate compliance against the approved policy rules and issue a single-use spend reservation."
            />
          )}
        </div>
      </div>
    </div>
  );
}
