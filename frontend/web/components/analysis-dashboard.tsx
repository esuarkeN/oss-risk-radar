"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, DatabaseZap, RefreshCw, ShieldCheck, Network, Table2, LayoutGrid } from "lucide-react";

import { EcosystemBreakdownChart } from "@/components/charts/ecosystem-breakdown-chart";
import { RiskDistributionChart } from "@/components/charts/risk-distribution-chart";
import { DependencyPathExplorer } from "@/components/dependency-path-explorer";
import { DependencyTable } from "@/components/dependency-table";
import { DependencyTreeSnapshot } from "@/components/dependency-tree-snapshot";
import { RepositoryMlAnalysisPanel } from "@/components/repository-ml-analysis-panel";
import { SummaryCard } from "@/components/summary-card";
import { useToast } from "@/components/toast-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { createAnalysis, getAnalysis, getDependencies, getDependencyGraph } from "@/lib/api";
import { formatDate, titleCase } from "@/lib/format";
import { formatTrainingMetric, runtimeScoringLabel, scoringMethodsFromAnalysis } from "@/lib/ml-evaluation";
import { isRepositoryProfile } from "@/lib/repository-profile";
import type { AnalysisRecord, DependencyGraphResponse, DependencyRecord } from "@/lib/types";

interface AnalysisDashboardProps {
  analysisId: string;
}

const ACTIVE_STATUSES = new Set(["pending", "running"]);

