import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { DecisionResultCard } from "../components/features/DecisionResultCard";
import { formatReasonCode } from "../utils/reasonCodeFormatter";
import { ReasonCode } from "@warrant/contracts";

describe("formatReasonCode utility", () => {
  it("formats canonical ALL_RULES_PASSED with honest non-exaggerated language", () => {
    const formatted = formatReasonCode(ReasonCode.ALL_RULES_PASSED);
    expect(formatted.headline).toBe("All Evaluated Constraints Satisfied");
    expect(formatted.description).toContain("does not constitute proof of universal safety");
  });

  it("formats canonical PROHIBITED_CATEGORY correctly", () => {
    const formatted = formatReasonCode(ReasonCode.PROHIBITED_CATEGORY);
    expect(formatted.headline).toBe("Prohibited Category Detected");
    expect(formatted.description).toContain("prohibited by the approved purchasing policy");
  });

  it("formats canonical MISSING_CRITICAL_EVIDENCE correctly", () => {
    const formatted = formatReasonCode(ReasonCode.MISSING_CRITICAL_EVIDENCE);
    expect(formatted.headline).toBe("Missing Critical Evidence");
    expect(formatted.description).toContain("Required product attributes or merchant evidence were not supplied");
  });

  it("handles historical doc aliases gracefully", () => {
    const formatted = formatReasonCode("CATEGORY_PROHIBITED");
    expect(formatted.headline).toBe("Prohibited Category Detected");
  });

  it("provides a safe human-readable fallback for unknown reason codes without crashing", () => {
    const formatted = formatReasonCode("UNEXPECTED_CUSTOM_RULE_CODE");
    expect(formatted.code).toBe("UNEXPECTED_CUSTOM_RULE_CODE");
    expect(formatted.headline).toBe("Unexpected Custom Rule Code");
    expect(formatted.description).toContain("Unrecognized reason code returned by evaluator");
  });
});

