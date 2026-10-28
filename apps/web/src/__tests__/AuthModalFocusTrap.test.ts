import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthModal } from "../components/auth/AuthModal";

// Mock useAuth hook
vi.mock("../providers/AuthContext", () => ({
  useAuth: () => ({
    isAuthModalOpen: true,
    closeAuthModal: vi.fn(),
    authModalTab: "login",
    login: vi.fn(),
    register: vi.fn(),
    switchPersona: vi.fn(),
    error: null,
    clearError: vi.fn(),
  }),
}));

describe("AuthModal Focus Trap, Accessibility & Compliance Disclosures", () => {
  beforeEach(() => {
    vi.stubGlobal("window", {
      location: { search: "", pathname: "/" },
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
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

  it("1. renders dialog container with role='dialog', aria-modal='true', and aria-labelledby on inner card", () => {
    const html = renderToStaticMarkup(
      React.createElement(AuthModal, { onOpenSettings: vi.fn() })
    );

    // Verify dialog semantics are placed on the dialog card
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-labelledby="auth-modal-title"');
    expect(html).toContain('id="auth-modal-title"');
  });

  it("2. renders accessible compliance disclosures for Terms of Service and Privacy Policy", () => {
    const html = renderToStaticMarkup(
      React.createElement(AuthModal, { onOpenSettings: vi.fn() })
    );

    expect(html).toContain("Terms of Service");
    expect(html).toContain("Privacy Policy");
    expect(html).toContain("By signing in or registering");
  });

  it("3. renders evaluation starter personas for quick role switching", () => {
    const html = renderToStaticMarkup(
      React.createElement(AuthModal, { onOpenSettings: vi.fn() })
    );

    expect(html).toContain("Evaluation Starter Personas");
    expect(html).toContain("admin@warrant.studio");
    expect(html).toContain("approver@warrant.studio");
    expect(html).toContain("auditor@warrant.studio");
    expect(html).toContain("requester@warrant.studio");
  });
});
