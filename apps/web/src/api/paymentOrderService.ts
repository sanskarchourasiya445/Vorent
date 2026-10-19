import {
  CreatePaymentOrderRequestSchema,
  CreatePaymentOrderResponseSchema,
  ConfirmBuyerApprovalRequestSchema,
  ConfirmBuyerApprovalResponseSchema,
  CancelPaymentOrderRequestSchema,
  CancelPaymentOrderResponseSchema,
  CapturePaymentOrderRequestSchema,
  CapturePaymentOrderResponseSchema,
  ReconcilePaymentOrderRequestSchema,
  ReconcilePaymentOrderResponseSchema,
  PaymentOrderRecordSchema,
  PaymentOrderListResponseSchema,
  ReconciliationAlertsResponseSchema,
  SpendReservationListResponseSchema,
  type CreatePaymentOrderRequest,
  type CreatePaymentOrderResponse,
  type ConfirmBuyerApprovalRequest,
  type ConfirmBuyerApprovalResponse,
  type CancelPaymentOrderRequest,
  type CancelPaymentOrderResponse,
  type CapturePaymentOrderRequest,
  type CapturePaymentOrderResponse,
  type ReconcilePaymentOrderRequest,
  type ReconcilePaymentOrderResponse,
  type PaymentOrderRecord,
  type SpendReservationRecord,
} from "@warrant/contracts";
import { z } from "zod";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

export class PaymentOrderError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number,
    public isAmbiguous: boolean = false,
  ) {
    super(message);
    this.name = "PaymentOrderError";
  }
}

/**
 * Helper to execute backend payment order HTTP calls with consistent error mapping
 * and ambiguous outcome detection.
 */
async function executePaymentOrderRequest<T>(
  url: string,
  options: RequestInit,
  schema: z.ZodType<T>,
  actionDescription: string,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(options.headers || {}),
      },
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    throw new PaymentOrderError(
      `Network communication error during ${actionDescription}: ${errorMsg}. Outcome may be ambiguous; verify order ledger before retrying.`,
      "NETWORK_ERROR",
      0,
      true,
    );
  }

  if (response.status === 404) {
    let message = "Payment order resource not found.";
    let code = "ORDER_NOT_FOUND";
    try {
      const json = await response.json();
      if (json?.error?.message) message = json.error.message;
      if (json?.error?.code) code = json.error.code;
    } catch {
      // fallback
    }
    throw new PaymentOrderError(message, code, 404, false);
  }

  if (response.status === 503) {
    throw new PaymentOrderError(
      "PostgreSQL persistence store is currently in standby mode. Payment order actions require active database connectivity.",
      "DATABASE_UNAVAILABLE",
      503,
      false,
    );
  }

  if (response.status === 409) {
    let message = "Order conflict or reconciliation hold detected.";
    let code = "RECONCILIATION_REQUIRED";
    try {
      const json = await response.json();
      if (json?.error?.message) message = json.error.message;
      if (json?.error?.code) code = json.error.code;
    } catch {
      // fallback
    }
    throw new PaymentOrderError(
      `Ambiguous Order Outcome (${code}): ${message}. The order state is uncertain. Do NOT retry automatically; reconciliation is required.`,
      code,
      409,
      true,
    );
  }

  if (!response.ok) {
    let errorMsg = `HTTP ${response.status}`;
    let code = "API_ERROR";
    try {
      const json = await response.json();
      if (json && typeof json === "object") {
        errorMsg =
          (json as { error?: { message?: string }; message?: string }).error?.message ||
          (json as { message?: string }).message ||
          errorMsg;
        code = (json as { error?: { code?: string } }).error?.code || code;
      }
    } catch {
      // fallback
    }

    const isAmbiguous =
      code === "ORDER_CREATION_AMBIGUOUS" ||
      code === "CAPTURE_OUTCOME_AMBIGUOUS" ||
      code === "RECONCILIATION_HOLD" ||
      code === "RECONCILIATION_REQUIRED";

    throw new PaymentOrderError(
      `${actionDescription} failed: ${errorMsg}`,
      code,
      response.status,
      isAmbiguous,
    );
  }

  const json = await response.json();
  const parsed = schema.safeParse(json);
  if (!parsed.success) {
    throw new PaymentOrderError(
      `Backend returned malformed response schema for ${actionDescription}.`,
      "MALFORMED_RESPONSE",
      502,
      false,
    );
  }

  return parsed.data;
}

