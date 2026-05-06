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

export function sortTrainingRuns(runs: TrainingRunArtifact[]) {
  return [...runs].sort((left, right) => {
    const leftTimestamp = left.cachedAt ? new Date(left.cachedAt).getTime() : 0;
    const rightTimestamp = right.cachedAt ? new Date(right.cachedAt).getTime() : 0;
    return rightTimestamp - leftTimestamp;
  });
}
