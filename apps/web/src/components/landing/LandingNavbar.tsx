import { useState } from "react";
import { Menu, X, ArrowRight } from "lucide-react";
import { VorentBrandMark } from "../navigation/Sidebar";
import { ThemeToggle } from "../navigation/ThemeToggle";
import { StatusBadge } from "../ui/StatusBadge";
import { useAuth } from "../../providers/AuthContext";

export interface LandingNavbarProps {
  onLaunchConsole: (workstation?: string) => void;
  onOpenLogin?: () => void;
  onOpenRegister?: () => void;
}

export function LandingNavbar({
  onLaunchConsole,
  onOpenLogin,
  onOpenRegister,
}: LandingNavbarProps) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { user, isAuthenticated, openAuthModal } = useAuth();

  const handleNavClick = (anchor: string) => {
    setMobileMenuOpen(false);
    const element = document.querySelector(anchor);
    if (element) {
      element.scrollIntoView({ behavior: "smooth" });
    }
  };

  const handleLoginClick = () => {
    if (onOpenLogin) {
      onOpenLogin();
    } else {
      openAuthModal("login");
    }
  };

  const handleRegisterClick = () => {
    if (onOpenRegister) {
      onOpenRegister();
    } else {
      openAuthModal("register");
    }
  };

  return (
    <header className="sticky top-0 z-40 w-full bg-chrome/95 backdrop-blur-md border-b border-border transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
        {/* Brand identity & Sandbox Badge */}
        <div className="flex items-center space-x-3 sm:space-x-4">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            className="flex items-center hover:opacity-90 transition-opacity cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent rounded-md"
            aria-label="VORENT Home"
          >
            <VorentBrandMark className="w-7 h-7" showWordmark={true} />
          </button>

          <div className="hidden sm:inline-flex items-center">
            <StatusBadge status="SANDBOX" variant="SANDBOX" size="sm" showDot={true} />
          </div>
        </div>

        {/* Desktop Navigation Links */}
        <nav
          className="hidden lg:flex items-center space-x-6 text-xs font-medium text-muted"
          aria-label="Main Navigation"
        >
          <button
            type="button"
            onClick={() => handleNavClick("#problem")}
            className="hover:text-ink transition-colors cursor-pointer"
          >
            The Vulnerability
          </button>
          <button
            type="button"
            onClick={() => handleNavClick("#how-it-works")}
            className="hover:text-ink transition-colors cursor-pointer"
          >
            How It Works
          </button>
          <button
            type="button"
            onClick={() => handleNavClick("#capabilities")}
            className="hover:text-ink transition-colors cursor-pointer"
          >
            Capabilities
          </button>
          <button
            type="button"
            onClick={() => handleNavClick("#showcase")}
            className="hover:text-ink transition-colors cursor-pointer"
          >
            Interface
          </button>
          <button
            type="button"
            onClick={() => handleNavClick("#invariants")}
            className="hover:text-ink transition-colors cursor-pointer"
          >
            Security Invariants
          </button>
          <button
            type="button"
            onClick={() => handleNavClick("#faq")}
            className="hover:text-ink transition-colors cursor-pointer"
          >
            FAQ
          </button>
        </nav>

        {/* Right Action Bar */}
        <div className="flex items-center space-x-2.5 sm:space-x-3">
          {/* Accessible Theme Toggle (Dark Midnight Navy / Light Warm Ivory) */}
          <ThemeToggle />

          {/* Authentication Actions */}
          {isAuthenticated && user ? (
            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={() => onLaunchConsole("overview")}
                className="inline-flex items-center space-x-1 px-3 py-1.5 rounded-md text-xs font-bold bg-primary hover:bg-primary-hover text-white active:bg-primary-active transition-colors shadow-2xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent"
              >
                <span>Console</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          ) : (
            <div className="flex items-center space-x-2">
              <button
                type="button"
                data-testid="navbar-login-btn"
                onClick={handleLoginClick}
                className="inline-flex items-center px-3 py-1.5 rounded-md text-xs font-semibold text-ink hover:text-accent border border-border hover:border-accent bg-surface-inset hover:bg-surface transition-all cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent"
              >
                Log In
              </button>

              <button
                type="button"
                data-testid="navbar-signup-btn"
                onClick={handleRegisterClick}
                className="inline-flex items-center px-3.5 py-1.5 rounded-md text-xs font-bold bg-primary hover:bg-primary-hover active:bg-primary-active text-white transition-all shadow-xs cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent"
              >
                Sign Up
              </button>
            </div>
          )}

          {/* Mobile hamburger menu toggle */}
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden inline-flex items-center justify-center w-8 h-8 rounded-md border border-border bg-surface-inset text-ink hover:bg-surface cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent"
            aria-label={mobileMenuOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileMenuOpen}
          >
            {mobileMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Drawer Menu */}
      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-border bg-chrome px-4 py-4 space-y-3 animate-in slide-in-from-top-2 duration-150">
          <div className="flex items-center justify-between pb-2 border-b border-border/50">
            <span className="text-xs font-mono text-muted uppercase tracking-wider">Navigation</span>
            <StatusBadge status="SANDBOX" variant="SANDBOX" size="sm" showDot={true} />
          </div>

          <div className="flex flex-col space-y-2 text-sm font-medium text-ink">
            <button
              type="button"
              onClick={() => handleNavClick("#problem")}
              className="text-left py-1.5 hover:text-accent cursor-pointer"
            >
              The Vulnerability
            </button>
            <button
              type="button"
              onClick={() => handleNavClick("#how-it-works")}
              className="text-left py-1.5 hover:text-accent cursor-pointer"
            >
              How It Works
            </button>
            <button
              type="button"
              onClick={() => handleNavClick("#capabilities")}
              className="text-left py-1.5 hover:text-accent cursor-pointer"
            >
              Capabilities
            </button>
            <button
              type="button"
              onClick={() => handleNavClick("#showcase")}
              className="text-left py-1.5 hover:text-accent cursor-pointer"
            >
              Interface Showcase
            </button>
            <button
              type="button"
              onClick={() => handleNavClick("#invariants")}
              className="text-left py-1.5 hover:text-accent cursor-pointer"
            >
              Security Invariants
            </button>
            <button
              type="button"
              onClick={() => handleNavClick("#faq")}
              className="text-left py-1.5 hover:text-accent cursor-pointer"
            >
              FAQ
            </button>
          </div>

          <div className="pt-3 border-t border-border/50 flex flex-col space-y-2">
            {isAuthenticated && user ? (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onLaunchConsole("overview");
                }}
                className="w-full flex items-center justify-center space-x-2 px-4 py-2 rounded-md font-semibold text-xs bg-primary text-white hover:bg-primary-hover shadow-xs cursor-pointer"
              >
                <span>Console</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  data-testid="navbar-login-mobile-btn"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleLoginClick();
                  }}
                  className="w-full flex items-center justify-center px-3 py-2 rounded-md font-semibold text-xs border border-border bg-surface hover:bg-surface-inset text-ink transition-colors cursor-pointer"
                >
                  Log In
                </button>
                <button
                  type="button"
                  data-testid="navbar-signup-mobile-btn"
                  onClick={() => {
                    setMobileMenuOpen(false);
                    handleRegisterClick();
                  }}
                  className="w-full flex items-center justify-center space-x-1.5 px-3 py-2 rounded-md font-bold text-xs bg-primary hover:bg-primary-hover text-white transition-colors shadow-xs cursor-pointer"
                >
                  <span>Sign Up</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