/**
 * 1. Creates a PayPal Sandbox Payment Order bound to an ALLOWed spend reservation.
 * Strictly sends only proposalId and reservationId.
 */
export async function createPaymentOrder(
  input: CreatePaymentOrderRequest,
): Promise<CreatePaymentOrderResponse> {
  const validated = CreatePaymentOrderRequestSchema.safeParse(input);
  if (!validated.success) {
    throw new PaymentOrderError(
      "Invalid payment order payload: proposalId and reservationId must be valid UUIDs.",
      "INVALID_PAYLOAD",
      400,
      false,
    );
  }

  return executePaymentOrderRequest(
    `${API_BASE}/api/payment-orders`,
    {
      method: "POST",
      body: JSON.stringify({
        proposalId: validated.data.proposalId,
        reservationId: validated.data.reservationId,
      }),
    },
    CreatePaymentOrderResponseSchema,
    "Payment order creation",
  );
}

/**
 * 2. Retrieves a payment order by ID from the backend.
 */
export async function getPaymentOrder(orderId: string): Promise<PaymentOrderRecord> {
  if (!orderId || typeof orderId !== "string" || orderId.trim().length === 0) {
    throw new PaymentOrderError("Valid order ID is required", "INVALID_ID", 400, false);
  }

  const responseWrapperSchema = z.object({
    order: PaymentOrderRecordSchema,
  });

  const result = await executePaymentOrderRequest(
    `${API_BASE}/api/payment-orders/${encodeURIComponent(orderId.trim())}`,
    { method: "GET" },
    responseWrapperSchema,
    "Payment order retrieval",
  );

  return result.order;
}

/**
 * 3. Confirms buyer approval (idempotent return flow).
 * Treats browser redirects as untrusted input; backend validates order with PayPal API.
 */
export async function confirmBuyerApproval(
  input: ConfirmBuyerApprovalRequest,
): Promise<ConfirmBuyerApprovalResponse> {
  const validated = ConfirmBuyerApprovalRequestSchema.safeParse(input);
  if (!validated.success) {
    throw new PaymentOrderError(
      "Invalid buyer approval payload: either orderId or paypalOrderId must be provided.",
      "INVALID_PAYLOAD",
      400,
      false,
    );
  }

  return executePaymentOrderRequest(
    `${API_BASE}/api/payment-orders/buyer-approval`,
    {
      method: "POST",
      body: JSON.stringify(validated.data),
    },
    ConfirmBuyerApprovalResponseSchema,
    "Buyer approval confirmation",
  );
}

/**
 * 4. Cancels a payment order and safely releases spend reservation if uncaptured.
 */
export async function cancelPaymentOrder(
  input: CancelPaymentOrderRequest,
): Promise<CancelPaymentOrderResponse> {
  const validated = CancelPaymentOrderRequestSchema.safeParse(input);
  if (!validated.success) {
    throw new PaymentOrderError(
      "Invalid cancel order payload: either orderId or paypalOrderId must be provided.",
      "INVALID_PAYLOAD",
      400,
      false,
    );
  }

  return executePaymentOrderRequest(
    `${API_BASE}/api/payment-orders/cancel`,
    {
      method: "POST",
      body: JSON.stringify(validated.data),
    },
    CancelPaymentOrderResponseSchema,
    "Payment order cancellation",
  );
}

/**
 * 5. Server-side capture: authenticated, ownership-checked capture endpoint.
 * Enabled only when status is APPROVED.
 */
