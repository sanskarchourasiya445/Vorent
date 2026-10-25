import { env } from "../config/env.js";
import type {
  PayPalTransaction,
  PayPalAuthStatusResponse,
  PayPalTransactionListResponse,
  CreateTestSandboxOrderResponse,
} from "@warrant/contracts";

export interface PayPalConfig {
  env: string;
  clientId?: string;
  clientSecret?: string;
  webhookId?: string;
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

export interface PayPalOrderDetails {
  id: string;
  status: string;
  intent?: string;
  purchaseUnits?: Array<{
    referenceId?: string;
    customId?: string;
    amount?: {
      currencyCode: string;
      value: string;
    };
    payments?: {
      captures?: Array<{
        id: string;
        status: string;
        amount: {
          currency_code: string;
          value: string;
        };
      }>;
    };
  }>;
  payer?: {
    payerId?: string;
    emailAddress?: string;
  };
}

export interface CapturePayPalOrderParams {
  orderId: string;
  idempotencyKey: string;
}

export interface PayPalCaptureResult {
  orderId: string;
  orderStatus: string;
  captureId: string;
  captureStatus: string;
  amount: {
    currencyCode: string;
    value: string;
  };
}

export interface PayPalCaptureDetails {
  id: string;
  status: string;
  amount: {
    currencyCode: string;
    value: string;
  };
  customId?: string;
}

export interface VerifyWebhookSignatureParams {
  authAlgo: string;
  certUrl: string;
  transmissionId: string;
  transmissionSig: string;
  transmissionTime: string;
  webhookId?: string;
  webhookEvent: Record<string, any>;
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
      webhookId: config?.webhookId ?? env.PAYPAL_WEBHOOK_ID ?? "",
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

    if (response.status >= 500) {
      throw new PayPalNetworkError(
        `PayPal service returned server error HTTP ${response.status}. Order creation outcome is ambiguous.`,
        true
      );
    }

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

  /**
   * Retrieves order details directly from PayPal Orders v2 API.
   */
  async getOrder(orderId: string): Promise<PayPalOrderDetails> {
    const token = await this.getAccessToken();
    const url = `${this.config.baseUrl}/v2/checkout/orders/${orderId}`;

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (err: any) {
      const isTimeout = err?.name === "TimeoutError" || err?.name === "AbortError";
      throw new PayPalNetworkError(
        isTimeout
          ? "PayPal getOrder request timed out."
          : "Network failure while retrieving PayPal order.",
        false
      );
    }

    if (response.status >= 500) {
      throw new PayPalNetworkError(
        `PayPal service returned server error HTTP ${response.status} when retrieving order.`,
        false
      );
    }

    if (!response.ok) {
      let errorMessage = `PayPal getOrder failed with HTTP ${response.status}`;
      try {
        const errorJson = (await response.json()) as Record<string, any>;
        if (errorJson?.message) errorMessage = errorJson.message;
      } catch {
        // fallback
      }
      throw new PayPalApiError("PAYPAL_GET_ORDER_FAILED", errorMessage, response.status);
    }

    const data = (await response.json()) as Record<string, any>;
    return {
      id: data.id,
      status: data.status,
      intent: data.intent,
      purchaseUnits: data.purchase_units?.map((pu: any) => ({
        referenceId: pu.reference_id,
        customId: pu.custom_id,
        amount: pu.amount
          ? {
              currencyCode: pu.amount.currency_code,
              value: pu.amount.value,
            }
          : undefined,
        payments: pu.payments,
      })),
      payer: data.payer
        ? {
            payerId: data.payer.payer_id,
            emailAddress: data.payer.email_address,
          }
        : undefined,
    };
  }

  /**
   * Captures an authorized/approved PayPal checkout order.
   * Employs idempotency key to prevent double captures.
   */
  async captureOrder(params: CapturePayPalOrderParams): Promise<PayPalCaptureResult> {
    const token = await this.getAccessToken();
    const url = `${this.config.baseUrl}/v2/checkout/orders/${params.orderId}/capture`;

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
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (err: any) {
      const isTimeout = err?.name === "TimeoutError" || err?.name === "AbortError";
      throw new PayPalNetworkError(
        isTimeout
          ? "PayPal capture request timed out. Capture outcome is ambiguous."
          : "Network failure while capturing PayPal order. Capture outcome is ambiguous.",
        true
      );
    }

    if (response.status >= 500) {
      throw new PayPalNetworkError(
        `PayPal service returned server error HTTP ${response.status}. Capture outcome is ambiguous.`,
        true
      );
    }

    if (!response.ok) {
      let errorMessage = `PayPal capture rejected with HTTP ${response.status}`;
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
        // fallback
      }

      throw new PayPalApiError(
        "PAYPAL_CAPTURE_REJECTED",
        errorMessage,
        response.status,
        errorDetails
      );
    }

