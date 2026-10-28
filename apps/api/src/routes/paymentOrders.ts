import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
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
  PaymentOrderListResponseSchema,
  ReconciliationAlertsResponseSchema,
  UserRole,
} from "@warrant/contracts";
import { db } from "../db/index.js";
import * as paymentOrderRepo from "../db/repositories/paymentOrderRepository.js";
import { CheckoutError } from "../db/repositories/checkoutProposalRepository.js";
import { PayPalService, defaultPayPalService } from "../services/paypalService.js";
import {
  extractRequestId,
  isDbConnectionError,
  resolveAuthorizedUserOrReject,
} from "./routeUtils.js";
import { emailService } from "../services/emailService.js";

function handleRouteError(
  err: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
  requestId: string,
  contextMessage: string
) {
  if (isDbConnectionError(err)) {
    request.log.warn({ err, requestId }, "Database unavailable");
    return reply.status(503).send({
      error: {
        code: "DATABASE_UNAVAILABLE",
        message: "Persistence store is currently unavailable in standby mode.",
      },
      requestId,
    });
  }

  if (
    err instanceof CheckoutError ||
    (err &&
      typeof err === "object" &&
      ((err as any).name === "CheckoutError" || typeof (err as any).code === "string"))
  ) {
    const errorObj = err as any;
    const code = errorObj.code;

    const notFoundCodes = [
      "ORDER_NOT_FOUND",
      "RESERVATION_NOT_FOUND",
      "PROPOSAL_NOT_FOUND",
      "APPROVAL_NOT_FOUND",
    ];
    const forbiddenCodes = ["FORBIDDEN_RESERVATION", "UNAUTHORIZED"];
    const conflictCodes = [
      "RECONCILIATION_REQUIRED",
      "ORDER_CREATION_AMBIGUOUS",
      "RECONCILIATION_HOLD",
      "CAPTURE_OUTCOME_AMBIGUOUS",
      "ORDER_TERMINAL_STATE",
      "CAPTURE_SUCCEEDED_DATABASE_FAILED",
    ];
    const unprocessableCodes = [
      "CANNOT_CANCEL_CAPTURED_ORDER",
      "CANNOT_CANCEL_COMPLETED_ORDER",
      "ORDER_NOT_ELIGIBLE_FOR_CAPTURE",
      "BUYER_NOT_APPROVED",
      "REVOKED_APPROVAL",
      "EXPIRED_APPROVAL",
      "POLICY_HASH_MISMATCH",
      "INTEGRITY_MISMATCH",
      "CAPTURE_AMOUNT_MISMATCH",
    ];

    let statusCode = 400;
    if (notFoundCodes.includes(code)) statusCode = 404;
    else if (forbiddenCodes.includes(code)) statusCode = 403;
    else if (conflictCodes.includes(code)) statusCode = 409;
    else if (unprocessableCodes.includes(code)) statusCode = 422;

    return reply.status(statusCode).send({
      error: {
        code: errorObj.code,
        message: errorObj.message,
      },
      requestId,
    });
  }

  request.log.error({ err, requestId }, contextMessage);
  return reply.status(500).send({
    error: {
      code: "INTERNAL_ERROR",
      message: contextMessage,
    },
    requestId,
  });
}

export interface PaymentOrderRoutesOptions {
  paypalService?: PayPalService;
}

