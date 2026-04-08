"use client";

import { MoonStar, SunMedium } from "lucide-react";
import { useEffect, useState } from "react";

const STORAGE_KEY = "oss-risk-radar-theme";

type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  root.dataset.theme = theme;
  root.style.colorScheme = theme;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    const initialTheme: Theme = root.classList.contains("dark") ? "dark" : "light";
    setTheme(initialTheme);
    applyTheme(initialTheme);
  }, []);

  function handleToggle() {
    const nextTheme: Theme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    applyTheme(nextTheme);
    window.localStorage.setItem(STORAGE_KEY, nextTheme);
  }

  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={handleToggle}
      className="inline-flex h-11 items-center gap-2 rounded-full border border-line bg-panel/90 px-4 text-sm font-medium text-foreground transition hover:border-accent/60 hover:bg-accent/10"
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
    >
      {isDark ? <SunMedium className="h-4 w-4" /> : <MoonStar className="h-4 w-4" />}
      <span>{isDark ? "Light" : "Dark"}</span>
    </button>
  );
}