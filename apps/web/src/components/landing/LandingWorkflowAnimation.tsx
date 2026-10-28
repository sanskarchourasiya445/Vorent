import { useState, useEffect, useRef } from "react";
import {
  FileCode,
  ShieldAlert,
  Lock,
  CreditCard,
  CheckCircle2,
  ChevronRight,
  Play,
  Pause,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import { StatusBadge } from "../ui/StatusBadge";

interface WorkflowStep {
  id: string;
  number: string;
  title: string;
  shortTitle: string;
  icon: typeof FileCode;
  stageName: string;
  statusText: string;
  badgeStatus: string;
  badgeVariant: "SANDBOX" | "CRITICAL" | "ALLOW" | "REVIEW";
  summary: string;
  detail: string;
  codeSnippet: string;
  metrics: { label: string; value: string }[];
}

const WORKFLOW_STEPS: WorkflowStep[] = [
  {
    id: "policy",
    number: "01",
    title: "1. Policy Compilation & Intent AST",
    shortTitle: "Policy Intent",
    icon: FileCode,
    stageName: "SPECIFICATION LAYER",
    statusText: "AST Generated",
    badgeStatus: "COMPILED",
    badgeVariant: "SANDBOX",
    summary:
      "Natural-language purchasing rules are converted into an immutable Abstract Syntax Tree (AST) with spending bounds and category constraints.",
    detail:
      "Natural-language mandates pass through the Adversarial Prompt Shield, stripping injection attempts and canonicalizing category limits into deterministic TypeScript policy contracts.",
    codeSnippet: `{
  "policyId": "pol_v2_canonical_fixed",
  "version": 2,
  "rules": [
    { "category": "books_education", "action": "ALLOW", "ceiling": 1500.00 },
    { "category": "office_hardware", "action": "REVIEW", "ceiling": 500.00 },
    { "category": "gift_cards", "action": "DENY" }
  ],
  "canonicalSha256": "7f4c9a...b891e"
}`,
    metrics: [
      { label: "Rule Nodes", value: "3 AST Rules" },
      { label: "Injection Check", value: "PASSED (0 alerts)" },
      { label: "Canonical Scheme", value: "RFC 8785 JSON" },
    ],
  },
  {
    id: "verification",
    number: "02",
    title: "2. Finite-Domain Loophole Model Checker",
    shortTitle: "Loophole Check",
    icon: ShieldAlert,
    stageName: "VERIFICATION STUDIO",
    statusText: "Loophole Detected",
    badgeStatus: "HIGH RISK",
    badgeVariant: "CRITICAL",
    summary:
      "Combines 250 candidate carts across 4 dimensions (price, quantity, category drift, gift cards) to surface reproducible loophole counterexamples.",
    detail:
      "The verifier identifies a classic purchasing loophole: individual items are priced under $500, but a combined order of 3 items reaches $1,800, exceeding the $1,500 total spend limit.",
    codeSnippet: `// Loophole Counterexample Witness Found:
{
  "findingId": "FINDING-LOOPHOLE-001",
  "severity": "HIGH",
  "loopholeType": "CART_TOTAL_OMITTED_WHILE_ITEM_PRICE_SET",
  "witnessCart": {
    "items": [
      { "id": "bk_comp_01", "name": "Algorithms Vol 1", "price": 600.00 },
      { "id": "bk_comp_02", "name": "Algorithms Vol 2", "price": 600.00 },
      { "id": "bk_comp_03", "name": "Algorithms Vol 3", "price": 600.00 }
    ],
    "computedTotal": 1800.00, // VIOLATES $1500 CAP
    "verdict": "DENY"
  }
}`,
    metrics: [
      { label: "Search Budget", value: "250 carts permuted" },
      { label: "Findings", value: "1 High, 0 Critical" },
      { label: "Counterexample", value: "Reproducible Witness" },
    ],
  },
  {
    id: "approval",
    number: "03",
    title: "3. Decision D-014 Fail-Closed Gate",
    shortTitle: "Fail-Closed Gate",
    icon: Lock,
    stageName: "AUTHORITATIVE APPROVAL",
    statusText: "Gate Enforced",
    badgeStatus: "D-014 BLOCKED",
    badgeVariant: "CRITICAL",
    summary:
      "Decision D-014 physically prevents approval creation whenever unmitigated CRITICAL or HIGH findings remain unresolved in the policy.",
    detail:
      "Risk officers cannot bypass unresolved high findings with risk acceptance. Once the policy is repaired by adding a top-level cart total constraint, the policy hash updates and the approval checkpoint unlocks.",
    codeSnippet: `// Decision D-014 Invariant Enforcement:
if (hasUnresolvedFindings(policyId, ["CRITICAL", "HIGH"])) {
  // Physical block - cannot sign or accept risk
  throw new Error("CRITICAL_HIGH_CANNOT_BE_ACCEPTED_RISK");
}

// After policy repair (pol_v2_canonical_fixed):
const approval = {
  "approvalId": "appr_2026_0891",
  "policySha256": "7f4c9a...b891e",
  "spendLimit": 1500.00,
  "currency": "USD",
  "status": "APPROVED",
  "nonceReservation": "0x9e2b...f81a"
};`,
    metrics: [
      { label: "Bypass Prevention", value: "FAIL-CLOSED" },
      { label: "Risk Acceptance", value: "STRICTLY BLOCKED" },
      { label: "Approved Budget", value: "$1,500.00 USD" },
    ],
  },
  {
    id: "authorization",
    number: "04",
    title: "4. Runtime Checkout Gate & PayPal Sandbox",
    shortTitle: "PayPal Settlement",
    icon: CreditCard,
    stageName: "SETTLEMENT RAIL",
    statusText: "Idempotent Capture",
    badgeStatus: "ALLOW / CAPTURED",
    badgeVariant: "ALLOW",
    summary:
      "The agent proposes a compliant cart via a single-use nonce. Row locks serialize spend, and PayPal Sandbox Orders v2 captures payment idempotently.",
    detail:
      "On ALLOW verdict, PostgreSQL serializes the reservation with SELECT ... FOR UPDATE. The backend calls PayPal Sandbox API with PayPal-Request-Id header, capturing funds without duplicate risk.",
    codeSnippet: `// Atomic Runtime Execution:
await db.transaction(async (tx) => {
  // 1. Consume 256-bit single-use nonce
  await consumeNonce(tx, nonce); // Replay -> HTTP 409

  // 2. Row-lock spend reservation
  const res = await tx.selectForUpdate(reservations, approvalId);

  // 3. PayPal Sandbox Orders v2 capture
  const capture = await paypalClient.captureOrder(orderId, {
    headers: { "PayPal-Request-Id": \`warrant:cap:\${orderId}\` }
  });
  return { status: "CAPTURED", captureId: capture.id };
});`,
    metrics: [
      { label: "Nonce Defense", value: "Single-Use (HTTP 409)" },
      { label: "Row Serialization", value: "SELECT FOR UPDATE" },
      { label: "Provider Rail", value: "PayPal Sandbox v2" },
    ],
  },
];

export function LandingWorkflowAnimation() {
  const [activeStepIdx, setActiveStepIdx] = useState(0);
  const [isPlaying, setIsPlaying] = useState(true);
  const [progress, setProgress] = useState(0);
  const timerRef = useRef<number | null>(null);

  const STEP_DURATION = 4500; // 4.5 seconds per step
  const TICK_INTERVAL = 50;

  // Auto-play progress loop
  useEffect(() => {
    if (!isPlaying) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    const interval = setInterval(() => {
      setProgress((prev) => {
        const next = prev + (TICK_INTERVAL / STEP_DURATION) * 100;
        if (next >= 100) {
          setActiveStepIdx((current) => (current + 1) % WORKFLOW_STEPS.length);
          return 0;
        }
        return next;
      });
    }, TICK_INTERVAL);

    timerRef.current = interval as unknown as number;
    return () => clearInterval(interval);
  }, [isPlaying]);

  const handleStepClick = (index: number) => {
    setActiveStepIdx(index);
    setProgress(0);
  };

  const handleTogglePlay = () => {
    setIsPlaying((prev) => !prev);
  };

  const handleReset = () => {
    setActiveStepIdx(0);
    setProgress(0);
    setIsPlaying(true);
  };

  const currentStep = WORKFLOW_STEPS[activeStepIdx];
  const StepIcon = currentStep.icon;

  return (
    <div className="w-full rounded-2xl border border-border bg-surface shadow-xl overflow-hidden">
      {/* Top Controller Bar */}
      <div className="px-4 py-3 sm:px-6 bg-surface-subtle border-b border-border flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-accent animate-ping" />
          <span className="font-mono text-xs uppercase tracking-wider text-ink font-bold">
            Interactive Lifecycle Simulator
          </span>
          <span className="hidden sm:inline-block text-muted text-xs font-mono">•</span>
          <span className="hidden sm:inline-block text-xs text-muted font-sans">
            Real execution trace through VORENT security invariants
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={handleTogglePlay}
            className="inline-flex items-center space-x-1 px-2.5 py-1 rounded bg-surface hover:bg-surface-inset border border-border text-xs font-mono text-ink transition-colors cursor-pointer"
            aria-label={isPlaying ? "Pause simulation" : "Play simulation"}
          >
            {isPlaying ? (
              <>
                <Pause className="w-3 h-3 text-muted" />
                <span>Pause</span>
              </>
            ) : (
              <>
                <Play className="w-3 h-3 text-accent" />
                <span>Play</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleReset}
            className="p-1 rounded bg-surface hover:bg-surface-inset border border-border text-muted hover:text-ink transition-colors cursor-pointer"
            aria-label="Restart simulation"
            title="Reset to Stage 1"
          >
            <RotateCcw className="w-3 h-3" />
          </button>
        </div>
      </div>

      {/* 4 Step Sequential Navigation Tabs */}
      <div className="grid grid-cols-2 md:grid-cols-4 border-b border-border bg-surface-inset/50 divide-y md:divide-y-0 md:divide-x divide-border">
        {WORKFLOW_STEPS.map((step, idx) => {
          const isActive = idx === activeStepIdx;
          const isPassed = idx < activeStepIdx;
          const Icon = step.icon;

          return (
            <button
              key={step.id}
              type="button"
              onClick={() => handleStepClick(idx)}
              className={`relative p-3.5 sm:p-4 text-left transition-all cursor-pointer flex flex-col justify-between ${
                isActive
                  ? "bg-surface text-ink shadow-xs"
                  : "bg-transparent text-muted hover:text-ink hover:bg-surface/50"
              }`}
            >
              <div className="flex items-center justify-between w-full mb-1">
                <span className="font-mono text-[10px] uppercase font-bold tracking-wider">
                  STAGE {step.number}
                </span>
                {isPassed ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-allow" />
                ) : (
                  <Icon
                    className={`w-3.5 h-3.5 ${
                      isActive ? "text-accent" : "text-muted"
                    }`}
                  />
                )}
              </div>

              <div className="font-bold text-xs sm:text-sm text-ink truncate w-full">
                {step.shortTitle}
              </div>

              {/* Step Progress Fill Indicator */}
              {isActive && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-accent/30 overflow-hidden">
                  <div
                    className="h-full bg-accent transition-all duration-75 ease-linear"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Dynamic Workflow Stage Details View */}
      <div className="p-5 sm:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Stage Explanation & Concrete Evidence */}
        <div className="lg:col-span-5 space-y-5">
          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <span className="font-mono text-[10px] uppercase tracking-wider text-muted font-bold">
                {currentStep.stageName}
              </span>
              <StatusBadge
                status={currentStep.badgeStatus}
                variant={currentStep.badgeVariant}
                size="sm"
                showDot={true}
              />
            </div>

            <h3 className="text-xl sm:text-2xl font-extrabold text-ink tracking-tight flex items-center space-x-2">
              <span>{currentStep.title}</span>
            </h3>

            <p className="text-xs sm:text-sm text-muted font-sans leading-relaxed">
              {currentStep.summary}
            </p>
          </div>

          <div className="p-3.5 rounded-lg bg-surface-inset border border-border space-y-2">
            <div className="font-mono text-[11px] font-bold text-ink uppercase tracking-wider flex items-center space-x-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-accent" />
              <span>Architectural Guarantee</span>
            </div>
            <p className="text-xs text-muted leading-relaxed font-sans">
              {currentStep.detail}
            </p>
          </div>

          {/* Metric Badges Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
            {currentStep.metrics.map((m, i) => (
              <div
                key={i}
                className="p-2.5 rounded bg-surface-subtle border border-border text-center space-y-0.5"
              >
                <div className="text-[10px] font-mono text-muted uppercase">
                  {m.label}
                </div>
                <div className="text-xs font-mono font-bold text-ink truncate">
                  {m.value}
                </div>
              </div>
            ))}
          </div>

          {/* Stage Sequence Trigger Button */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() =>
                handleStepClick((activeStepIdx + 1) % WORKFLOW_STEPS.length)
              }
              className="inline-flex items-center space-x-2 px-3.5 py-2 rounded-md bg-surface-raised hover:bg-surface border border-border text-xs font-mono text-ink transition-colors cursor-pointer"
            >
              <span>Next Stage: {WORKFLOW_STEPS[(activeStepIdx + 1) % WORKFLOW_STEPS.length].shortTitle}</span>
              <ChevronRight className="w-3.5 h-3.5 text-accent" />
            </button>
          </div>
        </div>

        {/* Right Column: Code / AST / Network Trace Terminal */}
        <div className="lg:col-span-7">
          <div className="rounded-xl border border-border bg-slate-950 text-slate-100 shadow-lg overflow-hidden font-mono text-xs">
            {/* Terminal Window Header */}
            <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-2.5 h-2.5 rounded-full bg-red-500/80 inline-block" />
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
                <span className="ml-2 text-[11px] text-slate-400 font-mono">
                  vorent-engine :: {currentStep.id}.ts
                </span>
              </div>
              <div className="flex items-center space-x-2 text-[10px] text-slate-400">
                <StepIcon className="w-3.5 h-3.5 text-sky-400" />
                <span>{currentStep.statusText}</span>
              </div>
            </div>

            {/* Code Body */}
            <div className="p-4 sm:p-5 overflow-x-auto text-[11px] sm:text-xs leading-relaxed text-slate-300 font-mono bg-slate-950/95">
              <pre className="selection:bg-sky-500/30 selection:text-white">
                <code>{currentStep.codeSnippet}</code>
              </pre>
            </div>

            {/* Terminal Footer Status Bar */}
            <div className="px-4 py-2 bg-slate-900/80 border-t border-slate-800 flex items-center justify-between text-[10px] text-slate-400 font-mono">
              <div className="flex items-center space-x-2">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block" />
                <span>Deterministic Runtime (Zero Clock/Network Drift)</span>
              </div>
              <span className="text-slate-400">RFC 8785 Canonical</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
