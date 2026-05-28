"use client";

import { Activity, BarChart3, BrainCircuit, Gauge } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import { formatTrainingMetric, formatTrainingRate } from "@/lib/ml-evaluation";
import { repositoryModelAnalysis, type RepositoryVariableImpact } from "@/lib/ml-repository-analysis";
import type { DependencyRecord } from "@/lib/types";
import { useMlEvaluationState } from "@/lib/use-ml-evaluation-state";

function MetricFigure({
  icon,
  label,
  value,
  detail,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-[1.25rem] border border-line bg-panelAlt/80 px-4 py-3">
      <div className="flex items-center gap-2 text-muted">
        {icon}
        <p className="text-xs uppercase tracking-[0.18em]">{label}</p>
      </div>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="mt-1 text-sm text-muted">{detail}</p>
    </div>
  );
}

function formatImpact(value: number) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(3)}`;
}

function impactDirection(impact: RepositoryVariableImpact) {
  if (impact.impact > 0.001) {
    return "Raises risk";
  }
  if (impact.impact < -0.001) {
    return "Lowers risk";
  }
  return "Neutral";
}

export function RepositoryMlAnalysisPanel({ dependency }: { dependency: DependencyRecord | null }) {
  const { latestRun, loading } = useMlEvaluationState();
  const modelAnalysis = useMemo(
    () => (dependency ? repositoryModelAnalysis(dependency, latestRun?.modelArtifact) : null),
    [dependency, latestRun?.modelArtifact],
  );

  if (!dependency?.repository) {
    return null;
  }

  const topImpacts = modelAnalysis?.impacts.slice(0, 8) ?? [];
  const modelName = latestRun?.modelArtifact
    ? `${latestRun.modelArtifact.modelName} ${latestRun.modelArtifact.modelVersion}`
    : latestRun?.modelName
      ? `${latestRun.modelName} ${latestRun.modelVersion}`
      : "No cached model";

  return (
    <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
      <Card className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted">ML Learning Analysis</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{dependency.repository.fullName}</h2>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone={modelAnalysis ? "low" : "neutral"}>{modelAnalysis ? "Model ready" : loading ? "Loading" : "No artifact"}</Badge>
            <Badge tone="neutral">{modelName}</Badge>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <MetricFigure
            icon={<BarChart3 className="size-4" aria-hidden="true" />}
            label="AUROC"
            value={formatTrainingMetric(latestRun?.metrics?.rocAuc)}
            detail={`${latestRun?.metrics?.sampleCount ?? 0} held-out samples`}
          />
          <MetricFigure
            icon={<Gauge className="size-4" aria-hidden="true" />}
            label="Quality"
            value={formatTrainingMetric(latestRun?.metrics?.qualityScore)}
            detail={`Brier ${formatTrainingMetric(latestRun?.metrics?.brierScore)}`}
          />
          <MetricFigure
            icon={<BrainCircuit className="size-4" aria-hidden="true" />}
            label="Repo probability"
            value={modelAnalysis ? formatTrainingRate(modelAnalysis.calibratedProbability) : "Pending"}
            detail={modelAnalysis ? `Threshold ${formatTrainingMetric(modelAnalysis.threshold)}` : "Waiting for coefficients"}
          />
          <MetricFigure
            icon={<Activity className="size-4" aria-hidden="true" />}
            label="Current score"
            value={formatTrainingRate((dependency.riskProfile?.inactivityRiskScore ?? 0) / 100)}
            detail={`${dependency.riskProfile?.riskBucket ?? "unscored"} bucket`}
          />
        </div>

        <div className="rounded-[1.25rem] border border-line bg-panelAlt/70 px-4 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-foreground">Top local variables</p>
              <p className="mt-1 text-sm text-muted">
                {modelAnalysis
                  ? `${topImpacts.length} strongest coefficient contributions for this repository snapshot.`
                  : "Run a completed training artifact to populate local coefficient impact."}
              </p>
            </div>
            {latestRun?.trainedAt ? <span className="text-xs uppercase tracking-[0.18em] text-muted">Trained {formatDate(latestRun.trainedAt)}</span> : null}
          </div>
          {topImpacts.length ? (
            <div className="mt-4 grid gap-2">
              {topImpacts.slice(0, 4).map((impact) => (
                <div key={impact.feature} className="flex items-center justify-between gap-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-foreground">{impact.label}</p>
                    <p className="text-xs text-muted">{impactDirection(impact)}</p>
                  </div>
                  <span className="shrink-0 font-mono text-sm font-semibold text-foreground">{formatImpact(impact.impact)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </Card>

      <Card className="h-[470px]">
        <div className="mb-4 space-y-1">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Variable Impact</p>
          <h2 className="text-xl font-semibold tracking-tight text-foreground">Coefficient impact for this repo</h2>
          <p className="text-sm text-muted">Positive values push the model toward inactivity risk; negative values pull it down.</p>
        </div>
        {topImpacts.length ? (
          <ResponsiveContainer width="100%" height="80%">
            <BarChart data={topImpacts} layout="vertical" margin={{ left: 18, right: 18 }}>
              <CartesianGrid strokeDasharray="4 4" horizontal={false} stroke="hsl(var(--border) / 0.6)" />
              <XAxis type="number" tickLine={false} axisLine={false} stroke="hsl(var(--muted))" tickFormatter={(value) => Number(value).toFixed(1)} />
              <YAxis dataKey="label" type="category" width={150} tickLine={false} axisLine={false} stroke="hsl(var(--muted))" />
              <Tooltip
                formatter={(value) => formatImpact(Number(value ?? 0))}
                labelFormatter={(label) => String(label)}
                contentStyle={{
                  borderRadius: 18,
                  borderColor: "hsl(var(--border))",
                  backgroundColor: "hsl(var(--panel))",
                  color: "hsl(var(--foreground))",
                }}
              />
              <Bar dataKey="impact" name="Local impact" radius={[8, 8, 8, 8]}>
                {topImpacts.map((impact) => (
                  <Cell key={impact.feature} fill={impact.impact >= 0 ? "hsl(var(--danger))" : "hsl(var(--success))"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-[320px] items-center justify-center rounded-[1.25rem] border border-dashed border-line bg-panelAlt/70 px-4 text-center text-sm text-muted">
            No coefficient impact is available for the selected repository yet.
          </div>
        )}
      </Card>
    </section>
  );
}
