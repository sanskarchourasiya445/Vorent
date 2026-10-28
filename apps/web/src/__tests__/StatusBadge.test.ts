import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, it, expect } from "vitest";
import { StatusBadge, StatusVariant } from "../components/ui/StatusBadge";

describe("StatusBadge Component", () => {
  it("renders ALLOW state with emerald styling", () => {
    const html = renderToStaticMarkup(
      React.createElement(StatusBadge, { status: "ALLOW" })
    );
    expect(html).toContain("bg-emerald-50");
    expect(html).toContain("text-emerald-950");
    expect(html).toContain("border-emerald-300");
    expect(html).toContain("ALLOW");
  });

  it("renders ACTIVE state with emerald styling", () => {
    const html = renderToStaticMarkup(
      React.createElement(StatusBadge, { status: "ACTIVE" })
    );
    expect(html).toContain("bg-emerald-50");
    expect(html).toContain("text-emerald-950");
  });

  it("renders DENY, CRITICAL, REVOKED, and UNKNOWN_REQUIRES_RECONCILIATION with red styling", () => {
    const variants: StatusVariant[] = [
      "DENY",
      "CRITICAL",
      "HIGH",
      "FAILED",
      "REVOKED",
      "UNKNOWN_REQUIRES_RECONCILIATION",
    ];

    for (const v of variants) {
      const html = renderToStaticMarkup(
        React.createElement(StatusBadge, { status: v, variant: v })
      );
      expect(html).toContain("bg-red-50");
      expect(html).toContain("text-red-950");
      expect(html).toContain("border-red-300");
    }
  });

  it("renders REVIEW, MEDIUM, ACCEPTED_RISK, and SANDBOX with amber styling", () => {
    const variants: StatusVariant[] = ["REVIEW", "MEDIUM", "ACCEPTED_RISK", "SANDBOX"];
    for (const v of variants) {
      const html = renderToStaticMarkup(
        React.createElement(StatusBadge, { status: v, variant: v })
      );
      expect(html).toContain("bg-amber-50");
      expect(html).toContain("text-amber-950");
      expect(html).toContain("border-amber-300");
    }
  });

  it("renders EXPIRED state with slate-100 styling", () => {
    const html = renderToStaticMarkup(
      React.createElement(StatusBadge, { status: "EXPIRED" })
    );
    expect(html).toContain("bg-slate-100");
    expect(html).toContain("text-slate-800");
  });

  it("normalizes lowercase status values cleanly", () => {
    const html = renderToStaticMarkup(
      React.createElement(StatusBadge, { status: "allow" })
    );
    expect(html).toContain("bg-emerald-50");
    expect(html).toContain("allow");
  });

  it("renders dot indicator when showDot is true and omits it when false", () => {
    const withDot = renderToStaticMarkup(
      React.createElement(StatusBadge, { status: "ALLOW", showDot: true })
    );
    expect(withDot).toContain("rounded-full");
    expect(withDot).toContain("bg-emerald-600");

    const withoutDot = renderToStaticMarkup(
      React.createElement(StatusBadge, { status: "ALLOW", showDot: false })
    );
    expect(withoutDot).not.toContain("w-1.5 h-1.5 rounded-full");
  });

  it("applies correct size classes for sm and md", () => {
    const sm = renderToStaticMarkup(
      React.createElement(StatusBadge, { status: "ALLOW", size: "sm" })
    );
    expect(sm).toContain("text-[10px]");

    const md = renderToStaticMarkup(
      React.createElement(StatusBadge, { status: "ALLOW", size: "md" })
    );
    expect(md).toContain("text-[11px]");
  });

  it("provides fallback styling for unknown status strings", () => {
    const html = renderToStaticMarkup(
      React.createElement(StatusBadge, { status: "CUSTOM_UNKNOWN_STATUS" })
    );
    expect(html).toContain("bg-slate-50");
    expect(html).toContain("text-slate-800");
    expect(html).toContain("CUSTOM_UNKNOWN_STATUS");
  });
});
