"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, DatabaseZap, ShieldCheck, TriangleAlert } from "lucide-react";

import { EcosystemBreakdownChart } from "@/components/charts/ecosystem-breakdown-chart";
import { RiskDistributionChart } from "@/components/charts/risk-distribution-chart";
import { DependencyPathExplorer } from "@/components/dependency-path-explorer";
import { DependencyTable } from "@/components/dependency-table";
import { SummaryCard } from "@/components/summary-card";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getAnalysis, getDependencies, getDependencyGraph } from "@/lib/api";
import { formatDate, titleCase } from "@/lib/format";
import type { AnalysisRecord, DependencyGraphResponse, DependencyRecord } from "@/lib/types";

interface AnalysisDashboardProps {
  analysisId: string;
}

const ACTIVE_STATUSES = new Set(["pending", "running"]);

export function AnalysisDashboard({ analysisId }: AnalysisDashboardProps) {
  const [analysis, setAnalysis] = useState<AnalysisRecord | null>(null);
  const [dependencies, setDependencies] = useState<DependencyRecord[]>([]);
  const [graph, setGraph] = useState<DependencyGraphResponse | null>(null);
  const [selectedDependencyId, setSelectedDependencyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    async function load() {
      try {
        const [analysisRecord, dependencyRecords, graphResponse] = await Promise.all([
          getAnalysis(analysisId),
          getDependencies(analysisId),
          getDependencyGraph(analysisId)
        ]);

        if (cancelled) {
          return;
        }

        setAnalysis(analysisRecord);
        setDependencies(dependencyRecords);
        setGraph(graphResponse);
        setError(null);

        const highestRiskDependency = [...dependencyRecords].sort(
          (left, right) => (right.riskProfile?.inactivityRiskScore ?? 0) - (left.riskProfile?.inactivityRiskScore ?? 0)
        )[0];
        setSelectedDependencyId((current) => current ?? highestRiskDependency?.id ?? dependencyRecords[0]?.id ?? null);

        if (ACTIVE_STATUSES.has(analysisRecord.status)) {
          timeoutId = setTimeout(() => {
            void load();
          }, 2000);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load analysis.");
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [analysisId]);

  const selectedDependency = useMemo(() => {
    if (!dependencies.length) {
      return null;
    }

    return dependencies.find((dependency) => dependency.id === selectedDependencyId) ?? dependencies[0] ?? null;
  }, [dependencies, selectedDependencyId]);

  if (error) {
    return <Card className="text-sm text-rose-700">{error}</Card>;
  }

  if (!analysis) {
    return <Card className="text-sm text-slate-500">Loading analysis...</Card>;
  }

  const analysisStatusActive = ACTIVE_STATUSES.has(analysis.status);

  return (
    <div className="space-y-6">
      <Card className="space-y-5 overflow-hidden border-slate-200/80 bg-[linear-gradient(135deg,#0f172a_0%,#102541_45%,#f8fafc_46%,#f8fafc_100%)] text-white">
        <div className="grid gap-6 lg:grid-cols-[1.55fr_1fr]">
          <div className="space-y-4">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-300">Analysis Overview</p>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-semibold tracking-tight">
                {analysis.submission.repositoryUrl ?? analysis.submission.artifactName ?? "Demo analysis"}
              </h1>
              <Badge tone={analysis.status === "completed" ? "low" : analysis.status === "failed" ? "critical" : "medium"}>
                {titleCase(analysis.status)}
              </Badge>
            </div>
            <p className="max-w-2xl text-sm text-slate-300">
              Explainable dependency risk profiles generated from repository activity, provider-backed metadata, scorecard-style security signals, and visible missing-data caveats.
            </p>
            <div className="flex flex-wrap gap-3 text-sm text-slate-200">
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2">
                <ShieldCheck className="h-4 w-4" /> Conservative triage framing
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2">
                <DatabaseZap className="h-4 w-4" /> Provider and upload provenance visible
              </span>
              <span className="inline-flex items-center gap-2 rounded-full border border-white/10 px-3 py-2">
                <TriangleAlert className="h-4 w-4" /> Uncertainty remains explicit
              </span>
            </div>
            {analysisStatusActive ? (
              <div className="rounded-[1.25rem] border border-amber-200/20 bg-amber-200/10 px-4 py-3 text-sm text-amber-100">
                This analysis is still processing. The dashboard refreshes automatically while parsing, enrichment, and scoring complete.
              </div>
            ) : null}
          </div>
          <div className="rounded-[1.5rem] border border-white/10 bg-white/10 p-5 backdrop-blur">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-300">Freshness and scope</p>
            <p className="mt-4 text-sm text-slate-100">Created {formatDate(analysis.createdAt)}</p>
            <p className="mt-2 text-sm text-slate-100">Updated {formatDate(analysis.updatedAt)}</p>
            <p className="mt-2 text-sm text-slate-100">Submission mode {titleCase(analysis.submission.kind.replaceAll("_", " "))}</p>
            {analysis.methodologyVersion ? <p className="mt-2 text-sm text-slate-100">Methodology {analysis.methodologyVersion}</p> : null}
            <Link href="/methodology" className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-white transition hover:text-sky-200">
              Review methodology <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label="Dependencies" value={analysis.summary.dependencyCount} caption="Direct and transitive packages in the current analysis." />
        <SummaryCard label="High Risk" value={analysis.summary.highRiskCount} caption="Packages currently in high or critical inactivity buckets." />
        <SummaryCard label="Mapped Repos" value={analysis.summary.mappedRepositoryCount} caption="Dependencies with linked repository metadata." />
        <SummaryCard label="Scored" value={analysis.summary.scoreAvailabilityCount} caption="Dependencies with current scoring and explanation evidence." />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <RiskDistributionChart distribution={analysis.summary.riskDistribution} />
        <EcosystemBreakdownChart breakdown={analysis.summary.ecosystemBreakdown} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <DependencyTable
          dependencies={dependencies}
          selectedDependencyId={selectedDependency?.id}
          onSelectDependency={setSelectedDependencyId}
        />
        <Card className="space-y-5">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Focused review</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">
              {selectedDependency ? `${selectedDependency.packageName}@${selectedDependency.packageVersion}` : "Select a dependency"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Use the inventory to focus the path panel on one package. The detail page keeps the full evidence trail, raw signals, and repository context.
            </p>
          </div>
          {selectedDependency ? (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge tone={selectedDependency.riskProfile?.riskBucket ?? "neutral"}>
                  {selectedDependency.riskProfile?.riskBucket ?? "unscored"}
                </Badge>
                <Badge tone={selectedDependency.direct ? "medium" : "neutral"}>
                  {selectedDependency.direct ? "Direct dependency" : "Transitive dependency"}
                </Badge>
                {selectedDependency.parsedFromUploadId ? <Badge tone="neutral">Upload provenance attached</Badge> : null}
              </div>
              <div className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                <p>
                  Repository: <span className="font-semibold text-slate-950">{selectedDependency.repository?.fullName ?? "Not mapped yet"}</span>
                </p>
                <p className="mt-2">
                  Latest action cue: <span className="font-semibold text-slate-950">{titleCase(selectedDependency.riskProfile?.actionLevel ?? "monitor")}</span>
                </p>
                <p className="mt-2">Path length: {selectedDependency.dependencyPath.length} nodes</p>
                <p className="mt-2">Graph nodes available: {graph?.nodes.length ?? dependencies.length}</p>
              </div>
              <Link
                href={`/analyses/${selectedDependency.analysisId}/dependencies/${selectedDependency.id}`}
                className="inline-flex items-center gap-2 text-sm font-medium text-sky-700 transition hover:text-sky-900"
              >
                Open detailed evidence view <ArrowRight className="h-4 w-4" />
              </Link>
            </>
          ) : (
            <div className="rounded-[1.5rem] border border-dashed border-slate-300 px-4 py-8 text-sm text-slate-500">
              No dependency records were attached to this analysis yet.
            </div>
          )}
        </Card>
      </div>

      {selectedDependency ? (
        <DependencyPathExplorer dependency={selectedDependency} dependencies={dependencies} graph={graph} />
      ) : null}

      {analysis.uploads?.length ? (
        <Card className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-slate-500">Uploaded artifacts</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-slate-950">Registered analysis inputs</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {analysis.uploads.map((upload) => (
              <div key={upload.id} className="rounded-[1.5rem] border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                <p className="font-semibold text-slate-950">{upload.fileName}</p>
                <p className="mt-2">Status {titleCase(upload.status)}</p>
                <p className="mt-2">Uploaded {formatDate(upload.uploadedAt)}</p>
                {upload.parseError ? <p className="mt-2 text-rose-700">Parse error: {upload.parseError}</p> : null}
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
