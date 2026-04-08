import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
    "../../shared/packages/schemas/src/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background) / <alpha-value>)",
        foreground: "hsl(var(--foreground) / <alpha-value>)",
        border: "hsl(var(--border) / <alpha-value>)",
        card: "hsl(var(--card) / <alpha-value>)",
        muted: "hsl(var(--muted) / <alpha-value>)",
        accent: "hsl(var(--accent) / <alpha-value>)",
        success: "hsl(var(--success) / <alpha-value>)",
        warning: "hsl(var(--warning) / <alpha-value>)",
        danger: "hsl(var(--danger) / <alpha-value>)",
        panel: "hsl(var(--panel) / <alpha-value>)",
        panelAlt: "hsl(var(--panel-alt) / <alpha-value>)",
        line: "hsl(var(--border) / <alpha-value>)",
        ink: "hsl(var(--foreground) / <alpha-value>)"
      },
      boxShadow: {
        soft: "0 18px 50px rgba(5, 15, 25, 0.12)",
        panel: "0 18px 50px rgba(5, 15, 25, 0.18)"
      },
      backgroundImage: {
        mesh: "radial-gradient(circle at top left, rgba(54, 110, 255, 0.18), transparent 35%), radial-gradient(circle at top right, rgba(18, 214, 135, 0.12), transparent 30%), linear-gradient(180deg, rgba(255,255,255,0.96), rgba(244,248,252,0.98))"
      },
      fontFamily: {
        sans: ["Space Grotesk", "Segoe UI", "sans-serif"],
        mono: ["IBM Plex Mono", "Consolas", "monospace"]
      }
    }
  },
  plugins: []
};

export default config;