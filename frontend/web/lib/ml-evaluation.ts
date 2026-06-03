import type { AnalysisRecord, ScoringMethodSummary, TrainingRunArtifact } from "@/lib/types";

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
  ece?: number;
  note: string;
}

export interface LogisticCoefficient {
  feature: string;
  weight: number;
}

export interface XGBoostFeatureImpact {
  feature: string;
  gain: number;
  importance: number;
}

export interface TrainingMetricHistoryPoint {
  label: string;
  auroc: number;
  brier: number;
  ece?: number;
}

export interface ScoringMethodOverview {
  label: string;
  method: string;
  role: string;
  modelVersion?: string;
  algorithm?: string;
  dependencyCount: number;
  sampleCount?: number;
  auroc?: number;
  brier?: number;
  ece?: number;
  quality?: number;
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
      ece: run.metrics?.expectedCalibrationError,
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
      ece: run.metrics?.expectedCalibrationError,
      note: run.message,
    }));
}

export function scoringMethodsFromAnalysis(analysis: AnalysisRecord | null): ScoringMethodOverview[] {
  const methods = analysis?.summary?.scoringMethods ?? [];
  return methods.map((method) => ({
    label: scoringMethodLabel(method),
    method: method.method,
    role: method.role,
    modelVersion: method.modelVersion,
    algorithm: method.algorithm,
    dependencyCount: method.dependencyCount,
    sampleCount: method.sampleCount,
    auroc: method.rocAuc,
    brier: method.brierScore,
    ece: method.expectedCalibrationError,
    quality: method.qualityScore,
  }));
}

export function runtimeScoringLabel(methods: ScoringMethodOverview[]) {
  if (methods.some((method) => method.method === "model_ensemble")) {
    const memberNames = methods
      .filter((method) => method.role === "ensemble_member")
      .map((method) => compactModelName(method.label));
    return `ML ensemble: ${memberNames.length ? memberNames.join(" + ") : "available models"}`;
  }
  const primaryModel = methods.find((method) => method.method === "model");
  if (primaryModel) {
    return `ML model: ${compactModelName(primaryModel.label)}`;
  }
  if (methods.some((method) => method.method === "failsafe")) {
    return "Failsafe fallback";
  }
  if (methods.some((method) => method.method === "heuristic")) {
    return "Heuristic fallback";
  }
  return "Pending";
}

export function latestCompletedRunForModel(runs: TrainingRunArtifact[], modelName: string) {
  return sortTrainingRuns(runs).find((run) => run.status === "completed" && run.modelName === modelName) ?? null;
}

export function logisticCoefficientsFromRun(run: TrainingRunArtifact | null, limit = 12): LogisticCoefficient[] {
  const artifact = run?.modelArtifact;
  const coefficients = artifact?.coefficients;
  if (!artifact?.featureNames.length || !coefficients?.length || artifact.featureNames.length !== coefficients.length) {
    return [];
  }

  return artifact.featureNames
    .map((feature, index) => ({
      feature: formatFeatureName(feature),
      weight: coefficients[index] ?? 0,
    }))
    .sort((left, right) => Math.abs(right.weight) - Math.abs(left.weight))
    .slice(0, limit);
}

export function xgboostFeatureImportancesFromRun(run: TrainingRunArtifact | null, limit = 12): XGBoostFeatureImpact[] {
  const importances = run?.modelArtifact?.featureImportances;
  if (!importances?.length) {
    return [];
  }

  return importances
    .map((importance) => ({
      feature: formatFeatureName(importance.feature),
      gain: importance.gain,
      importance: importance.importance,
    }))
    .sort((left, right) => right.importance - left.importance)
    .slice(0, limit);
}

function scoringMethodLabel(method: ScoringMethodSummary) {
  if (method.modelName) {
    return formatModelName(method.modelName);
  }
  if (method.method === "model_ensemble") {
    return "Model ensemble";
  }
  if (method.method === "failsafe") {
    return "Failsafe";
  }
  if (method.method === "heuristic") {
    return "Heuristic";
  }
  return formatFeatureName(method.method);
}

function formatModelName(modelName: string) {
  if (modelName === "xgboost-baseline") {
    return "XGBoost";
  }
  if (modelName === "logistic-regression-baseline") {
    return "Logistic regression";
  }
  return modelName.replace(/[-_]/g, " ");
}

function compactModelName(modelName: string) {
  return modelName.replace(" regression", "");
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
