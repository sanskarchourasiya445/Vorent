import { describe, it, expect } from "vitest";
import {
  EvaluationReportSchema,
  EvaluationReportResponseSchema,
  SecurityInvariantCheckSchema,
  type EvaluationReport,
} from "../evaluationReport.js";

describe("EvaluationReportSchema Contracts", () => {
  const sampleValidReport: EvaluationReport = {
    meta: {
      reportId: "eval_report_test_001",
      generatedAt: "2026-10-19T23:55:00.000Z",
      evaluatorVersion: "1.0.0",
      fixturesVersion: "2.0.0",
      environment: "sandbox",
      databaseStatus: "CONNECTED",
    },
    securityInvariants: [
      {
        id: "INV-1",
        name: "Centralized Gate Authority & Fail-Closed Enforcement",
        description: "Only server-side ALLOW permits payment order creation. DENY/REVIEW fail closed.",
        status: "VERIFIED",
        evidenceType: "PERSISTED_DATABASE",
        evidenceDetails: "3 proposals evaluated. 0 payment orders created for non-ALLOW decisions.",
        limitations: "Applies to evaluated proposals within active approvals.",
      },
      {
        id: "INV-6",
        name: "Authoritative Payment Reconciliation & Provider State Verification",
        description: "Payment capture and state transitions reflect authoritative provider events.",
        status: "FIXTURE_VERIFIED",
        evidenceType: "UNIT_FIXTURE",
        evidenceDetails: "Local adapter tests verify capture state machine transitions. Live capture preserved in RESERVED.",
        limitations: "Live remote capture marked UNTESTED in this session to protect existing sandbox reservations.",
      },
    ],
    boundedSearchSummary: {
      domainVersion: "1.0.0",
      declaredCandidateCount: 500,
      exploredCandidateCount: 500,
      seededDefectsCount: 1,
      seededDefectsDetected: 1,
      reproducibleFindingsCount: 1,
      stopReason: "DOMAIN_EXHAUSTED",
      exhausted: true,
      searchLimitations: "Bounded search validates only declared candidate domains and does not constitute proof of universal safety.",
    },
    databaseEvidence: {
      connected: true,
      persistedPoliciesCount: 3,
      persistedVersionsCount: 4,
      persistedRunsCount: 2,
      persistedApprovalsCount: 2,
      persistedProposalsCount: 3,
      persistedReservationsCount: 2,
      persistedPaymentOrdersCount: 1,
      reconciliationHoldsCount: 0,
    },
    disclosures: [
      "Live payment processing is strictly restricted to PayPal Sandbox.",
      "Bounded search is finite domain verification, not formal mathematical proof over all world items.",
    ],
  };

  it("validates a compliant EvaluationReport object", () => {
    const parseResult = EvaluationReportSchema.safeParse(sampleValidReport);
    expect(parseResult.success).toBe(true);
  });

  it("validates an EvaluationReportResponse envelope", () => {
    const response = { report: sampleValidReport };
    const parseResult = EvaluationReportResponseSchema.safeParse(response);
    expect(parseResult.success).toBe(true);
  });

  it("rejects invalid invariant status", () => {
    const invalidStatus = {
      ...sampleValidReport.securityInvariants[0],
      status: "PROVEN_UNIVERSALLY_SAFE", // Invalid enum
    };
    const parseResult = SecurityInvariantCheckSchema.safeParse(invalidStatus);
    expect(parseResult.success).toBe(false);
  });

  it("rejects non-sandbox environment", () => {
    const invalidEnv = {
      ...sampleValidReport,
      meta: {
        ...sampleValidReport.meta,
        environment: "production",
      },
    };
    const parseResult = EvaluationReportSchema.safeParse(invalidEnv);
    expect(parseResult.success).toBe(false);
  });
});
