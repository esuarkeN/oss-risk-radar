"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";

import type { DependencyFilterState, DependencyRecord, Ecosystem } from "@/lib/types";

import { RiskBadge } from "@/components/risk-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatConfidence, formatOutlookScore, formatPath, formatRiskScore, titleCase } from "@/lib/format";
import { dependencyDisplayName, dependencyDisplayVersion, isRepositoryProfile } from "@/lib/repository-profile";

interface DependencyTableProps {
  dependencies: DependencyRecord[];
  selectedDependencyId?: string;
  onSelectDependency?: (dependencyId: string) => void;
}

type OutlookSortDirection = "asc" | "desc";

const bucketRowBorder: Record<string, string> = {
  critical: "border-l-[hsl(var(--danger))]",
  high: "border-l-[hsl(var(--warning))]",
  medium: "border-l-[hsl(var(--accent))]",
  low: "border-l-[hsl(var(--success))]",
};

export function DependencyTable({ dependencies, selectedDependencyId, onSelectDependency }: DependencyTableProps) {
  const [filters, setFilters] = useState<DependencyFilterState>({
    search: "",
    bucket: "all",
    ecosystem: "all",
    directOnly: false
  });
  const [mappedOnly, setMappedOnly] = useState(false);
  const [outlookSortDirection, setOutlookSortDirection] = useState<OutlookSortDirection>("asc");
  const deferredSearch = useDeferredValue(filters.search);

  const ecosystems = useMemo(() => {
    return Array.from(new Set(dependencies.map((dependency) => dependency.ecosystem as Ecosystem))).sort();
  }, [dependencies]);

  const filteredDependencies = useMemo(() => {
    return dependencies.filter((dependency) => {
      const haystack = [
        dependency.packageName,
        dependency.packageVersion,
        dependency.ecosystem,
        dependency.repository?.fullName ?? "",
        dependency.dependencyPath.join(" ")
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch = haystack.includes(deferredSearch.toLowerCase());
      const matchesBucket = filters.bucket === "all" || dependency.riskProfile?.riskBucket === filters.bucket;
      const matchesEcosystem = filters.ecosystem === "all" || dependency.ecosystem === filters.ecosystem;
      const matchesDirect = !filters.directOnly || dependency.direct;
      const matchesMapped = !mappedOnly || Boolean(dependency.repository?.fullName);

      return matchesSearch && matchesBucket && matchesEcosystem && matchesDirect && matchesMapped;
    });
  }, [deferredSearch, dependencies, filters, mappedOnly]);

  const sortedDependencies = useMemo(() => {
    return [...filteredDependencies].sort((left, right) => {
      const leftValue = left.riskProfile?.maintenanceOutlook12mScore ?? 0;
      const rightValue = right.riskProfile?.maintenanceOutlook12mScore ?? 0;
      if (leftValue !== rightValue) {
        return outlookSortDirection === "asc" ? leftValue - rightValue : rightValue - leftValue;
      }
      return left.packageName.localeCompare(right.packageName);
    });
  }, [filteredDependencies, outlookSortDirection]);

  const bucketCounts = dependencies.reduce<Record<string, number>>((counts, dependency) => {
    const bucket = dependency.riskProfile?.riskBucket ?? "unscored";
    counts[bucket] = (counts[bucket] ?? 0) + 1;
    return counts;
  }, {});

  function resetFilters() {
    setFilters({
      search: "",
      bucket: "all",
      ecosystem: "all",
      directOnly: false
    });
    setMappedOnly(false);
  }

  return (
    <Card className="space-y-4">
      {/* Header + bucket filter buttons */}
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">Repository and Dependency Inventory</h3>
          <p className="mt-0.5 text-xs text-muted">
            Filter by risk, ecosystem, depth, and repository coverage.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {(["critical", "high", "medium", "low"] as const).map((bucket) => (
            <button
              key={bucket}
              type="button"
              onClick={() => setFilters((current) => ({ ...current, bucket: current.bucket === bucket ? "all" : bucket }))}
              className={`rounded-md border px-2.5 py-1.5 text-xs font-semibold uppercase tracking-[0.12em] transition ${
                filters.bucket === bucket
                  ? "border-accent/40 bg-accent/10 text-foreground"
                  : "border-line text-muted hover:border-accent/30 hover:text-foreground"
              }`}
            >
              {bucket} <span className="opacity-60">{bucketCounts[bucket] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Filter row — compact single row */}
      <div className="flex flex-wrap gap-2">
        <input
          className="h-9 min-w-48 flex-1 rounded-md border border-line bg-panelAlt px-3 text-sm outline-none placeholder:text-muted focus:border-accent/60 focus:ring-2 focus:ring-accent/10"
          placeholder="Search package, path, repo…"
          value={filters.search}
          onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
        />
        <select
          className="h-9 rounded-md border border-line bg-panelAlt px-3 text-sm text-foreground outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/10"
          value={filters.bucket}
          onChange={(event) => setFilters((current) => ({ ...current, bucket: event.target.value as DependencyFilterState["bucket"] }))}
        >
          <option value="all">All buckets</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          className="h-9 rounded-md border border-line bg-panelAlt px-3 text-sm text-foreground outline-none focus:border-accent/60 focus:ring-2 focus:ring-accent/10"
          value={filters.ecosystem}
          onChange={(event) => setFilters((current) => ({ ...current, ecosystem: event.target.value as DependencyFilterState["ecosystem"] }))}
        >
          <option value="all">All ecosystems</option>
          {ecosystems.map((ecosystem) => (
            <option key={ecosystem} value={ecosystem}>
              {ecosystem}
            </option>
          ))}
        </select>
        <label className="flex h-9 items-center gap-2 rounded-md border border-line bg-panelAlt px-3 text-sm text-muted">
          <input
            type="checkbox"
            checked={filters.directOnly}
            onChange={(event) => setFilters((current) => ({ ...current, directOnly: event.target.checked }))}
            className="h-3.5 w-3.5 rounded border-line"
          />
          Direct
        </label>
        <label className="flex h-9 items-center gap-2 rounded-md border border-line bg-panelAlt px-3 text-sm text-muted">
          <input
            type="checkbox"
            checked={mappedOnly}
            onChange={(event) => setMappedOnly(event.target.checked)}
            className="h-3.5 w-3.5 rounded border-line"
          />
          Mapped
        </label>
      </div>

      {/* Status bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-panelAlt px-3 py-2 text-xs text-muted">
        <p>
          <span className="font-semibold text-foreground">{filteredDependencies.length}</span> of {dependencies.length} entries
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {filters.directOnly ? <Badge tone="neutral">Direct only</Badge> : null}
          {mappedOnly ? <Badge tone="neutral">Mapped repos</Badge> : null}
          {filters.bucket !== "all" ? <Badge tone={filters.bucket}>{filters.bucket}</Badge> : null}
          {filters.ecosystem !== "all" ? <Badge tone="neutral">{filters.ecosystem}</Badge> : null}
          {filters.search ? <Badge tone="neutral">&ldquo;{filters.search}&rdquo;</Badge> : null}
          <Button type="button" onClick={resetFilters} className="h-auto border-transparent bg-transparent px-0 py-0 text-xs text-accent hover:bg-transparent hover:text-foreground">
            Reset
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm">
          <thead>
            <tr className="text-xs font-semibold uppercase tracking-[0.12em] text-muted">
              <th className="pb-2 pl-4">Package</th>
              <th className="pb-2 px-3">Risk</th>
              <th className="pb-2 px-3">
                <button
                  type="button"
                  onClick={() => setOutlookSortDirection((current) => (current === "asc" ? "desc" : "asc"))}
                  className="inline-flex items-center gap-1.5 font-semibold text-muted transition hover:text-foreground"
                >
                  12M Outlook
                  <span className="text-[9px] opacity-70">{outlookSortDirection === "asc" ? "▲" : "▼"}</span>
                </button>
              </th>
              <th className="pb-2 px-3">Confidence</th>
              <th className="pb-2 px-3">Repository</th>
              <th className="pb-2 px-3">Path depth</th>
              <th className="pb-2 px-3">Explore</th>
            </tr>
          </thead>
          <tbody>
            {sortedDependencies.map((dependency) => {
              const selected = dependency.id === selectedDependencyId;
              const repositoryProfile = isRepositoryProfile(dependency);
              const bucket = dependency.riskProfile?.riskBucket;
              const borderClass = bucket ? bucketRowBorder[bucket] : undefined;

              return (
                <tr
                  key={dependency.id}
                  className={`text-muted border-l-2 ${selected ? "bg-accent/10 border-l-[hsl(var(--accent))]" : `bg-panelAlt ${borderClass ?? "border-l-transparent"}`}`}
                >
                  <td className="rounded-l-lg pl-4 pr-3 py-2.5 align-top">
                    <Link
                      href={`/analyses/${dependency.analysisId}/dependencies/${dependency.id}`}
                      className="font-semibold text-foreground transition hover:text-accent"
                    >
                      {dependencyDisplayName(dependency)}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted">{dependencyDisplayVersion(dependency)}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      <Badge tone={repositoryProfile ? "neutral" : dependency.direct ? "medium" : "neutral"}>
                        {repositoryProfile ? "Repository target" : dependency.direct ? "Direct" : "Transitive"}
                      </Badge>
                      <Badge tone="neutral">{repositoryProfile ? "repository" : dependency.ecosystem}</Badge>
                      {dependency.parsedFromUploadId ? <Badge tone="neutral">Upload-backed</Badge> : null}
                    </div>
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <div className="flex items-center gap-2">
                      <RiskBadge bucket={dependency.riskProfile?.riskBucket} />
                      <span className="font-medium text-foreground">{formatRiskScore(dependency.riskProfile?.inactivityRiskScore ?? 0)}</span>
                    </div>
                    <p className="mt-1 text-xs uppercase tracking-[0.12em] text-muted">
                      {titleCase(dependency.riskProfile?.actionLevel ?? "monitor")}
                    </p>
                    {dependency.riskProfile?.scoringMethod ? (
                      <p className="mt-0.5 text-xs text-muted">
                        {dependency.riskProfile.scoringMethod === "model_ensemble"
                          ? `ML ensemble (${dependency.riskProfile.modelResults?.length ?? 0})`
                          : dependency.riskProfile.scoringMethod === "model"
                          ? `ML ${dependency.riskProfile.scoringModel ?? ""}`.trim()
                          : titleCase(dependency.riskProfile.scoringMethod)}
                      </p>
                    ) : null}
                    {dependency.riskProfile?.modelResults?.length ? (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {dependency.riskProfile.modelResults.map((result) => (
                          <Badge key={result.modelName} tone={result.riskBucket}>
                            {result.modelName.replace("-baseline", "")}: {formatRiskScore(result.inactivityRiskScore)}
                          </Badge>
                        ))}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2.5 align-top font-medium text-foreground">
                    {formatOutlookScore(dependency.riskProfile?.maintenanceOutlook12mScore ?? 0)}
                  </td>
                  <td className="px-3 py-2.5 align-top">{formatConfidence(dependency.riskProfile?.confidenceScore ?? 0)}</td>
                  <td className="px-3 py-2.5 align-top text-muted">
                    <p className="font-medium text-foreground">{dependency.repository?.fullName ?? "Unmapped"}</p>
                    <p className="mt-0.5 text-xs">{dependency.rawSignalsAvailable ? "Raw signals attached" : "Signal snapshot pending"}</p>
                  </td>
                  <td className="px-3 py-2.5 align-top text-muted">
                    <p className="font-medium text-foreground">{repositoryProfile ? "Repository scope" : `Depth ${Math.max(dependency.dependencyPath.length - 1, 0)}`}</p>
                    <p className="mt-0.5 max-w-[12rem] truncate text-xs">{repositoryProfile ? dependency.repository?.url ?? formatPath(dependency.dependencyPath) : formatPath(dependency.dependencyPath)}</p>
                  </td>
                  <td className="rounded-r-lg px-3 py-2.5 align-top">
                    <div className="flex flex-col gap-1.5">
                      {onSelectDependency ? (
                        <Button
                          type="button"
                          onClick={() => onSelectDependency(dependency.id)}
                          className={`text-xs ${selected ? "border-accent/30 bg-accent/15 text-accent hover:text-background" : ""}`}
                        >
                          {selected ? (repositoryProfile ? "Viewing profile" : "Viewing path") : (repositoryProfile ? "View profile" : "Explore path")}
                        </Button>
                      ) : null}
                      <Link
                        href={`/analyses/${dependency.analysisId}/dependencies/${dependency.id}`}
                        className="text-xs font-semibold uppercase tracking-[0.12em] text-accent"
                      >
                        Open detail
                      </Link>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {!filteredDependencies.length ? (
        <div className="rounded-lg border border-dashed border-line px-5 py-8 text-sm text-muted">
          No repository or dependency entries matched the current filter set. Loosen the search or bucket filters to widen the analysis slice.
        </div>
      ) : null}
    </Card>
  );
}
