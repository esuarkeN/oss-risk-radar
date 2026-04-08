"use client";

import Link from "next/link";
import { useDeferredValue, useState } from "react";

import type { AnalysisRecord, DependencyRecord, RiskBucket } from "@oss-risk-radar/schemas";

import { RiskScorePill } from "@/components/analysis/detail-sections";
import { OverviewCharts } from "@/components/analysis/overview-charts";
import { AnalystHighlights, SummaryCards } from "@/components/analysis/summary-cards";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDate, formatScore, titleCase } from "@/lib/format";

const bucketFilters: Array<RiskBucket | "all"> = ["all", "low", "medium", "high", "critical"];

export function AnalysisDashboard({ analysis, dependencies }: { analysis: AnalysisRecord; dependencies: DependencyRecord[] }) {
  const [query, setQuery] = useState("");
  const [bucket, setBucket] = useState<RiskBucket | "all">("all");
  const deferredQuery = useDeferredValue(query);

  const filteredDependencies = dependencies.filter((dependency) => {
    const matchesQuery = [dependency.packageName, dependency.packageVersion, dependency.ecosystem]
      .join(" ")
      .toLowerCase()
      .includes(deferredQuery.toLowerCase());
    const matchesBucket = bucket === "all" || dependency.riskProfile?.riskBucket === bucket;
    return matchesQuery && matchesBucket;
  });

  return (
    <div className="space-y-6">
      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Card className="space-y-4 bg-[linear-gradient(135deg,rgba(14,165,233,0.12),rgba(255,255,255,0.92))]">
          <div className="flex flex-wrap items-center gap-3">
            <Badge tone={analysis.status === "completed" ? "low" : "neutral"}>{analysis.status}</Badge>
            <span className="text-xs uppercase tracking-[0.18em] text-slate-500">Created {formatDate(analysis.createdAt)}</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-950">Analysis Overview</h1>
          <p className="max-w-3xl text-sm leading-7 text-slate-600">
            {analysis.submission.kind === "demo"
              ? "Demo analysis based on mocked dependency extraction, repository mapping, and heuristic scoring."
              : `Repository submission for ${analysis.submission.repositoryUrl}`}
          </p>
        </Card>
        <AnalystHighlights analysis={analysis} />
      </section>

      <SummaryCards analysis={analysis} />
      <OverviewCharts analysis={analysis} />

      <Card>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Dependencies</p>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">Sortable triage queue</h2>
          </div>
          <div className="flex flex-col gap-3 md:flex-row">
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search package, version, ecosystem" />
            <div className="flex flex-wrap gap-2">
              {bucketFilters.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setBucket(item)}
                  className={`rounded-full border px-3 py-2 text-xs font-semibold uppercase tracking-[0.18em] ${bucket === item ? "border-sky-300 bg-sky-50 text-sky-700" : "border-slate-200 bg-white text-slate-500"}`}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="mt-6 overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-[0.18em] text-slate-500">
                <th className="pb-3 pr-4">Dependency</th>
                <th className="pb-3 pr-4">Repository</th>
                <th className="pb-3 pr-4">Scores</th>
                <th className="pb-3 pr-4">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredDependencies.map((dependency) => (
                <tr key={dependency.id} className="align-top">
                  <td className="py-4 pr-4">
                    <div className="font-semibold text-slate-950">{dependency.packageName}</div>
                    <div className="text-slate-500">{dependency.packageVersion} · {dependency.ecosystem}</div>
                    <div className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                      {dependency.direct ? "Direct" : "Transitive"}
                    </div>
                  </td>
                  <td className="py-4 pr-4">
                    <div className="text-slate-950">{dependency.repository?.fullName ?? "Unmapped"}</div>
                    <div className="text-slate-500">Last push {dependency.repository ? formatDate(dependency.repository.lastPushAt) : "unknown"}</div>
                  </td>
                  <td className="py-4 pr-4">
                    <RiskScorePill dependency={dependency} />
                    <div className="mt-2 text-sm text-slate-500">
                      Security posture {formatScore(dependency.riskProfile?.securityPostureScore ?? 0)}
                    </div>
                  </td>
                  <td className="py-4 pr-4">
                    <div className="font-medium text-slate-950">{titleCase(dependency.riskProfile?.actionLevel ?? "monitor")}</div>
                    <Link href={`/analyses/${analysis.id}/dependencies/${dependency.id}`} className="mt-3 inline-flex text-xs uppercase tracking-[0.18em] text-sky-700">
                      Inspect Dependency
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}



