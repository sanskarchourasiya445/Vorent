/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "var(--color-canvas, #F5F6F8)",
        surface: "var(--color-surface, #FFFFFF)",
        ink: "var(--color-ink, #172033)",
        muted: "var(--color-muted, #5B6475)",
        border: "var(--color-border, #D8DDE6)",
        accent: {
          DEFAULT: "var(--color-accent, #3157A4)",
          hover: "#264483",
        },
        allow: "var(--color-allow, #176B4D)",
        deny: "var(--color-deny, #B42318)",
        review: "var(--color-review, #8A5A00)",
        info: "var(--color-info, #245EA8)",
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "sans-serif",
        ],
        mono: [
          '"JetBrains Mono"',
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
      },
      borderRadius: {
        DEFAULT: "4px",
        panel: "6px",
      },
    },
  },
  plugins: [],
};
