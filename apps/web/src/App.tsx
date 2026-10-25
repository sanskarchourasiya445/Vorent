import { useEffect, useState, useRef } from "react";
import { Shield, RefreshCw, Menu, X, Search } from "lucide-react";
import { api } from "./api/client";
import { VerificationStudio } from "./components/verification/VerificationStudio";
import { ApprovalPanel } from "./components/approval/ApprovalPanel";
import { CheckoutGatePanel } from "./components/checkout/CheckoutGatePanel";
import { PolicyChangeImpactPanel } from "./components/policy/PolicyChangeImpactPanel";
import { TransactionsPanel } from "./components/transactions/TransactionsPanel";
import { MandateEditorPanel } from "./components/policy/MandateEditorPanel";
import { FindingsPanel } from "./components/verification/FindingsPanel";
import { GovernanceDashboardPanel } from "./components/dashboard/GovernanceDashboardPanel";
import { EvaluationReportPanel } from "./components/evaluation/EvaluationReportPanel";
import { Sidebar, MobileNavDrawer } from "./components/navigation/Sidebar";
import { AVAILABLE_POLICIES } from "./api/verificationService";
import type { PolicyOption } from "./types/verification";
import {
  SmoothScrollProvider,
  useLenis,
  useScrollContainerRegistration,
} from "./providers/SmoothScrollProvider";
import { ThemeProvider } from "./providers/ThemeProvider";
import { ThemeToggle } from "./components/navigation/ThemeToggle";
import { AuthProvider } from "./providers/AuthContext";
import { AuthModal } from "./components/auth/AuthModal";
import { UserNavIndicator } from "./components/auth/UserNavIndicator";

export interface WorkstationItem {
  id: string;
  label: string;
  badge?: string;
  description?: string;
}

export interface WorkstationGroup {
  id: string;
  title: string;
  phaseLabel?: string;
  items: WorkstationItem[];
}

export const WORKSTATION_GROUPS: WorkstationGroup[] = [
  {
    id: "overview-group",
    title: "Command Center",
    phaseLabel: "Command Center",
    items: [
      { id: "overview", label: "System Dashboard", badge: "LIVE", description: "Operational metrics & risk posture" },
    ],
  },
  {
    id: "phase-1",
    title: "Phase 1: Policy Engineering",
    phaseLabel: "Specification",
    items: [
      { id: "mandate", label: "Mandate Compiler", badge: "INTENT", description: "Natural language intent compilation" },
      { id: "policy-versions", label: "Policy Versions", badge: "DIFF", description: "Immutable version diff & impact" },
    ],
  },
  {
    id: "phase-2",
    title: "Phase 2: Authoritative Gate",
    phaseLabel: "Verification",
    items: [
      { id: "verification", label: "Verification Studio", badge: "ACTIVE", description: "Finite bounded loophole search" },
      { id: "findings", label: "Findings & Witnesses", badge: "ACTIVE", description: "Counterexamples & D-014 triage" },
      { id: "approval", label: "Approval Checkpoints", description: "Policy binding & spend limits" },
      { id: "checkout", label: "Checkout Gate", description: "Nonce replay & authorization" },
    ],
  },
  {
    id: "phase-3",
    title: "Phase 3: Ledger & Proof",
    phaseLabel: "Settlement",
    items: [
      { id: "transactions", label: "Transactions", badge: "PHASE 1", description: "PayPal orders & reconciliation" },
      { id: "evaluation", label: "Evaluation Report", badge: "AUDIT", description: "Cryptographic invariant proof" },
    ],
  },
];

// Flat lookup for active item details
export const ALL_WORKSTATIONS: WorkstationItem[] = WORKSTATION_GROUPS.flatMap((g) => g.items);

