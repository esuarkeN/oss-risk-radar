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
        soft: "0 18px 42px -34px rgba(0, 0, 0, 0.55)",
        panel: "0 24px 54px -38px rgba(0, 0, 0, 0.62)"
      },
      backgroundImage: {
        mesh: "linear-gradient(180deg, hsl(var(--background)) 0%, hsl(var(--panel-alt)) 100%)"
      },
      fontFamily: {
        sans: ["Inter", "Space Grotesk", "Segoe UI", "sans-serif"],
        mono: ["IBM Plex Mono", "Consolas", "monospace"]
      }
    }
  },
  plugins: []
};

export default config;
