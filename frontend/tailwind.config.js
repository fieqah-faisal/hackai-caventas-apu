/** @type {import("tailwindcss").Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    // Tight product-UI scale (ratio ~1.14), fixed rem (not fluid).
    fontSize: {
      "2xs": ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.02em" }],
      xs: ["0.75rem", { lineHeight: "1.1rem" }],
      sm: ["0.8125rem", { lineHeight: "1.25rem" }],
      base: ["0.875rem", { lineHeight: "1.4rem" }],
      md: ["1rem", { lineHeight: "1.5rem" }],
      lg: ["1.125rem", { lineHeight: "1.6rem" }],
      xl: ["1.3125rem", { lineHeight: "1.75rem" }],
      "2xl": ["1.625rem", { lineHeight: "2rem", letterSpacing: "-0.01em" }],
    },
    extend: {
      colors: {
        canvas: "var(--bg-canvas)",
        shell: "var(--bg-shell)",
        surface: {
          DEFAULT: "var(--bg-surface)",
          raised: "var(--bg-surface-raised)",
          hover: "var(--bg-surface-hover)",
        },
        border: {
          subtle: "var(--border-subtle)",
          strong: "var(--border-strong)",
        },
        text: {
          primary: "var(--text-primary)",
          secondary: "var(--text-secondary)",
          muted: "var(--text-muted)",
        },
        accent: {
          DEFAULT: "var(--accent-primary)",
          hover: "var(--accent-hover)",
          pressed: "var(--accent-pressed)",
          text: "var(--accent-text)",
        },
        status: {
          warning: "var(--status-warning)",
          danger: "var(--status-danger)",
          info: "var(--status-info)",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "sans-serif",
        ],
      },
      borderRadius: {
        DEFAULT: "4px",
        md: "5px",
        lg: "6px",
      },
      maxWidth: {
        shell: "1600px",
      },
      transitionDuration: {
        180: "180ms",
      },
    },
  },
  plugins: [],
};