export async function capturePaymentOrder(
  input: CapturePaymentOrderRequest,
): Promise<CapturePaymentOrderResponse> {
  const validated = CapturePaymentOrderRequestSchema.safeParse(input);
  if (!validated.success) {
    throw new PaymentOrderError(
      "Invalid capture payload: either orderId or paypalOrderId must be provided.",
      "INVALID_PAYLOAD",
      400,
      false,
    );
  }

  return executePaymentOrderRequest(
    `${API_BASE}/api/payment-orders/capture`,
    {
      method: "POST",
      body: JSON.stringify(validated.data),
    },
    CapturePaymentOrderResponseSchema,
    "Payment order capture",
  );
}

/**
 * 6. Reconciles an order against PayPal Orders and Captures APIs.
 * Resolves ambiguous states, missing webhooks, and hold conditions safely.
 */
export async function reconcilePaymentOrder(
  input: ReconcilePaymentOrderRequest,
): Promise<ReconcilePaymentOrderResponse> {
  const validated = ReconcilePaymentOrderRequestSchema.safeParse(input);
  if (!validated.success) {
    throw new PaymentOrderError(
      "Invalid reconcile payload: either orderId or paypalOrderId must be provided.",
      "INVALID_PAYLOAD",
      400,
      false,
    );
  }

  return executePaymentOrderRequest(
    `${API_BASE}/api/payment-orders/reconcile`,
    {
      method: "POST",
      body: JSON.stringify(validated.data),
    },
    ReconcilePaymentOrderResponseSchema,
    "Payment order reconciliation",
  );
}

export interface ListPaymentOrdersResult {
  orders: PaymentOrderRecord[];
  total: number;
  reconciliationAlertsCount: number;
  state: "READY" | "EMPTY" | "UNAVAILABLE" | "ERROR";
  isUnmounted?: boolean;
  message?: string;
}

export interface ReconciliationAlertsResult {
  unreconciledOrders: PaymentOrderRecord[];
  heldReservations: any[];
  totalAlerts: number;
  state: "READY" | "EMPTY" | "UNAVAILABLE" | "ERROR";
  isUnmounted?: boolean;
  message?: string;
}

export interface SpendReservationsResult {
  reservations: SpendReservationRecord[];
  total: number;
  state: "READY" | "EMPTY" | "UNAVAILABLE" | "ERROR";
  isUnmounted?: boolean;
  message?: string;
}

/**
 * 7. Lists payment orders for the authenticated user from the backend.
 * Distinguishes READY, EMPTY, UNAVAILABLE (standby), and ERROR states.
 */
