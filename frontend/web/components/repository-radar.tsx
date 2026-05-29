"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getTrainingDatasetSummary, listAnalyses } from "@/lib/api";
import { formatConfidence, formatDate, formatOutlookScore, formatRiskScore } from "@/lib/format";
import type { AnalysisRecord, DependencyRecord, TrainingDatasetRepositorySummary, TrainingDatasetSummary } from "@/lib/types";

interface RepositoryRollup {
  key: string;
  label: string;
  url?: string;
  source: "analysis" | "training";
  trainingRank?: number;
  archived: boolean;
  packageCount: number;
  analysisCount: number;
  snapshotCount?: number;
  labeledSnapshotCount?: number;
  inactiveLabelCount?: number;
  inactiveRate?: number;
  lastPushAt?: string;
  lastPushAgeDays?: number;
  lastObservedAt?: string;
  avgOutlook12m: number;
  avgRisk: number;
  avgSecurity: number;
  avgConfidence: number;
  scorecardScore?: number;
  recentContributors90d?: number;
}

interface PackageRollup {
  key: string;
  packageName: string;
  ecosystem: string;
  analysisCount: number;
  versionCount: number;
  avgOutlook12m: number;
  avgRisk: number;
  avgSecurity: number;
  maxRisk: number;
  mappedRepositories: number;
  lastSeenAt?: string;
}

interface DependencyRankingRow {
  key: string;
  analysisId: string;
  dependencyId: string;
  packageName: string;
  packageVersion: string;
  ecosystem: string;
  repositoryName?: string;
  outlook12m: number;
  risk: number;
  confidence: number;
}

const timeframeOptions = [90, 180, 365] as const;
type OutlookSortDirection = "asc" | "desc";
type RadarView = "repositories" | "packages" | "dependencies";
type ActivityStatus = "active" | "inactive" | "unknown";

function daysSince(date?: string) {
  if (!date) {
    return null;
  }

  const timestamp = new Date(date).getTime();
  if (Number.isNaN(timestamp)) {
    return null;
  }

  const diffMs = Date.now() - timestamp;
  return Math.max(0, Math.round(diffMs / (1000 * 60 * 60 * 24)));
}

