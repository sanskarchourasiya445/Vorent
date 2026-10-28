import { Terminal, Search, Hash, Lock, CheckCircle2 } from "lucide-react";
import { LandingWorkflowAnimation } from "./LandingWorkflowAnimation";

export function LandingHowItWorks() {
  const steps = [
    {
      number: "01",
      title: "Mandate Compilation",
      icon: Terminal,
      tag: "COMPILER & SHIELD",
      description:
        "Natural-language purchasing rules are ingested through an Adversarial Prompt Shield, neutralizing prompt injection attacks and synthesizing formal AST rule bounds.",
      badge: "Pure AST",
    },
    {
      number: "02",
      title: "Bounded Loophole Search",
      icon: Search,
      tag: "FINITE MODEL CHECKER",
      description:
        "The verifier explores 250 to 2,000 cart permutations across 4 dimensions (price, quantity, category drift, gift cards) to surface counterexamples before any budget is approved.",
      badge: "4-Dimension",
    },
    {
      number: "03",
      title: "RFC 8785 Hash Commitment",
      icon: Hash,
      tag: "IMMUTABLE HASH",
      description:
        "Repaired policies are serialized using the RFC 8785 JSON Canonicalization Scheme and stamped with an immutable 64-character SHA-256 digest, preventing policy drift.",
      badge: "SHA-256",
    },
    {
      number: "04",
      title: "Fail-Closed Spend Approvals",
      icon: Lock,
      tag: "DECISION D-014",
      description:
        "An approver binds spend limits ($1,500 USD) and expiration to the policy hash. Decision D-014 physically blocks approvals if critical or high findings remain open.",
      badge: "Fail-Closed",
    },
    {
      number: "05",
      title: "Runtime Gate & PayPal Settlement",
      icon: CheckCircle2,
      tag: "IDEMPOTENT CAPTURE",
      description:
        "Agents propose carts via single-use nonces. On ALLOW, the server serializes spend via `SELECT ... FOR UPDATE`, initiates PayPal Sandbox Orders v2, and captures payment idempotently.",
      badge: "Sandbox v2",
    },
  ];

  return (
    <section id="how-it-works" className="py-16 sm:py-24 bg-canvas-subtle/40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <div className="text-xs font-mono uppercase tracking-widest text-accent font-semibold">
            Execution Lifecycle
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-ink tracking-tight">
            The 5-Stage Verification & Settlement Loop
          </h2>
          <p className="text-sm sm:text-base text-muted font-sans">
            How natural-language purchasing intent translates into formal AST rules, reproducible
            loophole witnesses, and tamper-evident PayPal Sandbox settlement.
          </p>
        </div>

        {/* Live Interactive Workflow Simulation (Policy -> Verification -> Approval -> Settlement) */}
        <LandingWorkflowAnimation />

        {/* 5-Step Connected Workflow Grid */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {steps.map((step) => {
            const Icon = step.icon;
            return (
              <div
                key={step.number}
                className="relative rounded-xl border border-border bg-surface p-5 flex flex-col justify-between space-y-4 hover:border-accent/40 transition-colors shadow-xs"
              >
                <div className="space-y-3">
                  {/* Top Bar with Number & Icon */}
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xl font-black text-accent/60">
                      {step.number}
                    </span>
                    <div className="w-8 h-8 rounded-md bg-surface-inset border border-border flex items-center justify-center">
                      <Icon className="w-4 h-4 text-accent" />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <span className="font-mono text-[9px] uppercase tracking-wider text-muted block">
                      {step.tag}
                    </span>
                    <h3 className="font-bold text-sm text-ink leading-snug">
                      {step.title}
                    </h3>
                  </div>

                  <p className="text-xs text-muted leading-relaxed font-sans">
                    {step.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-border/60 flex items-center justify-between text-[11px] font-mono">
                  <span className="text-muted">Standard:</span>
                  <span className="text-accent font-bold">{step.badge}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
