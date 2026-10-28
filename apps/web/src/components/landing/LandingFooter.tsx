import { ArrowRight, Terminal } from "lucide-react";
import { VorentBrandMark } from "../navigation/Sidebar";
import { StatusBadge } from "../ui/StatusBadge";

export interface LandingFooterProps {
  onLaunchConsole: (workstation?: string) => void;
}

export function LandingFooter({ onLaunchConsole }: LandingFooterProps) {
  const workstations = [
    { id: "overview", label: "Command Center" },
    { id: "mandate", label: "Mandate Compiler" },
    { id: "policy-versions", label: "Policy Versions" },
    { id: "verification", label: "Verification Studio" },
    { id: "findings", label: "Findings & Witnesses" },
    { id: "approval", label: "Approval Checkpoints" },
    { id: "checkout", label: "Checkout Gate" },
    { id: "transactions", label: "Transactions Ledger" },
    { id: "evaluation", label: "Evaluation Report" },
  ];

  return (
    <footer className="bg-chrome text-ink pt-8">
      {/* Final Call to Action Banner Card */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -translate-y-8">
        <div className="rounded-2xl border border-border bg-surface-raised p-8 sm:p-12 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="space-y-2 text-center md:text-left max-w-xl">
            <h2 className="text-xl sm:text-2xl font-extrabold text-ink tracking-tight">
              Ready to verify your first purchasing mandate?
            </h2>
            <p className="text-xs sm:text-sm text-muted font-sans">
              Experience fail-closed authorization in action. Pre-loaded with synthetic catalog
              fixtures, seeded policy loopholes, and PayPal Sandbox Orders v2 tracking.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => onLaunchConsole("overview")}
              className="inline-flex items-center space-x-2 px-5 py-3 rounded-md font-bold text-xs sm:text-sm bg-primary hover:bg-primary-hover active:bg-primary-active text-white transition-all shadow-md cursor-pointer focus:outline-none focus:ring-2 focus:ring-accent"
            >
              <span>Launch Sandbox Console</span>
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => onLaunchConsole("verification")}
              className="inline-flex items-center space-x-2 px-4 py-3 rounded-md font-semibold text-xs sm:text-sm bg-surface hover:bg-surface-inset border border-border text-ink transition-colors cursor-pointer"
            >
              <Terminal className="w-4 h-4 text-accent" />
              <span>Verify Loophole</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Canonical Footer Columns */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 lg:gap-12">
          {/* Column 1: Identity & Purpose */}
          <div className="space-y-4">
            <VorentBrandMark className="w-8 h-8" showWordmark={true} />
            <p className="text-xs text-muted leading-relaxed font-sans max-w-xs">
              Autonomous Financial Governance, Policy Verification & Purchase Authorization Security Layer.
              Test the mandate. Close the loophole. Enforce the intent.
            </p>
            <div className="inline-block">
              <StatusBadge status="SANDBOX" variant="SANDBOX" size="sm" showDot={true} />
            </div>
          </div>

          {/* Column 2: Workstation Jump Links */}
          <div className="space-y-3">
            <div className="text-[11px] font-mono uppercase tracking-wider text-muted font-bold">
              Console Workstations
            </div>
            <ul className="space-y-1.5 text-xs text-muted font-sans">
              {workstations.slice(0, 5).map((ws) => (
                <li key={ws.id}>
                  <button
                    type="button"
                    onClick={() => onLaunchConsole(ws.id)}
                    className="hover:text-accent transition-colors cursor-pointer"
                  >
                    {ws.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 3: Secondary Workstations & Governance */}
          <div className="space-y-3">
            <div className="text-[11px] font-mono uppercase tracking-wider text-muted font-bold">
              Runtime & Ledger
            </div>
            <ul className="space-y-1.5 text-xs text-muted font-sans">
              {workstations.slice(5).map((ws) => (
                <li key={ws.id}>
                  <button
                    type="button"
                    onClick={() => onLaunchConsole(ws.id)}
                    className="hover:text-accent transition-colors cursor-pointer"
                  >
                    {ws.label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Column 4: Architecture, Standards & Legal */}
          <div className="space-y-3">
            <div className="text-[11px] font-mono uppercase tracking-wider text-muted font-bold">
              Standards & Integrity
            </div>
            <div className="space-y-2 text-xs text-muted font-sans leading-relaxed">
              <p>
                Engineered under <strong>Mode A: SaaS Governance</strong> standards with zero client-side
                price authority and Decision D-014 fail-closed rules.
              </p>
              <p className="font-mono text-[11px] text-ink">
                License: MIT (Copyright © 2026 Warrant / VORENT Contributors)
              </p>
            </div>
          </div>
        </div>

        {/* Bottom Attribution Bar */}
        <div className="mt-12 pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between text-xs text-muted font-mono gap-3">
          <div>VORENT v0.1.0-sandbox • PayPal Developer Integration</div>
          <div>Strictly PayPal Sandbox • Real Money Processing Prohibited</div>
        </div>
      </div>
    </footer>
  );
}
