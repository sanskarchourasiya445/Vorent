import { useEffect, useState } from "react";
import { Shield, RefreshCw } from "lucide-react";
import { api } from "./api/client";
import { VerificationStudio } from "./components/verification/VerificationStudio";
import { ApprovalPanel } from "./components/approval/ApprovalPanel";
import { CheckoutGatePanel } from "./components/checkout/CheckoutGatePanel";
import { PolicyChangeImpactPanel } from "./components/policy/PolicyChangeImpactPanel";
import { TransactionsPanel } from "./components/transactions/TransactionsPanel";
import { MandateEditorPanel } from "./components/policy/MandateEditorPanel";
import { FindingsPanel } from "./components/verification/FindingsPanel";
import { GovernanceDashboardPanel } from "./components/dashboard/GovernanceDashboardPanel";
import type { PolicyOption } from "./types/verification";

export function App() {
  const [activeWorkstation, setActiveWorkstation] = useState<string>(() => {
    if (typeof window !== "undefined" && window.location.search) {
      const params = new URLSearchParams(window.location.search);
      if (params.get("token") || params.get("orderId")) {
        return "transactions";
      }
    }
    return "overview";
  });
  const [selectedVerificationPolicy, setSelectedVerificationPolicy] = useState<string>("pol_v1_books_hardware");
  const [customVerificationOption, setCustomVerificationOption] = useState<PolicyOption | undefined>(undefined);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="min-h-screen flex flex-col bg-canvas text-ink">
      {/* Top Bar */}
      <header className="h-14 border-b border-border bg-surface px-6 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Shield className="w-6 h-6 text-accent" />
          <span className="font-semibold tracking-tight text-lg">Warrant Studio</span>
          <span className="text-xs text-muted hidden sm:inline">
            | Test the mandate. Close the loophole. Enforce the intent.
          </span>
        </div>
        <div className="flex items-center space-x-3">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-900 border border-amber-300">
            SANDBOX MODE
          </span>
          <button
            onClick={() => void checkHealth()}
            disabled={loading}
            className="p-1.5 rounded hover:bg-canvas text-muted hover:text-ink transition-colors"
            title="Refresh status"
            aria-label="Refresh status"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Navigation Sidebar */}
        <aside className="w-60 border-r border-border bg-surface hidden md:flex flex-col justify-between p-4">
          <div className="space-y-1">
            <div className="px-3 py-2 text-xs font-semibold text-muted uppercase tracking-wider">
              Workstations
            </div>
            {[
              { id: "overview", label: "System Dashboard", badge: "Live" },
              { id: "mandate", label: "Mandate Compiler", badge: "Intent" },
              { id: "verification", label: "Verification Studio", badge: "Active" },
              { id: "findings", label: "Findings & Witnesses", badge: "Active" },
              { id: "policy-versions", label: "Policy Versions", badge: "Diff" },
              { id: "approval", label: "Approval Checkpoints", badge: "" },
              { id: "checkout", label: "Checkout Gate", badge: "" },
              { id: "transactions", label: "Transactions", badge: "Phase 1" },
            ].map((item) => {
              const isActive = activeWorkstation === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveWorkstation(item.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded text-left transition-colors ${
                    isActive
                      ? "bg-accent/10 text-accent font-semibold"
                      : "text-muted hover:bg-canvas hover:text-ink"
                  }`}
                >
                  <span>{item.label}</span>
                  {item.badge && (
                    <span className="text-[10px] uppercase font-bold px-1.5 py-0.2 rounded bg-accent/20 text-accent">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="border-t border-border pt-3 text-xs text-muted">
            <div className="font-medium text-ink">Phase 2: Verification</div>
            <div>Warrant Studio Engine</div>
          </div>
        </aside>

        {/* Central Content */}
        <main className="flex-1 overflow-y-auto p-6 md:p-8">
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
          ) : activeWorkstation === "transactions" ? (
            <TransactionsPanel />
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
                className="px-4 py-2 rounded text-xs font-semibold bg-accent text-white hover:bg-accent/90 transition-colors"
              >
                Open Verification Studio
              </button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
