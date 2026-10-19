import {
  CreatePaymentOrderRequestSchema,
  CreatePaymentOrderResponseSchema,
  type CreatePaymentOrderRequest,
  type CreatePaymentOrderResponse,
} from "@warrant/contracts";

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
 * Creates a PayPal Sandbox Payment Order bound to an ALLOWed spend reservation.
 * Strictly sends only proposalId and reservationId.
 */
export async function createPaymentOrder(
  input: CreatePaymentOrderRequest,
): Promise<CreatePaymentOrderResponse> {
  // Client-side schema validation to ensure only valid UUIDs are transmitted
  const validated = CreatePaymentOrderRequestSchema.safeParse(input);
  if (!validated.success) {
    throw new PaymentOrderError(
      "Invalid payment order payload: proposalId and reservationId must be valid UUIDs.",
      "INVALID_PAYLOAD",
      400,
      false,
    );
  }

  const url = `${API_BASE}/api/payment-orders`;
  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        proposalId: validated.data.proposalId,
        reservationId: validated.data.reservationId,
      }),
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    throw new PaymentOrderError(
      `Network communication error while creating PayPal payment order: ${errorMsg}. Outcome may be ambiguous; verify order ledger before retrying.`,
      "NETWORK_ERROR",
      0,
      true,
    );
  }

  if (response.status === 404) {
    let message = "Payment order endpoint or resource not found.";
    let code = "NOT_FOUND";
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
      "PostgreSQL persistence store is currently in standby mode. Payment order creation requires active database connectivity.",
      "DATABASE_UNAVAILABLE",
      503,
      false,
    );
  }

  if (response.status === 409) {
    let message = "Order creation conflict or reconciliation hold detected.";
    let code = "RECONCILIATION_REQUIRED";
    try {
      const json = await response.json();
      if (json?.error?.message) message = json.error.message;
      if (json?.error?.code) code = json.error.code;
    } catch {
      // fallback
    }
    throw new PaymentOrderError(
      `Ambiguous Order Outcome (${code}): ${message}. The order state is uncertain. Do NOT retry automatically; manual reconciliation is required.`,
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
      code === "RECONCILIATION_HOLD" ||
      code === "RECONCILIATION_REQUIRED";

    throw new PaymentOrderError(
      `Payment order creation failed: ${errorMsg}`,
      code,
      response.status,
      isAmbiguous,
    );
  }

  const json = await response.json();
  const parsed = CreatePaymentOrderResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new PaymentOrderError(
      "Backend returned malformed payment order response schema.",
      "MALFORMED_RESPONSE",
      502,
      false,
    );
  }

  return parsed.data;
}
