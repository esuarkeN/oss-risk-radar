"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatEvidenceSupport, formatDate, formatOutlookScore, formatRiskScore } from "@/lib/format";
import {
  repositoryActivityStatus,
  repositoryAgeDays,
  riskGrade,
  sourceBadge,
  timeframeOptions,
  useRepositoryRadarData,
  type Timeframe,
} from "@/lib/repository-radar-data";

type RadarView = "repositories" | "packages" | "dependencies";
type OutlookSortDirection = "asc" | "desc";
type SourceFilter = "all" | "analysis" | "training";
type GradeFilter = "all" | "low" | "medium" | "high" | "critical";

const viewLabels: Record<RadarView, string> = {
  repositories: "Repositories",
  packages: "Packages",
  dependencies: "Dependencies",
};

export function RepositoryDirectory() {
  const { repositoryRows, packageRows, dependencyRows, dataset, error, loading } = useRepositoryRadarData();

  const [activeView, setActiveView] = useState<RadarView>("repositories");
  const [search, setSearch] = useState("");
  const [timeframeDays, setTimeframeDays] = useState<Timeframe>(180);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>("all");
  const [outlookSortDirection, setOutlookSortDirection] = useState<OutlookSortDirection>("asc");

  const normalizedSearch = search.trim().toLowerCase();

  const filteredRepositories = useMemo(() => {
    const rows = repositoryRows.filter((repository) => {
      if (sourceFilter !== "all" && repository.source !== sourceFilter) {
        return false;
      }
      if (gradeFilter !== "all" && riskGrade(repository.avgRisk).tone !== gradeFilter) {
        return false;
      }
      if (normalizedSearch && ![repository.label, repository.url ?? ""].join(" ").toLowerCase().includes(normalizedSearch)) {
        return false;
      }
      return true;
    });

    return rows.sort((left, right) => {
      if (left.avgOutlook12m !== right.avgOutlook12m) {
        return outlookSortDirection === "asc" ? left.avgOutlook12m - right.avgOutlook12m : right.avgOutlook12m - left.avgOutlook12m;
      }
      return left.label.localeCompare(right.label);
    });
  }, [repositoryRows, sourceFilter, gradeFilter, normalizedSearch, outlookSortDirection]);

  const filteredPackages = useMemo(() => {
    return packageRows.filter((pkg) =>
      !normalizedSearch ? true : [pkg.packageName, pkg.ecosystem].join(" ").toLowerCase().includes(normalizedSearch),
    );
  }, [packageRows, normalizedSearch]);

  const filteredDependencyRows = useMemo(() => {
    return dependencyRows.filter((dependency) =>
      !normalizedSearch
        ? true
        : [dependency.packageName, dependency.packageVersion, dependency.ecosystem, dependency.repositoryName ?? ""]
            .join(" ")
            .toLowerCase()
            .includes(normalizedSearch),
    );
  }, [dependencyRows, normalizedSearch]);

  const visibleCount =
    activeView === "repositories" ? filteredRepositories.length : activeView === "packages" ? filteredPackages.length : filteredDependencyRows.length;
  const totalCount =
    activeView === "repositories" ? repositoryRows.length : activeView === "packages" ? packageRows.length : dependencyRows.length;

  if (error) {
    return <Card className="text-sm text-danger">{error}</Card>;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3">
        <Link href="/repositories" className="inline-flex w-fit items-center gap-1.5 text-sm font-semibold text-accent transition hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden="true" /> Back to overview
        </Link>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Repository directory</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-foreground">Every graded repository</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted">
              The full database — user-submitted analyses and the model&apos;s training base — searchable and scrollable in one table.
            </p>
          </div>
          <span className="rounded-lg border border-line bg-foreground px-3 py-1.5 text-sm font-medium text-background">
            {loading ? "Loading…" : `${visibleCount} of ${totalCount} ${viewLabels[activeView].toLowerCase()}`}
          </span>
        </div>
      </div>

      {/* Toolbar */}
      <Card className="space-y-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search repo, package, or ecosystem"
            className="lg:max-w-md"
          />
          <div className="flex flex-wrap gap-2">
            {(Object.keys(viewLabels) as RadarView[]).map((view) => (
              <button
                key={view}
                type="button"
                onClick={() => setActiveView(view)}
                className={`rounded-md border px-3.5 py-2 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                  activeView === view
                    ? "border-foreground bg-foreground text-background"
                    : "border-line bg-panelAlt text-muted hover:border-accent/30 hover:text-foreground"
                }`}
              >
                {viewLabels[view]}
              </button>
            ))}
          </div>
        </div>

        {activeView === "repositories" ? (
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
            <select
              value={sourceFilter}
              onChange={(event) => setSourceFilter(event.target.value as SourceFilter)}
              className="h-9 rounded-md border border-line bg-panelAlt px-3 text-sm text-foreground outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/10"
            >
              <option value="all">All sources</option>
              <option value="analysis">User-submitted</option>
              <option value="training">Training data</option>
            </select>
            <select
              value={gradeFilter}
              onChange={(event) => setGradeFilter(event.target.value as GradeFilter)}
              className="h-9 rounded-md border border-line bg-panelAlt px-3 text-sm text-foreground outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/10"
            >
              <option value="all">All grades</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
            <div className="ml-auto flex flex-wrap gap-1.5">
              {timeframeOptions.map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => setTimeframeDays(option)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] transition ${
                    timeframeDays === option
                      ? "border-foreground bg-foreground text-background"
                      : "border-line bg-panelAlt text-muted hover:border-accent/30 hover:text-foreground"
                  }`}
                >
                  {option}d
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </Card>

      {/* Data grid */}
      <Card className="overflow-hidden p-0">
        <div className="max-h-[70vh] overflow-auto">
          {activeView === "repositories" ? (
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-panel">
                <tr className="border-b border-line text-xs uppercase tracking-[0.16em] text-muted">
                  <th className="px-4 py-3">Repo</th>
                  <th className="px-4 py-3">Source</th>
                  <th className="px-4 py-3">Window</th>
                  <th className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setOutlookSortDirection((current) => (current === "asc" ? "desc" : "asc"))}
                      className="inline-flex items-center gap-1.5 font-semibold text-muted transition hover:text-foreground"
                    >
                      12M outlook <span className="text-[9px]">{outlookSortDirection === "asc" ? "▲" : "▼"}</span>
                    </button>
                  </th>
                  <th className="px-4 py-3">Risk grade</th>
                  <th className="px-4 py-3">Evidence support</th>
                  <th className="px-4 py-3">Scope</th>
                </tr>
              </thead>
              <tbody>
                {filteredRepositories.map((repository) => {
                  const ageDays = repositoryAgeDays(repository);
                  const activityStatus = repositoryActivityStatus(repository, timeframeDays);
                  const isTrainingBase = repository.source === "training";
                  const source = sourceBadge(repository.source);
                  const grade = riskGrade(repository.avgRisk);

                  return (
                    <tr key={repository.key} className="border-b border-line/60 align-top transition-colors hover:bg-panelAlt/60">
                      <td className="px-4 py-3">
                        {repository.url ? (
                          <a href={repository.url} target="_blank" rel="noreferrer" className="font-semibold text-foreground transition hover:text-accent">
                            {repository.label}
                          </a>
                        ) : (
                          <p className="font-semibold text-foreground">{repository.label}</p>
                        )}
                        <p className="mt-1 text-xs text-muted">
                          {isTrainingBase
                            ? `Training base #${repository.trainingRank ?? "-"} / ${repository.snapshotCount ?? 0} snapshots`
                            : `${repository.scorecardScore ? `Scorecard ${repository.scorecardScore.toFixed(1)} / ` : ""}Security ${formatRiskScore(repository.avgSecurity)}`}
                        </p>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={source.tone}>{source.label}</Badge>
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={activityStatus === "inactive" ? "high" : activityStatus === "active" ? "low" : "neutral"}>
                          {activityStatus === "inactive" ? "Inactive" : activityStatus === "active" ? "Active" : "Unknown"}
                        </Badge>
                        <p className="mt-1.5 text-xs text-muted">{repository.archived ? "Archived" : ageDays !== null ? `${ageDays}d since push` : "No push date"}</p>
                      </td>
                      <td className="px-4 py-3 font-semibold text-foreground">
                        {isTrainingBase ? `${Math.round(repository.avgOutlook12m)}% active` : formatOutlookScore(repository.avgOutlook12m)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={grade.tone}>{grade.label}</Badge>
                        <p className="mt-1.5 text-xs text-muted">
                          {isTrainingBase ? `${Math.round((repository.inactiveRate ?? 0) * 100)}% inactive` : `${formatRiskScore(repository.avgRisk)} risk`}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-foreground">{formatEvidenceSupport(repository.avgEvidenceSupport)}</td>
                      <td className="px-4 py-3 text-muted">
                        <p>{repository.packageCount} packages</p>
                        <p className="mt-1 text-xs">
                          {isTrainingBase
                            ? `${repository.labeledSnapshotCount ?? 0} labeled / ${repository.recentContributors90d ?? 0} contributors`
                            : `${repository.analysisCount} analyses / ${repository.recentContributors90d ?? 0} contributors`}
                        </p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : null}

          {activeView === "packages" ? (
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-panel">
                <tr className="border-b border-line text-xs uppercase tracking-[0.16em] text-muted">
                  <th className="px-4 py-3">Package</th>
                  <th className="px-4 py-3">Ecosystem</th>
                  <th className="px-4 py-3">12M outlook</th>
                  <th className="px-4 py-3">Worst risk</th>
                  <th className="px-4 py-3">Coverage</th>
                  <th className="px-4 py-3">Last seen</th>
                </tr>
              </thead>
              <tbody>
                {filteredPackages.map((pkg) => (
                  <tr key={pkg.key} className="border-b border-line/60 align-top transition-colors hover:bg-panelAlt/60">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-foreground">{pkg.packageName}</p>
                      <p className="mt-1 text-xs text-muted">{pkg.versionCount} versions / Security {formatRiskScore(pkg.avgSecurity)}</p>
                    </td>
                    <td className="px-4 py-3 text-foreground">{pkg.ecosystem}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{formatOutlookScore(pkg.avgOutlook12m)}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{formatRiskScore(pkg.maxRisk)}</td>
                    <td className="px-4 py-3 text-muted">{pkg.analysisCount} analyses / {pkg.mappedRepositories} repos</td>
                    <td className="px-4 py-3 text-muted">{pkg.lastSeenAt ? formatDate(pkg.lastSeenAt) : "Unknown"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}

          {activeView === "dependencies" ? (
            <table className="min-w-full text-left text-sm">
              <thead className="sticky top-0 z-10 bg-panel">
                <tr className="border-b border-line text-xs uppercase tracking-[0.16em] text-muted">
                  <th className="px-4 py-3">Dependency</th>
                  <th className="px-4 py-3">Repo</th>
                  <th className="px-4 py-3">12M outlook</th>
                  <th className="px-4 py-3">Risk</th>
                  <th className="px-4 py-3">Detail</th>
                </tr>
              </thead>
              <tbody>
                {filteredDependencyRows.map((dependency) => (
                  <tr key={dependency.key} className="border-b border-line/60 align-top transition-colors hover:bg-panelAlt/60">
                    <td className="px-4 py-3">
                      <p className="font-semibold text-foreground">{dependency.packageName}</p>
                      <p className="mt-1 text-xs text-muted">{dependency.packageVersion} / {dependency.ecosystem} / {formatEvidenceSupport(dependency.evidenceSupport)} evidence support</p>
                    </td>
                    <td className="px-4 py-3 text-muted">{dependency.repositoryName ?? "Unmapped"}</td>
                    <td className="px-4 py-3 font-semibold text-foreground">{formatOutlookScore(dependency.outlook12m)}</td>
                    <td className="px-4 py-3 text-foreground">{formatRiskScore(dependency.risk)}</td>
                    <td className="px-4 py-3">
                      <Link
                        href={`/analyses/${dependency.analysisId}/dependencies/${dependency.dependencyId}`}
                        className="text-xs font-semibold uppercase tracking-[0.16em] text-accent"
                      >
                        Open detail
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>

        {!loading && visibleCount === 0 ? (
          <p className="border-t border-line px-4 py-8 text-sm text-muted">
            No {viewLabels[activeView].toLowerCase()} match the current filters. Loosen the search or filters, or run a repository analysis.
          </p>
        ) : null}
      </Card>

      {dataset?.datasetPath ? (
        <p className="px-1 text-xs text-muted">
          Training base: {dataset.uniqueRepositories ?? 0} repos / {dataset.totalSnapshots ?? 0} snapshots
          {dataset.lastUpdatedAt ? ` · updated ${formatDate(dataset.lastUpdatedAt)}` : ""}
        </p>
      ) : null}
    </div>
  );
}
