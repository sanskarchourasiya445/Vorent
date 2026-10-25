import { useState } from "react";
import type { PolicyOption, SearchDimension, VerificationConfig } from "../../types/verification";
import { Sliders, Shield, Play, RotateCcw, Server, AlertCircle } from "lucide-react";

interface VerificationConfigFormProps {
  policies: PolicyOption[];
  onStartRun: (config: VerificationConfig, useDemoSimulation?: boolean) => void;
  isRunning: boolean;
  initialPolicyId?: string;
}

const DIMENSION_OPTIONS: Array<{
  id: SearchDimension;
  label: string;
  description: string;
}> = [
  {
    id: "PRICE_BOUNDARIES",
    label: "Price Boundary Probing",
    description: "Tests unit prices and cart totals at +/- $0.01 around authorized limits.",
  },
  {
    id: "QUANTITY_SPLITS",
    label: "Quantity Splitting & Bundles",
    description: "Checks if multi-unit quantities evade per-item limits while violating cart caps.",
  },
  {
    id: "CATEGORY_EVASION",
    label: "Category Taxonomy Drift",
    description: "Probes unverified and borderline catalog categories against policy lists.",
  },
  {
    id: "EVIDENCE_FRESHNESS",
    label: "Evidence Freshness & Quotes",
    description: "Evaluates behavior under stale merchant quotes and missing attribute payloads.",
  },
  {
    id: "CURRENCY_MUTATION",
    label: "Currency Boundary Mutations",
    description: "Tests ISO-4217 currency mismatches and cross-currency symbol variations.",
  },
];

const BUDGET_PRESETS = [100, 250, 500, 1000];

