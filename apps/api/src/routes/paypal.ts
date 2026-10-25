import type { FastifyPluginAsync, FastifyRequest, FastifyReply } from "fastify";
import {
  PayPalAuthStatusResponseSchema,
  PayPalTransactionListResponseSchema,
  PayPalSyncResponseSchema,
  CreateTestSandboxOrderRequestSchema,
  CreateTestSandboxOrderResponseSchema,
  type PayPalTransaction,
} from "@warrant/contracts";
import { db } from "../db/index.js";
import * as policyRepo from "../db/repositories/policyRepository.js";
import * as paymentOrderRepo from "../db/repositories/paymentOrderRepository.js";
import { PayPalService, defaultPayPalService } from "../services/paypalService.js";
import { extractRequestId, isDbConnectionError } from "./routeUtils.js";

export interface PayPalRoutesOptions {
  paypalService?: PayPalService;
}

export const paypalRoutes: FastifyPluginAsync<PayPalRoutesOptions> = async (
  fastify,
  opts
) => {
  const paypalService = opts.paypalService ?? defaultPayPalService;

  // 1. GET /auth-status - Probes PayPal Sandbox credentials and connectivity
  fastify.get("/auth-status", async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    try {
      const status = await paypalService.getAuthStatus();
      const validated = PayPalAuthStatusResponseSchema.parse(status);
      return reply.status(200).send(validated);
    } catch (err: unknown) {
      request.log.error({ err, requestId }, "Failed to get PayPal Sandbox auth status");
      return reply.status(500).send({
        error: {
          code: "PAYPAL_AUTH_STATUS_ERROR",
          message: "Failed to evaluate PayPal Sandbox authentication status.",
        },
        requestId,
      });
    }
  });

  // 2. GET /transactions - Retrieves transaction history
  fastify.get(
    "/transactions",
    async (
      request: FastifyRequest<{
        Querystring: {
          startDate?: string;
          endDate?: string;
          page?: string;
          pageSize?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const requestId = extractRequestId(request);
      reply.header("x-request-id", requestId);

      const query = request.query || {};
      const page = query.page ? parseInt(query.page, 10) : 1;
      const pageSize = query.pageSize ? parseInt(query.pageSize, 10) : 20;

      try {
        let ownerId: string | undefined;
        try {
          ownerId = await policyRepo.ensureDefaultUser(db);
        } catch {
          // Non-blocking in DB standby mode
        }

        // Attempt retrieval from PayPal Transaction Search API
        let searchResult = await paypalService.listTransactions({
          startDate: query.startDate,
          endDate: query.endDate,
          page,
          pageSize,
        });

        // If search API succeeded and returned transactions, sync with DB ledger
        if (searchResult.transactions.length > 0) {
          try {
            const syncResult = await paymentOrderRepo.syncPayPalTransactions(
              db,
              searchResult.transactions,
              ownerId
            );
            searchResult = {
              ...searchResult,
              transactions: syncResult.transactions,
            };
          } catch {
            // DB sync non-blocking
          }
          const validated = PayPalTransactionListResponseSchema.parse(searchResult);
          return reply.status(200).send(validated);
        }

        // If search API is empty or requires permission, fallback to DB-synchronized orders
        try {
          const localOrders = await paymentOrderRepo.listPaymentOrders(db, {
            ownerId,
            limit: pageSize,
          });

          if (localOrders.orders.length > 0) {
            const mappedTransactions: PayPalTransaction[] = localOrders.orders.map(
              paymentOrderRepo.mapPaymentOrderToPayPalTransaction
            );

            const fallbackResult = {
              transactions: mappedTransactions,
              total: localOrders.total,
              startDate: searchResult.startDate,
              endDate: searchResult.endDate,
              source: "DATABASE_SYNCHRONIZED_ORDERS" as const,
              permissionRequired: searchResult.permissionRequired,
              permissionNote: searchResult.permissionNote,
            };

            const validated = PayPalTransactionListResponseSchema.parse(fallbackResult);
            return reply.status(200).send(validated);
          }
        } catch (dbErr) {
          if (!isDbConnectionError(dbErr)) {
            request.log.warn({ dbErr, requestId }, "Could not load local orders for fallback");
          }
        }

        // Return empty result cleanly with permission advice if applicable
        const validated = PayPalTransactionListResponseSchema.parse(searchResult);
        return reply.status(200).send(validated);
      } catch (err: unknown) {
        request.log.error({ err, requestId }, "Failed to retrieve PayPal transactions");
        return reply.status(500).send({
          error: {
            code: "TRANSACTION_FETCH_FAILED",
            message: "Failed to retrieve PayPal transactions.",
          },
          requestId,
        });
      }
    }
  );

  // 3. POST /sync - Force synchronization of PayPal orders & transactions
  fastify.post("/sync", async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    try {
      let ownerId: string | undefined;
      try {
        ownerId = await policyRepo.ensureDefaultUser(db);
      } catch {
        // standby mode
      }

      // Check transactions from PayPal API
      const searchResult = await paypalService.listTransactions();
      let syncedCount = 0;
      let updatedCount = 0;
      let source = searchResult.source;

      if (searchResult.transactions.length > 0) {
        const syncRes = await paymentOrderRepo.syncPayPalTransactions(
          db,
          searchResult.transactions,
          ownerId
        );
        syncedCount = syncRes.syncedCount;
        updatedCount = syncRes.updatedCount;
      } else {
        // Also probe existing database orders against PayPal Orders v2 API
        try {
          const localOrders = await paymentOrderRepo.listPaymentOrders(db, {
            ownerId,
            limit: 50,
          });

          for (const order of localOrders.orders) {
            if (order.providerOrderId) {
              try {
                const remoteOrder = await paypalService.getOrder(order.providerOrderId);
                if (
                  remoteOrder.status === "COMPLETED" &&
                  order.status !== "CAPTURED"
                ) {
                  await paymentOrderRepo.reconcilePaymentOrder(
                    db,
                    { orderId: order.id, ownerId: order.ownerId },
                    paypalService
                  );
                  updatedCount++;
                }
                syncedCount++;
              } catch {
                // Individual order probe non-blocking
              }
            }
          }
          source = "DATABASE_SYNCHRONIZED_ORDERS";
        } catch {
          // standby non-blocking
        }
      }

      const responsePayload = {
        success: true,
        syncedCount,
        updatedCount,
        source,
        message: searchResult.permissionRequired
          ? `Synchronized ${syncedCount} orders with PayPal Sandbox. Note: Enable 'Transaction Search' in PayPal Developer Dashboard for full reporting history.`
          : `Successfully synchronized ${syncedCount} transactions with PayPal Sandbox.`,
      };

      const validated = PayPalSyncResponseSchema.parse(responsePayload);
      return reply.status(200).send(validated);
    } catch (err: unknown) {
      request.log.error({ err, requestId }, "Failed to synchronize PayPal transactions");
      return reply.status(500).send({
        error: {
          code: "SYNC_FAILED",
          message: "Failed to synchronize with PayPal Sandbox.",
        },
        requestId,
      });
    }
  });

  // 4. POST /test-order - Create a test sandbox order for verification
  fastify.post("/test-order", async (request: FastifyRequest, reply: FastifyReply) => {
    const requestId = extractRequestId(request);
    reply.header("x-request-id", requestId);

    const parseResult = CreateTestSandboxOrderRequestSchema.safeParse(request.body || {});
    if (!parseResult.success) {
      return reply.status(400).send({
        error: {
          code: "BAD_REQUEST",
          message: "Invalid test sandbox order parameters.",
          details: parseResult.error.format(),
        },
        requestId,
      });
    }

    try {
      const order = await paypalService.createTestSandboxOrder(parseResult.data);
      const validated = CreateTestSandboxOrderResponseSchema.parse(order);
      return reply.status(201).send(validated);
    } catch (err: any) {
      request.log.error({ err, requestId }, "Failed to create test sandbox order");
      return reply.status(502).send({
        error: {
          code: err.code || "PAYPAL_TEST_ORDER_FAILED",
          message: err.message || "Failed to create test order on PayPal Sandbox.",
        },
        requestId,
      });
    }
  });
};
