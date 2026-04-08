"use client";

import Link from "next/link";
import { useDeferredValue, useMemo, useState } from "react";

import type { DependencyFilterState, DependencyRecord, Ecosystem } from "@/lib/types";

import { RiskBadge } from "@/components/risk-badge";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatConfidence, formatPath, formatRiskScore, titleCase } from "@/lib/format";

interface DependencyTableProps {
  dependencies: DependencyRecord[];
  selectedDependencyId?: string;
  onSelectDependency?: (dependencyId: string) => void;
}

export function DependencyTable({ dependencies, selectedDependencyId, onSelectDependency }: DependencyTableProps) {
  const [filters, setFilters] = useState<DependencyFilterState>({
    search: "",
    bucket: "all",
    ecosystem: "all",
    directOnly: false
  });
  const [mappedOnly, setMappedOnly] = useState(false);
  const deferredSearch = useDeferredValue(filters.search);

  const ecosystems = useMemo(() => {
    return Array.from(new Set(dependencies.map((dependency) => dependency.ecosystem as Ecosystem))).sort();
  }, [dependencies]);

  const filteredDependencies = dependencies.filter((dependency) => {
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
          <h3 className="text-lg font-semibold text-slate-950">Dependency Inventory</h3>
          <p className="mt-1 text-sm text-slate-500">
            Filter by risk, ecosystem, dependency depth, and repository coverage before opening graph-aware detail views.
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
          placeholder="Search package, repository, path"
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
          Showing <span className="font-semibold text-slate-950">{filteredDependencies.length}</span> of {dependencies.length} dependencies.
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
              <th className="pb-2">Risk</th>
              <th className="pb-2">Security</th>
              <th className="pb-2">Confidence</th>
              <th className="pb-2">Repository</th>
              <th className="pb-2">Explore</th>
            </tr>
          </thead>
          <tbody>
            {filteredDependencies.map((dependency) => {
              const selected = dependency.id === selectedDependencyId;

              return (
                <tr key={dependency.id} className={`rounded-2xl ${selected ? "bg-sky-50" : "bg-slate-50"} text-slate-700`}>
                  <td className="rounded-l-2xl px-4 py-4 align-top">
                    <Link
                      href={`/analyses/${dependency.analysisId}/dependencies/${dependency.id}`}
                      className="font-semibold text-slate-950 transition hover:text-sky-700"
                    >
                      {dependency.packageName}
                    </Link>
                    <p className="mt-1 text-xs text-slate-500">{dependency.packageVersion}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge tone={dependency.direct ? "medium" : "neutral"}>{dependency.direct ? "Direct" : "Transitive"}</Badge>
                      <Badge tone="neutral">{dependency.ecosystem}</Badge>
                      {dependency.parsedFromUploadId ? <Badge tone="neutral">Upload-backed</Badge> : null}
                    </div>
                  </td>
                  <td className="px-4 py-4 align-top text-slate-500">
                    <p className="font-medium text-slate-700">Depth {Math.max(dependency.dependencyPath.length - 1, 0)}</p>
                    <p className="mt-1 max-w-xs text-xs leading-6">{formatPath(dependency.dependencyPath)}</p>
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
                          {selected ? "Viewing path" : "Explore path"}
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
          No dependencies matched the current filter set. Loosen the search or bucket filters to widen the analysis slice.
        </div>
      ) : null}
    </Card>
  );
}

