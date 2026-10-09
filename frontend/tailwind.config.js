/** @type {import("tailwindcss").Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    // Operational type scale (typography-refinement brief). Fixed px, not fluid.
    fontSize: {
      "2xs": ["0.6875rem", { lineHeight: "1rem" }], // 11px — count chips/badges
      eyebrow: ["0.6875rem", { lineHeight: "1rem", letterSpacing: "0.1em" }], // 11px mono eyebrow
      xs: ["0.75rem", { lineHeight: "1.05rem" }], // 12px — mono identifiers
      meta: ["0.8125rem", { lineHeight: "1.45" }], // 13px — metadata
      btn: ["0.875rem", { lineHeight: "1.1" }], // 14px — buttons / metric labels
      sm: ["0.9375rem", { lineHeight: "1.3" }], // 15px — navigation
      base: ["0.9375rem", { lineHeight: "1.55" }], // 15px — body / explanations
      case: ["1.0625rem", { lineHeight: "1.3" }], // 17px — case title
      lg: ["1.25rem", { lineHeight: "1.2" }], // 20px — section heading
      desc: ["1rem", { lineHeight: "1.5" }], // 16px — page description
      metric: ["2.125rem", { lineHeight: "1.08" }], // 34px — metric value
      title: ["2.125rem", { lineHeight: "1.08", letterSpacing: "-0.02em" }], // 34px — page title
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
        sans: ["var(--font-sans)"],
        mono: ["var(--font-mono)"],
      },
      borderRadius: {
        DEFAULT: "4px",
        md: "5px",
        lg: "6px",
      },
      maxWidth: {
        shell: "1480px",
      },
      transitionDuration: {
        180: "180ms",
      },
    },
  },
  plugins: [],
};