export function VerificationConfigForm({
  policies,
  onStartRun,
  isRunning,
  initialPolicyId,
}: VerificationConfigFormProps) {
  const [selectedPolicyId, setSelectedPolicyId] = useState<string>(
    initialPolicyId || policies[0]?.id || "pol_v1_books_hardware",
  );
  const [selectedDimensions, setSelectedDimensions] = useState<SearchDimension[]>([
    "PRICE_BOUNDARIES",
    "QUANTITY_SPLITS",
    "CATEGORY_EVASION",
    "EVIDENCE_FRESHNESS",
  ]);
  const [candidateBudget, setCandidateBudget] = useState<number>(250);
  const [useDemoSimulation, setUseDemoSimulation] = useState<boolean>(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [showAutomatedTests, setShowAutomatedTests] = useState<boolean>(false);

  const isAutomatedTestPolicy = (pol: PolicyOption) => {
    const name = pol.name.toLowerCase();
    const id = pol.id.toLowerCase();
    return (
      name.includes("testing error") ||
      name.includes("integration test policy") ||
      name.includes("test concurrent") ||
      name.includes("test rollback") ||
      name.includes("test d-014") ||
      id.startsWith("test_")
    );
  };

  const curatedPolicies = policies.filter((p) => !isAutomatedTestPolicy(p));
  const testPolicies = policies.filter(isAutomatedTestPolicy);

  const selectedPolicy = policies.find((p) => p.id === selectedPolicyId);

  const toggleDimension = (dim: SearchDimension) => {
    if (isRunning) return;
    setValidationError(null);
    setSelectedDimensions((prev) =>
      prev.includes(dim) ? prev.filter((d) => d !== dim) : [...prev, dim],
    );
  };

  const handleReset = () => {
    if (isRunning) return;
    setValidationError(null);
    setSelectedDimensions([
      "PRICE_BOUNDARIES",
      "QUANTITY_SPLITS",
      "CATEGORY_EVASION",
      "EVIDENCE_FRESHNESS",
    ]);
    setCandidateBudget(250);
    setUseDemoSimulation(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (isRunning) return; // Prevent duplicate run submissions
    setValidationError(null);

    if (!selectedPolicy) {
      setValidationError("Please select an active policy manifest.");
      return;
    }

    if (selectedDimensions.length === 0) {
      setValidationError("Please select at least one search dimension to probe.");
      return;
    }

    if (!candidateBudget || candidateBudget < 10 || candidateBudget > 10000) {
      setValidationError("Candidate budget must be between 10 and 10,000.");
      return;
    }

    onStartRun(
      {
        policyVersionId: selectedPolicy.id,
        policyHash: selectedPolicy.hash,
        dimensions: selectedDimensions,
        candidateBudget,
      },
      useDemoSimulation,
    );
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="p-5 md:p-6 rounded-lg border border-border bg-surface space-y-6 shadow-2xs"
      aria-label="Verification Run Configuration"
    >
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center space-x-2">
          <Sliders className="w-5 h-5 text-accent" aria-hidden="true" />
          <h2 className="font-semibold text-base text-ink">Verification Run Configuration</h2>
        </div>
        <button
          type="button"
          onClick={handleReset}
          disabled={isRunning}
          className="text-xs text-muted hover:text-ink flex items-center space-x-1 transition-colors focus:outline-none focus:ring-2 focus:ring-accent/30 rounded p-1"
          title="Reset to default verification parameters"
        >
          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
          <span>Reset</span>
        </button>
      </div>

      {/* Policy Selection */}
      <div className="space-y-2 font-sans">
        <div className="flex items-center justify-between">
          <label htmlFor="policy-select" className="block text-xs font-semibold text-ink">
            Target Policy &amp; Version
          </label>
          <label htmlFor="toggle-test-policies-checkbox" className="inline-flex items-center space-x-2 px-2.5 py-1 rounded-md text-[11px] font-sans border border-border bg-canvas text-ink cursor-pointer hover:border-accent transition-colors select-none">
            <input
              id="toggle-test-policies-checkbox"
              name="showAutomatedTests"
              type="checkbox"
              checked={showAutomatedTests}
              onChange={(e) => setShowAutomatedTests(e.target.checked)}
              className="rounded border-border text-accent focus:ring-accent w-3.5 h-3.5"
              data-testid="toggle-test-policies-btn"
              aria-label="Toggle automated test run policies visibility"
            />
            <span>
              {!showAutomatedTests
                ? `Showing ${curatedPolicies.length} policies (${testPolicies.length} test policies hidden)`
                : `Showing all ${policies.length} policies (including ${testPolicies.length} test policies)`}
            </span>
          </label>
        </div>
        <select
          id="policy-select"
          name="policyId"
          value={selectedPolicyId}
          onChange={(e) => setSelectedPolicyId(e.target.value)}
          disabled={isRunning}
          className="w-full bg-canvas border border-border rounded-md p-2.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent transition-all font-sans cursor-pointer"
        >
          {!showAutomatedTests ? (
            (curatedPolicies.length > 0 ? curatedPolicies : policies).map((pol) => (
              <option key={pol.id} value={pol.id}>
                {pol.name} ({pol.id} v{pol.version})
              </option>
            ))
          ) : (
            <>
              <optgroup label="Standard Curated Policies">
                {curatedPolicies.map((pol) => (
                  <option key={pol.id} value={pol.id}>
                    {pol.name} ({pol.id} v{pol.version})
                  </option>
                ))}
              </optgroup>
              <optgroup label="Automated Test Run Policies">
                {testPolicies.map((pol) => (
                  <option key={pol.id} value={pol.id}>
                    {pol.name} ({pol.id} v{pol.version})
                  </option>
                ))}
              </optgroup>
            </>
          )}
        </select>
        {selectedPolicy && (
          <div className="p-2.5 rounded-md bg-canvas/40 border border-border text-xs space-y-1">
            <div className="flex items-center space-x-1.5 text-muted">
              <Shield className="w-3.5 h-3.5 text-accent shrink-0" aria-hidden="true" />
              <span className="font-mono text-[11px] text-ink font-semibold truncate">
                SHA-256: {selectedPolicy.hash}
              </span>
            </div>
            <div className="text-muted text-[11px] font-sans">{selectedPolicy.limitsSummary}</div>
          </div>
        )}
      </div>

      {/* Search Dimensions */}
      <fieldset className="space-y-2.5 font-sans">
        <legend className="text-xs font-semibold text-ink block mb-1">
          Search Dimensions ({selectedDimensions.length} Selected)
        </legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {DIMENSION_OPTIONS.map((dim) => {
            const isChecked = selectedDimensions.includes(dim.id);
            return (
              <label
                key={dim.id}
                htmlFor={`dimension-${dim.id}`}
                className={`flex items-start space-x-3 p-3 rounded-md border text-xs cursor-pointer transition-all ${
                  isChecked
                    ? "border-accent bg-accent/5 text-ink"
                    : "border-border bg-canvas text-muted hover:border-border/80"
                } ${isRunning ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                <input
                  id={`dimension-${dim.id}`}
                  type="checkbox"
                  name="search_dimension"
                  value={dim.id}
                  checked={isChecked}
                  onChange={() => toggleDimension(dim.id)}
                  disabled={isRunning}
                  className="mt-0.5 rounded border-border text-accent focus:ring-accent"
                />
                <div className="space-y-0.5">
                  <div className="font-semibold text-ink">{dim.label}</div>
                  <div className="text-[11px] text-muted leading-tight">{dim.description}</div>
                </div>
              </label>
            );
          })}
        </div>
      </fieldset>

      {/* Candidate Exploration Budget */}
      <div className="space-y-2 font-sans">
        <div className="flex items-center justify-between">
          <label htmlFor="budget-slider" className="text-xs font-semibold text-ink">
            Maximum Candidate Budget
          </label>
          <span className="font-mono text-xs font-bold text-accent bg-accent/10 px-2 py-0.5 rounded border border-accent/20">
            {candidateBudget} Candidates
          </span>
        </div>
        <input
          id="budget-slider"
          name="candidateBudget"
          type="range"
          min={50}
          max={1000}
          step={50}
          value={candidateBudget}
          onChange={(e) => setCandidateBudget(Number(e.target.value))}
          disabled={isRunning}
          className="w-full accent-accent cursor-pointer disabled:cursor-not-allowed"
          aria-valuemin={50}
          aria-valuemax={1000}
          aria-valuenow={candidateBudget}
        />
        <div className="flex items-center justify-between text-[11px] text-muted">
          <span>Preset options:</span>
          <div className="flex space-x-1.5">
            {BUDGET_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => setCandidateBudget(preset)}
                disabled={isRunning}
                className={`px-2 py-0.5 rounded border text-[10px] font-mono transition-colors ${
                  candidateBudget === preset
                    ? "bg-accent text-white border-accent font-bold"
                    : "bg-surface border-border text-muted hover:text-ink hover:border-border/80"
                }`}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Validation Error Alert */}
      {validationError && (
        <div
          role="alert"
          className="p-3 rounded-md bg-deny/10 border border-deny/30 text-xs text-deny-border flex items-center space-x-2 font-mono"
        >
          <AlertCircle className="w-4 h-4 text-deny shrink-0" aria-hidden="true" />
          <span>{validationError}</span>
        </div>
      )}

      {/* Execution Mode Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-md bg-canvas/40 border border-border text-xs">
        <div className="space-y-0.5">
          <div className="font-semibold text-ink flex items-center space-x-1.5 font-mono">
            <Server className="w-3.5 h-3.5 text-accent" aria-hidden="true" />
            <span>Target Engine Mode</span>
          </div>
          <div className="text-muted text-[11px] font-mono">
            {useDemoSimulation
              ? "Offline Simulation (isolated illustrative demo fixture)"
              : "Live Backend API (dispatches to POST /api/verification/run)"}
          </div>
        </div>
        <label htmlFor="use-demo-simulation-checkbox" className="flex items-center space-x-2 cursor-pointer text-xs self-start sm:self-auto font-mono">
          <input
            id="use-demo-simulation-checkbox"
            name="useDemoSimulation"
            type="checkbox"
            checked={useDemoSimulation}
            onChange={(e) => setUseDemoSimulation(e.target.checked)}
            disabled={isRunning}
            className="rounded border-border text-accent focus:ring-accent"
          />
          <span className="text-muted font-medium">Use Offline Simulation</span>
        </label>
      </div>

      {/* Action Button */}
      <div className="pt-3 border-t border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="text-xs text-muted font-mono">
          {selectedDimensions.length === 0 ? (
            <span className="text-deny font-medium">Select at least one search dimension</span>
          ) : (
            <span>Ready to explore bounded search space</span>
          )}
        </div>
        <button
          type="submit"
          disabled={isRunning || selectedDimensions.length === 0}
          className="w-full sm:w-auto inline-flex items-center justify-center space-x-2 px-5 py-2.5 rounded-md font-semibold text-xs text-white bg-accent hover:opacity-90 active:opacity-100 disabled:opacity-50 disabled:cursor-not-allowed shadow-2xs transition-all focus:outline-none focus:ring-2 focus:ring-accent/30 font-mono shrink-0"
        >
          <Play className={`w-4 h-4 ${isRunning ? "animate-pulse" : ""}`} aria-hidden="true" />
          <span>{isRunning ? "Running Verification..." : "Start Verification Run"}</span>
        </button>
      </div>
    </form>
  );
}
