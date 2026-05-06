"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { cn } from "@/lib/utils";

const links = [
  {
    href: "/ml-evaluation",
    label: "Overview",
    description: "Latest metrics, trigger actions, and calibration.",
  },
  {
    href: "/ml-evaluation/dataset",
    label: "Dataset",
    description: "Training-base coverage, label balance, and features.",
  },
  {
    href: "/ml-evaluation/runs",
    label: "Runs",
    description: "Cached artifacts, splits, hashes, and status history.",
  },
] as const;

export function MlEvaluationSubnav() {
  const pathname = usePathname();

  return (
    <nav className="grid gap-3 lg:grid-cols-3">
      {links.map((link) => {
        const isActive = pathname === link.href;

        return (
          <Link
            key={link.href}
            href={link.href}
            className={cn(
              "rounded-[1.5rem] border px-5 py-4 transition",
              isActive
                ? "border-accent/35 bg-panel shadow-soft"
                : "border-line bg-panel/70 hover:border-accent/20 hover:bg-panelAlt/80",
            )}
          >
            <p className={cn("text-sm font-semibold tracking-tight", isActive ? "text-foreground" : "text-muted")}>
              {link.label}
            </p>
            <p className="mt-1 text-sm text-muted">{link.description}</p>
          </Link>
        );
      })}
    </nav>
  );
}
