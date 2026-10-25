import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { buildServer } from "../server.js";
import type { FastifyInstance } from "fastify";
import * as paymentOrderRepo from "../db/repositories/paymentOrderRepository.js";
import * as policyRepo from "../db/repositories/policyRepository.js";
import { CheckoutError } from "../db/repositories/checkoutProposalRepository.js";
import { PayPalNetworkError } from "../services/paypalService.js";
import { CreatePaymentOrderResponseSchema } from "@warrant/contracts";
import {
  paymentOrders,
  spendReservations,
  checkoutProposals,
} from "../db/schema.js";

describe("Payment Orders Routes & Repository (PayPal Sandbox Integration)", () => {
  let server: FastifyInstance;

  const validOwnerId = "11111111-1111-1111-1111-111111111111";
  const validProposalId = "22222222-2222-2222-2222-222222222222";
  const validReservationId = "33333333-3333-3333-3333-333333333333";
  const validOrderId = "44444444-4444-4444-4444-444444444444";
  const validPayPalOrderId = "5O190127TN364715T";

  const validOrderRecord = {
    id: validOrderId,
    ownerId: validOwnerId,
    proposalId: validProposalId,
    reservationId: validReservationId,
    provider: "PAYPAL_SANDBOX" as const,
    providerOrderId: validPayPalOrderId,
    idempotencyKey: `warrant:res:${validReservationId}`,
    status: "CREATED" as const,
    amountMinor: 4500,
    currency: "USD",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const validSuccessResponse = {
    order: validOrderRecord,
    paypalOrderId: validPayPalOrderId,
    reservationState: "RESERVED" as const,
    approvalUrl: `https://www.sandbox.paypal.com/checkoutnow?token=${validPayPalOrderId}`,
  };

  beforeAll(async () => {
    server = await buildServer({
      checkDb: async () => ({ configured: true, connected: false }),
    });
  });

  afterAll(async () => {
    await server.close();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================
  // HTTP ROUTE TESTS
  // ==========================================

  describe("POST /api/payment-orders", () => {
    const validPayload = {
      proposalId: validProposalId,
      reservationId: validReservationId,
    };

    it("rejects invalid request payload with 400 Bad Request", async () => {
      const response = await server.inject({
        method: "POST",
        url: "/api/payment-orders",
        payload: {
          proposalId: "invalid-uuid",
        },
      });

      expect(response.statusCode).toBe(400);
      const json = response.json();
      expect(json.error.code).toBe("BAD_REQUEST");
    });

    it("returns 404 when reservation is not found", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce(validOwnerId);
      vi.spyOn(paymentOrderRepo, "createPaymentOrder").mockRejectedValueOnce(
        new CheckoutError("RESERVATION_NOT_FOUND", "Spend reservation not found")
      );

      const response = await server.inject({
        method: "POST",
        url: "/api/payment-orders",
        payload: validPayload,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe("RESERVATION_NOT_FOUND");
    });

    it("returns 404 when proposal is not found", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce(validOwnerId);
      vi.spyOn(paymentOrderRepo, "createPaymentOrder").mockRejectedValueOnce(
        new CheckoutError("PROPOSAL_NOT_FOUND", "Checkout proposal not found")
      );

      const response = await server.inject({
        method: "POST",
        url: "/api/payment-orders",
        payload: validPayload,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe("PROPOSAL_NOT_FOUND");
    });

    it("returns 400 when proposal is not ALLOWed", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce(validOwnerId);
      vi.spyOn(paymentOrderRepo, "createPaymentOrder").mockRejectedValueOnce(
        new CheckoutError("PROPOSAL_NOT_ALLOWED", "Payment order creation requires an ALLOW decision")
      );

      const response = await server.inject({
        method: "POST",
        url: "/api/payment-orders",
        payload: validPayload,
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe("PROPOSAL_NOT_ALLOWED");
    });

    it("returns 409 Conflict when order creation is ambiguous", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce(validOwnerId);
      vi.spyOn(paymentOrderRepo, "createPaymentOrder").mockRejectedValueOnce(
        new CheckoutError(
          "ORDER_CREATION_AMBIGUOUS",
          "External order creation outcome is ambiguous due to network interruption."
        )
      );

      const response = await server.inject({
        method: "POST",
        url: "/api/payment-orders",
        payload: validPayload,
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe("ORDER_CREATION_AMBIGUOUS");
    });

    it("returns 503 DATABASE_UNAVAILABLE when database is in standby", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockRejectedValueOnce({
        code: "28P01",
        message: 'password authentication failed for user "postgres"',
      });

      const response = await server.inject({
        method: "POST",
        url: "/api/payment-orders",
        payload: validPayload,
      });

      expect(response.statusCode).toBe(503);
      expect(response.json().error.code).toBe("DATABASE_UNAVAILABLE");
    });

    it("creates payment order and returns 201 Created on valid ALLOW reservation", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce(validOwnerId);
      vi.spyOn(paymentOrderRepo, "createPaymentOrder").mockResolvedValueOnce(validSuccessResponse);

      const response = await server.inject({
        method: "POST",
        url: "/api/payment-orders",
        payload: validPayload,
      });

      expect(response.statusCode).toBe(201);
      const json = response.json();
      expect(CreatePaymentOrderResponseSchema.safeParse(json).success).toBe(true);
      expect(json.paypalOrderId).toBe(validPayPalOrderId);
      expect(json.reservationState).toBe("RESERVED");
      expect(json.approvalUrl).toBeDefined();
      expect(response.headers["x-request-id"]).toBeDefined();
    });

    it("POST /api/v1/payment-orders operates as a forward-compatible alias", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce(validOwnerId);
      vi.spyOn(paymentOrderRepo, "createPaymentOrder").mockResolvedValueOnce(validSuccessResponse);

      const response = await server.inject({
        method: "POST",
        url: "/api/v1/payment-orders",
        payload: validPayload,
      });

      expect(response.statusCode).toBe(201);
      const json = response.json();
      expect(json.paypalOrderId).toBe(validPayPalOrderId);
    });
  });

  describe("GET /api/payment-orders/:id", () => {
    it("returns 404 when order does not exist", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce(validOwnerId);
      vi.spyOn(paymentOrderRepo, "getPaymentOrder").mockResolvedValueOnce(null);

      const response = await server.inject({
        method: "GET",
        url: `/api/payment-orders/${validOrderId}`,
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe("ORDER_NOT_FOUND");
    });

    it("returns 200 with order details when found", async () => {
      vi.spyOn(policyRepo, "ensureDefaultUser").mockResolvedValueOnce(validOwnerId);
      vi.spyOn(paymentOrderRepo, "getPaymentOrder").mockResolvedValueOnce(validOrderRecord);

      const response = await server.inject({
        method: "GET",
        url: `/api/payment-orders/${validOrderId}`,
      });

      expect(response.statusCode).toBe(200);
      const json = response.json();
      expect(json.order.id).toBe(validOrderId);
      expect(json.order.providerOrderId).toBe(validPayPalOrderId);
    });
  });

  // ==========================================
  // REPOSITORY UNIT & ISOLATION TESTS
  // ==========================================

  describe("paymentOrderRepository.createPaymentOrder logic", () => {
    function createMockDb(setup: {
      reservation?: any;
      proposal?: any;
      existingOrders?: any[];
      transactionResult?: any[];
    }) {
      const updates: any[] = [];
      const inserts: any[] = [];

      const mockDb = {
        select: vi.fn().mockImplementation(() => ({
          from: vi.fn().mockImplementation((table: any) => ({
            where: vi.fn().mockImplementation(async () => {
              if (table === spendReservations) {
                return setup.reservation ? [setup.reservation] : [];
              }
              if (table === checkoutProposals) {
                return setup.proposal ? [setup.proposal] : [];
              }
              if (table === paymentOrders) {
                return setup.existingOrders ?? [];
              }
              return [];
            }),
          })),
        })),
        transaction: vi.fn().mockImplementation(async (callback: any) => {
          const tx = {
            insert: vi.fn().mockImplementation((table: any) => ({
              values: vi.fn().mockImplementation((vals: any) => {
                inserts.push({ table, vals });
                return {
                  returning: vi.fn().mockResolvedValue(setup.transactionResult ?? [vals]),
                };
              }),
            })),
            update: vi.fn().mockImplementation((table: any) => ({
              set: vi.fn().mockImplementation((setVals: any) => {
                updates.push({ table, setVals });
                return {
                  where: vi.fn().mockResolvedValue([]),
                };
              }),
            })),
          };
          return callback(tx);
        }),
        _updates: updates,
        _inserts: inserts,
      };

      return mockDb;
    }

    it("rejects when spend reservation owner does not match authenticated owner", async () => {
      const mockDb = createMockDb({
        reservation: {
          id: validReservationId,
          ownerId: "different-owner-uuid",
          proposalId: validProposalId,
          state: "ORDER_CREATION_PENDING",
        },
      });

      await expect(
        paymentOrderRepo.createPaymentOrder(
          mockDb as any,
          {
            reservationId: validReservationId,
            proposalId: validProposalId,
            ownerId: validOwnerId,
          },
          {} as any
        )
      ).rejects.toThrowError(/Spend reservation belongs to a different owner/);
    });

    it("rejects when proposal decision is not ALLOW", async () => {
      const mockDb = createMockDb({
        reservation: {
          id: validReservationId,
          ownerId: validOwnerId,
          proposalId: validProposalId,
          state: "ORDER_CREATION_PENDING",
        },
        proposal: {
          id: validProposalId,
          decision: "DENY",
        },
      });

      await expect(
        paymentOrderRepo.createPaymentOrder(
          mockDb as any,
          {
            reservationId: validReservationId,
            proposalId: validProposalId,
            ownerId: validOwnerId,
          },
          {} as any
        )
      ).rejects.toThrowError(/Payment order creation requires an ALLOW decision/);
    });

    it("idempotently returns existing order without invoking PayPal API", async () => {
      const mockDb = createMockDb({
        reservation: {
          id: validReservationId,
          ownerId: validOwnerId,
          proposalId: validProposalId,
          state: "RESERVED",
        },
        proposal: {
          id: validProposalId,
          decision: "ALLOW",
        },
        existingOrders: [
          {
            id: validOrderId,
            ownerId: validOwnerId,
            proposalId: validProposalId,
            reservationId: validReservationId,
            providerOrderId: validPayPalOrderId,
            idempotencyKey: `warrant:res:${validReservationId}`,
            status: "CREATED",
            amountMinor: 4500,
            currency: "USD",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });

      const mockPayPal = {
        createOrder: vi.fn(),
      };

      const result = await paymentOrderRepo.createPaymentOrder(
        mockDb as any,
        {
          reservationId: validReservationId,
          proposalId: validProposalId,
          ownerId: validOwnerId,
        },
        mockPayPal as any
      );

      expect(result.paypalOrderId).toBe(validPayPalOrderId);
      expect(mockPayPal.createOrder).not.toHaveBeenCalled();
    });

    it("transitions reservation to RECONCILIATION_HOLD and throws on ambiguous PayPal network timeout", async () => {
      const mockDb = createMockDb({
        reservation: {
          id: validReservationId,
          ownerId: validOwnerId,
          proposalId: validProposalId,
          state: "ORDER_CREATION_PENDING",
          amountMinor: 4500,
          currency: "USD",
        },
        proposal: {
          id: validProposalId,
          decision: "ALLOW",
        },
        existingOrders: [],
      });

      const mockPayPal = {
        createOrder: vi.fn().mockRejectedValue(
          new PayPalNetworkError("PayPal orders endpoint timed out", true)
        ),
      };

      try {
        await paymentOrderRepo.createPaymentOrder(
          mockDb as any,
          {
            reservationId: validReservationId,
            proposalId: validProposalId,
            ownerId: validOwnerId,
          },
          mockPayPal as any
        );
        expect.unreachable("Should have thrown CheckoutError");
      } catch (err: any) {
        expect(err.code).toBe("ORDER_CREATION_AMBIGUOUS");
      }

      // Verify that reservation was updated to RECONCILIATION_HOLD
      expect(mockDb._updates).toHaveLength(1);
      expect(mockDb._updates[0].setVals.state).toBe("RECONCILIATION_HOLD");
      // Verify that an UNKNOWN_REQUIRES_RECONCILIATION record was inserted
      expect(mockDb._inserts).toHaveLength(1);
      expect(mockDb._inserts[0].vals.status).toBe("UNKNOWN_REQUIRES_RECONCILIATION");
    });

    it("calls PayPal with authoritative parameters, creates order, and transitions reservation to RESERVED", async () => {
      const mockDb = createMockDb({
        reservation: {
          id: validReservationId,
          ownerId: validOwnerId,
          proposalId: validProposalId,
          state: "ORDER_CREATION_PENDING",
          amountMinor: 4500,
          currency: "USD",
        },
        proposal: {
          id: validProposalId,
          decision: "ALLOW",
        },
        existingOrders: [],
        transactionResult: [
          {
            id: validOrderId,
            ownerId: validOwnerId,
            proposalId: validProposalId,
            reservationId: validReservationId,
            providerOrderId: validPayPalOrderId,
            idempotencyKey: `warrant:res:${validReservationId}`,
            status: "CREATED",
            amountMinor: 4500,
            currency: "USD",
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        ],
      });

      const mockPayPal = {
        createOrder: vi.fn().mockResolvedValue({
          id: validPayPalOrderId,
          status: "CREATED",
          approvalUrl: "https://sandbox.paypal.com/approve",
        }),
      };

      const result = await paymentOrderRepo.createPaymentOrder(
        mockDb as any,
        {
          reservationId: validReservationId,
          proposalId: validProposalId,
          ownerId: validOwnerId,
        },
        mockPayPal as any
      );

      // Verify PayPal called with exact authoritative params and idempotency key
      expect(mockPayPal.createOrder).toHaveBeenCalledWith({
        reservationId: validReservationId,
        amountMinor: 4500,
        currency: "USD",
        idempotencyKey: `warrant:res:${validReservationId}`,
      });

      // Verify DB updates
      expect(mockDb._updates).toHaveLength(1);
      expect(mockDb._updates[0].setVals.state).toBe("RESERVED");
      const orderInserts = mockDb._inserts.filter((i: any) => i.table === paymentOrders);
      expect(orderInserts).toHaveLength(1);
      expect(orderInserts[0].vals.status).toBe("CREATED");
      expect(orderInserts[0].vals.providerOrderId).toBe(validPayPalOrderId);

      // Verify return structure
      expect(result.paypalOrderId).toBe(validPayPalOrderId);
      expect(result.reservationState).toBe("RESERVED");
      expect(result.approvalUrl).toBe("https://sandbox.paypal.com/approve");
    });
  });
});