function average(values: number[]) {
  if (!values.length) {
    return 0;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function repositoryActivityStatus(repository: RepositoryRollup, timeframeDays: number): ActivityStatus {
  if (repository.archived) {
    return "inactive";
  }

  const ageDays = repositoryAgeDays(repository);
  if (ageDays === null) {
    return "unknown";
  }

  return ageDays > timeframeDays ? "inactive" : "active";
}

function repositoryAgeDays(repository: RepositoryRollup) {
  return repository.lastPushAgeDays ?? daysSince(repository.lastPushAt);
}

function trainingInactiveRate(repository: TrainingDatasetRepositorySummary) {
  if (repository.labeledSnapshotCount <= 0) {
    return 0;
  }
  return repository.inactiveLabelCount / repository.labeledSnapshotCount;
}

export function RepositoryRadar() {
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>([]);
  const [dataset, setDataset] = useState<TrainingDatasetSummary | null>(null);
  const [timeframeDays, setTimeframeDays] = useState<(typeof timeframeOptions)[number]>(180);
  const [activeView, setActiveView] = useState<RadarView>("repositories");
  const [search, setSearch] = useState("");
  const [repositoryOutlookSortDirection, setRepositoryOutlookSortDirection] = useState<OutlookSortDirection>("asc");
  const [packageOutlookSortDirection, setPackageOutlookSortDirection] = useState<OutlookSortDirection>("asc");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [analysisResponse, datasetSummary] = await Promise.all([
          listAnalyses(),
          getTrainingDatasetSummary().catch(() => null)
        ]);

        if (cancelled) {
          return;
        }

        setAnalyses(analysisResponse.analyses.filter((analysis) => analysis.status === "completed" && analysis.submission.kind !== "demo"));
        setDataset(datasetSummary);
        setError(null);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load repository overview.");
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const dependencies = useMemo(() => analyses.flatMap((analysis) => analysis.dependencies ?? []), [analyses]);

  const analysisRepositoryRows = useMemo<RepositoryRollup[]>(() => {
    const buckets = new Map<string, DependencyRecord[]>();
    for (const dependency of dependencies) {
      if (!dependency.repository?.fullName) {
        continue;
      }

      const key = dependency.repository.url || dependency.repository.fullName;
      const current = buckets.get(key) ?? [];
      current.push(dependency);
      buckets.set(key, current);
    }

    return Array.from(buckets.entries())
      .map(([key, items]) => {
        const repository = items[0]?.repository;
        const outlookValues = items.map((item) => item.riskProfile?.maintenanceOutlook12mScore ?? 0);
        const riskValues = items.map((item) => item.riskProfile?.inactivityRiskScore ?? 0);
        const securityValues = items.map((item) => item.riskProfile?.securityPostureScore ?? 0);
        const confidenceValues = items.map((item) => item.riskProfile?.confidenceScore ?? 0);
        const scorecardValues = items
          .map((item) => item.scorecard?.score)
          .filter((value): value is number => typeof value === "number");
        const analysisCount = new Set(items.map((item) => item.analysisId)).size;
        const packageCount = new Set(items.map((item) => `${item.ecosystem}|${item.packageName}`)).size;

        return {
          key,
          label: repository?.fullName ?? key,
          url: repository?.url,
          source: "analysis",
          archived: repository?.archived ?? false,
          packageCount,
          analysisCount,
          lastPushAt: repository?.lastPushAt,
          avgOutlook12m: average(outlookValues),
          avgRisk: average(riskValues),
          avgSecurity: average(securityValues),
          avgConfidence: average(confidenceValues),
          scorecardScore: scorecardValues.length ? average(scorecardValues) : undefined,
          recentContributors90d: repository?.recentContributors90d
        } satisfies RepositoryRollup;
      })
      .sort((left, right) => left.avgOutlook12m - right.avgOutlook12m);
  }, [dependencies]);

  const trainingRepositoryRows = useMemo<RepositoryRollup[]>(() => {
    return (dataset?.repositories ?? []).map((repository) => {
      const inactiveRate = trainingInactiveRate(repository);
      const labeledCoverage = repository.snapshotCount > 0 ? repository.labeledSnapshotCount / repository.snapshotCount : 0;

      return {
        key: repository.url || repository.fullName,
        label: repository.fullName || repository.url,
        url: repository.url,
        source: "training",
        trainingRank: repository.rank,
        archived: repository.archived,
        packageCount: repository.packageCount,
        analysisCount: repository.analysisCount,
        snapshotCount: repository.snapshotCount,
        labeledSnapshotCount: repository.labeledSnapshotCount,
        inactiveLabelCount: repository.inactiveLabelCount,
        inactiveRate,
        lastPushAgeDays: repository.lastPushAgeDays,
        lastObservedAt: repository.lastObservedAt,
        avgOutlook12m: Math.max(0, 100 - inactiveRate * 100),
        avgRisk: inactiveRate * 100,
        avgSecurity: 0,
        avgConfidence: Math.round(Math.min(100, Math.max(35, 45 + labeledCoverage * 45))),
        recentContributors90d: repository.recentContributors90d
      } satisfies RepositoryRollup;
    });
  }, [dataset?.repositories]);

  const repositoryRows = useMemo<RepositoryRollup[]>(() => {
    const rowsByKey = new Map<string, RepositoryRollup>();
    for (const row of trainingRepositoryRows) {
      rowsByKey.set(row.key, row);
    }
    for (const row of analysisRepositoryRows) {
      const existing = rowsByKey.get(row.key);
      rowsByKey.set(row.key, existing ? { ...existing, ...row, source: "analysis" } : row);
    }
    return [...rowsByKey.values()].sort((left, right) => {
      if (left.source !== right.source) {
        return left.source === "analysis" ? -1 : 1;
      }
      if ((left.trainingRank ?? 0) !== (right.trainingRank ?? 0)) {
        return (left.trainingRank ?? Number.MAX_SAFE_INTEGER) - (right.trainingRank ?? Number.MAX_SAFE_INTEGER);
      }
      return left.avgOutlook12m - right.avgOutlook12m;
    });
  }, [analysisRepositoryRows, trainingRepositoryRows]);

  const packageRows = useMemo<PackageRollup[]>(() => {
    const buckets = new Map<string, DependencyRecord[]>();
    for (const dependency of dependencies) {
      const key = `${dependency.ecosystem}|${dependency.packageName}`;
      const current = buckets.get(key) ?? [];
      current.push(dependency);
      buckets.set(key, current);
    }

    return Array.from(buckets.entries())
      .map(([key, items]) => {
        const outlookValues = items.map((item) => item.riskProfile?.maintenanceOutlook12mScore ?? 0);
        const riskValues = items.map((item) => item.riskProfile?.inactivityRiskScore ?? 0);
        const securityValues = items.map((item) => item.riskProfile?.securityPostureScore ?? 0);
        const analysisCount = new Set(items.map((item) => item.analysisId)).size;
        const versions = new Set(items.map((item) => item.packageVersion)).size;
        const mappedRepositories = new Set(items.map((item) => item.repository?.fullName).filter(Boolean)).size;
        const latest = items
          .map((item) => item.repository?.lastPushAt)
          .filter((value): value is string => Boolean(value))
          .sort()
          .at(-1);

        return {
          key,
          packageName: items[0]?.packageName ?? key,
          ecosystem: items[0]?.ecosystem ?? "unknown",
          analysisCount,
          versionCount: versions,
          avgOutlook12m: average(outlookValues),
          avgRisk: average(riskValues),
          avgSecurity: average(securityValues),
          maxRisk: Math.max(...riskValues, 0),
          mappedRepositories,
          lastSeenAt: latest
        } satisfies PackageRollup;
      })
      .sort((left, right) => left.avgOutlook12m - right.avgOutlook12m);
  }, [dependencies]);

  const dependencyRows = useMemo<DependencyRankingRow[]>(() => {
    return dependencies
      .map((dependency) => ({
        key: dependency.id,
        analysisId: dependency.analysisId,
        dependencyId: dependency.id,
        packageName: dependency.packageName,
        packageVersion: dependency.packageVersion,
        ecosystem: dependency.ecosystem,
        repositoryName: dependency.repository?.fullName,
        outlook12m: dependency.riskProfile?.maintenanceOutlook12mScore ?? 0,
        risk: dependency.riskProfile?.inactivityRiskScore ?? 0,
        confidence: dependency.riskProfile?.confidenceScore ?? 0
      }))
      .sort((left, right) => {
        if (left.outlook12m !== right.outlook12m) {
          return left.outlook12m - right.outlook12m;
        }
        return right.risk - left.risk;
      });
  }, [dependencies]);

  const normalizedSearch = search.trim().toLowerCase();

  const filteredRepositories = repositoryRows.filter((repository) => {
    if (!normalizedSearch) {
      return true;
    }

    return [repository.label, repository.url ?? ""].join(" ").toLowerCase().includes(normalizedSearch);
  });

  const filteredPackages = packageRows.filter((pkg) => {
    if (!normalizedSearch) {
      return true;
    }

    return [pkg.packageName, pkg.ecosystem].join(" ").toLowerCase().includes(normalizedSearch);
  });

  const filteredDependencyRows = dependencyRows.filter((dependency) => {
    if (!normalizedSearch) {
      return true;
    }

    return [dependency.packageName, dependency.packageVersion, dependency.ecosystem, dependency.repositoryName ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(normalizedSearch);
  });

  const sortedRepositories = useMemo(() => {
    return [...filteredRepositories].sort((left, right) => {
      if (left.avgOutlook12m !== right.avgOutlook12m) {
        return repositoryOutlookSortDirection === "asc"
          ? left.avgOutlook12m - right.avgOutlook12m
          : right.avgOutlook12m - left.avgOutlook12m;
      }
      return left.label.localeCompare(right.label);
    });
  }, [filteredRepositories, repositoryOutlookSortDirection]);

  const sortedPackages = useMemo(() => {
    return [...filteredPackages].sort((left, right) => {
      if (left.avgOutlook12m !== right.avgOutlook12m) {
        return packageOutlookSortDirection === "asc"
          ? left.avgOutlook12m - right.avgOutlook12m
          : right.avgOutlook12m - left.avgOutlook12m;
      }
      return left.packageName.localeCompare(right.packageName);
    });
  }, [filteredPackages, packageOutlookSortDirection]);

  const inactiveRepositories = useMemo(
    () =>
      filteredRepositories.filter((repository) => {
        return repositoryActivityStatus(repository, timeframeDays) === "inactive";
      }),
    [filteredRepositories, timeframeDays]
  );

  const averageRepositoryConfidence = useMemo(
    () => (filteredRepositories.length ? average(filteredRepositories.map((repository) => repository.avgConfidence)) : 0),
    [filteredRepositories]
  );
  const averagePackageRisk = useMemo(
    () => (filteredPackages.length ? average(filteredPackages.map((pkg) => pkg.avgRisk)) : 0),
    [filteredPackages]
  );
  const trainingBaseRepositories = dataset?.repositories ?? [];
  const currentViewMeta = {
    repositories: {
      title: "Ranked source repositories",
      description: "Score and compare OSS projects using the same repository-level signals applied to new repository submissions.",
    },
    packages: {
      title: "Package-level snapshot",
      description: "Switch here for ecosystem and package coverage once the repository view has done its job.",
    },
    dependencies: {
      title: "Ranked dependency details",
      description: "Jump into the highest-risk dependency rows without keeping three large tables open on the same page.",
    },
  } satisfies Record<RadarView, { title: string; description: string }>;

  if (error) {
    return <Card className="text-sm text-danger">{error}</Card>;
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-5 overflow-hidden border-line bg-panel">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Repository radar</p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground lg:text-5xl">Rank OSS projects, packages, and dependency signals against the captured base.</h1>
            <p className="max-w-3xl text-sm leading-6 text-muted">
              Search once, choose the slice you care about, and compare a newly scored repository with the training-base context nearby.
            </p>
          </div>
          <div className="rounded-lg border border-line bg-foreground px-4 py-3 text-sm text-background">
            {repositoryRows.length} repos / {packageRows.length} packages / {filteredDependencyRows.length} dependency rows in the current filter
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <div className="space-y-3">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search repo, package, or ecosystem"
              className="bg-panel"
            />
            <div className="flex flex-wrap gap-2">
              {(["repositories", "packages", "dependencies"] as const).map((view) => (
                <button
                  key={view}
                  type="button"
                  onClick={() => setActiveView(view)}
                  className={`rounded-md border px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                    activeView === view
                      ? "border-foreground bg-foreground text-background"
                      : "border-line bg-panelAlt text-muted hover:border-accent/30 hover:text-foreground"
                  }`}
                >
                  {view}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {timeframeOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setTimeframeDays(option)}
                className={`rounded-md border px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                  timeframeDays === option
                    ? "border-foreground bg-foreground text-background"
                    : "border-line bg-panelAlt text-muted hover:border-accent/30 hover:text-foreground"
                }`}
              >
                {option}d window
              </button>
            ))}
          </div>
        </div>
      </Card>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="space-y-2">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Tracked repos</p>
          <p className="text-4xl font-semibold tracking-tight text-foreground">{repositoryRows.length}</p>
          <p className="text-sm text-muted">Mapped source repositories from live analyses and the real training base</p>
        </Card>
        <Card className="space-y-2">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Tracked packages</p>
          <p className="text-4xl font-semibold tracking-tight text-foreground">{dataset?.uniquePackages || packageRows.length}</p>
          <p className="text-sm text-muted">Distinct package rows available to the training and analysis surfaces</p>
        </Card>
        <Card className="space-y-2">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Inactive in {timeframeDays}d</p>
          <p className="text-4xl font-semibold tracking-tight text-foreground">{inactiveRepositories.length}</p>
          <p className="text-sm text-muted">Repos archived or stale inside the chosen activity window; missing push dates stay unknown</p>
        </Card>
        <Card className="space-y-2">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Training snapshots</p>
          <p className="text-4xl font-semibold tracking-tight text-foreground">{dataset?.totalSnapshots ?? 0}</p>
          <p className="text-sm text-muted">{dataset?.lastUpdatedAt ? `Updated ${formatDate(dataset.lastUpdatedAt)}` : "Waiting for the real historical dataset."}</p>
        </Card>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.28fr_0.72fr]">
        <Card className="space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-muted">Current View</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">{currentViewMeta[activeView].title}</h2>
              <p className="mt-2 text-sm text-muted">{currentViewMeta[activeView].description}</p>
            </div>
            <Badge tone={activeView === "repositories" && inactiveRepositories.length > 0 ? "high" : "neutral"}>
              {activeView}
            </Badge>
          </div>

          {activeView === "repositories" ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-[0.18em] text-muted">
                    <th className="pb-3 pr-4">Repo</th>
                    <th className="pb-3 pr-4">Window</th>
                    <th className="pb-3 pr-4">
                      <button
                        type="button"
                        onClick={() => setRepositoryOutlookSortDirection((current) => (current === "asc" ? "desc" : "asc"))}
                        className="inline-flex items-center gap-2 font-semibold text-muted transition hover:text-foreground"
                      >
                        12M outlook
                        <span className="text-[10px] uppercase">{repositoryOutlookSortDirection === "asc" ? "low" : "high"}</span>
                      </button>
                    </th>
                    <th className="pb-3 pr-4">Risk</th>
                    <th className="pb-3 pr-4">Confidence</th>
                    <th className="pb-3 pr-4">Scope</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedRepositories.map((repository) => {
                    const ageDays = repositoryAgeDays(repository);
                    const activityStatus = repositoryActivityStatus(repository, timeframeDays);
                    const isTrainingBase = repository.source === "training";

                    return (
                      <tr key={repository.key} className="border-b border-line/70 align-top">
                        <td className="py-4 pr-4">
                          <p className="font-semibold text-foreground">{repository.label}</p>
                          <p className="mt-1 text-xs text-muted">
                            {isTrainingBase
                              ? `Training base #${repository.trainingRank ?? "-"} / ${repository.snapshotCount ?? 0} snapshots`
                              : `${repository.scorecardScore ? `Scorecard ${repository.scorecardScore.toFixed(1)} / ` : ""}Security ${formatRiskScore(repository.avgSecurity)}`}
                          </p>
                        </td>
                        <td className="py-4 pr-4">
                          <Badge tone={activityStatus === "inactive" ? "high" : activityStatus === "active" ? "low" : "neutral"}>
                            {activityStatus === "inactive" ? "Inactive" : activityStatus === "active" ? "Active" : "Unknown"}
                          </Badge>
                          <p className="mt-2 text-xs text-muted">{repository.archived ? "Archived" : ageDays !== null ? `${ageDays} days since push` : "No push date from enrichment"}</p>
                        </td>
                        <td className="py-4 pr-4 font-semibold text-foreground">
                          {isTrainingBase ? `${Math.round(repository.avgOutlook12m)}% historical active` : formatOutlookScore(repository.avgOutlook12m)}
                        </td>
                        <td className="py-4 pr-4 font-semibold text-foreground">
                          {isTrainingBase ? `${Math.round((repository.inactiveRate ?? 0) * 100)}% inactive labels` : formatRiskScore(repository.avgRisk)}
                        </td>
                        <td className="py-4 pr-4 text-foreground">{formatConfidence(repository.avgConfidence)}</td>
                        <td className="py-4 pr-4 text-muted">
                          <p>{repository.packageCount} packages</p>
                          <p className="mt-1 text-xs">
                            {isTrainingBase
                              ? `${repository.labeledSnapshotCount ?? 0} labeled / ${repository.recentContributors90d ?? 0} recent contributors`
                              : `${repository.analysisCount} analyses / ${repository.recentContributors90d ?? 0} recent contributors`}
                          </p>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : null}

          {activeView === "packages" ? (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-xs uppercase tracking-[0.18em] text-muted">
                    <th className="pb-3 pr-4">Package</th>
                    <th className="pb-3 pr-4">Ecosystem</th>
                    <th className="pb-3 pr-4">
                      <button
                        type="button"
                        onClick={() => setPackageOutlookSortDirection((current) => (current === "asc" ? "desc" : "asc"))}
                        className="inline-flex items-center gap-2 font-semibold text-muted transition hover:text-foreground"
                      >
                        12M outlook
                        <span className="text-[10px] uppercase">{packageOutlookSortDirection === "asc" ? "low" : "high"}</span>
                      </button>
                    </th>
                    <th className="pb-3 pr-4">Worst risk</th>
                    <th className="pb-3 pr-4">Coverage</th>
                    <th className="pb-3 pr-4">Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedPackages.map((pkg) => (
                    <tr key={pkg.key} className="border-b border-line/70 align-top">
                      <td className="py-4 pr-4">
                        <p className="font-semibold text-foreground">{pkg.packageName}</p>
                        <p className="mt-1 text-xs text-muted">{pkg.versionCount} versions / Security {formatRiskScore(pkg.avgSecurity)}</p>
                      </td>
                      <td className="py-4 pr-4 text-foreground">{pkg.ecosystem}</td>
                      <td className="py-4 pr-4 font-semibold text-foreground">{formatOutlookScore(pkg.avgOutlook12m)}</td>
                      <td className="py-4 pr-4 font-semibold text-foreground">{formatRiskScore(pkg.maxRisk)}</td>
                      <td className="py-4 pr-4 text-muted">{pkg.analysisCount} analyses / {pkg.mappedRepositories} repos</td>
                      <td className="py-4 pr-4 text-muted">{pkg.lastSeenAt ? formatDate(pkg.lastSeenAt) : "Unknown"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {activeView === "dependencies" ? (
            <>
              <div className="overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-line text-xs uppercase tracking-[0.18em] text-muted">
                      <th className="pb-3 pr-4">Dependency</th>
                      <th className="pb-3 pr-4">Repo</th>
                      <th className="pb-3 pr-4">12M outlook</th>
                      <th className="pb-3 pr-4">Risk</th>
                      <th className="pb-3 pr-4">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDependencyRows.slice(0, 50).map((dependency) => (
                      <tr key={dependency.key} className="border-b border-line/70 align-top">
                        <td className="py-4 pr-4">
                          <p className="font-semibold text-foreground">{dependency.packageName}</p>
                          <p className="mt-1 text-xs text-muted">{dependency.packageVersion} / {dependency.ecosystem} / {formatConfidence(dependency.confidence)} confidence</p>
                        </td>
                        <td className="py-4 pr-4 text-muted">{dependency.repositoryName ?? "Unmapped"}</td>
                        <td className="py-4 pr-4 font-semibold text-foreground">{formatOutlookScore(dependency.outlook12m)}</td>
                        <td className="py-4 pr-4 text-foreground">{formatRiskScore(dependency.risk)}</td>
                        <td className="py-4 pr-4">
                          <Link
                            href={`/analyses/${dependency.analysisId}/dependencies/${dependency.dependencyId}`}
                            className="text-xs font-semibold uppercase tracking-[0.18em] text-accent"
                          >
                            Open detail
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {filteredDependencyRows.length > 50 ? (
                <p className="text-xs text-muted">Showing the first 50 ranked dependencies in the current filtered view.</p>
              ) : null}
            </>
          ) : null}

          {activeView === "repositories" && !filteredRepositories.length ? <p className="text-sm text-muted">No repositories match the current view. Add the historical snapshot export to the API training dataset or run a repository analysis.</p> : null}
          {activeView === "packages" && !filteredPackages.length ? <p className="text-sm text-muted">No package rows match the current view.</p> : null}
          {activeView === "dependencies" && !filteredDependencyRows.length ? <p className="text-sm text-muted">No dependency rows match the current search.</p> : null}
        </Card>

        <div className="grid gap-6">
          <Card className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-muted">Training Base</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Auto-growing dataset snapshot</h2>
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
              <div className="rounded-[1.25rem] border border-line bg-panelAlt/80 px-4 py-3 break-all">
                <span className="font-semibold text-foreground">Dataset file:</span> {dataset?.datasetPath ?? "tmp/training/snapshots.json"}
              </div>
            </div>
            <p className="text-sm text-muted">
              {dataset?.autoCaptureEnabled === false
                ? "Training auto-capture is disabled for this API instance."
                : "The historical snapshot export is the main training base; completed live analyses can add newer rows without replacing it."}
            </p>
          </Card>

          <Card className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs uppercase tracking-[0.24em] text-muted">Base Repos</p>
                <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Top training projects</h2>
              </div>
              <Link href="/ml-evaluation/dataset" className="text-sm font-semibold text-accent transition hover:text-foreground">
                Full list
              </Link>
            </div>
            {trainingBaseRepositories.length ? (
              <div className="space-y-3">
                {trainingBaseRepositories.slice(0, 5).map((repository) => (
                  <div key={repository.url} className="rounded-[1.25rem] border border-line bg-panelAlt/80 px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-foreground">{repository.fullName || repository.url}</p>
                        <p className="mt-1 text-xs text-muted">{repository.snapshotCount} snapshots / {repository.packageCount} packages</p>
                      </div>
                      <Badge tone="neutral">#{repository.rank}</Badge>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted">No real training repositories are available yet. Seed the API training dataset with the generated historical snapshot export.</p>
            )}
          </Card>

          <Card className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-muted">Current Slice</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Quick read</h2>
            </div>
            {activeView === "repositories" ? (
              <div className="space-y-3 text-sm text-muted">
                <div className="rounded-[1.25rem] border border-line bg-panelAlt/80 px-4 py-3">
                  <span className="font-semibold text-foreground">Filtered repos:</span> {filteredRepositories.length}
                </div>
                <div className="rounded-[1.25rem] border border-line bg-panelAlt/80 px-4 py-3">
                  <span className="font-semibold text-foreground">Inactive repos:</span> {inactiveRepositories.length}
                </div>
                <div className="rounded-[1.25rem] border border-line bg-panelAlt/80 px-4 py-3">
                  <span className="font-semibold text-foreground">Avg confidence:</span> {formatConfidence(averageRepositoryConfidence)}
                </div>
              </div>
            ) : null}
            {activeView === "packages" ? (
              <div className="space-y-3 text-sm text-muted">
                <div className="rounded-[1.25rem] border border-line bg-panelAlt/80 px-4 py-3">
                  <span className="font-semibold text-foreground">Filtered packages:</span> {filteredPackages.length}
                </div>
                <div className="rounded-[1.25rem] border border-line bg-panelAlt/80 px-4 py-3">
                  <span className="font-semibold text-foreground">Avg risk:</span> {formatRiskScore(averagePackageRisk)}
                </div>
                <div className="rounded-[1.25rem] border border-line bg-panelAlt/80 px-4 py-3">
                  <span className="font-semibold text-foreground">Packages with repo mapping:</span> {filteredPackages.filter((pkg) => pkg.mappedRepositories > 0).length}
                </div>
              </div>
            ) : null}
            {activeView === "dependencies" ? (
              <div className="space-y-3 text-sm text-muted">
                <div className="rounded-[1.25rem] border border-line bg-panelAlt/80 px-4 py-3">
                  <span className="font-semibold text-foreground">Filtered dependency rows:</span> {filteredDependencyRows.length}
                </div>
                <div className="rounded-[1.25rem] border border-line bg-panelAlt/80 px-4 py-3">
                  <span className="font-semibold text-foreground">Rows shown:</span> {Math.min(filteredDependencyRows.length, 50)}
                </div>
                <div className="rounded-[1.25rem] border border-line bg-panelAlt/80 px-4 py-3">
                  <span className="font-semibold text-foreground">Highest risk in slice:</span>{" "}
                  {filteredDependencyRows[0] ? formatRiskScore(filteredDependencyRows[0].risk) : "-"}
                </div>
              </div>
            ) : null}
          </Card>
        </div>
      </div>
    </div>
  );
}

