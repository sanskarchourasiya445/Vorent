import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SidebarAccountMenu } from "../components/navigation/SidebarAccountMenu";
import { AccountSettingsModal } from "../components/account/AccountSettingsModal";
import { Sidebar } from "../components/navigation/Sidebar";
import { WORKSTATION_GROUPS } from "../App";
import { AuthProvider } from "../providers/AuthContext";
import { ThemeProvider } from "../providers/ThemeProvider";

describe("SidebarAccountMenu & AccountSettingsModal (Account Hub Verification)", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      location: { search: "", pathname: "/" },
      innerWidth: 1280,
      innerHeight: 800,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      localStorage: {
        getItem: vi.fn(() => null),
        setItem: vi.fn(),
        removeItem: vi.fn(),
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("1. SidebarAccountMenu Invariants & States", () => {
    it("renders account control at bottom of expanded sidebar with avatar and initials", () => {
      const html = renderToStaticMarkup(
        React.createElement(
          AuthProvider,
          null,
          React.createElement(SidebarAccountMenu, { isCollapsed: false })
        )
      );

      // Verify account container and button
      expect(html).toContain('data-testid="sidebar-account-container"');
      expect(html).toContain('data-testid="sidebar-account-btn"');

      // Operator identity or default persona initials
      expect(html).toContain("W"); // Initials circle fallback / operator initials
      expect(html).toContain("Warrant Enterprise HQ");
    });

    it("renders compact accessible button when sidebar is collapsed", () => {
      const html = renderToStaticMarkup(
        React.createElement(
          AuthProvider,
          null,
          React.createElement(SidebarAccountMenu, { isCollapsed: true })
        )
      );

      expect(html).toContain('data-testid="sidebar-account-container"');
      expect(html).toContain('data-testid="sidebar-account-btn"');
      expect(html).toContain("aria-label=");
      // In collapsed mode, expanded label text is omitted from the button layout
      expect(html).toContain("justify-center");
    });

    it("keeps main Sidebar clean without sidebar account container", () => {
      const html = renderToStaticMarkup(
        React.createElement(
          AuthProvider,
          null,
          React.createElement(Sidebar, {
            groups: WORKSTATION_GROUPS,
            activeWorkstation: "overview",
            onSelectWorkstation: vi.fn(),
            isCollapsed: false,
            onToggleCollapse: vi.fn(),
          })
        )
      );

      // Verify sidebar contains engine status and collapse toggle, but no sidebar account menu
      expect(html).toContain("VORENT Engine");
      expect(html).toContain("System Online");
      expect(html).not.toContain('data-testid="sidebar-account-container"');
    });
  });

  describe("2. AccountSettingsModal Institutional Tabs & Content", () => {
    it("renders closed when isOpen is false", () => {
      const html = renderToStaticMarkup(
        React.createElement(
          ThemeProvider,
          null,
          React.createElement(
            AuthProvider,
            null,
            React.createElement(AccountSettingsModal, {
              isOpen: false,
              onClose: vi.fn(),
            })
          )
        )
      );

      expect(html).toBe("");
    });

    it("renders all 8 institutional tabs when isOpen is true", () => {
      const html = renderToStaticMarkup(
        React.createElement(
          ThemeProvider,
          null,
          React.createElement(
            AuthProvider,
            null,
            React.createElement(AccountSettingsModal, {
              isOpen: true,
              onClose: vi.fn(),
              initialTab: "profile",
            })
          )
        )
      );

      expect(html).toContain('data-testid="account-settings-modal"');
      expect(html).toContain("Account Hub &amp; Governance Center");

      // Verify all 8 tabs are rendered
      expect(html).toContain("Profile");
      expect(html).toContain("Security &amp; Sign-in");
      expect(html).toContain("Organization &amp; Workspace");
      expect(html).toContain("Roles &amp; Permissions");
      expect(html).toContain("Preferences");
      expect(html).toContain("Connected Services");
      expect(html).toContain("Account Activity");
      expect(html).toContain("Help &amp; Legal");
    });

    it("renders security settings with password update form and session management", () => {
      const html = renderToStaticMarkup(
        React.createElement(
          ThemeProvider,
          null,
          React.createElement(
            AuthProvider,
            null,
            React.createElement(AccountSettingsModal, {
              isOpen: true,
              onClose: vi.fn(),
              initialTab: "security",
            })
          )
        )
      );

      expect(html).toContain('data-testid="security-section"');
      expect(html).toContain("Security &amp; Sign-in Methods");
      expect(html).toContain("Update Password");
      expect(html).toContain('data-testid="change-password-btn"');
      expect(html).toContain("Active Sessions");
    });

    it("renders organization tab with enterprise governance structure", () => {
      const html = renderToStaticMarkup(
        React.createElement(
          ThemeProvider,
          null,
          React.createElement(
            AuthProvider,
            null,
            React.createElement(AccountSettingsModal, {
              isOpen: true,
              onClose: vi.fn(),
              initialTab: "organization",
            })
          )
        )
      );

      expect(html).toContain('data-testid="organization-section"');
      expect(html).toContain("Organization &amp; Workspace");
      expect(html).toContain("Warrant Enterprise HQ");
      expect(html).toContain("Workspace Personnel");
    });

    it("renders roles and RBAC matrix with anti-escalation safeguards", () => {
      const html = renderToStaticMarkup(
        React.createElement(
          ThemeProvider,
          null,
          React.createElement(
            AuthProvider,
            null,
            React.createElement(AccountSettingsModal, {
              isOpen: true,
              onClose: vi.fn(),
              initialTab: "roles",
            })
          )
        )
      );

      expect(html).toContain('data-testid="roles-section"');
      expect(html).toContain("Roles &amp; Authority Matrix");
      expect(html).toContain("Compile NL Mandate to AST");
      expect(html).toContain("Run Bounded Permutation Search");
      expect(html).toContain("cannot grant or escalate privileges");
    });

    it("renders preferences tab with Warm Ivory and Midnight Navy themes", () => {
      const html = renderToStaticMarkup(
        React.createElement(
          ThemeProvider,
          null,
          React.createElement(
            AuthProvider,
            null,
            React.createElement(AccountSettingsModal, {
              isOpen: true,
              onClose: vi.fn(),
              initialTab: "preferences",
            })
          )
        )
      );

      expect(html).toContain('data-testid="preferences-form"');
      expect(html).toContain("Interface &amp; Policy Preferences");
      expect(html).toContain("Warm Ivory");
      expect(html).toContain("Midnight Navy");
      expect(html).toContain("Default Verification Policy Context");
      expect(html).toContain('data-testid="save-preferences-btn"');
    });

    it("renders connected services with PayPal Sandbox, Gemini, and PostgreSQL telemetry", () => {
      const html = renderToStaticMarkup(
        React.createElement(
          ThemeProvider,
          null,
          React.createElement(
            AuthProvider,
            null,
            React.createElement(AccountSettingsModal, {
              isOpen: true,
              onClose: vi.fn(),
              initialTab: "integrations",
            })
          )
        )
      );

      expect(html).toContain('data-testid="integrations-section"');
      expect(html).toContain("PayPal Orders v2 API");
      expect(html).toContain("Google Gemini LLM Engine");
      expect(html).toContain("PostgreSQL Database Engine");
      expect(html).toContain("Engine RLS: Disabled (App Layer Enforced)");
    });

    it("renders help and legal tab with privacy policy and terms of service", () => {
      const html = renderToStaticMarkup(
        React.createElement(
          ThemeProvider,
          null,
          React.createElement(
            AuthProvider,
            null,
            React.createElement(AccountSettingsModal, {
              isOpen: true,
              onClose: vi.fn(),
              initialTab: "help",
            })
          )
        )
      );

      expect(html).toContain('data-testid="help-section"');
      expect(html).toContain("Privacy Policy");
      expect(html).toContain("Terms of Service");
      expect(html).toContain("D-014");
    });
  });
});