export async function listPaymentOrders(): Promise<ListPaymentOrdersResult> {
  try {
    const res = await fetch(`${API_BASE}/api/payment-orders`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (res.status === 404) {
      return {
        orders: [],
        total: 0,
        reconciliationAlertsCount: 0,
        isUnmounted: true,
        state: "UNAVAILABLE",
        message: "Payment order collection route not mounted.",
      };
    }

    if (res.status === 503) {
      return {
        orders: [],
        total: 0,
        reconciliationAlertsCount: 0,
        state: "UNAVAILABLE",
        message: "PostgreSQL persistence store is currently in standby mode.",
      };
    }

    if (!res.ok) {
      return {
        orders: [],
        total: 0,
        reconciliationAlertsCount: 0,
        state: "ERROR",
        message: `Failed to list payment orders: HTTP ${res.status}`,
      };
    }

    const json = await res.json();
    const parsed = PaymentOrderListResponseSchema.safeParse(json);
    if (parsed.success) {
      return {
        orders: parsed.data.orders,
        total: parsed.data.total,
        reconciliationAlertsCount: parsed.data.reconciliationAlertsCount,
        state: parsed.data.orders.length === 0 ? "EMPTY" : "READY",
        isUnmounted: false,
      };
    }

    const ordersList: PaymentOrderRecord[] = Array.isArray(json)
      ? json
      : Array.isArray(json?.orders)
        ? json.orders
        : Array.isArray(json?.data)
          ? json.data
          : [];

    return {
      orders: ordersList,
      total: ordersList.length,
      reconciliationAlertsCount: ordersList.filter(
        (o) => o.status === "UNKNOWN_REQUIRES_RECONCILIATION",
      ).length,
      state: ordersList.length === 0 ? "EMPTY" : "READY",
      isUnmounted: false,
    };
  } catch (err) {
    return {
      orders: [],
      total: 0,
      reconciliationAlertsCount: 0,
      state: "ERROR",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 8. Fetches reconciliation alerts (orders requiring reconciliation & held reservations).
 */
export async function getReconciliationAlerts(): Promise<ReconciliationAlertsResult> {
  try {
    const res = await fetch(`${API_BASE}/api/payment-orders/reconciliation-alerts`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (res.status === 404) {
      return {
        unreconciledOrders: [],
        heldReservations: [],
        totalAlerts: 0,
        isUnmounted: true,
        state: "UNAVAILABLE",
        message: "Reconciliation alerts route not mounted.",
      };
    }

    if (res.status === 503) {
      return {
        unreconciledOrders: [],
        heldReservations: [],
        totalAlerts: 0,
        state: "UNAVAILABLE",
        message: "PostgreSQL persistence store is currently in standby mode.",
      };
    }

    if (!res.ok) {
      return {
        unreconciledOrders: [],
        heldReservations: [],
        totalAlerts: 0,
        state: "ERROR",
        message: `HTTP ${res.status}`,
      };
    }

    const json = await res.json();
    const parsed = ReconciliationAlertsResponseSchema.safeParse(json);
    if (parsed.success) {
      return {
        unreconciledOrders: parsed.data.unreconciledOrders,
        heldReservations: parsed.data.heldReservations,
        totalAlerts: parsed.data.totalAlerts,
        state: parsed.data.totalAlerts === 0 ? "EMPTY" : "READY",
        isUnmounted: false,
      };
    }

    return {
      unreconciledOrders: json?.unreconciledOrders || [],
      heldReservations: json?.heldReservations || [],
      totalAlerts: json?.totalAlerts || 0,
      state: "READY",
      isUnmounted: false,
    };
  } catch (err) {
    return {
      unreconciledOrders: [],
      heldReservations: [],
      totalAlerts: 0,
      state: "ERROR",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

/**
 * 9. Lists spend reservations from the backend checkout service.
 */
export async function listSpendReservations(): Promise<SpendReservationsResult> {
  try {
    const res = await fetch(`${API_BASE}/api/checkout/reservations`, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });

    if (res.status === 404) {
      return {
        reservations: [],
        total: 0,
        isUnmounted: true,
        state: "UNAVAILABLE",
        message: "Reservations endpoint not mounted.",
      };
    }

    if (res.status === 503) {
      return {
        reservations: [],
        total: 0,
        state: "UNAVAILABLE",
        message: "PostgreSQL persistence store is currently in standby mode.",
      };
    }

    if (!res.ok) {
      return {
        reservations: [],
        total: 0,
        state: "ERROR",
        message: `HTTP ${res.status}`,
      };
    }

    const json = await res.json();
    const parsed = SpendReservationListResponseSchema.safeParse(json);
    if (parsed.success) {
      return {
        reservations: parsed.data.reservations,
        total: parsed.data.total,
        state: parsed.data.reservations.length === 0 ? "EMPTY" : "READY",
        isUnmounted: false,
      };
    }

    const resList: SpendReservationRecord[] = Array.isArray(json?.reservations)
      ? json.reservations
      : [];

    return {
      reservations: resList,
      total: json?.total || resList.length,
      state: resList.length === 0 ? "EMPTY" : "READY",
      isUnmounted: false,
    };
  } catch (err) {
    return {
      reservations: [],
      total: 0,
      state: "ERROR",
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
