"use client";

import { Activity, GitFork, MessageSquareText, Search, Star } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import type { TrainingDatasetRepositorySummary } from "@/lib/types";
import { useMlEvaluationState } from "@/lib/use-ml-evaluation-state";
import { cn } from "@/lib/utils";

type BadgeTone = "low" | "medium" | "high" | "critical" | "neutral";
type SortKey = "rank" | "stars" | "activity" | "issues" | "packages";

const numberFormatter = new Intl.NumberFormat("en");
const compactNumberFormatter = new Intl.NumberFormat("en", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const sortOptions: Array<{ value: SortKey; label: string }> = [
  { value: "rank", label: "Training rank" },
  { value: "stars", label: "Stars" },
  { value: "activity", label: "Activeness" },
  { value: "issues", label: "Open issues" },
  { value: "packages", label: "Packages" },
];

function formatNumber(value: number) {
  return numberFormatter.format(value);
}

function formatCompactNumber(value: number) {
  return value >= 10000 ? compactNumberFormatter.format(value) : formatNumber(value);
}

function formatAge(days?: number) {
  if (typeof days !== "number") {
    return "Unknown";
  }

  if (days === 0) {
    return "0d";
  }

  if (days < 30) {
    return `${days}d`;
  }

  if (days < 365) {
    return `${Math.round(days / 30)}mo`;
  }

  return `${(days / 365).toFixed(1)}y`;
}

function getActivity(repository: TrainingDatasetRepositorySummary): {
  label: string;
  detail: string;
  score: number;
  tone: BadgeTone;
} {
  if (repository.archived) {
    return {
      label: "Archived",
      detail: "Repository is archived",
      score: 0,
      tone: "critical",
    };
  }

  const lastPushAgeDays = repository.lastPushAgeDays;
  if (typeof lastPushAgeDays !== "number") {
    return {
      label: "Unknown",
      detail: "No push signal",
      score: 35,
      tone: "neutral",
    };
  }

  let score = 100;
  if (lastPushAgeDays > 365) {
    score = 15;
  } else if (lastPushAgeDays > 180) {
    score = 35;
  } else if (lastPushAgeDays > 90) {
    score = 55;
  } else if (lastPushAgeDays > 30) {
    score = 75;
  }

  if (typeof repository.recentContributors90d === "number") {
    if (repository.recentContributors90d <= 1) {
      score -= 16;
    } else if (repository.recentContributors90d >= 8) {
      score += 8;
    }
  }

  score = Math.max(0, Math.min(100, score));

  const label = score >= 82 ? "Very active" : score >= 65 ? "Active" : score >= 45 ? "Quiet" : score >= 25 ? "Stale" : "Dormant";
  const tone: BadgeTone = score >= 65 ? "low" : score >= 45 ? "medium" : score >= 25 ? "high" : "critical";
  const contributors =
    typeof repository.recentContributors90d === "number"
      ? `, ${numberFormatter.format(repository.recentContributors90d)} contributors`
      : "";

  return {
    label,
    detail: `${formatAge(lastPushAgeDays)} since push${contributors}`,
    score,
    tone,
  };
}

function commentsForRepository(repository: TrainingDatasetRepositorySummary) {
  const comments: string[] = [];

  if (repository.archived) {
    comments.push("Archived source");
  }
  if (typeof repository.lastPushAgeDays === "number" && repository.lastPushAgeDays > 365) {
    comments.push("No recent push");
  } else if (typeof repository.lastPushAgeDays === "number" && repository.lastPushAgeDays > 180) {
    comments.push("Slow push cadence");
  }
  if (typeof repository.lastReleaseAgeDays === "number" && repository.lastReleaseAgeDays > 365) {
    comments.push("Release is old");
  }
  if (typeof repository.recentContributors90d === "number" && repository.recentContributors90d <= 1) {
    comments.push("Thin maintainer activity");
  }
  if (typeof repository.pullRequestMedianResponseDays === "number" && repository.pullRequestMedianResponseDays > 30) {
    comments.push("Slow PR response");
  }
  if (typeof repository.contributorConcentration === "number" && repository.contributorConcentration >= 0.6) {
    comments.push("Concentrated contributors");
  }
  if (repository.openIssues >= 500) {
    comments.push("Large issue queue");
  }
  if (typeof repository.openIssueGrowth90d === "number" && repository.openIssueGrowth90d >= 0.25) {
    comments.push("Issues growing");
  }
  if (repository.labeledSnapshotCount > 0) {
    comments.push(`${repository.inactiveLabelCount}/${repository.labeledSnapshotCount} inactive labels`);
  }

  return comments.length ? comments.slice(0, 3) : ["Signals look current"];
}

function searchText(repository: TrainingDatasetRepositorySummary) {
  return [
    repository.fullName,
    repository.url,
    commentsForRepository(repository).join(" "),
    getActivity(repository).label,
  ]
    .join(" ")
    .toLowerCase();
}

function sortRepositories(repositories: TrainingDatasetRepositorySummary[], sortKey: SortKey) {
  return [...repositories].sort((left, right) => {
    if (sortKey === "rank") {
      return left.rank - right.rank;
    }
    if (sortKey === "stars") {
      return right.stars - left.stars || left.rank - right.rank;
    }
    if (sortKey === "activity") {
      return getActivity(right).score - getActivity(left).score || left.rank - right.rank;
    }
    if (sortKey === "issues") {
      return right.openIssues - left.openIssues || left.rank - right.rank;
    }
    return right.packageCount - left.packageCount || left.rank - right.rank;
  });
}

function StatCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <Card className="space-y-2">
      <p className="text-xs uppercase tracking-[0.24em] text-muted">{label}</p>
      <p className="text-4xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="text-sm text-muted">{detail}</p>
    </Card>
  );
}

