import { describe, it, expect } from "vitest";
import {
  EvidenceVerificationStatusZodSchema,
  EvidencePacketSchema,
  EvidencePacketResponseSchema,
  type EvidencePacket,
} from "../evidencePacket.js";

describe("EvidencePacket Contracts", () => {
  const samplePacket: EvidencePacket = {
    packetId: "pkt_test_000000000001",
    packetVersion: "1.0.0",
    generatedAt: "2026-10-20T00:00:00.000Z",
    packetHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    target: {
      entityType: "CHECKOUT_PROPOSAL",
      entityId: "prop_000000000001",
    },
    mandateProvenance: {
      sourceMandate: "Purchase allowed office snacks under $50 USD",
      intentSpec: { budget: 50, category: "snacks" },
    },
    policyIdentity: {
      policyId: "pol_000000000001",
      policyVersionId: "ver_000000000001",
      versionNumber: 1,
      policyHash: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
      policyDocument: { rules: [] },
    },
    verificationProof: {
      qualifyingTestRunId: "run_000000000001",
      testRunStatus: "PASSED",
      candidatesExplored: 120,
      domainVersion: "1.0.0",
      zeroCriticalFindingsVerified: true,
      findingsCount: 0,
      searchLimitations: "Bounded search only explores declared fixtures.",
    },
    approvalBinding: {
      approvalId: "app_000000000001",
      spendLimitMinor: 6000,
      currency: "USD",
      expiresAt: "2026-10-25T00:00:00.000Z",
      revokedAt: null,
    },
    checkoutEvaluation: {
      proposalId: "prop_000000000001",
      decision: "ALLOW",
      primaryReasonCode: "WITHIN_BUDGET",
      reasonCodes: ["WITHIN_BUDGET", "MERCHANT_ALLOWED"],
      evaluatedAt: "2026-10-20T00:00:00.000Z",
      consumedNonceId: "nonce_000000000001",
      cartSnapshot: { totalAmountMinor: 4500, currency: "USD" },
      evidenceSnapshot: { verifiedSupplier: true },
      ruleTrace: [],
    },
    paymentLifecycle: {
      paymentOrderId: "po_000000000001",
      provider: "PAYPAL_SANDBOX",
      providerOrderId: "7SY090644K3801703",
      status: "CREATED",
      amountMinor: 4500,
      currency: "USD",
      reservationState: "RESERVED",
      reconciliationStatus: "OK",
    },
    auditEvents: [
      {
        id: "a0000000-0000-0000-0000-000000000001",
        ownerId: "b0000000-0000-0000-0000-000000000002",
        actorType: "SYSTEM",
        eventType: "CHECKOUT_PROPOSAL_EVALUATED",
        entityType: "CHECKOUT_PROPOSAL",
        entityId: "prop_000000000001",
        payload: { decision: "ALLOW" },
        createdAt: "2026-10-20T00:00:00.000Z",
      },
    ],
    overallStatus: "PASS",
    redactionNotice: "All provider client secrets, bearer tokens, and private keys are redacted.",
  };

  it("validates EvidenceVerificationStatus enum", () => {
    expect(EvidenceVerificationStatusZodSchema.safeParse("PASS").success).toBe(true);
    expect(EvidenceVerificationStatusZodSchema.safeParse("FAIL").success).toBe(true);
    expect(EvidenceVerificationStatusZodSchema.safeParse("WARNING").success).toBe(true);
    expect(EvidenceVerificationStatusZodSchema.safeParse("UNTESTED").success).toBe(true);
    expect(EvidenceVerificationStatusZodSchema.safeParse("PROVED").success).toBe(false);
  });

  it("validates compliant EvidencePacket", () => {
    const parse = EvidencePacketSchema.safeParse(samplePacket);
    expect(parse.success).toBe(true);
  });

  it("validates EvidencePacketResponse envelope", () => {
    const parse = EvidencePacketResponseSchema.safeParse({ packet: samplePacket });
    expect(parse.success).toBe(true);
  });

  it("rejects invalid hash length", () => {
    const invalid = {
      ...samplePacket,
      packetHash: "short-hash",
    };
    const parse = EvidencePacketSchema.safeParse(invalid);
    expect(parse.success).toBe(false);
  });
});
