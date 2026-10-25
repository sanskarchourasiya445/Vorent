import { createContext, useContext, useEffect, useState, useMemo, type ReactNode } from "react";

export type Theme = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

interface ThemeContextValue {
  theme: Theme;
  resolvedTheme: ResolvedTheme;
  setTheme: (theme: Theme) => void;
  toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

const THEME_STORAGE_KEY = "warrant_theme";

function getSystemTheme(): ResolvedTheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "dark";
  try {
    return window.matchMedia("(prefers-color-scheme: dark)")?.matches ? "dark" : "light";
  } catch {
    return "dark";
  }
}

function getInitialTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    if (typeof localStorage !== "undefined" && typeof localStorage?.getItem === "function") {
      const stored = localStorage.getItem(THEME_STORAGE_KEY);
      if (stored === "light" || stored === "dark" || stored === "system") {
        return stored;
      }
    }
  } catch {
    // Fallback if localStorage access is restricted in environment
  }
  return "dark"; // Default to dark (Midnight Navy + Emerald)
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);

  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => {
    if (theme === "system") return getSystemTheme();
    return theme;
  });

  // Keep resolvedTheme and document attributes in sync
  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    if (!root) return;

    const resolved: ResolvedTheme = theme === "system" ? getSystemTheme() : theme;
    setResolvedTheme(resolved);

    if (resolved === "dark") {
      root.classList.add("dark");
      root.classList.remove("light");
      root.setAttribute("data-theme", "dark");
    } else {
      root.classList.remove("dark");
      root.classList.add("light");
      root.setAttribute("data-theme", "light");
    }
  }, [theme]);

  // Listen for system theme changes if theme is "system"
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    let mediaQuery: MediaQueryList | undefined;
    try {
      mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    } catch {
      return;
    }

    const handleChange = () => {
      if (theme === "system") {
        const sys = mediaQuery?.matches ? "dark" : "light";
        setResolvedTheme(sys);
        if (typeof document !== "undefined") {
          const root = document.documentElement;
          if (root) {
            if (sys === "dark") {
              root.classList.add("dark");
              root.classList.remove("light");
              root.setAttribute("data-theme", "dark");
            } else {
              root.classList.remove("dark");
              root.classList.add("light");
              root.setAttribute("data-theme", "light");
            }
          }
        }
      }
    };

    mediaQuery?.addEventListener?.("change", handleChange);
    return () => mediaQuery?.removeEventListener?.("change", handleChange);
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    setThemeState(newTheme);
    try {
      if (typeof localStorage !== "undefined" && typeof localStorage?.setItem === "function") {
        localStorage.setItem(THEME_STORAGE_KEY, newTheme);
      }
    } catch {
      // Ignore storage errors in restricted contexts
    }
  };

  const toggleTheme = () => {
    if (resolvedTheme === "dark") {
      setTheme("light");
    } else {
      setTheme("dark");
    }
  };

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
      toggleTheme,
    }),
    [theme, resolvedTheme],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