export function MlTrainingRepositoriesView() {
  const { dataset, loading, error, refresh } = useMlEvaluationState();
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("rank");

  const repositories = useMemo(() => dataset?.repositories ?? [], [dataset?.repositories]);
  const filteredRepositories = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();
    const filtered = normalizedSearch
      ? repositories.filter((repository) => searchText(repository).includes(normalizedSearch))
      : repositories;

    return sortRepositories(filtered, sortKey);
  }, [repositories, search, sortKey]);

  const activeCount = useMemo(
    () => repositories.filter((repository) => getActivity(repository).score >= 65 && !repository.archived).length,
    [repositories],
  );
  const archivedCount = useMemo(() => repositories.filter((repository) => repository.archived).length, [repositories]);
  const labeledCount = useMemo(
    () => repositories.reduce((total, repository) => total + repository.labeledSnapshotCount, 0),
    [repositories],
  );

  return (
    <div className="space-y-6">
      {error ? (
        <Card className="flex flex-col gap-4 border-rose-400/25 bg-rose-400/10 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Training repositories failed to load</p>
            <p className="mt-1 text-sm text-muted">{error}</p>
          </div>
          <Button onClick={() => void refresh()}>Retry</Button>
        </Card>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Repositories" value={formatNumber(dataset?.uniqueRepositories ?? 0)} detail="Unique training repositories" />
        <StatCard label="Active" value={formatNumber(activeCount)} detail="Current push activity looks healthy" />
        <StatCard label="Archived" value={formatNumber(archivedCount)} detail="Archived repos still present in the base" />
        <StatCard label="Labeled" value={formatNumber(labeledCount)} detail="Repository snapshots with inactivity labels" />
      </section>

      <Card className="space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted">Training Repositories</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-foreground">All repos used by the current training base</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral">{formatNumber(filteredRepositories.length)} shown</Badge>
            <Badge tone="neutral">{formatNumber(dataset?.totalSnapshots ?? 0)} snapshots</Badge>
          </div>
        </div>

        <div className="grid gap-3 lg:grid-cols-[1fr_16rem]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden="true" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search repository, comment, or activity"
              className="pl-10"
            />
          </div>
          <label className="flex items-center gap-3 rounded-2xl border border-line bg-panel px-4 py-3 text-sm text-muted">
            <span className="shrink-0 font-semibold text-foreground">Sort</span>
            <select
              value={sortKey}
              onChange={(event) => setSortKey(event.target.value as SortKey)}
              className="min-w-0 flex-1 bg-transparent text-foreground outline-none"
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {filteredRepositories.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-[1120px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-[0.18em] text-muted">
                  <th className="pb-3 pr-4">Rank</th>
                  <th className="pb-3 pr-4">Repository</th>
                  <th className="pb-3 pr-4">Training Use</th>
                  <th className="pb-3 pr-4">Stars</th>
                  <th className="pb-3 pr-4">Comments</th>
                  <th className="pb-3 pr-4">Activeness</th>
                  <th className="pb-3 pr-4">Observed</th>
                </tr>
              </thead>
              <tbody>
                {filteredRepositories.map((repository) => {
                  const activity = getActivity(repository);
                  const comments = commentsForRepository(repository);

                  return (
                    <tr key={repository.url} className="border-b border-line/70 align-top last:border-b-0">
                      <td className="py-4 pr-4 font-semibold text-foreground">#{repository.rank}</td>
                      <td className="py-4 pr-4">
                        <p className="font-semibold text-foreground">{repository.fullName || repository.url}</p>
                        {repository.url ? (
                          <a href={repository.url} target="_blank" rel="noreferrer" className="mt-1 block break-all text-xs text-accent">
                            {repository.url}
                          </a>
                        ) : null}
                      </td>
                      <td className="py-4 pr-4 text-foreground">
                        <p className="font-semibold">{formatNumber(repository.snapshotCount)} snapshots</p>
                        <p className="mt-1 text-xs text-muted">
                          {formatNumber(repository.packageCount)} packages / {formatNumber(repository.analysisCount)} analyses
                        </p>
                      </td>
                      <td className="py-4 pr-4 text-foreground">
                        <div className="flex items-center gap-2 font-semibold">
                          <Star className="size-4 text-amber-500" aria-hidden="true" />
                          <span>{formatCompactNumber(repository.stars)}</span>
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-xs text-muted">
                          <GitFork className="size-3.5" aria-hidden="true" />
                          <span>{formatCompactNumber(repository.forks)} forks</span>
                        </div>
                      </td>
                      <td className="py-4 pr-4">
                        <div className="flex max-w-[22rem] flex-wrap gap-2">
                          {comments.map((comment) => (
                            <span
                              key={comment}
                              className="inline-flex items-center gap-1 rounded-full border border-line bg-panelAlt px-2.5 py-1 text-xs font-semibold text-foreground"
                            >
                              <MessageSquareText className="size-3.5 text-muted" aria-hidden="true" />
                              {comment}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="py-4 pr-4">
                        <div className="flex items-center gap-2">
                          <Activity className="size-4 text-muted" aria-hidden="true" />
                          <Badge tone={activity.tone}>{activity.label}</Badge>
                        </div>
                        <p className="mt-2 text-xs text-muted">{activity.detail}</p>
                        <div className="mt-3 h-2 w-36 overflow-hidden rounded-full bg-panelAlt">
                          <div
                            className={cn(
                              "h-full rounded-full",
                              activity.score >= 65
                                ? "bg-emerald-500"
                                : activity.score >= 45
                                  ? "bg-sky-500"
                                  : activity.score >= 25
                                    ? "bg-amber-500"
                                    : "bg-rose-500",
                            )}
                            style={{ width: `${activity.score}%` }}
                          />
                        </div>
                      </td>
                      <td className="py-4 pr-4 text-muted">
                        <p>{repository.lastObservedAt ? formatDate(repository.lastObservedAt) : "Unknown"}</p>
                        <p className="mt-1 text-xs">{formatNumber(repository.openIssues)} open issues</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="rounded-[1.25rem] border border-line bg-panelAlt/70 px-4 py-5 text-sm text-muted">
            {loading
              ? "Loading training repositories..."
              : repositories.length
                ? "No repositories match the current search."
                : "Run repository analyses first to populate the training repository list."}
          </div>
        )}
      </Card>

      <div className="flex flex-wrap gap-3">
        <Link href="/ml-evaluation/dataset" className="text-sm font-semibold text-accent transition hover:text-foreground">
          Dataset coverage
        </Link>
        <Link href="/ml-evaluation/runs" className="text-sm font-semibold text-accent transition hover:text-foreground">
          Run history
        </Link>
      </div>
    </div>
  );
}