describe("DecisionResultCard Component", () => {
  it("1. renders ALLOW state with visible badge, title, and honest constraint description", () => {
    const html = renderToStaticMarkup(
      React.createElement(DecisionResultCard, {
        decision: "ALLOW",
        primaryReasonCode: ReasonCode.ALL_RULES_PASSED,
        reasonCodes: [ReasonCode.ALL_RULES_PASSED],
      }),
    );

    // Triple-signaled state: visible text label
    expect(html).toContain("ALLOW");
    expect(html).toContain('role="status"');
    expect(html).toContain("Transaction Authorized");
    expect(html).toContain("All Evaluated Constraints Satisfied");
    expect(html).toContain("does not constitute proof of universal safety");
    // Visual container styling for ALLOW
    expect(html).toContain("border-emerald-300");
  });

  it("2. renders DENY state with refusal title, code badge, and crimson styling", () => {
    const html = renderToStaticMarkup(
      React.createElement(DecisionResultCard, {
        decision: "DENY",
        primaryReasonCode: ReasonCode.PROHIBITED_CATEGORY,
        reasonCodes: [ReasonCode.PROHIBITED_CATEGORY],
      }),
    );

    expect(html).toContain("DENY");
    expect(html).toContain("Transaction Refused by Gate");
    expect(html).toContain("PROHIBITED_CATEGORY");
    expect(html).toContain("Prohibited Category Detected");
    expect(html).toContain("border-red-300");
  });

  it("3. renders REVIEW state with verification hold title and fail-closed notice", () => {
    const html = renderToStaticMarkup(
      React.createElement(DecisionResultCard, {
        decision: "REVIEW",
        primaryReasonCode: ReasonCode.MISSING_CRITICAL_EVIDENCE,
        reasonCodes: [ReasonCode.MISSING_CRITICAL_EVIDENCE],
      }),
    );

    expect(html).toContain("REVIEW");
    expect(html).toContain("Verification Hold — Manual Review Required");
    expect(html).toContain("MISSING_CRITICAL_EVIDENCE");
    expect(html).toContain("Conditions Requiring Resolution (Fail-Closed Gate)");
    expect(html).toContain("border-amber-300");
  });

  it("4. renders primary reason and multiple secondary reasons preserving backend order", () => {
    const html = renderToStaticMarkup(
      React.createElement(DecisionResultCard, {
        decision: "DENY",
        primaryReasonCode: ReasonCode.PROHIBITED_CATEGORY,
        reasonCodes: [
          ReasonCode.PROHIBITED_CATEGORY,
          ReasonCode.ITEM_PRICE_LIMIT_EXCEEDED,
          ReasonCode.CART_TOTAL_LIMIT_EXCEEDED,
        ],
      }),
    );

    // Primary reason is headline
    expect(html).toContain("Prohibited Category Detected");

    // Secondary section is rendered
    expect(html).toContain("Additional Evaluated Constraints (2)");
    expect(html).toContain("ITEM_PRICE_LIMIT_EXCEEDED");
    expect(html).toContain("Item Price Limit Exceeded");
    expect(html).toContain("CART_TOTAL_LIMIT_EXCEEDED");
    expect(html).toContain("Cart Total Limit Exceeded");

    // Order preserved: ITEM_PRICE_LIMIT_EXCEEDED appears before CART_TOTAL_LIMIT_EXCEEDED in HTML
    const priceIdx = html.indexOf("ITEM_PRICE_LIMIT_EXCEEDED");
    const cartIdx = html.indexOf("CART_TOTAL_LIMIT_EXCEEDED");
    expect(priceIdx).toBeLessThan(cartIdx);
  });

  it("5. renders unknown reason codes safely with title-case fallback", () => {
    const html = renderToStaticMarkup(
      React.createElement(DecisionResultCard, {
        decision: "DENY",
        primaryReasonCode: "CUSTOM_SUPPLIER_BLACKLIST_BREACH",
        reasonCodes: ["CUSTOM_SUPPLIER_BLACKLIST_BREACH"],
      }),
    );

    expect(html).toContain("Custom Supplier Blacklist Breach");
    expect(html).toContain("CUSTOM_SUPPLIER_BLACKLIST_BREACH");
    expect(html).toContain("Unrecognized reason code returned by evaluator");
  });

  it("6. renders optional evidence items and custom uncertainty notes", () => {
    const html = renderToStaticMarkup(
      React.createElement(DecisionResultCard, {
        decision: "REVIEW",
        primaryReasonCode: ReasonCode.STALE_EVIDENCE,
        reasonCodes: [ReasonCode.STALE_EVIDENCE],
        uncertaintyNotes: ["Merchant tax code classification is pending confirmation."],
        evidenceItems: [
          {
            label: "Product Title",
            value: "Programming Rust (2nd Ed)",
            observedAt: "25m ago",
            isStale: false,
          },
          {
            label: "Merchant Price",
            value: "$45.00 USD",
            observedAt: "2d ago",
            isStale: true,
          },
        ],
      }),
    );

    // Evidence items rendered
    expect(html).toContain("Associated Evidence Snapshot");
    expect(html).toContain("Programming Rust (2nd Ed)");
    expect(html).toContain("$45.00 USD");
    expect(html).toContain("Observed: 25m ago");
    expect(html).toContain("Stale Evidence");

    // Uncertainty note rendered
    expect(html).toContain("Merchant tax code classification is pending confirmation.");
  });

  it("7. renders cleanly when optional fields are completely absent", () => {
    const html = renderToStaticMarkup(
      React.createElement(DecisionResultCard, {
        decision: "ALLOW",
      }),
    );

    expect(html).toContain("ALLOW");
    expect(html).toContain("Transaction Authorized");
    // No evidence section rendered
    expect(html).not.toContain("Associated Evidence Snapshot");
    // No footer rendered
    expect(html).not.toContain("<footer");
    // No secondary reasons rendered
    expect(html).not.toContain("Additional Evaluated Constraints");
  });

  it("8. satisfies accessibility requirements (semantic landmarks and text labels)", () => {
    const html = renderToStaticMarkup(
      React.createElement(DecisionResultCard, {
        decision: "DENY",
        primaryReasonCode: ReasonCode.PROHIBITED_CATEGORY,
        policyVersionId: "pol_v2_f89a",
        policyHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
        timestamp: "2026-10-19T10:45:00Z",
        evaluatorVersion: "pure-domain-v1.0.0",
      }),
    );

    // Semantic landmarks
    expect(html).toContain("<article");
    expect(html).toContain("<header");
    expect(html).toContain("<section");
    expect(html).toContain("<footer");
    expect(html).toContain("<h3");
    expect(html).toContain("<h4");

    // Accessible names and status roles
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-labelledby="decision-card-title"');
    expect(html).toContain('aria-label="Copy full policy hash"');

    // Policy version and truncated hash
    expect(html).toContain("pol_v2_f89a");
    expect(html).toContain("e3b0c442...7852b855");
    expect(html).toContain("pure-domain-v1.0.0");
  });

  it("9. prominently flags demo fixtures to prevent operator confusion", () => {
    const html = renderToStaticMarkup(
      React.createElement(DecisionResultCard, {
        decision: "DENY",
        primaryReasonCode: ReasonCode.PROHIBITED_CATEGORY,
        isDemoFixture: true,
      }),
    );

    expect(html).toContain('role="note"');
    expect(html).toContain("Demo Fixture — Illustrative Data Only");
  });

  it("10. renders explicit verification status badges without falsely implying authenticity", () => {
    const html = renderToStaticMarkup(
      React.createElement(DecisionResultCard, {
        decision: "REVIEW",
        primaryReasonCode: ReasonCode.MISSING_CRITICAL_EVIDENCE,
        reasonCodes: [ReasonCode.MISSING_CRITICAL_EVIDENCE],
        evidenceItems: [
          {
            label: "Merchant Price",
            value: "$100.00",
            verified: false,
          },
          {
            label: "Catalog Taxonomy",
            value: "Hardware / Compute",
            verified: true,
          },
          {
            label: "Stock Level",
            value: "14 units",
            // verified is undefined: should not claim verified
          },
        ],
      }),
    );

    expect(html).toContain("Unverified Merchant Claim");
    expect(html).toContain("Verified Authenticity");
    // Verify stock level does not have a verified badge
    expect(html).toContain("Stock Level");
  });
});

