"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, DatabaseZap, RefreshCw, ShieldCheck } from "lucide-react";

import { EcosystemBreakdownChart } from "@/components/charts/ecosystem-breakdown-chart";
import { RiskDistributionChart } from "@/components/charts/risk-distribution-chart";
import { DependencyTable } from "@/components/dependency-table";
import { RepositoryMlAnalysisPanel } from "@/components/repository-ml-analysis-panel";
import { SummaryCard } from "@/components/summary-card";
import { useToast } from "@/components/toast-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createAnalysis, getAnalysis, getDependencies } from "@/lib/api";
import { formatDate, titleCase } from "@/lib/format";
import { setLastAnalysis } from "@/lib/last-analysis";
import { dependencyDisplayName, dependencyDisplayVersion, isRepositoryProfile } from "@/lib/repository-profile";
import type { AnalysisRecord, DependencyRecord } from "@/lib/types";

interface AnalysisDashboardProps {
  analysisId: string;
}

const ACTIVE_STATUSES = new Set(["pending", "running"]);

/** Plain-language verdict for a dependency that has no linked repository (so no maintenance score). */
function UnmappedSubjectCard({ dependency }: { dependency: DependencyRecord }) {
  const score = dependency.riskProfile?.inactivityRiskScore ?? null;
  return (
    <Card className="animate-slide-up space-y-3">
      <p className="text-xs uppercase tracking-[0.24em] text-muted">Inactivity risk · this package</p>
      <h2 className="text-2xl font-semibold tracking-tight text-foreground">
        {dependencyDisplayName(dependency)}
        <span className="ml-2 text-base font-medium text-muted">{dependencyDisplayVersion(dependency)}</span>
      </h2>
      {score != null ? (
        <div className="flex items-end gap-4">
          <p className="text-4xl font-semibold tracking-tight text-foreground">{Math.round(score)}<span className="text-lg text-muted">/100</span></p>
          <Badge tone={dependency.riskProfile?.riskBucket ?? "neutral"}>{dependency.riskProfile?.riskBucket ?? "unscored"}</Badge>
        </div>
      ) : (
        <p className="text-sm text-muted">
          This package isn&apos;t linked to a source repository, so there is no maintenance-history score. Map it to a
          GitHub repository to get an inactivity probability and the signals behind it.
        </p>
      )}
    </Card>
  );
}

