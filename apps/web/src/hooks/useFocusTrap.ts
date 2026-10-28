import { useEffect, useRef } from "react";

/**
 * Custom hook to trap keyboard focus within a modal dialog and restore focus upon dismissal.
 * Conforms to WCAG 2.2 Level AA requirements for dialog focus management (Criteria 2.1.2 & 2.4.3).
 */
export function useFocusTrap(isActive: boolean, onEscape?: () => void) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isActive) return;

    const previousActiveElement = document.activeElement as HTMLElement | null;
    const container = containerRef.current;
    if (!container) return;

    const focusableSelector =
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    // Auto-focus first interactive element inside container after mount
    const timer = setTimeout(() => {
      const focusableElements = Array.from(
        container.querySelectorAll<HTMLElement>(focusableSelector)
      );
      if (focusableElements.length > 0) {
        focusableElements[0].focus();
      }
    }, 20);

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && onEscape) {
        e.stopPropagation();
        onEscape();
        return;
      }

      if (e.key !== "Tab") return;

      const currentFocusables = Array.from(
        container.querySelectorAll<HTMLElement>(focusableSelector)
      );
      if (currentFocusables.length === 0) return;

      const firstElement = currentFocusables[0];
      const lastElement = currentFocusables[currentFocusables.length - 1];

      if (e.shiftKey) {
        // Shift + Tab: Wrap from first to last
        if (document.activeElement === firstElement || document.activeElement === container) {
          e.preventDefault();
          lastElement.focus();
        }
      } else {
        // Tab: Wrap from last to first
        if (document.activeElement === lastElement) {
          e.preventDefault();
          firstElement.focus();
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      clearTimeout(timer);
      window.removeEventListener("keydown", handleKeyDown);
      previousActiveElement?.focus?.();
    };
  }, [isActive, onEscape]);

  return containerRef;
}
