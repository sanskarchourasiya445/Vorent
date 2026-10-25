import { AlertCircle, Sliders, Clock, Database, Tag } from "lucide-react";
import type { BoundedSearchLimits } from "../../types/evaluation";

interface BoundedSearchLimitsCardProps {
  limits: BoundedSearchLimits;
}

export function BoundedSearchLimitsCard({ limits }: BoundedSearchLimitsCardProps) {
  return (
    <div
      className="border border-border rounded-panel bg-surface p-5 shadow-sm space-y-4"
      data-testid="bounded-search-limits-card"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-border/70 pb-3">
        <div className="flex items-center space-x-2.5">
          <Sliders className="w-4 h-4 text-accent" aria-hidden="true" />
          <h3 className="text-sm font-bold text-ink tracking-tight">
            Bounded Search Space Specification & Scope (NFR-010)
          </h3>
        </div>
        <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-muted/20 text-muted border border-border">
          {`Domain v${limits.domainVersion}`}
        </span>
      </div>

      {/* Grid of parameters */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
        <div className="p-3 rounded bg-canvas border border-border/60">
          <div className="flex items-center space-x-1.5 text-muted text-[11px] font-medium uppercase tracking-wider mb-1">
            <Tag className="w-3 h-3 text-muted" aria-hidden="true" />
            <span>Declared Categories</span>
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {limits.declaredCategories.map((c) => (
              <span
                key={c}
                className="px-1.5 py-0.5 rounded bg-surface border border-border text-[10px] font-mono text-ink"
              >
                {c}
              </span>
            ))}
          </div>
        </div>

        <div className="p-3 rounded bg-canvas border border-border/60">
          <div className="flex items-center space-x-1.5 text-muted text-[11px] font-medium uppercase tracking-wider mb-1">
            <Database className="w-3 h-3 text-muted" aria-hidden="true" />
            <span>Price Points</span>
          </div>
          <div className="flex flex-wrap gap-1 mt-1">
            {limits.pricePointsMinor.map((p) => (
              <span
                key={p}
                className="px-1.5 py-0.5 rounded bg-surface border border-border text-[10px] font-mono text-ink"
              >
                {`$${(p / 100).toFixed(2)}`}
              </span>
            ))}
          </div>
        </div>

        <div className="p-3 rounded bg-canvas border border-border/60">
          <div className="flex items-center space-x-1.5 text-muted text-[11px] font-medium uppercase tracking-wider mb-1">
            <Sliders className="w-3 h-3 text-muted" aria-hidden="true" />
            <span>Server Clamping Limits</span>
          </div>
          <div className="mt-1 space-y-0.5 font-mono text-[11px] text-ink">
            <div>
              <span className="text-muted">Budget Cap: </span>
              <span className="font-semibold">{`${limits.candidateCap} candidates`}</span>
            </div>
            <div>
              <span className="text-muted">Max Limit: </span>
              <span>2,000 (Server-clamped)</span>
            </div>
          </div>
        </div>

        <div className="p-3 rounded bg-canvas border border-border/60">
          <div className="flex items-center space-x-1.5 text-muted text-[11px] font-medium uppercase tracking-wider mb-1">
            <Clock className="w-3 h-3 text-muted" aria-hidden="true" />
            <span>Execution Envelope</span>
          </div>
          <div className="mt-1 space-y-0.5 font-mono text-[11px] text-ink">
            <div>
              <span className="text-muted">Max Timeout: </span>
              <span className="font-semibold">{`${limits.serverMaxTimeoutMs}ms`}</span>
            </div>
            <div>
              <span className="text-muted">Stop Reason: </span>
              <span className="font-semibold text-accent">{limits.stopReason || "DOMAIN_EXHAUSTED"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Honest Limitations Callout */}
      <div className="p-3.5 rounded bg-amber-50/60 border border-amber-200/80 text-xs text-amber-950 space-y-2">
        <div className="flex items-center space-x-2 font-bold text-amber-900 text-xs">
          <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" aria-hidden="true" />
          <span>Formal Scope Limitations & Safety Governance Disclosures</span>
        </div>
        <ul className="list-disc pl-5 space-y-1 text-[11px] text-amber-900/90 leading-relaxed">
          {limits.knownLimitations.map((limitation, idx) => (
            <li key={idx}>{limitation}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
