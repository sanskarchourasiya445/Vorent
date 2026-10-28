/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        chrome: "var(--color-chrome, #080B11)",
        sidebar: {
          DEFAULT: "var(--color-sidebar, #070A0F)",
          raised: "var(--color-sidebar-raised, #0F172A)",
        },
        "white-warm": "var(--color-white-warm, #F8FAFC)",
        canvas: {
          DEFAULT: "var(--color-canvas, #080B11)",
          subtle: "var(--color-canvas-subtle, #0B0F17)",
        },
        surface: {
          DEFAULT: "var(--color-surface, #111726)",
          subtle: "var(--color-surface-subtle, #0B0F17)",
          soft: "var(--color-surface-soft, #161F30)",
          raised: "var(--color-surface-raised, #1A2338)",
          inset: "var(--color-surface-inset, #0A0E17)",
          muted: "var(--color-surface-muted, #0F172A)",
        },
        card: "var(--color-card, #111726)",
        panel: "var(--color-surface-raised, #1A2338)",
        ink: {
          DEFAULT: "var(--color-ink, #F8FAFC)",
          muted: "var(--color-ink-muted, #94A3B8)",
          secondary: "var(--color-ink-secondary, #94A3B8)",
          subtle: "var(--color-ink-subtle, #64748B)",
        },
        muted: "var(--color-muted, #94A3B8)",
        border: {
          DEFAULT: "var(--color-border, #1E293B)",
          subtle: "var(--color-border-subtle, #141C2E)",
          light: "var(--color-border-light, #283548)",
          strong: "var(--color-border-strong, #334155)",
        },
        primary: {
          DEFAULT: "var(--color-primary, #0EA5E9)",
          hover: "var(--color-primary-hover, #0284C7)",
          active: "var(--color-primary-pressed, #0369A1)",
          soft: "var(--color-primary-soft, #0C253B)",
        },
        accent: {
          DEFAULT: "var(--color-accent, #0EA5E9)",
          hover: "var(--color-accent-hover, #0284C7)",
          active: "var(--color-accent-active, #0369A1)",
          subtle: "var(--color-accent-subtle, #0C253B)",
        },
        brass: {
          DEFAULT: "var(--color-brass, #D4C596)",
        },
        earth: {
          DEFAULT: "var(--color-earth, #D4C596)",
          soft: "var(--color-earth-soft, #2A2417)",
        },
        allow: {
          DEFAULT: "var(--color-allow, #22C55E)",
          bg: "var(--color-allow-bg, #0B2519)",
          border: "var(--color-allow-border, #134E35)",
        },
        success: {
          DEFAULT: "var(--color-success, #22C55E)",
          soft: "var(--color-success-soft, #0B2519)",
        },
        deny: {
          DEFAULT: "var(--color-deny, #F87171)",
          bg: "var(--color-deny-bg, #331414)",
          border: "var(--color-deny-border, #7F1D1D)",
        },
        danger: {
          DEFAULT: "var(--color-danger, #F87171)",
          soft: "var(--color-danger-soft, #331414)",
        },
        review: {
          DEFAULT: "var(--color-review, #FBBF24)",
          bg: "var(--color-review-bg, #2E2007)",
          border: "var(--color-review-border, #78350F)",
        },
        warning: {
          DEFAULT: "var(--color-warning, #FBBF24)",
          soft: "var(--color-warning-soft, #2E2007)",
        },
        info: {
          DEFAULT: "var(--color-info, #38BDF8)",
          soft: "var(--color-info-soft, #0C283E)",
        },
        sandbox: {
          DEFAULT: "var(--color-sandbox-border, #78350F)",
          bg: "var(--color-sandbox-bg, #2E2007)",
          text: "var(--color-sandbox-text, #FCD34D)",
          border: "var(--color-sandbox-border, #78350F)",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "Manrope",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "Roboto",
          '"Helvetica Neue"',
          "Arial",
          "sans-serif",
        ],
        serif: [
          '"Source Serif 4"',
          "Georgia",
          "Cambria",
          '"Times New Roman"',
          "serif",
        ],
        mono: [
          '"IBM Plex Mono"',
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          '"Liberation Mono"',
          '"Courier New"',
          "monospace",
        ],
      },
      borderRadius: {
        DEFAULT: "6px",
        panel: "8px",
      },
    },
  },
  plugins: [],
};
