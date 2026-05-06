"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const links = [
  { href: "/repositories", label: "Overview" },
  { href: "/about", label: "About" },
  { href: "/methodology", label: "Methodology" },
  { href: "/ml-evaluation", label: "ML Results" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="flex flex-col gap-4 rounded-[1.7rem] border border-line/80 bg-panel/88 px-5 py-4 shadow-[0_24px_60px_-42px_rgba(15,23,42,0.42)] backdrop-blur md:flex-row md:items-center md:justify-between">
      <div className="space-y-1">
        <Link href="/" className="text-sm font-semibold uppercase tracking-[0.24em] text-accent">
          OSS Risk Radar
        </Link>
        <p className="text-sm text-muted">OSS maintenance triage, research metrics, and live repository overview</p>
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <nav className="flex flex-wrap items-center gap-2 rounded-full border border-line/70 bg-panelAlt/80 p-1.5 text-sm">
          {links.map((link) => {
            const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "rounded-full px-4 py-2 font-medium transition",
                  isActive ? "bg-accent/12 text-accent shadow-[inset_0_0_0_1px_hsl(var(--accent)/0.16)]" : "text-muted hover:bg-panel hover:text-foreground"
                )}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
        <ThemeToggle />
      </div>
    </header>
  );
}
