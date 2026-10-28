import { describe, it, expect } from "vitest";
import { emailService } from "../services/emailService.js";
import {
  renderApprovalGrantedEmail,
  renderApprovalRevokedEmail,
  renderOrderConfirmationEmail,
  renderReconciliationAlertEmail,
  escapeHtml,
  formatCurrency,
} from "../templates/email/index.js";
import {
  type ApprovalGrantedEmailPayload,
  type ApprovalRevokedEmailPayload,
  type OrderCapturedEmailPayload,
  type ReconciliationAlertEmailPayload,
} from "@warrant/contracts";

describe("Email Templates & Formatting", () => {
  it("escapes HTML unsafe characters properly", () => {
    const raw = '<script>alert("xss & \'danger\'")</script>';
    const escaped = escapeHtml(raw);
    expect(escaped).not.toContain("<script>");
    expect(escaped).toContain("&lt;script&gt;");
    expect(escaped).toContain("&amp;");
    expect(escaped).toContain("&quot;");
    expect(escaped).toContain("&#039;");
  });

  it("formats currency accurately", () => {
    expect(formatCurrency(150.5, "USD")).toBe("$150.50");
    expect(formatCurrency(0, "USD")).toBe("$0.00");
  });

  it("renders approval granted email correctly with policy hash and spend cap", () => {
    const payload: ApprovalGrantedEmailPayload = {
      recipientEmail: "buyer@example.com",
      recipientName: "Alice User",
      approvalId: "app-test-1234",
      policyId: "pol-ver-5678",
      policyHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      spendCap: 250,
      currency: "USD",
      expiresAt: "2026-12-31T23:59:59.000Z",
      grantedBy: "Compliance Officer",
    };

    const rendered = renderApprovalGrantedEmail(payload);
    expect(rendered.subject).toContain("app-test-1234");
    expect(rendered.html).toContain("Alice User");
    expect(rendered.html).toContain("$250.00");
    expect(rendered.html).toContain("app-test-1234");
    expect(rendered.html).toContain("Compliance Officer");
    expect(rendered.text).toContain("app-test-1234");
    expect(rendered.text).toContain("$250.00");
  });

  it("renders approval revoked email correctly with reason and warning banner", () => {
    const payload: ApprovalRevokedEmailPayload = {
      recipientEmail: "buyer@example.com",
      recipientName: "Bob Requester",
      approvalId: "app-revoked-999",
      policyId: "pol-ver-111",
      revokedReason: "Suspected security violation on checkout endpoint",
      revokedAt: "2026-10-26T12:00:00.000Z",
      revokedBy: "Security Lead",
    };

    const rendered = renderApprovalRevokedEmail(payload);
    expect(rendered.subject).toContain("Spend Approval Revoked: app-revoked-999");
    expect(rendered.html).toContain("Suspected security violation");
    expect(rendered.html).toContain("Security Lead");
    expect(rendered.text).toContain("REVOKED");
    expect(rendered.text).toContain("Security Lead");
  });

  it("renders order confirmation email with line items and totals", () => {
    const payload: OrderCapturedEmailPayload = {
      recipientEmail: "shopper@example.com",
      recipientName: "Charlie",
      orderId: "ord-test-888",
      paypalOrderId: "PAYPAL-ORDER-777",
      captureId: "CAPTURE-ID-999",
      approvalId: "app-test-1234",
      amount: 45.99,
      currency: "USD",
      items: [
        { name: "Dev Laptop Stand", quantity: 1, unitPrice: 35.0 },
        { name: "USB-C Adapter", quantity: 2, unitPrice: 5.495 },
      ],
      capturedAt: "2026-10-26T14:30:00.000Z",
      policyHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    };

    const rendered = renderOrderConfirmationEmail(payload);
    expect(rendered.subject).toContain("Order ord-test-888");
    expect(rendered.html).toContain("Dev Laptop Stand");
    expect(rendered.html).toContain("PAYPAL-ORDER-777");
    expect(rendered.html).toContain("CAPTURE-ID-999");
    expect(rendered.html).toContain("$45.99");
    expect(rendered.text).toContain("Dev Laptop Stand");
    expect(rendered.text).toContain("CAPTURE-ID-999");
  });

  it("renders reconciliation alert email with discrepancy details", () => {
    const payload: ReconciliationAlertEmailPayload = {
      recipientEmail: "auditor@example.com",
      orderId: "ord-discrepancy-001",
      discrepancyType: "AMOUNT_MISMATCH",
      expectedAmount: 100.0,
      actualAmount: 120.0,
      currency: "USD",
      detectedAt: "2026-10-26T15:00:00.000Z",
      reason: "External gateway reported $120.00 but policy authorized maximum $100.00.",
    };

    const rendered = renderReconciliationAlertEmail(payload);
    expect(rendered.subject).toContain("ALERT");
    expect(rendered.subject).toContain("ord-discrepancy-001");
    expect(rendered.html).toContain("AMOUNT_MISMATCH");
    expect(rendered.html).toContain("$100.00");
    expect(rendered.html).toContain("$120.00");
    expect(rendered.html).toContain("External gateway reported $120.00");
  });
});

