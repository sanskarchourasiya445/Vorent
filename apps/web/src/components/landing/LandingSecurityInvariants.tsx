import { AlertTriangle } from "lucide-react";
import { StatusBadge } from "../ui/StatusBadge";

export function LandingSecurityInvariants() {
  const invariants = [
    {
      id: "INV-01",
      name: "Deterministic Policy Evaluation",
      rule: "Pure Domain Execution",
      guarantee:
        "Zero LLM, network, or clock dependency in the decision path. Identical policy AST, cart, and catalog items yield identical ALLOW, DENY, or REVIEW outcomes.",
      testProof: "evaluator.test.ts",
      status: "PASS",
    },
    {
      id: "INV-02",
      name: "RFC 8785 Canonical Hashing",
      rule: "Tamper-Evident SHA-256",
      guarantee:
        "Policy documents are normalized using the official RFC 8785 JSON Canonicalization Scheme. Policy hashes are reproducible across any OS, runtime, or JSON key order.",
      testProof: "auditPacket.test.ts",
      status: "PASS",
    },
    {
      id: "INV-03",
      name: "Decision D-014 Fail-Closed Gate",
      rule: "Physical Approval Blocking",
      guarantee:
        "Risk acceptance is strictly prohibited for unresolved CRITICAL and HIGH counterexamples. Approval creation is rejected with CRITICAL_HIGH_CANNOT_BE_ACCEPTED_RISK.",
      testProof: "approvalsRoutes.test.ts",
      status: "PASS",
    },
    {
      id: "INV-04",
      name: "Single-Use Nonce Replay Defense",
      rule: "Atomic 256-bit Token Consumption",
      guarantee:
        "Checkout nonces are consumed atomically in PostgreSQL. Duplicate replay attempts fail with HTTP 409 Conflict, resulting in exactly zero PayPal provider calls.",
      testProof: "checkoutRoutes.test.ts",
      status: "PASS",
    },
    {
      id: "INV-05",
      name: "Row-Locked Spend Reservation",
      rule: "SELECT ... FOR UPDATE Serialization",
      guarantee:
        "Concurrent checkout proposals are serialized at the database row level, preventing race conditions, double-spend attempts, and budget oversubscription.",
      testProof: "persistence.test.ts",
      status: "PASS",
    },
    {
      id: "INV-06",
      name: "Idempotent Capture & Reconciliation Holds",
      rule: "PayPal-Request-Id Monotonic State",
      guarantee:
        "Order capture passes deterministic idempotency keys. Ambiguous network timeouts enter UNKNOWN_REQUIRES_RECONCILIATION with a hold, preventing duplicate capture.",
      testProof: "paymentOrderLifecycle.test.ts",
      status: "PASS",
    },
  ];

  return (
    <section id="invariants" className="py-16 sm:py-24 bg-canvas-subtle/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto space-y-3">
          <div className="text-xs font-mono uppercase tracking-widest text-accent font-semibold">
            Formal Verification
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-ink tracking-tight">
            Governed by Invariants, Proven by 790 Tests
          </h2>
          <p className="text-sm sm:text-base text-muted font-sans">
            Security claims in VORENT are not marketing aspirations—they are mathematically
            enforced software invariants verified across 65 automated test suites.
          </p>
        </div>

        {/* Structured Invariant Table */}
        <div className="w-full max-w-full rounded-xl border border-border bg-surface shadow-md overflow-hidden">
          <div className="overflow-x-auto w-full">
            <table className="w-full text-left text-xs font-sans">
              <thead className="bg-surface-subtle border-b border-border text-[11px] font-mono text-muted uppercase tracking-wider">
                <tr>
                  <th scope="col" className="px-5 py-3.5">Invariant</th>
                  <th scope="col" className="px-5 py-3.5">Name & Mechanism</th>
                  <th scope="col" className="px-5 py-3.5 hidden md:table-cell">Operational Guarantee</th>
                  <th scope="col" className="px-5 py-3.5">Verified In</th>
                  <th scope="col" className="px-5 py-3.5 text-right">Verdict</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {invariants.map((inv) => (
                  <tr key={inv.id} className="hover:bg-surface-subtle/60 transition-colors">
                    <td className="px-5 py-4 font-mono font-bold text-accent whitespace-nowrap">
                      {inv.id}
                    </td>
                    <td className="px-5 py-4 space-y-1">
                      <div className="font-bold text-ink">{inv.name}</div>
                      <div className="font-mono text-[10px] text-muted">{inv.rule}</div>
                      <div className="text-muted md:hidden pt-1 text-[11px] leading-relaxed">
                        {inv.guarantee}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-muted hidden md:table-cell leading-relaxed max-w-md">
                      {inv.guarantee}
                    </td>
                    <td className="px-5 py-4 font-mono text-[11px] text-muted whitespace-nowrap">
                      {inv.testProof}
                    </td>
                    <td className="px-5 py-4 text-right whitespace-nowrap">
                      <StatusBadge variant="ALLOW" status="VERIFIED" size="sm" showDot={true} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Honest System Boundary Disclaimer Banner */}
        <div className="rounded-xl border border-review-border bg-review-bg/30 p-5 sm:p-6 flex items-start space-x-4">
          <AlertTriangle className="w-5 h-5 text-review shrink-0 mt-0.5" />
          <div className="space-y-1.5 text-xs">
            <div className="font-bold text-ink">
              System Boundary & Sandbox Environment Disclosure
            </div>
            <p className="text-muted leading-relaxed font-sans">
              VORENT operates strictly against the <strong>PayPal Sandbox</strong> developer environment
              (<code>PAYPAL_ENV=sandbox</code>). Production payment keys and real-money transactions are
              physically rejected at engine initialization. Bounded model checking evaluates declared,
              finite combinatorial spaces drawn from server catalogs—it does not constitute an unconstrained
              infinite-state proof over arbitrary real-world marketplaces.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
