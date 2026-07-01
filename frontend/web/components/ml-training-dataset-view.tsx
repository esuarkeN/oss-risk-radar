"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import { formatTrainingMetric, formatTrainingRate, formatTrainingSplit, formatTrainingStatus } from "@/lib/ml-evaluation";
import type { GetTrainingEffectsResponse, TrainingEffectMetric } from "@/lib/types";
import { useMlEvaluationState } from "@/lib/use-ml-evaluation-state";
import { cn } from "@/lib/utils";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line/80 py-3 last:border-b-0 last:pb-0">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-sm font-semibold text-foreground">{value}</span>
    </div>
  );
}

function formatCoverage(labeledRows?: number, totalRows?: number) {
  if (!totalRows) {
    return "Pending";
  }
  return `${Math.round(((labeledRows ?? 0) / totalRows) * 100)}%`;
}

function formatEffectValue(value: number) {
  return value.toFixed(3);
}

function formatMedianValue(value: number) {
  const absolute = Math.abs(value);
  if (absolute > 0 && absolute < 1) {
    return value.toFixed(3);
  }
  if (absolute < 100) {
    return value.toFixed(1);
  }
  return Math.round(value).toLocaleString();
}

function effectTone(effect: TrainingEffectMetric): "low" | "medium" | "high" | "critical" | "neutral" {
  if (effect.ignored || effect.direction === "ignored" || effect.direction === "neutral") {
    return "neutral";
  }
  if (effect.direction === "healthy") {
    return "low";
  }
  return effect.strength === "strong" ? "critical" : "high";
}

function effectDirectionLabel(effect: TrainingEffectMetric) {
  if (effect.ignored || effect.direction === "ignored") {
    return "ignored";
  }
  if (effect.direction === "healthy") {
    return "healthy indicator";
  }
  if (effect.direction === "inactive") {
    return "inactive indicator";
  }
  return "neutral";
}

function EffectBar({ effect }: { effect: TrainingEffectMetric }) {
  const width = `${Math.min(50, Math.abs(effect.effectSize) * 50)}%`;
  const isHealthy = effect.effectSize < 0;
  const isInactive = effect.effectSize > 0;

  return (
    <div className="relative h-3 min-w-[12rem] rounded-full bg-line/70">
      <div className="absolute left-1/2 top-[-3px] h-5 w-px bg-muted/45" />
      {effect.effectSize !== 0 ? (
        <div
          className={cn(
            "absolute top-0 h-3 rounded-full",
            effect.ignored
              ? "bg-muted/40"
              : isHealthy
                ? "bg-emerald-500/80"
                : isInactive
                  ? "bg-rose-500/80"
                  : "bg-muted/50",
          )}
          style={isHealthy ? { right: "50%", width } : { left: "50%", width }}
        />
      ) : null}
    </div>
  );
}

function ModelAlignmentBadges({ effect }: { effect: TrainingEffectMetric }) {
  return (
    <div className="flex flex-wrap gap-2">
      {effect.xgboostImportance !== undefined ? (
        <Badge tone="neutral" className="normal-case tracking-[0.06em]">
          XGB {formatTrainingRate(effect.xgboostImportance, 1)}
        </Badge>
      ) : null}
      {effect.logisticCoefficient !== undefined ? (
        <Badge tone={effect.logisticCoefficient >= 0 ? "high" : "low"} className="normal-case tracking-[0.06em]">
          LR {formatTrainingMetric(effect.logisticCoefficient)}
        </Badge>
      ) : null}
      {effect.note ? (
        <Badge tone="neutral" className="normal-case tracking-[0.06em]">
          note
        </Badge>
      ) : null}
    </div>
  );
}

