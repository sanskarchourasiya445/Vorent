import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { App, parseRoute, AuthLoadingScreen } from "../App";
import { AuthProvider, useAuth } from "../providers/AuthContext";
import { authService } from "../api/authService";
import type { AuthUser } from "@warrant/contracts";

describe("Mandatory Authentication-First Flow & Route Gating Invariants", () => {
  let mockStorage: Record<string, string> = {};

  beforeEach(() => {
    mockStorage = {};
    vi.stubGlobal("window", {
      location: {
        pathname: "/",
        search: "",
        hash: "",
      },
      history: {
        pushState: vi.fn(),
        replaceState: vi.fn(),
      },
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
      scrollTo: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe("1. URL Route Parsing & Intent Classification (parseRoute)", () => {
    it("correctly identifies explicit landing page URLs", () => {
      expect(parseRoute({ pathname: "/landing" }).isExplicitLanding).toBe(true);
      expect(parseRoute({ pathname: "/", search: "?view=landing" }).isExplicitLanding).toBe(true);
      expect(parseRoute({ pathname: "/", hash: "#landing" }).isExplicitLanding).toBe(true);
      expect(parseRoute({ pathname: "/console", search: "?view=landing" }).isExplicitLanding).toBe(true);
    });

    it("correctly classifies direct console URLs and extracts workstation", () => {
      const r1 = parseRoute({ pathname: "/console" });
      expect(r1.isConsoleIntent).toBe(true);
      expect(r1.workstation).toBeUndefined();

      const r2 = parseRoute({ pathname: "/console/verification" });
      expect(r2.isConsoleIntent).toBe(true);
      expect(r2.workstation).toBe("verification");

      const r3 = parseRoute({ pathname: "/console/approval" });
      expect(r3.isConsoleIntent).toBe(true);
      expect(r3.workstation).toBe("approval");

      const r4 = parseRoute({ pathname: "/app/checkout" });
      expect(r4.isConsoleIntent).toBe(true);
      expect(r4.workstation).toBe("checkout");

      const r5 = parseRoute({ pathname: "/", search: "?workstation=mandate" });
      expect(r5.isConsoleIntent).toBe(true);
      expect(r5.workstation).toBe("mandate");

      const r6 = parseRoute({ pathname: "/", search: "?ws=transactions" });
      expect(r6.isConsoleIntent).toBe(true);
      expect(r6.workstation).toBe("transactions");

      const r7 = parseRoute({ pathname: "/", search: "?token=EC-12345" });
      expect(r7.isConsoleIntent).toBe(true);
      expect(r7.workstation).toBe("transactions");
    });

    it("treats root / without params as public landing intent for new visitors", () => {
      const r = parseRoute({ pathname: "/", search: "", hash: "" });
      expect(r.isConsoleIntent).toBe(false);
      expect(r.isExplicitLanding).toBe(false);
    });
  });

  describe("2. Unauthenticated Visitor Flow (Landing Page First)", () => {
    it("renders public landing page for new visitors with initialUser: null", () => {
      const html = renderToStaticMarkup(
        React.createElement(App, {
          initialUser: null,
          initialToken: null,
          initialIsLoading: false,
          initialView: "landing",
        })
      );

      // Public landing page value proposition
      expect(html).toContain("AI agents shouldn&#x27;t authorize their own payments.");
      expect(html).toContain("The Self-Authorization Flaw in Autonomous Commerce");

      // Sign up and login actions available
      expect(html).toContain('data-testid="navbar-login-btn"');
      expect(html).toContain('data-testid="navbar-signup-btn"');

      // Console UI elements are strictly NOT rendered
      expect(html).not.toContain("data-testid=\"desktop-sidebar-toggle-btn\"");
      expect(html).not.toContain("data-testid=\"header-policy-selector\"");
    });

    it("renders public landing page when visiting root with explicit landing view", () => {
      vi.stubGlobal("window", {
        location: {
          pathname: "/",
          search: "?view=landing",
          hash: "",
        },
        localStorage: {
          getItem: vi.fn(() => null),
          setItem: vi.fn(),
          removeItem: vi.fn(),
        },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        scrollTo: vi.fn(),
      });

      const html = renderToStaticMarkup(
        React.createElement(App, {
          initialUser: null,
          initialToken: null,
          initialIsLoading: false,
        })
      );

      expect(html).toContain("AI agents shouldn&#x27;t authorize their own payments.");
      expect(html).not.toContain("data-testid=\"header-policy-selector\"");
    });
  });

  describe("3. FOUC & Loading Screen Invariants", () => {
    it("renders institutional AuthLoadingScreen while checking session on console route", () => {
      vi.stubGlobal("window", {
        location: {
          pathname: "/console/verification",
          search: "",
          hash: "",
        },
        localStorage: {
          getItem: vi.fn(() => "warrant_token_test"),
          setItem: vi.fn(),
          removeItem: vi.fn(),
        },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        scrollTo: vi.fn(),
      });

      const html = renderToStaticMarkup(
        React.createElement(App, {
          initialIsLoading: true,
          initialToken: "warrant_token_test",
        })
      );

      expect(html).toContain('data-testid="auth-loading-screen"');
      expect(html).toContain("Authenticating Session");
      expect(html).toContain("Verifying cryptographic credentials and enterprise permissions");
      expect(html).toContain("Connecting to authority...");

      // Must not leak protected console workstations during loading
      expect(html).not.toContain("data-testid=\"desktop-sidebar-toggle-btn\"");
      expect(html).not.toContain("data-testid=\"header-policy-selector\"");
    });

    it("AuthLoadingScreen has appropriate accessibility attributes", () => {
      const html = renderToStaticMarkup(React.createElement(AuthLoadingScreen));
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');
      expect(html).toContain('data-testid="auth-loading-screen"');
    });
  });

  describe("4. No Mock Authentication & Clean Session Initialization", () => {
    it("initializes as unauthenticated when localStorage contains no token", () => {
      let authState: any = null;

      function TestConsumer() {
        authState = useAuth();
        return React.createElement("div", null, authState.isAuthenticated ? "AUTH" : "UNAUTH");
      }

      const html = renderToStaticMarkup(
        React.createElement(
          AuthProvider,
          { initialUser: null, initialToken: null, initialIsLoading: false },
          React.createElement(TestConsumer)
        )
      );

      expect(html).toContain("UNAUTH");
      expect(authState.user).toBeNull();
      expect(authState.token).toBeNull();
      expect(authState.isAuthenticated).toBe(false);
      expect(authState.isLoading).toBe(false);
    });

    it("does not automatically set user to admin@warrant.studio when unauthenticated", () => {
      let authState: any = null;

      function TestConsumer() {
        authState = useAuth();
        return React.createElement("div", null, authState.user?.email || "NO_USER");
      }

      const html = renderToStaticMarkup(
        React.createElement(
          AuthProvider,
          { initialUser: null, initialToken: null, initialIsLoading: false },
          React.createElement(TestConsumer)
        )
      );

      expect(html).toContain("NO_USER");
      expect(authState.user).toBeNull();
    });
  });

  describe("5. Authenticated Console Access & Workstation Mounting", () => {
    const mockUser: AuthUser = {
      id: "usr_lead_architect",
      email: "lead@warrant.studio",
      name: "Lead Architect",
      role: "ADMINISTRATOR",
      createdAt: "2026-01-01T00:00:00.000Z",
    };

    it("mounts console shell when authenticated with initialUser", () => {
      const html = renderToStaticMarkup(
        React.createElement(App, {
          initialUser: mockUser,
          initialToken: "jwt_token_valid",
          initialIsLoading: false,
          initialWorkstation: "overview",
        })
      );

      expect(html).toContain("VORENT");
      expect(html).toContain("System Dashboard");
      expect(html).toContain('data-testid="desktop-sidebar-toggle-btn"');
      expect(html).toContain('data-testid="header-policy-selector"');
    });

    it("mounts specific requested workstation for authenticated user", () => {
      const html = renderToStaticMarkup(
        React.createElement(App, {
          initialUser: mockUser,
          initialToken: "jwt_token_valid",
          initialIsLoading: false,
          initialWorkstation: "verification",
        })
      );

      expect(html).toContain("Verification Studio");
      expect(html).toContain('data-testid="desktop-sidebar-toggle-btn"');
    });

    it("authenticated user revisiting root with ?view=landing can see landing page with Console button", () => {
      vi.stubGlobal("window", {
        location: {
          pathname: "/",
          search: "?view=landing",
          hash: "",
        },
        localStorage: {
          getItem: vi.fn(() => "jwt_token_valid"),
          setItem: vi.fn(),
          removeItem: vi.fn(),
        },
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        scrollTo: vi.fn(),
      });

      const html = renderToStaticMarkup(
        React.createElement(App, {
          initialUser: mockUser,
          initialToken: "jwt_token_valid",
          initialIsLoading: false,
          initialView: "landing",
        })
      );

      expect(html).toContain("AI agents shouldn&#x27;t authorize their own payments.");
      // Navbar shows Console launch button for authenticated users
      expect(html).toContain("Console");
      // Does not show Sign In / Sign Up buttons
      expect(html).not.toContain('data-testid="navbar-login-btn"');
    });
  });

  describe("6. Session Termination & Logout Behavior", () => {
    it("authService.logout clears token from storage and calls backend", async () => {
      mockStorage["warrant_auth_token"] = "valid_session_token";
      vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      } as any);

      await authService.logout();

      expect(mockStorage["warrant_auth_token"]).toBeUndefined();
    });
  });
});
