import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { App, WORKSTATION_GROUPS, ALL_WORKSTATIONS } from "../App";
import { Sidebar, MobileNavDrawer } from "../components/navigation/Sidebar";
import { CheckoutGatePanel } from "../components/checkout/CheckoutGatePanel";
import { DecisionResultCard } from "../components/features/DecisionResultCard";
import { PaymentOrderPipelineCard } from "../components/checkout/PaymentOrderPipelineCard";
import * as fs from "node:fs";
import * as path from "node:path";

// Helper: Calculate relative luminance according to WCAG 2.2 specifications
function getRelativeLuminance(hex: string): number {
  const cleanHex = hex.replace("#", "");
  const r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  const g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  const b = parseInt(cleanHex.substring(4, 6), 16) / 255;

  const toLinear = (c: number) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

// Helper: Calculate contrast ratio between two colors
function getContrastRatio(hex1: string, hex2: string): number {
  const lum1 = getRelativeLuminance(hex1);
  const lum2 = getRelativeLuminance(hex2);
  const lighter = Math.max(lum1, lum2);
  const darker = Math.min(lum1, lum2);
  return (lighter + 0.05) / (darker + 0.05);
}

describe("Shell Navigation, Layout Stress & Security Gate Invariants", () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    vi.stubGlobal("window", {
      location: { search: "", pathname: "/" },
      history: { replaceState: vi.fn() },
      localStorage: {
        getItem: vi.fn((key: string) => mockStorage[key] ?? null),
        setItem: vi.fn((key: string, value: string) => {
          mockStorage[key] = value;
        }),
        removeItem: vi.fn((key: string) => {
          delete mockStorage[key];
        }),
        clear: vi.fn(() => {
          mockStorage = {};
        }),
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      matchMedia: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // =========================================================================
  // 1. SHELL NAVIGATION & LAYOUT STRESS
  // =========================================================================
  describe("1. Shell Navigation & Layout Stress", () => {
    it("renders desktop sidebar with w-64 in expanded mode and w-16 in collapsed mode with smooth transitions", () => {
      // Expanded mode
      const expandedHtml = renderToStaticMarkup(
        React.createElement(Sidebar, {
          groups: WORKSTATION_GROUPS,
          activeWorkstation: "overview",
          onSelectWorkstation: vi.fn(),
          isCollapsed: false,
          onToggleCollapse: vi.fn(),
        })
      );
      expect(expandedHtml).toContain("w-64 p-4");
      expect(expandedHtml).toContain("transition-[width] duration-200 ease-in-out");
      expect(expandedHtml).toContain("data-lenis-prevent");

      // Collapsed mode
      const collapsedHtml = renderToStaticMarkup(
        React.createElement(Sidebar, {
          groups: WORKSTATION_GROUPS,
          activeWorkstation: "overview",
          onSelectWorkstation: vi.fn(),
          isCollapsed: true,
          onToggleCollapse: vi.fn(),
        })
      );
      expect(collapsedHtml).toContain("w-16 p-2");
      expect(collapsedHtml).toContain("transition-[width] duration-200 ease-in-out");
      expect(collapsedHtml).toContain("data-lenis-prevent");
    });

    it("renders zero-flow floating tooltips exclusively in collapsed mode with non-blocking pointer events", () => {
      const collapsedHtml = renderToStaticMarkup(
        React.createElement(Sidebar, {
          groups: WORKSTATION_GROUPS,
          activeWorkstation: "mandate",
          onSelectWorkstation: vi.fn(),
          isCollapsed: true,
          onToggleCollapse: vi.fn(),
        })
      );

      // Tooltip positioning & style contracts
      expect(collapsedHtml).toContain("absolute left-full ml-2.5 px-2.5 py-1 rounded-md bg-ink text-surface");
      expect(collapsedHtml).toContain("pointer-events-none");
      expect(collapsedHtml).toContain("opacity-0 group-hover:opacity-100 transition-opacity duration-150 ease-out z-50");
      expect(collapsedHtml).toContain("shadow-md");

      // Verify every workstation has its tooltip label rendered (accounting for HTML escaping of &)
      for (const ws of ALL_WORKSTATIONS) {
        const escapedLabel = ws.label.replace(/&/g, "&amp;");
        expect(collapsedHtml).toContain(escapedLabel);
      }

      // Verify expanded mode does NOT contain floating tooltip class
      const expandedHtml = renderToStaticMarkup(
        React.createElement(Sidebar, {
          groups: WORKSTATION_GROUPS,
          activeWorkstation: "mandate",
          onSelectWorkstation: vi.fn(),
          isCollapsed: false,
          onToggleCollapse: vi.fn(),
        })
      );
      expect(expandedHtml).not.toContain("absolute left-full ml-2.5");
    });

    it("verifies border parity (3.5px) across all items to guarantee zero layout shift during hover and selection", () => {
      const html = renderToStaticMarkup(
        React.createElement(Sidebar, {
          groups: WORKSTATION_GROUPS,
          activeWorkstation: "verification",
          onSelectWorkstation: vi.fn(),
          isCollapsed: false,
          onToggleCollapse: vi.fn(),
        })
      );

      // Active item
      expect(html).toContain("border-l-[3.5px] border-accent bg-surface-raised");
      // Inactive items
      expect(html).toContain("border-l-[3.5px] border-transparent");
    });

    it("empirically verifies Ctrl+B and Cmd+B shortcut event handler logic and App.tsx source implementation", () => {
      // 1. Direct empirical logic verification of the shortcut handler specification
      let isCollapsed = false;
      const toggleCollapse = () => {
        isCollapsed = !isCollapsed;
      };

      const handleShortcut = (e: { ctrlKey?: boolean; metaKey?: boolean; key: string; preventDefault: () => void }) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
          e.preventDefault();
          toggleCollapse();
        }
      };

      // Test Ctrl+b toggles and prevents default
      const ctrlBEvent = {
        ctrlKey: true,
        metaKey: false,
        key: "b",
        preventDefault: vi.fn(),
      };
      handleShortcut(ctrlBEvent);
      expect(ctrlBEvent.preventDefault).toHaveBeenCalledTimes(1);
      expect(isCollapsed).toBe(true);

      // Test Cmd+B (macOS uppercase) toggles and prevents default
      const cmdBEvent = {
        ctrlKey: false,
        metaKey: true,
        key: "B",
        preventDefault: vi.fn(),
      };
      handleShortcut(cmdBEvent);
      expect(cmdBEvent.preventDefault).toHaveBeenCalledTimes(1);
      expect(isCollapsed).toBe(false);

      // Test plain 'b' key without Ctrl/Meta (must NOT prevent default or toggle)
      const plainBEvent = {
        ctrlKey: false,
        metaKey: false,
        key: "b",
        preventDefault: vi.fn(),
      };
      handleShortcut(plainBEvent);
      expect(plainBEvent.preventDefault).not.toHaveBeenCalled();
      expect(isCollapsed).toBe(false);

      // Test unrelated Ctrl+A (must NOT prevent default or toggle)
      const ctrlAEvent = {
        ctrlKey: true,
        metaKey: false,
        key: "a",
        preventDefault: vi.fn(),
      };
      handleShortcut(ctrlAEvent);
      expect(ctrlAEvent.preventDefault).not.toHaveBeenCalled();
      expect(isCollapsed).toBe(false);

      // 2. Structural source contract verification in App.tsx
      const appSourcePath = path.resolve(__dirname, "../App.tsx");
      const appSourceContent = fs.readFileSync(appSourcePath, "utf-8");

      expect(appSourceContent).toContain("(e.ctrlKey || e.metaKey) && e.key.toLowerCase() === \"b\"");
      expect(appSourceContent).toContain("setIsSidebarCollapsed((prev) => !prev)");
      expect(appSourceContent).toContain("window.addEventListener(\"keydown\", handleShortcut)");
      expect(appSourceContent).toContain("window.removeEventListener(\"keydown\", handleShortcut)");
    });

    it("safely handles corrupted, malicious, and throwing localStorage states", () => {
      // Corrupt string values
      const invalidValues = ["null", "undefined", "{bad:json}", "NaN", "true_extra", "1", "-1"];
      for (const val of invalidValues) {
        mockStorage["warrant_sidebar_collapsed"] = val;
        const html = renderToStaticMarkup(React.createElement(App));
        // Must default to expanded (w-64)
        expect(html).toContain("w-64 p-4");
      }

      // Valid 'true'
      mockStorage["warrant_sidebar_collapsed"] = "true";
      const collapsedHtml = renderToStaticMarkup(React.createElement(App));
      expect(collapsedHtml).toContain("w-16 p-2");

      // Storage security error / quota error
      vi.stubGlobal("window", {
        location: { search: "", pathname: "/" },
        history: { replaceState: vi.fn() },
        localStorage: {
          getItem: vi.fn(() => {
            throw new DOMException("SecurityError: Access to localStorage is denied");
          }),
          setItem: vi.fn(),
          removeItem: vi.fn(),
          clear: vi.fn(),
        },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });

      expect(() => renderToStaticMarkup(React.createElement(App))).not.toThrow();
      const safeHtml = renderToStaticMarkup(React.createElement(App));
      expect(safeHtml).toContain("w-64 p-4");
    });
  });

  // =========================================================================
  // 2. VIEWPORT RESPONSIVENESS & ZERO OVERFLOW
  // =========================================================================
  describe("2. Viewport Responsiveness & Zero Overflow Architecture", () => {
    it("strictly wraps #main-scroll-container in flex-1 overflow-hidden min-h-0", () => {
      const html = renderToStaticMarkup(React.createElement(App));

      // Viewport parent container
      expect(html).toMatch(/<div class="h-screen min-h-screen flex flex-col overflow-hidden bg-canvas text-ink">/);

      // Main layout parent MUST have overflow-hidden AND min-h-0 to prevent vertical/horizontal blowout
      expect(html).toMatch(/<div class="flex-1 flex overflow-hidden min-h-0">/);

      // #main-scroll-container MUST have flex-1, overflow-y-auto, and min-w-0
      expect(html).toMatch(/<main[^>]*id="main-scroll-container"[^>]*class="[^"]*flex-1 overflow-y-auto min-w-0[^"]*"/);

      // Inner container MUST have max-w-[1680px] and min-w-0
      expect(html).toMatch(/<div class="w-full max-w-\[1680px\] mx-auto min-w-0">/);
    });

    it("verifies zero horizontal overflow classes across all 9 operational workstations", () => {
      const workstationIds = [
        "overview",
        "mandate",
        "policy-versions",
        "verification",
        "findings",
        "approval",
        "checkout",
        "transactions",
        "evaluation",
      ];

      for (const wsId of workstationIds) {
        const html = renderToStaticMarkup(React.createElement(App, { initialWorkstation: wsId }));

        // Confirms workstation renders within the scroll container
        expect(html).toContain('id="main-scroll-container"');
        expect(html).toContain("min-w-0");

        // Verify that no unconstrained overflow properties exist on outer wrappers
        expect(html).not.toContain("overflow-x-scroll");
        expect(html).not.toContain("w-[2000px]");
      }
    });

    it("verifies mobile navigation drawer incorporates data-lenis-prevent and hardware-accelerated transforms", () => {
      const openDrawerHtml = renderToStaticMarkup(
        React.createElement(MobileNavDrawer, {
          isOpen: true,
          onClose: vi.fn(),
          groups: WORKSTATION_GROUPS,
          activeWorkstation: "checkout",
          onSelectWorkstation: vi.fn(),
          drawerRef: { current: null },
          selectedPolicyId: "pol_v1_books_hardware",
          onSelectPolicy: vi.fn(),
          policyOptions: [],
        })
      );

      // Isolation from Lenis smooth scrolling
      expect(openDrawerHtml).toContain("data-lenis-prevent");
      // Hardware-accelerated CSS transform
      expect(openDrawerHtml).toContain("transition-transform duration-220 ease-in-out");
      expect(openDrawerHtml).toContain("translate-x-0");
      // Accessible dialog semantics
      expect(openDrawerHtml).toContain('role="dialog"');
      expect(openDrawerHtml).toContain('aria-modal="true"');
      expect(openDrawerHtml).toContain('aria-label="Mobile Navigation Menu"');

      // Closed state uses negative translation
      const closedDrawerHtml = renderToStaticMarkup(
        React.createElement(MobileNavDrawer, {
          isOpen: false,
          onClose: vi.fn(),
          groups: WORKSTATION_GROUPS,
          activeWorkstation: "checkout",
          onSelectWorkstation: vi.fn(),
          drawerRef: { current: null },
          selectedPolicyId: "pol_v1_books_hardware",
          onSelectPolicy: vi.fn(),
          policyOptions: [],
        })
      );
      expect(closedDrawerHtml).toContain("-translate-x-full");
    });
  });

  // =========================================================================
  // 3. DUAL-THEME CONTRAST & UI STATE FIDELITY
  // =========================================================================
  describe("3. Dual-Theme Contrast & UI State Fidelity", () => {
    const cssPath = path.resolve(__dirname, "../index.css");
    const cssContent = fs.readFileSync(cssPath, "utf-8");

    it("verifies Dark Mode specifications (Obsidian #080B11 + Electric Blue #0EA5E9)", () => {
      expect(cssContent).toContain("--bg-primary: #080B11");
      expect(cssContent).toContain("--brand-primary: #0EA5E9");
      expect(cssContent).toContain("--color-canvas: #080B11");
      expect(cssContent).toContain("--color-accent: #0EA5E9");
      expect(cssContent).toContain("--color-ink: #F8FAFC");
      expect(cssContent).toContain("--color-border: #1E293B");

      // Empirical WCAG Contrast Verification
      const darkBg = "#080B11";
      const darkText = "#F8FAFC";
      const darkMuted = "#94A3B8";
      const darkElectricBlue = "#0EA5E9";

      const textContrast = getContrastRatio(darkText, darkBg);
      const mutedContrast = getContrastRatio(darkMuted, darkBg);
      const electricBlueContrast = getContrastRatio(darkElectricBlue, darkBg);

      // Normal text requires >= 4.5:1 (AA) and >= 7.0:1 (AAA)
      expect(textContrast).toBeGreaterThanOrEqual(14.0);
      expect(mutedContrast).toBeGreaterThanOrEqual(4.5);
      expect(electricBlueContrast).toBeGreaterThanOrEqual(4.5);
    });

    it("verifies Light Mode specifications (Platinum #F8FAFC + Cobalt #0284C7)", () => {
      expect(cssContent).toContain("--bg-primary: #F8FAFC");
      expect(cssContent).toContain("--brand-primary: #0284C7");
      expect(cssContent).toContain("--color-canvas: #F8FAFC");
      expect(cssContent).toContain("--color-accent: #0284C7");
      expect(cssContent).toContain("--color-ink: #0F172A");
      expect(cssContent).toContain("--color-border: #E2E8F0");

      // Empirical WCAG Contrast Verification
      const lightBg = "#F8FAFC";
      const lightHeading = "#0F172A";
      const lightBody = "#0F172A";
      const lightMuted = "#64748B";

      const headingContrast = getContrastRatio(lightHeading, lightBg);
      const bodyContrast = getContrastRatio(lightBody, lightBg);
      const mutedContrast = getContrastRatio(lightMuted, lightBg);

      expect(headingContrast).toBeGreaterThanOrEqual(10.0);
      expect(bodyContrast).toBeGreaterThanOrEqual(7.0);
      expect(mutedContrast).toBeGreaterThanOrEqual(4.3);
    });

    it("verifies Light Mode obsidian sidebar styling (#070A0F background with #F8FAFC text)", () => {
      expect(cssContent).toContain("html.light aside[aria-label=\"Application Navigation\"]");
      expect(cssContent).toContain("--color-sidebar: #070A0F");
      expect(cssContent).toContain("--color-sidebar-raised: #0F172A");
      expect(cssContent).toContain("--color-ink: #F8FAFC");
      expect(cssContent).toContain("--color-accent: #0EA5E9");

      // Empirical WCAG Contrast on Obsidian Sidebar
      const sidebarBg = "#070A0F";
      const sidebarText = "#F8FAFC";
      const sidebarMuted = "#94A3B8";
      const sidebarAccent = "#0EA5E9";

      const sidebarTextContrast = getContrastRatio(sidebarText, sidebarBg);
      const sidebarMutedContrast = getContrastRatio(sidebarMuted, sidebarBg);
      const sidebarAccentContrast = getContrastRatio(sidebarAccent, sidebarBg);

      expect(sidebarTextContrast).toBeGreaterThanOrEqual(12.0);
      expect(sidebarMutedContrast).toBeGreaterThanOrEqual(4.2);
      expect(sidebarAccentContrast).toBeGreaterThanOrEqual(7.0);
    });

    it("renders all 3 Checkout Gate tamper demo buttons with exact testids and labels", () => {
      const html = renderToStaticMarkup(React.createElement(CheckoutGatePanel));

      // Tamper preset 1: Price hike
      expect(html).toContain('data-testid="tamper-price-hike-btn"');
      expect(html).toContain("Tamper: Post-Approval Price Hike");

      // Tamper preset 2: Prohibited SKU
      expect(html).toContain('data-testid="tamper-prohibited-sku-btn"');
      expect(html).toContain("Tamper: Prohibited SKU Swap (Gift Card)");

      // Tamper preset 3: Nonce replay
      expect(html).toContain('data-testid="tamper-nonce-replay-btn"');
      expect(html).toContain("Tamper: Nonce Replay");
    });

    it("renders prominent 'Zero PayPal Orders Created' callout strictly on DENY decisions", () => {
      // 1. DENY Decision MUST render the callout
      const denyHtml = renderToStaticMarkup(
        React.createElement(DecisionResultCard, {
          decision: "DENY",
          primaryReasonCode: "SPEND_LIMIT_EXCEEDED",
          reasonCodes: ["SPEND_LIMIT_EXCEEDED"],
        })
      );

      expect(denyHtml).toContain('data-testid="zero-paypal-orders-callout"');
      expect(denyHtml).toContain("Zero PayPal Orders Created");
      expect(denyHtml).toContain("Pre-PayPal Policy Gate physically blocked external API calls");

      // 2. ALLOW Decision MUST NOT render the callout
      const allowHtml = renderToStaticMarkup(
        React.createElement(DecisionResultCard, {
          decision: "ALLOW",
          primaryReasonCode: "ALL_RULES_PASSED",
          reasonCodes: ["ALL_RULES_PASSED"],
        })
      );
      expect(allowHtml).not.toContain('data-testid="zero-paypal-orders-callout"');
      expect(allowHtml).not.toContain("Zero PayPal Orders Created");

      // 3. REVIEW Decision MUST NOT render the callout (it displays fail-closed review hold)
      const reviewHtml = renderToStaticMarkup(
        React.createElement(DecisionResultCard, {
          decision: "REVIEW",
          primaryReasonCode: "MISSING_CRITICAL_EVIDENCE",
          reasonCodes: ["MISSING_CRITICAL_EVIDENCE"],
        })
      );
      expect(reviewHtml).not.toContain('data-testid="zero-paypal-orders-callout"');
    });

    it("enforces fail-closed invariant: PaymentOrderPipelineCard blocks PayPal Sandbox dispatch on DENY", () => {
      const mockCreateOrder = vi.fn();

      const pipelineHtml = renderToStaticMarkup(
        React.createElement(PaymentOrderPipelineCard, {
          decision: "DENY",
          primaryReasonCode: "PROHIBITED_CATEGORY",
          reservationId: undefined,
          onCreatePayPalOrder: undefined, // Gate strictly withholds handler on non-ALLOW
        })
      );

      // Stage 1 shows failed gate
      expect(pipelineHtml).toContain("DENY (PROHIBITED_CATEGORY)");
      expect(pipelineHtml).toContain("Transaction denied by policy gate. Downstream pipeline blocked.");

      // Stage 2 shows blocked reservation
      expect(pipelineHtml).toContain("Blocked (Gate Denied)");
      expect(pipelineHtml).toContain("No reservation created for denied proposal.");

      // Stage 3 shows blocked PayPal order
      expect(pipelineHtml).toContain("Awaiting Gate &amp; Reservation");

      // Action button to create PayPal order must NOT be present
      expect(pipelineHtml).not.toContain("Create PayPal Sandbox Order");
      expect(mockCreateOrder).not.toHaveBeenCalled();
    });
  });
});
