"use client";

import { BookOpen, CircleDot, History, Home, LayoutDashboard, Menu, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

import { ThemeToggle } from "@/components/theme-toggle";
import { getLastAnalysis, type LastAnalysis } from "@/lib/last-analysis";
import { cn } from "@/lib/utils";

const globalNavItems = [
  { href: "/repositories", label: "Repositories", icon: LayoutDashboard },
  { href: "/docs", label: "Docs", icon: BookOpen },
] as const;

function extractAnalysisId(pathname: string): string | null {
  const match = /^\/analyses\/([^/]+)/.exec(pathname);
  return match?.[1] ?? null;
}

function SidebarContent({ onNavClick }: { onNavClick?: () => void }) {
  const pathname = usePathname();
  const analysisId = extractAnalysisId(pathname);
  const [lastAnalysis, setLastAnalysisState] = useState<LastAnalysis | null>(null);

  useEffect(() => {
    // Read after mount to avoid hydration mismatch; refresh when the route changes.
    setLastAnalysisState(getLastAnalysis());
  }, [pathname]);

  // Offer a resume link only when there is a remembered analysis we are not already viewing.
  const showLastAnalysis = Boolean(lastAnalysis && lastAnalysis.id !== analysisId);

  return (
    <div className="flex h-full flex-col">
      {/* Brand */}
      <div className="flex h-14 items-center gap-3 border-b border-[hsl(var(--border))] px-4">
        <Link
          href="/"
          onClick={onNavClick}
          className="flex items-center gap-2.5 transition-opacity hover:opacity-80"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-[7px] bg-[hsl(var(--accent))]">
            <CircleDot className="h-4 w-4 text-white" />
          </span>
          <span className="text-sm font-bold tracking-tight text-[hsl(var(--foreground))]">
            OSS Risk Radar
          </span>
        </Link>
      </div>

      <nav className="flex-1 overflow-y-auto p-2">
        {/* Home */}
        <Link
          href="/"
          onClick={onNavClick}
          className={cn(
            "mb-1 flex items-center gap-3 rounded-[7px] px-3 py-2 text-sm font-medium transition-colors",
            pathname === "/"
              ? "bg-[hsl(var(--accent)/0.12)] text-[hsl(var(--accent))]"
              : "text-[hsl(var(--muted))] hover:bg-[hsl(var(--panel-alt))] hover:text-[hsl(var(--foreground))]"
          )}
        >
          <Home className="h-4 w-4 shrink-0" />
          Home
        </Link>

        {/* Resume last analysis */}
        {showLastAnalysis && lastAnalysis ? (
          <Link
            href={`/analyses/${lastAnalysis.id}`}
            onClick={onNavClick}
            title={lastAnalysis.label}
            className="mb-1 flex items-center gap-3 rounded-[7px] px-3 py-2 text-sm font-medium text-[hsl(var(--muted))] transition-colors hover:bg-[hsl(var(--panel-alt))] hover:text-[hsl(var(--foreground))]"
          >
            <History className="h-4 w-4 shrink-0" />
            <span className="truncate">Last analysis</span>
          </Link>
        ) : null}

        {/* Analysis-specific section */}
        {analysisId && (
          <>
            <div className="mb-1 mt-4 px-3 pb-1">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--muted)/0.5)]">
                This analysis
              </p>
            </div>
            {[
              {
                href: `/analyses/${analysisId}`,
                label: "Dashboard",
                icon: LayoutDashboard,
                exact: true,
              },
            ].map((item) => {
              const isActive = item.exact
                ? pathname === item.href
                : pathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onNavClick}
                  className={cn(
                    "mb-0.5 flex items-center gap-3 rounded-[7px] px-3 py-2 text-sm font-medium transition-colors",
                    isActive
                      ? "bg-[hsl(var(--accent)/0.12)] text-[hsl(var(--accent))]"
                      : "text-[hsl(var(--muted))] hover:bg-[hsl(var(--panel-alt))] hover:text-[hsl(var(--foreground))]"
                  )}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </>
        )}

        {/* Global nav */}
        <div className="mb-1 mt-4 px-3 pb-1">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--muted)/0.5)]">
            Workspace
          </p>
        </div>
        {globalNavItems.map((item) => {
          const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={onNavClick}
              className={cn(
                "mb-0.5 flex items-center gap-3 rounded-[7px] px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-[hsl(var(--accent)/0.12)] text-[hsl(var(--accent))]"
                  : "text-[hsl(var(--muted))] hover:bg-[hsl(var(--panel-alt))] hover:text-[hsl(var(--foreground))]"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-[hsl(var(--border))] p-3">
        <ThemeToggle />
      </div>
    </div>
  );
}

export function AppSidebar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-[220px] shrink-0 border-r border-[hsl(var(--border))] bg-[hsl(var(--panel))] lg:flex lg:flex-col">
        <SidebarContent />
      </aside>

      {/* Mobile top bar */}
      <div className="flex h-14 items-center gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--panel))] px-4 lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(true)}
          aria-label="Open navigation"
          className="flex h-8 w-8 items-center justify-center rounded-[7px] text-[hsl(var(--muted))] hover:bg-[hsl(var(--panel-alt))] hover:text-[hsl(var(--foreground))]"
        >
          <Menu className="h-4 w-4" />
        </button>
        <Link href="/" className="flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-[6px] bg-[hsl(var(--accent))]">
            <CircleDot className="h-3.5 w-3.5 text-white" />
          </span>
          <span className="text-sm font-bold tracking-tight">OSS Risk Radar</span>
        </Link>
        <div className="ml-auto">
          <ThemeToggle />
        </div>
      </div>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          onClick={() => setMobileOpen(false)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <aside
            className="absolute inset-y-0 left-0 w-[220px] bg-[hsl(var(--panel))]"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              aria-label="Close navigation"
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-[7px] text-[hsl(var(--muted))] hover:bg-[hsl(var(--panel-alt))]"
            >
              <X className="h-4 w-4" />
            </button>
            <SidebarContent onNavClick={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}
    </>
  );
}
