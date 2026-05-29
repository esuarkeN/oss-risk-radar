"use client";

import { BarChart3, BookOpen, CircleDot, Info, LayoutDashboard } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { ThemeToggle } from "@/components/theme-toggle";
import { cn } from "@/lib/utils";

const links = [
  { href: "/repositories", label: "Overview", icon: LayoutDashboard },
  { href: "/methodology", label: "Methodology", icon: BookOpen },
  { href: "/ml-evaluation", label: "ML Results", icon: BarChart3 },
  { href: "/about", label: "About", icon: Info },
] as const;

export function SiteHeader() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 -mx-4 border-b border-line bg-background/88 px-4 py-3 backdrop-blur md:static md:mx-0 md:border md:bg-panel/88 lg:rounded-lg">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <Link href="/" className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-foreground text-background">
            <CircleDot className="h-5 w-5" />
          </span>
          <span>
            <span className="block text-sm font-semibold uppercase tracking-[0.18em] text-foreground">OSS Risk Radar</span>
            <span className="block text-xs text-muted">Dependency intelligence console</span>
          </span>
        </Link>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <nav className="flex flex-wrap items-center gap-1 text-sm">
          {links.map((link) => {
            const isActive = pathname === link.href || pathname.startsWith(`${link.href}/`);
            const Icon = link.icon;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-md px-3 font-medium transition",
                  isActive
                    ? "bg-foreground text-background"
                    : "text-muted hover:bg-panelAlt hover:text-foreground"
                )}
              >
                <Icon className="h-4 w-4" />
                {link.label}
              </Link>
            );
          })}
          </nav>
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
