"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { InfoChipGroup } from "@/components/info-chip-group";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { getTrainingDatasetSummary, listAnalyses } from "@/lib/api";
import { formatConfidence, formatDate, formatOutlookScore, formatRiskScore } from "@/lib/format";
import { heuristicSignalGlossary } from "@/lib/metric-glossary";
import type { AnalysisRecord, DependencyRecord, TrainingDatasetSummary } from "@/lib/types";

interface RepositoryRollup {
  key: string;
  label: string;
  url?: string;
  archived: boolean;
  packageCount: number;
  analysisCount: number;
  lastPushAt?: string;
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

export function RepositoryRadar() {
  const [analyses, setAnalyses] = useState<AnalysisRecord[]>([]);
  const [dataset, setDataset] = useState<TrainingDatasetSummary | null>(null);
  const [timeframeDays, setTimeframeDays] = useState<(typeof timeframeOptions)[number]>(180);
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

        setAnalyses(analysisResponse.analyses.filter((analysis) => analysis.status === "completed"));
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

  const repositoryRows = useMemo<RepositoryRollup[]>(() => {
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
        const ageDays = daysSince(repository.lastPushAt);
        return repository.archived || ageDays === null || ageDays > timeframeDays;
      }),
    [filteredRepositories, timeframeDays]
  );