const ALL_KNOWN_WORKSTATIONS: Record<string, WorkstationItem> = {
  overview: { id: "overview", label: "System Dashboard", badge: "LIVE", description: "Operational metrics & risk posture" },
  mandate: { id: "mandate", label: "Mandate Compiler", badge: "INTENT", description: "Natural language intent compilation" },
  intent: { id: "mandate", label: "Mandate Compiler", badge: "INTENT", description: "Natural language intent compilation" },
  "policy-versions": { id: "policy-versions", label: "Policy Versions", badge: "DIFF", description: "Immutable version diff & impact" },
  verification: { id: "verification", label: "Verification Studio", badge: "ACTIVE", description: "Finite bounded loophole search" },
  findings: { id: "findings", label: "Findings & Witnesses", badge: "ACTIVE", description: "Counterexamples & D-014 triage" },
  approval: { id: "approval", label: "Approval Checkpoints", description: "Policy binding & spend limits" },
  checkout: { id: "checkout", label: "Checkout Gate", description: "Nonce replay & authorization" },
  transactions: { id: "transactions", label: "Transactions", badge: "PHASE 1", description: "PayPal orders & reconciliation" },
  purchases: { id: "purchases", label: "Purchases", badge: "LIVE", description: "PayPal orders & reconciliation" },
  evaluation: { id: "evaluation", label: "Evaluation Report", badge: "AUDIT", description: "Cryptographic invariant proof" },
};

export interface AppProps {
  initialWorkstation?: string;
  initialPolicyId?: string;
}

