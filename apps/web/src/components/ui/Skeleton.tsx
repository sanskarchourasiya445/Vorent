import React from "react";

export type SkeletonVariant = "text" | "rectangular" | "circular" | "badge" | "button" | "card";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: SkeletonVariant;
  width?: string | number;
  height?: string | number;
  lines?: number;
  animate?: boolean;
  shimmer?: boolean;
  className?: string;
  "data-testid"?: string;
}

/**
 * Core primitive Skeleton component matching the VORENT Midnight Navy and Light Ivory design system.
 * Features GPU-accelerated shimmer sweeping and WCAG motion-reduce compliance.
 */
export function Skeleton({
  variant = "rectangular",
  width,
  height,
  lines = 1,
  animate = true,
  shimmer = true,
  className = "",
  style,
  "data-testid": testId = "skeleton",
  ...props
}: SkeletonProps) {
  const getVariantClasses = () => {
    switch (variant) {
      case "circular":
        return "rounded-full shrink-0";
      case "badge":
        return "rounded-full h-5 w-16";
      case "button":
        return "rounded-md h-8 w-24";
      case "text":
        return "rounded h-3.5 w-full";
      case "card":
        return "rounded-xl";
      case "rectangular":
      default:
        return "rounded-md";
    }
  };

  const inlineStyles: React.CSSProperties = {
    width,
    height,
    ...style,
  };

  // Multi-line text skeleton
  if (variant === "text" && lines > 1) {
    return (
      <div
        className={`space-y-2 ${className}`}
        role="status"
        aria-label="Loading content..."
        data-testid={testId}
        {...props}
      >
        {Array.from({ length: lines }).map((_, i) => {
          const lineWidth = i === lines - 1 ? "75%" : "100%";
          return (
            <div
              key={i}
              className={`relative overflow-hidden bg-surface-inset/80 border border-border/40 rounded h-3.5 ${
                animate ? "motion-safe:animate-pulse motion-reduce:animate-none" : ""
              }`}
              style={{ width: lineWidth }}
            >
              {shimmer && (
                <div
                  className="absolute inset-0 -translate-x-full animate-skeleton-shimmer bg-gradient-to-r from-transparent via-white/5 dark:via-accent/15 to-transparent pointer-events-none"
                  aria-hidden="true"
                />
              )}
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-label="Loading content..."
      data-testid={testId}
      className={`relative overflow-hidden bg-surface-inset/80 border border-border/40 ${getVariantClasses()} ${
        animate ? "motion-safe:animate-pulse motion-reduce:animate-none" : ""
      } ${className}`}
      style={inlineStyles}
      {...props}
    >
      {shimmer && (
        <div
          className="absolute inset-0 -translate-x-full animate-skeleton-shimmer bg-gradient-to-r from-transparent via-white/5 dark:via-accent/15 to-transparent pointer-events-none"
          aria-hidden="true"
        />
      )}
    </div>
  );
}

/**
 * Metric KPI Card Skeleton matching Governance Dashboard and Overview workstation cards.
 */
export function SkeletonMetricCard({ className = "" }: { className?: string }) {
  return (
    <div
      className={`bg-surface border border-border rounded-lg p-5 shadow-2xs space-y-4 ${className}`}
      role="status"
      aria-label="Loading metric..."
      data-testid="skeleton-metric-card"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2.5">
          <Skeleton variant="circular" className="w-8 h-8" />
          <div className="space-y-1">
            <Skeleton variant="text" className="w-24 h-3.5" />
            <Skeleton variant="text" className="w-16 h-2.5" />
          </div>
        </div>
        <Skeleton variant="badge" className="w-12 h-5" />
      </div>

      <div className="space-y-2 pt-1">
        <Skeleton variant="rectangular" className="w-32 h-7" />
        <Skeleton variant="text" className="w-48 h-3" />
      </div>

      <div className="pt-3 border-t border-border/50 flex items-center justify-between">
        <Skeleton variant="text" className="w-20 h-2.5" />
        <Skeleton variant="button" className="w-14 h-5 rounded" />
      </div>
    </div>
  );
}

/**
 * Reusable Card Skeleton with header, body content lines, and optional actions.
 */
export function SkeletonCard({
  className = "",
  lines = 3,
  showHeader = true,
}: {
  className?: string;
  lines?: number;
  showHeader?: boolean;
}) {
  return (
    <div
      className={`rounded-xl border border-border bg-surface p-5 shadow-2xs space-y-4 ${className}`}
      role="status"
      aria-label="Loading card content..."
      data-testid="skeleton-card"
    >
      {showHeader && (
        <div className="flex items-center justify-between pb-3 border-b border-border/50">
          <div className="flex items-center space-x-2.5">
            <Skeleton variant="circular" className="w-6 h-6" />
            <Skeleton variant="text" className="w-36 h-4" />
          </div>
          <Skeleton variant="badge" className="w-20 h-5" />
        </div>
      )}

      <div className="space-y-2.5">
        <Skeleton variant="text" lines={lines} />
      </div>

      <div className="pt-2 flex items-center justify-between">
        <Skeleton variant="text" className="w-28 h-3" />
        <Skeleton variant="button" className="w-24 h-7" />
      </div>
    </div>
  );
}

/**
 * Structured Table Skeleton for data grids, audit logs, and transaction lists.
 */
export interface SkeletonTableProps {
  columns?: number | string[];
  rows?: number;
  className?: string;
  showHeader?: boolean;
}

export function SkeletonTable({
  columns = 4,
  rows = 4,
  className = "",
  showHeader = true,
}: SkeletonTableProps) {
  const colCount = typeof columns === "number" ? columns : columns.length;
  const colHeaders = Array.isArray(columns) ? columns : null;

  return (
    <div
      className={`rounded-lg border border-border bg-surface overflow-hidden shadow-2xs ${className}`}
      role="status"
      aria-label="Loading table data..."
      data-testid="skeleton-table"
    >
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs font-sans">
          {showHeader && (
            <thead className="bg-surface-subtle border-b border-border text-[11px] font-mono text-muted uppercase tracking-wider">
              <tr>
                {Array.from({ length: colCount }).map((_, i) => (
                  <th key={i} scope="col" className="px-4 py-3">
                    {colHeaders ? (
                      colHeaders[i]
                    ) : (
                      <Skeleton variant="text" className="w-20 h-3" />
                    )}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody className="divide-y divide-border">
            {Array.from({ length: rows }).map((_, rowIdx) => (
              <tr key={rowIdx} className="hover:bg-surface-subtle/50 transition-colors">
                {Array.from({ length: colCount }).map((_, colIdx) => (
                  <td key={colIdx} className="px-4 py-3.5 whitespace-nowrap">
                    {colIdx === 0 ? (
                      <div className="flex items-center space-x-2">
                        <Skeleton variant="circular" className="w-4 h-4" />
                        <Skeleton variant="text" className="w-28 h-3.5" />
                      </div>
                    ) : colIdx === colCount - 1 ? (
                      <div className="flex items-center justify-end space-x-2">
                        <Skeleton variant="badge" className="w-16 h-5" />
                        <Skeleton variant="button" className="w-12 h-6" />
                      </div>
                    ) : (
                      <Skeleton
                        variant="text"
                        className={`${colIdx % 2 === 0 ? "w-24" : "w-36"} h-3`}
                      />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/**
 * Terminal / Code Block Skeleton for RFC 8785 JSON contracts and policy ASTs.
 */
export function SkeletonCodeBlock({
  className = "",
  lines = 6,
}: {
  className?: string;
  lines?: number;
}) {
  return (
    <div
      className={`rounded-lg border border-border bg-surface-inset p-4 font-mono text-xs space-y-2.5 overflow-hidden shadow-inner ${className}`}
      role="status"
      aria-label="Loading code contract..."
      data-testid="skeleton-code-block"
    >
      <div className="flex items-center justify-between pb-2 border-b border-border/40">
        <div className="flex items-center space-x-2">
          <span className="w-2 h-2 rounded-full bg-border" />
          <span className="w-2 h-2 rounded-full bg-border" />
          <span className="w-2 h-2 rounded-full bg-border" />
          <Skeleton variant="text" className="w-32 h-3 ml-2" />
        </div>
        <Skeleton variant="badge" className="w-14 h-4" />
      </div>

      <div className="space-y-2 pt-1">
        {Array.from({ length: lines }).map((_, i) => {
          const widths = ["45%", "80%", "65%", "90%", "50%", "70%", "60%", "30%"];
          const lineWidth = widths[i % widths.length];
          return (
            <div key={i} className="flex items-center space-x-3">
              <span className="text-[10px] text-muted/40 w-4 text-right select-none font-mono">
                {i + 1}
              </span>
              <Skeleton variant="text" className="h-3" style={{ width: lineWidth }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Findings List Skeleton matching Verification Studio and Finding Triage views.
 */
export function SkeletonFindingsList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3" role="status" aria-label="Loading findings..." data-testid="skeleton-findings-list">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg border border-border bg-surface p-4 shadow-2xs space-y-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center space-x-2.5">
              <Skeleton variant="circular" className="w-6 h-6" />
              <div className="space-y-1">
                <Skeleton variant="text" className="w-48 h-4 font-bold" />
                <Skeleton variant="text" className="w-32 h-2.5 font-mono" />
              </div>
            </div>
            <Skeleton variant="badge" className="w-20 h-5" />
          </div>

          <div className="space-y-1.5 pl-8">
            <Skeleton variant="text" lines={2} />
          </div>

          <div className="pl-8 pt-2 border-t border-border/40 flex items-center justify-between text-xs">
            <Skeleton variant="text" className="w-36 h-3" />
            <div className="flex items-center space-x-2">
              <Skeleton variant="button" className="w-16 h-6" />
              <Skeleton variant="button" className="w-20 h-6" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Approval Checkpoints Skeleton matching the Authoritative Approvals Workstation.
 */
export function SkeletonApprovalList({ count = 2 }: { count?: number }) {
  return (
    <div className="space-y-4" role="status" aria-label="Loading approvals..." data-testid="skeleton-approval-list">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-border bg-surface p-5 shadow-2xs space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-border/50">
            <div className="flex items-center space-x-2.5">
              <Skeleton variant="circular" className="w-7 h-7" />
              <div className="space-y-1">
                <Skeleton variant="text" className="w-40 h-4" />
                <Skeleton variant="text" className="w-24 h-3 font-mono" />
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <Skeleton variant="badge" className="w-24 h-5" />
              <Skeleton variant="badge" className="w-20 h-5" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-surface-inset border border-border/50 space-y-1">
              <Skeleton variant="text" className="w-16 h-2.5" />
              <Skeleton variant="rectangular" className="w-24 h-5" />
            </div>
            <div className="p-3 rounded-lg bg-surface-inset border border-border/50 space-y-1">
              <Skeleton variant="text" className="w-20 h-2.5" />
              <Skeleton variant="rectangular" className="w-28 h-5" />
            </div>
            <div className="p-3 rounded-lg bg-surface-inset border border-border/50 space-y-1">
              <Skeleton variant="text" className="w-16 h-2.5" />
              <Skeleton variant="rectangular" className="w-20 h-5" />
            </div>
          </div>

          <div className="pt-2 flex items-center justify-between">
            <Skeleton variant="text" className="w-48 h-3" />
            <Skeleton variant="button" className="w-28 h-7" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Full Dashboard Skeleton mirroring the Governance Dashboard layout.
 * Prevents Cumulative Layout Shift (CLS) while remote metrics and ledger states load.
 */
export function SkeletonDashboard({ className = "" }: { className?: string }) {
  return (
    <div
      className={`space-y-6 ${className}`}
      role="status"
      aria-label="Loading governance dashboard..."
      data-testid="skeleton-dashboard"
    >
      {/* Row 1: Exactly Three Operational KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <SkeletonMetricCard />
        <SkeletonMetricCard />
        <SkeletonMetricCard />
      </div>

      {/* Operational Posture Banner Skeleton */}
      <div className="p-4 rounded-lg border border-border bg-surface flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <Skeleton variant="circular" className="w-7 h-7" />
          <div className="space-y-1.5">
            <Skeleton variant="text" className="w-56 h-3.5" />
            <Skeleton variant="text" className="w-96 max-w-full h-2.5" />
          </div>
        </div>
        <Skeleton variant="button" className="w-28 h-7 hidden sm:block" />
      </div>

      {/* Row 2: Two-Column Main Operational Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Active Policies & AST (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="rounded-xl border border-border bg-surface p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border/50">
              <div className="flex items-center space-x-2">
                <Skeleton variant="circular" className="w-5 h-5" />
                <Skeleton variant="text" className="w-40 h-4" />
              </div>
              <Skeleton variant="badge" className="w-20 h-5" />
            </div>
            <SkeletonCodeBlock lines={5} />
            <div className="grid grid-cols-3 gap-3 pt-2">
              <Skeleton variant="rectangular" className="h-12 rounded-lg" />
              <Skeleton variant="rectangular" className="h-12 rounded-lg" />
              <Skeleton variant="rectangular" className="h-12 rounded-lg" />
            </div>
          </div>
        </div>

        {/* Right Column: Spend Reservations & Idempotency Locks (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <div className="rounded-xl border border-border bg-surface p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-border/50">
              <div className="flex items-center space-x-2">
                <Skeleton variant="circular" className="w-5 h-5" />
                <Skeleton variant="text" className="w-36 h-4" />
              </div>
              <Skeleton variant="button" className="w-16 h-6" />
            </div>
            <div className="space-y-2.5">
              <Skeleton variant="text" lines={3} />
            </div>
            <SkeletonTable columns={3} rows={3} showHeader={false} />
          </div>
        </div>
      </div>
    </div>
  );
}
