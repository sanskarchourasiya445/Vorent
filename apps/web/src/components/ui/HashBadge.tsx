import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { cn } from "../../lib/utils";

interface HashBadgeProps {
  hash: string;
  prefixLength?: number;
  suffixLength?: number;
  label?: string;
  className?: string;
  showCopy?: boolean;
}

export function HashBadge({
  hash,
  prefixLength = 8,
  suffixLength = 6,
  label,
  className,
  showCopy = true,
}: HashBadgeProps) {
  const [copied, setCopied] = useState(false);

  if (!hash) return null;

  const isShort = hash.length <= prefixLength + suffixLength;
  const displayHash = isShort
    ? hash
    : `${hash.slice(0, prefixLength)}...${hash.slice(-suffixLength)}`;

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  return (
    <span
      className={cn(
        "inline-flex items-center space-x-1.5 px-2 py-0.5 rounded font-mono tabular-nums text-[11px] bg-slate-100/80 border border-slate-200 text-slate-800 dark:bg-surface-inset dark:border-border dark:text-ink group hover:border-blue-400 dark:hover:border-accent/40 hover:bg-slate-100 dark:hover:bg-surface-subtle transition-colors select-all whitespace-nowrap shrink-0",
        className
      )}
      title={`Full identifier: ${hash}`}
    >
      {label && <span className="font-sans text-[10px] uppercase font-semibold text-slate-500 dark:text-muted select-none">{label}:</span>}
      <span className="text-slate-900 dark:text-ink font-medium">{displayHash}</span>
      {showCopy && (
        <button
          type="button"
          onClick={handleCopy}
          className="text-slate-400 hover:text-slate-700 dark:text-muted dark:hover:text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-accent rounded p-0.5 transition-colors select-none"
          title={copied ? "Copied full identifier!" : "Copy full identifier"}
          aria-label={copied ? "Copied" : "Copy identifier"}
        >
          {copied ? (
            <Check className="w-3 h-3 text-emerald-600 dark:text-emerald-400 animate-in fade-in" />
          ) : (
            <Copy className="w-3 h-3 opacity-60 group-hover:opacity-100" />
          )}
        </button>
      )}
    </span>
  );
}