describe("adaptEvaluationResultToDecisionCardProps contract adapter", () => {
  it("consumes PolicyEvaluationResult and EvidenceSnapshot from @warrant/contracts without data loss", async () => {
    const { adaptEvaluationResultToDecisionCardProps } = await import("../utils/decisionAdapter");
    const { PolicyEvaluationResultSchema } = await import("@warrant/contracts");

    // Construct a canonical PolicyEvaluationResult verified by runtime Zod schema
    const rawResult = {
      decision: "DENY" as const,
      primaryReasonCode: ReasonCode.PROHIBITED_CATEGORY,
      reasonCodes: [
        ReasonCode.PROHIBITED_CATEGORY,
        ReasonCode.ITEM_PRICE_LIMIT_EXCEEDED,
      ],
      ruleTrace: [
        {
          ruleId: "rule_no_weapons",
          ruleName: "Prohibited Category Rule",
          outcome: "FAIL" as const,
          reasonCode: ReasonCode.PROHIBITED_CATEGORY,
          message: "Cart contains item under prohibited Weapons category",
        },
      ],
      metadata: {
        evaluatorVersion: "1.0.0",
        itemCount: 1,
        cartTotalMinor: 5000,
        currency: "USD",
        evaluatedAt: "2026-10-19T11:00:00Z",
      },
    };

    const validContract = PolicyEvaluationResultSchema.parse(rawResult);

    const props = adaptEvaluationResultToDecisionCardProps(validContract, {
      policyVersionId: "pol_v2_f89a",
      policyHash: "abc123hash",
      evidence: {
        snapshotTimestamp: "2026-10-19T10:55:00Z",
        quotesVerified: false,
        stale: true,
      },
      isDemoFixture: false,
    });

    // Check invariants
    expect(props.decision).toBe("DENY");
    expect(props.primaryReasonCode).toBe(ReasonCode.PROHIBITED_CATEGORY);
    // Preserves exact backend reasonCodes order
    expect(props.reasonCodes).toEqual([
      ReasonCode.PROHIBITED_CATEGORY,
      ReasonCode.ITEM_PRICE_LIMIT_EXCEEDED,
    ]);
    expect(props.evaluatorVersion).toBe("1.0.0");
    expect(props.timestamp).toBe("2026-10-19T11:00:00Z");

    // Check evidence adaptation
    expect(props.evidenceItems).toBeDefined();
    const quoteStatus = props.evidenceItems?.find((e) => e.label === "Quote Verification Status");
    expect(quoteStatus?.value).toBe("Unverified Merchant Claim");
    expect(quoteStatus?.verified).toBe(false);

    // Check uncertainty notes from ruleTrace
    expect(props.uncertaintyNotes).toBeDefined();
    expect(props.uncertaintyNotes?.[0]).toContain("Prohibited Category Rule: Cart contains item");

    // Render component with adapted props to static HTML
    const html = renderToStaticMarkup(React.createElement(DecisionResultCard, props));
    expect(html).toContain("Transaction Refused by Gate");
    expect(html).toContain("Unverified Merchant Claim");
    expect(html).toContain("Stale Data (Exceeded Freshness Window)");
  });
});

