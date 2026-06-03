"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { CalibrationCurveChart } from "@/components/charts/calibration-curve-chart";
import { LogisticCoefficientChart } from "@/components/charts/logistic-coefficient-chart";
import { ModelMetricComparisonChart } from "@/components/charts/model-metric-comparison-chart";
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
  latestCompletedRunForModel,
  logisticCoefficientsFromRun,
  formatTrainingMetric,
  formatTrainingRate,
  formatTrainingSplit,
  modelMetricsFromRuns,
  metricHistoryFromRuns,
  shortTrainingHash,
  xgboostFeatureImportancesFromRun,
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

function AurocTable({ rows }: { rows: ReturnType<typeof modelMetricsFromRuns> }) {
  return (
    <Card className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-muted">AUROC Table</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Recent model ranking quality</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-[0.16em] text-muted">
              <th className="pb-3 pr-4">Run</th>
              <th className="pb-3 pr-4">AUROC</th>
              <th className="pb-3 pr-4">F1</th>
              <th className="pb-3 pr-4">Precision</th>
              <th className="pb-3 pr-4">Recall</th>
              <th className="pb-3 pr-4">Brier</th>
              <th className="pb-3 pr-4">ECE</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.model} className="border-b border-line/70 last:border-b-0">
                <td className="py-3 pr-4 font-semibold text-foreground">{row.model}</td>
                <td className="py-3 pr-4 text-foreground">{formatTrainingMetric(row.auroc)}</td>
                <td className="py-3 pr-4 text-foreground">{formatTrainingMetric(row.f1)}</td>
                <td className="py-3 pr-4 text-foreground">{formatTrainingMetric(row.precision)}</td>
                <td className="py-3 pr-4 text-foreground">{formatTrainingMetric(row.recall)}</td>
                <td className="py-3 pr-4 text-foreground">{formatTrainingMetric(row.brier)}</td>
                <td className="py-3 pr-4 text-foreground">{formatTrainingMetric(row.ece)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function MethodComparisonTable({ xgboostRun, logisticRun }: { xgboostRun: ReturnType<typeof latestCompletedRunForModel>; logisticRun: ReturnType<typeof latestCompletedRunForModel> }) {
  const ensembleReady = Boolean(xgboostRun?.metrics && logisticRun?.metrics);
  const ensembleMetric = (selector: (run: NonNullable<typeof xgboostRun>) => number | undefined) => {
    if (!xgboostRun || !logisticRun) {
      return undefined;
    }
    const values = [selector(xgboostRun), selector(logisticRun)].filter((value): value is number => value !== undefined);
    if (!values.length) {
      return undefined;
    }
    return values.reduce((sum, value) => sum + value, 0) / values.length;
  };
  const rows: Array<{
    method: string;
    role: string;
    status: string;
    auroc?: number;
    brier?: number;
    ece?: number;
    quality?: number;
  }> = [
    {
      method: "ML ensemble",
      role: "Runtime default",
      status: ensembleReady ? "Available" : "Needs both models",
      auroc: ensembleMetric((run) => run.metrics?.rocAuc),
      brier: ensembleMetric((run) => run.metrics?.brierScore),
      ece: ensembleMetric((run) => run.metrics?.expectedCalibrationError),
      quality: ensembleMetric((run) => run.metrics?.qualityScore),
    },
    {
      method: "XGBoost",
      role: "Model scorer",
      status: xgboostRun ? "Cached" : "Pending",
      auroc: xgboostRun?.metrics?.rocAuc,
      brier: xgboostRun?.metrics?.brierScore,
      ece: xgboostRun?.metrics?.expectedCalibrationError,
      quality: xgboostRun?.metrics?.qualityScore,
    },
    {
      method: "Logistic regression",
      role: "Model scorer",
      status: logisticRun ? "Cached" : "Pending",
      auroc: logisticRun?.metrics?.rocAuc,
      brier: logisticRun?.metrics?.brierScore,
      ece: logisticRun?.metrics?.expectedCalibrationError,
      quality: logisticRun?.metrics?.qualityScore,
    },
    { method: "Heuristic baseline", role: "Reference/fallback", status: "Always available" },
    { method: "Failsafe fallback", role: "Last resort", status: "Only after scorer failure" },
  ];

  return (
    <Card className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-muted">Scoring Methods</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Runtime model comparison</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-[0.16em] text-muted">
              <th className="pb-3 pr-4">Method</th>
              <th className="pb-3 pr-4">Role</th>
              <th className="pb-3 pr-4">Status</th>
              <th className="pb-3 pr-4">AUROC</th>
              <th className="pb-3 pr-4">Brier</th>
              <th className="pb-3 pr-4">ECE</th>
              <th className="pb-3 pr-4">Quality</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.method} className="border-b border-line/70 last:border-b-0">
                <td className="py-3 pr-4 font-semibold text-foreground">{row.method}</td>
                <td className="py-3 pr-4 text-muted">{row.role}</td>
                <td className="py-3 pr-4 text-foreground">{row.status}</td>
                <td className="py-3 pr-4 text-foreground">{formatTrainingMetric(row.auroc)}</td>
                <td className="py-3 pr-4 text-foreground">{formatTrainingMetric(row.brier)}</td>
                <td className="py-3 pr-4 text-foreground">{formatTrainingMetric(row.ece)}</td>
                <td className="py-3 pr-4 text-foreground">{formatTrainingMetric(row.quality)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function VariableEffectsTable({ rows }: { rows: ReturnType<typeof logisticCoefficientsFromRun> }) {
  return (
    <Card className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-muted">Variable Effects</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Strongest logistic effects</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-[0.16em] text-muted">
              <th className="pb-3 pr-4">Variable</th>
              <th className="pb-3 pr-4">Effect</th>
              <th className="pb-3 pr-4">Direction</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.feature} className="border-b border-line/70 last:border-b-0">
                <td className="py-3 pr-4 font-semibold text-foreground">{row.feature}</td>
                <td className="py-3 pr-4 text-foreground">{row.weight.toFixed(3)}</td>
                <td className="py-3 pr-4">
                  <Badge tone={row.weight >= 0 ? "high" : "low"}>{row.weight >= 0 ? "raises risk" : "lowers risk"}</Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-sm text-muted">
        Coefficients are read from the active artifact after training standardization; large absolute values move the inactivity probability the most.
      </p>
    </Card>
  );
}

function XGBoostFeatureTable({ rows }: { rows: ReturnType<typeof xgboostFeatureImportancesFromRun> }) {
  return (
    <Card className="space-y-4">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-muted">XGBoost Drivers</p>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Top gain importances</h2>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-[0.16em] text-muted">
              <th className="pb-3 pr-4">Variable</th>
              <th className="pb-3 pr-4">Gain</th>
              <th className="pb-3 pr-4">Share</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.feature} className="border-b border-line/70 last:border-b-0">
                <td className="py-3 pr-4 font-semibold text-foreground">{row.feature}</td>
                <td className="py-3 pr-4 text-foreground">{formatTrainingMetric(row.gain)}</td>
                <td className="py-3 pr-4 text-foreground">{formatTrainingRate(row.importance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function MlResultsDashboard() {
  const { dataset, latestRun: run, runs, loading, error, refresh } = useMlEvaluationState();
  const { toast } = useToast();
  const [running, setRunning] = useState(false);

  const calibrationData = useMemo(() => calibrationDataFromRun(run), [run]);
  const metricHistory = useMemo(() => metricHistoryFromRuns(runs), [runs]);
  const modelMetricRows = useMemo(() => modelMetricsFromRuns(runs), [runs]);
  const logisticRun = useMemo(() => latestCompletedRunForModel(runs, "logistic-regression-baseline"), [runs]);
  const xgboostRun = useMemo(() => latestCompletedRunForModel(runs, "xgboost-baseline"), [runs]);
  const coefficientRows = useMemo(() => logisticCoefficientsFromRun(logisticRun), [logisticRun]);
  const xgboostFeatureRows = useMemo(() => xgboostFeatureImportancesFromRun(xgboostRun), [xgboostRun]);

  const totalSnapshots = dataset?.totalSnapshots ?? 0;
  const labeledSnapshots = dataset?.labeledSnapshots ?? 0;
  const realProjectLabeledSnapshots = dataset?.realProjectLabeledSnapshots ?? 0;
  const datasetHasSnapshots = totalSnapshots > 0;
  const datasetReady = labeledSnapshots > 0 && realProjectLabeledSnapshots === labeledSnapshots;
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
      const modelCount = response.runs?.length ?? 1;
      toast({
        tone: "success",
        title: response.reusedCachedRun ? "Latest cached run reused" : "Training run finished",
        description: response.reusedCachedRun
          ? `The dataset hash did not change, so ${modelCount} cached model artifact${modelCount === 1 ? "" : "s"} stayed active.`
          : `${modelCount} model artifact${modelCount === 1 ? "" : "s"} were cached and are now visible across the ML pages.`,
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
              <p className="mt-2 text-lg font-semibold text-foreground">{totalSnapshots} snapshots</p>
              <p className="text-sm text-muted">{dataset?.uniqueRepositories ?? 0} repositories, {labeledSnapshots} labeled rows</p>
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
              {running ? "Running..." : run ? "Reuse all or run" : "Run all models"}
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
            <p className="text-sm text-muted">
              {datasetHasSnapshots && labeledSnapshots > 0 && realProjectLabeledSnapshots < labeledSnapshots
                ? `Training needs every labeled row to include a GitHub repository identity. Current base: ${realProjectLabeledSnapshots}/${labeledSnapshots} labeled rows are real-project snapshots.`
                : datasetHasSnapshots
                ? `Training needs labeled real-project rows before it can produce a model. Current base: ${labeledSnapshots}/${totalSnapshots} snapshots include label_inactive_12m.`
                : "Run repository analyses first so the training snapshot base has data to build from."}
            </p>
          ) : null}
        </Card>

        <Card className="space-y-5">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted">Latest Artifact</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">What changed in the current training picture</h2>
          </div>

          <p className="text-sm leading-6 text-muted">
            The deployed trainer now runs every available model by default and keeps each artifact visible. Runtime scoring uses the available model set as an ensemble unless a single model is explicitly requested.
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <DetailBlock label="Model" value={run?.modelName ? `${run.modelName} ${run.modelVersion}` : "Waiting for first run"} />
            <DetailBlock label="Observed window" value={observedWindow} />
            <DetailBlock label="Labeled rows" value={`${run?.datasetSummary?.labeledRows ?? labeledSnapshots} labeled / ${run?.datasetSummary?.totalRows ?? totalSnapshots} total`} />
            <DetailBlock label="Feature count" value={`${featureCount} features in the latest artifact`} />
          </div>

          <p className="text-sm text-muted">
            {run?.message ?? "Trigger the first run to cache a live evaluation artifact and populate the dataset and run-history pages."}
          </p>

          <div className="flex flex-wrap gap-2">
            <Badge tone="neutral">Default: XGBoost</Badge>
            <Badge tone="neutral">Available: logistic regression</Badge>
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
            label="ECE"
            value={formatTrainingMetric(run?.metrics?.expectedCalibrationError)}
            detail="Calibration gap across equal-width probability bins. Lower is better."
            accent="primary"
          />
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Inactive 12m rate"
            value={formatTrainingRate(run?.metrics?.positiveRate)}
            detail="Positive-label pressure in the current held-out slice."
            accent="secondary"
          />
          <MetricCard label="F1" value={formatTrainingMetric(run?.metrics?.f1Score)} detail="Thresholded balance of precision and recall." />
          <MetricCard label="Precision" value={formatTrainingMetric(run?.metrics?.precision)} detail="How often predicted inactivity is correct." />
          <MetricCard label="Recall" value={formatTrainingMetric(run?.metrics?.recall)} detail="How much true inactivity the model is catching." />
        </div>
        <MetricCard label="Log loss" value={formatTrainingMetric(run?.metrics?.logLoss)} detail="Penalty for overconfident wrong probabilities." />
      </section>

      <MethodComparisonTable xgboostRun={xgboostRun} logisticRun={logisticRun} />

      {modelMetricRows.length ? (
        <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <ModelMetricComparisonChart data={modelMetricRows} />
          <AurocTable rows={modelMetricRows} />
        </section>
      ) : (
        <Card className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted">AUROC Table</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">No evaluated model runs yet</h2>
          </div>
          <p className="text-sm text-muted">A completed training run with held-out labels will populate the AUROC and classification table.</p>
        </Card>
      )}

      {coefficientRows.length ? (
        <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
          <LogisticCoefficientChart data={coefficientRows} />
          <VariableEffectsTable rows={coefficientRows} />
        </section>
      ) : (
        <Card className="space-y-4">
          <div>
            <p className="text-xs uppercase tracking-[0.24em] text-muted">Variable Effects</p>
            <h2 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">No coefficient artifact yet</h2>
          </div>
          <p className="text-sm text-muted">Coefficient effects appear for completed logistic artifacts; XGBoost runs use the calibration and metric panels above.</p>
        </Card>
      )}

      {xgboostFeatureRows.length ? <XGBoostFeatureTable rows={xgboostFeatureRows} /> : null}

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