export const paymentOrderRoutes: FastifyPluginAsync<PaymentOrderRoutesOptions> = async (
  fastify,
  opts
) => {
  const paypalService = opts?.paypalService ?? defaultPayPalService;

  // 1. POST / - Create a PayPal Sandbox Checkout Order for an ALLOWed spend reservation
  fastify.post("/", async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    const authResult = await resolveAuthorizedUserOrReject(request, reply, {
      allowDefaultFallbackInDev: true,
    });
    if (!authResult) return;
    const { ownerId } = authResult;

    const parseResult = CreatePaymentOrderRequestSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: "BAD_REQUEST",
          message: "Invalid payment order request payload.",
          details: parseResult.error.format(),
        },
        requestId,
      });
    }

    try {

      const result = await paymentOrderRepo.createPaymentOrder(
        db,
        {
          proposalId: parseResult.data.proposalId,
          reservationId: parseResult.data.reservationId,
          ownerId,
        },
        paypalService
      );

      const validated = CreatePaymentOrderResponseSchema.parse(result);
      return reply.status(201).send(validated);
    } catch (err: unknown) {
      return handleRouteError(err, request, reply, requestId, "Failed to create payment order");
    }
  });

  // 1.1 GET / - List all payment orders with optional filters (dashboard support)
  fastify.get<{
    Querystring: { status?: string; reservationId?: string; limit?: number };
  }>(
    "/",
    async (request, reply) => {
      const requestId = extractRequestId(request);
      reply.header("x-request-id", requestId);

      try {
        const authResult = await resolveAuthorizedUserOrReject(request, reply, {
          allowDefaultFallbackInDev: true,
        });
        if (!authResult) return;
        const { user, ownerId } = authResult;
        const isAdminOrAuditor =
          user &&
          (user.role === UserRole.ADMINISTRATOR || user.role === UserRole.FINANCE_AUDITOR);
        const filterOwnerId = isAdminOrAuditor ? undefined : ownerId;
        const { status, reservationId, limit } = request.query;

        const result = await paymentOrderRepo.listPaymentOrders(db, {
          ownerId: filterOwnerId,
          status: status as any,
          reservationId,
          limit: limit ? Number(limit) : undefined,
        });

        const validated = PaymentOrderListResponseSchema.parse(result);
        return reply.status(200).send(validated);
      } catch (err: unknown) {
        return handleRouteError(err, request, reply, requestId, "Failed to list payment orders");
      }
    }
  );

  // 1.2 GET /reconciliation-alerts - Retrieve orders requiring reconciliation and held reservations
  fastify.get(
    "/reconciliation-alerts",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = extractRequestId(request);
      reply.header("x-request-id", requestId);

      const authResult = await resolveAuthorizedUserOrReject(request, reply, {
        requiredRoles: [UserRole.APPROVER, UserRole.FINANCE_AUDITOR, UserRole.ADMINISTRATOR],
        allowDefaultFallbackInDev: true,
      });
      if (!authResult) return;
      const { ownerId } = authResult;

      try {
        const alerts = await paymentOrderRepo.getReconciliationAlerts(db, ownerId);
        const validated = ReconciliationAlertsResponseSchema.parse(alerts);
        return reply.status(200).send(validated);
      } catch (err: unknown) {
        return handleRouteError(err, request, reply, requestId, "Failed to retrieve reconciliation alerts");
      }
    }
  );

  // 2. GET /:id - Retrieve payment order details
  fastify.get<{ Params: { id: string } }>(
    "/:id",
    async (request, reply) => {
      const requestId = extractRequestId(request);
      reply.header("x-request-id", requestId);

      const { id } = request.params;
      if (!id || typeof id !== "string") {
        return reply.status(400).send({
          error: {
            code: "BAD_REQUEST",
            message: "Invalid payment order ID parameter.",
          },
          requestId,
        });
      }

      const authResult = await resolveAuthorizedUserOrReject(request, reply, {
        allowDefaultFallbackInDev: true,
      });
      if (!authResult) return;
      const { user, ownerId } = authResult;

      try {
        const isAdminOrAuditor =
          user &&
          (user.role === UserRole.ADMINISTRATOR ||
            user.role === UserRole.FINANCE_AUDITOR);
        const queryOwnerId = isAdminOrAuditor ? undefined : (user?.id ?? ownerId);
        const order = await paymentOrderRepo.getPaymentOrder(db, id, queryOwnerId);

        if (!order) {
          return reply.status(404).send({
            error: {
              code: "ORDER_NOT_FOUND",
              message: `Payment order ${id} not found`,
            },
            requestId,
          });
        }

        return reply.status(200).send({ order });
      } catch (err: unknown) {
        return handleRouteError(err, request, reply, requestId, "Failed to retrieve payment order");
      }
    }
  );

  // 3. POST /buyer-approval - Confirm buyer approval (idempotent return flow)
  fastify.post(
    "/buyer-approval",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = extractRequestId(request);
      reply.header("x-request-id", requestId);

      const parseResult = ConfirmBuyerApprovalRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: {
            code: "BAD_REQUEST",
            message: "Invalid buyer approval request payload.",
            details: parseResult.error.format(),
          },
          requestId,
        });
      }

      const authResult = await resolveAuthorizedUserOrReject(request, reply, {
        allowDefaultFallbackInDev: true,
      });
      if (!authResult) return;
      const { ownerId } = authResult;

      try {
        const result = await paymentOrderRepo.confirmBuyerApproval(
          db,
          {
            orderId: parseResult.data.orderId,
            paypalOrderId: parseResult.data.paypalOrderId,
            payerId: parseResult.data.payerId,
            ownerId,
          },
          paypalService
        );

        const validated = ConfirmBuyerApprovalResponseSchema.parse(result);
        return reply.status(200).send(validated);
      } catch (err: unknown) {
        return handleRouteError(err, request, reply, requestId, "Failed to confirm buyer approval");
      }
    }
  );

  // 4. POST /:id/buyer-approval - Confirm buyer approval with ID in URL path
  fastify.post<{ Params: { id: string }; Body: Record<string, any> }>(
    "/:id/buyer-approval",
    async (request, reply) => {
      const requestId = extractRequestId(request);
      reply.header("x-request-id", requestId);

      const { id } = request.params;
      const body = request.body || {};

      const authResult = await resolveAuthorizedUserOrReject(request, reply, {
        allowDefaultFallbackInDev: true,
      });
      if (!authResult) return;
      const { ownerId } = authResult;

      try {
        const result = await paymentOrderRepo.confirmBuyerApproval(
          db,
          {
            orderId: id,
            paypalOrderId: body.paypalOrderId,
            payerId: body.payerId,
            ownerId,
          },
          paypalService
        );

        const validated = ConfirmBuyerApprovalResponseSchema.parse(result);
        return reply.status(200).send(validated);
      } catch (err: unknown) {
        return handleRouteError(err, request, reply, requestId, "Failed to confirm buyer approval");
      }
    }
  );

  // 5. POST /cancel - Cancel payment order and safely release spend reservation
  fastify.post(
    "/cancel",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = extractRequestId(request);
      reply.header("x-request-id", requestId);

      const parseResult = CancelPaymentOrderRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: {
            code: "BAD_REQUEST",
            message: "Invalid cancel order request payload.",
            details: parseResult.error.format(),
          },
          requestId,
        });
      }

      const authResult = await resolveAuthorizedUserOrReject(request, reply, {
        allowDefaultFallbackInDev: true,
      });
      if (!authResult) return;
      const { ownerId } = authResult;

      try {
        const result = await paymentOrderRepo.cancelPaymentOrder(
          db,
          {
            orderId: parseResult.data.orderId,
            paypalOrderId: parseResult.data.paypalOrderId,
            reason: parseResult.data.reason,
            ownerId,
          },
          paypalService
        );

        const validated = CancelPaymentOrderResponseSchema.parse(result);
        return reply.status(200).send(validated);
      } catch (err: unknown) {
        return handleRouteError(err, request, reply, requestId, "Failed to cancel payment order");
      }
    }
  );

  // 6. POST /:id/cancel - Cancel payment order with ID in path
  fastify.post<{ Params: { id: string }; Body?: Record<string, any> }>(
    "/:id/cancel",
    async (request, reply) => {
      const requestId = extractRequestId(request);
      reply.header("x-request-id", requestId);

      const { id } = request.params;
      const body = request.body || {};

      const authResult = await resolveAuthorizedUserOrReject(request, reply, {
        allowDefaultFallbackInDev: true,
      });
      if (!authResult) return;
      const { ownerId } = authResult;

      try {
        const result = await paymentOrderRepo.cancelPaymentOrder(
          db,
          {
            orderId: id,
            paypalOrderId: body.paypalOrderId,
            reason: body.reason,
            ownerId,
          },
          paypalService
        );

        const validated = CancelPaymentOrderResponseSchema.parse(result);
        return reply.status(200).send(validated);
      } catch (err: unknown) {
        return handleRouteError(err, request, reply, requestId, "Failed to cancel payment order");
      }
    }
  );

  // 7. POST /capture - Server-side capture
  fastify.post(
    "/capture",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = extractRequestId(request);
      reply.header("x-request-id", requestId);

      const parseResult = CapturePaymentOrderRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: {
            code: "BAD_REQUEST",
            message: "Invalid capture order request payload.",
            details: parseResult.error.format(),
          },
          requestId,
        });
      }

      const authResult = await resolveAuthorizedUserOrReject(request, reply, {
        requiredRoles: [UserRole.APPROVER, UserRole.ADMINISTRATOR],
        allowDefaultFallbackInDev: true,
      });
      if (!authResult) return;
      const { user, ownerId } = authResult;
      const targetOwnerId = (user?.role === UserRole.ADMINISTRATOR || user?.role === UserRole.APPROVER)
        ? undefined
        : ownerId;

      try {
        const result = await paymentOrderRepo.capturePaymentOrder(
          db,
          {
            orderId: parseResult.data.orderId,
            paypalOrderId: parseResult.data.paypalOrderId,
            ownerId: targetOwnerId,
          },
          paypalService
        );

        const validated = CapturePaymentOrderResponseSchema.parse(result);

        // Asynchronous, non-blocking email confirmation
        if (result.status === "CAPTURED" || result.order.status === "CAPTURED") {
          emailService.dispatchOrderCapturedAsync(
            {
              recipientEmail: user?.email || "buyer@warrant.studio",
              orderId: result.order.id,
              paypalOrderId: result.paypalOrderId,
              captureId: result.captureId,
              amount: result.capturedAmountMinor / 100,
              currency: result.currency,
              items: [],
              capturedAt: new Date().toISOString(),
            },
            ownerId,
          );
        }

        return reply.status(200).send(validated);
      } catch (err: unknown) {
        return handleRouteError(err, request, reply, requestId, "Failed to capture payment order");
      }
    }
  );

  // 8. POST /:id/capture - Server-side capture with ID in path
  fastify.post<{ Params: { id: string }; Body?: Record<string, any> }>(
    "/:id/capture",
    async (request, reply) => {
      const requestId = extractRequestId(request);
      reply.header("x-request-id", requestId);

      const { id } = request.params;
      const body = request.body || {};

      const authResult = await resolveAuthorizedUserOrReject(request, reply, {
        requiredRoles: [UserRole.APPROVER, UserRole.ADMINISTRATOR],
        allowDefaultFallbackInDev: true,
      });
      if (!authResult) return;
      const { user, ownerId } = authResult;
      const targetOwnerId = (user?.role === UserRole.ADMINISTRATOR || user?.role === UserRole.APPROVER)
        ? undefined
        : ownerId;

      try {
        const result = await paymentOrderRepo.capturePaymentOrder(
          db,
          {
            orderId: id,
            paypalOrderId: body.paypalOrderId,
            ownerId: targetOwnerId,
          },
          paypalService
        );

        const validated = CapturePaymentOrderResponseSchema.parse(result);

        // Asynchronous, non-blocking email confirmation
        if (result.status === "CAPTURED" || result.order.status === "CAPTURED") {
          emailService.dispatchOrderCapturedAsync(
            {
              recipientEmail: user?.email || "buyer@warrant.studio",
              orderId: result.order.id,
              paypalOrderId: result.paypalOrderId,
              captureId: result.captureId,
              amount: result.capturedAmountMinor / 100,
              currency: result.currency,
              items: [],
              capturedAt: new Date().toISOString(),
            },
            ownerId,
          );
        }

        return reply.status(200).send(validated);
      } catch (err: unknown) {
        return handleRouteError(err, request, reply, requestId, "Failed to capture payment order");
      }
    }
  );

  // 9. POST /reconcile - Reconcile order against PayPal APIs
  fastify.post(
    "/reconcile",
    async (request: FastifyRequest, reply: FastifyReply) => {
      const requestId = extractRequestId(request);
      reply.header("x-request-id", requestId);

      const parseResult = ReconcilePaymentOrderRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({
          error: {
            code: "BAD_REQUEST",
            message: "Invalid reconcile order request payload.",
            details: parseResult.error.format(),
          },
          requestId,
        });
      }

      const authResult = await resolveAuthorizedUserOrReject(request, reply, {
        requiredRoles: [UserRole.FINANCE_AUDITOR, UserRole.ADMINISTRATOR],
        allowDefaultFallbackInDev: true,
      });
      if (!authResult) return;
      const { user, ownerId } = authResult;
      const targetOwnerId = (user?.role === UserRole.ADMINISTRATOR || user?.role === UserRole.FINANCE_AUDITOR)
        ? undefined
        : ownerId;

      try {
        const result = await paymentOrderRepo.reconcilePaymentOrder(
          db,
          {
            orderId: parseResult.data.orderId,
            paypalOrderId: parseResult.data.paypalOrderId,
            ownerId: targetOwnerId,
          },
          paypalService
        );

        const validated = ReconcilePaymentOrderResponseSchema.parse(result);

        // Asynchronous, non-blocking alert if reconciliation detected an issue or placed hold
        if (!result.reconciled || result.reservationState === "RECONCILIATION_HOLD") {
          emailService.dispatchReconciliationAlertAsync(
            {
              recipientEmail: "compliance@warrant.studio",
              orderId: result.order.id,
              discrepancyType: result.externalStatus || "UNRECONCILED_LEDGER_STATE",
              expectedAmount: result.order.amountMinor / 100,
              actualAmount: result.order.amountMinor / 100,
              currency: result.order.currency,
              detectedAt: new Date().toISOString(),
              reason: result.notes || "Discrepancy detected during PayPal API reconciliation.",
            },
            ownerId,
          );
        }

        return reply.status(200).send(validated);
      } catch (err: unknown) {
        return handleRouteError(err, request, reply, requestId, "Failed to reconcile payment order");
      }
    }
  );

  // 10. POST /:id/reconcile - Reconcile order with ID in path
  fastify.post<{ Params: { id: string }; Body?: Record<string, any> }>(
    "/:id/reconcile",
    async (request, reply) => {
      const requestId = extractRequestId(request);
      reply.header("x-request-id", requestId);

      const { id } = request.params;
      const body = request.body || {};

      const authResult = await resolveAuthorizedUserOrReject(request, reply, {
        requiredRoles: [UserRole.FINANCE_AUDITOR, UserRole.ADMINISTRATOR],
        allowDefaultFallbackInDev: true,
      });
      if (!authResult) return;
      const { user, ownerId } = authResult;
      const targetOwnerId = (user?.role === UserRole.ADMINISTRATOR || user?.role === UserRole.FINANCE_AUDITOR)
        ? undefined
        : ownerId;

      try {
        const result = await paymentOrderRepo.reconcilePaymentOrder(
          db,
          {
            orderId: id,
            paypalOrderId: body.paypalOrderId,
            ownerId: targetOwnerId,
          },
          paypalService
        );

        const validated = ReconcilePaymentOrderResponseSchema.parse(result);

        // Asynchronous, non-blocking alert if reconciliation detected an issue or placed hold
        if (!result.reconciled || result.reservationState === "RECONCILIATION_HOLD") {
          emailService.dispatchReconciliationAlertAsync(
            {
              recipientEmail: "compliance@warrant.studio",
              orderId: result.order.id,
              discrepancyType: result.externalStatus || "UNRECONCILED_LEDGER_STATE",
              expectedAmount: result.order.amountMinor / 100,
              actualAmount: result.order.amountMinor / 100,
              currency: result.order.currency,
              detectedAt: new Date().toISOString(),
              reason: result.notes || "Discrepancy detected during PayPal API reconciliation.",
            },
            ownerId,
          );
        }

        return reply.status(200).send(validated);
      } catch (err: unknown) {
        return handleRouteError(err, request, reply, requestId, "Failed to reconcile payment order");
      }
    }
  );
};
