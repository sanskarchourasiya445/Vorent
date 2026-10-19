import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import { randomUUID } from "node:crypto";
import {
  CreatePaymentOrderRequestSchema,
  CreatePaymentOrderResponseSchema,
} from "@warrant/contracts";
import { db } from "../db/index.js";
import * as policyRepo from "../db/repositories/policyRepository.js";
import * as paymentOrderRepo from "../db/repositories/paymentOrderRepository.js";
import { CheckoutError } from "../db/repositories/checkoutProposalRepository.js";
import { PayPalService, defaultPayPalService } from "../services/paypalService.js";

function extractRequestId(request: FastifyRequest): string {
  const incoming = request.headers["x-request-id"];
  if (typeof incoming === "string" && incoming.trim().length > 0) {
    return incoming.trim();
  }
  return `req_${randomUUID()}`;
}

function isDbConnectionError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as any;
  return (
    e.code === "28P01" ||
    e.code === "ECONNREFUSED" ||
    e.code === "ETIMEDOUT" ||
    e.code === "ENOTFOUND" ||
    (typeof e.message === "string" &&
      (e.message.includes("connection") || e.message.includes("authentication failed") || e.message.includes("ECONNREFUSED")))
  );
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
      const ownerId = await policyRepo.ensureDefaultUser(db);
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
      if (isDbConnectionError(err)) {
        request.log.warn({ err, requestId }, "Database unavailable when creating payment order");
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
        (err && typeof err === "object" && ((err as any).name === "CheckoutError" || typeof (err as any).code === "string"))
      ) {
        const errorObj = err as any;
        const isNotFound =
          errorObj.code === "RESERVATION_NOT_FOUND" ||
          errorObj.code === "PROPOSAL_NOT_FOUND";
        const isConflict =
          errorObj.code === "RECONCILIATION_REQUIRED" ||
          errorObj.code === "ORDER_CREATION_AMBIGUOUS" ||
          errorObj.code === "RECONCILIATION_HOLD";

        const statusCode = isNotFound ? 404 : isConflict ? 409 : 400;

        return reply.status(statusCode).send({
          error: {
            code: errorObj.code,
            message: errorObj.message,
          },
          requestId,
        });
      }

      request.log.error({ err, requestId }, "Failed to create payment order");
      return reply.status(500).send({
        error: {
          code: "INTERNAL_ERROR",
          message: "An internal error occurred while creating PayPal Sandbox payment order.",
        },
        requestId,
      });
    }
  });

  // 2. GET /:id - Retrieve payment order details
  fastify.get("/:id", async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
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

    try {
      const ownerId = await policyRepo.ensureDefaultUser(db);
      const order = await paymentOrderRepo.getPaymentOrder(db, id, ownerId);

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
      if (isDbConnectionError(err)) {
        request.log.warn({ err, requestId, id }, "Database unavailable when retrieving payment order");
        return reply.status(503).send({
          error: {
            code: "DATABASE_UNAVAILABLE",
            message: "Persistence store is currently unavailable in standby mode.",
          },
          requestId,
        });
      }

      request.log.error({ err, requestId, id }, "Failed to retrieve payment order");
      return reply.status(500).send({
        error: {
          code: "INTERNAL_ERROR",
          message: "An internal error occurred while retrieving payment order.",
        },
        requestId,
      });
    }
  });
};
