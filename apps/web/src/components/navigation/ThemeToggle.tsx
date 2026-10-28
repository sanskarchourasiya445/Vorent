import { useState, useRef, useEffect } from "react";
import { useTheme } from "../../providers/ThemeProvider";
import { Sun, Moon, Laptop, Check } from "lucide-react";

export function ThemeToggle() {
  const { theme, resolvedTheme, setTheme, toggleTheme } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click or escape
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const themeLabel =
    theme === "system"
      ? `System (${resolvedTheme === "dark" ? "Dark" : "Light"})`
      : theme === "dark"
      ? "Dark (Midnight Navy)"
      : "Light (Forest Green)";

  return (
    <div ref={containerRef} className="relative inline-flex items-center">
      {/* Primary Compact Icon Toggle Button */}
      <button
        type="button"
        onClick={() => toggleTheme()}
        onContextMenu={(e) => {
          e.preventDefault();
          setIsOpen((prev) => !prev);
        }}
        title={`Theme: ${themeLabel}. Click to toggle, right-click for options.`}
        aria-label={`Switch theme (currently ${themeLabel})`}
        className="inline-flex items-center justify-center w-8 h-8 rounded-md bg-surface-inset hover:bg-surface-subtle active:bg-surface-inset border border-border text-ink cursor-pointer transition-colors duration-150 ease-out focus:outline-none focus:ring-1 focus:ring-accent select-none shadow-2xs"
      >
        {resolvedTheme === "dark" ? (
          <Moon className="w-4 h-4 text-primary transition-transform duration-200" aria-hidden="true" />
        ) : (
          <Sun className="w-4 h-4 text-brass transition-transform duration-200" aria-hidden="true" />
        )}
        <span className="sr-only">Toggle theme</span>
      </button>

      {/* Small secondary trigger for menu options (accessible to touch/keyboard) */}
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        title="Theme preferences menu"
        aria-label="Theme preferences options"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        className="sr-only sm:not-sr-only -ml-1 inline-flex items-center justify-center w-4 h-8 text-muted hover:text-ink focus:outline-none focus:ring-1 focus:ring-accent rounded-r-md cursor-pointer"
      >
        <span className="text-[9px] select-none">▾</span>
      </button>

      {/* Dropdown Menu for Light / Dark / System */}
      {isOpen && (
        <div
          role="menu"
          aria-label="Select color theme"
          className="absolute right-0 top-full mt-1.5 w-48 rounded-lg bg-surface border border-border shadow-lg p-1 z-50 text-xs font-sans motion-enter"
        >
          <div className="px-2.5 py-1.5 text-[10px] font-mono text-muted uppercase tracking-wider border-b border-border/60">
            Appearance
          </div>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setTheme("dark");
              setIsOpen(false);
            }}
            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md transition-colors cursor-pointer text-left ${
              theme === "dark"
                ? "bg-primary/10 text-primary font-semibold"
                : "text-ink hover:bg-surface-subtle"
            }`}
          >
            <div className="flex items-center space-x-2">
              <Moon className="w-3.5 h-3.5 text-primary shrink-0" aria-hidden="true" />
              <span>Dark (Midnight Navy)</span>
            </div>
            {theme === "dark" && <Check className="w-3.5 h-3.5 text-primary" aria-hidden="true" />}
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setTheme("light");
              setIsOpen(false);
            }}
            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md transition-colors cursor-pointer text-left ${
              theme === "light"
                ? "bg-primary/10 text-primary font-semibold"
                : "text-ink hover:bg-surface-subtle"
            }`}
          >
            <div className="flex items-center space-x-2">
              <Sun className="w-3.5 h-3.5 text-brass shrink-0" aria-hidden="true" />
              <span>Light (Slate)</span>
            </div>
            {theme === "light" && <Check className="w-3.5 h-3.5 text-primary" aria-hidden="true" />}
          </button>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setTheme("system");
              setIsOpen(false);
            }}
            className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md transition-colors cursor-pointer text-left ${
              theme === "system"
                ? "bg-primary/10 text-primary font-semibold"
                : "text-ink hover:bg-surface-subtle"
            }`}
          >
            <div className="flex items-center space-x-2">
              <Laptop className="w-3.5 h-3.5 text-muted shrink-0" aria-hidden="true" />
              <span>System Preference</span>
            </div>
            {theme === "system" && <Check className="w-3.5 h-3.5 text-primary" aria-hidden="true" />}
          </button>
        </div>
      )}
    </div>
  );
}
