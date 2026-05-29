import type { TrainingRunArtifact } from "@/lib/types";

export interface CalibrationPoint {
  label: string;
  predicted: number;
  observed: number;
  ideal: number;
}

export interface ModelMetric {
  model: string;
  auroc: number;
  f1: number;
  precision: number;
  recall: number;
  brier: number;
  note: string;
}

export interface LogisticCoefficient {
  feature: string;
  weight: number;
}

export interface TrainingMetricHistoryPoint {
  label: string;
  auroc: number;
  brier: number;
}

export function formatTrainingMetric(value?: number, digits = 3) {
  if (value === undefined || value === null) {
    return "Pending";
  }
  return value.toFixed(digits);
}

export function formatTrainingRate(value?: number, digits = 1) {
  if (value === undefined || value === null) {
    return "Pending";
  }
  return `${(value * 100).toFixed(digits)}%`;
}

export function shortTrainingHash(value?: string) {
  if (!value) {
    return "Pending";
  }
  return value.slice(0, 12);
}

export function formatTrainingStatus(status?: string) {
  if (!status) {
    return "Pending";
  }
  return status.replace(/_/g, " ");
}

export function formatTrainingSplit(run: TrainingRunArtifact | null) {
  if (!run?.splitSummary) {
    return "Pending";
  }
  return `${run.splitSummary.trainRows}/${run.splitSummary.validationRows}/${run.splitSummary.testRows}`;
}

export function calibrationDataFromRun(run: TrainingRunArtifact | null): CalibrationPoint[] {
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

export function metricHistoryFromRuns(runs: TrainingRunArtifact[]): TrainingMetricHistoryPoint[] {
  return [...sortTrainingRuns(runs)]
    .reverse()
    .filter((run) => run.metrics)
    .map((run, index) => ({
      label: `Run ${index + 1}`,
      auroc: run.metrics?.rocAuc ?? 0,
      brier: run.metrics?.brierScore ?? 0,
    }));
}

export function modelMetricsFromRuns(runs: TrainingRunArtifact[]): ModelMetric[] {
  return sortTrainingRuns(runs)
    .filter((run) => run.metrics)
    .slice(0, 6)
    .map((run) => ({
      model: `${run.modelName || "model"} ${shortTrainingHash(run.datasetHash)}`,
      auroc: run.metrics?.rocAuc ?? 0,
      f1: run.metrics?.f1Score ?? 0,
      precision: run.metrics?.precision ?? 0,
      recall: run.metrics?.recall ?? 0,
      brier: run.metrics?.brierScore ?? 0,
      note: run.message,
    }));
}

export function logisticCoefficientsFromRun(run: TrainingRunArtifact | null, limit = 12): LogisticCoefficient[] {
  const artifact = run?.modelArtifact;
  if (!artifact?.featureNames.length || artifact.featureNames.length !== artifact.coefficients.length) {
    return [];
  }

  return artifact.featureNames
    .map((feature, index) => ({
      feature: formatFeatureName(feature),
      weight: artifact.coefficients[index] ?? 0,
    }))
    .sort((left, right) => Math.abs(right.weight) - Math.abs(left.weight))
    .slice(0, limit);
}

export function formatFeatureName(feature: string) {
  return feature.replace(/_/g, " ").replace(/\b\w/g, (character) => character.toUpperCase());
}

export function sortTrainingRuns(runs: TrainingRunArtifact[]) {
  return [...runs].sort((left, right) => {
    const leftTimestamp = left.cachedAt ? new Date(left.cachedAt).getTime() : 0;
    const rightTimestamp = right.cachedAt ? new Date(right.cachedAt).getTime() : 0;
    return rightTimestamp - leftTimestamp;
  });
}
