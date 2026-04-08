"use client";

import { startTransition, useEffect, useMemo, useState } from "react";

import { CalibrationCurveChart } from "@/components/charts/calibration-curve-chart";
import { InfoChipGroup } from "@/components/info-chip-group";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getLatestTrainingRun, getTrainingDatasetSummary, triggerTrainingRun } from "@/lib/api";
import { formatDate } from "@/lib/format";
import { modelMetricGlossary } from "@/lib/metric-glossary";
import type { TrainingDatasetSummary, TrainingRunArtifact } from "@/lib/types";

function formatMetric(value: number) {
  return value.toFixed(3);
}

function shortHash(value?: string) {
  if (!value) {
    return "Pending";
  }
  return value.slice(0, 12);
}

function calibrationDataFromRun(run: TrainingRunArtifact | null) {
  if (!run?.calibrationBins?.length) {
    return [];
  }

  return run.calibrationBins.map((bin) => ({
    label: `${bin.lowerBound.toFixed(2)}-${bin.upperBound.toFixed(2)}`,
    predicted: bin.averagePrediction,
    observed: bin.empiricalRate,
    ideal: bin.averagePrediction,
  }));
}

export function MlResultsDashboard() {
  const [dataset, setDataset] = useState<TrainingDatasetSummary | null>(null);
  const [run, setRun] = useState<TrainingRunArtifact | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [datasetSummary, latestRun] = await Promise.all([
          getTrainingDatasetSummary().catch(() => null),
          getLatestTrainingRun().catch(() => null)
        ]);

        if (cancelled) {
          return;
        }

        startTransition(() => {
          setDataset(datasetSummary);
          setRun(latestRun);
          setError(null);
          setLoading(false);
        });
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load ML evaluation state.");
          setLoading(false);
        }
      }
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, []);

  const calibrationData = useMemo(() => calibrationDataFromRun(run), [run]);
  const hasMetrics = Boolean(run?.metrics);
  const canTrigger = (dataset?.totalSnapshots ?? 0) > 0 && !loading && !running;

  async function handleTrigger(force = false) {
    setRunning(true);
    setNotice(null);
    setError(null);

    try {
      const response = await triggerTrainingRun(force);
      startTransition(() => {
        setRun(response.run);
        setNotice(
          response.reusedCachedRun
            ? "Latest cached run reused because the training dataset did not change."
            : "Training run finished and the result was cached as the new latest artifact."
        );
      });
    } catch (triggerError) {
      setError(triggerError instanceof Error ? triggerError.message : "Failed to trigger a training run.");
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="space-y-4 overflow-hidden border-line bg-[linear-gradient(135deg,#07111f_0%,#12334f_45%,#133f57_100%)] text-white">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-3">
            <p className="text-xs uppercase tracking-[0.24em] text-slate-300">ML Results</p>
            <h1 className="max-w-4xl text-3xl font-semibold tracking-tight lg:text-4xl">Live training artifacts with cache-aware reruns.</h1>
            <p className="max-w-3xl text-sm text-slate-200">
              Trigger a run from the current training snapshot base, reuse the last artifact when the dataset hash is unchanged, and keep the latest evaluation visible in the app.
            </p>
          </div>
          <InfoChipGroup items={modelMetricGlossary} />
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-[1.25rem] border border-white/10 bg-white/10 p-4 backdrop-blur">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Current status</p>
            <p className="mt-3 text-xl font-semibold text-white">{run?.status ?? "No cached run"}</p>
          </div>
          <div className="rounded-[1.25rem] border border-white/10 bg-white/10 p-4 backdrop-blur">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Training base</p>
            <p className="mt-3 text-sm font-semibold text-white">{dataset?.totalSnapshots ?? 0} snapshots / {dataset?.uniqueAnalyses ?? 0} analyses</p>
          </div>
          <div className="rounded-[1.25rem] border border-white/10 bg-white/10 p-4 backdrop-blur">
            <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Dataset hash</p>
            <p className="mt-3 text-sm font-semibold text-white">{shortHash(run?.datasetHash)}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button className="border-white/20 bg-white/10 text-white hover:border-white/40 hover:bg-white/15" onClick={() => void handleTrigger(false)} disabled={!canTrigger}>
            {running ? "Running..." : run ? "Reuse latest or run" : "Run training"}
          </Button>
          <Button className="border-white/20 bg-transparent text-white hover:border-white/40 hover:bg-white/10" onClick={() => void handleTrigger(true)} disabled={!canTrigger}>
            Force rerun
          </Button>
        </div>

        {notice ? <p className="text-sm text-emerald-200">{notice}</p> : null}
        {error ? <p className="text-sm text-rose-200">{error}</p> : null}
        {!canTrigger && (dataset?.totalSnapshots ?? 0) === 0 && !loading ? (
          <p className="text-sm text-slate-200">Run repository analyses first so the training snapshot base has data to work with.</p>
        ) : null}
      </Card>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="space-y-2">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Model</p>
          <p className="text-xl font-semibold tracking-tight text-foreground">{run?.modelName ?? "Pending"}</p>
          <p className="text-sm text-muted">{run?.modelVersion ?? "No artifact yet"}</p>
        </Card>
        <Card className="space-y-2">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Labeled rows</p>
          <p className="text-4xl font-semibold tracking-tight text-foreground">{run?.datasetSummary?.labeledRows ?? 0}</p>
          <p className="text-sm text-muted">Unlabeled: {run?.datasetSummary?.unlabeledRows ?? 0}</p>
        </Card>
        <Card className="space-y-2">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Cached at</p>
          <p className="text-xl font-semibold tracking-tight text-foreground">{run?.cachedAt ? formatDate(run.cachedAt) : "Not cached"}</p>
          <p className="text-sm text-muted">{run?.trainedAt ? `Trained ${formatDate(run.trainedAt)}` : "No completed run yet"}</p>
        </Card>
        <Card className="space-y-2">
          <p className="text-xs uppercase tracking-[0.24em] text-muted">Artifact</p>
          <p className="text-sm font-semibold tracking-tight text-foreground break-all">{run?.artifactPath ?? "Waiting for first run"}</p>
        </Card>
      </section>

      {hasMetrics ? (
        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <Card className="space-y-2">
            <p className="text-xs uppercase tracking-[0.24em] text-muted">AUROC</p>
            <p className="text-4xl font-semibold tracking-tight text-foreground">{formatMetric(run!.metrics!.rocAuc)}</p>
          </Card>
          <Card className="space-y-2">
            <p className="text-xs uppercase tracking-[0.24em] text-muted">Brier</p>
            <p className="text-4xl font-semibold tracking-tight text-foreground">{formatMetric(run!.metrics!.brierScore)}</p>
          </Card>
          <Card className="space-y-2">
            <p className="text-xs uppercase tracking-[0.24em] text-muted">F1</p>
            <p className="text-4xl font-semibold tracking-tight text-foreground">{formatMetric(run!.metrics!.f1Score)}</p>
          </Card>
          <Card className="space-y-2">
            <p className="text-xs uppercase tracking-[0.24em] text-muted">Precision</p>
            <p className="text-4xl font-semibold tracking-tight text-foreground">{formatMetric(run!.metrics!.precision)}</p>
          </Card>
          <Card className="space-y-2">
            <p className="text-xs uppercase tracking-[0.24em] text-muted">Recall</p>
            <p className="text-4xl font-semibold tracking-tight text-foreground">{formatMetric(run!.metrics!.recall)}</p>
          </Card>
          <Card className="space-y-2">
            <p className="text-xs uppercase tracking-[0.24em] text-muted">Log loss</p>
            <p className="text-4xl font-semibold tracking-tight text-foreground">{formatMetric(run!.metrics!.logLoss)}</p>
          </Card>
        </section>
      ) : null}

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        {calibrationData.length ? (
          <CalibrationCurveChart data={calibrationData} />
        ) : (
          <Card className="space-y-4">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-muted">Calibration</p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">No calibration artifact yet</h2>
            </div>
            <p className="text-sm text-muted">
              Once a completed training run produces evaluation bins, the reliability curve will render here from the cached artifact.
            </p>
          </Card>
        )}

        <Card className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted">Run details</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Latest cached training artifact</h2>
          </div>
          <div className="space-y-3 text-sm text-muted">
            <div className="rounded-[1.25rem] border border-line bg-panelAlt/80 px-4 py-3">
              <span className="font-semibold text-foreground">Dataset file:</span> {run?.datasetPath ?? dataset?.datasetPath ?? "tmp/training/snapshots.json"}
            </div>
            <div className="rounded-[1.25rem] border border-line bg-panelAlt/80 px-4 py-3">
              <span className="font-semibold text-foreground">Rows in artifact:</span> {run?.datasetSummary?.totalRows ?? 0}
            </div>
            <div className="rounded-[1.25rem] border border-line bg-panelAlt/80 px-4 py-3">
              <span className="font-semibold text-foreground">Time-aware split:</span>{" "}
              {run?.splitSummary ? `${run.splitSummary.trainRows}/${run.splitSummary.validationRows}/${run.splitSummary.testRows}` : "Pending or insufficient data"}
            </div>
            <div className="rounded-[1.25rem] border border-line bg-panelAlt/80 px-4 py-3">
              <span className="font-semibold text-foreground">Feature count:</span> {run?.datasetSummary?.featureNames.length ?? 0}
            </div>
          </div>
          <p className="text-sm text-muted">{run?.message ?? "Trigger the first run to generate and cache a live evaluation artifact."}</p>
          {run?.status === "insufficient_data" ? (
            <p className="text-sm text-muted">
              The trigger path works, but the current dataset still needs labeled snapshots before the logistic regression training path can produce full metrics.
            </p>
          ) : null}
        </Card>
      </section>
    </div>
  );
}