export function AnalysisDashboard({ analysisId }: AnalysisDashboardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const [analysis, setAnalysis] = useState<AnalysisRecord | null>(null);
  const [dependencies, setDependencies] = useState<DependencyRecord[]>([]);
  const [graph, setGraph] = useState<DependencyGraphResponse | null>(null);
  const [selectedDependencyId, setSelectedDependencyId] = useState<string | null>(null);
  const [depViewTab, setDepViewTab] = useState<"tree" | "table" | "charts">("tree");
  const [error, setError] = useState<string | null>(null);
  const [rerunning, setRerunning] = useState(false);
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
    return <Card className="text-sm text-[hsl(var(--danger))]">{error}</Card>;
  }

  if (!analysis) {
    return <Card className="text-sm text-muted">Loading analysis...</Card>;
  }

  const analysisStatusActive = ACTIVE_STATUSES.has(analysis.status);
  const canRerunAnalysis = analysis.submission.kind === "repository_url" && !analysisStatusActive;
  const selectedIsRepositoryProfile = isRepositoryProfile(selectedDependency);
  const graphNodeCount = graph?.nodes?.length ?? dependencies.length;
  const analysisTargetLabel = analysis.submission.repositoryUrl ?? analysis.submission.artifactName ?? "Demo analysis";
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
  const scoringMethods = scoringMethodsFromAnalysis(analysis);
  const runtimeScoring = runtimeScoringLabel(scoringMethods);

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
      <section className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--panel))] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--accent))]">
                Analysis
              </p>
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
          <aside className="shrink-0 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] p-3.5 text-xs min-w-[200px]">
            <p className="font-semibold uppercase tracking-widest text-[10px] text-[hsl(var(--muted))]">
              Freshness &amp; scope
            </p>
            <div className="mt-3 space-y-1.5">
              {[
                ["Created", formatDate(analysis.createdAt)],
                ["Updated", formatDate(analysis.updatedAt)],
                ["Mode", titleCase(analysis.submission.kind.replaceAll("_", " "))],
                ["Runtime scoring", runtimeScoring],
                ...(analysis.methodologyVersion ? [["Methodology", analysis.methodologyVersion]] : []),
              ].map(([label, val]) => (
                <div key={label} className="flex justify-between gap-3">
                  <span className="text-[hsl(var(--muted))]">{label}</span>
                  <span className="font-medium text-[hsl(var(--foreground))] text-right">{val}</span>
                </div>
              ))}
            </div>
            <Link href="/methodology" className="mt-3 inline-flex items-center gap-1 text-[hsl(var(--accent))] transition hover:text-[hsl(var(--foreground))]">
              Methodology <ArrowRight className="h-3 w-3" />
            </Link>
          </aside>
        </div>
      </section>

      {/* Summary cards with tone */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <SummaryCard
          label={dependencySummaryLabel}
          value={analysis.summary.dependencyCount}
          caption={dependencySummaryCaption}
          tone="neutral"
        />
        <SummaryCard
          label="High Risk"
          value={analysis.summary.highRiskCount}
          caption={highRiskCaption}
          tone={analysis.summary.highRiskCount > 0 ? "danger" : "neutral"}
        />
        <SummaryCard
          label="Mapped Repos"
          value={analysis.summary.mappedRepositoryCount}
          caption={mappedCaption}
          tone="neutral"
        />
        <SummaryCard
          label="Scored"
          value={analysis.summary.scoreAvailabilityCount}
          caption={scoredCaption}
          tone={analysis.summary.scoreAvailabilityCount > 0 ? "success" : "neutral"}
        />
      </div>

      {/* Scoring methods table */}
      {scoringMethods.length ? (
        <Card className="space-y-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">Scoring methods · global model quality</p>
            <h2 className="mt-2 text-xl font-semibold tracking-tight text-foreground">{runtimeScoring}</h2>
            <p className="mt-1 text-sm text-muted">AUROC, Brier, and ECE are held-out evaluation metrics for the model overall — identical for every repository. Per-repository confidence is shown in the ML analysis panel below.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-[0.16em] text-muted">
                  <th className="pb-3 pr-4">Method</th>
                  <th className="pb-3 pr-4">Role</th>
                  <th className="pb-3 pr-4">Coverage</th>
                  <th className="pb-3 pr-4">AUROC</th>
                  <th className="pb-3 pr-4">Brier</th>
                  <th className="pb-3 pr-4">ECE</th>
                </tr>
              </thead>
              <tbody>
                {scoringMethods.map((method) => (
                  <tr key={`${method.method}-${method.label}-${method.role}`} className="border-b border-line/70 last:border-b-0">
                    <td className="py-3 pr-4 font-semibold text-foreground">
                      {method.label}
                      {method.modelVersion ? <span className="ml-2 text-xs font-medium text-muted">{method.modelVersion}</span> : null}
                    </td>
                    <td className="py-3 pr-4 text-muted">{titleCase(method.role.replaceAll("_", " "))}</td>
                    <td className="py-3 pr-4 text-foreground">{method.dependencyCount}/{analysis.summary.scoreAvailabilityCount || analysis.summary.dependencyCount}</td>
                    <td className="py-3 pr-4 text-foreground">{formatTrainingMetric(method.auroc)}</td>
                    <td className="py-3 pr-4 text-foreground">{formatTrainingMetric(method.brier)}</td>
                    <td className="py-3 pr-4 text-foreground">{formatTrainingMetric(method.ece)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}



      {/* Dependency view: tab bar + content */}
      <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--panel))] overflow-hidden">
        {/* Tab bar */}
        <div className="flex items-center justify-between border-b border-[hsl(var(--border))] px-4 py-0">
          <div className="flex">
            {(
              [
                { id: "tree" as const, label: "Dependency Tree", icon: Network },
                { id: "table" as const, label: "Table", icon: Table2 },
                { id: "charts" as const, label: "Charts", icon: LayoutGrid },
              ] as const
            ).map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setDepViewTab(id)}
                className={[
                  "flex items-center gap-2 border-b-2 px-4 py-3 text-xs font-semibold transition-colors",
                  depViewTab === id
                    ? "border-[hsl(var(--accent))] text-[hsl(var(--accent))]"
                    : "border-transparent text-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]",
                ].join(" ")}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            ))}
          </div>
          {depViewTab === "tree" && (
            <Link
              href={`/analyses/${analysisId}/tree`}
              className="text-[11px] font-semibold text-[hsl(var(--accent))] transition hover:text-[hsl(var(--foreground))]"
            >
              Open full tree →
            </Link>
          )}
        </div>

        {/* Tab content */}
        <div className="p-4">
          {depViewTab === "tree" && (
            <DependencyTreeSnapshot
              dependencies={dependencies}
              graph={graph}
              analysisId={analysisId}
              analysisTargetLabel={analysisTargetLabel}
              onSelectDependency={setSelectedDependencyId}
            />
          )}

          {depViewTab === "table" && (
            <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
              <DependencyTable
                dependencies={dependencies}
                selectedDependencyId={selectedDependency?.id}
                onSelectDependency={setSelectedDependencyId}
              />
              <Card className="space-y-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--muted))]">Focused review</p>
                  <h2 className="mt-1.5 text-base font-bold tracking-tight text-[hsl(var(--foreground))]">
                    {selectedDependency
                      ? selectedIsRepositoryProfile
                        ? (selectedDependency.repository?.fullName ?? selectedDependency.packageName)
                        : `${selectedDependency.packageName}@${selectedDependency.packageVersion}`
                      : "Select a package"}
                  </h2>
                </div>
                {selectedDependency ? (
                  <>
                    {selectedDependency.riskProfile ? (
                      <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <div>
                            <p className="text-[10px] font-semibold uppercase tracking-widest text-[hsl(var(--muted))]">12M Outlook</p>
                            <p className="mt-0.5 text-3xl font-bold text-[hsl(var(--foreground))]">
                              {selectedDependency.riskProfile.maintenanceOutlook12mScore != null
                                ? selectedDependency.riskProfile.maintenanceOutlook12mScore.toFixed(2)
                                : "—"}
                            </p>
                          </div>
                          <div className="text-right">
                            <Badge tone={selectedDependency.riskProfile.riskBucket ?? "neutral"} className="text-sm px-3 py-1">
                              {selectedDependency.riskProfile.riskBucket ?? "unscored"}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    ) : null}
                    <div className="flex flex-wrap gap-1.5">
                      <Badge tone={selectedIsRepositoryProfile ? "neutral" : selectedDependency.direct ? "medium" : "neutral"}>
                        {selectedIsRepositoryProfile ? "Repository target" : selectedDependency.direct ? "Direct" : "Transitive"}
                      </Badge>
                      {selectedDependency.parsedFromUploadId ? <Badge tone="neutral">Upload-backed</Badge> : null}
                    </div>
                    <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--panel-alt))] px-4 py-3 text-xs text-[hsl(var(--muted))]">
                      <p>Repository: <span className="font-semibold text-[hsl(var(--foreground))]">{selectedDependency.repository?.fullName ?? "Not mapped"}</span></p>
                      <p className="mt-1.5">{selectedIsRepositoryProfile ? "Scope: repository-level profile" : `Path: ${selectedDependency.dependencyPath.length} nodes`}</p>
                      <p className="mt-1.5">Graph nodes: {graphNodeCount}</p>
                    </div>
                    <Link
                      href={`/analyses/${selectedDependency.analysisId}/dependencies/${selectedDependency.id}`}
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-[hsl(var(--accent))] transition hover:text-[hsl(var(--foreground))]"
                    >
                      Full evidence view <ArrowRight className="h-3.5 w-3.5" />
                    </Link>
                  </>
                ) : (
                  <div className="rounded-lg border border-dashed border-[hsl(var(--border))] px-4 py-8 text-sm text-[hsl(var(--muted))]">
                    Select a package from the table.
                  </div>
                )}
              </Card>
            </div>
          )}

          {depViewTab === "charts" && (
            <div className="grid gap-5 xl:grid-cols-2">
              <RiskDistributionChart distribution={analysis.summary.riskDistribution} />
              <EcosystemBreakdownChart breakdown={analysis.summary.ecosystemBreakdown} />
            </div>
          )}
        </div>
      </div>

      {/* Dependency path explorer — directly below table when a dep is selected */}
      {selectedDependency && !selectedIsRepositoryProfile ? (
        <DependencyPathExplorer dependency={selectedDependency} dependencies={dependencies} graph={graph} />
      ) : null}

      {/* ML analysis panel */}
      <RepositoryMlAnalysisPanel dependency={selectedDependency} />

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
