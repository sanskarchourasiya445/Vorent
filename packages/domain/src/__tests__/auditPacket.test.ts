import { describe, it, expect } from "vitest";
import {
  canonicalJsonStringify,
  computeEvidencePacketHash,
  verifyEvidencePacketIntegrity,
  deriveEvidenceVerificationStatus,
} from "../auditPacket.js";
import type { EvidencePacket } from "@warrant/contracts";

describe("auditPacket Domain Functions", () => {
  const basePacket: EvidencePacket = {
    packetId: "pkt_test_1001",
    packetVersion: "1.0.0",
    generatedAt: "2026-10-20T00:00:00.000Z",
    packetHash: "",
    target: {
      entityType: "CHECKOUT_PROPOSAL",
      entityId: "prop_1001",
    },
    mandateProvenance: {
      sourceMandate: "Mandate for dev tools",
      intentSpec: { budget: 100 },
    },
    policyIdentity: {
      policyId: "pol_1001",
      policyVersionId: "ver_1001",
      versionNumber: 1,
      policyHash: "a".repeat(64),
      policyDocument: { maxTotal: 100 },
    },
    verificationProof: {
      qualifyingTestRunId: "run_1001",
      testRunStatus: "PASSED",
      candidatesExplored: 50,
      domainVersion: "1.0.0",
      zeroCriticalFindingsVerified: true,
      findingsCount: 0,
      searchLimitations: "Declared domains only",
    },
    approvalBinding: {
      approvalId: "app_1001",
      spendLimitMinor: 10000,
      currency: "USD",
      expiresAt: "2026-10-25T00:00:00.000Z",
      revokedAt: null,
    },
    checkoutEvaluation: {
      proposalId: "prop_1001",
      decision: "ALLOW",
      primaryReasonCode: "OK",
      reasonCodes: ["OK"],
      evaluatedAt: "2026-10-20T00:00:00.000Z",
      consumedNonceId: "nonce_1001",
      cartSnapshot: { items: [] },
      evidenceSnapshot: {},
    },
    paymentLifecycle: {
      paymentOrderId: "po_1001",
      provider: "PAYPAL_SANDBOX",
      providerOrderId: "ORDER_1001",
      status: "CREATED",
      amountMinor: 4500,
      currency: "USD",
      reservationState: "RESERVED",
      reconciliationStatus: "OK",
    },
    auditEvents: [],
    overallStatus: "PASS",
    redactionNotice: "Credentials redacted.",
  };

  it("produces deterministic canonical JSON regardless of key insertion order", () => {
    const objA = { z: 1, a: 2, m: { y: "hello", x: "world" } };
    const objB = { a: 2, m: { x: "world", y: "hello" }, z: 1 };
    expect(canonicalJsonStringify(objA)).toBe(canonicalJsonStringify(objB));
    expect(canonicalJsonStringify(objA)).toBe('{"a":2,"m":{"x":"world","y":"hello"},"z":1}');
  });

  it("omits undefined properties in canonical JSON", () => {
    const objWithUndefined = { a: 1, b: undefined, c: "test" };
    expect(canonicalJsonStringify(objWithUndefined)).toBe('{"a":1,"c":"test"}');
  });

  it("computes reproducible hash for evidence packet and ignores existing packetHash", () => {
    const hash1 = computeEvidencePacketHash(basePacket);
    expect(hash1).toHaveLength(64);

    const packetWithDifferentPlaceholderHash = {
      ...basePacket,
      packetHash: "different-hash-that-should-be-ignored",
    };
    const hash2 = computeEvidencePacketHash(packetWithDifferentPlaceholderHash);
    expect(hash2).toBe(hash1);
  });

  it("verifies integrity when packetHash matches", () => {
    const hash = computeEvidencePacketHash(basePacket);
    const sealedPacket: EvidencePacket = {
      ...basePacket,
      packetHash: hash,
    };

    const integrity = verifyEvidencePacketIntegrity(sealedPacket);
    expect(integrity.valid).toBe(true);
    expect(integrity.calculatedHash).toBe(hash);
    expect(integrity.expectedHash).toBe(hash);
  });

  it("detects tampering when packet content changes", () => {
    const hash = computeEvidencePacketHash(basePacket);
    const sealedPacket: EvidencePacket = {
      ...basePacket,
      packetHash: hash,
    };

    const tamperedPacket: EvidencePacket = {
      ...sealedPacket,
      overallStatus: "FAIL", // tampered
    };

    const integrity = verifyEvidencePacketIntegrity(tamperedPacket);
    expect(integrity.valid).toBe(false);
    expect(integrity.calculatedHash).not.toBe(integrity.expectedHash);
  });

  describe("deriveEvidenceVerificationStatus", () => {
    it("returns FAIL if approval is revoked or expired", () => {
      expect(deriveEvidenceVerificationStatus({ approvalRevoked: true })).toBe("FAIL");
      expect(deriveEvidenceVerificationStatus({ approvalExpired: true })).toBe("FAIL");
    });

    it("returns FAIL if decision is DENY", () => {
      expect(deriveEvidenceVerificationStatus({ decision: "DENY" })).toBe("FAIL");
    });

    it("returns FAIL if zeroCriticalFindingsVerified is false", () => {
      expect(deriveEvidenceVerificationStatus({ zeroCriticalFindingsVerified: false })).toBe("FAIL");
    });

    it("returns WARNING if reconciliation hold is active", () => {
      expect(deriveEvidenceVerificationStatus({
        decision: "ALLOW",
        zeroCriticalFindingsVerified: true,
        hasReconciliationHold: true,
      })).toBe("WARNING");
    });

    it("returns WARNING if decision is REVIEW", () => {
      expect(deriveEvidenceVerificationStatus({
        decision: "REVIEW",
        zeroCriticalFindingsVerified: true,
      })).toBe("WARNING");
    });

    it("returns UNTESTED if payment order was not executed", () => {
      expect(deriveEvidenceVerificationStatus({
        decision: "ALLOW",
        zeroCriticalFindingsVerified: true,
        paymentOrderExecuted: false,
      })).toBe("UNTESTED");
    });

    it("returns PASS when all checks are green", () => {
      expect(deriveEvidenceVerificationStatus({
        decision: "ALLOW",
        zeroCriticalFindingsVerified: true,
        paymentOrderExecuted: true,
      })).toBe("PASS");
    });

    it("returns PASS for policy versions with verified zero critical findings and unrevoked approval", () => {
      expect(deriveEvidenceVerificationStatus({
        decision: null,
        zeroCriticalFindingsVerified: true,
        approvalRevoked: false,
        approvalExpired: false,
      })).toBe("PASS");
    });
  });
});
