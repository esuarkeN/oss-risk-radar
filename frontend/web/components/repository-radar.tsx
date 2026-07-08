"use client";

import Link from "next/link";
import { ArrowRight, Table2 } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import {
  repositoryActivityStatus,
  riskGrade,
  sourceBadge,
  timeframeOptions,
  useRepositoryRadarData,
  type Timeframe,
} from "@/lib/repository-radar-data";

export function RepositoryRadar() {
  const { repositoryRows, packageRows, dataset, leaderboard, error } = useRepositoryRadarData();
  const [timeframeDays, setTimeframeDays] = useState<Timeframe>(180);

  const inactiveCount = useMemo(
    () => repositoryRows.filter((repository) => repositoryActivityStatus(repository, timeframeDays) === "inactive").length,
    [repositoryRows, timeframeDays],
  );

  if (error) {
    return <Card className="text-sm text-danger">{error}</Card>;
  }

  return (
    <div className="space-y-6">
      {/* Hero */}
      <Card className="space-y-5 overflow-hidden border-line bg-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Repository radar</p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground lg:text-5xl">
              Every repository we&apos;ve graded, in one place.
            </h1>
            <p className="max-w-3xl text-sm leading-6 text-muted">
              An overview of the database — your own submissions alongside the model&apos;s training base. Open the full
              directory to search and scroll every repository, package, and dependency in one table.
            </p>
          </div>
          <Link
            href="/repositories/all"
            className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-foreground bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition hover:opacity-90"
          >
            <Table2 className="size-4" aria-hidden="true" /> Browse all repositories
          </Link>
        </div>
      </Card>

      {/* Stat cards */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="space-y-2">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Tracked repos</p>
          <p className="text-4xl font-semibold tracking-tight text-foreground">{repositoryRows.length}</p>
          <p className="text-sm text-muted">User-submitted analyses merged with the real training base.</p>
        </Card>
        <Card className="space-y-2">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Tracked packages</p>
          <p className="text-4xl font-semibold tracking-tight text-foreground">{dataset?.uniquePackages || packageRows.length}</p>
          <p className="text-sm text-muted">Distinct package rows across the training and analysis surfaces.</p>
        </Card>
        <Card className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs uppercase tracking-[0.24em] text-muted">Inactive in {timeframeDays}d</p>
            <div className="flex gap-1">
              {timeframeOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setTimeframeDays(option)}
                  className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold transition ${
                    timeframeDays === option ? "border-foreground bg-foreground text-background" : "border-line text-muted hover:text-foreground"
                  }`}
                >
                  {option}d
                </button>
              ))}
            </div>
          </div>
          <p className="text-4xl font-semibold tracking-tight text-foreground">{inactiveCount}</p>
          <p className="text-sm text-muted">Repos archived or stale inside the chosen activity window.</p>
        </Card>
        <Card className="space-y-2">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Training snapshots</p>
          <p className="text-4xl font-semibold tracking-tight text-foreground">{dataset?.totalSnapshots ?? 0}</p>
          <p className="text-sm text-muted">{dataset?.lastUpdatedAt ? `Updated ${formatDate(dataset.lastUpdatedAt)}` : "Waiting for the historical dataset."}</p>
        </Card>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_0.6fr]">
        {/* Leaderboard */}
        <Card className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-muted">Leaderboard</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Top repos by outlook</h2>
            </div>
            <Link href="/repositories/all" className="inline-flex items-center gap-1 text-sm font-semibold text-accent transition hover:text-foreground">
              Full directory <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </div>
          {leaderboard.length ? (
            <div className="space-y-2.5">
              {leaderboard.map((repository, index) => {
                const source = sourceBadge(repository.source);
                const grade = riskGrade(repository.avgRisk);
                const medal = index === 0 ? "🥇" : index === 1 ? "🥈" : index === 2 ? "🥉" : `#${index + 1}`;

                return (
                  <div key={repository.key} className="flex items-center gap-3 rounded-[1.25rem] border border-line bg-panelAlt/80 px-4 py-3">
                    <span className="w-7 shrink-0 text-center text-lg font-semibold tabular-nums text-foreground">{medal}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-foreground">{repository.label}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Badge tone={source.tone}>{source.label}</Badge>
                        <Badge tone={grade.tone}>{grade.label}</Badge>
                      </div>
                    </div>
                    <span className="shrink-0 text-right text-sm font-semibold tabular-nums text-foreground">{Math.round(repository.avgOutlook12m)}%</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-muted">No graded repositories yet. Run a repository analysis or seed the training dataset to populate the leaderboard.</p>
          )}
        </Card>

        {/* Training base snapshot */}
        <Card className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted">Training base</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Dataset snapshot</h2>
          </div>
          <div className="space-y-3 text-sm text-muted">
            <div className="rounded-[1.25rem] border border-line bg-panelAlt/80 px-4 py-3">
              <span className="font-semibold text-foreground">Unique repos:</span> {dataset?.uniqueRepositories ?? 0}
            </div>
            <div className="rounded-[1.25rem] border border-line bg-panelAlt/80 px-4 py-3">
              <span className="font-semibold text-foreground">Unique packages:</span> {dataset?.uniquePackages ?? 0}
            </div>
            <div className="rounded-[1.25rem] border border-line bg-panelAlt/80 px-4 py-3">
              <span className="font-semibold text-foreground">Completed analyses:</span> {dataset?.uniqueAnalyses ?? 0}
            </div>
          </div>
          <p className="text-sm text-muted">
            {dataset?.autoCaptureEnabled === false
              ? "Training auto-capture is disabled for this API instance."
              : "The historical snapshot export is the main training base; completed live analyses add newer rows without replacing it."}
          </p>
        </Card>
      </div>
    </div>
  );
}
