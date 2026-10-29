import { describe, it, expect } from "vitest";
import React from "react";
import { renderToString } from "react-dom/server";
import {
  Skeleton,
  SkeletonMetricCard,
  SkeletonCard,
  SkeletonTable,
  SkeletonCodeBlock,
  SkeletonFindingsList,
  SkeletonApprovalList,
  SkeletonDashboard,
} from "../components/ui/Skeleton";

describe("VORENT Premium Skeleton Loading UI Suite", () => {
  describe("1. Skeleton Primitive & Variant Contracts", () => {
    it("renders rectangular variant with default shimmer and accessibility status", () => {
      const html = renderToString(React.createElement(Skeleton, { width: 200, height: 40 }));
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-label="Loading content..."');
      expect(html).toContain("rounded-md");
      expect(html).toContain("bg-slate-200");
      expect(html).toContain("animate-skeleton-shimmer");
      expect(html).toContain("motion-safe:animate-pulse");
      expect(html).toContain("motion-reduce:animate-none");
    });

    it("renders circular variant for avatar and icon placeholders", () => {
      const html = renderToString(React.createElement(Skeleton, { variant: "circular", className: "w-8 h-8" }));
      expect(html).toContain("rounded-full");
      expect(html).toContain("shrink-0");
    });

    it("renders badge and button variants with correct design tokens", () => {
      const badgeHtml = renderToString(React.createElement(Skeleton, { variant: "badge" }));
      expect(badgeHtml).toContain("rounded-full");
      expect(badgeHtml).toContain("h-5");
      expect(badgeHtml).toContain("w-16");

      const buttonHtml = renderToString(React.createElement(Skeleton, { variant: "button" }));
      expect(buttonHtml).toContain("rounded-md");
      expect(buttonHtml).toContain("h-8");
      expect(buttonHtml).toContain("w-24");
    });

    it("renders multi-line text skeleton with variable final line width", () => {
      const html = renderToString(React.createElement(Skeleton, { variant: "text", lines: 3 }));
      expect(html).toContain('role="status"');
      expect(html).toContain("space-y-2");
      // Final line width should be 75%
      expect(html).toContain("width:75%");
      expect(html).toContain("width:100%");
    });

    it("respects animate and shimmer flags when disabled", () => {
      const html = renderToString(React.createElement(Skeleton, { animate: false, shimmer: false }));
      expect(html).not.toContain("motion-safe:animate-pulse");
      expect(html).not.toContain("animate-skeleton-shimmer");
    });
  });

  describe("2. Composite Domain Skeletons", () => {
    it("renders SkeletonMetricCard matching dashboard KPI structure", () => {
      const html = renderToString(React.createElement(SkeletonMetricCard));
      expect(html).toContain('data-testid="skeleton-metric-card"');
      expect(html).toContain("bg-surface");
      expect(html).toContain("border-border");
      expect(html).toContain("rounded-full"); // Icon circular placeholder
    });

    it("renders SkeletonCard with configurable header and lines", () => {
      const html = renderToString(React.createElement(SkeletonCard, { lines: 4 }));
      expect(html).toContain('data-testid="skeleton-card"');
      expect(html).toContain("rounded-xl");
    });

    it("renders SkeletonTable with semantic thead, tbody, and customizable columns", () => {
      const html = renderToString(
        React.createElement(SkeletonTable, {
          columns: ["Timestamp", "Entity", "Actor", "Status"],
          rows: 3,
        }),
      );
      expect(html).toContain('data-testid="skeleton-table"');
      expect(html).toContain("<table");
      expect(html).toContain("<thead");
      expect(html).toContain("<tbody");
      expect(html).toContain("Timestamp");
      expect(html).toContain("Entity");
      expect(html).toContain("Actor");
      expect(html).toContain("Status");
    });

    it("renders SkeletonCodeBlock with line numbers and syntax line skeletons", () => {
      const html = renderToString(React.createElement(SkeletonCodeBlock, { lines: 5 }));
      expect(html).toContain('data-testid="skeleton-code-block"');
      expect(html).toContain("font-mono");
      expect(html).toContain("bg-surface-inset");
      // Check line numbers
      expect(html).toContain(">1<");
      expect(html).toContain(">2<");
      expect(html).toContain(">3<");
      expect(html).toContain(">4<");
      expect(html).toContain(">5<");
    });

    it("renders SkeletonFindingsList with specified card count", () => {
      const html = renderToString(React.createElement(SkeletonFindingsList, { count: 3 }));
      expect(html).toContain('data-testid="skeleton-findings-list"');
      expect(html).toContain('role="status"');
    });

    it("renders SkeletonApprovalList with approval checkpoint structure", () => {
      const html = renderToString(React.createElement(SkeletonApprovalList, { count: 2 }));
      expect(html).toContain('data-testid="skeleton-approval-list"');
      expect(html).toContain('role="status"');
    });

    it("renders full SkeletonDashboard with KPI cards, security banner, and 2-column grid", () => {
      const html = renderToString(React.createElement(SkeletonDashboard));
      expect(html).toContain('data-testid="skeleton-dashboard"');
      expect(html).toContain('data-testid="skeleton-metric-card"');
      expect(html).toContain('data-testid="skeleton-code-block"');
      expect(html).toContain('data-testid="skeleton-table"');
      expect(html).toContain("lg:col-span-7");
      expect(html).toContain("lg:col-span-5");
    });
  });
});
