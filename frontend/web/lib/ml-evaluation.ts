import type { AnalysisRecord, ScoringMethodSummary, TrainingRunArtifact, TrainingRunModelArtifact } from "@/lib/types";

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
  return "Model artifact required";
}

export function latestCompletedRunForModel(runs: TrainingRunArtifact[], modelName: string) {
  return sortTrainingRuns(runs).find((run) => run.status === "completed" && run.modelName === modelName) ?? null;
}

/** True when the artifact carries a usable linear coefficient layer (logistic regression). */
export function hasUsableCoefficients(artifact?: TrainingRunModelArtifact | null): artifact is TrainingRunModelArtifact {
  return Boolean(
    artifact &&
      artifact.featureNames.length &&
      artifact.coefficients?.length &&
      artifact.standardization &&
      artifact.featureNames.length === artifact.coefficients.length,
  );
}

/**
 * Pick the artifact to use for the per-repository coefficient/impact decomposition.
 *
 * The impact view is a linear (logistic) decomposition, so XGBoost artifacts — which have no
 * coefficients — are skipped. Among usable logistic runs we prefer one whose model actually
 * scored this repository (matched by name against the dependency's model results), falling back
 * to the most recently cached usable run. This keeps the impact view consistent with the model
 * that produced the score, e.g. a cold-start repo decomposes against the cold-start artifact.
 */
export function selectCoefficientArtifact(
  runs: TrainingRunArtifact[],
  preferredModelNames: string[] = [],
): TrainingRunModelArtifact | null {
  const usable = sortTrainingRuns(runs).filter(
    (run) => run.status === "completed" && hasUsableCoefficients(run.modelArtifact),
  );
  if (!usable.length) {
    return null;
  }
  const preferred = new Set(preferredModelNames);
  const match = usable.find(
    (run) => preferred.has(run.modelName) || (run.modelArtifact ? preferred.has(run.modelArtifact.modelName) : false),
  );
  return (match ?? usable[0]).modelArtifact ?? null;
}

/**
 * Pick any usable scoring artifact (logistic OR tree) for the confidence/coverage view. Used as a
 * fallback when no logistic artifact exists: a tree model still has a standardization profile and
 * calibration bins, so coverage, in-distribution fit, and calibration support remain computable
 * even though the per-feature coefficient impact chart does not apply.
 */
export function selectScoringArtifact(
  runs: TrainingRunArtifact[],
  preferredModelNames: string[] = [],
): TrainingRunModelArtifact | null {
  const usable = sortTrainingRuns(runs).filter(
    (run) =>
      run.status === "completed" &&
      run.modelArtifact?.featureNames.length &&
      run.modelArtifact.standardization,
  );
  if (!usable.length) {
    return null;
  }
  const preferred = new Set(preferredModelNames);
  const match = usable.find(
    (run) => preferred.has(run.modelName) || (run.modelArtifact ? preferred.has(run.modelArtifact.modelName) : false),
  );
  return (match ?? usable[0]).modelArtifact ?? null;
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
  return formatFeatureName(method.method);
}

function formatModelName(modelName: string) {
  if (modelName === "xgboost-full-history") {
    return "XGBoost full history";
  }
  if (modelName === "logistic-regression-full-history") {
    return "Logistic regression full history";
  }
  if (modelName === "xgboost-cold-start") {
    return "XGBoost cold start";
  }
  if (modelName === "logistic-regression-cold-start") {
    return "Logistic regression cold start";
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
