import { describe, it, expect } from "vitest";
import {
  ApprovalRecordSchema,
  CreateApprovalRequestSchema,
  ApprovalListResponseSchema,
  RevokeApprovalResponseSchema,
} from "../approvals.js";

describe("Approval Contracts & Schemas", () => {
  const validApproval = {
    id: "11111111-1111-1111-1111-111111111111",
    ownerId: "22222222-2222-2222-2222-222222222222",
    policyVersionId: "33333333-3333-3333-3333-333333333333",
    policyHash: "a".repeat(64),
    policyName: "Engineering Hardware Policy",
    qualifyingTestRunId: "44444444-4444-4444-4444-444444444444",
    spendLimitMinor: 100000,
    consumedSpendMinor: 25000,
    currency: "USD",
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
    revokedAt: null,
    createdAt: new Date().toISOString(),
    status: "ACTIVE",
  };

  it("validates valid ApprovalRecord", () => {
    const parsed = ApprovalRecordSchema.parse(validApproval);
    expect(parsed.id).toBe(validApproval.id);
    expect(parsed.status).toBe("ACTIVE");
    expect(parsed.consumedSpendMinor).toBe(25000);
  });

  it("validates CreateApprovalRequestSchema", () => {
    const request = {
      policyVersionId: "33333333-3333-3333-3333-333333333333",
      policyHash: "b".repeat(64),
      qualifyingTestRunId: "44444444-4444-4444-4444-444444444444",
      spendLimitMinor: 50000,
      currency: "USD",
      expiresInHours: 48,
    };
    const parsed = CreateApprovalRequestSchema.parse(request);
    expect(parsed.spendLimitMinor).toBe(50000);
    expect(parsed.expiresInHours).toBe(48);
  });

  it("validates ApprovalListResponseSchema", () => {
    const response = {
      approvals: [validApproval],
      total: 1,
    };
    const parsed = ApprovalListResponseSchema.parse(response);
    expect(parsed.approvals).toHaveLength(1);
    expect(parsed.total).toBe(1);
  });

  it("validates RevokeApprovalResponseSchema", () => {
    const response = {
      success: true,
      approval: {
        ...validApproval,
        status: "REVOKED",
        revokedAt: new Date().toISOString(),
      },
    };
    const parsed = RevokeApprovalResponseSchema.parse(response);
    expect(parsed.success).toBe(true);
    expect(parsed.approval.status).toBe("REVOKED");
  });
});
