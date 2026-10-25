import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { App, WORKSTATION_GROUPS, ALL_WORKSTATIONS } from "../App";
import { Sidebar, MobileNavDrawer } from "../components/navigation/Sidebar";
import * as fs from "node:fs";
import * as path from "node:path";

describe("Milestone 2 Shell & Navigation Empirical Stress Tests", () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    vi.stubGlobal("window", {
      location: { search: "", pathname: "/" },
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
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("1. Top Toolbar Layout & Adversarial Policy Truncation", () => {
    it("preserves steel-grey borders and unified h-8 height across all controls", () => {
      const html = renderToStaticMarkup(React.createElement(App));

      // Mobile hamburger button
      expect(html).toContain('data-testid="mobile-nav-toggle-btn"');
      expect(html).toContain("w-8 h-8 rounded-md bg-surface");
      expect(html).toContain("border border-border");

      // Desktop sidebar toggle button
      expect(html).toContain('data-testid="desktop-sidebar-toggle-btn"');

      // Policy selector pill
      expect(html).toContain("h-8 px-2.5 rounded-md bg-surface-inset border border-border");

      // Sandbox environment badge
      expect(html).toContain("h-8 px-2.5 rounded-md text-[10px] font-mono font-bold bg-sandbox-bg text-sandbox-text border border-sandbox-border");

      // Health probe button
      expect(html).toContain('title="Refresh engine status"');
    });

    it("verifies shrink-0 on right container prevents Sandbox badge and refresh button from being pushed off-screen", () => {
      const html = renderToStaticMarkup(React.createElement(App));

      // Right container must have shrink-0 so it cannot be crushed by left flex items
      expect(html).toMatch(/<div class="flex items-center space-x-2 sm:space-x-3 shrink-0">[\s\S]*?SANDBOX MODE[\s\S]*?<\/div>/);

      // Left container must have min-w-0 to allow truncation
      expect(html).toMatch(/<div class="flex items-center space-x-2 sm:space-x-3 min-w-0">/);

      // Select container must have min-w-0
      expect(html).toMatch(/<div class="flex items-center space-x-1.5 h-8 px-2.5 rounded-md bg-surface-inset border border-border text-\[11px\] font-mono text-muted min-w-0">/);
    });

    it("truncates policy selector with responsive max-width classes even under adversarial policy names", () => {
      // Test with long policy ID string
      const adversarialPolicyId =
        "pol_adversarial_super_unbounded_extreme_cryptographic_verification_rule_that_would_blow_up_unbounded_layout_at_375px_viewport_width_2026";

      const html = renderToStaticMarkup(
        React.createElement(App, {
          initialPolicyId: adversarialPolicyId,
        })
      );

      // Policy selector element MUST contain truncate and max-width capping
      expect(html).toContain('data-testid="header-policy-selector"');
      expect(html).toContain("max-w-[130px] sm:max-w-[200px] md:max-w-[260px] truncate");

      // Verify that right-side sandbox pill remains intact and unaffected
      expect(html).toContain("SANDBOX MODE");
      expect(html).toContain("Refresh status");
    });

    it("enforces zero duplicate branding in top header toolbar", () => {
      const html = renderToStaticMarkup(React.createElement(App));

      // Split rendered HTML to inspect <header> exclusively
      const headerMatch = html.match(/<header[\s\S]*?<\/header>/);
      expect(headerMatch).not.toBeNull();
      const headerHtml = headerMatch![0];

      // Primary brand title "WARRANT STUDIO" and subtitle must NOT exist in the header
      expect(headerHtml).not.toContain("WARRANT STUDIO");
      expect(headerHtml).not.toContain("Purchase Authorization &amp; Cryptographic Policy Engine");

      // Verify that branding exists inside the sidebar header
      const sidebarMatch = html.match(/<aside[\s\S]*?<\/aside>/);
      expect(sidebarMatch).not.toBeNull();
      const sidebarHtml = sidebarMatch![0];
      expect(sidebarHtml).toContain("WARRANT");
      expect(sidebarHtml).toContain("STUDIO");
      expect(sidebarHtml).toContain("Purchase Authorization &amp; Cryptographic Policy Engine");
    });
  });

  describe("2. Desktop Sidebar Collapse/Expand Toggle & Zero Layout Jitter", () => {
    const dummyGroups = WORKSTATION_GROUPS;

    it("renders w-64 p-4 in expanded mode and w-16 p-2 in collapsed mode with transition-[width]", () => {
      // Expanded mode
      const expandedHtml = renderToStaticMarkup(
        React.createElement(Sidebar, {
          groups: dummyGroups,
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
          groups: dummyGroups,
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

    it("empirically verifies border thickness parity (3.5px) between active and inactive items in expanded mode", () => {
      for (const ws of ALL_WORKSTATIONS) {
        const html = renderToStaticMarkup(
          React.createElement(Sidebar, {
            groups: dummyGroups,
            activeWorkstation: ws.id,
            onSelectWorkstation: vi.fn(),
            isCollapsed: false,
            onToggleCollapse: vi.fn(),
          })
        );

        // Active item has border-l-[3.5px] border-accent
        expect(html).toContain("border-l-[3.5px] border-accent");

        // Inactive items have border-l-[3.5px] border-transparent
        expect(html).toContain("border-l-[3.5px] border-transparent");
      }
    });

    it("empirically verifies border thickness parity (3.5px) between active and inactive items in collapsed mode", () => {
      for (const ws of ALL_WORKSTATIONS) {
        const html = renderToStaticMarkup(
          React.createElement(Sidebar, {
            groups: dummyGroups,
            activeWorkstation: ws.id,
            onSelectWorkstation: vi.fn(),
            isCollapsed: true,
            onToggleCollapse: vi.fn(),
          })
        );

        // Active item has border-l-[3.5px] border-accent
        expect(html).toContain("border-l-[3.5px] border-accent");

        // Inactive items have border-l-[3.5px] border-transparent
        expect(html).toContain("border-l-[3.5px] border-transparent");
      }
    });

    it("renders zero-flow floating tooltips with absolute positioning in collapsed mode", () => {
      const html = renderToStaticMarkup(
        React.createElement(Sidebar, {
          groups: dummyGroups,
          activeWorkstation: "mandate",
          onSelectWorkstation: vi.fn(),
          isCollapsed: true,
          onToggleCollapse: vi.fn(),
        })
      );

      // Tooltip must be absolute, outside layout flow (left-full), non-intercepting (pointer-events-none)
      expect(html).toContain("absolute left-full ml-2.5 px-2.5 py-1 rounded-md bg-ink text-surface");
      expect(html).toContain("pointer-events-none");
      expect(html).toContain("opacity-0 group-hover:opacity-100 transition-opacity duration-150 ease-out z-50");
      expect(html).toContain("Mandate Compiler");
    });

    it("verifies desktop sidebar toggle button is rendered at bottom of sidebar and main content resizes correctly", () => {
      const html = renderToStaticMarkup(React.createElement(App));

      // Desktop toggle button is rendered in the sidebar footer with data-testid
      expect(html).toContain('data-testid="desktop-sidebar-toggle-btn"');
      expect(html).toContain("hidden md:flex");

      // Main content container has flex-1 to auto-resize when sidebar expands/collapses
      expect(html).toContain('id="main-scroll-container"');
      expect(html).toContain("flex-1 overflow-y-auto");
    });

    it("renders interactive collapse toggle in sidebar footer for both expanded and collapsed modes", () => {
      // Expanded mode shows Collapse text
      const expandedHtml = renderToStaticMarkup(
        React.createElement(Sidebar, {
          groups: dummyGroups,
          activeWorkstation: "overview",
          onSelectWorkstation: vi.fn(),
          isCollapsed: false,
          onToggleCollapse: vi.fn(),
        })
      );
      expect(expandedHtml).toContain("Collapse");
      expect(expandedHtml).toContain('aria-label="Collapse navigation sidebar"');

      // Collapsed mode shows expand label
      const collapsedHtml = renderToStaticMarkup(
        React.createElement(Sidebar, {
          groups: dummyGroups,
          activeWorkstation: "overview",
          onSelectWorkstation: vi.fn(),
          isCollapsed: true,
          onToggleCollapse: vi.fn(),
        })
      );
      expect(collapsedHtml).toContain('aria-label="Expand navigation sidebar"');
    });
  });

  describe("3. LocalStorage Persistence & Safe SSR Fallback", () => {
    it("safely falls back to false when window is undefined (SSR environment)", () => {
      vi.stubGlobal("window", undefined);

      const html = renderToStaticMarkup(React.createElement(App));
      // In SSR without window, default sidebar is expanded (w-64)
      expect(html).toContain("w-64 p-4");
      expect(html).not.toContain("w-16 p-2");
    });

    it("safely falls back to false when localStorage is undefined or restricted", () => {
      vi.stubGlobal("window", {
        location: { search: "", pathname: "/" },
        localStorage: undefined,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });

      const html = renderToStaticMarkup(React.createElement(App));
      expect(html).toContain("w-64 p-4");
    });

    it("safely falls back to false when localStorage.getItem throws SecurityError", () => {
      vi.stubGlobal("window", {
        location: { search: "", pathname: "/" },
        localStorage: {
          getItem: vi.fn(() => {
            throw new Error("SecurityError: Access to localStorage is denied");
          }),
          setItem: vi.fn(),
        },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });

      const html = renderToStaticMarkup(React.createElement(App));
      expect(html).toContain("w-64 p-4");
    });

    it("restores collapsed state when localStorage has 'true'", () => {
      mockStorage["warrant_sidebar_collapsed"] = "true";

      const html = renderToStaticMarkup(React.createElement(App));
      // Should mount with collapsed sidebar (w-16)
      expect(html).toContain("w-16 p-2");
    });

    it("restores expanded state when localStorage has 'false'", () => {
      mockStorage["warrant_sidebar_collapsed"] = "false";

      const html = renderToStaticMarkup(React.createElement(App));
      expect(html).toContain("w-64 p-4");
    });

    it("restores expanded state when localStorage contains arbitrary invalid strings", () => {
      mockStorage["warrant_sidebar_collapsed"] = "unknown_corrupt_value_xyz";

      const html = renderToStaticMarkup(React.createElement(App));
      expect(html).toContain("w-64 p-4");
    });
  });

  describe("4. Mobile Navigation Drawer Accessibility & Lenis Isolation", () => {
    it("renders mobile drawer with id matching aria-controls and Lenis isolation attribute", () => {
      const html = renderToStaticMarkup(
        React.createElement(MobileNavDrawer, {
          isOpen: true,
          onClose: vi.fn(),
          groups: WORKSTATION_GROUPS,
          activeWorkstation: "mandate",
          onSelectWorkstation: vi.fn(),
          drawerRef: { current: null },
          selectedPolicyId: "pol_v1_books_hardware",
          onSelectPolicy: vi.fn(),
          policyOptions: [],
        })
      );

      // Drawer container
      expect(html).toContain('id="mobile-nav-drawer"');
      expect(html).toContain("data-lenis-prevent");
      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      expect(html).toContain('aria-label="Mobile Navigation Menu"');
      expect(html).toContain("transition-transform duration-220 ease-in-out");
      expect(html).toContain("translate-x-0");
    });

    it("renders drawer with -translate-x-full when closed", () => {
      const html = renderToStaticMarkup(
        React.createElement(MobileNavDrawer, {
          isOpen: false,
          onClose: vi.fn(),
          groups: WORKSTATION_GROUPS,
          activeWorkstation: "mandate",
          onSelectWorkstation: vi.fn(),
          drawerRef: { current: null },
          selectedPolicyId: "pol_v1_books_hardware",
          onSelectPolicy: vi.fn(),
          policyOptions: [],
        })
      );

      expect(html).toContain("-translate-x-full");
    });
  });

  describe("5. Micro-Motion Active Scaling Purge & index.css Invariant Check", () => {
    it("verifies index.css does NOT contain scale(0.98) or active scaling on interactive elements", () => {
      const cssPath = path.resolve(__dirname, "../index.css");
      const cssContent = fs.readFileSync(cssPath, "utf-8");

      // Verify scale(0.98) was completely purged
      expect(cssContent).not.toContain("scale(0.98)");
      expect(cssContent).not.toContain("transform: scale");

      // Verify active state uses background color inset
      expect(cssContent).toContain(".motion-interactive:active");
      expect(cssContent).toContain("background-color: var(--color-surface-inset)");

      // Verify prefers-reduced-motion block exists
      expect(cssContent).toContain("@media (prefers-reduced-motion: reduce)");
    });
  });
});