function TrainingEffectsSection({
  effects,
  loading,
}: {
  effects: GetTrainingEffectsResponse | null;
  loading: boolean;
}) {
  const rows = effects?.effects ?? [];

  return (
    <Card className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Effect Sizes</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Which training signals separate active from inactive projects</h2>
          <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
            r compares inactive vs active labels; negative means the metric is more common in active/healthy projects.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="low">healthy left</Badge>
          <Badge tone="critical">inactive right</Badge>
          <Badge tone="neutral">{effects?.labeledSnapshots ?? 0} labeled rows</Badge>
        </div>
      </div>

      {rows.length ? (
        <div className="overflow-x-auto">
          <table className="min-w-[980px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-[0.16em] text-muted">
                <th className="pb-3 pr-4">Metric</th>
                <th className="pb-3 pr-4">Effect</th>
                <th className="pb-3 pr-4">Direction</th>
                <th className="pb-3 pr-4">Active median</th>
                <th className="pb-3 pr-4">Inactive median</th>
                <th className="pb-3 pr-4">Model alignment</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((effect) => (
                <tr
                  key={effect.key}
                  className={cn(
                    "border-b border-line/70 align-top last:border-b-0",
                    effect.ignored ? "text-muted" : "text-foreground",
                  )}
                >
                  <td className="w-[260px] py-4 pr-4">
                    <p className="font-semibold text-foreground">{effect.label}</p>
                    <p className="mt-1 text-xs text-muted">{effect.features.join(", ")}</p>
                    {effect.note ? <p className="mt-2 text-xs leading-5 text-muted">{effect.note}</p> : null}
                  </td>
                  <td className="w-[260px] py-4 pr-4">
                    <div className="flex items-center gap-3">
                      <EffectBar effect={effect} />
                      <span className="w-14 text-right font-semibold text-foreground">{formatEffectValue(effect.effectSize)}</span>
                    </div>
                  </td>
                  <td className="py-4 pr-4">
                    <div className="flex flex-wrap gap-2">
                      <Badge tone={effectTone(effect)}>{effect.strength}</Badge>
                      <Badge tone="neutral" className="normal-case tracking-[0.06em]">
                        {effectDirectionLabel(effect)}
                      </Badge>
                    </div>
                  </td>
                  <td className="py-4 pr-4 font-semibold text-foreground">{formatMedianValue(effect.activeMedian)}</td>
                  <td className="py-4 pr-4 font-semibold text-foreground">{formatMedianValue(effect.inactiveMedian)}</td>
                  <td className="py-4 pr-4">
                    <ModelAlignmentBadges effect={effect} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted">
          {loading ? "Loading effect sizes from the staged training base." : "No labeled training rows are available for effect-size reporting."}
        </p>
      )}
    </Card>
  );
}

export function MlTrainingDatasetView() {
  const { dataset, effects, latestRun: run, loading, error, refresh } = useMlEvaluationState();
  const [repositorySearch, setRepositorySearch] = useState("");

  const featureNames = run?.datasetSummary?.featureNames ?? [];
  const trainingRepositories = useMemo(() => dataset?.repositories ?? [], [dataset?.repositories]);
  const totalSnapshots = dataset?.totalSnapshots ?? 0;
  const labeledSnapshots = dataset?.labeledSnapshots ?? 0;
  const inactiveLabelCount = dataset?.inactiveLabelCount ?? 0;
  const realProjectLabeledSnapshots = dataset?.realProjectLabeledSnapshots ?? 0;
  const starterSizedBase = (dataset?.uniqueRepositories ?? 0) > 0 && (dataset?.uniqueRepositories ?? 0) < 100;
  const filteredTrainingRepositories = useMemo(() => {
    const normalizedSearch = repositorySearch.trim().toLowerCase();
    if (!normalizedSearch) {
      return trainingRepositories;
    }

    return trainingRepositories.filter((repository) =>
      [repository.fullName, repository.url].join(" ").toLowerCase().includes(normalizedSearch)
    );
  }, [repositorySearch, trainingRepositories]);
  const observedWindow =
    run?.datasetSummary?.earliestObservedAt && run?.datasetSummary?.latestObservedAt
      ? `${formatDate(run.datasetSummary.earliestObservedAt)} to ${formatDate(run.datasetSummary.latestObservedAt)}`
      : "Waiting for first completed artifact";

  return (
    <div className="space-y-6">
      {error ? (
        <Card className="flex flex-col gap-4 border-rose-400/25 bg-rose-400/10 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Dataset view failed to load</p>
            <p className="mt-1 text-sm text-muted">{error}</p>
          </div>
          <Button onClick={() => void refresh()}>Retry</Button>
        </Card>
      ) : null}

      {starterSizedBase ? (
        <Card className="border-amber-300/30 bg-amber-300/10">
          <p className="text-sm font-semibold text-foreground">Starter-sized training base</p>
          <p className="mt-2 text-sm text-muted">
            This dataset currently has {dataset?.uniqueRepositories ?? 0} repositories. Use <span className="font-semibold text-foreground">npm run ml:bootstrap:foundation -- --github-token &lt;token&gt; --gharchive-source &lt;path&gt;</span> to build the larger GitHub foundation base before treating model metrics as representative.
          </p>
        </Card>
      ) : null}

      {totalSnapshots > 0 && labeledSnapshots === 0 ? (
        <Card className="border-amber-300/30 bg-amber-300/10">
          <p className="text-sm font-semibold text-foreground">Snapshots are captured, labels are not</p>
          <p className="mt-2 text-sm text-muted">
            Runtime repository captures feed this file, but supervised training starts only after historical rows include label_inactive_12m.
          </p>
        </Card>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="space-y-2">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Snapshots</p>
          <p className="text-4xl font-semibold tracking-tight text-foreground">{totalSnapshots}</p>
          <p className="text-sm text-muted">Current analysis-backed training base</p>
        </Card>
        <Card className="space-y-2">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Repositories</p>
          <p className="text-4xl font-semibold tracking-tight text-foreground">{dataset?.uniqueRepositories ?? 0}</p>
          <p className="text-sm text-muted">Unique repos visible to the trainer</p>
        </Card>
        <Card className="space-y-2">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Labeled rows</p>
          <p className="text-4xl font-semibold tracking-tight text-foreground">{labeledSnapshots}</p>
          <p className="text-sm text-muted">Coverage {formatCoverage(labeledSnapshots, totalSnapshots)}</p>
        </Card>
        <Card className="space-y-2">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Inactive 12m rate</p>
          <p className="text-4xl font-semibold tracking-tight text-foreground">{formatTrainingRate(run?.metrics?.positiveRate ?? (labeledSnapshots ? inactiveLabelCount / labeledSnapshots : undefined))}</p>
          <p className="text-sm text-muted">{run?.metrics ? "Held-out class balance proxy" : "Dataset label balance"}</p>
        </Card>
      </section>

      <section className="grid gap-6 xl:grid-cols-[0.9fr_1.1fr]">
        <Card className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted">Training Base</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">How the current OSS base looks before it reaches the model</h2>
          </div>
          <div>
            <DetailRow label="Dataset path" value={dataset?.datasetPath ?? "tmp/training/snapshots.json"} />
            <DetailRow label="Analyses represented" value={`${dataset?.uniqueAnalyses ?? 0}`} />
            <DetailRow label="Packages represented" value={`${dataset?.uniquePackages ?? 0}`} />
            <DetailRow label="Real-project labels" value={`${realProjectLabeledSnapshots}/${labeledSnapshots}`} />
            <DetailRow label="Last updated" value={dataset?.lastUpdatedAt ? formatDate(dataset.lastUpdatedAt) : "Unknown"} />
            <DetailRow label="Observed window" value={observedWindow} />
            <DetailRow label="Time-aware split" value={formatTrainingSplit(run)} />
          </div>
        </Card>

        <Card className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-muted">Latest Artifact Coverage</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Training-data results surfaced directly from the cached run</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="neutral">{featureNames.length} features</Badge>
              <Badge tone="neutral">{run?.datasetSummary?.unlabeledRows ?? Math.max(0, totalSnapshots - labeledSnapshots)} unlabeled rows</Badge>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-[1.25rem] border border-line bg-panelAlt/80 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Rows in artifact</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{run?.datasetSummary?.totalRows ?? totalSnapshots}</p>
            </div>
            <div className="rounded-[1.25rem] border border-line bg-panelAlt/80 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Evaluation sample</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{run?.metrics?.sampleCount ?? 0}</p>
            </div>
            <div className="rounded-[1.25rem] border border-line bg-panelAlt/80 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Latest hash</p>
              <p className="mt-2 text-lg font-semibold text-foreground break-all">{run?.datasetHash ?? "Pending"}</p>
            </div>
            <div className="rounded-[1.25rem] border border-line bg-panelAlt/80 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.18em] text-muted">Artifact status</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{run?.status ? formatTrainingStatus(run.status) : (loading ? "Loading" : "No run")}</p>
            </div>
          </div>

          <p className="text-sm text-muted">
            This page is intentionally about the training base itself: which OSS projects are represented, how much data exists, how much is labeled, how imbalanced the held-out slice is, and which features flow into the model.
          </p>
        </Card>
      </section>

      <TrainingEffectsSection effects={effects} loading={loading} />

      <Card className="space-y-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted">Training OSS Projects</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Ranked repositories in the current base</h2>
            <p className="mt-2 max-w-3xl text-sm text-muted">
              Repository submissions use the same scoring surface as these base projects, so a newly searched repo can be compared against the captured OSS population.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link href="/docs/ml/repositories" className="text-sm font-semibold text-accent transition hover:text-foreground">
              Open full repo list
            </Link>
            <Badge tone="neutral">{trainingRepositories.length} repos</Badge>
          </div>
        </div>

        <Input
          value={repositorySearch}
          onChange={(event) => setRepositorySearch(event.target.value)}
          placeholder="Search training repository"
        />

        {filteredTrainingRepositories.length ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-[0.18em] text-muted">
                  <th className="pb-3 pr-4">Rank</th>
                  <th className="pb-3 pr-4">Repository</th>
                  <th className="pb-3 pr-4">Snapshots</th>
                  <th className="pb-3 pr-4">Packages</th>
                  <th className="pb-3 pr-4">Analyses</th>
                  <th className="pb-3 pr-4">Signals</th>
                  <th className="pb-3 pr-4">Last observed</th>
                </tr>
              </thead>
              <tbody>
                {filteredTrainingRepositories.slice(0, 100).map((repository) => (
                  <tr key={repository.url} className="border-b border-line/70 align-top">
                    <td className="py-4 pr-4 font-semibold text-foreground">#{repository.rank}</td>
                    <td className="py-4 pr-4">
                      <p className="font-semibold text-foreground">{repository.fullName || repository.url}</p>
                      {repository.url ? (
                        <a href={repository.url} target="_blank" rel="noreferrer" className="mt-1 block break-all text-xs text-accent">
                          {repository.url}
                        </a>
                      ) : null}
                    </td>
                    <td className="py-4 pr-4 font-semibold text-foreground">{repository.snapshotCount}</td>
                    <td className="py-4 pr-4 text-foreground">{repository.packageCount}</td>
                    <td className="py-4 pr-4 text-foreground">{repository.analysisCount}</td>
                    <td className="py-4 pr-4 text-muted">
                      <p>{repository.stars.toLocaleString()} stars / {repository.forks.toLocaleString()} forks</p>
                      <p className="mt-1 text-xs">{repository.archived ? "Archived" : "Not archived"}</p>
                    </td>
                    <td className="py-4 pr-4 text-muted">{repository.lastObservedAt ? formatDate(repository.lastObservedAt) : "Unknown"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted">
            {trainingRepositories.length ? "No training repositories match the current search." : "Run repository analyses first to populate the visible OSS training base."}
          </p>
        )}

        {filteredTrainingRepositories.length > 100 ? (
          <p className="text-xs text-muted">Showing the first 100 ranked repositories in the current search.</p>
        ) : null}
      </Card>

      <Card className="space-y-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted">Feature Inventory</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Latest training feature set</h2>
          </div>
          <Link href="/docs/ml/runs" className="text-sm font-semibold text-accent transition hover:text-foreground">
            Go to run history
          </Link>
        </div>

        {featureNames.length ? (
          <div className="flex flex-wrap gap-2">
            {featureNames.map((feature) => (
              <Badge key={feature} tone="neutral" className="normal-case tracking-[0.08em]">
                {feature}
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">Run training once to surface the feature inventory from the latest cached artifact.</p>
        )}
      </Card>
    </div>
  );
}
