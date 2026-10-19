import type { Decision, ReservationState, PaymentStatus } from "@warrant/contracts";

/**
 * 4-Stage Lifecycle Pipeline for Warrant + PayPal Checkout
 */
export type PipelineStageStatus =
  | "PENDING"
  | "IN_PROGRESS"
  | "SUCCESS"
  | "FAILED"
  | "BLOCKED"
  | "FUTURE_PHASE";

export interface PipelineStageInfo {
  id: "warrant_gate" | "spend_reservation" | "paypal_order" | "buyer_approval";
  title: string;
  shortLabel: string;
  status: PipelineStageStatus;
  statusText: string;
  details?: string;
}

export interface PayPalOrderPresentationState {
  orderId?: string;
  paypalOrderId?: string;
  provider?: "PAYPAL_SANDBOX";
  status?: PaymentStatus;
  reservationState?: ReservationState;
  approvalUrl?: string;
  payerId?: string;
  captureId?: string;
  amountMinor?: number;
  currency?: string;
  createdAt?: string;
  updatedAt?: string;
  error?: string;
  errorCode?: string;
  isAmbiguous?: boolean;
  isCreating?: boolean;
  isConfirmingApproval?: boolean;
  isCapturing?: boolean;
  isCancelling?: boolean;
  isReconciling?: boolean;
  isRefreshing?: boolean;
  nextAction?: "CAPTURE" | "NONE";
  reconciliationNotes?: string;
  cancellationSuccess?: boolean;
  captureSuccess?: boolean;
}

export interface PaymentOrderPipelineCardProps {
  decision?: Decision;
  primaryReasonCode?: string;
  reservationId?: string;
  reservationState?: ReservationState | string;
  amountMinor?: number;
  currency?: string;
  isDemoSimulation?: boolean;
  paypalOrderState?: PayPalOrderPresentationState;
  onCreatePayPalOrder?: () => void;
  onConfirmBuyerApproval?: (payerId?: string) => Promise<void> | void;
  onCapturePaymentOrder?: () => Promise<void> | void;
  onCancelPaymentOrder?: (reason?: string) => Promise<void> | void;
  onReconcilePaymentOrder?: () => Promise<void> | void;
  onRefreshOrderDetails?: () => Promise<void> | void;
  className?: string;
}

