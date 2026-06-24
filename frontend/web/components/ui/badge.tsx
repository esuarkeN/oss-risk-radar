import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

const variants = {
  low:      "border-[hsl(var(--success)/0.3)] bg-[hsl(var(--success)/0.1)] text-[hsl(var(--success))]",
  medium:   "border-[hsl(var(--warning)/0.3)] bg-[hsl(var(--warning)/0.1)] text-[hsl(var(--warning))]",
  high:     "border-[hsl(var(--danger)/0.3)] bg-[hsl(var(--danger)/0.1)] text-[hsl(var(--danger))]",
  critical: "border-[hsl(var(--danger)/0.4)] bg-[hsl(var(--danger)/0.15)] text-[hsl(var(--danger))]",
  neutral:  "border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] text-[hsl(var(--muted))]",
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
        "inline-flex items-center rounded-md border px-2.5 py-1 text-xs font-semibold uppercase tracking-[0.14em]",
        variants[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
