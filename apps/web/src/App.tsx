import { useEffect, useState } from "react";
import {
  Shield,
  Activity,
  Database,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Server,
  Layers,
  FileCheck,
} from "lucide-react";
import { api } from "./api/client";
import type { HealthLiveResponse, HealthReadyResponse } from "@warrant/contracts";
import { VerificationStudio } from "./components/verification/VerificationStudio";
import { ApprovalPanel } from "./components/approval/ApprovalPanel";
import { CheckoutGatePanel } from "./components/checkout/CheckoutGatePanel";
import { PolicyChangeImpactPanel } from "./components/policy/PolicyChangeImpactPanel";

export function App() {
  const [activeWorkstation, setActiveWorkstation] = useState<string>("verification");
  const [selectedVerificationPolicy, setSelectedVerificationPolicy] = useState<string>("pol_v1_books_hardware");
  const [liveData, setLiveData] = useState<HealthLiveResponse | null>(null);
  const [readyData, setReadyData] = useState<HealthReadyResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date>(new Date());

  const checkHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const live = await api.getHealthLive();
      setLiveData(live);
      try {
        const ready = await api.getHealthReady();
        setReadyData(ready);
      } catch (readyErr) {
        // Ready endpoint returns 503 if DB is not connected yet, but returns valid JSON
        if (readyErr && typeof readyErr === "object" && "data" in readyErr) {
          setReadyData(readyErr.data as HealthReadyResponse);
        } else {
          setReadyData(null);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to connect to Warrant API");
      setLiveData(null);
      setReadyData(null);
    } finally {
      setLoading(false);
      setLastChecked(new Date());
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
              { id: "verification", label: "Verification Studio", badge: "Active" },
              { id: "findings", label: "Findings & Witnesses", badge: "" },
              { id: "overview", label: "System Overview", badge: "" },
              { id: "mandate", label: "Mandate Editor", badge: "" },
              { id: "intent", label: "Intent Examples", badge: "" },
              { id: "policy-versions", label: "Policy Versions", badge: "Active" },
              { id: "approval", label: "Approval Checkpoints", badge: "" },
              { id: "checkout", label: "Checkout Gate", badge: "" },
              { id: "transactions", label: "Transactions", badge: "" },
              { id: "evaluation-report", label: "Evaluation Report", badge: "" },
            ].map((item) => {
              const isActive =
                activeWorkstation === item.id ||
                (activeWorkstation === "findings" && item.id === "verification");
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
          {activeWorkstation === "verification" || activeWorkstation === "findings" ? (
            <VerificationStudio initialPolicyId={selectedVerificationPolicy} />
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
          ) : activeWorkstation === "overview" ? (
            <div className="max-w-5xl mx-auto space-y-6">
              {/* Title Section */}
              <div>
                <h1 className="text-2xl font-bold tracking-tight text-ink">
                  Foundation Verification
                </h1>
                <p className="text-sm text-muted mt-1">
                  Phase 0 baseline status: contract validation, API health probes, and local runtime verification.
                </p>
              </div>

            {/* Health Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* API Liveness Card */}
              <div className="p-5 rounded-panel border border-border bg-surface space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Server className="w-5 h-5 text-accent" />
                    <span className="font-semibold text-sm">Fastify API Liveness</span>
                  </div>
                  {liveData ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-300">
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> ONLINE
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800 border border-red-300">
                      <AlertTriangle className="w-3.5 h-3.5 mr-1" /> OFFLINE
                    </span>
                  )}
                </div>

                {liveData ? (
                  <div className="space-y-1 text-xs text-muted">
                    <div>Service: <span className="font-mono text-ink">{liveData.service}</span> (v{liveData.version})</div>
                    <div>Uptime: <span className="font-mono text-ink">{liveData.uptime}s</span></div>
                    <div>Timestamp: <span className="font-mono text-ink">{liveData.timestamp}</span></div>
                  </div>
                ) : (
                  <div className="text-xs text-deny">
                    {error || "Waiting for backend connection on port 3001..."}
                  </div>
                )}
              </div>

              {/* Database Readiness Card */}
              <div className="p-5 rounded-panel border border-border bg-surface space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Database className="w-5 h-5 text-accent" />
                    <span className="font-semibold text-sm">PostgreSQL Readiness</span>
                  </div>
                  {readyData?.database?.connected ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-100 text-emerald-800 border border-emerald-300">
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> CONNECTED
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800 border border-amber-300">
                      <Activity className="w-3.5 h-3.5 mr-1" /> STANDBY
                    </span>
                  )}
                </div>

                <div className="space-y-1 text-xs text-muted">
                  <div>Configuration: <span className="font-mono text-ink">{readyData?.database?.configured ? "Present in .env" : "Default local"}</span></div>
                  <div>Status: <span className="font-mono text-ink">{readyData?.status ?? "Checking..."}</span></div>
                  {readyData?.database?.latencyMs !== undefined && (
                    <div>Latency: <span className="font-mono text-ink">{readyData.database.latencyMs}ms</span></div>
                  )}
                  {!readyData?.database?.connected && (
                    <div className="text-amber-800 bg-amber-50 p-1.5 rounded border border-amber-200 mt-1">
                      Database standby — local development connection required.
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Architecture Invariants Status */}
            <div className="p-5 rounded-panel border border-border bg-surface space-y-4">
              <div className="flex items-center space-x-2 border-b border-border pb-3">
                <Layers className="w-5 h-5 text-accent" />
                <h2 className="font-semibold text-sm">Security Invariants & Module Boundaries</h2>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                <div className="p-3 rounded border border-border bg-canvas/50 space-y-1">
                  <div className="font-medium text-ink flex items-center">
                    <FileCheck className="w-4 h-4 mr-1 text-accent" /> Contracts & Validation
                  </div>
                  <p className="text-muted">
                    Zod schemas validate boundary inputs. Reason codes and decision models are strictly typed.
                  </p>
                </div>

                <div className="p-3 rounded border border-border bg-canvas/50 space-y-1">
                  <div className="font-medium text-ink flex items-center">
                    <Shield className="w-4 h-4 mr-1 text-accent" /> Fail-Closed Gate
                  </div>
                  <p className="text-muted">
                    Only server-side <code className="font-mono text-allow">ALLOW</code> can proceed to order creation. <code className="font-mono text-deny">DENY</code> and <code className="font-mono text-review">REVIEW</code> block.
                  </p>
                </div>

                <div className="p-3 rounded border border-border bg-canvas/50 space-y-1">
                  <div className="font-medium text-ink flex items-center">
                    <CheckCircle2 className="w-4 h-4 mr-1 text-accent" /> Sandbox Guardrails
                  </div>
                  <p className="text-muted">
                    Live PayPal mode prohibited. Secrets remain server-side and never enter browser bundles.
                  </p>
                </div>
              </div>
            </div>

            {/* Diagnostic Footer */}
            <div className="flex items-center justify-between text-xs text-muted pt-2 border-t border-border">
              <div>Last checked: {lastChecked.toLocaleTimeString()}</div>
              <div>Node.js {navigator.userAgent ? "v26 Environment" : ""}</div>
            </div>
          </div>
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
