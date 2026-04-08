export interface ModelMetric {
  model: string;
  auroc: number;
  f1: number;
  precision: number;
  recall: number;
  brier: number;
  note: string;
}

export interface CalibrationPoint {
  label: string;
  predicted: number;
  observed: number;
  ideal: number;
}

export interface LogisticCoefficient {
  feature: string;
  weight: number;
}

export const evaluationSnapshot = {
  selectedModel: "Logistic regression",
  datasetSummary: "1,284 dependency snapshots from npm, PyPI, and Go modules",
  splitStrategy: "Time-aware validation to reduce look-ahead bias in maintainer-activity signals",
  thesisFocus: "Calibrated triage support with interpretable signals rather than a black-box trust verdict."
};

export const modelMetrics: ModelMetric[] = [
  {
    model: "Heuristic baseline",
    auroc: 0.684,
    f1: 0.428,
    precision: 0.471,
    recall: 0.392,
    brier: 0.224,
    note: "Strong as a transparent reference, but weaker on ranking quality."
  },
  {
    model: "Logistic regression",
    auroc: 0.812,
    f1: 0.631,
    precision: 0.667,
    recall: 0.598,
    brier: 0.149,
    note: "Best calibration-to-interpretability balance for the thesis prototype."
  },
  {
    model: "Gradient boosting",
    auroc: 0.841,
    f1: 0.659,
    precision: 0.708,
    recall: 0.618,
    brier: 0.164,
    note: "Slightly better ranking, but less stable calibration and weaker explainability."
  }
];

export const logisticCalibrationCurve: CalibrationPoint[] = [
  { label: "0.05-0.15", predicted: 0.11, observed: 0.09, ideal: 0.11 },
  { label: "0.15-0.25", predicted: 0.19, observed: 0.17, ideal: 0.19 },
  { label: "0.25-0.35", predicted: 0.29, observed: 0.27, ideal: 0.29 },
  { label: "0.35-0.45", predicted: 0.39, observed: 0.41, ideal: 0.39 },
  { label: "0.45-0.55", predicted: 0.49, observed: 0.52, ideal: 0.49 },
  { label: "0.55-0.65", predicted: 0.58, observed: 0.6, ideal: 0.58 },
  { label: "0.65-0.75", predicted: 0.69, observed: 0.71, ideal: 0.69 },
  { label: "0.75-0.85", predicted: 0.8, observed: 0.77, ideal: 0.8 }
];

export const logisticRegressionCoefficients: LogisticCoefficient[] = [
  { feature: "Repository archived", weight: 1.46 },
  { feature: "Issue backlog growth", weight: 0.94 },
  { feature: "Contributor concentration", weight: 0.82 },
  { feature: "Missing release metadata", weight: 0.66 },
  { feature: "Scorecard coverage", weight: -0.48 },
  { feature: "PR responsiveness", weight: -0.61 },
  { feature: "Recent contributor depth", weight: -0.79 },
  { feature: "Release recency", weight: -1.18 }
];