import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const variants = {
  low: "border-emerald-400/30 bg-emerald-400/10 text-emerald-700 dark:text-emerald-200",
  medium: "border-sky-400/30 bg-sky-400/10 text-sky-700 dark:text-sky-200",
  high: "border-amber-300/30 bg-amber-300/10 text-amber-700 dark:text-amber-100",
  critical: "border-rose-400/30 bg-rose-400/10 text-rose-700 dark:text-rose-200",
  neutral: "border-line bg-panelAlt text-foreground"
} as const;

export function Badge({
  children,
  tone = "neutral",
  className
}: {
  children: ReactNode;
  tone?: keyof typeof variants;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]",
        variants[tone],
        className
      )}
    >
      {children}
    </span>
  );
}