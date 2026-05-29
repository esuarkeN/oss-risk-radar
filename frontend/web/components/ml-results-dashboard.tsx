"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { CalibrationCurveChart } from "@/components/charts/calibration-curve-chart";
import { TrainingMetricHistoryChart } from "@/components/charts/training-metric-history-chart";
import { InfoChipGroup } from "@/components/info-chip-group";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/toast-provider";
import { triggerTrainingRun } from "@/lib/api";
import { formatDate } from "@/lib/format";
import {
  calibrationDataFromRun,
  formatTrainingMetric,
  formatTrainingRate,
  formatTrainingSplit,
  metricHistoryFromRuns,
  shortTrainingHash,
} from "@/lib/ml-evaluation";
import { modelMetricGlossary } from "@/lib/metric-glossary";
import { useMlEvaluationState } from "@/lib/use-ml-evaluation-state";
import { cn } from "@/lib/utils";

function StatusPill({ status }: { status?: string }) {
  const label = status ?? "No cached run";
  const styles =
    status === "completed"
      ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-100"
      : status === "insufficient_data"
        ? "border-amber-300/30 bg-amber-300/10 text-amber-100"
        : "border-white/15 bg-white/10 text-white";

  return <span className={cn("inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em]", styles)}>{label.replace(/_/g, " ")}</span>;
}

function MetricCard({
  label,
  value,
  detail,
  accent,
}: {
  label: string;
  value: string;
  detail: string;
  accent?: "primary" | "secondary" | "neutral";
}) {
  const accentClass =
    accent === "primary"
      ? "border-accent/20 bg-[linear-gradient(180deg,hsl(var(--panel))_0%,hsl(var(--panel-alt))_100%)]"
      : accent === "secondary"
        ? "border-emerald-400/20 bg-[linear-gradient(180deg,hsl(var(--panel))_0%,hsl(var(--panel-alt))_100%)]"
        : "";

  return (
    <Card className={cn("space-y-2", accentClass)}>
      <p className="text-xs uppercase tracking-[0.24em] text-muted">{label}</p>
      <p className="text-4xl font-semibold tracking-tight text-foreground">{value}</p>
      <p className="text-sm text-muted">{detail}</p>
    </Card>
  );
}

function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[1.25rem] border border-line bg-panelAlt/80 px-4 py-3">
      <p className="text-xs uppercase tracking-[0.18em] text-muted">{label}</p>
      <p className="mt-2 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

