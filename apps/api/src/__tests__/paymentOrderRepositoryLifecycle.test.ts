import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  confirmBuyerApproval,
  cancelPaymentOrder,
  capturePaymentOrder,
  reconcilePaymentOrder,
  processWebhookEvent,
  canTransitionPaymentStatus,
  syncPayPalTransactions,
} from "../db/repositories/paymentOrderRepository.js";
import { CheckoutError } from "../db/repositories/checkoutProposalRepository.js";
import { PayPalNetworkError } from "../services/paypalService.js";
import {
  paymentOrders,
  spendReservations,
  checkoutProposals,
  approvals,
  webhookEvents,
} from "../db/schema.js";

describe("PaymentOrderRepository Comprehensive Lifecycle Tests (Phase 1)", () => {
  const validOwnerId = "11111111-1111-1111-1111-111111111111";
  const validOrderId = "44444444-4444-4444-4444-444444444444";
  const validProposalId = "22222222-2222-2222-2222-222222222222";
  const validReservationId = "33333333-3333-3333-3333-333333333333";
  const validApprovalId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
  const validPolicyHash = "93258bd2e0e10160490d8d690e79028c1886f96de0806b749e1822619a3cbbb5";
  const validPayPalOrderId = "7SY090644K3801703";

  function createMockDb(setup: {
    orders?: any[];
    reservations?: any[];
    proposals?: any[];
    approvals?: any[];
    webhookEvents?: any[];
  }) {
    const updates: any[] = [];
    const inserts: any[] = [];

    const mockDb: any = {
      _updates: updates,
      _inserts: inserts,
      select: vi.fn().mockImplementation(() => ({
        from: vi.fn().mockImplementation((table: any) => {
          const getData = () => {
            if (table === paymentOrders) return setup.orders ?? [];
            if (table === spendReservations) return setup.reservations ?? [];
            if (table === checkoutProposals) return setup.proposals ?? [];
            if (table === approvals) return setup.approvals ?? [];
            if (table === webhookEvents) return setup.webhookEvents ?? [];
            return [];
          };

          const queryObj: any = {
            $dynamic: vi.fn().mockReturnThis(),
            where: vi.fn().mockImplementation(async (clause: any) => {
              if (table === paymentOrders) {
                const hasCaptureId = clause?.queryChunks?.some((c: any) => c?.name === "capture_id");
                const hasOrderId = clause?.queryChunks?.some((c: any) => c?.name === "provider_order_id" || c?.name === "reservation_id");
                if (hasCaptureId && !hasOrderId) {
                  return (setup.orders ?? []).filter((o: any) => Boolean(o.captureId));
                }
                return setup.orders ?? [];
              }
              return getData();
            }),
            orderBy: vi.fn().mockImplementation(() => ({
              limit: vi.fn().mockImplementation(async () => getData()),
            })),
          };
          return queryObj;
        }),
      })),
      update: vi.fn().mockImplementation((table: any) => ({
        set: vi.fn().mockImplementation((values: any) => ({
          where: vi.fn().mockImplementation(() => {
            updates.push({ table, values });
            const base = setup.orders?.[0] ?? setup.reservations?.[0] ?? {};
            const res = [{ ...base, ...values }];
            const promise: any = Promise.resolve(res);
            promise.returning = vi.fn().mockResolvedValue(res);
            return promise;
          }),
        })),
      })),
      insert: vi.fn().mockImplementation((table: any) => ({
        values: vi.fn().mockImplementation((val: any) => {
          inserts.push({ table, val });
          return {
            returning: vi.fn().mockImplementation(async () => [val]),
          };
        }),
      })),
      transaction: vi.fn().mockImplementation(async (cb: any) => {
        return cb(mockDb);
      }),
    };

    return mockDb;
  }

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ==========================================
  // STATE MACHINE VALIDATION
  // ==========================================
  describe("State Machine Transition Rules", () => {
    it("permits legal payment status transitions", () => {
      expect(canTransitionPaymentStatus("CREATED", "APPROVED")).toBe(true);
      expect(canTransitionPaymentStatus("APPROVED", "CAPTURED")).toBe(true);
      expect(canTransitionPaymentStatus("APPROVED", "CAPTURE_PENDING")).toBe(true);
      expect(canTransitionPaymentStatus("CAPTURE_PENDING", "CAPTURED")).toBe(true);
      expect(canTransitionPaymentStatus("CREATED", "CANCELLED")).toBe(true);
      expect(canTransitionPaymentStatus("APPROVED", "CANCELLED")).toBe(true);
    });

    it("forbids illegal regressions from terminal states", () => {
      expect(canTransitionPaymentStatus("CAPTURED", "APPROVED")).toBe(false);
      expect(canTransitionPaymentStatus("CAPTURED", "CREATED")).toBe(false);
      expect(canTransitionPaymentStatus("CANCELLED", "APPROVED")).toBe(false);
      expect(canTransitionPaymentStatus("CANCELLED", "CAPTURED")).toBe(false);
    });
  });

  // ==========================================
  // BUYER APPROVAL
  // ==========================================
  describe("confirmBuyerApproval", () => {
    it("updates status to APPROVED when PayPal confirms APPROVED", async () => {
      const order = {
        id: validOrderId,
        ownerId: validOwnerId,
        reservationId: validReservationId,
        providerOrderId: validPayPalOrderId,
        status: "CREATED",
        amountMinor: 4500,
        currency: "USD",
      };
      const res = { id: validReservationId, state: "RESERVED" };
      const db = createMockDb({ orders: [order], reservations: [res] });

      const mockPayPal: any = {
        getOrder: vi.fn().mockResolvedValueOnce({
          id: validPayPalOrderId,
          status: "APPROVED",
          payer: { payerId: "PAYER-123" },
        }),
      };

      const result = await confirmBuyerApproval(
        db,
        { orderId: validOrderId, ownerId: validOwnerId },
        mockPayPal
      );

      expect(result.order.status).toBe("APPROVED");
      expect(result.nextAction).toBe("CAPTURE");
      expect(mockPayPal.getOrder).toHaveBeenCalledWith(validPayPalOrderId);
    });

    it("returns existing status idempotently when already APPROVED", async () => {
      const order = {
        id: validOrderId,
        ownerId: validOwnerId,
        reservationId: validReservationId,
        providerOrderId: validPayPalOrderId,
        status: "APPROVED",
        amountMinor: 4500,
        currency: "USD",
      };
      const res = { id: validReservationId, state: "RESERVED" };
      const db = createMockDb({ orders: [order], reservations: [res] });
      const mockPayPal: any = { getOrder: vi.fn() };

      const result = await confirmBuyerApproval(
        db,
        { orderId: validOrderId, ownerId: validOwnerId },
        mockPayPal
      );

      expect(result.order.status).toBe("APPROVED");
      expect(result.nextAction).toBe("CAPTURE");
      expect(mockPayPal.getOrder).not.toHaveBeenCalled();
    });

    it("rejects if buyer has not approved on PayPal", async () => {
      const order = {
        id: validOrderId,
        ownerId: validOwnerId,
        reservationId: validReservationId,
        providerOrderId: validPayPalOrderId,
        status: "CREATED",
        amountMinor: 4500,
        currency: "USD",
      };
      const res = { id: validReservationId, state: "RESERVED" };
      const db = createMockDb({ orders: [order], reservations: [res] });

      const mockPayPal: any = {
        getOrder: vi.fn().mockResolvedValueOnce({
          id: validPayPalOrderId,
          status: "CREATED", // still unapproved
        }),
      };

      await expect(
        confirmBuyerApproval(db, { orderId: validOrderId, ownerId: validOwnerId }, mockPayPal)
      ).rejects.toThrowError(CheckoutError);
    });
  });

  // ==========================================
  // ORDER CANCELLATION
  // ==========================================
  describe("cancelPaymentOrder", () => {
    it("cancels order and safely releases reservation if uncaptured", async () => {
      const order = {
        id: validOrderId,
        ownerId: validOwnerId,
        reservationId: validReservationId,
        providerOrderId: validPayPalOrderId,
        status: "APPROVED",
        amountMinor: 4500,
        currency: "USD",
      };
      const res = { id: validReservationId, state: "RESERVED" };
      const db = createMockDb({ orders: [order], reservations: [res] });

      const mockPayPal: any = {
        getOrder: vi.fn().mockResolvedValueOnce({
          id: validPayPalOrderId,
          status: "APPROVED",
        }),
      };

      const result = await cancelPaymentOrder(
        db,
        { orderId: validOrderId, ownerId: validOwnerId },
        mockPayPal
      );

      expect(result.cancelled).toBe(true);
      expect(result.reservationState).toBe("RELEASED");
    });

    it("prevents cancelling already captured order", async () => {
      const order = {
        id: validOrderId,
        ownerId: validOwnerId,
        reservationId: validReservationId,
        providerOrderId: validPayPalOrderId,
        status: "CAPTURED",
        amountMinor: 4500,
        currency: "USD",
      };
      const res = { id: validReservationId, state: "COMMITTED" };
      const db = createMockDb({ orders: [order], reservations: [res] });
      const mockPayPal: any = { getOrder: vi.fn() };

      await expect(
        cancelPaymentOrder(db, { orderId: validOrderId, ownerId: validOwnerId }, mockPayPal)
      ).rejects.toThrowError(/Order has already been captured/);
    });

    it("rejects cancellation if order was concurrently captured before cancellation transaction commits", async () => {
      const order = {
        id: validOrderId,
        ownerId: validOwnerId,
        reservationId: validReservationId,
        providerOrderId: validPayPalOrderId,
        status: "APPROVED",
        amountMinor: 4500,
        currency: "USD",
      };
      const res = { id: validReservationId, state: "RESERVED" };
      const db = createMockDb({ orders: [order], reservations: [res] });

      // Mock update to return [] simulating that where clause filtered out the concurrently captured row
      db.update = vi.fn().mockImplementation(() => ({
        set: vi.fn().mockImplementation(() => ({
          where: vi.fn().mockImplementation(() => {
            const promise: any = Promise.resolve([]);
            promise.returning = vi.fn().mockResolvedValue([]);
            return promise;
          }),
        })),
      }));

      const mockPayPal: any = {
        getOrder: vi.fn().mockResolvedValueOnce({
          id: validPayPalOrderId,
          status: "APPROVED",
        }),
      };

      await expect(
        cancelPaymentOrder(db, { orderId: validOrderId, ownerId: validOwnerId }, mockPayPal)
      ).rejects.toThrowError(/Order has already been captured or is pending capture/);
    });
  });

  // ==========================================
  // SERVER-SIDE CAPTURE
  // ==========================================
  describe("capturePaymentOrder", () => {
    const validApproval = {
      id: validApprovalId,
      policyHash: validPolicyHash,
      spendLimitMinor: 6000,
      currency: "USD",
      revokedAt: null,
      expiresAt: new Date(Date.now() + 86400000), // active
    };
    const validProposal = {
      id: validProposalId,
      policyHash: validPolicyHash,
      decision: "ALLOW",
    };
    const validReservation = {
      id: validReservationId,
      approvalId: validApprovalId,
      proposalId: validProposalId,
      amountMinor: 4500,
      currency: "USD",
      state: "RESERVED",
    };
    const validOrder = {
      id: validOrderId,
      ownerId: validOwnerId,
      reservationId: validReservationId,
      proposalId: validProposalId,
      providerOrderId: validPayPalOrderId,
      status: "APPROVED",
      amountMinor: 4500,
      currency: "USD",
    };

    it("executes capture, updates status to CAPTURED, and commits reservation", async () => {
      const db = createMockDb({
        orders: [validOrder],
        reservations: [validReservation],
        proposals: [validProposal],
        approvals: [validApproval],
      });

      const mockPayPal: any = {
        captureOrder: vi.fn().mockResolvedValueOnce({
          orderId: validPayPalOrderId,
          orderStatus: "COMPLETED",
          captureId: "CAP-001",
          captureStatus: "COMPLETED",
          amount: { currencyCode: "USD", value: "45.00" },
        }),
      };

      const result = await capturePaymentOrder(
        db,
        { orderId: validOrderId, ownerId: validOwnerId },
        mockPayPal
      );

      expect(result.status).toBe("CAPTURED");
      expect(result.reservationState).toBe("COMMITTED");
      expect(result.captureId).toBe("CAP-001");
      expect(mockPayPal.captureOrder).toHaveBeenCalledWith({
        orderId: validPayPalOrderId,
        idempotencyKey: `warrant:cap:${validOrderId}`,
      });
    });

    it("returns existing capture idempotently if already captured", async () => {
      const capturedOrder = {
        ...validOrder,
        status: "CAPTURED",
        captureId: "CAP-PREV",
      };
      const db = createMockDb({
        orders: [capturedOrder],
        reservations: [{ ...validReservation, state: "COMMITTED" }],
        proposals: [validProposal],
        approvals: [validApproval],
      });
      const mockPayPal: any = { captureOrder: vi.fn() };

      const result = await capturePaymentOrder(
        db,
        { orderId: validOrderId, ownerId: validOwnerId },
        mockPayPal
      );

      expect(result.status).toBe("CAPTURED");
      expect(result.captureId).toBe("CAP-PREV");
      expect(mockPayPal.captureOrder).not.toHaveBeenCalled();
    });

    it("fails closed and holds reservation on ambiguous capture network timeout", async () => {
      const db = createMockDb({
        orders: [validOrder],
        reservations: [validReservation],
        proposals: [validProposal],
        approvals: [validApproval],
      });

      const mockPayPal: any = {
        captureOrder: vi.fn().mockRejectedValueOnce(
          new PayPalNetworkError("Capture timed out", true)
        ),
      };

      await expect(
        capturePaymentOrder(db, { orderId: validOrderId, ownerId: validOwnerId }, mockPayPal)
      ).rejects.toThrowError(CheckoutError);

      // Verify order set to UNKNOWN_REQUIRES_RECONCILIATION and reservation on RECONCILIATION_HOLD
      const orderUpdate = db._updates.find((u: any) => u.table === paymentOrders);
      expect(orderUpdate.values.status).toBe("UNKNOWN_REQUIRES_RECONCILIATION");

      const resUpdate = db._updates.find((u: any) => u.table === spendReservations);
      expect(resUpdate.values.state).toBe("RECONCILIATION_HOLD");
    });

    it("rejects capture if approval has been revoked", async () => {
      const revokedApproval = { ...validApproval, revokedAt: new Date() };
      const db = createMockDb({
        orders: [validOrder],
        reservations: [validReservation],
        proposals: [validProposal],
        approvals: [revokedApproval],
      });
      const mockPayPal: any = { captureOrder: vi.fn() };

      await expect(
        capturePaymentOrder(db, { orderId: validOrderId, ownerId: validOwnerId }, mockPayPal)
      ).rejects.toThrowError(/Approval has been revoked/);
      expect(mockPayPal.captureOrder).not.toHaveBeenCalled();
    });

    it("rejects capture if approval has expired", async () => {
      const expiredApproval = { ...validApproval, expiresAt: new Date(Date.now() - 1000) };
      const db = createMockDb({
        orders: [validOrder],
        reservations: [validReservation],
        proposals: [validProposal],
        approvals: [expiredApproval],
      });
      const mockPayPal: any = { captureOrder: vi.fn() };

      await expect(
        capturePaymentOrder(db, { orderId: validOrderId, ownerId: validOwnerId }, mockPayPal)
      ).rejects.toThrowError(/Approval has expired/);
      expect(mockPayPal.captureOrder).not.toHaveBeenCalled();
    });

    it("rejects capture if policy hash does not match", async () => {
      const mismatchedProposal = { ...validProposal, policyHash: "0".repeat(64) };
      const db = createMockDb({
        orders: [validOrder],
        reservations: [validReservation],
        proposals: [mismatchedProposal],
        approvals: [validApproval],
      });
      const mockPayPal: any = { captureOrder: vi.fn() };

      await expect(
        capturePaymentOrder(db, { orderId: validOrderId, ownerId: validOwnerId }, mockPayPal)
      ).rejects.toThrowError(/POLICY_HASH_MISMATCH/);
    });
  });

  // ==========================================
  // RECONCILIATION
  // ==========================================
  describe("reconcilePaymentOrder", () => {
    it("reconciles remote COMPLETED order to CAPTURED and commits reservation", async () => {
      const order = {
        id: validOrderId,
        ownerId: validOwnerId,
        reservationId: validReservationId,
        providerOrderId: validPayPalOrderId,
        status: "APPROVED",
        amountMinor: 4500,
        currency: "USD",
      };
      const res = { id: validReservationId, state: "RESERVED" };
      const db = createMockDb({ orders: [order], reservations: [res] });

      const mockPayPal: any = {
        getOrder: vi.fn().mockResolvedValueOnce({
          id: validPayPalOrderId,
          status: "COMPLETED",
          purchaseUnits: [
            {
              payments: {
                captures: [{ id: "CAP-REC-01", status: "COMPLETED" }],
              },
            },
          ],
        }),
      };

      const result = await reconcilePaymentOrder(
        db,
        { orderId: validOrderId, ownerId: validOwnerId },
        mockPayPal
      );

      expect(result.reconciled).toBe(true);
      expect(result.order.status).toBe("CAPTURED");
      expect(result.reservationState).toBe("COMMITTED");
    });

    it("detects settlement amount discrepancy during reconcile and transitions to RECONCILIATION_HOLD", async () => {
      const order = {
        id: validOrderId,
        ownerId: validOwnerId,
        reservationId: validReservationId,
        providerOrderId: validPayPalOrderId,
        status: "APPROVED",
        amountMinor: 4500, // $45.00
        currency: "USD",
      };
      const res = { id: validReservationId, state: "RESERVED" };
      const db = createMockDb({ orders: [order], reservations: [res] });

      const mockPayPal: any = {
        getOrder: vi.fn().mockResolvedValueOnce({
          id: validPayPalOrderId,
          status: "COMPLETED",
          purchaseUnits: [
            {
              payments: {
                captures: [
                  {
                    id: "CAP-REC-DIFF",
                    status: "COMPLETED",
                    amount: { value: "99.00", currency_code: "USD" }, // Discrepancy: $99 vs $45
                  },
                ],
              },
            },
          ],
        }),
      };

      const result = await reconcilePaymentOrder(
        db,
        { orderId: validOrderId, ownerId: validOwnerId },
        mockPayPal
      );

      expect(result.reconciled).toBe(false);
      expect(result.reservationState).toBe("RECONCILIATION_HOLD");
      expect(result.notes).toContain("Reconciliation exception: Remote settlement amount");
      expect(result.notes).toContain("RECONCILIATION_HOLD");

      const orderUpdate = db._updates.find((u: any) => u.table === paymentOrders);
      expect(orderUpdate.values.status).toBe("UNKNOWN_REQUIRES_RECONCILIATION");
      const resUpdate = db._updates.find((u: any) => u.table === spendReservations);
      expect(resUpdate.values.state).toBe("RECONCILIATION_HOLD");
    });
  });

  // ==========================================
  // WEBHOOK DEDUPLICATION & PROCESSING
  // ==========================================
  describe("processWebhookEvent", () => {
    const validHeaders = {
      authAlgo: "SHA256withRSA",
      certUrl: "https://api.sandbox.paypal.com/cert",
      transmissionId: "trans-1",
      transmissionSig: "sig-1",
      transmissionTime: "2026-10-19T14:00:00Z",
    };

    const mockEvent = {
      id: "WH-EVT-100",
      event_version: "1.0",
      create_time: "2026-10-19T14:00:00Z",
      resource_type: "capture",
      event_type: "PAYMENT.CAPTURE.COMPLETED",
      resource: {
        id: "CAP-WH-01",
        status: "COMPLETED",
        supplementary_data: { related_ids: { order_id: validPayPalOrderId } },
      },
    };

    it("verifies signature and processes unrecorded event", async () => {
      const order = {
        id: validOrderId,
        providerOrderId: validPayPalOrderId,
        reservationId: validReservationId,
        status: "APPROVED",
      };
      const res = { id: validReservationId, state: "RESERVED" };
      const db = createMockDb({
        orders: [order],
        reservations: [res],
        webhookEvents: [], // not yet seen
      });

      const mockPayPal: any = {
        verifyWebhookSignature: vi.fn().mockResolvedValueOnce(true),
      };

      const result = await processWebhookEvent(
        db,
        { event: mockEvent, headers: validHeaders },
        mockPayPal
      );

      expect(result.received).toBe(true);
      expect(result.duplicate).toBeUndefined();
      expect(result.actionTaken).toBe("PAYMENT_CAPTURED_AND_COMMITTED");
      expect(mockPayPal.verifyWebhookSignature).toHaveBeenCalled();

      // Confirmed stored in webhookEvents
      const eventInsert = db._inserts.find((i: any) => i.table === webhookEvents);
      expect(eventInsert.val.eventId).toBe("WH-EVT-100");
    });

    it("short-circuits duplicate event without reprocessing", async () => {
      const db = createMockDb({
        webhookEvents: [{ eventId: "WH-EVT-100" }], // already seen
      });

      const mockPayPal: any = {
        verifyWebhookSignature: vi.fn().mockResolvedValueOnce(true),
      };

      const result = await processWebhookEvent(
        db,
        { event: mockEvent, headers: validHeaders },
        mockPayPal
      );

      expect(result.received).toBe(true);
      expect(result.duplicate).toBe(true);
      expect(result.actionTaken).toBe("DUPLICATE_EVENT_IGNORED");
      expect(db._updates.length).toBe(0); // zero state updates on duplicate
    });

    it("rejects unverified event when signature verification fails", async () => {
      const db = createMockDb({ webhookEvents: [] });
      const mockPayPal: any = {
        verifyWebhookSignature: vi.fn().mockResolvedValueOnce(false),
      };

      await expect(
        processWebhookEvent(db, { event: mockEvent, headers: validHeaders }, mockPayPal)
      ).rejects.toThrowError(/signature verification failed/);
    });

    it("processes PAYMENT.CAPTURE.DENIED when captureId is not yet on local order", async () => {
      const order = {
        id: validOrderId,
        providerOrderId: validPayPalOrderId,
        reservationId: validReservationId,
        status: "APPROVED",
        captureId: null,
      };
      const res = { id: validReservationId, state: "RESERVED" };
      const db = createMockDb({
        orders: [order],
        reservations: [res],
        webhookEvents: [],
      });

      const deniedEvent = {
        id: "WH-EVT-DENIED-1",
        event_version: "1.0",
        create_time: "2026-10-19T14:10:00Z",
        resource_type: "capture",
        event_type: "PAYMENT.CAPTURE.DENIED",
        resource: {
          id: "CAP-DENIED-99",
          status: "DENIED",
          supplementary_data: { related_ids: { order_id: validPayPalOrderId } },
        },
      };

      const mockPayPal: any = {
        verifyWebhookSignature: vi.fn().mockResolvedValueOnce(true),
      };

      const result = await processWebhookEvent(
        db,
        { event: deniedEvent, headers: validHeaders },
        mockPayPal
      );

      expect(result.received).toBe(true);
      expect(result.actionTaken).toBe("CAPTURE_DENIED_HOLD");
      const orderUpdate = db._updates.find((u: any) => u.table === paymentOrders);
      expect(orderUpdate.values.status).toBe("FAILED");
      const resUpdate = db._updates.find((u: any) => u.table === spendReservations);
      expect(resUpdate.values.state).toBe("RECONCILIATION_HOLD");
    });

    it("processes PAYMENT.CAPTURE.PENDING when captureId is not yet on local order", async () => {
      const order = {
        id: validOrderId,
        providerOrderId: validPayPalOrderId,
        reservationId: validReservationId,
        status: "APPROVED",
        captureId: null,
      };
      const res = { id: validReservationId, state: "RESERVED" };
      const db = createMockDb({
        orders: [order],
        reservations: [res],
        webhookEvents: [],
      });

      const pendingEvent = {
        id: "WH-EVT-PENDING-1",
        event_version: "1.0",
        create_time: "2026-10-19T14:15:00Z",
        resource_type: "capture",
        event_type: "PAYMENT.CAPTURE.PENDING",
        resource: {
          id: "CAP-PEND-99",
          status: "PENDING",
          supplementary_data: { related_ids: { order_id: validPayPalOrderId } },
        },
      };

      const mockPayPal: any = {
        verifyWebhookSignature: vi.fn().mockResolvedValueOnce(true),
      };

      const result = await processWebhookEvent(
        db,
        { event: pendingEvent, headers: validHeaders },
        mockPayPal
      );

      expect(result.received).toBe(true);
      expect(result.actionTaken).toBe("CAPTURE_MARKED_PENDING");
      const orderUpdate = db._updates.find((u: any) => u.table === paymentOrders);
      expect(orderUpdate.values.status).toBe("CAPTURE_PENDING");
    });

    it("ignores out-of-order PAYMENT.CAPTURE.DENIED when order is already CAPTURED to prevent terminal state regression", async () => {
      const capturedOrder = {
        id: validOrderId,
        providerOrderId: validPayPalOrderId,
        reservationId: validReservationId,
        status: "CAPTURED", // Terminal state
        captureId: "CAP-FINAL-01",
      };
      const committedRes = { id: validReservationId, state: "COMMITTED" };
      const db = createMockDb({
        orders: [capturedOrder],
        reservations: [committedRes],
        webhookEvents: [],
      });

      const lateDeniedEvent = {
        id: "WH-EVT-LATE-DENIED",
        event_version: "1.0",
        create_time: "2026-10-19T14:20:00Z",
        resource_type: "capture",
        event_type: "PAYMENT.CAPTURE.DENIED",
        resource: {
          id: "CAP-FINAL-01",
          status: "DENIED",
          supplementary_data: { related_ids: { order_id: validPayPalOrderId } },
        },
      };

      const mockPayPal: any = {
        verifyWebhookSignature: vi.fn().mockResolvedValueOnce(true),
      };

      const result = await processWebhookEvent(
        db,
        { event: lateDeniedEvent, headers: validHeaders },
        mockPayPal
      );

      expect(result.received).toBe(true);
      expect(result.actionTaken).toBe("EVENT_RECORDED");
      // Zero updates to paymentOrders or spendReservations
      const orderUpdate = db._updates.find((u: any) => u.table === paymentOrders);
      expect(orderUpdate).toBeUndefined();
      const resUpdate = db._updates.find((u: any) => u.table === spendReservations);
      expect(resUpdate).toBeUndefined();
    });

    it("ignores out-of-order CHECKOUT.ORDER.APPROVED when order is already CAPTURED or CANCELLED", async () => {
      const cancelledOrder = {
        id: validOrderId,
        providerOrderId: validPayPalOrderId,
        reservationId: validReservationId,
        status: "CANCELLED", // Terminal state
      };
      const releasedRes = { id: validReservationId, state: "RELEASED" };
      const db = createMockDb({
        orders: [cancelledOrder],
        reservations: [releasedRes],
        webhookEvents: [],
      });

      const lateApprovedEvent = {
        id: "WH-EVT-LATE-APPROVED",
        event_version: "1.0",
        create_time: "2026-10-19T14:25:00Z",
        resource_type: "checkout-order",
        event_type: "CHECKOUT.ORDER.APPROVED",
        resource: {
          id: validPayPalOrderId,
          status: "APPROVED",
        },
      };

      const mockPayPal: any = {
        verifyWebhookSignature: vi.fn().mockResolvedValueOnce(true),
      };

      const result = await processWebhookEvent(
        db,
        { event: lateApprovedEvent, headers: validHeaders },
        mockPayPal
      );

      expect(result.received).toBe(true);
      expect(result.actionTaken).toBe("EVENT_RECORDED");
      // Must not advance CANCELLED to APPROVED
      expect(db._updates.length).toBe(0);
    });

    it("transitions order and reservation to RECONCILIATION_HOLD when captured amount does not match trusted database order (CAPTURE_AMOUNT_MISMATCH)", async () => {
      const validApproval = {
        id: validApprovalId,
        policyHash: validPolicyHash,
        spendLimitMinor: 10000,
        currency: "USD",
        revokedAt: null,
        expiresAt: new Date(Date.now() + 86400000),
      };
      const validProposal = {
        id: validProposalId,
        policyHash: validPolicyHash,
        decision: "ALLOW",
      };
      const validReservation = {
        id: validReservationId,
        approvalId: validApprovalId,
        proposalId: validProposalId,
        amountMinor: 4500, // $45.00
        currency: "USD",
        state: "RESERVED",
      };
      const validOrder = {
        id: validOrderId,
        ownerId: validOwnerId,
        reservationId: validReservationId,
        proposalId: validProposalId,
        providerOrderId: validPayPalOrderId,
        status: "APPROVED",
        amountMinor: 4500, // $45.00
        currency: "USD",
      };

      const db = createMockDb({
        orders: [validOrder],
        reservations: [validReservation],
        proposals: [validProposal],
        approvals: [validApproval],
      });

      // Provider returns $99.00 instead of expected $45.00
      const mockPayPal: any = {
        captureOrder: vi.fn().mockResolvedValueOnce({
          orderId: validPayPalOrderId,
          orderStatus: "COMPLETED",
          captureId: "CAP-MISMATCH-99",
          captureStatus: "COMPLETED",
          amount: { currencyCode: "USD", value: "99.00" },
        }),
      };

      await expect(
        capturePaymentOrder(db, { orderId: validOrderId, ownerId: validOwnerId }, mockPayPal)
      ).rejects.toThrowError(/CAPTURE_AMOUNT_MISMATCH/);

      // Verify safe transition to RECONCILIATION_HOLD
      const orderUpdate = db._updates.find((u: any) => u.table === paymentOrders);
      expect(orderUpdate.values.status).toBe("UNKNOWN_REQUIRES_RECONCILIATION");
      expect(orderUpdate.values.captureId).toBe("CAP-MISMATCH-99");

      const resUpdate = db._updates.find((u: any) => u.table === spendReservations);
      expect(resUpdate.values.state).toBe("RECONCILIATION_HOLD");
    });
  });

  // ==========================================
  // LEDGER SYNCHRONIZATION & RECONCILIATION
  // ==========================================
  describe("syncPayPalTransactions", () => {
    it("matches PayPal transaction by captureId and commits when amount matches", async () => {
      const order = {
        id: validOrderId,
        ownerId: validOwnerId,
        reservationId: validReservationId,
        providerOrderId: validPayPalOrderId,
        captureId: "CAP-TX-100",
        status: "APPROVED",
        amountMinor: 4500,
        currency: "USD",
      };
      const res = { id: validReservationId, state: "RESERVED" };
      const db = createMockDb({ orders: [order], reservations: [res] });

      const txs = [
        {
          transactionId: "CAP-TX-100",
          paypalReferenceId: null,
          status: "COMPLETED",
          amountMinor: 4500,
          currency: "USD",
          initiationDate: new Date().toISOString(),
          updatedDate: null,
          payerEmail: "buyer@sandbox.com",
          payerName: "John Buyer",
          description: "Test Capture",
          feeAmountMinor: 150,
          syncedToLedger: false,
          associatedOrderId: null,
        },
      ];

      const syncResult = await syncPayPalTransactions(db, txs, validOwnerId);
      expect(syncResult.syncedCount).toBe(1);
      expect(syncResult.updatedCount).toBe(1);
      expect(syncResult.transactions[0]!.syncedToLedger).toBe(true);
      expect(syncResult.transactions[0]!.associatedOrderId).toBe(validOrderId);

      const orderUpdate = db._updates.find((u: any) => u.table === paymentOrders);
      expect(orderUpdate.values.status).toBe("CAPTURED");
      const resUpdate = db._updates.find((u: any) => u.table === spendReservations);
      expect(resUpdate.values.state).toBe("COMMITTED");
    });

    it("detects amount mismatch in PayPal transaction and flags RECONCILIATION_HOLD instead of committing", async () => {
      const order = {
        id: validOrderId,
        ownerId: validOwnerId,
        reservationId: validReservationId,
        providerOrderId: validPayPalOrderId,
        captureId: "CAP-TX-MISMATCH",
        status: "APPROVED",
        amountMinor: 4500, // $45.00
        currency: "USD",
      };
      const res = { id: validReservationId, state: "RESERVED" };
      const db = createMockDb({ orders: [order], reservations: [res] });

      const txs = [
        {
          transactionId: "CAP-TX-MISMATCH",
          paypalReferenceId: null,
          status: "COMPLETED",
          amountMinor: 9900, // $99.00 -> Discrepancy!
          currency: "USD",
          initiationDate: new Date().toISOString(),
          updatedDate: null,
          payerEmail: "buyer@sandbox.com",
          payerName: "John Buyer",
          description: "Discrepancy Capture",
          feeAmountMinor: 250,
          syncedToLedger: false,
          associatedOrderId: null,
        },
      ];

      const syncResult = await syncPayPalTransactions(db, txs, validOwnerId);
      expect(syncResult.syncedCount).toBe(0); // Not marked synced due to discrepancy
      expect(syncResult.updatedCount).toBe(0); // Not committed!

      const orderUpdate = db._updates.find((u: any) => u.table === paymentOrders);
      expect(orderUpdate.values.status).toBe("UNKNOWN_REQUIRES_RECONCILIATION");
      const resUpdate = db._updates.find((u: any) => u.table === spendReservations);
      expect(resUpdate.values.state).toBe("RECONCILIATION_HOLD");
    });
  });
});
