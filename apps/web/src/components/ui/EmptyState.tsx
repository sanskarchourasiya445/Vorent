import React from "react";
import { cn } from "../../lib/utils";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: {
    label: string;
    onClick: () => void;
  };
  className?: string;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "p-8 rounded-panel border border-dashed border-slate-200 dark:border-border bg-slate-50/50 dark:bg-surface-inset text-center flex flex-col items-center justify-center space-y-3",
        className
      )}
    >
      {icon && <div className="text-slate-400 dark:text-muted">{icon}</div>}
      <div className="space-y-1 max-w-sm">
        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 dark:text-ink">{title}</h4>
        {description && <p className="text-xs text-slate-500 dark:text-muted leading-relaxed">{description}</p>}
      </div>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="mt-2 inline-flex items-center px-3 py-1.5 rounded-md text-xs font-semibold bg-accent text-white hover:bg-accent-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 transition-colors shadow-xs"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
