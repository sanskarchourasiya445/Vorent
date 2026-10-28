import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { GovernanceDashboardPanel } from "../components/dashboard/GovernanceDashboardPanel";
import { submitCheckoutProposal } from "../api/checkoutService";
import { ReasonCode } from "@warrant/contracts";
import type {
  PaymentOrderRecord,
  PolicySummary,
  FindingRecord,
  SpendReservationRecord,
} from "@warrant/contracts";
import type { ApprovalRecord } from "../types/approval";
import type { SavedVerificationRunSummary } from "../types/persistence";

// Hoisted mock dependencies
const { mockApprovals, mockOrders, mockPolicies, mockRuns, mockFindings, mockReservations } = vi.hoisted(() => {
  const approvals: ApprovalRecord[] = [
    {
      id: "645cd040-b1ea-41d9-9ab8-fe6f2f3692fd",
      policyVersionId: "18674b70-b535-465d-a99f-fee8d9de5bf0",
      policyHash: "93258bd2e0e10160490d8d690e79028c1886f96de0806b749e1822619a3cbbb5",
      qualifyingTestRunId: "run_verified_99",
      spendLimitMinor: 6000,
      consumedSpendMinor: 1500,
      remainingSpendMinor: 4500,
      currency: "USD",
      status: "ACTIVE",
      expiresAt: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
    },
    {
      id: "777cd040-b1ea-41d9-9ab8-fe6f2f3692fd",
      policyVersionId: "old_version_001",
      policyHash: "1111111111111111111111111111111111111111111111111111111111111111",
      qualifyingTestRunId: "run_verified_old",
      spendLimitMinor: 5000,
      consumedSpendMinor: 5000,
      remainingSpendMinor: 0,
      currency: "USD",
      status: "EXPIRED",
      expiresAt: new Date(Date.now() - 24 * 3600 * 1000).toISOString(),
      createdAt: new Date(Date.now() - 100 * 3600 * 1000).toISOString(),
    },
  ];

  const orders: PaymentOrderRecord[] = [
    {
      id: "a0000000-0000-4000-8000-000000000001",
      ownerId: "b0000000-0000-4000-8000-000000000001",
      proposalId: "c0000000-0000-4000-8000-000000000001",
      reservationId: "d0000000-0000-4000-8000-000000000001",
      provider: "PAYPAL_SANDBOX",
      providerOrderId: "PAYPAL_01",
      idempotencyKey: "idem_01",
      status: "CAPTURED",
      amountMinor: 1500,
      currency: "USD",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "a0000000-0000-4000-8000-000000000002",
      ownerId: "b0000000-0000-4000-8000-000000000001",
      proposalId: "c0000000-0000-4000-8000-000000000002",
      reservationId: "d0000000-0000-4000-8000-000000000002",
      provider: "PAYPAL_SANDBOX",
      providerOrderId: "PAYPAL_02",
      idempotencyKey: "idem_02",
      status: "UNKNOWN_REQUIRES_RECONCILIATION",
      amountMinor: 2500,
      currency: "USD",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const policies: PolicySummary[] = [
    {
      id: "18674b70-b535-465d-a99f-fee8d9de5bf0",
      name: "Standard Hardware & Books",
      isPreset: false,
      sourceMandate: "Buy technical books and hardware",
      versionCount: 1,
      policyHash: "93258bd2e0e10160490d8d690e79028c1886f96de0806b749e1822619a3cbbb5",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "pol_unapproved_candidate",
      name: "Unapproved Candidate Version",
      isPreset: false,
      sourceMandate: "Testing candidate",
      versionCount: 2,
      policyHash: "cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];

  const runs: SavedVerificationRunSummary[] = [
    {
      runId: "run_verified_99",
      policyVersionId: "18674b70-b535-465d-a99f-fee8d9de5bf0",
      policyName: "Standard Hardware & Books",
      policyHash: "93258bd2e0e10160490d8d690e79028c1886f96de0806b749e1822619a3cbbb5",
      status: "COMPLETED",
      stopReason: "EXHAUSTIVE",
      exhausted: true,
      totalCandidatesExplored: 500,
      findingCount: 1,
      unresolvedCount: 0,
      durationMs: 95,
      createdAt: new Date().toISOString(),
    },
  ];

  const findings: FindingRecord[] = [
    {
      id: "finding_crit_01",
      ownerId: "usr_default",
      testRunId: "run_verified_99",
      policyVersionId: "18674b70-b535-465d-a99f-fee8d9de5bf0",
      findingType: "PROHIBITED_CATEGORY",
      severity: "CRITICAL",
      status: "UNRESOLVED",
      witness: {
        id: "cart_01",
        merchantName: "Acme",
        items: [],
        currency: "USD",
        declaredTotalMinor: 5000,
      },
      evidenceSnapshot: {},
      ruleTrace: [],
      reproduction: {},
      createdAt: new Date().toISOString(),
    },
  ];

  const reservations: SpendReservationRecord[] = [
    {
      id: "d0000000-0000-4000-8000-000000000001",
      ownerId: "b0000000-0000-4000-8000-000000000001",
      approvalId: "645cd040-b1ea-41d9-9ab8-fe6f2f3692fd",
      proposalId: "c0000000-0000-4000-8000-000000000001",
      amountMinor: 1500,
      currency: "USD",
      state: "COMMITTED",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    },
    {
      id: "d0000000-0000-4000-8000-000000000002",
      ownerId: "b0000000-0000-4000-8000-000000000001",
      approvalId: "645cd040-b1ea-41d9-9ab8-fe6f2f3692fd",
      proposalId: "c0000000-0000-4000-8000-000000000002",
      amountMinor: 2500,
      currency: "USD",
      state: "RECONCILIATION_HOLD",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 3600 * 1000).toISOString(),
    },
  ];

  return {
    mockApprovals: approvals,
    mockOrders: orders,
    mockPolicies: policies,
    mockRuns: runs,
    mockFindings: findings,
    mockReservations: reservations,
  };
});

// Mock dependencies
vi.mock("../api/client", () => ({
  api: {
    getHealthLive: vi.fn().mockResolvedValue({
      status: "ok",
      timestamp: "2026-10-19T12:00:00Z",
      uptime: 120,
      service: "warrant-api",
      version: "0.1.0",
    }),
    getHealthReady: vi.fn().mockResolvedValue({
      status: "ready",
      timestamp: "2026-10-19T12:00:00Z",
      service: "warrant-api",
      version: "0.1.0",
      database: { configured: true, connected: true, latencyMs: 3 },
    }),
  },
}));

vi.mock("../api/approvalService", () => ({
  fetchApprovals: vi.fn().mockResolvedValue({
    state: "READY",
    data: mockApprovals,
  }),
}));

vi.mock("../api/paymentOrderService", () => ({
  listPaymentOrders: vi.fn().mockResolvedValue({
    orders: mockOrders,
    total: mockOrders.length,
    reconciliationAlertsCount: 1,
    state: "READY",
    isUnmounted: false,
  }),
  getReconciliationAlerts: vi.fn().mockResolvedValue({
    unreconciledOrders: [mockOrders[1]],
    heldReservations: [mockReservations[1]],
    totalAlerts: 2,
    state: "READY",
    isUnmounted: false,
  }),
  listSpendReservations: vi.fn().mockResolvedValue({
    reservations: mockReservations,
    total: mockReservations.length,
    state: "READY",
    isUnmounted: false,
  }),
  getPaymentOrder: vi.fn(),
  confirmBuyerApproval: vi.fn(),
  capturePaymentOrder: vi.fn(),
  cancelPaymentOrder: vi.fn(),
  reconcilePaymentOrder: vi.fn(),
  createPaymentOrder: vi.fn(),
  PaymentOrderError: class extends Error {
    constructor(msg: string, public code?: string, public statusCode?: number, public isAmbiguous: boolean = false) {
      super(msg);
    }
  },
}));

vi.mock("../api/policyService", () => ({
  fetchPolicySummaries: vi.fn().mockResolvedValue({
    state: {
      state: "READY",
      data: mockPolicies,
    },
    isFallback: false,
  }),
}));

vi.mock("../api/persistenceService", () => ({
  fetchSavedVerificationRuns: vi.fn().mockResolvedValue({
    state: "READY",
    data: mockRuns,
  }),
}));

vi.mock("../api/findingsService", () => ({
  fetchFindings: vi.fn().mockResolvedValue({
    findings: mockFindings,
    total: 1,
  }),
}));

const defaultDashboardProps = {
  onNavigateWorkstation: vi.fn(),
  initialApprovals: mockApprovals,
  initialPaymentOrders: mockOrders,
  initialPolicies: mockPolicies,
  initialRuns: mockRuns,
  initialFindings: mockFindings,
  initialSpendReservations: {
    reservations: mockReservations,
    total: mockReservations.length,
    state: "READY" as const,
  },
  initialLoading: false,
};

describe("Governance Dashboard & Checkout Enforcement Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 1. Dashboard Structure & Metric Aggregation
  describe("1. Governance Dashboard Metrics & State Aggregation", () => {
    it("renders dashboard loading state", () => {
      const html = renderToString(
        React.createElement(GovernanceDashboardPanel, {
          onNavigateWorkstation: vi.fn(),
          initialLoading: true,
        }),
      );

      expect(html).toContain("Loading VORENT governance metrics and operational states...");
    });

    it("renders empty states when no approvals, policies, or runs exist", () => {
      const html = renderToString(
        React.createElement(GovernanceDashboardPanel, {
          onNavigateWorkstation: vi.fn(),
          initialApprovals: [],
          initialPaymentOrders: [],
          initialPolicies: [],
          initialRuns: [],
          initialFindings: [],
          initialSpendReservations: { reservations: [], total: 0, state: "EMPTY" },
          initialLoading: false,
        }),
      );

      expect(html).toContain("No active approvals currently registered");
      expect(html).toContain("No policies registered");
      expect(html).toContain("No persisted test runs recorded yet");
      expect(html).not.toContain("Decision D-014 Warning");
      expect(html).not.toContain("Reconciliation Required");
    });

    it("renders dashboard header and workstation navigation controls with aggregated metrics", () => {
      const html = renderToString(
        React.createElement(GovernanceDashboardPanel, defaultDashboardProps),
      );

      expect(html).toContain("Governance &amp; Operational Dashboard");
      expect(html).toContain("Authorized Budget");
      expect(html).toContain("$45.00");
      expect(html).toContain("Cap: $60.00");
      expect(html).toContain("Approvals");
      expect(html).toContain("Payment Orders");
      expect(html).toContain("Finding Triage");
    });

    it("displays honest bounded search disclaimer without claiming universal safety", () => {
      const html = renderToString(
        React.createElement(GovernanceDashboardPanel, defaultDashboardProps),
      );

      expect(html).toContain("Bounded Search Disclaimer");
      expect(html).toContain("does not claim universal safety");
    });

    it("renders Decision D-014 warning when unresolved CRITICAL or HIGH findings exist", () => {
      const html = renderToString(
        React.createElement(GovernanceDashboardPanel, defaultDashboardProps),
      );

      expect(html).toContain("Decision D-014 Warning");
      expect(html).toContain("risk acceptance is strictly prohibited for CRITICAL and HIGH severity counterexamples");
      expect(html).toContain("Triage Findings");
    });

    it("renders reconciliation alert banner when an order is in UNKNOWN_REQUIRES_RECONCILIATION", () => {
      const html = renderToString(
        React.createElement(GovernanceDashboardPanel, defaultDashboardProps),
      );

      expect(html).toContain("Reconciliation Required");
      expect(html).toContain("Inspect Transactions");
      expect(html).toContain("UNKNOWN_REQUIRES_RECONCILIATION");
    });
  });

  // 2. Policy Version Approval Status Presentation
  describe("2. Policy Version Approval Status Presentation", () => {
    it("distinguishes approved & active versions from standby unapproved versions", () => {
      const html = renderToString(
        React.createElement(GovernanceDashboardPanel, defaultDashboardProps),
      );

      expect(html).toContain("Policy Versions &amp; Approval Status");
      expect(html).toContain("Standard Hardware &amp; Books");
      expect(html).toContain("APPROVED &amp; ACTIVE");
      expect(html).toContain("VERIFIED / STANDBY");
    });
  });

  // 3. Checkout Gate Evidence Quality & Fail-Closed Enforcement
  describe("3. Checkout Gate Evidence Quality & Fail-Closed Enforcement", () => {
    it("evaluates to REVIEW with MISSING_CRITICAL_EVIDENCE when evidence is missing", async () => {
      const result = await submitCheckoutProposal({
        approvalId: "645cd040-b1ea-41d9-9ab8-fe6f2f3692fd",
        merchantName: "Acme Hardware",
        items: [
          {
            id: "item_01",
            name: "Mechanical Keyboard",
            category: "Hardware",
            unitPriceMinor: 15000,
            quantity: 1,
          },
        ],
        currency: "USD",
        useOfflineSimulation: true,
        evidenceVariation: "MISSING",
      });

      expect(result.decision).toBe("REVIEW");
      expect(result.primaryReasonCode).toBe(ReasonCode.MISSING_CRITICAL_EVIDENCE);
      expect(result.reservationId).toBeUndefined();
      expect(result.reservationState).toBeUndefined();
    });

    it("evaluates to REVIEW with STALE_EVIDENCE when evidence timestamp is stale", async () => {
      const result = await submitCheckoutProposal({
        approvalId: "645cd040-b1ea-41d9-9ab8-fe6f2f3692fd",
        merchantName: "Acme Hardware",
        items: [
          {
            id: "item_01",
            name: "Mechanical Keyboard",
            category: "Hardware",
            unitPriceMinor: 15000,
            quantity: 1,
          },
        ],
        currency: "USD",
        useOfflineSimulation: true,
        evidenceVariation: "STALE",
      });

      expect(result.decision).toBe("REVIEW");
      expect(result.primaryReasonCode).toBe(ReasonCode.STALE_EVIDENCE);
      expect(result.reservationId).toBeUndefined();
      expect(result.reservationState).toBeUndefined();
    });

    it("evaluates to ALLOW with reservation only when evidence is fresh and cart is compliant", async () => {
      const result = await submitCheckoutProposal({
        approvalId: "645cd040-b1ea-41d9-9ab8-fe6f2f3692fd",
        merchantName: "Acme Hardware",
        items: [
          {
            id: "item_01",
            name: "Computer Architecture Book",
            category: "Reference Books",
            unitPriceMinor: 4500,
            quantity: 1,
          },
        ],
        currency: "USD",
        useOfflineSimulation: true,
        evidenceVariation: "COMPLETE",
      });

      expect(result.decision).toBe("ALLOW");
      expect(result.primaryReasonCode).toBe(ReasonCode.ALL_RULES_PASSED);
      expect(result.reservationId).toBeDefined();
      expect(result.reservationState).toBe("ORDER_CREATION_PENDING");
    });
  });

  // 4. API Endpoints & Unmounted State Graceful Handling
  describe("4. Graceful Handling of Unmounted or Standby Endpoints", () => {
    it("listPaymentOrders handles unmounted collection endpoint without throwing unhandled rejection", async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        status: 404,
        ok: false,
      } as any);

      const realService = await vi.importActual<typeof import("../api/paymentOrderService")>(
        "../api/paymentOrderService",
      );
      const res = await realService.listPaymentOrders();
      expect(res.orders).toEqual([]);
      expect(res.isUnmounted).toBe(true);

      global.fetch = originalFetch;
    });
  });

  // 5. Reliable Degradation, Standby States & Authoritative Spend Integration
  describe("5. Reliable Degradation, Standby States & Authoritative Spend Integration", () => {
    it("does not misrepresent missing/standby approvals as $0.00 spend", () => {
      const html = renderToString(
        React.createElement(GovernanceDashboardPanel, {
          onNavigateWorkstation: vi.fn(),
          initialApprovals: [],
          initialApprovalsState: "UNAVAILABLE",
          initialLoading: false,
        }),
      );

      // Verifies that unavailable budget does not show false $0.00
      expect(html).toContain("Unavailable");
      expect(html).toContain("PostgreSQL Standby");
      expect(html).toContain("Authoritative budget data offline");
      expect(html).not.toContain("$0.00");
    });

    it("displays authoritative spend calculation with Authoritative badge when API data exists", () => {
      const html = renderToString(
        React.createElement(GovernanceDashboardPanel, {
          onNavigateWorkstation: vi.fn(),
          initialApprovals: [mockApprovals[0]], // has remainingSpendMinor: 4500
          initialApprovalsState: "READY",
          initialLoading: false,
        }),
      );

      expect(html).toContain("$45.00");
      expect(html).toContain("Authoritative");
      expect(html).toContain("Cap: $60.00");
    });

    it("does not misrepresent unavailable reconciliation alerts as zero alerts", () => {
      const html = renderToString(
        React.createElement(GovernanceDashboardPanel, {
          onNavigateWorkstation: vi.fn(),
          initialPaymentOrders: [],
          initialReconciliationAlerts: {
            unreconciledOrders: [],
            heldReservations: [],
            totalAlerts: 0,
            state: "UNAVAILABLE",
          },
          initialLoading: false,
        }),
      );

      // Verifies notice is present indicating checks are on standby, rather than claiming all clean
      expect(html).toContain("Reconciliation Checks Standby");
      expect(html).toContain("Missing data is not zero alerts");
    });

    it("displays retryable error state when approvals API request fails", () => {
      const html = renderToString(
        React.createElement(GovernanceDashboardPanel, {
          onNavigateWorkstation: vi.fn(),
          initialApprovals: [],
          initialApprovalsState: "ERROR",
          initialLoading: false,
        }),
      );

      expect(html).toContain("Sync Error");
      expect(html).toContain("Retryable connection failure");
      expect(html).not.toContain("$0.00");
    });

    it("displays spend reservations breakdown with active holds and committed states", () => {
      const html = renderToString(
        React.createElement(GovernanceDashboardPanel, defaultDashboardProps),
      );

      expect(html).toContain("Spend Reservations");
      expect(html).toContain("Active Holds");
      expect(html).toContain("Committed");
      expect(html).toContain("Reconciliation Hold");
    });
  });
});
