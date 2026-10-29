import { Terminal, ShieldCheck, Lock, CreditCard } from "lucide-react";

export function LandingCapabilities() {
  const capabilities = [
    {
      title: "Mandate Compiler & Adversarial Shield",
      icon: Terminal,
      badge: "Pure Domain Compiler",
      description:
        "Transforms ambiguous purchasing intent into strict, validated Abstract Syntax Tree (AST) policies. Features an Adversarial Prompt Shield that detects and neutralizes prompt-injection attacks.",
      techDetails: [
        "Schema validation via @warrant/contracts (Zod v3.24)",
        "Prompt injection sanitization neutralizing jailbreak attempts",
        "Deterministic category inclusion/exclusion rule generation",
        "Assumptions & Clarification synthesis for human review",
      ],
    },
    {
      title: "Finite-Domain Model Checker",
      icon: ShieldCheck,
      badge: "Bounded Permutation Verifier",
      description:
        "Exhaustively permutes declared catalog candidate spaces to surface reproducible policy counterexamples before approvals are granted. Reports honest coverage without false inductive claims.",
      techDetails: [
        "4-dimension search: price ceiling, item count, category, bundles",
        "Seeded loophole detection: cart total omitted while item price set",
        "Witness cart dossiers with complete rule evaluation execution traces",
        "Configurable search budget: 250 to 2,000 combinatorial carts",
      ],
    },
    {
      title: "Fail-Closed Governance (Decision D-014)",
      icon: Lock,
      badge: "Inviolable Security Gate",
      description:
        "Enforces corporate governance at the database level. Risk acceptance is strictly blocked for unresolved CRITICAL and HIGH counterexamples, preventing the approval of flawed policies.",
      techDetails: [
        "Physical block: CRITICAL_HIGH_CANNOT_BE_ACCEPTED_RISK",
        "Approval checkpoint bound strictly to SHA-256 policy digest",
        "Time-bounded spend reservation expiration windows (15 min)",
        "Strict ownership checks: user cannot authorize another's policy",
      ],
    },
    {
      title: "Idempotent PayPal Sandbox Settlement",
      icon: CreditCard,
      badge: "Orders v2 Rail",
      description:
        "Manages the end-to-end payment lifecycle on the PayPal Sandbox rail. Enforces single-use cryptographic nonces, serialized database row locks, and idempotent server-side capture.",
      techDetails: [
        "Single-use 256-bit cryptographic nonces prevent replay (HTTP 409)",
        "SELECT ... FOR UPDATE locks serialize concurrent proposals",
        "Idempotency keys (PayPal-Request-Id: warrant:cap:<orderId>)",
        "Reconciliation hold triggers on ambiguous network timeouts",
      ],
    },
  ];

  return (
    <section id="capabilities" className="scroll-mt-16 py-16 sm:py-24 bg-canvas">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <div className="text-xs font-mono uppercase tracking-widest text-accent font-semibold">
            Technical Architecture
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-ink tracking-tight">
            Engineered for Production Rigor
          </h2>
          <p className="text-sm sm:text-base text-muted font-sans">
            Every capability in VORENT is backed by pure deterministic domain logic, PostgreSQL
            database constraints, and verified Vitest test suites.
          </p>
        </div>

        {/* 2x2 Detailed Capability Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
          {capabilities.map((cap) => {
            const Icon = cap.icon;
            return (
              <div
                key={cap.title}
                className="rounded-xl border border-border bg-surface p-6 sm:p-7 flex flex-col justify-between space-y-6 hover:border-accent/50 transition-all shadow-xs"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="w-9 h-9 rounded-lg bg-surface-inset border border-border flex items-center justify-center">
                      <Icon className="w-5 h-5 text-accent" />
                    </div>
                    <span className="font-mono text-[10px] px-2 py-0.5 rounded bg-surface-inset border border-border text-muted font-bold uppercase tracking-wider">
                      {cap.badge}
                    </span>
                  </div>

                  <h3 className="text-base sm:text-lg font-bold text-ink">
                    {cap.title}
                  </h3>

                  <p className="text-xs sm:text-sm text-muted leading-relaxed font-sans">
                    {cap.description}
                  </p>

                  <div className="pt-2 border-t border-border/50">
                    <div className="text-[10px] font-mono text-muted uppercase tracking-wider mb-2">
                      Verified Implementation Invariants
                    </div>
                    <ul className="space-y-1.5">
                      {cap.techDetails.map((detail, idx) => (
                        <li
                          key={idx}
                          className="flex items-start space-x-2 text-xs font-mono text-ink"
                        >
                          <span className="text-accent shrink-0 mt-0.5">›</span>
                          <span className="text-[11px] leading-tight text-muted hover:text-ink transition-colors">
                            {detail}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
