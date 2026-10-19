import { env } from "../config/env.js";

export interface PayPalConfig {
  env: string;
  clientId?: string;
  clientSecret?: string;
  baseUrl?: string;
  timeoutMs?: number;
}

export class PayPalConfigError extends Error {
  readonly code = "PAYPAL_CONFIG_ERROR";
  constructor(message: string) {
    super(message);
    this.name = "PayPalConfigError";
  }
}

export class PayPalApiError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly details?: unknown;

  constructor(code: string, message: string, statusCode = 400, details?: unknown) {
    super(`${code}: ${message}`);
    this.name = "PayPalApiError";
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}

export class PayPalNetworkError extends Error {
  readonly code = "PAYPAL_NETWORK_ERROR";
  readonly isAmbiguous: boolean;

  constructor(message: string, isAmbiguous = true) {
    super(message);
    this.name = "PayPalNetworkError";
    this.isAmbiguous = isAmbiguous;
  }
}

export interface CreatePayPalOrderParams {
  reservationId: string;
  amountMinor: number;
  currency: string;
  idempotencyKey: string;
}

export interface CreatedPayPalOrder {
  id: string;
  status: string;
  approvalUrl?: string;
}

export class PayPalService {
  private config: Required<PayPalConfig>;
  private cachedToken: { token: string; expiresAt: number } | null = null;
  private fetchFn: typeof fetch;

  constructor(config?: Partial<PayPalConfig>, fetchFn: typeof fetch = fetch) {
    this.config = {
      env: config?.env ?? env.PAYPAL_ENV ?? "sandbox",
      clientId: config?.clientId ?? env.PAYPAL_CLIENT_ID ?? "",
      clientSecret: config?.clientSecret ?? env.PAYPAL_CLIENT_SECRET ?? "",
      baseUrl: config?.baseUrl ?? "https://api-m.sandbox.paypal.com",
      timeoutMs: config?.timeoutMs ?? 10000,
    };
    this.fetchFn = fetchFn;
  }

  /**
   * Validates configuration and fails closed if not strictly sandbox or missing credentials.
   */
  private validateConfig(): void {
    if (this.config.env !== "sandbox") {
      throw new PayPalConfigError(
        "PAYPAL_ENV must be strictly 'sandbox' in MVP. Live PayPal mode is prohibited."
      );
    }
    if (!this.config.clientId || !this.config.clientSecret) {
      throw new PayPalConfigError(
        "PAYPAL_CREDENTIALS_MISSING: PayPal Sandbox Client ID and Client Secret must be configured."
      );
    }
  }

  /**
   * Acquires a server-side OAuth 2.0 bearer token using client credentials grant.
   * Caches active tokens until expiration buffer. Never leaks secrets or auth headers.
   */
  async getAccessToken(): Promise<string> {
    this.validateConfig();

    if (this.cachedToken && this.cachedToken.expiresAt > Date.now()) {
      return this.cachedToken.token;
    }

    const authHeader = `Basic ${Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`
    ).toString("base64")}`;

    const url = `${this.config.baseUrl}/v1/oauth2/token`;
    let response: Response;

    try {
      response = await this.fetchFn(url, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: "grant_type=client_credentials",
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (err: any) {
      const isTimeout = err?.name === "TimeoutError" || err?.name === "AbortError";
      throw new PayPalNetworkError(
        isTimeout
          ? "PayPal OAuth token request timed out."
          : "Network failure while contacting PayPal OAuth service.",
        false
      );
    }

    if (!response.ok) {
      let safeError = "Failed to obtain PayPal Sandbox access token";
      try {
        const json = (await response.json()) as Record<string, any>;
        if (json?.error_description) {
          safeError = String(json.error_description);
        }
      } catch {
        // fallback to generic message
      }
      throw new PayPalApiError(
        "PAYPAL_AUTH_FAILED",
        safeError,
        response.status
      );
    }

    const data = (await response.json()) as Record<string, any>;
    const token = data?.access_token;
    const expiresIn = Number(data?.expires_in) || 3600;

    if (!token || typeof token !== "string") {
      throw new PayPalApiError(
        "PAYPAL_AUTH_INVALID_RESPONSE",
        "OAuth response did not contain a valid access_token",
        502
      );
    }

    // Cache with a 60-second safety buffer
    this.cachedToken = {
      token,
      expiresAt: Date.now() + Math.max(0, expiresIn - 60) * 1000,
    };

    return token;
  }

  /**
   * Creates a PayPal v2 Checkout Order bound to an authorized spend reservation.
   * Uses idempotent request headers to guarantee safe retries.
   */
  async createOrder(params: CreatePayPalOrderParams): Promise<CreatedPayPalOrder> {
    const token = await this.getAccessToken();

    const formattedAmount = (params.amountMinor / 100).toFixed(2);
    const url = `${this.config.baseUrl}/v2/checkout/orders`;

    const requestBody = {
      intent: "CAPTURE",
      purchase_units: [
        {
          reference_id: params.reservationId,
          custom_id: params.reservationId,
          amount: {
            currency_code: params.currency,
            value: formattedAmount,
          },
        },
      ],
    };

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "PayPal-Request-Id": params.idempotencyKey,
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (err: any) {
      const isTimeout = err?.name === "TimeoutError" || err?.name === "AbortError";
      throw new PayPalNetworkError(
        isTimeout
          ? "PayPal order creation request timed out. Outcome is ambiguous."
          : "Network failure while contacting PayPal Orders API. Outcome is ambiguous.",
        true
      );
    }

    // Server-side errors (5xx) mean the order might have been created by PayPal before the connection dropped
    if (response.status >= 500) {
      throw new PayPalNetworkError(
        `PayPal service returned server error HTTP ${response.status}. Order creation outcome is ambiguous.`,
        true
      );
    }

    // Definite client-side / business logic errors (4xx)
    if (!response.ok) {
      let errorMessage = `PayPal order creation rejected with HTTP ${response.status}`;
      let errorDetails: unknown = undefined;
      try {
        const errorJson = (await response.json()) as Record<string, any>;
        errorDetails = errorJson;
        if (errorJson?.message) {
          errorMessage = errorJson.message;
        } else if (errorJson?.name) {
          errorMessage = errorJson.name;
        }
      } catch {
        // use default message
      }

      throw new PayPalApiError(
        "PAYPAL_ORDER_CREATION_REJECTED",
        errorMessage,
        response.status,
        errorDetails
      );
    }

    const orderData = (await response.json()) as Record<string, any>;
    if (!orderData?.id || typeof orderData.id !== "string") {
      throw new PayPalApiError(
        "PAYPAL_ORDER_MALFORMED_RESPONSE",
        "PayPal response missing order ID",
        502
      );
    }

    const approveLink = orderData.links?.find(
      (link: any) => link?.rel === "approve"
    );

    return {
      id: orderData.id,
      status: orderData.status ?? "CREATED",
      approvalUrl: approveLink?.href,
    };
  }
}

export const defaultPayPalService = new PayPalService();
