import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { App, WORKSTATION_GROUPS, ALL_WORKSTATIONS } from "../App";
import { AVAILABLE_POLICIES } from "../api/verificationService";

describe("Global App Shell, Navigation & 9-Route Sanity Check (Phase 2)", () => {
  beforeEach(() => {
    // Stub window in Node environment
    vi.stubGlobal("window", {
      location: {
        search: "",
        pathname: "/",
      },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("1. Default Shell Mounting & Design Token Invariants", () => {
    it("renders default overview workstation with PayPal Developer palette classes", () => {
      const html = renderToStaticMarkup(React.createElement(App));

      // Root canvas & text ink
      expect(html).toContain("bg-canvas");
      expect(html).toContain("text-ink");

      // Header branding
      expect(html).toContain("WARRANT");
      expect(html).toContain("STUDIO");
      expect(html).toContain("Purchase Authorization &amp; Cryptographic Policy Engine");

      // Sandbox indicator
      expect(html).toContain("SANDBOX MODE");

      // Breadcrumb ribbon
      expect(html).toContain("Command Center");
      expect(html).toContain("System Dashboard");
      expect(html).toContain("Fail-Closed (D-014)");

      // Default mounted workstation content
      expect(html).toContain("System Dashboard");
    });

    it("renders the interactive header policy selector with all available policies", () => {
      const html = renderToStaticMarkup(React.createElement(App));

      // Policy selector present
      expect(html).toContain('data-testid="header-policy-selector"');
      expect(html).toContain("Policy:");

      // Contains options for all canonical policy presets
      for (const policy of AVAILABLE_POLICIES) {
        expect(html).toContain(policy.id);
      }
    });

    it("desktop sidebar renders all 4 workstation groups and applies zero-jitter border-l-2 styling", () => {
      const html = renderToStaticMarkup(React.createElement(App, { initialWorkstation: "overview" }));

      // All 4 groups rendered
      for (const group of WORKSTATION_GROUPS) {
        expect(html).toContain(group.title.replace(/&/g, "&amp;"));
      }

      // All workstations present in navigation
      for (const ws of ALL_WORKSTATIONS) {
        expect(html).toContain(ws.label.replace(/&/g, "&amp;"));
      }

      // Active item has border-accent; inactive items have border-transparent (zero layout shift)
      expect(html).toContain("border-accent");
      expect(html).toContain("border-transparent");

      // Engine status footer
      expect(html).toContain("Warrant Engine");
      expect(html).toContain("v0.1.0-sandbox");
    });

    it("renders accessible mobile navigation hamburger toggle button", () => {
      const html = renderToStaticMarkup(React.createElement(App));
      expect(html).toContain('data-testid="mobile-nav-toggle-btn"');
      expect(html).toContain('aria-label="Open navigation menu"');
      expect(html).toContain('aria-expanded="false"');
    });
  });

  describe("2. URL Query Parameter Interception & Routing", () => {
    it("routes to transactions workstation when ?token=... is present in URL", () => {
      vi.stubGlobal("window", {
        location: {
          search: "?token=EC-1234567890",
          pathname: "/",
        },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });

      const html = renderToStaticMarkup(React.createElement(App));
      expect(html).toContain("Transactions");
      expect(html).toContain("PayPal orders &amp; reconciliation");
    });

    it("routes to transactions workstation when ?orderId=... is present in URL", () => {
      vi.stubGlobal("window", {
        location: {
          search: "?orderId=5O190127TN364715T",
          pathname: "/",
        },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });

      const html = renderToStaticMarkup(React.createElement(App));
      expect(html).toContain("Transactions");
    });

    it("routes to specific workstation via ?workstation=... query parameter", () => {
      vi.stubGlobal("window", {
        location: {
          search: "?workstation=approval",
          pathname: "/",
        },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });

      const html = renderToStaticMarkup(React.createElement(App));
      expect(html).toContain("Approval Checkpoints");
      expect(html).toContain("Policy binding &amp; spend limits");
    });

    it("routes to specific workstation via ?ws=... short query parameter", () => {
      vi.stubGlobal("window", {
        location: {
          search: "?ws=findings",
          pathname: "/",
        },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });

      const html = renderToStaticMarkup(React.createElement(App));
      expect(html).toContain("Findings &amp; Witnesses");
    });
  });

  describe("3. Mandatory 9-Route Sanity Check (Mounting & Zero Layout Break)", () => {
    it("Route 1: mounts overview (System Dashboard) without error", () => {
      const html = renderToStaticMarkup(React.createElement(App, { initialWorkstation: "overview" }));
      expect(html).toContain("System Dashboard");
      expect(html).toContain("Operational metrics &amp; risk posture");
    });

    it("Route 2: mounts mandate (Mandate Compiler) and alias intent without error", () => {
      const htmlMandate = renderToStaticMarkup(React.createElement(App, { initialWorkstation: "mandate" }));
      expect(htmlMandate).toContain("Mandate Compiler");
      expect(htmlMandate).toContain("Natural language intent compilation");

      const htmlIntent = renderToStaticMarkup(React.createElement(App, { initialWorkstation: "intent" }));
      expect(htmlIntent).toContain("Mandate Compiler");
    });

    it("Route 3: mounts policy-versions (Policy Versions & Change Impact) without error", () => {
      const html = renderToStaticMarkup(React.createElement(App, { initialWorkstation: "policy-versions" }));
      expect(html).toContain("Policy Versions");
      expect(html).toContain("Immutable version diff &amp; impact");
    });

    it("Route 4: mounts verification (Verification Studio) without error", () => {
      const html = renderToStaticMarkup(React.createElement(App, { initialWorkstation: "verification" }));
      expect(html).toContain("Verification Studio");
      expect(html).toContain("Finite bounded loophole search");
    });

    it("Route 5: mounts findings (Findings & Witnesses) without error", () => {
      const html = renderToStaticMarkup(React.createElement(App, { initialWorkstation: "findings" }));
      expect(html).toContain("Findings &amp; Witnesses");
      expect(html).toContain("Counterexamples &amp; D-014 triage");
    });

    it("Route 6: mounts approval (Approval Checkpoints) without error", () => {
      const html = renderToStaticMarkup(React.createElement(App, { initialWorkstation: "approval" }));
      expect(html).toContain("Approval Checkpoints");
      expect(html).toContain("Policy binding &amp; spend limits");
    });

    it("Route 7: mounts checkout (Checkout Gate) without error", () => {
      const html = renderToStaticMarkup(React.createElement(App, { initialWorkstation: "checkout" }));
      expect(html).toContain("Checkout Gate");
      expect(html).toContain("Nonce replay &amp; authorization");
    });

    it("Route 8: mounts transactions (Transactions Ledger) without error", () => {
      const html = renderToStaticMarkup(React.createElement(App, { initialWorkstation: "transactions" }));
      expect(html).toContain("Transactions");
      expect(html).toContain("PayPal orders &amp; reconciliation");
    });

    it("Route 9: mounts evaluation (Evaluation Report & Evidence Hub) without error", () => {
      const html = renderToStaticMarkup(React.createElement(App, { initialWorkstation: "evaluation" }));
      expect(html).toContain("Evaluation Report");
      expect(html).toContain("Cryptographic invariant proof");
    });

    it("Route 10: mounts purchases without error and renders transactions panel", () => {
      const html = renderToStaticMarkup(React.createElement(App, { initialWorkstation: "purchases" }));
      expect(html).toContain("Purchases");
      expect(html).toContain("Transactions &amp; Payment Lifecycle");
    });

    it("Fallback: renders clean development placeholder on unknown route", () => {
      const html = renderToStaticMarkup(React.createElement(App, { initialWorkstation: "unknown-route-xyz" }));
      expect(html).toContain("Workstation in Development");
      expect(html).toContain("Open Verification Studio");
    });
  });
});