describe("EmailService Operations", () => {
  it("operates in mock mode in test environment", async () => {
    const result = await emailService.sendApprovalGranted({
      recipientEmail: "test@example.com",
      approvalId: "app-test-mock",
      policyId: "pol-test-mock",
      policyHash: "abc123hash",
      spendCap: 100,
      currency: "USD",
      expiresAt: new Date(Date.now() + 86400000).toISOString(),
      grantedBy: "Test Runner",
    });

    expect(result.success).toBe(true);
    expect(result.mock).toBe(true);
    expect(result.id).toMatch(/^mock_email_/);
  });

  it("sends order captured notification in mock mode successfully", async () => {
    const result = await emailService.sendOrderCaptured({
      recipientEmail: "test@example.com",
      orderId: "ord-test-mock",
      approvalId: "app-test-mock",
      amount: 75.5,
      currency: "USD",
      items: [{ name: "Widget", quantity: 1, unitPrice: 75.5 }],
      capturedAt: new Date().toISOString(),
      policyHash: "hash-xyz",
    });

    expect(result.success).toBe(true);
    expect(result.mock).toBe(true);
    expect(result.id).toBeDefined();
  });

  it("sends reconciliation alert in mock mode successfully", async () => {
    const result = await emailService.sendReconciliationAlert({
      recipientEmail: "compliance@example.com",
      orderId: "ord-test-mock",
      discrepancyType: "TIMEOUT_UNRECONCILED",
      expectedAmount: 50,
      actualAmount: 50,
      currency: "USD",
      detectedAt: new Date().toISOString(),
      reason: "Webhook not received within SLA window",
    });

    expect(result.success).toBe(true);
    expect(result.mock).toBe(true);
  });

  it("handles async fire-and-forget calls without throwing errors", () => {
    expect(() => {
      emailService.dispatchApprovalGrantedAsync({
        recipientEmail: "async-test@example.com",
        approvalId: "app-async-1",
        policyId: "pol-async-1",
        policyHash: "hash123",
        spendCap: 50,
        currency: "USD",
        expiresAt: new Date().toISOString(),
        grantedBy: "Auto Test",
      });

      emailService.dispatchApprovalRevokedAsync({
        recipientEmail: "async-test@example.com",
        approvalId: "app-async-2",
        policyId: "pol-async-2",
        revokedReason: "Test Revocation",
        revokedAt: new Date().toISOString(),
        revokedBy: "Auto Test",
      });

      emailService.dispatchOrderCapturedAsync({
        recipientEmail: "async-test@example.com",
        orderId: "ord-async-1",
        approvalId: "app-async-1",
        amount: 25,
        currency: "USD",
        items: [],
        capturedAt: new Date().toISOString(),
        policyHash: "hash123",
      });

      emailService.dispatchReconciliationAlertAsync({
        recipientEmail: "async-test@example.com",
        orderId: "ord-async-2",
        discrepancyType: "MISMATCH",
        expectedAmount: 10,
        actualAmount: 12,
        currency: "USD",
        detectedAt: new Date().toISOString(),
        reason: "Discrepancy test",
      });
    }).not.toThrow();
  });
});
