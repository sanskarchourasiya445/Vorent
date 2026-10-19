import { describe, it, expect } from "vitest";
import {
  CreateCheckoutNonceRequestSchema,
  SubmitCheckoutProposalRequestSchema,
  SpendReservationRecordSchema,
} from "../checkout.js";

describe("Checkout Contracts & Schemas", () => {
  it("validates valid CreateCheckoutNonceRequest", () => {
    const valid = {
      approvalId: "11111111-1111-1111-1111-111111111111",
      policyVersionId: "22222222-2222-2222-2222-222222222222",
      policyHash: "a".repeat(64),
      ttlSeconds: 300,
    };

    const parsed = CreateCheckoutNonceRequestSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it("rejects invalid policyHash length in CreateCheckoutNonceRequest", () => {
    const invalid = {
      approvalId: "11111111-1111-1111-1111-111111111111",
      policyVersionId: "22222222-2222-2222-2222-222222222222",
      policyHash: "too-short",
    };

    const parsed = CreateCheckoutNonceRequestSchema.safeParse(invalid);
    expect(parsed.success).toBe(false);
  });

  it("validates valid SubmitCheckoutProposalRequest", () => {
    const valid = {
      approvalId: "11111111-1111-1111-1111-111111111111",
      policyVersionId: "22222222-2222-2222-2222-222222222222",
      policyHash: "a".repeat(64),
      nonceId: "33333333-3333-3333-3333-333333333333",
      cart: {
        currency: "USD",
        items: [
          {
            sku: "SKU-BOOK-1",
            title: "Architecture Book",
            category: "Books",
            unitPriceMinor: 4500,
            quantity: 1,
          },
        ],
      },
      evidenceSnapshot: {
        quotesVerified: true,
        evidenceComplete: true,
        stale: false,
      },
    };

    const parsed = SubmitCheckoutProposalRequestSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });

  it("validates SpendReservationRecordSchema states", () => {
    const valid = {
      id: "44444444-4444-4444-4444-444444444444",
      ownerId: "55555555-5555-5555-5555-555555555555",
      approvalId: "11111111-1111-1111-1111-111111111111",
      proposalId: "66666666-6666-6666-6666-666666666666",
      amountMinor: 4500,
      currency: "USD",
      state: "ORDER_CREATION_PENDING",
      expiresAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const parsed = SpendReservationRecordSchema.safeParse(valid);
    expect(parsed.success).toBe(true);
  });
});
