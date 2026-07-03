import type { Config } from "tailwindcss";

/**
 * Design tokens live here (and mirrored as CSS variables in globals.css).
 * "Editorial slate": cool gray canvas, charcoal text, indigo accent,
 * elevation via shadow rather than borders. Instrument Sans only.
 * Never hardcode a hex anywhere else, always reference these token names.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        surface: "var(--surface)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        accent: "var(--accent)",
        accent600: "var(--accent-600)",
        tint: "var(--tint)",
        line: "var(--line)",
        success: "var(--success)",
      },
      fontFamily: {
        // Instrument Sans only: `sans` and `serif` both resolve to it so any
        // stray font-serif usage still renders in the one typeface.
        sans: ["var(--font-body)", "system-ui", "sans-serif"],
        serif: ["var(--font-body)", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl: "12px",
        "2xl": "16px",
      },
      boxShadow: {
        // Cool, neutral shadows: the primary way surfaces separate.
        soft: "0 1px 2px rgba(27,31,39,0.04), 0 6px 20px rgba(27,31,39,0.06)",
        lift: "0 8px 16px rgba(27,31,39,0.08), 0 24px 48px rgba(27,31,39,0.12)",
        // Focus/hover ring in the accent, used for interactive emphasis.
        ring: "0 0 0 3px rgba(79,70,229,0.18)",
      },
      keyframes: {
        // New thinking-stream boxes rise into place.
        "rise-in": {
          "0%": { opacity: "0", transform: "translateY(8px) scale(0.98)" },
          "100%": { opacity: "1", transform: "translateY(0) scale(1)" },
        },
        // Sheen that sweeps across the progress bar and skeleton lines.
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
        // Soft three-dot "thinking" bounce.
        blink: {
          "0%, 80%, 100%": { opacity: "0.2" },
          "40%": { opacity: "1" },
        },
      },
      animation: {
        "rise-in": "rise-in 0.4s cubic-bezier(0.22,1,0.36,1) both",
        shimmer: "shimmer 1.6s ease-in-out infinite",
        blink: "blink 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
