import * as React from "react";

import { cn } from "@/lib/utils";

export function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[1.7rem] border border-line/80 bg-panel/88 p-6 text-foreground shadow-[0_24px_60px_-42px_rgba(15,23,42,0.42)] backdrop-blur",
        className
      )}
      {...props}
    />
  );
}
