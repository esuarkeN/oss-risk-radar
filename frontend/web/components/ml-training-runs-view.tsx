"use client";

import Link from "next/link";
import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/format";
import {
  formatTrainingMetric,
  formatTrainingRate,
  formatTrainingSplit,
  formatTrainingStatus,
  shortTrainingHash,
  sortTrainingRuns,
} from "@/lib/ml-evaluation";
import { useMlEvaluationState } from "@/lib/use-ml-evaluation-state";

function RunMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.2rem] border border-line bg-panelAlt/80 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.18em] text-muted">{label}</p>
      <p className="mt-2 text-lg font-semibold text-foreground">{value}</p>
    </div>
  );
}

export function MlTrainingRunsView() {
  const { latestRun, runs, loading, error, refresh } = useMlEvaluationState();
  const sortedRuns = useMemo(() => sortTrainingRuns(runs), [runs]);

  return (
    <div className="space-y-6">
      {error ? (
        <Card className="flex flex-col gap-4 border-rose-400/25 bg-rose-400/10 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Run history failed to load</p>
            <p className="mt-1 text-sm text-muted">{error}</p>
          </div>
          <Button onClick={() => void refresh()}>Retry</Button>
        </Card>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="space-y-2">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Cached runs</p>
          <p className="text-4xl font-semibold tracking-tight text-foreground">{sortedRuns.length}</p>
          <p className="text-sm text-muted">Staged artifacts currently visible to the UI</p>
        </Card>
        <Card className="space-y-2">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Latest status</p>
          <p className="text-4xl font-semibold tracking-tight text-foreground">{latestRun?.status ? formatTrainingStatus(latestRun.status) : (loading ? "Loading" : "None")}</p>
          <p className="text-sm text-muted">{latestRun?.cachedAt ? `Cached ${formatDate(latestRun.cachedAt)}` : "No latest artifact yet"}</p>
        </Card>
        <Card className="space-y-2">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Latest quality</p>
          <p className="text-4xl font-semibold tracking-tight text-foreground">{formatTrainingMetric(latestRun?.metrics?.qualityScore)}</p>
          <p className="text-sm text-muted">AUROC and Brier skill on held-out data</p>
        </Card>
        <Card className="space-y-2">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Latest hash</p>
          <p className="text-2xl font-semibold tracking-tight text-foreground">{shortTrainingHash(latestRun?.datasetHash)}</p>
          <p className="text-sm text-muted">Short fingerprint for the active dataset</p>
        </Card>
      </section>

      {sortedRuns.length ? (
        <section className="space-y-4">
          {sortedRuns.map((run, index) => (
            <Card key={`${run.cachedAt}-${run.datasetHash}-${index}`} className={index === 0 ? "border-accent/30" : undefined}>
              <div className="flex flex-col gap-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      {index === 0 ? <Badge tone="medium">Latest</Badge> : null}
                      <Badge tone="neutral">{formatTrainingStatus(run.status)}</Badge>
                    </div>
                    <div>
                      <h2 className="text-2xl font-semibold tracking-tight text-foreground">{run.modelName} {run.modelVersion}</h2>
                      <p className="mt-1 text-sm text-muted">
                        Cached {run.cachedAt ? formatDate(run.cachedAt) : "Unknown"}{run.trainedAt ? ` - Trained ${formatDate(run.trainedAt)}` : ""}
                      </p>
                    </div>
                  </div>
                  <Link href="/ml-evaluation" className="text-sm font-semibold text-accent transition hover:text-foreground">
                    Back to overview
                  </Link>
                </div>

                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
                  <RunMetric label="Quality" value={formatTrainingMetric(run.metrics?.qualityScore)} />
                  <RunMetric label="AUROC" value={formatTrainingMetric(run.metrics?.rocAuc)} />
                  <RunMetric label="Brier" value={formatTrainingMetric(run.metrics?.brierScore)} />
                  <RunMetric label="Inactive 12m rate" value={formatTrainingRate(run.metrics?.positiveRate)} />
                  <RunMetric label="Split" value={formatTrainingSplit(run)} />
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-[1.25rem] border border-line bg-panelAlt/80 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted">Artifact path</p>
                    <p className="mt-2 text-sm font-semibold text-foreground break-all">{run.artifactPath ?? "Pending"}</p>
                  </div>
                  <div className="rounded-[1.25rem] border border-line bg-panelAlt/80 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.18em] text-muted">Dataset hash</p>
                    <p className="mt-2 text-sm font-semibold text-foreground break-all">{run.datasetHash ?? "Pending"}</p>
                  </div>
                </div>

                <p className="text-sm text-muted">{run.message}</p>
              </div>
            </Card>
          ))}
        </section>
      ) : (
        <Card className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted">Run History</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">No staged model artifacts yet</h2>
          </div>
          <p className="text-sm text-muted">Run the offline notebook or `npm run ml:bootstrap:foundation -- --gharchive-source &lt;path&gt;` and the artifact log will appear here.</p>
        </Card>
      )}
    </div>
  );
}
