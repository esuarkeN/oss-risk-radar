"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/format";
import { formatTrainingRate, formatTrainingSplit, formatTrainingStatus } from "@/lib/ml-evaluation";
import { useMlEvaluationState } from "@/lib/use-ml-evaluation-state";

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

export function MlTrainingDatasetView() {
  const { dataset, latestRun: run, loading, error, refresh } = useMlEvaluationState();
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
            <Link href="/ml-evaluation/repositories" className="text-sm font-semibold text-accent transition hover:text-foreground">
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
          <Link href="/ml-evaluation/runs" className="text-sm font-semibold text-accent transition hover:text-foreground">
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