    const data = (await response.json()) as Record<string, any>;
    const purchaseUnit = data.purchase_units?.[0];
    const capture = purchaseUnit?.payments?.captures?.[0];

    if (!capture?.id) {
      throw new PayPalApiError(
        "PAYPAL_CAPTURE_MALFORMED_RESPONSE",
        "PayPal capture response missing capture ID",
        502,
        data
      );
    }

    return {
      orderId: data.id,
      orderStatus: data.status,
      captureId: capture.id,
      captureStatus: capture.status,
      amount: {
        currencyCode: capture.amount?.currency_code ?? "USD",
        value: capture.amount?.value ?? "0.00",
      },
    };
  }

  /**
   * Retrieves capture details from PayPal Captures API.
   */
  async getCapture(captureId: string): Promise<PayPalCaptureDetails> {
    const token = await this.getAccessToken();
    const url = `${this.config.baseUrl}/v2/payments/captures/${captureId}`;

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (err: any) {
      const isTimeout = err?.name === "TimeoutError" || err?.name === "AbortError";
      throw new PayPalNetworkError(
        isTimeout
          ? "PayPal getCapture request timed out."
          : "Network failure while retrieving PayPal capture.",
        false
      );
    }

    if (response.status >= 500) {
      throw new PayPalNetworkError(
        `PayPal service returned server error HTTP ${response.status} when retrieving capture.`,
        false
      );
    }

    if (!response.ok) {
      let errorMessage = `PayPal getCapture failed with HTTP ${response.status}`;
      try {
        const errorJson = (await response.json()) as Record<string, any>;
        if (errorJson?.message) errorMessage = errorJson.message;
      } catch {
        // fallback
      }
      throw new PayPalApiError("PAYPAL_GET_CAPTURE_FAILED", errorMessage, response.status);
    }

    const data = (await response.json()) as Record<string, any>;
    return {
      id: data.id,
      status: data.status,
      amount: {
        currencyCode: data.amount?.currency_code,
        value: data.amount?.value,
      },
      customId: data.custom_id,
    };
  }

  /**
   * Verifies PayPal Webhook event signature using PayPal's verification endpoint.
   * Rejects unverified events and prevents spoofing.
   */
  async verifyWebhookSignature(params: VerifyWebhookSignatureParams): Promise<boolean> {
    const webhookId = params.webhookId || this.config.webhookId || env.PAYPAL_WEBHOOK_ID;
    if (!webhookId) {
      throw new PayPalConfigError(
        "PAYPAL_WEBHOOK_ID is required to verify incoming PayPal webhooks."
      );
    }

    const token = await this.getAccessToken();
    const url = `${this.config.baseUrl}/v1/notifications/verify-webhook-signature`;

    const requestBody = {
      auth_algo: params.authAlgo,
      cert_url: params.certUrl,
      transmission_id: params.transmissionId,
      transmission_sig: params.transmissionSig,
      transmission_time: params.transmissionTime,
      webhook_id: webhookId,
      webhook_event: params.webhookEvent,
    };

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify(requestBody),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (err: any) {
      const isTimeout = err?.name === "TimeoutError" || err?.name === "AbortError";
      throw new PayPalNetworkError(
        isTimeout
          ? "PayPal webhook verification request timed out."
          : "Network failure while verifying PayPal webhook signature.",
        false
      );
    }

    if (!response.ok) {
      return false;
    }

    const data = (await response.json()) as Record<string, any>;
    return data?.verification_status === "SUCCESS";
  }

