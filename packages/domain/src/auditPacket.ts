import { createHash } from "node:crypto";
import type { EvidencePacket, EvidenceVerificationStatus, Decision } from "@warrant/contracts";

/**
 * Deterministic JSON stringification according to RFC-8785 principles:
 * - Object keys are sorted lexicographically by UTF-16 code units.
 * - Undefined values in objects are omitted.
 * - No extraneous whitespace.
 * - Arrays maintain their sequence.
 */
export function canonicalJsonStringify(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJsonStringify(item)).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  const sortedKeys = Object.keys(record).sort();
  const parts: string[] = [];

  for (const key of sortedKeys) {
    const val = record[key];
    if (val !== undefined) {
      parts.push(`${JSON.stringify(key)}:${canonicalJsonStringify(val)}`);
    }
  }

  return `{${parts.join(",")}}`;
}

/**
 * Computes a deterministic SHA-256 hash of an Evidence Packet.
 * The `packetHash` field itself is excluded so that the hash can be computed
 * prior to or verified after sealing.
 */
export function computeEvidencePacketHash(
  packet: Omit<EvidencePacket, "packetHash"> | EvidencePacket
): string {
  // Destructure out packetHash if present
  const { packetHash: _ignored, ...payload } = packet as EvidencePacket;
  const canonical = canonicalJsonStringify(payload);
  return createHash("sha256").update(canonical, "utf8").digest("hex");
}

/**
 * Verifies that an Evidence Packet has not been tampered with by recalculating
 * its SHA-256 digest over its canonical JSON content.
 */
export function verifyEvidencePacketIntegrity(packet: EvidencePacket): {
  valid: boolean;
  calculatedHash: string;
  expectedHash: string;
} {
  const calculatedHash = computeEvidencePacketHash(packet);
  return {
    valid: calculatedHash === packet.packetHash,
    calculatedHash,
    expectedHash: packet.packetHash,
  };
}

/**
 * Evaluates the authoritative high-level status of an evidence packet without fabricating guarantees.
 */
export function deriveEvidenceVerificationStatus(params: {
  decision?: Decision | null;
  zeroCriticalFindingsVerified?: boolean;
  approvalRevoked?: boolean;
  approvalExpired?: boolean;
  hasReconciliationHold?: boolean;
  paymentOrderExecuted?: boolean;
}): EvidenceVerificationStatus {
  if (params.approvalRevoked || params.approvalExpired || params.decision === "DENY") {
    return "FAIL";
  }

  if (params.zeroCriticalFindingsVerified === false) {
    return "FAIL";
  }

  if (params.hasReconciliationHold || params.decision === "REVIEW") {
    return "WARNING";
  }

  if (params.paymentOrderExecuted === false && params.decision !== null && params.decision !== undefined) {
    return "UNTESTED";
  }

  if ((params.decision === "ALLOW" || params.decision === null) && params.zeroCriticalFindingsVerified) {
    return "PASS";
  }

  return "WARNING";
}
