"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, DatabaseZap, ShieldCheck } from "lucide-react";

import { EcosystemBreakdownChart } from "@/components/charts/ecosystem-breakdown-chart";
import { RiskDistributionChart } from "@/components/charts/risk-distribution-chart";
import { DependencyPathExplorer } from "@/components/dependency-path-explorer";
import { DependencyTable } from "@/components/dependency-table";
import { RepositoryMlAnalysisPanel } from "@/components/repository-ml-analysis-panel";
import { SummaryCard } from "@/components/summary-card";
import { useToast } from "@/components/toast-provider";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { getAnalysis, getDependencies, getDependencyGraph } from "@/lib/api";
import { formatDate, titleCase } from "@/lib/format";
import { isRepositoryProfile } from "@/lib/repository-profile";
import type { AnalysisRecord, DependencyGraphResponse, DependencyRecord } from "@/lib/types";

interface AnalysisDashboardProps {
  analysisId: string;
}

const ACTIVE_STATUSES = new Set(["pending", "running"]);

export function AnalysisDashboard({ analysisId }: AnalysisDashboardProps) {
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [analysis, setAnalysis] = useState<AnalysisRecord | null>(null);
  const [dependencies, setDependencies] = useState<DependencyRecord[]>([]);
  const [graph, setGraph] = useState<DependencyGraphResponse | null>(null);
  const [selectedDependencyId, setSelectedDependencyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const previousStatusRef = useRef<string | null>(null);
  const cacheToastShownRef = useRef(false);

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

        const repositoryTarget = analysisRecord.submission.kind === "repository_url"
          ? dependencyRecords.find((dependency) => isRepositoryProfile(dependency))
          : null;
        const highestRiskDependency = [...dependencyRecords].sort(
          (left, right) => (right.riskProfile?.inactivityRiskScore ?? 0) - (left.riskProfile?.inactivityRiskScore ?? 0)
        )[0];
        setSelectedDependencyId((current) => current ?? repositoryTarget?.id ?? highestRiskDependency?.id ?? dependencyRecords[0]?.id ?? null);

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

  const reusedFromCache = searchParams.get("cached") === "1";

  useEffect(() => {
    if (!reusedFromCache || cacheToastShownRef.current) {
      return;
    }
    cacheToastShownRef.current = true;
    toast({
      tone: "success",
      title: "Saved analysis reopened",
      description: "A matching repository analysis already existed, so the cached result opened immediately.",
    });
  }, [reusedFromCache, toast]);

  useEffect(() => {
    if (!analysis) {
      return;
    }

    const previousStatus = previousStatusRef.current;
    if (previousStatus && previousStatus !== analysis.status) {
      if (analysis.status === "completed") {
        toast({
          tone: "success",
          title: "Analysis completed",
          description: "Repository enrichment, scoring, and evidence capture finished.",
        });
      }
      if (analysis.status === "failed") {
        toast({
          tone: "error",
          title: "Analysis failed",
          description: "The run stopped before scoring completed. Review the current analysis state for details.",
        });
      }
    }

    previousStatusRef.current = analysis.status;
  }, [analysis, toast]);

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
  const selectedIsRepositoryProfile = isRepositoryProfile(selectedDependency);
  const graphNodeCount = graph?.nodes?.length ?? dependencies.length;
  const dependencySummaryLabel = analysis.submission.kind === "repository_url" ? "Profiles" : "Dependencies";
  const dependencySummaryCaption = analysis.submission.kind === "repository_url"
    ? "Repository target plus any resolved packages in the current analysis."
    : "Direct and transitive packages in the current analysis.";
  const highRiskCaption = analysis.submission.kind === "repository_url"
    ? "Profiles currently in high or critical inactivity buckets."
    : "Packages currently in high or critical inactivity buckets.";
  const mappedCaption = analysis.submission.kind === "repository_url"
    ? "Profiles with linked repository metadata."
    : "Dependencies with linked repository metadata.";
  const scoredCaption = analysis.submission.kind === "repository_url"
    ? "Profiles with current scoring and explanation evidence."
    : "Dependencies with current scoring and explanation evidence.";

  return (
    <div className="space-y-6">
      <section className="grid gap-5 rounded-lg border border-line bg-panel p-5 lg:grid-cols-[1.45fr_0.55fr] lg:p-6">
        <div className="flex min-h-64 flex-col justify-between gap-6">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">Analysis Overview</p>
              <Badge tone={analysis.status === "completed" ? "low" : analysis.status === "failed" ? "critical" : "medium"}>
                {titleCase(analysis.status)}
              </Badge>
            </div>
            <h1 className="max-w-5xl break-words text-4xl font-semibold leading-tight tracking-tight md:text-6xl">
              {analysis.submission.repositoryUrl ?? analysis.submission.artifactName ?? "Demo analysis"}
            </h1>
            {analysisStatusActive ? (
              <p className="max-w-2xl text-sm text-warning">
                This analysis is still processing. The dashboard refreshes automatically while parsing, enrichment, and scoring complete.
              </p>
            ) : null}
          </div>

          <div className="flex flex-wrap gap-2 text-sm text-muted">
            <span className="inline-flex items-center gap-2 rounded-md border border-line bg-panelAlt px-3 py-2">
              <ShieldCheck className="h-4 w-4 text-accent" /> Conservative triage
            </span>
            <span className="inline-flex items-center gap-2 rounded-md border border-line bg-panelAlt px-3 py-2">
              <DatabaseZap className="h-4 w-4 text-accent" /> Provenance visible
            </span>
          </div>
        </div>

        <aside className="rounded-lg border border-line bg-foreground p-4 text-background">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-background/60">Freshness and scope</p>
          <div className="mt-5 divide-y divide-background/15 border-y border-background/15">
            <div className="flex justify-between gap-4 py-3 text-sm">
              <span className="text-background/60">Created</span>
              <span className="text-right font-medium">{formatDate(analysis.createdAt)}</span>
            </div>
            <div className="flex justify-between gap-4 py-3 text-sm">
              <span className="text-background/60">Updated</span>
              <span className="text-right font-medium">{formatDate(analysis.updatedAt)}</span>
            </div>
            <div className="flex justify-between gap-4 py-3 text-sm">
              <span className="text-background/60">Mode</span>
              <span className="text-right font-medium">{titleCase(analysis.submission.kind.replaceAll("_", " "))}</span>
            </div>
            {analysis.methodologyVersion ? (
              <div className="flex justify-between gap-4 py-3 text-sm">
                <span className="text-background/60">Method</span>
                <span className="text-right font-medium">{analysis.methodologyVersion}</span>
              </div>
            ) : null}
          </div>
          <Link href="/methodology" className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-background transition hover:text-accent">
            Review methodology <ArrowRight className="h-4 w-4" />
          </Link>
        </aside>
      </section>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard label={dependencySummaryLabel} value={analysis.summary.dependencyCount} caption={dependencySummaryCaption} />
        <SummaryCard label="High Risk" value={analysis.summary.highRiskCount} caption={highRiskCaption} />
        <SummaryCard label="Mapped Repos" value={analysis.summary.mappedRepositoryCount} caption={mappedCaption} />
        <SummaryCard label="Scored" value={analysis.summary.scoreAvailabilityCount} caption={scoredCaption} />
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
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Focused review</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">
              {selectedDependency
                ? selectedIsRepositoryProfile
                  ? (selectedDependency.repository?.fullName ?? selectedDependency.packageName)
                  : `${selectedDependency.packageName}@${selectedDependency.packageVersion}`
                : "Select a profile"}
            </h2>
            <p className="mt-2 text-sm leading-6 text-muted">
              {selectedIsRepositoryProfile
                ? "Focus the repository-level rating for the submitted project."
                : "Focus the path panel on one package and jump into the evidence view when needed."}
            </p>
          </div>
          {selectedDependency ? (
            <>
              <div className="flex flex-wrap gap-2">
                <Badge tone={selectedDependency.riskProfile?.riskBucket ?? "neutral"}>
                  {selectedDependency.riskProfile?.riskBucket ?? "unscored"}
                </Badge>
                <Badge tone={selectedIsRepositoryProfile ? "neutral" : selectedDependency.direct ? "medium" : "neutral"}>
                  {selectedIsRepositoryProfile ? "Repository target" : selectedDependency.direct ? "Direct dependency" : "Transitive dependency"}
                </Badge>
                {selectedDependency.parsedFromUploadId ? <Badge tone="neutral">Upload provenance attached</Badge> : null}
              </div>
              <div className="rounded-lg border border-line bg-panelAlt px-4 py-4 text-sm text-muted">
                <p>
                  Repository: <span className="font-semibold text-foreground">{selectedDependency.repository?.fullName ?? "Not mapped yet"}</span>
                </p>
                <p className="mt-2">
                  Latest action cue: <span className="font-semibold text-foreground">{titleCase(selectedDependency.riskProfile?.actionLevel ?? "monitor")}</span>
                </p>
                <p className="mt-2">{selectedIsRepositoryProfile ? "Scope: repository-level profile" : `Path length: ${selectedDependency.dependencyPath.length} nodes`}</p>
                <p className="mt-2">Graph nodes available: {graphNodeCount}</p>
              </div>
              <Link
                href={`/analyses/${selectedDependency.analysisId}/dependencies/${selectedDependency.id}`}
                className="inline-flex items-center gap-2 text-sm font-medium text-accent transition hover:text-foreground"
              >
                Open detailed evidence view <ArrowRight className="h-4 w-4" />
              </Link>
            </>
          ) : (
            <div className="rounded-lg border border-dashed border-line px-4 py-8 text-sm text-muted">
              No dependency records were attached to this analysis yet.
            </div>
          )}
        </Card>
      </div>

      <RepositoryMlAnalysisPanel dependency={selectedDependency} />

      {selectedDependency && !selectedIsRepositoryProfile ? (
        <DependencyPathExplorer dependency={selectedDependency} dependencies={dependencies} graph={graph} />
      ) : null}

      {analysis.uploads?.length ? (
        <Card className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Uploaded artifacts</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">Registered analysis inputs</h2>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {analysis.uploads.map((upload) => (
              <div key={upload.id} className="rounded-lg border border-line bg-panelAlt px-4 py-4 text-sm text-muted">
                <p className="font-semibold text-foreground">{upload.fileName}</p>
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
