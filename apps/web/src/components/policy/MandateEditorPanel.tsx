import { useState } from "react";
import {
  Binary,
  HelpCircle,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  ShieldCheck,
  Layers,
  ArrowRight,
  RefreshCw,
  FileText,
  Save,
  Check,
  ChevronDown,
  ChevronUp,
  Copy,
  Code2,
} from "lucide-react";
import { compileIntent, compileIntentLLM, createPolicy } from "../../api/policyService";
import type { CompileIntentResponse, PolicyVersionRecord } from "@warrant/contracts";
import { HashBadge } from "../ui/HashBadge";

const SAMPLE_MANDATES = [
  {
    name: "Engineering Equipment & Books",
    text: "Allow dev hardware up to $250.00 USD and reference books up to $80.00 USD. Total cart limit $600.00 USD. Prohibit weapons and gift cards. Require quotes.",
  },
  {
    name: "Ergonomic Peripherals Mandate",
    text: "Allow ergonomic keyboards and monitors up to $150.00 USD each, whole-cart ceiling $300.00 USD. Strict verifiable quotes required for all items.",
  },
  {
    name: "Ambiguous Mandate (Clarifying Questions Demo)",
    text: "Allow team members to buy whatever office stuff they need for remote work without hassle.",
  },
];

const SYNTAX_HINTS = [
  { label: "$ Item Ceiling", example: "up to $250 each" },
  { label: "$ Cart Total", example: "total budget $600" },
  { label: "Category Whitelist", example: "allow hardware and books" },
  { label: "Prohibited Blacklist", example: "prohibit gift cards" },
  { label: "Strict Quotes", example: "require quotes" },
];

interface MandateEditorPanelProps {
  onNavigateToVerification?: (policyOptionOrId: any) => void;
  onPolicyCreated?: (policyRecord: PolicyVersionRecord) => void;
  initialCompilationResult?: CompileIntentResponse | null;
}

