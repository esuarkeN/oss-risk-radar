import * as React from "react";

import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-lg border border-line bg-panel p-6 text-foreground shadow-[0_18px_42px_-34px_rgba(0,0,0,0.55)]",
        className
      )}
      {...props}
    />
  );
}
