"use client";

import { ArrowRight, History } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";

import { getLastAnalysis, type LastAnalysis } from "@/lib/last-analysis";

/**
 * Landing-page card that lets a returning visitor jump straight back into the analysis they last
 * opened. Renders nothing on first visit (no remembered analysis) or during SSR.
 */
export function ResumeAnalysisCard() {
  const [lastAnalysis, setLastAnalysis] = useState<LastAnalysis | null>(null);

  useEffect(() => {
    setLastAnalysis(getLastAnalysis());
  }, []);

  if (!lastAnalysis) {
    return null;
  }

  return (
    <div className="mx-auto mb-8 max-w-2xl">
      <Link
        href={`/analyses/${lastAnalysis.id}`}
        className="group flex items-center gap-4 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--panel))] px-5 py-4 transition-all hover:border-[hsl(var(--accent)/0.4)] hover:bg-[hsl(var(--accent)/0.04)]"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[9px] bg-[hsl(var(--accent)/0.1)] text-[hsl(var(--accent))]">
          <History className="h-4.5 w-4.5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-[hsl(var(--muted))]">
            Continue where you left off
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold text-[hsl(var(--foreground))]">{lastAnalysis.label}</p>
        </div>
        <ArrowRight className="h-4 w-4 shrink-0 text-[hsl(var(--muted))] transition group-hover:translate-x-0.5 group-hover:text-[hsl(var(--accent))]" />
      </Link>
    </div>
  );
}