export function MandateEditorPanel({
  onNavigateToVerification,
  onPolicyCreated,
  initialCompilationResult = null,
}: MandateEditorPanelProps) {
  const [mandateText, setMandateText] = useState(SAMPLE_MANDATES[0].text);
  const [currency, setCurrency] = useState("USD");
  const [targetName, setTargetName] = useState("");
  const [useLLMAssistant, setUseLLMAssistant] = useState(true);
  const [isCompiling, setIsCompiling] = useState(false);
  const [compilationResult, setCompilationResult] = useState<CompileIntentResponse | null>(
    initialCompilationResult,
  );
  const [compilationError, setCompilationError] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [savedPolicy, setSavedPolicy] = useState<PolicyVersionRecord | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const [isRuleTraceOpen, setIsRuleTraceOpen] = useState(false);
  const [copiedRuleTrace, setCopiedRuleTrace] = useState(false);

  const handleCompile = async () => {
    if (!mandateText.trim() || isCompiling) return;

    setIsCompiling(true);
    setCompilationError(null);
    setSavedPolicy(null);
    setSaveError(null);

    try {
      const compileFn = useLLMAssistant ? compileIntentLLM : compileIntent;
      const response = await compileFn({
        mandateText: mandateText.trim(),
        currency: currency.trim() || "USD",
        targetName: targetName.trim() || undefined,
      });

      // Fail-closed governance: never silently substitute a default policy if validation failed
      if (!response.validation.valid) {
        setCompilationError(
          `Compiler rejected policy: ${response.validation.errors.join("; ") || "Validation failed."}`,
        );
        setCompilationResult(null);
      } else {
        setCompilationResult(response);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Compilation request failed.";
      setCompilationError(msg);
      setCompilationResult(null);
    } finally {
      setIsCompiling(false);
    }
  };

  const handleSavePolicy = async () => {
    if (!compilationResult || isSaving) return;

    setIsSaving(true);
    setSaveError(null);

    try {
      const name =
        targetName.trim() ||
        compilationResult.confirmedIntent.name ||
        "Compiled Purchasing Policy";

      const record = await createPolicy({
        name,
        sourceMandate: mandateText,
        intent: compilationResult.confirmedIntent,
        policy: compilationResult.candidatePolicy,
        confirmationState: "CONFIRMED",
      });

      setSavedPolicy(record);
      if (onPolicyCreated) {
        onPolicyCreated(record);
      }
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Failed to persist policy.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleSendToVerification = () => {
    if (!compilationResult) return;

    const policyDocument = compilationResult.candidatePolicy;
    const intent = compilationResult.confirmedIntent;
    const policyOption = {
      id: savedPolicy?.id || "compiled_candidate_policy",
      version: savedPolicy ? `v${savedPolicy.versionNumber}` : "1.0.0-candidate",
      name: savedPolicy?.name || intent.name,
      hash: savedPolicy?.policyHash || "candidate_hash_unconfirmed",
      description: mandateText,
      limitsSummary: `Max Item: $${((policyDocument.maxItemPriceMinor ?? 0) / 100).toFixed(2)} | Max Cart: $${((policyDocument.maxCartTotalMinor ?? 0) / 100).toFixed(2)}`,
      policyDocument,
      intent,
      defaultCategories: policyDocument.allowedCategories || ["Hardware"],
      defaultPricePointsMinor: policyDocument.maxItemPriceMinor
        ? [policyDocument.maxItemPriceMinor]
        : [10000],
    };

    if (onNavigateToVerification) {
      onNavigateToVerification(policyOption);
    }
  };

  const handleCopyRuleTrace = () => {
    if (!compilationResult) return;
    const jsonStr = JSON.stringify(compilationResult.candidatePolicy, null, 2);
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      void navigator.clipboard.writeText(jsonStr);
      setCopiedRuleTrace(true);
      setTimeout(() => setCopiedRuleTrace(false), 2000);
    }
  };

  return (
    <div className="w-full space-y-6 pb-12 sm:pb-16" role="region" aria-label="Purchase Mandate Intent Compiler">
      {/* Workstation Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex items-center space-x-2.5">
            <div className="w-8 h-8 rounded-md bg-primary/10 border border-primary/20 flex items-center justify-center shrink-0">
              <Binary className="w-4 h-4 text-primary" aria-hidden="true" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-serif font-semibold tracking-tight text-ink">
                Purchase Mandate Compiler
              </h1>
              <p className="text-xs text-muted mt-0.5 font-sans leading-relaxed">
                Transform natural-language purchasing mandates into formal, verifiable policy rules.
                Neutralizes prompt injections, flags ambiguities, and extracts explicit constraints.
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center space-x-2 self-start sm:self-center">
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-mono font-bold bg-surface text-ink border border-border shadow-2xs">
            Intent → Policy Rule Engine
          </span>
        </div>
      </div>

      {/* Full-Width Vertical Authoring & Policy Layout */}
      <div className="w-full space-y-6">
        {/* Component 1: Natural-Language Purchase Mandate (Full Available Width) */}
        <div className="w-full bg-surface border border-border rounded-lg shadow-2xs overflow-hidden">
          <div className="px-4 py-3 bg-surface-inset border-b border-border flex items-center justify-between">
            <label htmlFor="mandate-input" className="text-xs font-semibold text-ink flex items-center space-x-1.5 font-sans">
              <FileText className="w-4 h-4 text-accent" aria-hidden="true" />
              <span>Natural-Language Purchase Mandate</span>
            </label>
          </div>

          <div className="p-4 sm:p-5 space-y-4">
            {/* Sample Presets Ribbon */}
            <div className="space-y-1.5">
              <span className="text-[11px] font-mono text-muted block">Sample Presets:</span>
              <div className="flex flex-wrap gap-1.5">
                {SAMPLE_MANDATES.map((sample, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      setMandateText(sample.text);
                      setCompilationResult(null);
                      setCompilationError(null);
                    }}
                    className="px-2.5 py-1 rounded-md bg-surface-inset hover:bg-surface-raised border border-border text-[11px] font-mono text-ink transition-colors focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    {sample.name.split(" ")[0]}
                  </button>
                ))}
              </div>
            </div>

            {/* Syntax Hint Pills */}
            <div className="space-y-1">
              <span className="text-[11px] font-medium text-muted block font-sans">
                Supported Syntax Hints:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {SYNTAX_HINTS.map((hint, i) => (
                  <span
                    key={i}
                    title={`e.g. "${hint.example}"`}
                    className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-sans bg-surface-inset text-muted border border-border/80"
                  >
                    {hint.label}
                  </span>
                ))}
              </div>
            </div>

            {/* IDE-Inspired Code Studio Editor */}
            <div className="border border-border rounded-lg bg-surface-inset overflow-hidden shadow-2xs focus-within:ring-2 focus-within:ring-accent/30 focus-within:border-accent transition-all">
              {/* Editor Header Ribbon */}
              <div className="px-3 py-1.5 bg-surface-raised border-b border-border flex items-center justify-between text-[11px] font-mono text-muted">
                <div className="flex items-center space-x-2">
                  <span className="w-2 h-2 rounded-full bg-accent inline-block" />
                  <span className="font-semibold text-ink">mandate.nlp</span>
                  <span className="text-muted/60">·</span>
                  <span>{mandateText.length} chars</span>
                </div>
                <div className="flex items-center space-x-3 text-[10px]">
                  <span>~{Math.ceil(mandateText.length / 4)} tokens</span>
                  <span className="px-1.5 py-0.5 rounded bg-surface border border-border text-ink font-semibold">NLP v1.0</span>
                </div>
              </div>

              {/* Line Numbers Gutter + Textarea */}
              <div className="flex items-stretch min-h-[140px] bg-surface-inset">
                <div className="select-none py-3 px-2.5 bg-surface-raised/40 border-r border-border/60 text-right font-mono text-xs text-muted/50 leading-relaxed font-tabular">
                  {Array.from({ length: Math.max(5, mandateText.split("\n").length) }, (_, i) => (
                    <div key={i + 1}>{i + 1}</div>
                  ))}
                </div>
                <div className="flex-1 relative">
                  <textarea
                    id="mandate-input"
                    name="mandateText"
                    data-lenis-prevent
                    value={mandateText}
                    onChange={(e) => setMandateText(e.target.value)}
                    rows={Math.max(5, mandateText.split("\n").length)}
                    placeholder="Enter natural-language spending authorization mandate..."
                    className="w-full h-full p-3 bg-transparent text-ink text-xs sm:text-sm font-mono focus:outline-none leading-relaxed resize-y"
                  />
                </div>
              </div>

              {/* Editor Status Bar */}
              <div className="px-3 py-1 bg-surface-raised/80 border-t border-border flex items-center justify-between text-[10px] font-mono text-muted">
                <span>UTF-8 · NL-INTENT COMPILER</span>
                <span>FAIL-CLOSED SAFETY CONSTRAINTS</span>
              </div>
            </div>

            {/* Policy Name & Currency Form Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label htmlFor="target-name" className="text-[11px] font-semibold text-muted block mb-1 font-mono uppercase tracking-wider">
                  Policy Name (Optional)
                </label>
                <input
                  id="target-name"
                  name="targetName"
                  type="text"
                  value={targetName}
                  onChange={(e) => setTargetName(e.target.value)}
                  placeholder="e.g. Engineering Dev Laptops Mandate"
                  className="w-full px-3 py-1.5 rounded-md border border-border bg-surface-inset text-ink text-xs focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
                />
              </div>
              <div>
                <label htmlFor="mandate-currency" className="text-[11px] font-semibold text-muted block mb-1 font-mono uppercase tracking-wider">
                  Currency
                </label>
                <input
                  id="mandate-currency"
                  name="currency"
                  type="text"
                  value={currency}
                  maxLength={3}
                  onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                  placeholder="USD"
                  className="w-full px-3 py-1.5 rounded-md border border-border bg-surface-inset text-ink text-xs font-mono uppercase focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all"
                />
              </div>
            </div>

            {/* Adversarial Prompt Injection Neutralization Shield */}
            <div className="p-3 rounded-md bg-accent/10 border border-accent/20 flex items-start gap-2.5 text-xs font-mono">
              <ShieldCheck className="w-4 h-4 text-accent shrink-0 mt-0.5" aria-hidden="true" />
              <div className="space-y-0.5">
                <span className="font-bold text-ink block text-[11px]">
                  Adversarial Prompt Shield Active
                </span>
                <span className="text-muted block text-[10px] leading-relaxed">
                  Neutralizes jailbreak attempts, sanitizes adversarial overrides, and retains fail-closed safety constraints.
                </span>
              </div>
            </div>

            {/* Compile Button with Duplicate Submission Guard & AI Toggle */}
            <div className="pt-3 border-t border-border flex items-center justify-between flex-wrap gap-3">
              <label className="inline-flex items-center space-x-2 text-[11px] font-mono text-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={useLLMAssistant}
                  onChange={(e) => setUseLLMAssistant(e.target.checked)}
                  className="rounded border-border text-primary focus:ring-primary/40 w-3.5 h-3.5 cursor-pointer"
                />
                <span>Gemini LLM Assistant ({useLLMAssistant ? "Active" : "Deterministic Mode"})</span>
              </label>
              <button
                type="button"
                onClick={() => void handleCompile()}
                disabled={isCompiling || !mandateText.trim()}
                className="inline-flex items-center space-x-2 px-4 py-2 rounded-md text-xs font-sans font-semibold bg-primary text-white hover:bg-primary-hover active:bg-primary-active disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-2xs focus:outline-none focus:ring-2 focus:ring-primary/40 cursor-pointer"
              >
                {isCompiling ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    <span>{useLLMAssistant ? "Extracting via AI..." : "Compiling Policy..."}</span>
                  </>
                ) : (
                  <>
                    <Code2 className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>{useLLMAssistant ? "Compile with AI Assistant" : "Compile Deterministic AST"}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Compilation Error Display */}
        {compilationError && (
          <div
            role="alert"
            className="w-full p-4 rounded-lg border border-deny/40 bg-deny/10 text-ink text-xs space-y-1.5 shadow-2xs font-mono"
          >
            <div className="flex items-center space-x-2 font-bold text-deny">
              <ShieldAlert className="w-4 h-4 text-deny shrink-0" aria-hidden="true" />
              <span>Intent Compilation Error</span>
            </div>
            <p className="leading-relaxed">{compilationError}</p>
            <div className="text-[11px] text-muted font-medium">
              Warrant strictly refuses to substitute a default policy when compilation fails or produces validation errors.
            </div>
          </div>
        )}

        {/* Vertical Layout of Results: Standby Card OR Logical Results Sequence */}
        {!compilationResult ? (
          /* Standby Blueprint Card (Full Available Width) */
          <div className="w-full bg-surface border border-dashed border-border rounded-lg p-8 sm:p-12 text-center space-y-3 shadow-2xs font-sans">
            <div className="w-10 h-10 rounded-full bg-surface-inset border border-border text-muted mx-auto flex items-center justify-center">
              <Binary className="w-5 h-5 text-accent" />
            </div>
            <h2 className="text-sm sm:text-base font-semibold text-ink">Formal Policy Engine Standby</h2>
            <p className="text-xs sm:text-sm text-muted max-w-md mx-auto leading-relaxed">
              Enter your spending authorization mandate above and click &quot;Compile to Formal Policy&quot; to synthesize verifiable rules, explicit bounds, and a canonical SHA-256 hash. Strict compiler: never defaults silently.
            </p>
          </div>
        ) : (
          <div className="w-full space-y-5 font-sans">
            {/* 1. Clarifying Questions Identified (Full Width Alert) */}
            {compilationResult.questions.length > 0 && (
              <div
                role="alert"
                className="w-full p-4 rounded-lg border border-review/40 bg-review/10 text-ink text-xs space-y-2 shadow-2xs"
              >
                <div className="flex items-center space-x-2 font-semibold text-review font-sans">
                  <HelpCircle className="w-4 h-4 text-review shrink-0" aria-hidden="true" />
                  <span>Clarifying Questions Identified ({compilationResult.questions.length})</span>
                </div>
                <p className="text-[11px] text-muted leading-relaxed">
                  The compiler identified semantic ambiguity in the purchase mandate. Clarify these conditions before authorizing spending:
                </p>
                <ul className="list-disc list-inside space-y-1 text-xs text-ink pl-1 font-sans">
                  {compilationResult.questions.map((q, idx) => (
                    <li key={idx} className="leading-relaxed">
                      {q}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 2. Policy Specification Surface (Full-Width Card) */}
            <div className="w-full bg-surface border border-border rounded-lg shadow-2xs overflow-hidden divide-y divide-border">
              {/* Header: Mandate Summary */}
              <div className="p-4 bg-surface-inset flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center space-x-2.5">
                  <div className="w-7 h-7 rounded-md bg-allow/10 border border-allow/30 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-4 h-4 text-allow" aria-hidden="true" />
                  </div>
                  <div>
                    <h2 className="font-bold text-sm text-ink font-sans">
                      {compilationResult.confirmedIntent.name}
                    </h2>
                    <span className="text-[10px] text-muted font-sans block">
                      Schema v{compilationResult.candidatePolicy.schemaVersion} • Currency: {compilationResult.candidatePolicy.currency}
                    </span>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-sans font-semibold bg-allow/10 text-allow border border-allow/30">
                    Candidate Validated
                  </span>
                  <span className="text-[10px] text-muted font-sans">
                    {compilationResult.compilerMetadata.deterministic ? "Deterministic" : "Stochastic"}
                  </span>
                </div>
              </div>

              {/* Policy Details: 4-Stat Limits Strip */}
              <div className="grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-border bg-surface text-xs">
                <div className="p-4 space-y-1">
                  <div className="text-muted text-[11px] font-medium font-sans">Max Item Price</div>
                  <div className="text-base font-bold font-mono text-ink tabular-nums">
                    {compilationResult.candidatePolicy.maxItemPriceMinor !== undefined
                      ? `$${(compilationResult.candidatePolicy.maxItemPriceMinor / 100).toFixed(2)}`
                      : "No Limit"}
                  </div>
                  <div className="text-[10px] text-muted font-sans">Per single item</div>
                </div>

                <div className="p-4 space-y-1">
                  <div className="text-muted text-[11px] font-medium font-sans">Max Cart Total</div>
                  <div className="text-base font-bold font-mono text-ink tabular-nums">
                    {compilationResult.candidatePolicy.maxCartTotalMinor !== undefined
                      ? `$${(compilationResult.candidatePolicy.maxCartTotalMinor / 100).toFixed(2)}`
                      : "Unbounded (Warning)"}
                  </div>
                  <div className="text-[10px] text-muted font-sans">Cumulative cart limit</div>
                </div>

                <div className="p-4 space-y-1">
                  <div className="text-muted text-[11px] font-medium font-sans">Evidence Required</div>
                  <div className="text-base font-bold text-ink font-sans">
                    {compilationResult.candidatePolicy.requireEvidence ? "Strict Quotes" : "Optional"}
                  </div>
                  <div className="text-[10px] text-muted font-sans">Vendor quotation check</div>
                </div>

                <div className="p-4 space-y-1">
                  <div className="text-muted text-[11px] font-medium font-sans">Allowed Categories</div>
                  <div className="text-base font-bold font-mono text-ink tabular-nums">
                    {(compilationResult.candidatePolicy.allowedCategories ?? []).length}
                  </div>
                  <div className="text-[10px] text-muted font-sans">Explicit whitelists</div>
                </div>
              </div>

              {/* Policy Details: Categories Whitelist & Blacklist */}
              <div className="p-4 space-y-3 text-xs bg-surface font-sans">
                <div>
                  <span className="font-medium text-muted text-xs block mb-1.5">
                    Allowed Categories Whitelist:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {(compilationResult.candidatePolicy.allowedCategories ?? []).map((cat, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded bg-allow/10 text-allow border border-allow/30 font-sans text-xs"
                      >
                        ✓ {cat}
                      </span>
                    ))}
                  </div>
                </div>

                {(compilationResult.candidatePolicy.prohibitedCategories ?? []).length > 0 && (
                  <div>
                    <span className="font-medium text-muted text-xs block mb-1.5">
                      Prohibited Categories Blacklist:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {(compilationResult.candidatePolicy.prohibitedCategories ?? []).map((cat, i) => (
                        <span
                          key={i}
                          className="px-2 py-0.5 rounded bg-deny/10 text-deny border border-deny/30 font-sans text-xs"
                        >
                          ✕ {cat}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 3. Compiler Deductions & Assumptions */}
              {compilationResult.assumptions.length > 0 && (
                <div className="p-4 bg-surface-inset text-xs space-y-1.5 font-sans">
                  <span className="font-semibold text-xs text-muted block">
                    Compiler Deductions &amp; Assumptions
                  </span>
                  <ul className="list-disc list-inside space-y-1 text-muted text-xs pl-1 font-sans">
                    {compilationResult.assumptions.map((a, idx) => (
                      <li key={idx} className="leading-relaxed">{a}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* 4. Collapsible Formal JSON Rule Trace */}
              <div className="bg-surface-inset">
                <div className="p-3 flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setIsRuleTraceOpen(!isRuleTraceOpen)}
                    className="inline-flex items-center space-x-2 text-xs font-mono font-medium text-ink hover:text-accent transition-colors cursor-pointer"
                    aria-expanded={isRuleTraceOpen}
                  >
                    <Code2 className="w-4 h-4 text-accent" aria-hidden="true" />
                    <span>Formal JSON Rule Trace</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-canvas border border-border text-muted">
                      Schema v{compilationResult.candidatePolicy.schemaVersion}
                    </span>
                    {isRuleTraceOpen ? (
                      <ChevronUp className="w-3.5 h-3.5 text-muted" aria-hidden="true" />
                    ) : (
                      <ChevronDown className="w-3.5 h-3.5 text-muted" aria-hidden="true" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyRuleTrace}
                    className="inline-flex items-center space-x-1 px-2.5 py-1 rounded text-[11px] font-mono text-muted hover:text-ink border border-border bg-surface hover:bg-canvas transition-colors cursor-pointer"
                  >
                    {copiedRuleTrace ? (
                      <>
                        <Check className="w-3 h-3 text-allow" aria-hidden="true" />
                        <span className="text-allow">Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3 h-3 text-muted" aria-hidden="true" />
                        <span>Copy JSON</span>
                      </>
                    )}
                  </button>
                </div>

                {isRuleTraceOpen && (
                  <pre
                    data-lenis-prevent
                    tabIndex={0}
                    className="p-4 border-t border-border bg-surface-inset font-mono text-[11px] text-ink overflow-x-auto max-h-72 leading-relaxed focus:outline-none focus:ring-1 focus:ring-accent"
                  >
                    {JSON.stringify(compilationResult.candidatePolicy, null, 2)}
                  </pre>
                )}
              </div>

              {/* Save Feedback */}
              {saveError && (
                <div className="p-3 bg-deny/10 border-t border-border text-xs text-deny font-mono">
                  {saveError}
                </div>
              )}
              {savedPolicy && (
                <div className="p-3 bg-allow/10 border-t border-border text-xs text-ink flex flex-wrap items-center gap-2 font-mono">
                  <Check className="w-4 h-4 text-allow shrink-0" aria-hidden="true" />
                  <span>Policy version saved successfully! Version {savedPolicy.versionNumber}</span>
                  <HashBadge hash={savedPolicy.policyId} label="Policy ID" prefixLength={8} suffixLength={4} />
                  <HashBadge hash={savedPolicy.policyHash} label="Hash" prefixLength={8} suffixLength={6} />
                </div>
              )}

              {/* Action Bar */}
              <div className="p-4 bg-surface-inset border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <span className="text-[11px] text-muted flex items-center space-x-1.5 font-mono min-w-0">
                  <AlertTriangle className="w-3.5 h-3.5 text-review shrink-0" aria-hidden="true" />
                  <span>Requires verification test before deployment or approval.</span>
                </span>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleSavePolicy()}
                    disabled={isSaving || savedPolicy !== null}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-mono font-medium border border-border bg-surface hover:bg-canvas text-ink disabled:opacity-50 transition-colors shadow-2xs focus:outline-none focus:ring-2 focus:ring-accent/30 cursor-pointer"
                  >
                    {isSaving ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                    ) : (
                      <Save className="w-3.5 h-3.5 text-muted" aria-hidden="true" />
                    )}
                    <span>{savedPolicy ? "Signed & Committed Version" : "Sign and Commit Policy Version"}</span>
                    <span className="sr-only">Save as Policy</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleSendToVerification}
                    className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-mono font-semibold bg-accent text-white hover:opacity-90 active:opacity-100 transition-all shadow-2xs focus:outline-none focus:ring-2 focus:ring-accent/30 cursor-pointer"
                  >
                    <Layers className="w-3.5 h-3.5" aria-hidden="true" />
                    <span>Test in Verification Studio</span>
                    <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
