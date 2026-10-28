import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import {
  PayPalWebhookEventSchema,
  WebhookProcessResponseSchema,
} from "@warrant/contracts";
import { db } from "../db/index.js";
import * as paymentOrderRepo from "../db/repositories/paymentOrderRepository.js";
import { CheckoutError } from "../db/repositories/checkoutProposalRepository.js";
import { PayPalService, defaultPayPalService } from "../services/paypalService.js";
import { extractRequestId } from "./routeUtils.js";

export interface WebhookRoutesOptions {
  paypalService?: PayPalService;
}

export const webhookRoutes: FastifyPluginAsync<WebhookRoutesOptions> = async (
  fastify,
  opts
) => {
  const paypalService = opts?.paypalService ?? defaultPayPalService;

  // POST /paypal - Ingest and process verified PayPal webhook event
  fastify.post("/paypal", async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    const parseResult = PayPalWebhookEventSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: "BAD_REQUEST",
          message: "Invalid PayPal webhook event payload.",
          details: parseResult.error.format(),
        },
        requestId,
      });
    }

    // Extract headers (case-insensitive in Fastify)
    const authAlgo = request.headers["paypal-auth-algo"] as string | undefined;
    const certUrl = request.headers["paypal-cert-url"] as string | undefined;
    const transmissionId = request.headers["paypal-transmission-id"] as string | undefined;
    const transmissionSig = request.headers["paypal-transmission-sig"] as string | undefined;
    const transmissionTime = request.headers["paypal-transmission-time"] as string | undefined;

    // Log receipt safely without printing sensitive signature or headers
    request.log.info(
      {
        requestId,
        eventId: parseResult.data.id,
        eventType: parseResult.data.event_type,
        transmissionId,
      },
      "Incoming PayPal webhook event"
    );

    try {
      const result = await paymentOrderRepo.processWebhookEvent(
        db,
        {
          event: parseResult.data,
          headers: {
            authAlgo,
            certUrl,
            transmissionId,
            transmissionSig,
            transmissionTime,
          },
        },
        paypalService
      );

      const validated = WebhookProcessResponseSchema.parse(result);
      return reply.status(200).send(validated);
    } catch (err: unknown) {
      if (
        err instanceof CheckoutError ||
        (err &&
          typeof err === "object" &&
          ((err as any).name === "CheckoutError" || typeof (err as any).code === "string"))
      ) {
        const errorObj = err as any;
        const statusCode =
          errorObj.code === "WEBHOOK_SIGNATURE_VERIFICATION_FAILED" ||
          errorObj.code === "MISSING_WEBHOOK_HEADERS"
            ? 400
            : 500;

        request.log.warn(
          {
            requestId,
            code: errorObj.code,
            message: errorObj.message,
          },
          "PayPal webhook rejected"
        );

        return reply.status(statusCode).send({
          error: {
            code: errorObj.code,
            message: errorObj.message,
          },
          requestId,
        });
      }

      request.log.error({ err, requestId }, "Failed to process PayPal webhook event");
      return reply.status(500).send({
        error: {
          code: "INTERNAL_ERROR",
          message: "An internal error occurred while processing PayPal webhook.",
        },
        requestId,
      });
    }
  });
};
