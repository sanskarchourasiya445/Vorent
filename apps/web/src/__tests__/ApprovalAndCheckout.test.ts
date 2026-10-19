import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { fetchApprovals, createApproval, revokeApproval } from "../api/approvalService";
import { requestCheckoutNonce, submitCheckoutProposal } from "../api/checkoutService";
import { ApprovalPanel } from "../components/approval/ApprovalPanel";
import { CheckoutGatePanel } from "../components/checkout/CheckoutGatePanel";
import { ReasonCode } from "@warrant/contracts";

describe("Approval Checkpoints and Checkout Gate Suite", () => {
  it("1. fetchApprovals returns UNAVAILABLE when backend route is not mounted (404)", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("Not Found", { status: 404 });

    try {
      const result = await fetchApprovals();
      expect(result.state).toBe("UNAVAILABLE");
      if (result.state === "UNAVAILABLE") {
        expect(result.message).toContain("not yet mounted");
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("2. fetchApprovals returns UNAVAILABLE when database is in standby (503)", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("Service Unavailable", { status: 503 });

    try {
      const result = await fetchApprovals();
      expect(result.state).toBe("UNAVAILABLE");
      if (result.state === "UNAVAILABLE") {
        expect(result.message).toContain("PostgreSQL database is in standby mode");
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("3. fetchApprovals returns EMPTY when 0 approvals are stored", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () =>
      new Response(JSON.stringify({ approvals: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    try {
      const result = await fetchApprovals();
      expect(result.state).toBe("EMPTY");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("4. fetchApprovals returns READY with active and expired approvals", async () => {
    const originalFetch = globalThis.fetch;
    const futureDate = new Date(Date.now() + 86400000).toISOString();
    const pastDate = new Date(Date.now() - 86400000).toISOString();

    const mockApprovals = [
      {
        id: "appr_active_001",
        policyVersionId: "pol_v1_books_hardware",
        policyName: "Engineering Hardware & Technical Books Policy",
        policyHash: "a4f912b7e53c4d89a290bc9812efaa43217d8900fe5b81a91e5d7a810b45cd2e",
        qualifyingTestRunId: "run_test_001",
        spendLimitMinor: 60000,
        consumedSpendMinor: 15000,
        currency: "USD",
        expiresAt: futureDate,
        createdAt: "2026-10-19T10:00:00Z",
      },
      {
        id: "appr_expired_002",
        policyVersionId: "pol_v1_books_hardware",
        policyHash: "a4f912b7e53c4d89a290bc9812efaa43217d8900fe5b81a91e5d7a810b45cd2e",
        qualifyingTestRunId: "run_test_002",
        spendLimitMinor: 30000,
        consumedSpendMinor: 0,
        currency: "USD",
        expiresAt: pastDate,
        createdAt: "2026-10-18T10:00:00Z",
      },
    ];

    globalThis.fetch = async () =>
      new Response(JSON.stringify({ approvals: mockApprovals }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });

    try {
      const result = await fetchApprovals();
      expect(result.state).toBe("READY");
      if (result.state === "READY") {
        expect(result.data).toHaveLength(2);
        expect(result.data[0].status).toBe("ACTIVE");
        expect(result.data[1].status).toBe("EXPIRED");
        expect(result.data[0].spendLimitMinor).toBe(60000);
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("5. createApproval and revokeApproval handle 404 and 503 honestly", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("Standby", { status: 503 });

    try {
      await expect(
        createApproval({
          policyVersionId: "pol_v1",
          policyHash: "a".repeat(64),
          spendLimitMinor: 50000,
          currency: "USD",
          expiresInHours: 24,
        }),
      ).rejects.toThrow("standby mode");
    } finally {
      globalThis.fetch = originalFetch;
    }

    globalThis.fetch = async () => new Response("Not Found", { status: 404 });
    try {
      await expect(revokeApproval("appr_001")).rejects.toThrow("not yet mounted");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("6. requestCheckoutNonce handles 404 and 503 by throwing honest error", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("Not Found", { status: 404 });

    try {
      await expect(requestCheckoutNonce("appr_001")).rejects.toThrow("not yet mounted");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("6. submitCheckoutProposal simulation permits compliant book purchase ($45.00)", async () => {
    const result = await submitCheckoutProposal({
      approvalId: "appr_001",
      merchantName: "Technical Bookstore",
      items: [
        {
          id: "item_01",
          name: "Designing Data-Intensive Applications",
          category: "Reference Books",
          unitPriceMinor: 4500,
          quantity: 1,
        },
      ],
      currency: "USD",
      useOfflineSimulation: true,
    });

    expect(result.decision).toBe("ALLOW");
    expect(result.primaryReasonCode).toBe(ReasonCode.ALL_RULES_PASSED);
    expect(result.cartTotalMinor).toBe(4500);
    expect(result.reservationState).toBe("ORDER_CREATION_PENDING");
    expect(result.isDemoSimulation).toBe(true);
    expect(result.isLiveApi).toBe(false);
  });

  it("7. submitCheckoutProposal simulation denies prohibited gift card ($50.00)", async () => {
    const result = await submitCheckoutProposal({
      approvalId: "appr_001",
      merchantName: "Card Vendor",
      items: [
        {
          id: "item_02",
          name: "Gift Card",
          category: "Gift Cards",
          unitPriceMinor: 5000,
          quantity: 1,
        },
      ],
      currency: "USD",
      useOfflineSimulation: true,
    });

    expect(result.decision).toBe("DENY");
    expect(result.primaryReasonCode).toBe(ReasonCode.PROHIBITED_CATEGORY);
    expect(result.reasonCodes).toContain(ReasonCode.PROHIBITED_CATEGORY);
    expect(result.reservationState).toBeUndefined();
  });

  it("8. submitCheckoutProposal simulation denies item exceeding unit ceiling ($750.00)", async () => {
    const result = await submitCheckoutProposal({
      approvalId: "appr_001",
      merchantName: "Hardware Shop",
      items: [
        {
          id: "item_03",
          name: "High-End Server Board",
          category: "Hardware",
          unitPriceMinor: 75000,
          quantity: 1,
        },
      ],
      currency: "USD",
      useOfflineSimulation: true,
    });

    expect(result.decision).toBe("DENY");
    expect(result.primaryReasonCode).toBe(ReasonCode.ITEM_PRICE_LIMIT_EXCEEDED);
  });

  it("9. submitCheckoutProposal simulation denies quantity split exceeding cart total ($660.00)", async () => {
    const result = await submitCheckoutProposal({
      approvalId: "appr_001",
      merchantName: "Hardware Shop",
      items: [
        {
          id: "item_04",
          name: "Keyboard Unit",
          category: "Hardware",
          unitPriceMinor: 22000,
          quantity: 3,
        },
      ],
      currency: "USD",
      useOfflineSimulation: true,
    });

    expect(result.decision).toBe("DENY");
    expect(result.primaryReasonCode).toBe(ReasonCode.CART_TOTAL_LIMIT_EXCEEDED);
    expect(result.cartTotalMinor).toBe(66000);
  });

  it("10. submitCheckoutProposal handles 409 nonce replay error honestly", async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => new Response("Conflict", { status: 409 });

    try {
      await expect(
        submitCheckoutProposal({
          approvalId: "appr_001",
          merchantName: "Shop",
          items: [],
          currency: "USD",
          useOfflineSimulation: false,
        }),
      ).rejects.toThrow("Nonce Replay Detected");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("11. ApprovalPanel renders standby state and header correctly", () => {
    const html = renderToStaticMarkup(React.createElement(ApprovalPanel));
    expect(html).toContain("Approval Checkpoints");
    expect(html).toContain("Authorizes an exact verified, immutable policy version");
    expect(html).toContain("New Approval");
  });

  it("12. CheckoutGatePanel renders scenarios, line items, and gate notice correctly", () => {
    const html = renderToStaticMarkup(React.createElement(CheckoutGatePanel));
    expect(html).toContain("Checkout Authorization Gate");
    expect(html).toContain("Proposed Cart Manifest");
    expect(html).toContain("Single-Use Cryptographic Nonce");
    expect(html).toContain("Submit to Authorization Gate");
    expect(html).toContain("Use Offline Simulation");
  });
});