export function MlResultsDashboard() {
  const { dataset, latestRun: run, runs, loading, error, refresh } = useMlEvaluationState();
  const { toast } = useToast();
  const [running, setRunning] = useState(false);

  const calibrationData = useMemo(() => calibrationDataFromRun(run), [run]);
  const metricHistory = useMemo(() => metricHistoryFromRuns(runs), [runs]);

  const datasetReady = (dataset?.totalSnapshots ?? 0) > 0;
  const canTrigger = datasetReady && !running;
  const featureCount = run?.datasetSummary?.featureNames.length ?? 0;
  const observedWindow =
    run?.datasetSummary?.earliestObservedAt && run?.datasetSummary?.latestObservedAt
      ? `${formatDate(run.datasetSummary.earliestObservedAt)} to ${formatDate(run.datasetSummary.latestObservedAt)}`
      : "Waiting for first completed artifact";

  async function handleTrigger(force = false) {
    setRunning(true);

    try {
      const response = await triggerTrainingRun(force);
      await refresh({ background: true });
      toast({
        tone: "success",
        title: response.reusedCachedRun ? "Latest cached run reused" : "Training run finished",
        description: response.reusedCachedRun
          ? "The dataset hash did not change, so the most recent cached artifact stayed active."
          : "A fresh training artifact was cached and is now visible across the ML pages.",
      });
    } catch (triggerError) {
      toast({
        tone: "error",
        title: "Training trigger failed",
        description: triggerError instanceof Error ? triggerError.message : "The ML training endpoint did not return a usable artifact.",
      });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      {error ? (
        <Card className="flex flex-col gap-4 border-rose-400/25 bg-rose-400/10 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">ML state failed to load</p>
            <p className="mt-1 text-sm text-muted">{error}</p>
          </div>
          <Button onClick={() => void refresh()}>Retry</Button>
        </Card>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.12fr_0.88fr]">
        <Card className="space-y-5 overflow-hidden border-line bg-panel">
          <div className="space-y-3">
            <StatusPill status={run?.status} />
            <div>
              <h2 className="text-3xl font-semibold tracking-tight text-foreground">Latest training result without the dashboard sprawl.</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-muted">
                Trigger training here, keep the key metrics above the fold, and push data inspection and artifact history into their own pages.
              </p>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <div className="rounded-lg border border-line bg-panelAlt p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Training base</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{dataset?.totalSnapshots ?? 0} snapshots</p>
              <p className="text-sm text-muted">{dataset?.uniqueRepositories ?? 0} repositories in the current base</p>
            </div>
            <div className="rounded-lg border border-line bg-panelAlt p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Dataset hash</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{shortTrainingHash(run?.datasetHash)}</p>
              <p className="text-sm text-muted">{run?.cachedAt ? `Cached ${formatDate(run.cachedAt)}` : "No cached artifact yet"}</p>
            </div>
            <div className="rounded-lg border border-line bg-panelAlt p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Time-aware split</p>
              <p className="mt-2 text-lg font-semibold text-foreground">{formatTrainingSplit(run)}</p>
              <p className="text-sm text-muted">{run?.metrics ? `${run.metrics.sampleCount} held-out samples evaluated` : "Split appears after the first completed run"}</p>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button onClick={() => void handleTrigger(false)} disabled={!canTrigger}>
              {running ? "Running..." : run ? "Reuse latest or run" : "Run training"}
            </Button>
            <Button className="bg-panel text-foreground hover:bg-panelAlt hover:text-foreground" onClick={() => void handleTrigger(true)} disabled={!canTrigger}>
              Force rerun
            </Button>
            <Link
              href="/ml-evaluation/dataset"
              className="inline-flex items-center justify-center rounded-md border border-line px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent/40 hover:bg-panelAlt"
            >
              Inspect dataset
            </Link>
            <Link
              href="/ml-evaluation/repositories"
              className="inline-flex items-center justify-center rounded-md border border-line px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent/40 hover:bg-panelAlt"
            >
              Inspect repos
            </Link>
            <Link
              href="/ml-evaluation/runs"
              className="inline-flex items-center justify-center rounded-md border border-line px-4 py-2 text-sm font-medium text-foreground transition hover:border-accent/40 hover:bg-panelAlt"
            >
              Inspect runs
            </Link>
          </div>

          {!datasetReady && !loading ? (
            <p className="text-sm text-muted">Run repository analyses first so the training snapshot base has enough data to build from.</p>
          ) : null}
        </Card>

        <Card className="space-y-5">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted">Latest Artifact</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">What changed in the current training picture</h2>
          </div>

          <p className="text-sm leading-6 text-muted">
            The deployed trainer currently produces the calibrated logistic-regression baseline. The thesis model track should add XGBoost, a compact neural network, and a calibrated ensemble score once those artifacts are implemented.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <DetailBlock label="Model" value={run?.modelName ? `${run.modelName} ${run.modelVersion}` : "Waiting for first run"} />
            <DetailBlock label="Observed window" value={observedWindow} />
            <DetailBlock label="Labeled rows" value={`${run?.datasetSummary?.labeledRows ?? 0} labeled / ${run?.datasetSummary?.totalRows ?? 0} total`} />
            <DetailBlock label="Feature count" value={`${featureCount} features in the latest artifact`} />
          </div>

          <p className="text-sm text-muted">
            {run?.message ?? "Trigger the first run to cache a live evaluation artifact and populate the dataset and run-history pages."}
          </p>

          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral">Current: logistic regression</Badge>
            <Badge tone="neutral">Next: XGBoost</Badge>
            <Badge tone="neutral">Next: neural net</Badge>
            <Badge tone="neutral">Target: calibrated ensemble</Badge>
          </div>
        </Card>
      </section>

      <section className="space-y-4">
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Quality"
            value={formatTrainingMetric(run?.metrics?.qualityScore)}
            detail="Combined held-out score from AUROC skill and Brier skill."
            accent="primary"
          />
          <MetricCard
            label="AUROC"
            value={formatTrainingMetric(run?.metrics?.rocAuc)}
            detail="Ranking quality on the held-out evaluation slice."
            accent="primary"
          />
          <MetricCard
            label="Brier"
            value={formatTrainingMetric(run?.metrics?.brierScore)}
            detail="Calibration-sensitive probability error. Lower is better."
            accent="primary"
          />
          <MetricCard
            label="Inactive 12m rate"
            value={formatTrainingRate(run?.metrics?.positiveRate)}
            detail="Positive-label pressure in the current held-out slice."
            accent="secondary"
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard label="F1" value={formatTrainingMetric(run?.metrics?.f1Score)} detail="Thresholded balance of precision and recall." />
          <MetricCard label="Precision" value={formatTrainingMetric(run?.metrics?.precision)} detail="How often predicted inactivity is correct." />
          <MetricCard label="Recall" value={formatTrainingMetric(run?.metrics?.recall)} detail="How much true inactivity the model is catching." />
          <MetricCard label="Log loss" value={formatTrainingMetric(run?.metrics?.logLoss)} detail="Penalty for overconfident wrong probabilities." />
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.16fr_0.84fr]">
        {calibrationData.length ? (
          <CalibrationCurveChart data={calibrationData} />
        ) : (
          <Card className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-muted">Calibration</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">No calibration artifact yet</h2>
            </div>
            <p className="text-sm text-muted">
              Once a completed run produces evaluation bins, the reliability curve will render here from the cached artifact.
            </p>
          </Card>
        )}

        <Card className="space-y-5">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted">Metric Guide</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Read the top-line metrics without leaving the page</h2>
          </div>
          <InfoChipGroup items={modelMetricGlossary} />
        </Card>
      </section>

      {metricHistory.length ? (
        <TrainingMetricHistoryChart data={metricHistory} />
      ) : (
        <Card className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted">Metric history</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">No cached run history yet</h2>
          </div>
          <p className="text-sm text-muted">Once you have more than one cached training run with metrics, the run-history trend chart will appear here.</p>
        </Card>
      )}
    </div>
  );
}