  if (error) {
    return <Card className="text-sm text-danger">{error}</Card>;
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="space-y-2">
            <p className="text-xs uppercase tracking-[0.24em] text-muted">Repository radar</p>
            <h1 className="text-3xl font-semibold tracking-tight text-foreground">Every tracked repo and OSS package in one compact view.</h1>
            <p className="text-sm text-muted">Filter by inactivity window, sort by 12-month outlook, and watch the training base expand when completed analyses land.</p>
          </div>
          <InfoChipGroup items={heuristicSignalGlossary} />
        </div>
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search repo, package, or ecosystem" />
          <div className="flex flex-wrap gap-2">
            {timeframeOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setTimeframeDays(option)}
                className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] transition ${
                  timeframeDays === option ? "border-accent/50 bg-accent/12 text-accent" : "border-line bg-panel text-muted hover:text-foreground"
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
        </Card>
        <Card className="space-y-2">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Tracked packages</p>
          <p className="text-4xl font-semibold tracking-tight text-foreground">{packageRows.length}</p>
        </Card>
        <Card className="space-y-2">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Inactive in {timeframeDays}d</p>
          <p className="text-4xl font-semibold tracking-tight text-foreground">{inactiveRepositories.length}</p>
        </Card>
        <Card className="space-y-2">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Training snapshots</p>
          <p className="text-4xl font-semibold tracking-tight text-foreground">{dataset?.totalSnapshots ?? 0}</p>
          <p className="text-sm text-muted">{dataset?.lastUpdatedAt ? `Updated ${formatDate(dataset.lastUpdatedAt)}` : "Waiting for completed analyses."}</p>
        </Card>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-muted">Repositories</p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Mapped source repos</h2>
            </div>
            <Badge tone={inactiveRepositories.length > 0 ? "high" : "low"}>{inactiveRepositories.length} inactive</Badge>
          </div>
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
                  <th className="pb-3 pr-4">Security</th>
                  <th className="pb-3 pr-4">Scorecard</th>
                  <th className="pb-3 pr-4">Confidence</th>
                  <th className="pb-3 pr-4">Scope</th>
                </tr>
              </thead>
              <tbody>
                {sortedRepositories.map((repository) => {
                  const ageDays = daysSince(repository.lastPushAt);
                  const inactive = repository.archived || ageDays === null || ageDays > timeframeDays;

                  return (
                    <tr key={repository.key} className="border-b border-line/70 align-top">
                      <td className="py-4 pr-4">
                        <p className="font-semibold text-foreground">{repository.label}</p>
                        <p className="mt-1 text-xs text-muted">{repository.url ?? "Unlinked URL"}</p>
                      </td>
                      <td className="py-4 pr-4">
                        <Badge tone={inactive ? "high" : "low"}>{inactive ? "Inactive" : "Active"}</Badge>
                        <p className="mt-2 text-xs text-muted">{repository.archived ? "Archived" : ageDays !== null ? `${ageDays} days since push` : "No push date"}</p>
                      </td>
                      <td className="py-4 pr-4 font-semibold text-foreground">{formatOutlookScore(repository.avgOutlook12m)}</td>
                      <td className="py-4 pr-4 font-semibold text-foreground">{formatRiskScore(repository.avgRisk)}</td>
                      <td className="py-4 pr-4 font-semibold text-foreground">{formatRiskScore(repository.avgSecurity)}</td>
                      <td className="py-4 pr-4 text-foreground">{repository.scorecardScore ? repository.scorecardScore.toFixed(1) : "-"}</td>
                      <td className="py-4 pr-4 text-foreground">{formatConfidence(repository.avgConfidence)}</td>
                      <td className="py-4 pr-4 text-muted">
                        <p>{repository.packageCount} packages</p>
                        <p className="mt-1 text-xs">{repository.analysisCount} analyses / {repository.recentContributors90d ?? 0} recent contributors</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!filteredRepositories.length ? <p className="text-sm text-muted">No mapped repositories match the current view.</p> : null}
        </Card>

        <Card className="space-y-4">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Training base</p>
          <h2 className="text-2xl font-semibold tracking-tight text-foreground">Auto-growing dataset snapshot</h2>
          <div className="space-y-3 text-sm text-muted">
            <div className="rounded-[1.25rem] border border-line bg-panelAlt/80 px-4 py-3">
              <span className="font-semibold text-foreground">Unique repos:</span> {dataset?.uniqueRepositories ?? 0}
            </div>
            <div className="rounded-[1.25rem] border border-line bg-panelAlt/80 px-4 py-3">
              <span className="font-semibold text-foreground">Unique packages:</span> {dataset?.uniquePackages ?? 0}
            </div>
            <div className="rounded-[1.25rem] border border-line bg-panelAlt/80 px-4 py-3">
              <span className="font-semibold text-foreground">Completed analyses captured:</span> {dataset?.uniqueAnalyses ?? 0}
            </div>
            <div className="rounded-[1.25rem] border border-line bg-panelAlt/80 px-4 py-3 break-all">
              <span className="font-semibold text-foreground">Dataset file:</span> {dataset?.datasetPath ?? "tmp/training/snapshots.json"}
            </div>
          </div>
          <p className="text-sm text-muted">
            {dataset?.autoCaptureEnabled === false
              ? "Training auto-capture is disabled for this API instance."
              : "Each completed repository analysis is converted into snapshot rows for the ML training base automatically."}
          </p>
        </Card>
      </div>

      <Card className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Dependency ranking</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Individual dependency outlook table</h2>
          <p className="mt-2 text-sm text-muted">Every analyzed dependency stays clickable from the overview page so you can jump straight into the evidence trail.</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-[0.18em] text-muted">
                <th className="pb-3 pr-4">Dependency</th>
                <th className="pb-3 pr-4">Repo</th>
                <th className="pb-3 pr-4">12M outlook</th>
                <th className="pb-3 pr-4">Risk</th>
                <th className="pb-3 pr-4">Confidence</th>
                <th className="pb-3 pr-4">Detail</th>
              </tr>
            </thead>
            <tbody>
              {filteredDependencyRows.slice(0, 50).map((dependency) => (
                <tr key={dependency.key} className="border-b border-line/70 align-top">
                  <td className="py-4 pr-4">
                    <p className="font-semibold text-foreground">{dependency.packageName}</p>
                    <p className="mt-1 text-xs text-muted">{dependency.packageVersion} - {dependency.ecosystem}</p>
                  </td>
                  <td className="py-4 pr-4 text-muted">{dependency.repositoryName ?? "Unmapped"}</td>
                  <td className="py-4 pr-4 font-semibold text-foreground">{formatOutlookScore(dependency.outlook12m)}</td>
                  <td className="py-4 pr-4 text-foreground">{formatRiskScore(dependency.risk)}</td>
                  <td className="py-4 pr-4 text-foreground">{formatConfidence(dependency.confidence)}</td>
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
        {!filteredDependencyRows.length ? <p className="text-sm text-muted">No dependency rows match the current search.</p> : null}
        {filteredDependencyRows.length > 50 ? (
          <p className="text-xs text-muted">Showing the first 50 ranked dependencies in the current filtered view.</p>
        ) : null}
      </Card>

      <Card className="space-y-4">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-muted">OSS tools</p>
          <h2 className="mt-1 text-2xl font-semibold tracking-tight text-foreground">Package-level performance snapshot</h2>
        </div>
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
                <th className="pb-3 pr-4">Avg risk</th>
                <th className="pb-3 pr-4">Security</th>
                <th className="pb-3 pr-4">Coverage</th>
                <th className="pb-3 pr-4">Last seen</th>
              </tr>
            </thead>
            <tbody>
              {sortedPackages.map((pkg) => (
                <tr key={pkg.key} className="border-b border-line/70 align-top">
                  <td className="py-4 pr-4">
                    <p className="font-semibold text-foreground">{pkg.packageName}</p>
                    <p className="mt-1 text-xs text-muted">{pkg.versionCount} versions across analyses</p>
                  </td>
                  <td className="py-4 pr-4 text-foreground">{pkg.ecosystem}</td>
                  <td className="py-4 pr-4 font-semibold text-foreground">{formatOutlookScore(pkg.avgOutlook12m)}</td>
                  <td className="py-4 pr-4 font-semibold text-foreground">{formatRiskScore(pkg.maxRisk)}</td>
                  <td className="py-4 pr-4 text-foreground">{formatRiskScore(pkg.avgRisk)}</td>
                  <td className="py-4 pr-4 text-foreground">{formatRiskScore(pkg.avgSecurity)}</td>
                  <td className="py-4 pr-4 text-muted">{pkg.analysisCount} analyses / {pkg.mappedRepositories} repos</td>
                  <td className="py-4 pr-4 text-muted">{pkg.lastSeenAt ? formatDate(pkg.lastSeenAt) : "Unknown"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

