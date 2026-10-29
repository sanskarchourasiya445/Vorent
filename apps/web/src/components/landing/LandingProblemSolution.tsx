import { ShieldAlert, ShieldCheck } from "lucide-react";
import { StatusBadge } from "../ui/StatusBadge";

export function LandingProblemSolution() {
  return (
    <section id="problem" className="scroll-mt-16 py-16 sm:py-24 bg-canvas">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <div className="text-xs font-mono uppercase tracking-widest text-accent font-semibold">
            Vulnerability Breakdown
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-ink tracking-tight">
            The Self-Authorization Flaw in Autonomous Commerce
          </h2>
          <p className="text-sm sm:text-base text-muted font-sans">
            Giving autonomous purchasing agents direct access to credit card or PayPal credentials
            creates a fundamental security flaw: the entity requesting the purchase also authorizes it.
          </p>
        </div>

        {/* 2-Column Comparative Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Column A: Unsafe Direct Agent Model */}
          <div className="rounded-xl border border-deny/30 bg-deny-bg/20 p-6 sm:p-8 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <ShieldAlert className="w-5 h-5 text-deny" />
                  <span className="font-bold text-sm text-ink">The Direct Agent Model</span>
                </div>
                <StatusBadge variant="DENY" status="UNSAFE" size="sm" />
              </div>

              <h3 className="text-lg font-bold text-deny">
                Self-Authorization & Prompt Injection
              </h3>

              <p className="text-xs sm:text-sm text-muted leading-relaxed font-sans">
                An operator instructs a shopping agent: <em>"Buy engineering books up to $60."</em>
                The agent is compromised via prompt injection or catalog confusion and generates an order
                for a $50 digital gift card.
              </p>

              <div className="p-3 rounded-md bg-surface-inset border border-border/80 font-mono text-xs text-muted space-y-1">
                <div className="text-deny font-semibold">❌ Flaws in the Direct Model:</div>
                <ul className="list-disc list-inside space-y-1 text-[11px]">
                  <li>Agent possesses direct API keys or OAuth access</li>
                  <li>No independent policy verification before payment</li>
                  <li>Semantic ambiguity exploited without detection</li>
                  <li>No human-in-the-loop review of rule edge cases</li>
                  <li>Unbounded repeat purchases drain credit lines</li>
                </ul>
              </div>
            </div>

            <div className="pt-4 border-t border-deny/20 flex items-center justify-between text-xs">
              <span className="font-mono text-deny font-bold">Outcome:</span>
              <span className="text-muted">Unauthorized transaction settles on corporate card</span>
            </div>
          </div>

          {/* Column B: VORENT Decoupled Model */}
          <div className="rounded-xl border border-allow/30 bg-allow-bg/20 p-6 sm:p-8 flex flex-col justify-between space-y-6">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <ShieldCheck className="w-5 h-5 text-allow" />
                  <span className="font-bold text-sm text-ink">The VORENT Gate Architecture</span>
                </div>
                <StatusBadge variant="ALLOW" status="FAIL-CLOSED" size="sm" />
              </div>

              <h3 className="text-lg font-bold text-allow">
                Decoupled Intent, Model Checking & Cryptographic Nonces
              </h3>

              <p className="text-xs sm:text-sm text-muted leading-relaxed font-sans">
                Intent is compiled into an immutable AST policy. Before any payment is authorized,
                the model checker searches finite permutations to find loopholes. The agent only
                proposes a cart; VORENT checks the exact items against server catalog prices.
              </p>

              <div className="p-3 rounded-md bg-surface-inset border border-border/80 font-mono text-xs text-muted space-y-1">
                <div className="text-allow font-semibold">✅ Guarantees with VORENT:</div>
                <ul className="list-disc list-inside space-y-1 text-[11px]">
                  <li>Pure deterministic evaluator: zero LLM in the decision path</li>
                  <li>Decision D-014: High/critical flaws block spend caps</li>
                  <li>Single-use nonces prevent replay attacks (HTTP 409)</li>
                  <li>`SELECT ... FOR UPDATE` row locks serialize spend</li>
                  <li>Zero PayPal API calls made on DENY or REVIEW</li>
                </ul>
              </div>
            </div>

            <div className="pt-4 border-t border-allow/20 flex items-center justify-between text-xs">
              <span className="font-mono text-allow font-bold">Outcome:</span>
              <span className="text-muted">Loophole blocked; payment denied with audit proof</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