  /**
   * Probes PayPal Sandbox credentials and reports authentication readiness,
   * environment, and granted scopes without leaking secret values.
   */
  async getAuthStatus(): Promise<PayPalAuthStatusResponse> {
    const clientIdConfigured = Boolean(this.config.clientId && this.config.clientId.trim().length > 0);
    const clientSecretConfigured = Boolean(this.config.clientSecret && this.config.clientSecret.trim().length > 0);
    const webhookIdConfigured = Boolean(this.config.webhookId && this.config.webhookId.trim().length > 0);

    if (!clientIdConfigured || !clientSecretConfigured) {
      return {
        environment: "sandbox",
        authenticated: false,
        hasTransactionSearchScope: false,
        clientIdConfigured,
        clientSecretConfigured,
        webhookIdConfigured,
        scopes: [],
        message: "PayPal Sandbox credentials are not configured in environment.",
      };
    }

    try {
      const authHeader = `Basic ${Buffer.from(
        `${this.config.clientId}:${this.config.clientSecret}`
      ).toString("base64")}`;
      const url = `${this.config.baseUrl}/v1/oauth2/token`;

      const response = await this.fetchFn(url, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: "grant_type=client_credentials",
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });

      if (!response.ok) {
        let msg = `PayPal Sandbox OAuth failed with HTTP ${response.status}`;
        try {
          const body = (await response.json()) as Record<string, any>;
          if (body?.error_description) msg = String(body.error_description);
        } catch {}
        return {
          environment: "sandbox",
          authenticated: false,
          hasTransactionSearchScope: false,
          clientIdConfigured,
          clientSecretConfigured,
          webhookIdConfigured,
          scopes: [],
          message: msg,
        };
      }

      const data = (await response.json()) as Record<string, any>;
      const scopeString = typeof data.scope === "string" ? data.scope : "";
      const scopes = scopeString.split(" ").filter(Boolean);
      const hasTransactionSearchScope = scopes.some((s: string) =>
        s.includes("reporting/search") || s.includes("reporting")
      );

      if (data.access_token && typeof data.access_token === "string") {
        const expiresIn = Number(data.expires_in) || 3600;
        this.cachedToken = {
          token: data.access_token,
          expiresAt: Date.now() + Math.max(0, expiresIn - 60) * 1000,
        };
      }

      return {
        environment: "sandbox",
        authenticated: true,
        hasTransactionSearchScope,
        clientIdConfigured,
        clientSecretConfigured,
        webhookIdConfigured,
        scopes,
        message: hasTransactionSearchScope
          ? "PayPal Sandbox authenticated with Transaction Search scope enabled."
          : "PayPal Sandbox authenticated successfully. (Note: Transaction Search reporting scope is not enabled on this app).",
      };
    } catch (err: any) {
      return {
        environment: "sandbox",
        authenticated: false,
        hasTransactionSearchScope: false,
        clientIdConfigured,
        clientSecretConfigured,
        webhookIdConfigured,
        scopes: [],
        message: err?.message || "Failed to contact PayPal OAuth endpoint.",
      };
    }
  }

  /**
   * Retrieves transaction history from PayPal Transaction Search API (/v1/reporting/transactions).
   * Adheres to PayPal's 31-day max date range constraint.
   * Handles 403 permission failures defensively when the app lacks search scopes.
   */
  async listTransactions(params?: {
    startDate?: string;
    endDate?: string;
    page?: number;
    pageSize?: number;
  }): Promise<PayPalTransactionListResponse> {
    const authStatus = await this.getAuthStatus();
    if (!authStatus.authenticated) {
      throw new PayPalApiError(
        "PAYPAL_NOT_AUTHENTICATED",
        authStatus.message,
        401
      );
    }

    const now = new Date();
    let end = params?.endDate ? new Date(params.endDate) : now;
    if (isNaN(end.getTime())) end = now;

    let start = params?.startDate
      ? new Date(params.startDate)
      : new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    if (isNaN(start.getTime())) {
      start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    // PayPal API allows a maximum of 31 days between start_date and end_date
    const thirtyOneDaysMs = 31 * 24 * 60 * 60 * 1000;
    if (end.getTime() - start.getTime() > thirtyOneDaysMs) {
      start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const startDateIso = start.toISOString();
    const endDateIso = end.toISOString();
    const page = params?.page ?? 1;
    const pageSize = Math.min(params?.pageSize ?? 20, 100);

    const token = await this.getAccessToken();
    const url = new URL(`${this.config.baseUrl}/v1/reporting/transactions`);
    url.searchParams.set("start_date", startDateIso);
    url.searchParams.set("end_date", endDateIso);
    url.searchParams.set("page", String(page));
    url.searchParams.set("page_size", String(pageSize));
    url.searchParams.set("fields", "all");

    let response: Response;
    try {
      response = await this.fetchFn(url.toString(), {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (err: any) {
      const isTimeout = err?.name === "TimeoutError" || err?.name === "AbortError";
      throw new PayPalNetworkError(
        isTimeout
          ? "PayPal transaction search request timed out."
          : "Network failure while searching PayPal transactions.",
        false
      );
    }

    if (response.status === 403 || response.status === 401) {
      let message = "Authorization failed due to insufficient permissions.";
      try {
        const errorJson = (await response.json()) as Record<string, any>;
        if (errorJson?.message) message = errorJson.message;
      } catch {}

      return {
        transactions: [],
        total: 0,
        startDate: startDateIso,
        endDate: endDateIso,
        source: "PAYPAL_TRANSACTION_SEARCH_API",
        permissionRequired: true,
        permissionNote: `PayPal Sandbox App requires the 'Transaction Search' feature enabled (${message}). In PayPal Developer Dashboard, navigate to Apps & Credentials > [Your App] > Features, enable 'Transaction Search', and save.`,
      };
    }

    if (!response.ok) {
      let errorMessage = `PayPal transaction search failed with HTTP ${response.status}`;
      try {
        const errJson = (await response.json()) as Record<string, any>;
        if (errJson?.message) errorMessage = errJson.message;
      } catch {}
      throw new PayPalApiError(
        "PAYPAL_TRANSACTION_SEARCH_FAILED",
        errorMessage,
        response.status
      );
    }

    const data = (await response.json()) as Record<string, any>;
    const rawList = Array.isArray(data.transaction_details)
      ? data.transaction_details
      : [];

    const mappedTransactions: PayPalTransaction[] = rawList.map((item: any) => {
      const info = item.transaction_info ?? {};
      const payer = item.payer_info ?? {};
      const rawStatus = info.transaction_status ?? "S";
      let status = "COMPLETED";
      if (rawStatus === "S") status = "COMPLETED";
      else if (rawStatus === "P") status = "PENDING";
      else if (rawStatus === "D") status = "DENIED";
      else if (rawStatus === "V") status = "REVERSED";
      else status = rawStatus;

      const amtVal = parseFloat(info.transaction_amount?.value ?? "0");
      const amountMinor = Math.round(amtVal * 100);
      const feeVal = info.fee_amount?.value ? parseFloat(info.fee_amount.value) : undefined;
      const feeAmountMinor = feeVal !== undefined ? Math.round(Math.abs(feeVal) * 100) : undefined;

      const payerNameParts = [payer.payer_name?.given_name, payer.payer_name?.surname].filter(Boolean);
      const payerName = payerNameParts.length > 0 ? payerNameParts.join(" ") : null;

      return {
        transactionId: info.transaction_id ?? `tx_${Date.now()}`,
        paypalReferenceId: info.paypal_reference_id ?? null,
        status,
        amountMinor,
        currency: info.transaction_amount?.currency_code ?? "USD",
        initiationDate: info.transaction_initiation_date ?? new Date().toISOString(),
        updatedDate: info.transaction_updated_date ?? null,
        payerEmail: payer.email_address ?? null,
        payerName,
        description: info.transaction_subject ?? info.custom_field ?? "PayPal Sandbox Transaction",
        feeAmountMinor,
        syncedToLedger: false,
        associatedOrderId: null,
      };
    });

    return {
      transactions: mappedTransactions,
      total: Number(data.total_items ?? mappedTransactions.length),
      startDate: startDateIso,
      endDate: endDateIso,
      source: "PAYPAL_TRANSACTION_SEARCH_API",
      permissionRequired: false,
    };
  }

  /**
   * Creates a standalone test checkout order on PayPal Sandbox v2 for verification and testing.
   */
  async createTestSandboxOrder(params?: {
    amountMinor?: number;
    currency?: string;
    itemDescription?: string;
  }): Promise<CreateTestSandboxOrderResponse> {
    const amountMinor = params?.amountMinor ?? 1500;
    const currency = params?.currency ?? "USD";
    const description = params?.itemDescription ?? "PayPal Sandbox Test Purchase";
    const formattedAmount = (amountMinor / 100).toFixed(2);
    const token = await this.getAccessToken();

    const url = `${this.config.baseUrl}/v2/checkout/orders`;
    const idempotencyKey = `warrant:test:${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;

    let response: Response;
    try {
      response = await this.fetchFn(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "PayPal-Request-Id": idempotencyKey,
        },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [
            {
              description,
              amount: {
                currency_code: currency,
                value: formattedAmount,
              },
            },
          ],
        }),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
    } catch (err: any) {
      const isTimeout = err?.name === "TimeoutError" || err?.name === "AbortError";
      throw new PayPalNetworkError(
        isTimeout
          ? "PayPal test order request timed out."
          : "Network failure while creating PayPal test order.",
        false
      );
    }

    if (!response.ok) {
      let safeError = `Test order creation failed with HTTP ${response.status}`;
      try {
        const json = (await response.json()) as Record<string, any>;
        if (json?.message) safeError = json.message;
      } catch {}
      throw new PayPalApiError("TEST_ORDER_CREATION_FAILED", safeError, response.status);
    }

    const data = (await response.json()) as Record<string, any>;
    const approveLink = data.links?.find((l: any) => l.rel === "approve")?.href;

    return {
      id: data.id,
      status: data.status ?? "CREATED",
      approvalUrl: approveLink,
      amountMinor,
      currency,
      createdAt: new Date().toISOString(),
    };
  }
}

export const defaultPayPalService = new PayPalService();
