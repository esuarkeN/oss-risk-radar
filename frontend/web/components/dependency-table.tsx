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
    <Card className="space-y-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-950">Repository and Dependency Inventory</h3>
          <p className="mt-1 text-sm text-slate-500">
            Filter the repository target and resolved packages by risk, ecosystem, dependency depth, and repository coverage before opening detail views.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["critical", "high", "medium", "low"] as const).map((bucket) => (
            <button
              key={bucket}
              type="button"
              onClick={() => setFilters((current) => ({ ...current, bucket: current.bucket === bucket ? "all" : bucket }))}
              className="rounded-full border border-slate-200 px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-600 transition hover:border-sky-300 hover:text-sky-800"
            >
              {bucket} {bucketCounts[bucket] ?? 0}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_repeat(4,minmax(0,0.8fr))]">
        <input
          className="h-11 rounded-full border border-slate-200 px-4 text-sm outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
          placeholder="Search repository, package, path"
          value={filters.search}
          onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
        />
        <select
          className="h-11 rounded-full border border-slate-200 px-4 text-sm outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
          value={filters.bucket}
          onChange={(event) => setFilters((current) => ({ ...current, bucket: event.target.value as DependencyFilterState["bucket"] }))}
        >
          <option value="all">All risk buckets</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select
          className="h-11 rounded-full border border-slate-200 px-4 text-sm outline-none focus:border-sky-300 focus:ring-4 focus:ring-sky-100"
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
        <label className="flex h-11 items-center gap-3 rounded-full border border-slate-200 px-4 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={filters.directOnly}
            onChange={(event) => setFilters((current) => ({ ...current, directOnly: event.target.checked }))}
            className="h-4 w-4 rounded border-slate-300"
          />
          Direct only
        </label>
        <label className="flex h-11 items-center gap-3 rounded-full border border-slate-200 px-4 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={mappedOnly}
            onChange={(event) => setMappedOnly(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300"
          />
          Mapped repos only
        </label>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
        <p>
          Showing <span className="font-semibold text-slate-950">{filteredDependencies.length}</span> of {dependencies.length} entries.
        </p>
        <div className="flex flex-wrap gap-2">
          {filters.directOnly ? <Badge tone="neutral">Direct only</Badge> : null}
          {mappedOnly ? <Badge tone="neutral">Mapped repositories</Badge> : null}
          {filters.bucket !== "all" ? <Badge tone={filters.bucket}>{filters.bucket}</Badge> : null}
          {filters.ecosystem !== "all" ? <Badge tone="neutral">{filters.ecosystem}</Badge> : null}
          {filters.search ? <Badge tone="neutral">Search: {filters.search}</Badge> : null}
          <Button type="button" onClick={resetFilters} className="h-auto border-transparent bg-transparent px-0 py-0 text-sky-700 hover:bg-transparent">
            Reset filters
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-separate border-spacing-y-3 text-left text-sm">
          <thead>
            <tr className="text-slate-500">
              <th className="pb-2">Package</th>
              <th className="pb-2">Path</th>
              <th className="pb-2">
                <button
                  type="button"
                  onClick={() => setOutlookSortDirection((current) => (current === "asc" ? "desc" : "asc"))}
                  className="inline-flex items-center gap-2 font-semibold text-slate-500 transition hover:text-slate-800"
                >
                  12M Outlook
                  <span className="text-[10px] uppercase">{outlookSortDirection === "asc" ? "low" : "high"}</span>
                </button>
              </th>
              <th className="pb-2">Risk</th>
              <th className="pb-2">Security</th>
              <th className="pb-2">Confidence</th>
              <th className="pb-2">Repository</th>
              <th className="pb-2">Explore</th>
            </tr>
          </thead>
          <tbody>
            {sortedDependencies.map((dependency) => {
              const selected = dependency.id === selectedDependencyId;
              const repositoryProfile = isRepositoryProfile(dependency);

              return (
                <tr key={dependency.id} className={`rounded-2xl ${selected ? "bg-sky-50" : "bg-slate-50"} text-slate-700`}>
                  <td className="rounded-l-2xl px-4 py-4 align-top">
                    <Link
                      href={`/analyses/${dependency.analysisId}/dependencies/${dependency.id}`}
                      className="font-semibold text-slate-950 transition hover:text-sky-700"
                    >
                      {dependencyDisplayName(dependency)}
                    </Link>
                    <p className="mt-1 text-xs text-slate-500">{dependencyDisplayVersion(dependency)}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge tone={repositoryProfile ? "neutral" : dependency.direct ? "medium" : "neutral"}>
                        {repositoryProfile ? "Repository target" : dependency.direct ? "Direct" : "Transitive"}
                      </Badge>
                      <Badge tone="neutral">{repositoryProfile ? "repository" : dependency.ecosystem}</Badge>
                      {dependency.parsedFromUploadId ? <Badge tone="neutral">Upload-backed</Badge> : null}
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top text-slate-500">
                    <p className="font-medium text-slate-700">{repositoryProfile ? "Repository scope" : `Depth ${Math.max(dependency.dependencyPath.length - 1, 0)}`}</p>
                    <p className="mt-1 max-w-xs text-xs leading-6">{repositoryProfile ? dependency.repository?.url ?? formatPath(dependency.dependencyPath) : formatPath(dependency.dependencyPath)}</p>
                  </td>
                  <td className="px-4 py-4 align-top font-medium text-slate-900">
                    {formatOutlookScore(dependency.riskProfile?.maintenanceOutlook12mScore ?? 0)}
                  </td>
                  <td className="px-4 py-4 align-top">
                    <div className="flex items-center gap-3">
                      <RiskBadge bucket={dependency.riskProfile?.riskBucket} />
                      <span className="font-medium text-slate-900">{formatRiskScore(dependency.riskProfile?.inactivityRiskScore ?? 0)}</span>
                    </div>
                    <p className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                      {titleCase(dependency.riskProfile?.actionLevel ?? "monitor")}
                    </p>
                  </td>
                  <td className="px-4 py-4 align-top font-medium text-slate-900">
                    {formatRiskScore(dependency.riskProfile?.securityPostureScore ?? 0)}
                  </td>
                  <td className="px-4 py-4 align-top">{formatConfidence(dependency.riskProfile?.confidenceScore ?? 0)}</td>
                  <td className="px-4 py-4 align-top text-slate-500">
                    <p className="font-medium text-slate-900">{dependency.repository?.fullName ?? "Unmapped"}</p>
                    <p className="mt-1 text-xs">{dependency.rawSignalsAvailable ? "Raw signals attached" : "Signal snapshot pending"}</p>
                  </td>
                  <td className="rounded-r-2xl px-4 py-4 align-top">
                    <div className="flex flex-col gap-2">
                      {onSelectDependency ? (
                        <Button
                          type="button"
                          onClick={() => onSelectDependency(dependency.id)}
                          className={selected ? "border-sky-300 bg-sky-100 text-sky-900" : undefined}
                        >
                          {selected ? (repositoryProfile ? "Viewing profile" : "Viewing path") : (repositoryProfile ? "View profile" : "Explore path")}
                        </Button>
                      ) : null}
                      <Link
                        href={`/analyses/${dependency.analysisId}/dependencies/${dependency.id}`}
                        className="text-xs font-semibold uppercase tracking-[0.18em] text-sky-700"
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
        <div className="rounded-[1.5rem] border border-dashed border-slate-300 px-5 py-8 text-sm text-slate-500">
          No repository or dependency entries matched the current filter set. Loosen the search or bucket filters to widen the analysis slice.
        </div>
      ) : null}
    </Card>
  );
}

