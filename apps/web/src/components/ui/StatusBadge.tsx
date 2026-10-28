import { cn } from "../../lib/utils";

export type StatusVariant =
  | "ALLOW"
  | "DENY"
  | "REVIEW"
  | "CRITICAL"
  | "HIGH"
  | "MEDIUM"
  | "LOW"
  | "RESOLVED"
  | "ACCEPTED_RISK"
  | "OPEN"
  | "ACTIVE"
  | "EXPIRED"
  | "REVOKED"
  | "CAPTURED"
  | "PENDING"
  | "FAILED"
  | "SANDBOX"
  | "LIVE"
  | "STANDBY"
  | "UNKNOWN_REQUIRES_RECONCILIATION";

interface StatusBadgeProps {
  status: string;
  variant?: StatusVariant;
  size?: "sm" | "md";
  className?: string;
  showDot?: boolean;
}

export function StatusBadge({
  status,
  variant,
  size = "md",
  className,
  showDot = false,
}: StatusBadgeProps) {
  const normalized = (variant || status).toUpperCase();

  const getStyle = (s: string) => {
    switch (s) {
      case "ALLOW":
      case "ACTIVE":
      case "RESOLVED":
      case "CAPTURED":
      case "LIVE":
        return {
          container: "bg-emerald-50 text-emerald-950 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-200 dark:border-emerald-800",
          dot: "bg-emerald-600 dark:bg-emerald-400",
        };
      case "DENY":
      case "CRITICAL":
      case "HIGH":
      case "FAILED":
      case "REVOKED":
      case "UNKNOWN_REQUIRES_RECONCILIATION":
        return {
          container: "bg-red-50 text-red-950 border-red-300 dark:bg-red-950/60 dark:text-red-200 dark:border-red-800",
          dot: "bg-red-600 dark:bg-red-400",
        };
      case "REVIEW":
      case "MEDIUM":
      case "ACCEPTED_RISK":
      case "SANDBOX":
        return {
          container: "bg-amber-50 text-amber-950 border-amber-300 dark:bg-amber-950/60 dark:text-amber-200 dark:border-amber-800",
          dot: "bg-amber-600 dark:bg-amber-400",
        };
      case "EXPIRED":
        return {
          container: "bg-slate-100 text-slate-800 border-slate-300 dark:bg-slate-900/60 dark:text-slate-200 dark:border-slate-700",
          dot: "bg-slate-500 dark:bg-slate-400",
        };
      case "LOW":
      case "PENDING":
      case "STANDBY":
      case "OPEN":
      default:
        return {
          container: "bg-slate-50 text-slate-800 border-slate-300 dark:bg-slate-900/40 dark:text-slate-300 dark:border-slate-800",
          dot: "bg-slate-500 dark:bg-slate-400",
        };
    }
  };

  const style = getStyle(normalized);

  return (
    <span
      className={cn(
        "inline-flex items-center space-x-1.5 rounded font-mono uppercase font-bold tracking-wider border whitespace-nowrap shrink-0",
        size === "sm" ? "text-[10px] px-1.5 py-0.5" : "text-[11px] px-2 py-0.5",
        style.container,
        className
      )}
    >
      {showDot && <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", style.dot)} />}
      <span>{status}</span>
    </span>
  );
}
