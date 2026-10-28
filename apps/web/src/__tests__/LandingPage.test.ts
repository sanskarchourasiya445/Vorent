import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { VorentLandingPage } from "../components/landing/VorentLandingPage";
import { LandingNavbar } from "../components/landing/LandingNavbar";
import { LandingHero } from "../components/landing/LandingHero";
import { LandingProblemSolution } from "../components/landing/LandingProblemSolution";
import { LandingHowItWorks } from "../components/landing/LandingHowItWorks";
import { LandingCapabilities } from "../components/landing/LandingCapabilities";
import { LandingShowcase } from "../components/landing/LandingShowcase";
import { LandingSecurityInvariants } from "../components/landing/LandingSecurityInvariants";
import { LandingFaq } from "../components/landing/LandingFaq";
import { LandingFooter } from "../components/landing/LandingFooter";
import { Landing3DEmblem } from "../components/landing/Landing3DEmblem";
import { LandingWorkflowAnimation } from "../components/landing/LandingWorkflowAnimation";
import { App } from "../App";
import { AuthProvider } from "../providers/AuthContext";
import { ThemeProvider } from "../providers/ThemeProvider";

describe("VORENT Enterprise Landing Page & 3D Motion Invariants", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      location: {
        search: "?view=landing",
        pathname: "/",
        hash: "",
      },
      matchMedia: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
      scrollTo: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const renderWithProviders = (ui: React.ReactElement) => {
    return renderToStaticMarkup(
      React.createElement(
        ThemeProvider,
        null,
        React.createElement(AuthProvider, null, ui)
      )
    );
  };

  describe("1. VorentLandingPage Root Orchestrator", () => {
    it("renders complete landing page flow with all verified sections", () => {
      const html = renderWithProviders(React.createElement(VorentLandingPage));

      // Brand wordmark & identity
      expect(html).toContain("VORENT");
      expect(html).toContain("SANDBOX");

      // Key sections present
      expect(html).toContain("AI agents shouldn&#x27;t authorize their own payments.");
      expect(html).toContain("The Self-Authorization Flaw in Autonomous Commerce");
      expect(html).toContain("The 5-Stage Verification &amp; Settlement Loop");
      expect(html).toContain("Engineered for Production Rigor");
      expect(html).toContain("An Authoritative Security Console, Not a Chatbot");
      expect(html).toContain("Governed by Invariants, Proven by 790 Tests");
      expect(html).toContain("Frequently Asked Questions");
      expect(html).toContain("Ready to verify your first purchasing mandate?");
    });

    it("does not render unwanted horizontal divider lines (border-b border-border) on sections", () => {
      const html = renderWithProviders(React.createElement(VorentLandingPage));

      // Check section tags for lack of hard horizontal separator borders
      expect(html).not.toMatch(/<section[^>]*border-b border-border/);
      expect(html).not.toMatch(/<footer[^>]*border-t border-border/);
    });
  });

  describe("2. Hero Section & 3D Product Experience", () => {
    it("renders headline, value proposition, prominent Sign Up and Explore Features CTAs, and trust strip", () => {
      const html = renderWithProviders(React.createElement(LandingHero, { onLaunchConsole: vi.fn() }));

      expect(html).toContain("AI agents shouldn&#x27;t authorize their own payments.");
      expect(html).toContain("Launch Sandbox Console");
      expect(html).toContain("Run Verification Tour");

      // Prominent Sign Up and Explore Features actions
      expect(html).toContain('data-testid="hero-signup-btn"');
      expect(html).toContain("Sign Up");
      expect(html).toContain('data-testid="hero-explore-features-btn"');
      expect(html).toContain("Explore Features");

      // 3D Perspective Product Experience & Real Capabilities
      expect(html).toContain("Intent AST Compiler");
      expect(html).toContain("Loophole Model Checker");
      expect(html).toContain("1-Time Nonce Guard");
      expect(html).toContain("PayPal Sandbox Rail");
      expect(html).toContain("D-014 ARMED");

      // Empirically verified guarantees
      expect(html).toContain("790 Tests Passing");
      expect(html).toContain("D-014 Fail-Closed");
      expect(html).toContain("RFC 8785 Hashing");
      expect(html).toContain("PayPal Sandbox v2");
    });

    it("renders the 3D metallic V emblem with electric-blue backlight", () => {
      const html = renderWithProviders(React.createElement(Landing3DEmblem));

      expect(html).toContain("VORENT Metallic V Emblem");
      expect(html).toContain("FAIL-CLOSED GATE");
      expect(html).toContain("/brand/vorent-emblem.png");
      expect(html).toContain("role=\"img\"");
    });
  });

  describe("3. Problem & Solution Comparison", () => {
    it("renders comparative analysis of unconstrained agent vs decoupled fail-closed gate", () => {
      const html = renderWithProviders(React.createElement(LandingProblemSolution));

      expect(html).toContain("The Direct Agent Model");
      expect(html).toContain("The VORENT Gate Architecture");
      expect(html).toContain("Self-Authorization &amp; Prompt Injection");
      expect(html).toContain("Decoupled Intent, Model Checking &amp; Cryptographic Nonces");
    });
  });

  describe("4. Execution Lifecycle & Interactive Workflow Simulator", () => {
    it("renders the interactive 4-stage workflow simulator and 5 stage summary cards", () => {
      const html = renderWithProviders(React.createElement(LandingHowItWorks));

      // Simulator container
      expect(html).toContain("Interactive Lifecycle Simulator");
      expect(html).toContain("Policy Intent");
      expect(html).toContain("Loophole Check");
      expect(html).toContain("Fail-Closed Gate");
      expect(html).toContain("PayPal Settlement");

      // 5-step cards
      expect(html).toContain("Mandate Compilation");
      expect(html).toContain("Bounded Loophole Search");
      expect(html).toContain("RFC 8785 Hash Commitment");
      expect(html).toContain("Fail-Closed Spend Approvals");
      expect(html).toContain("Runtime Gate &amp; PayPal Settlement");
    });

    it("renders code snippets and operational guarantees in simulator", () => {
      const html = renderWithProviders(React.createElement(LandingWorkflowAnimation));

      expect(html).toContain("SPECIFICATION LAYER");
      expect(html).toContain("pol_v2_canonical_fixed");
      expect(html).toContain("RFC 8785 Canonical");
    });
  });

  describe("4b. Architectural Capabilities", () => {
    it("renders the 4 core capability cards", () => {
      const html = renderWithProviders(React.createElement(LandingCapabilities));
      expect(html).toContain("Mandate Compiler &amp; Adversarial Shield");
      expect(html).toContain("Finite-Domain Model Checker");
      expect(html).toContain("Fail-Closed Governance (Decision D-014)");
      expect(html).toContain("Idempotent PayPal Sandbox Settlement");
    });
  });

  describe("5. Product Showcase & Dimensional Frame", () => {
    it("renders dimensional product frame with browser chrome and real screenshot tabs", () => {
      const html = renderWithProviders(React.createElement(LandingShowcase, { onLaunchConsole: vi.fn() }));

      expect(html).toContain("https://console.vorent.internal/?ws=");
      expect(html).toContain("System Dashboard &amp; Real-Time Risk Posture");
      expect(html).toContain("Decision D-014 Alert: 25 unresolved high/critical findings");
      expect(html).toContain("/screenshots/01_desktop_1440x900_dark.png");
    });
  });

  describe("6. Security Invariants & System Boundaries", () => {
    it("renders INV-01 through INV-06 with test proof mapping", () => {
      const html = renderWithProviders(React.createElement(LandingSecurityInvariants));

      expect(html).toContain("INV-01");
      expect(html).toContain("Deterministic Policy Evaluation");
      expect(html).toContain("INV-02");
      expect(html).toContain("RFC 8785 Canonical Hashing");
      expect(html).toContain("INV-03");
      expect(html).toContain("Decision D-014 Fail-Closed Gate");
      expect(html).toContain("INV-04");
      expect(html).toContain("Single-Use Nonce Replay Defense");
      expect(html).toContain("INV-05");
      expect(html).toContain("Row-Locked Spend Reservation");
      expect(html).toContain("INV-06");
      expect(html).toContain("Idempotent Capture &amp; Reconciliation Holds");

      // Boundary disclaimer
      expect(html).toContain("System Boundary &amp; Sandbox Environment Disclosure");
      expect(html).toContain("PAYPAL_ENV=sandbox");
    });
  });

  describe("7. FAQ & Footer", () => {
    it("renders FAQ addressing real PayPal Sandbox and AI boundaries", () => {
      const html = renderWithProviders(React.createElement(LandingFaq));

      expect(html).toContain("Does VORENT execute real-money payments?");
      expect(html).toContain("Can an AI model override a DENY or REVIEW decision?");
      expect(html).toContain("How does VORENT handle ambiguous network timeouts during payment?");
    });

    it("renders canonical footer with workstation links and launch banner", () => {
      const html = renderWithProviders(React.createElement(LandingFooter, { onLaunchConsole: vi.fn() }));

      expect(html).toContain("Ready to verify your first purchasing mandate?");
      expect(html).toContain("Launch Sandbox Console");
      expect(html).toContain("Console Workstations");
      expect(html).toContain("License: MIT");
    });
  });

  describe("8. App Shell Route Integration", () => {
    it("renders VorentLandingPage when view=landing is in search params", () => {
      vi.stubGlobal("window", {
        location: {
          search: "?view=landing",
          pathname: "/",
          hash: "",
        },
        matchMedia: vi.fn().mockImplementation((query: string) => ({
          matches: false,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        })),
        scrollTo: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      });

      const html = renderToStaticMarkup(React.createElement(App));

      expect(html).toContain("AI agents shouldn&#x27;t authorize their own payments.");
      expect(html).toContain("Intent AST Compiler");
    });
  });

  describe("9. Navbar Authentication Controls", () => {
    it("renders redesigned Log In and Sign Up actions and omits Launch Console for public visitors", () => {
      const html = renderWithProviders(
        React.createElement(LandingNavbar, { onLaunchConsole: vi.fn() })
      );

      // Public visitor navbar must show Log In and Sign Up with refined hierarchy
      expect(html).toContain('data-testid="navbar-login-btn"');
      expect(html).toContain("Log In");
      expect(html).toContain('data-testid="navbar-signup-btn"');
      expect(html).toContain("Sign Up");

      // Must NOT contain "Launch Console" in the public unauthenticated navbar
      expect(html).not.toContain("Launch Console");

      // Must NOT contain System Admin profile or Sign Out button on the landing navbar
      expect(html).not.toContain("System Admin");
      expect(html).not.toContain("data-testid=\"navbar-logout-btn\"");
      expect(html).not.toContain("Sign Out");
    });
  });

  describe("10. Ambient Particles & Cinematic Presentation", () => {
    it("renders ambient canvas particles in the elevated hero section", () => {
      const html = renderWithProviders(React.createElement(LandingHero, { onLaunchConsole: vi.fn() }));
      expect(html).toContain("<canvas");
      expect(html).toContain("aria-hidden=\"true\"");
    });
  });
});
