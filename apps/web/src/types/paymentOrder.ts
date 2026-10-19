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
  error?: string;
  errorCode?: string;
  isAmbiguous?: boolean;
  isCreating?: boolean;
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
  className?: string;
}
