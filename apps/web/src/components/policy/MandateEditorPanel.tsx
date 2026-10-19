import { useState } from "react";
import {
  Sparkles,
  HelpCircle,
  AlertTriangle,
  CheckCircle2,
  ShieldAlert,
  Layers,
  ArrowRight,
  RefreshCw,
  FileText,
  Save,
  Check,
} from "lucide-react";
import { compileIntent, createPolicy } from "../../api/policyService";
import type { CompileIntentResponse, PolicyVersionRecord } from "@warrant/contracts";

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

interface MandateEditorPanelProps {
  onNavigateToVerification?: (policyOptionOrId: any) => void;
  onPolicyCreated?: (policyRecord: PolicyVersionRecord) => void;
}

export function MandateEditorPanel({
  onNavigateToVerification,
  onPolicyCreated,
}: MandateEditorPanelProps) {
  const [mandateText, setMandateText] = useState(SAMPLE_MANDATES[0].text);
  const [currency, setCurrency] = useState("USD");
  const [targetName, setTargetName] = useState("");
  const [isCompiling, setIsCompiling] = useState(false);
  const [compilationResult, setCompilationResult] = useState<CompileIntentResponse | null>(null);
  const [compilationError, setCompilationError] = useState<string | null>(null);

  const [isSaving, setIsSaving] = useState(false);
  const [savedPolicy, setSavedPolicy] = useState<PolicyVersionRecord | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleCompile = async () => {
    if (!mandateText.trim() || isCompiling) return;

    setIsCompiling(true);
    setCompilationError(null);
    setSavedPolicy(null);
    setSaveError(null);

    try {
      const response = await compileIntent({
        mandateText: mandateText.trim(),
        currency: currency.trim() || "USD",
        targetName: targetName.trim() || undefined,
      });

      // Strict enforcement: Never silently substitute a default policy if backend validation failed
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

  return (
    <div className="max-w-5xl mx-auto space-y-6" role="region" aria-label="Purchase Mandate Intent Compiler">
      {/* Workstation Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="flex items-center space-x-2">
            <Sparkles className="w-6 h-6 text-accent" aria-hidden="true" />
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-ink">
              Purchase Mandate Compiler
            </h1>
          </div>
          <p className="text-xs sm:text-sm text-muted mt-1">
            Transform natural-language purchasing mandates into formal, verifiable policy rules.
            Neutralizes prompt injections, flags ambiguities, and extracts explicit constraints.
          </p>
        </div>
        <div className="flex items-center space-x-2">
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-canvas text-muted border border-border">
            Phase 2: Intent → Policy
          </span>
        </div>
      </div>

      {/* Input Form */}
      <div className="p-5 md:p-6 rounded-panel border border-border bg-surface space-y-4 shadow-sm">
        <div className="flex items-center justify-between">
          <label htmlFor="mandate-input" className="text-xs font-bold uppercase tracking-wider text-ink flex items-center space-x-1.5">
            <FileText className="w-4 h-4 text-accent" aria-hidden="true" />
            <span>Natural-Language Purchase Mandate</span>
          </label>
          <div className="flex items-center space-x-2 text-xs text-muted">
            <span>Sample Presets:</span>
            {SAMPLE_MANDATES.map((sample, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setMandateText(sample.text);
                  setCompilationResult(null);
                  setCompilationError(null);
                }}
                className="px-2 py-0.5 rounded bg-canvas hover:bg-canvas/80 border border-border text-[11px] font-medium transition-colors"
              >
                {sample.name.split(" ")[0]}
              </button>
            ))}
          </div>
        </div>

        <textarea
          id="mandate-input"
          value={mandateText}
          onChange={(e) => setMandateText(e.target.value)}
          rows={4}
          placeholder="Enter natural-language spending authorization mandate..."
          className="w-full p-3 rounded border border-border bg-canvas/30 text-ink text-sm font-sans focus:outline-none focus:ring-2 focus:ring-accent"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="target-name" className="text-xs font-semibold text-muted block mb-1">
              Policy Name (Optional)
            </label>
            <input
              id="target-name"
              type="text"
              value={targetName}
              onChange={(e) => setTargetName(e.target.value)}
              placeholder="e.g. Engineering Dev Laptops Mandate"
              className="w-full px-3 py-1.5 rounded border border-border bg-canvas/30 text-ink text-xs focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
          <div>
            <label htmlFor="mandate-currency" className="text-xs font-semibold text-muted block mb-1">
              Currency
            </label>
            <input
              id="mandate-currency"
              type="text"
              value={currency}
              maxLength={3}
              onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              placeholder="USD"
              className="w-full px-3 py-1.5 rounded border border-border bg-canvas/30 text-ink text-xs font-mono uppercase focus:outline-none focus:ring-1 focus:ring-accent"
            />
          </div>
        </div>

        {/* Compile Button with Duplicate Submission Guard */}
        <div className="flex items-center justify-between pt-2">
          <span className="text-[11px] text-muted">
            Strict compiler: never silently defaults on parsing errors.
          </span>
          <button
            type="button"
            onClick={() => void handleCompile()}
            disabled={isCompiling || !mandateText.trim()}
            className="inline-flex items-center space-x-2 px-4 py-2 rounded text-xs font-semibold bg-accent text-white hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
          >
            {isCompiling ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                <span>Compiling Policy...</span>
              </>
            ) : (
              <>
                <Sparkles className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Compile to Formal Policy</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Compilation Error Display - Never silently substitute default */}
      {compilationError && (
        <div
          role="alert"
          className="p-4 rounded border border-red-300 bg-red-50 text-red-950 text-xs space-y-1.5 shadow-xs"
        >
          <div className="flex items-center space-x-2 font-bold text-red-900">
            <ShieldAlert className="w-4 h-4 text-deny" aria-hidden="true" />
            <span>Intent Compilation Error</span>
          </div>
          <p className="leading-relaxed">{compilationError}</p>
          <div className="text-[11px] text-red-800 font-medium">
            Warrant strictly refuses to substitute a default policy when compilation fails or produces validation errors.
          </div>
        </div>
      )}

      {/* Compilation Result */}
      {compilationResult && (
        <div className="space-y-6">
          {/* Clarifying Questions / Ambiguity Banner */}
          {compilationResult.questions.length > 0 && (
            <div
              role="alert"
              className="p-4 rounded border border-amber-300 bg-amber-50 text-amber-950 text-xs space-y-2 shadow-xs"
            >
              <div className="flex items-center space-x-2 font-bold text-amber-900">
                <HelpCircle className="w-4 h-4 text-amber-800" aria-hidden="true" />
                <span>Clarifying Questions Identified ({compilationResult.questions.length})</span>
              </div>
              <p className="text-[11px] text-amber-900">
                The compiler identified semantic ambiguity in the purchase mandate. Clarify these conditions before authorizing spending:
              </p>
              <ul className="list-disc list-inside space-y-1 text-xs text-amber-950 pl-1">
                {compilationResult.questions.map((q, idx) => (
                  <li key={idx} className="leading-relaxed">
                    {q}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Compiler Assumptions Banner */}
          {compilationResult.assumptions.length > 0 && (
            <div className="p-3.5 rounded border border-border bg-canvas/40 text-xs space-y-1">
              <span className="font-bold text-[11px] uppercase tracking-wider text-muted block">
                Compiler Deductions & Assumptions
              </span>
              <ul className="list-disc list-inside space-y-1 text-muted text-xs pl-1">
                {compilationResult.assumptions.map((a, idx) => (
                  <li key={idx}>{a}</li>
                ))}
              </ul>
            </div>
          )}

          {/* Policy Preview Card */}
          <div className="p-5 md:p-6 rounded-panel border border-border bg-surface space-y-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border pb-3">
              <div className="flex items-center space-x-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-700" aria-hidden="true" />
                <div>
                  <h3 className="font-bold text-sm text-ink">
                    {compilationResult.confirmedIntent.name}
                  </h3>
                  <span className="text-[11px] text-muted font-mono">
                    Schema v{compilationResult.candidatePolicy.schemaVersion} • Currency: {compilationResult.candidatePolicy.currency}
                  </span>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-emerald-100 text-emerald-950 border border-emerald-300">
                  Candidate Validated
                </span>
                <span className="text-[10px] text-muted font-mono">
                  {compilationResult.compilerMetadata.deterministic ? "Deterministic" : "Stochastic"}
                </span>
              </div>
            </div>

            {/* Limits & Ceilings Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div className="p-3 rounded border border-border bg-canvas/40 space-y-1">
                <div className="text-muted text-[11px] uppercase tracking-wider font-medium">Max Item Price</div>
                <div className="text-base font-bold font-mono text-ink">
                  {compilationResult.candidatePolicy.maxItemPriceMinor !== undefined
                    ? `$${(compilationResult.candidatePolicy.maxItemPriceMinor / 100).toFixed(2)}`
                    : "No Limit"}
                </div>
                <div className="text-[10px] text-muted">Per single item</div>
              </div>

              <div className="p-3 rounded border border-border bg-canvas/40 space-y-1">
                <div className="text-muted text-[11px] uppercase tracking-wider font-medium">Max Cart Total</div>
                <div className="text-base font-bold font-mono text-ink">
                  {compilationResult.candidatePolicy.maxCartTotalMinor !== undefined
                    ? `$${(compilationResult.candidatePolicy.maxCartTotalMinor / 100).toFixed(2)}`
                    : "Unbounded (Warning)"}
                </div>
                <div className="text-[10px] text-muted">Cumulative cart limit</div>
              </div>

              <div className="p-3 rounded border border-border bg-canvas/40 space-y-1">
                <div className="text-muted text-[11px] uppercase tracking-wider font-medium">Evidence Required</div>
                <div className="text-base font-bold text-ink">
                  {compilationResult.candidatePolicy.requireEvidence ? "Strict Quotes" : "Optional"}
                </div>
                <div className="text-[10px] text-muted">Vendor quotation check</div>
              </div>

              <div className="p-3 rounded border border-border bg-canvas/40 space-y-1">
                <div className="text-muted text-[11px] uppercase tracking-wider font-medium">Allowed Categories</div>
                <div className="text-base font-bold font-mono text-ink">
                  {(compilationResult.candidatePolicy.allowedCategories ?? []).length}
                </div>
                <div className="text-[10px] text-muted">Explicit whitelists</div>
              </div>
            </div>

            {/* Allowed & Prohibited Categories */}
            <div className="space-y-3 text-xs">
              <div>
                <span className="font-semibold text-muted text-[11px] uppercase tracking-wider block mb-1">
                  Allowed Categories Whitelist:
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {(compilationResult.candidatePolicy.allowedCategories ?? []).map((cat, i) => (
                    <span
                      key={i}
                      className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-950 border border-emerald-300 font-medium text-[11px]"
                    >
                      ✓ {cat}
                    </span>
                  ))}
                </div>
              </div>

              {(compilationResult.candidatePolicy.prohibitedCategories ?? []).length > 0 && (
                <div>
                  <span className="font-semibold text-muted text-[11px] uppercase tracking-wider block mb-1">
                    Prohibited Categories Blacklist:
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {(compilationResult.candidatePolicy.prohibitedCategories ?? []).map((cat, i) => (
                      <span
                        key={i}
                        className="px-2 py-0.5 rounded bg-red-50 text-red-950 border border-red-300 font-medium text-[11px]"
                      >
                        ✕ {cat}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Save Status / Error */}
            {saveError && (
              <div className="p-3 rounded bg-red-50 border border-red-200 text-xs text-red-900">
                {saveError}
              </div>
            )}
            {savedPolicy && (
              <div className="p-3 rounded bg-emerald-50 border border-emerald-300 text-xs text-emerald-950 flex items-center space-x-2">
                <Check className="w-4 h-4 text-emerald-700 shrink-0" aria-hidden="true" />
                <span>
                  Policy version saved successfully! Policy ID: <code className="font-mono">{savedPolicy.policyId}</code> (v{savedPolicy.versionNumber})
                </span>
              </div>
            )}

            {/* Action Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-border">
              <span className="text-[11px] text-muted flex items-center space-x-1">
                <AlertTriangle className="w-3.5 h-3.5 text-amber-800" aria-hidden="true" />
                <span>Requires verification test before deployment or approval.</span>
              </span>

              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => void handleSavePolicy()}
                  disabled={isSaving || savedPolicy !== null}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs font-semibold border border-border bg-surface hover:bg-canvas disabled:opacity-50 transition-colors"
                >
                  {isSaving ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <Save className="w-3.5 h-3.5 text-muted" aria-hidden="true" />
                  )}
                  <span>{savedPolicy ? "Version Persisted" : "Save as Policy"}</span>
                </button>

                <button
                  type="button"
                  onClick={handleSendToVerification}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded text-xs font-semibold bg-accent text-white hover:bg-accent/90 transition-colors shadow-xs"
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
  );
}
