import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import { EvaluationReportPanel } from "../components/evaluation/EvaluationReportPanel";
import { InvariantCheckCard } from "../components/evaluation/InvariantCheckCard";
import { BoundedSearchLimitsCard } from "../components/evaluation/BoundedSearchLimitsCard";
import { AuditTrailCard } from "../components/evaluation/AuditTrailCard";
import { EvidencePacketCard } from "../components/evaluation/EvidencePacketCard";
import {
  getInitialEvaluationState,
  runDeterministicInvariants,
  evaluatePersistedInvariants,
  DEFAULT_SEARCH_BOUNDS,
  fetchEvidencePacket,
  fetchAuditTrail,
  downloadEvidencePacket,
  evaluatePolicyFixture,
} from "../api/evaluationService";
import type {
  SecurityInvariantCheck,
  PersistedAuditEvidence,
  EvidencePacket,
  AuditEventRecord,
} from "../types/evaluation";

describe("Evaluation Report Workstation (Workstation 9) Suite", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const sampleEvidencePacket: EvidencePacket = {
    packetId: "pkt_test_000000000001",
    packetVersion: "1.0.0",
    generatedAt: "2026-10-20T00:00:00.000Z",
    packetHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    target: {
      entityType: "CHECKOUT_PROPOSAL",
      entityId: "prop_000000000001",
    },
    mandateProvenance: {
      sourceMandate: "Purchase allowed office books under $50 USD",
      intentSpec: { budget: 50, category: "Reference Books" },
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
      testRunStatus: "COMPLETED",
      candidatesExplored: 184,
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
      primaryReasonCode: "ALL_RULES_PASSED",
      reasonCodes: ["ALL_RULES_PASSED"],
      evaluatedAt: "2026-10-20T00:00:00.000Z",
      consumedNonceId: "nonce_000000000001",
      cartSnapshot: { totalAmountMinor: 4800, currency: "USD" },
      evidenceSnapshot: { verifiedSupplier: true },
      ruleTrace: [],
    },
    paymentLifecycle: {
      paymentOrderId: "po_000000000001",
      provider: "PAYPAL_SANDBOX",
      providerOrderId: "7SY090644K3801703",
      status: "CREATED",
      amountMinor: 4800,
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

  const sampleAuditEvent: AuditEventRecord = {
    id: "a0000000-0000-0000-0000-000000000001",
    actorType: "SYSTEM",
    eventType: "CHECKOUT_PROPOSAL_EVALUATED",
    entityType: "CHECKOUT_PROPOSAL",
    entityId: "prop_000000000001",
    payload: { decision: "ALLOW", amountMinor: 4800 },
    createdAt: "2026-10-20T00:00:00.000Z",
  };

  describe("1. Initial State & Honest Invariant Reporting (NFR-010)", () => {
    it("never displays a successful security check before its required test has run", () => {
      const initialState = getInitialEvaluationState();

      expect(initialState.executedAt).toBeNull();
      expect(initialState.passedChecks).toBe(0);
      expect(initialState.failedChecks).toBe(0);
      expect(initialState.untestedChecks).toBe(6);

      // Verify all 6 security invariants are UNTESTED
      expect(initialState.invariants).toHaveLength(6);
      for (const inv of initialState.invariants) {
        expect(inv.status).toBe("UNTESTED");
        expect(inv.testedAt).toBeNull();
        expect(inv.actualDecision).toBeNull();
      }
    });

    it("renders initial UNTESTED scoreboard and banner in server-rendered markup", () => {
      const markup = renderToString(React.createElement(EvaluationReportPanel));

      expect(markup).toContain("Evaluation Report &amp; Invariant Evidence Hub");
      expect(markup).toContain("Workstation 9 of 9");
      expect(markup).toContain("Suite Ready for Execution");
      expect(markup).toContain("UNTESTED");
      expect(markup).toContain("Execute Invariant Suite");
      expect(markup).toContain("Refresh Audit");
    });

    it("renders all 6 declared security invariant IDs", () => {
      const markup = renderToString(React.createElement(EvaluationReportPanel));

      expect(markup).toContain("INV-01");
      expect(markup).toContain("INV-02");
      expect(markup).toContain("INV-03");
      expect(markup).toContain("INV-04");
      expect(markup).toContain("INV-05");
      expect(markup).toContain("INV-06");
    });

    it("renders sub-navigation tabs for Invariants, Audit Trail, and Evidence Packet", () => {
      const markup = renderToString(React.createElement(EvaluationReportPanel));

      expect(markup).toContain("Security Invariants &amp; Report");
      expect(markup).toContain("Audit Trail &amp; Ledger");
      expect(markup).toContain("Evidence Packet &amp; Export");
    });
  });

  describe("2. Deterministic Security Invariant Execution", () => {
    it("executes deterministic invariants and catches seeded loophole in INV-01", async () => {
      const results = await runDeterministicInvariants();

      expect(results).toHaveLength(3);

      // INV-01: Seeded Loophole Detection
      const inv1 = results.find((r) => r.id === "INV-01");
      expect(inv1).toBeDefined();
      expect(inv1?.status).toBe("PASS");
      expect(inv1?.actualDecision).toContain("COUNTEREXAMPLE_DETECTED");
      expect(inv1?.notes).toContain("Verified: Flawed policy without whole-cart limit was detected");

      // INV-02: Defect Repair & Regression Stability
      const inv2 = results.find((r) => r.id === "INV-02");
      expect(inv2).toBeDefined();
      expect(inv2?.status).toBe("PASS");
      expect(inv2?.actualDecision).toContain("ALLOW (Book DDIA $48.00) + DENY (Gift Card $100.00)");
      expect(inv2?.notes).toContain("PROHIBITED_CATEGORY");

      // INV-03: Fail-Closed Gate Determinism
      const inv3 = results.find((r) => r.id === "INV-03");
      expect(inv3).toBeDefined();
      expect(inv3?.status).toBe("PASS");
      expect(inv3?.actualDecision).toContain("REVIEW (MISSING_CRITICAL_EVIDENCE)");
      expect(inv3?.ruleTrace?.length).toBeGreaterThan(0);
    });

    it("InvariantCheckCard renders distinct visual indicators for PASS, FAIL, WARNING, and UNTESTED", () => {
      const baseCheck: SecurityInvariantCheck = {
        id: "INV-01",
        name: "Test Invariant",
        category: "DETERMINISTIC_FIXTURE",
        description: "Invariant description text",
        status: "UNTESTED",
        testedAt: null,
        inputSummary: "Test input summary",
        expectedDecision: "DENY",
        actualDecision: null,
        notes: "Auditor test notes",
      };

      // 1. UNTESTED
      const untestedMarkup = renderToString(React.createElement(InvariantCheckCard, { check: baseCheck }));
      expect(untestedMarkup).toContain("UNTESTED");
      expect(untestedMarkup).toContain("bg-slate-100");

      // 2. PASS
      const passMarkup = renderToString(
        React.createElement(InvariantCheckCard, {
          check: { ...baseCheck, status: "PASS", actualDecision: "DENY" },
        }),
      );
      expect(passMarkup).toContain("VERIFIED PASS");
      expect(passMarkup).toContain("bg-emerald-50");

      // 3. FAIL
      const failMarkup = renderToString(
        React.createElement(InvariantCheckCard, {
          check: { ...baseCheck, status: "FAIL", actualDecision: "ALLOW" },
        }),
      );
      expect(failMarkup).toContain("VIOLATION DETECTED");
      expect(failMarkup).toContain("bg-rose-50");

      // 4. WARNING
      const warnMarkup = renderToString(
        React.createElement(InvariantCheckCard, {
          check: { ...baseCheck, status: "WARNING", actualDecision: "STANDBY" },
        }),
      );
      expect(warnMarkup).toContain("WARNING / STANDBY");
      expect(warnMarkup).toContain("bg-amber-50");
    });

    it("InvariantCheckCard renders evidence provenance badges", () => {
      const baseCheck: SecurityInvariantCheck = {
        id: "INV-01",
        name: "Test Check",
        category: "DETERMINISTIC_FIXTURE",
        description: "Description",
        status: "PASS",
        testedAt: "2026-10-20T00:00:00.000Z",
        inputSummary: "Input summary",
        expectedDecision: "PASS",
        actualDecision: "VERIFIED",
        notes: "Notes",
        evidenceType: "PERSISTED_DATABASE",
        evidenceDetails: "12 payment orders audited with 0 violations.",
        limitations: "Requires connected database.",
      };

      // 1. PERSISTED_DATABASE
      const dbMarkup = renderToString(React.createElement(InvariantCheckCard, { check: baseCheck }));
      expect(dbMarkup).toContain("Persisted Database Evidence");

      // 2. UNIT_FIXTURE
      const fixtureMarkup = renderToString(
        React.createElement(InvariantCheckCard, {
          check: { ...baseCheck, evidenceType: "UNIT_FIXTURE", category: "DETERMINISTIC_FIXTURE" },
        }),
      );
      expect(fixtureMarkup).toContain("Deterministic Unit Fixture");

      // 3. REPRODUCIBLE_SEARCH
      const searchMarkup = renderToString(
        React.createElement(InvariantCheckCard, {
          check: { ...baseCheck, evidenceType: "REPRODUCIBLE_SEARCH" },
        }),
      );
      expect(searchMarkup).toContain("Reproducible Bounded Search");

      // 4. UNTESTED
      const untestedMarkup = renderToString(
        React.createElement(InvariantCheckCard, {
          check: { ...baseCheck, status: "UNTESTED", evidenceType: "NONE" },
        }),
      );
      expect(untestedMarkup).toContain("Untested Invariant");
    });
  });

  describe("3. Persisted Operational & Payment Evidence Handling", () => {
    it("handles database standby gracefully and sets persisted invariants to WARNING without false success", () => {
      const standbyEvidence: PersistedAuditEvidence = {
        state: "STANDBY",
        totalPersistedRuns: 0,
        totalPaymentOrders: 0,
        reconciliationAlertsCount: 0,
        totalSpendReservations: 0,
        unauthorizedOrdersCount: 0,
        message: "PostgreSQL in standby mode",
      };

      const persistedResults = evaluatePersistedInvariants(standbyEvidence);

      expect(persistedResults).toHaveLength(3);

      const inv4 = persistedResults.find((r) => r.id === "INV-04");
      expect(inv4?.status).toBe("WARNING");
      expect(inv4?.notes).toContain("PostgreSQL database in standby mode");

      const inv5 = persistedResults.find((r) => r.id === "INV-05");
      expect(inv5?.status).toBe("WARNING");

      const inv6 = persistedResults.find((r) => r.id === "INV-06");
      expect(inv6?.status).toBe("WARNING");
    });

    it("verifies Invariant 4 passes when live database is ready and unauthorized orders count is zero", () => {
      const readyEvidence: PersistedAuditEvidence = {
        state: "READY",
        totalPersistedRuns: 5,
        totalPaymentOrders: 12,
        reconciliationAlertsCount: 0,
        totalSpendReservations: 12,
        unauthorizedOrdersCount: 0,
        lastCheckedAt: new Date().toISOString(),
      };

      const persistedResults = evaluatePersistedInvariants(readyEvidence);

      const inv4 = persistedResults.find((r) => r.id === "INV-04");
      expect(inv4?.status).toBe("PASS");
      expect(inv4?.actualDecision).toContain("12 orders checked");

      const inv6 = persistedResults.find((r) => r.id === "INV-06");
      expect(inv6?.status).toBe("PASS");
      expect(inv6?.actualDecision).toBe("ZERO_RECONCILIATION_ALERTS");
    });

    it("flags WARNING on Invariant 6 when active reconciliation alerts exist", () => {
      const alertEvidence: PersistedAuditEvidence = {
        state: "READY",
        totalPersistedRuns: 5,
        totalPaymentOrders: 10,
        reconciliationAlertsCount: 2, // 2 active holds
        totalSpendReservations: 10,
        unauthorizedOrdersCount: 0,
        lastCheckedAt: new Date().toISOString(),
      };

      const persistedResults = evaluatePersistedInvariants(alertEvidence);

      const inv6 = persistedResults.find((r) => r.id === "INV-06");
      expect(inv6?.status).toBe("WARNING");
      expect(inv6?.actualDecision).toContain("2 ACTIVE_ALERTS");
      expect(inv6?.notes).toContain("require manual operator reconciliation");
    });
  });

  describe("4. Audit Trail Card & Security Ledger Inspection", () => {
    it("renders loading state when isLoading is true", () => {
      const markup = renderToString(
        React.createElement(AuditTrailCard, {
          auditResult: { state: "IDLE", events: [], total: 0 },
          isLoading: true,
          onRefresh: vi.fn(),
        }),
      );

      expect(markup).toContain("Querying authoritative audit trail...");
    });

    it("renders standby banner when database is in standby", () => {
      const markup = renderToString(
        React.createElement(AuditTrailCard, {
          auditResult: {
            state: "STANDBY",
            events: [],
            total: 0,
            message: "Database in standby mode.",
          },
          isLoading: false,
          onRefresh: vi.fn(),
        }),
      );

      expect(markup).toContain("Database Persistence in Standby");
      expect(markup).toContain("Database in standby mode.");
      expect(markup).toContain("Retry Connection");
    });

    it("renders empty state when zero audit events exist", () => {
      const markup = renderToString(
        React.createElement(AuditTrailCard, {
          auditResult: { state: "EMPTY", events: [], total: 0 },
          isLoading: false,
          onRefresh: vi.fn(),
        }),
      );

      expect(markup).toContain("Zero Audit Events Found");
    });

    it("renders audit events table with actors and event types when events are present", () => {
      const markup = renderToString(
        React.createElement(AuditTrailCard, {
          auditResult: {
            state: "READY",
            events: [sampleAuditEvent],
            total: 1,
          },
          isLoading: false,
          onRefresh: vi.fn(),
        }),
      );

      expect(markup).toContain("CHECKOUT_PROPOSAL_EVALUATED");
      expect(markup).toContain("CHECKOUT_PROPOSAL");
      expect(markup).toContain("prop_000000000001");
      expect(markup).toContain("SYSTEM");
      expect(markup).toContain("Inspect");
    });
  });

  describe("5. Evidence Packet Card & Export Actions", () => {
    it("renders loading state when isLoading is true", () => {
      const markup = renderToString(
        React.createElement(EvidencePacketCard, {
          packetResult: { state: "LOADING", packet: null },
          isLoading: true,
          onRefresh: vi.fn(),
        }),
      );

      expect(markup).toContain("Assembling cryptographic evidence packet");
    });

    it("renders unavailable state and disables export action when packet is unavailable", () => {
      const markup = renderToString(
        React.createElement(EvidencePacketCard, {
          packetResult: {
            state: "UNAVAILABLE",
            packet: null,
            message: "Endpoint /api/evaluation/evidence-packet is not mounted.",
          },
          isLoading: false,
          onRefresh: vi.fn(),
        }),
      );

      expect(markup).toContain("Evidence Packet Endpoint Not Available");
      expect(markup).toContain("Export Unavailable");
      expect(markup).toContain("cursor-not-allowed");
    });

    it("renders full verified evidence packet preview with SHA-256 digest when valid packet exists", () => {
      const markup = renderToString(
        React.createElement(EvidencePacketCard, {
          packetResult: {
            state: "READY",
            packet: sampleEvidencePacket,
          },
          isLoading: false,
          onRefresh: vi.fn(),
        }),
      );

      expect(markup).toContain("pkt_test_000000000001");
      expect(markup).toContain("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
      expect(markup).toContain("Purchase allowed office books under $50 USD");
      expect(markup).toContain("pol_000000000001");
      expect(markup).toContain("a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2");
      expect(markup).toContain("PAYPAL_SANDBOX");
      expect(markup).toContain("7SY090644K3801703");
      expect(markup).toContain("All provider client secrets, bearer tokens, and private keys are redacted.");
      expect(markup).toContain("Export Evidence Packet (JSON)");
    });
  });

  describe("6. API Failure and Retrieval Contracts", () => {
    it("fetchEvidencePacket returns UNAVAILABLE when endpoint responds with 404", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        status: 404,
        ok: false,
        statusText: "Not Found",
        json: async () => ({ error: "Not Found" }),
      });

      const res = await fetchEvidencePacket();
      expect(res.state).toBe("UNAVAILABLE");
      expect(res.packet).toBeNull();
      expect(res.message).toContain("404");
    });

    it("fetchEvidencePacket returns ERROR when payload fails schema validation", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ packet: { invalid: "payload", missingFields: true } }),
      });

      const res = await fetchEvidencePacket();
      expect(res.state).toBe("ERROR");
      expect(res.packet).toBeNull();
      expect(res.message).toContain("EvidencePacketResponseSchema validation");
    });

    it("fetchEvidencePacket returns READY when payload is schema-valid", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ packet: sampleEvidencePacket }),
      });

      const res = await fetchEvidencePacket();
      expect(res.state).toBe("READY");
      expect(res.packet?.packetId).toBe("pkt_test_000000000001");
      expect(res.packet?.overallStatus).toBe("PASS");
    });

    it("fetchEvidencePacket queries exact proposal endpoint when CHECKOUT_PROPOSAL is requested", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ packet: sampleEvidencePacket }),
      });
      global.fetch = fetchMock;

      await fetchEvidencePacket({ entityType: "CHECKOUT_PROPOSAL", entityId: "prop_abc_123" });
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/evidence-packets/proposals/prop_abc_123"),
        expect.anything()
      );
    });

    it("fetchEvidencePacket queries exact order endpoint when PAYMENT_ORDER is requested", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ packet: sampleEvidencePacket }),
      });
      global.fetch = fetchMock;

      await fetchEvidencePacket({ entityType: "PAYMENT_ORDER", entityId: "ord_xyz_789" });
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/evidence-packets/orders/ord_xyz_789"),
        expect.anything()
      );
    });

    it("fetchEvidencePacket queries exact policy endpoint when POLICY_VERSION is requested", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ packet: sampleEvidencePacket }),
      });
      global.fetch = fetchMock;

      await fetchEvidencePacket({ entityType: "POLICY_VERSION", entityId: "pol_v2_custom" });
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/evidence-packets/policies/pol_v2_custom"),
        expect.anything()
      );
    });

    it("fetchEvidencePacket defaults to policy version endpoint pol_v1_books_hardware without generic fallback", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ packet: sampleEvidencePacket }),
      });
      global.fetch = fetchMock;

      await fetchEvidencePacket();
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining("/api/evidence-packets/policies/pol_v1_books_hardware"),
        expect.anything()
      );
    });

    it("downloadEvidencePacket throws error if called with an invalid packet", () => {
      expect(() => {
        downloadEvidencePacket({} as any);
      }).toThrow("failed EvidencePacketSchema validation");
    });

    it("fetchAuditTrail returns events when endpoint succeeds", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
        json: async () => ({ events: [sampleAuditEvent], total: 1 }),
      });

      const res = await fetchAuditTrail();
      expect(res.state).toBe("READY");
      expect(res.events).toHaveLength(1);
      expect(res.total).toBe(1);
    });

    it("fetchAuditTrail returns STANDBY when endpoint responds with 503", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        status: 503,
        ok: false,
        statusText: "Service Unavailable",
      });

      const res = await fetchAuditTrail();
      expect(res.state).toBe("STANDBY");
      expect(res.message).toContain("standby mode");
    });
  });

  describe("7. Bounded Search Limits & Scope Limitations (NFR-010)", () => {
    it("renders bounded search parameters and server-clamped limits", () => {
      const markup = renderToString(
        React.createElement(BoundedSearchLimitsCard, { limits: DEFAULT_SEARCH_BOUNDS }),
      );

      expect(markup).toContain("Bounded Search Space Specification &amp; Scope (NFR-010)");
      expect(markup).toContain("Domain v1.0.0");
      expect(markup).toContain("Hardware");
      expect(markup).toContain("Reference Books");
      expect(markup).toContain("Peripherals");
      expect(markup).toContain("Gift Cards");
      expect(markup).toContain("500 candidates");
      expect(markup).toContain("2,000 (Server-clamped)");
      expect(markup).toContain("5000ms");
    });

    it("renders explicit formal scope limitation disclosures", () => {
      const markup = renderToString(
        React.createElement(BoundedSearchLimitsCard, { limits: DEFAULT_SEARCH_BOUNDS }),
      );

      expect(markup).toContain("Formal Scope Limitations &amp; Safety Governance Disclosures");
      expect(markup).toContain("Bounded search operates solely over the declared finite catalog domain");
      expect(markup).toContain("Merchant product evidence relies on verifiable digital quotes");
      expect(markup).toContain("PayPal Sandbox order creation is strictly server-gated");
    });
  });

  describe("8. Navigation and Cross-links", () => {
    it("renders navigation buttons when onNavigateWorkstation is supplied", () => {
      const navigateMock = vi.fn();
      const markup = renderToString(
        React.createElement(EvaluationReportPanel, { onNavigateWorkstation: navigateMock }),
      );

      expect(markup).toContain("Open Verification Studio");
      expect(markup).toContain("Return to System Dashboard");
    });
  });

  describe("9. INV-02 Policy Evaluation & Regression Tests (LEAN-002)", () => {
    const repairedPolicy = {
      schemaVersion: "1.0" as const,
      currency: "USD",
      maxItemPriceMinor: 25000,
      maxCartTotalMinor: 60000,
      allowedCategories: ["Hardware", "Reference Books", "Peripherals"],
      prohibitedCategories: ["Weapons / Lasers", "Adult", "Gift Cards"],
      requireEvidence: true,
    };

    it("correctly evaluates compliant reference book fixture to ALLOW", () => {
      const result = evaluatePolicyFixture(repairedPolicy, {
        title: "Designing Data-Intensive Applications",
        category: "Reference Books",
        priceMinor: 4800,
        currency: "USD",
      });

      expect(result.decision).toBe("ALLOW");
      expect(result.primaryReasonCode).toBe("ALL_RULES_PASSED");
      expect(result.trace.outcome).toBe("PASS");
      expect(result.trace.message).toContain("<= $250.00 limit");
    });

    it("correctly evaluates prohibited digital gift card fixture to DENY", () => {
      const result = evaluatePolicyFixture(repairedPolicy, {
        title: "Digital Gift Card",
        category: "Gift Cards",
        priceMinor: 10000,
        currency: "USD",
      });

      expect(result.decision).toBe("DENY");
      expect(result.primaryReasonCode).toBe("PROHIBITED_CATEGORY");
      expect(result.trace.outcome).toBe("FAIL");
      expect(result.trace.message).toContain("matches prohibited rule");
    });

    it("proves INV-02 is not unconditionally PASS: flawed policy permitting gift cards fails denial check", () => {
      const flawedPolicy = {
        ...repairedPolicy,
        prohibitedCategories: [],
        allowedCategories: ["Reference Books", "Gift Cards"],
      };

      const result = evaluatePolicyFixture(flawedPolicy, {
        title: "Digital Gift Card",
        category: "Gift Cards",
        priceMinor: 10000,
        currency: "USD",
      });

      // Should ALLOW since it is not prohibited and is in allowedCategories
      expect(result.decision).toBe("ALLOW");
      // The invariant requires DENY for gift cards; receiving ALLOW means the denial check fails
      const giftCardDenied = result.decision === "DENY";
      expect(giftCardDenied).toBe(false);
    });

    it("proves INV-02 is not unconditionally PASS: restrictive ceiling denying book fails allowance check", () => {
      const overlyRestrictedPolicy = {
        ...repairedPolicy,
        maxItemPriceMinor: 2000, // $20.00 ceiling < $48.00 book
      };

      const result = evaluatePolicyFixture(overlyRestrictedPolicy, {
        title: "Designing Data-Intensive Applications",
        category: "Reference Books",
        priceMinor: 4800,
        currency: "USD",
      });

      expect(result.decision).toBe("DENY");
      expect(result.primaryReasonCode).toBe("ITEM_PRICE_LIMIT_EXCEEDED");
      // The invariant requires ALLOW for books; receiving DENY means the allowance check fails
      const bookAllowed = result.decision === "ALLOW";
      expect(bookAllowed).toBe(false);
    });

    it("fails closed to DENY when item currency does not match policy currency", () => {
      const result = evaluatePolicyFixture(repairedPolicy, {
        title: "Designing Data-Intensive Applications",
        category: "Reference Books",
        priceMinor: 4800,
        currency: "EUR",
      });

      expect(result.decision).toBe("DENY");
      expect(result.primaryReasonCode).toBe("CURRENCY_MISMATCH");
    });
  });
});