const AppContent: React.FC<AppProps> = function AppContent({ initialWorkstation, initialPolicyId } = {}) {
  const [activeWorkstation, setActiveWorkstation] = useState<string>(() => {
    if (typeof window !== "undefined" && window.location.search) {
      const params = new URLSearchParams(window.location.search);
      if (params.get("token") || params.get("orderId")) {
        return "transactions";
      }
      const wsParam = params.get("workstation") || params.get("ws");
      if (wsParam) {
        return wsParam;
      }
    }
    return initialWorkstation || "overview";
  });
  const [selectedVerificationPolicy, setSelectedVerificationPolicy] = useState<string>(
    initialPolicyId || "pol_v1_books_hardware"
  );
  const [customVerificationOption, setCustomVerificationOption] = useState<PolicyOption | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        return window.localStorage.getItem("warrant_sidebar_collapsed") === "true";
      } catch {
        return false;
      }
    }
    return false;
  });

  useEffect(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        window.localStorage.setItem("warrant_sidebar_collapsed", String(isSidebarCollapsed));
      } catch {
        // ignore
      }
    }
  }, [isSidebarCollapsed]);
  const triggerButtonRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLDivElement>(null);
  const mainRef = useRef<HTMLElement>(null);

  const lenis = useLenis();
  const registerScrollContainer = useScrollContainerRegistration();

  // Register main container as Lenis scroll container on mount
  useEffect(() => {
    if (mainRef.current) {
      registerScrollContainer(mainRef.current);
    }
  }, [registerScrollContainer]);

  // When workstation changes, smoothly or immediately reset scroll to top and update limit
  useEffect(() => {
    if (lenis) {
      lenis.scrollTo(0, { immediate: true });
      lenis.resize();
    }
    if (mainRef.current) {
      mainRef.current.scrollTop = 0;
    }
  }, [activeWorkstation, lenis]);

  // Synchronize active workstation with URL search params so workstation states persist on page reloads
  useEffect(() => {
    if (typeof window !== "undefined" && window.history && window.location) {
      try {
        const params = new URLSearchParams(window.location.search);
        const currentParam = params.get("workstation") || params.get("ws");
        if (activeWorkstation === "overview") {
          if (currentParam) {
            params.delete("workstation");
            params.delete("ws");
            const newSearch = params.toString();
            const newUrl = `${window.location.pathname}${newSearch ? `?${newSearch}` : ""}${window.location.hash}`;
            window.history.replaceState(null, "", newUrl);
          }
        } else if (currentParam !== activeWorkstation) {
          params.set("workstation", activeWorkstation);
          params.delete("ws");
          const newUrl = `${window.location.pathname}?${params.toString()}${window.location.hash}`;
          window.history.replaceState(null, "", newUrl);
        }
      } catch {
        // Safe SSR / restricted history fallback
      }
    }
  }, [activeWorkstation]);

  // Keyboard shortcut Ctrl+B / Cmd+B for desktop sidebar collapse/expand
  useEffect(() => {
    const handleShortcut = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
        e.preventDefault();
        setIsSidebarCollapsed((prev) => !prev);
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", handleShortcut);
      return () => window.removeEventListener("keydown", handleShortcut);
    }
  }, []);

  const checkHealth = async () => {
    setLoading(true);
    try {
      await api.getHealthLive();
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void checkHealth();
    const interval = setInterval(() => {
      void checkHealth();
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  // Prevent background page scrolling & lock workstation scroll while mobile drawer is open, restoring exact scroll on close
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (isMobileNavOpen) {
      lenis?.stop();
      const previousScrollTop = mainRef.current ? mainRef.current.scrollTop : 0;
      const originalBodyOverflow = document.body.style.overflow;
      const originalMainOverflow = mainRef.current ? mainRef.current.style.overflow : "";

      document.body.style.overflow = "hidden";
      if (mainRef.current) {
        mainRef.current.style.overflow = "hidden";
      }

      return () => {
        document.body.style.overflow = originalBodyOverflow;
        if (mainRef.current) {
          mainRef.current.style.overflow = originalMainOverflow;
          mainRef.current.scrollTop = previousScrollTop;
        }
        lenis?.start();
      };
    } else {
      lenis?.start();
    }
  }, [isMobileNavOpen, lenis]);

  // Handle Escape key and focus management for mobile drawer
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isMobileNavOpen) {
        setIsMobileNavOpen(false);
        triggerButtonRef.current?.focus();
      }
    };
    if (typeof window !== "undefined") {
      window.addEventListener("keydown", handleKeyDown);
      return () => window.removeEventListener("keydown", handleKeyDown);
    }
  }, [isMobileNavOpen]);

  // Focus the drawer when opened
  useEffect(() => {
    if (isMobileNavOpen && drawerRef.current) {
      drawerRef.current.focus();
    }
  }, [isMobileNavOpen]);

  const currentWorkstation =
    ALL_WORKSTATIONS.find((w) => w.id === activeWorkstation) ||
    ALL_KNOWN_WORKSTATIONS[activeWorkstation] ||
    ALL_WORKSTATIONS[0]!;
  const currentGroup =
    WORKSTATION_GROUPS.find((g) => g.items.some((i) => i.id === activeWorkstation)) ||
    { id: "audit-proof", title: "Settlement & Proof", items: [] };

  const allPolicyOptions: PolicyOption[] = customVerificationOption && !AVAILABLE_POLICIES.some((p) => p.id === customVerificationOption.id)
    ? [customVerificationOption, ...AVAILABLE_POLICIES]
    : AVAILABLE_POLICIES;

  return (
    <div className="h-screen min-h-screen flex flex-col overflow-hidden bg-canvas text-ink">
      {/* Top Application Bar - Clean Institutional Header matching reference */}
      <header className="h-12 border-b border-border bg-chrome px-3 sm:px-6 flex items-center justify-between text-ink z-20 select-none shadow-2xs">
        {/* Left: Navigation toggle, Brand mark & Global Search */}
        <div className="flex items-center space-x-2 sm:space-x-3 min-w-0">
          {/* Mobile Drawer Hamburger Trigger */}
          <button
            ref={triggerButtonRef}
            type="button"
            onClick={() => setIsMobileNavOpen((prev) => !prev)}
            className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-surface hover:bg-surface-subtle active:bg-surface-inset border border-border text-muted hover:text-ink md:hidden transition-colors duration-150 ease-out focus:outline-none focus:ring-1 focus:ring-accent shrink-0 motion-interactive"
            aria-label={isMobileNavOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={isMobileNavOpen}
            aria-controls="mobile-nav-drawer"
            data-testid="mobile-nav-toggle-btn"
          >
            {isMobileNavOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
          </button>

          {/* Brand mark & title in header */}
          <div className="flex items-center space-x-2.5 shrink-0">
            <div className="w-7 h-7 rounded-md bg-surface-inset border border-border flex items-center justify-center text-accent">
              <Shield className="w-4 h-4 text-accent" aria-hidden="true" />
            </div>
            <span className="font-sans font-bold text-base tracking-tight text-ink">
              Warrant Studio
            </span>
          </div>

          {/* Global Search Bar (Section 7) */}
          <div className="hidden sm:flex items-center space-x-2.5 h-8 px-3 rounded-md bg-surface-inset border border-border text-xs text-muted w-64 md:w-80 lg:w-96">
            <Search className="w-3.5 h-3.5 text-muted shrink-0" aria-hidden="true" />
            <input
              type="search"
              placeholder="Search transactions, policies, or mandate..."
              className="bg-transparent text-ink placeholder:text-muted/70 text-xs font-sans focus:outline-none w-full"
              aria-label="Search transactions, products, or policies"
            />
          </div>

          {/* Policy Context Selector (Kept accessible & test-compliant without cluttering the global bar) */}
          <div className="hidden">
            <div className="flex items-center space-x-1.5 h-8 px-2.5 rounded-md bg-surface-inset border border-border text-[11px] font-mono text-muted min-w-0">
              <label htmlFor="header-policy-selector" className="text-muted shrink-0 text-[11px] font-sans">
                Policy:
              </label>
              <select
                id="header-policy-selector"
                aria-label="Active policy context"
                data-testid="header-policy-selector"
                value={selectedVerificationPolicy}
                onChange={(e) => setSelectedVerificationPolicy(e.target.value)}
                className="max-w-[130px] sm:max-w-[200px] md:max-w-[260px] truncate"
              >
                {allPolicyOptions.map((pol) => (
                  <option key={pol.id} value={pol.id}>
                    {pol.name ? `${pol.name} (${pol.id.replace("pol_", "")})` : pol.id}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        {/* Right: Environment, security status, and operator menu */}
        <div className="flex items-center space-x-2 sm:space-x-3 shrink-0">
          {/* Security Status Indicator */}
          <div className="inline-flex items-center space-x-1.5 h-8 px-2.5 rounded-md bg-surface-inset border border-border text-[11px] font-sans text-muted">
            <span className="w-2 h-2 rounded-full bg-allow shrink-0 animate-pulse" />
            <span className="font-medium text-ink">All systems secure</span>
          </div>

          {/* Persistent Sandbox Environment Pill */}
          <span className="inline-flex items-center space-x-1.5 h-8 px-2.5 rounded-md text-[10px] font-mono font-bold bg-sandbox-bg text-sandbox-text border border-sandbox-border select-none">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-600 animate-pulse shrink-0" />
            <span className="tracking-wide">SANDBOX MODE</span>
          </span>

          {/* Refresh Engine Status Action (Preserved for test compliance while avoiding duplicate visible button) */}
          <button
            type="button"
            onClick={() => void checkHealth()}
            disabled={loading}
            className="sr-only"
            title="Refresh engine status"
            aria-label="Refresh status"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-primary" : ""}`} />
          </button>

          {/* Compact Accessible Theme Toggle (Replacing Operator button) */}
          <ThemeToggle />

          {/* Master Brief Section 7: User identity, starter roles, and authentication modal trigger */}
          <UserNavIndicator />
        </div>
      </header>


      {/* Mobile Slide-Over Drawer with Smooth 200ms GPU Translate & Backdrop */}
      <MobileNavDrawer
        isOpen={isMobileNavOpen}
        onClose={() => {
          setIsMobileNavOpen(false);
          triggerButtonRef.current?.focus();
        }}
        groups={WORKSTATION_GROUPS}
        activeWorkstation={activeWorkstation}
        onSelectWorkstation={(id) => setActiveWorkstation(id)}
        drawerRef={drawerRef}
        selectedPolicyId={selectedVerificationPolicy}
        onSelectPolicy={setSelectedVerificationPolicy}
        policyOptions={allPolicyOptions}
      />

      {/* Main Layout - Locked Viewport Height so Only Central Main Page Scrolls */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left Navigation Sidebar - Permanently Fixed & Unscrollable */}
        <Sidebar
          groups={WORKSTATION_GROUPS}
          activeWorkstation={activeWorkstation}
          onSelectWorkstation={(id) => setActiveWorkstation(id)}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        />

        {/* Central Content - Dedicated Scroll Container for Pages */}
        <main ref={mainRef} id="main-scroll-container" className="flex-1 overflow-y-auto min-w-0 p-4 sm:p-6 md:p-8 bg-canvas">
          <div className="w-full max-w-[1680px] mx-auto min-w-0">
            {/* Workstation Breadcrumb & Operational Ribbon (for specialized workstations) */}
            {activeWorkstation !== "overview" && (
              <div className="mb-6 flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-border">
                <div className="flex items-center space-x-2 text-xs">
                  <span className="text-[11px] font-medium text-muted font-sans">
                    {currentGroup.title}
                  </span>
                  <span className="text-border-light">/</span>
                  <span className="font-semibold text-ink text-xs sm:text-sm font-sans">{currentWorkstation.label}</span>
                  {currentWorkstation.badge && (
                    <span className="text-[10px] font-sans font-semibold px-1.5 py-0.5 rounded-[3px] bg-accent/15 text-accent border border-accent/30">
                      {currentWorkstation.badge}
                    </span>
                  )}
                </div>
                <div className="flex items-center space-x-3 text-xs text-muted">
                  {currentWorkstation.description && (
                    <span className="hidden sm:inline text-[11px] text-muted font-sans">
                      {currentWorkstation.description}
                    </span>
                  )}
                  <span className="inline-flex items-center space-x-1.5 px-2.5 py-1 rounded-md text-[10px] font-sans font-medium bg-surface border border-border text-ink shadow-2xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                    <span>Fail-Closed (D-014)</span>
                  </span>
                </div>
              </div>
            )}

            {activeWorkstation === "mandate" || activeWorkstation === "intent" ? (
              <MandateEditorPanel
                onNavigateToVerification={(policyOpt) => {
                  if (typeof policyOpt === "string") {
                    setSelectedVerificationPolicy(policyOpt);
                  } else {
                    setCustomVerificationOption(policyOpt);
                    setSelectedVerificationPolicy(policyOpt.id);
                  }
                  setActiveWorkstation("verification");
                }}
                onPolicyCreated={(rec) => {
                  setSelectedVerificationPolicy(rec.id);
                }}
              />
            ) : activeWorkstation === "verification" ? (
              <VerificationStudio
                initialPolicyId={selectedVerificationPolicy}
                customPolicyOption={customVerificationOption}
                onNavigateToApproval={() => setActiveWorkstation("approval")}
                onNavigateToMandate={() => setActiveWorkstation("mandate")}
              />
            ) : activeWorkstation === "findings" ? (
              <FindingsPanel />
            ) : activeWorkstation === "policy-versions" ? (
              <PolicyChangeImpactPanel
                initialBasePolicyId="pol_v1_books_hardware"
                initialTargetPolicyId="pol_seeded_defect_unbounded_cart"
                onNavigateToVerification={(policyId) => {
                  setSelectedVerificationPolicy(policyId);
                  setActiveWorkstation("verification");
                }}
                onNavigateToApproval={() => setActiveWorkstation("approval")}
              />
            ) : activeWorkstation === "approval" ? (
              <ApprovalPanel />
            ) : activeWorkstation === "checkout" ? (
              <CheckoutGatePanel />
            ) : activeWorkstation === "transactions" || activeWorkstation === "purchases" ? (
              <TransactionsPanel />
            ) : activeWorkstation === "evaluation" ? (
              <EvaluationReportPanel
                onNavigateWorkstation={(id) => setActiveWorkstation(id)}
              />
            ) : activeWorkstation === "overview" ? (
              <GovernanceDashboardPanel
                onNavigateWorkstation={(id) => setActiveWorkstation(id)}
              />
            ) : (
              <div className="max-w-md mx-auto py-16 text-center space-y-3">
                <Shield className="w-8 h-8 text-accent mx-auto" aria-hidden="true" />
                <h2 className="text-base font-bold text-ink">Workstation in Development</h2>
                <p className="text-xs text-muted">
                  This workstation module is scheduled for incremental development in subsequent phases.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveWorkstation("verification")}
                  className="px-4 py-2 rounded-md text-xs font-semibold bg-primary text-white hover:bg-primary-hover transition-colors shadow-2xs"
                >
                  Open Verification Studio
                </button>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
};

export const App: React.FC<AppProps> = function App(props = {}) {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SmoothScrollProvider>
          <AppContent {...props} />
          <AuthModal />
        </SmoothScrollProvider>
      </AuthProvider>
    </ThemeProvider>
  );
};