export function AnalysisDashboard({ analysisId }: AnalysisDashboardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [analysis, setAnalysis] = useState<AnalysisRecord | null>(null);
  const [dependencies, setDependencies] = useState<DependencyRecord[]>([]);
  const [selectedDependencyId, setSelectedDependencyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState(false);
  const previousStatusRef = useRef<string | null>(null);
  const cacheToastShownRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    async function load() {
      try {
        const [analysisRecord, dependencyRecords] = await Promise.all([
          getAnalysis(analysisId),
          getDependencies(analysisId)
        ]);

        if (cancelled) {
          return;
        }

        setAnalysis(analysisRecord);
        setDependencies(dependencyRecords);
        setError(null);
        setLastAnalysis(
          analysisId,
          analysisRecord.submission.repositoryUrl ?? analysisRecord.submission.artifactName ?? "Demo analysis",
        );

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
    return <Card className="text-sm text-[hsl(var(--danger))]">{error}</Card>;
  }

  if (!analysis) {
    return <Card className="text-sm text-muted">Loading analysis...</Card>;
  }

  const analysisStatusActive = ACTIVE_STATUSES.has(analysis.status);
  const canRerunAnalysis = analysis.submission.kind === "repository_url" && !analysisStatusActive;
  const isRepositoryAnalysis = analysis.submission.kind === "repository_url";
  const multipleSubjects = dependencies.length > 1;

  async function handleRerunAnalysis() {
    if (!analysis || !canRerunAnalysis) {
      return;
    }

    setRerunning(true);
    try {
      const response = await createAnalysis({ submission: analysis.submission, force: true });
      toast({
        tone: "success",
        title: "Fresh analysis queued",
        description: "The cached result was bypassed and a new analysis job is opening now.",
      });
      router.push(`/analyses/${encodeURIComponent(response.analysis.id)}?rerun=1`);
    } catch (rerunError) {
      toast({
        tone: "error",
        title: "Rerun failed",
        description: rerunError instanceof Error ? rerunError.message : "Failed to queue a fresh analysis.",
      });
    } finally {
      setRerunning(false);
    }
  }

  return (
    <div className="space-y-5">
      {/* Analysis header */}
      <section className="animate-slide-up rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--panel))] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--accent))]">Analysis</p>
              <Badge tone={analysis.status === "completed" ? "low" : analysis.status === "failed" ? "critical" : "medium"}>
                {titleCase(analysis.status)}
              </Badge>
            </div>
            <h1 className="max-w-3xl break-all text-xl font-bold leading-snug tracking-tight text-[hsl(var(--foreground))]">
              {analysis.submission.repositoryUrl ?? analysis.submission.artifactName ?? "Demo analysis"}
            </h1>
            {analysisStatusActive ? (
              <p className="max-w-2xl text-xs text-[hsl(var(--warning))]">
                Refreshing automatically — parsing, enrichment, and scoring in progress.
              </p>
            ) : null}
            {reusedFromCache ? (
              <p className="max-w-2xl text-xs text-[hsl(var(--muted))]">
                Opened an existing completed analysis. Queue a fresh run for updated enrichment.
              </p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {canRerunAnalysis ? (
                <Button type="button" onClick={() => void handleRerunAnalysis()} disabled={rerunning} className="w-fit">
                  <RefreshCw className={`h-3.5 w-3.5 ${rerunning ? "animate-spin" : ""}`} />
                  {rerunning ? "Queuing…" : "Run fresh analysis"}
                </Button>
              ) : null}
              <span className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-2.5 py-1.5 text-xs text-[hsl(var(--muted))]">
                <ShieldCheck className="h-3.5 w-3.5 text-[hsl(var(--accent))]" /> Conservative triage
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-2.5 py-1.5 text-xs text-[hsl(var(--muted))]">
                <DatabaseZap className="h-3.5 w-3.5 text-[hsl(var(--accent))]" /> Provenance visible
              </span>
            </div>
          </div>

          {/* Freshness card */}
          <aside className="min-w-[200px] shrink-0 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-3.5 text-xs">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--muted))]">Freshness &amp; scope</p>
            <div className="mt-3 space-y-1.5">
              {[
                ["Created", formatDate(analysis.createdAt)],
                ["Updated", formatDate(analysis.updatedAt)],
                ["Mode", titleCase(analysis.submission.kind.replaceAll("_", " "))],
                ["Scoring", "ML maintenance model"],
                ...(analysis.methodologyVersion ? [["Methodology", analysis.methodologyVersion]] : []),
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between gap-3">
                  <span className="text-[hsl(var(--muted))]">{label}</span>
                  <span className="text-right font-medium text-[hsl(var(--foreground))]">{val}</span>
                </div>
              ))}
            </div>
            <Link href="/docs" className="mt-3 inline-flex items-center gap-1 text-[hsl(var(--accent))] transition hover:text-[hsl(var(--foreground))]">
              How scoring works <ArrowRight className="h-3 w-3" />
            </Link>
          </aside>
        </div>
      </section>

      {/* PRIMARY — the answer: inactivity probability, confidence, and why */}
      {selectedDependency?.repository ? (
        <RepositoryMlAnalysisPanel dependency={selectedDependency} />
      ) : selectedDependency ? (
        <UnmappedSubjectCard dependency={selectedDependency} />
      ) : (
        <Card className="text-sm text-muted">
          {analysisStatusActive ? "Scoring in progress — the risk verdict will appear here." : "No scorable subject in this analysis yet."}
        </Card>
      )}

      {/* Package picker — only when the analysis covers more than one subject */}
      {multipleSubjects ? (
        <div className="animate-slide-up space-y-2" style={{ animationDelay: "120ms" }}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted">
              {isRepositoryAnalysis ? "Repository & resolved packages" : "Packages in this analysis"}
            </h2>
            <p className="text-xs text-muted">Select any row to see its risk verdict above.</p>
          </div>
          <DependencyTable
            dependencies={dependencies}
            selectedDependencyId={selectedDependency?.id}
            onSelectDependency={setSelectedDependencyId}
          />
        </div>
      ) : null}

      {/* Portfolio context — counts and distributions, only useful with multiple packages */}
      {multipleSubjects ? (
        <>
          <div className="grid animate-slide-up gap-3 md:grid-cols-2 xl:grid-cols-4" style={{ animationDelay: "160ms" }}>
            <SummaryCard
              label={isRepositoryAnalysis ? "Profiles" : "Dependencies"}
              value={analysis.summary.dependencyCount}
              caption={isRepositoryAnalysis ? "Repository scored in this analysis." : "Repositories in this analysis."}
              tone="neutral"
            />
            <SummaryCard
              label="High Risk"
              value={analysis.summary.highRiskCount}
              caption="Currently in the high or critical inactivity buckets."
              tone={analysis.summary.highRiskCount > 0 ? "danger" : "neutral"}
            />
            <SummaryCard
              label="Mapped Repos"
              value={analysis.summary.mappedRepositoryCount}
              caption="Packages linked to a source repository."
              tone="neutral"
            />
            <SummaryCard
              label="Scored"
              value={analysis.summary.scoreAvailabilityCount}
              caption="Packages with a current score and explanation."
              tone={analysis.summary.scoreAvailabilityCount > 0 ? "success" : "neutral"}
            />
          </div>
          <div className="grid animate-slide-up gap-5 xl:grid-cols-2" style={{ animationDelay: "200ms" }}>
            <RiskDistributionChart distribution={analysis.summary.riskDistribution} />
            <EcosystemBreakdownChart breakdown={analysis.summary.ecosystemBreakdown} />
          </div>
        </>
      ) : null}

      {/* Uploaded artifacts */}
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
                {upload.parseError ? <p className="mt-2 text-[hsl(var(--danger))]">Parse error: {upload.parseError}</p> : null}
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
