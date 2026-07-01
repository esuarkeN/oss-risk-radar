"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

interface DocsNavItem {
  href: string;
  label: string;
  /** Nested item under a parent section (rendered indented). */
  child?: boolean;
}

const sections: { title: string; items: DocsNavItem[] }[] = [
  {
    title: "Getting started",
    items: [{ href: "/docs", label: "Overview" }],
  },
  {
    title: "Data & training",
    items: [
      { href: "/docs/data-sources", label: "Where data comes from" },
      { href: "/docs/dataset", label: "Building the dataset" },
      { href: "/docs/training", label: "Train it yourself" },
    ],
  },
  {
    title: "Features",
    items: [
      { href: "/docs/feature-engineering", label: "Feature engineering" },
      { href: "/docs/features", label: "Feature reference" },
    ],
  },
  {
    title: "Scoring",
    items: [
      { href: "/docs/scoring", label: "How scoring a repo works" },
      { href: "/docs/performance", label: "Training results explained" },
      { href: "/docs/confidence", label: "Trust & confidence" },
    ],
  },
  {
    title: "Model evaluation (scientific)",
    items: [
      { href: "/docs/ml", label: "Overview" },
      { href: "/docs/ml/dataset", label: "Dataset", child: true },
      { href: "/docs/ml/repositories", label: "Training repositories", child: true },
      { href: "/docs/ml/runs", label: "Training runs", child: true },
    ],
  },
  {
    title: "Project",
    items: [{ href: "/docs/about", label: "About" }],
  },
];

export function DocsShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
      <aside className="lg:sticky lg:top-6 lg:self-start">
        <nav className="space-y-5">
          {sections.map((section) => (
            <div key={section.title}>
              <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--muted)/0.7)]">
                {section.title}
              </p>
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          "block rounded-md px-3 py-1.5 text-sm transition-colors",
                          item.child && "pl-6 text-[13px]",
                          active
                            ? "bg-[hsl(var(--accent)/0.12)] font-medium text-accent"
                            : "text-muted hover:bg-panelAlt hover:text-foreground",
                        )}
                      >
                        {item.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 space-y-6">{children}</div>
    </div>
  );
}
