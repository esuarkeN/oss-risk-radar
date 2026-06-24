import * as React from "react";

import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--panel))] p-5 text-[hsl(var(--foreground))]",
        className
      )}
      {...props}
    />
  );
}
