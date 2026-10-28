import { useState } from "react";
import { ChevronDown } from "lucide-react";

interface FaqItem {
  question: string;
  answer: string;
}

const FAQS: FaqItem[] = [
  {
    question: "Does VORENT execute real-money payments?",
    answer:
      "No. VORENT operates exclusively against the PayPal Sandbox developer environment (api-m.sandbox.paypal.com). Live production credentials and real-money transactions are physically blocked at application startup by strict configuration validation (PAYPAL_ENV=sandbox).",
  },
  {
    question: "Can an AI model override a DENY or REVIEW decision?",
    answer:
      "Never. Generative AI models (such as Google Gemini) are used strictly as optional drafting assistants to parse conversational intent into structured rule drafts. The runtime checkout gate and verification engine are pure deterministic TypeScript domain logic with zero network, clock, or LLM authority.",
  },
  {
    question: "What is Decision D-014?",
    answer:
      "Decision D-014 is our foundational fail-closed governance invariant: risk acceptance is strictly prohibited for unresolved CRITICAL and HIGH policy counterexamples. An approver is physically blocked from issuing spend caps or authorization nonces on a policy version that contains unverified high-severity loopholes.",
  },
  {
    question: "How are replay attacks and double-charges prevented?",
    answer:
      "Single-use 256-bit cryptographic nonces are stored in PostgreSQL and consumed atomically during proposal evaluation. Duplicate checkout proposals return HTTP 409 Conflict with zero provider calls. Furthermore, order captures use deterministic PayPal-Request-Id headers (warrant:cap:<orderId>) to guarantee provider-level idempotency.",
  },
  {
    question: "Can I run and test VORENT locally without PayPal developer credentials?",
    answer:
      "Yes. The mandate compiler, bounded model checker, finding triage workbench, and evaluation suite operate 100% offline using in-memory synthetic catalogs and test fixtures (@warrant/test-fixtures). A PayPal Sandbox developer account is needed only when testing live server-to-server PayPal OAuth and Orders v2 capture.",
  },
  {
    question: "How does VORENT handle ambiguous network timeouts during payment?",
    answer:
      "If a network timeout occurs during an order capture, the payment order transitions into UNKNOWN_REQUIRES_RECONCILIATION with an active RECONCILIATION_HOLD. This blocks any subsequent checkout attempts on that reservation until PayPal's asynchronous webhooks verify the true provider state.",
  },
];

export function LandingFaq() {
  const [openIdx, setOpenIdx] = useState<number | null>(0);

  const toggleFaq = (idx: number) => {
    setOpenIdx(openIdx === idx ? null : idx);
  };

  return (
    <section id="faq" className="py-16 sm:py-24 bg-canvas">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 space-y-12">
        {/* Section Header */}
        <div className="text-center space-y-3">
          <div className="text-xs font-mono uppercase tracking-widest text-accent font-semibold">
            Common Questions
          </div>
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-ink tracking-tight">
            Frequently Asked Questions
          </h2>
          <p className="text-sm sm:text-base text-muted font-sans max-w-2xl mx-auto">
            Direct, technical answers regarding sandbox boundaries, determinism, fail-closed
            governance, and payment safety.
          </p>
        </div>

        {/* Accordion List */}
        <div className="space-y-3">
          {FAQS.map((faq, idx) => {
            const isOpen = openIdx === idx;
            return (
              <div
                key={idx}
                className="rounded-lg border border-border bg-surface transition-all overflow-hidden"
              >
                <button
                  type="button"
                  onClick={() => toggleFaq(idx)}
                  className="w-full px-5 py-4 text-left flex items-center justify-between space-x-4 cursor-pointer focus:outline-none focus:ring-1 focus:ring-accent"
                  aria-expanded={isOpen}
                >
                  <span className="font-bold text-sm text-ink font-sans">
                    {faq.question}
                  </span>
                  <ChevronDown
                    className={`w-4 h-4 text-muted transition-transform duration-200 shrink-0 ${
                      isOpen ? "rotate-180 text-accent" : ""
                    }`}
                  />
                </button>

                <div
                  className={`grid transition-all duration-300 ease-out ${
                    isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                  }`}
                >
                  <div className="overflow-hidden">
                    <div className="px-5 pb-4 pt-1 text-xs text-muted leading-relaxed font-sans border-t border-border/40">
                      {faq.answer}
                    </div>
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
