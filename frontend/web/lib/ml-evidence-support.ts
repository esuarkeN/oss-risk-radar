import {
  NON_EVIDENTIAL_FEATURES,
  type RepositoryFeatureStat,
  type RepositoryModelAnalysis,
} from "@/lib/ml-repository-analysis";
import type { TrainingRunModelArtifact } from "@/lib/types";

/**
 * Per-prediction evidence support for a single repository score.
 *
 * The model artifact does not ship a coefficient covariance matrix, so a closed-form
 * predictive variance is not available. Instead we build a transparent evidence-support value from
 * three quantities that ARE computable per repository, and combine them with a geometric
 * mean so a single weak component genuinely drags the result down:
 *
 *   1. coverage             — share of expected maintenance signals actually observed.
 *   2. inDistribution       — share of observed evidential features sitting within
 *                             `IN_DISTRIBUTION_Z` standard deviations of the training mean
 *                             (i.e. not an extrapolation the model never saw).
 *   3. calibrationSupport   — how many samples backed the calibration bin this prediction
 *                             falls into, mapped through count / (count + HALF_SATURATION).
 *
 * These are epistemic ("how much do we trust THIS score") and deliberately distinct from
 * `marginToThreshold`, which is the decision margin ("how close is the call").
 */
export const EVIDENCE_SUPPORT_CONSTANTS = {
  /** |z| at or below this counts a feature as in-distribution. */
  IN_DISTRIBUTION_Z: 2,
  /** k in count / (count + k); a bin reaches 0.5 support at k samples. */
  CALIBRATION_HALF_SATURATION: 30,
  /** Calibrated probability this far from the threshold reads as a decisive call. */
  MARGIN_DECISIVE: 0.15,
  /** At or below this distance the call is borderline. */
  MARGIN_BORDERLINE: 0.05,
} as const;

export type EvidenceSupportComponentKey = "coverage" | "in_distribution" | "calibration_support";

export interface EvidenceSupportComponent {
  key: EvidenceSupportComponentKey;
  label: string;
  /** Normalized 0..1 score, or null when the component is not applicable. */
  value: number | null;
  detail: string;
}

export type MarginLabel = "Decisive" | "Moderate" | "Borderline";

export interface PredictionEvidenceSupport {
  /** Geometric mean of the applicable components, 0..1. */
  rollup: number;
  components: EvidenceSupportComponent[];
  marginToThreshold: number;
  marginLabel: MarginLabel;
  observedFeatureCount: number;
  evidentialFeatureCount: number;
  inDistributionFeatureCount: number;
  /** Samples backing the matched calibration bin, or null when calibration is unavailable. */
  calibrationBinCount: number | null;
}

/** Minimal per-feature input the evidence-support computation needs, satisfied by both impacts and feature stats. */
interface EvidenceSupportFeature {
  feature: string;
  observed: boolean;
  standardizedValue: number;
}

export interface PredictionEvidenceSupportInput {
  features: EvidenceSupportFeature[];
  /** Model probability used to locate the calibration band (pre-calibration). */
  rawProbability: number;
  calibratedProbability: number;
  threshold: number;
  artifact: TrainingRunModelArtifact;
  /** signal_completeness feature value when the model exposes it. */
  signalCompleteness?: number | null;
}

function matchedCalibrationBin(rawProbability: number, artifact: TrainingRunModelArtifact) {
  if (!artifact.calibrationBins.length) {
    return null;
  }
  const clipped = Math.max(0, Math.min(1, rawProbability));
  return (
    artifact.calibrationBins.find(
      (bin, index) => clipped < bin.upperBound || index === artifact.calibrationBins.length - 1,
    ) ?? artifact.calibrationBins[artifact.calibrationBins.length - 1]
  );
}

function geometricMean(values: number[]) {
  if (!values.length) {
    return 0;
  }
  // Clamp to [0,1]; a zero component legitimately collapses the rollup to zero.
  const product = values.reduce((total, value) => total * Math.max(0, Math.min(1, value)), 1);
  return product ** (1 / values.length);
}

/** Build evidence support from a logistic impact decomposition. */
export function evidenceSupportFromAnalysis(
  analysis: RepositoryModelAnalysis,
  artifact: TrainingRunModelArtifact,
): PredictionEvidenceSupport {
  const signalCompleteness =
    analysis.impacts.find((impact) => impact.feature === "signal_completeness")?.value ?? null;
  return predictionEvidenceSupport({
    features: analysis.impacts.map((impact) => ({
      feature: impact.feature,
      observed: impact.observed,
      standardizedValue: impact.standardizedValue,
    })),
    rawProbability: analysis.rawProbability,
    calibratedProbability: analysis.calibratedProbability,
    threshold: analysis.threshold,
    artifact,
    signalCompleteness,
  });
}

/** Build evidence support from bare feature stats (e.g. a tree model with no coefficient layer). */
export function evidenceSupportFromStats(
  stats: RepositoryFeatureStat[],
  probability: number,
  artifact: TrainingRunModelArtifact,
): PredictionEvidenceSupport {
  const signalCompleteness = stats.find((stat) => stat.feature === "signal_completeness")?.value ?? null;
  return predictionEvidenceSupport({
    features: stats.map((stat) => ({
      feature: stat.feature,
      observed: stat.observed,
      standardizedValue: stat.standardizedValue,
    })),
    rawProbability: probability,
    calibratedProbability: probability,
    threshold: artifact.threshold,
    artifact,
    signalCompleteness,
  });
}

export function predictionEvidenceSupport(input: PredictionEvidenceSupportInput): PredictionEvidenceSupport {
  const { features, artifact } = input;
  const evidential = features.filter((feature) => !NON_EVIDENTIAL_FEATURES.has(feature.feature));
  const evidentialFeatureCount = evidential.length;
  const observedEvidential = evidential.filter((feature) => feature.observed);
  const observedFeatureCount = observedEvidential.length;

  // 1. Coverage — prefer the model's own signal_completeness feature when present.
  const coverage =
    input.signalCompleteness != null
      ? Math.max(0, Math.min(1, input.signalCompleteness))
      : evidentialFeatureCount
        ? observedFeatureCount / evidentialFeatureCount
        : 0;

  // 2. In-distribution — over observed evidential features only (imputed ones have meaningless z-scores).
  const inDistributionFeatures = observedEvidential.filter(
    (feature) => Math.abs(feature.standardizedValue) <= EVIDENCE_SUPPORT_CONSTANTS.IN_DISTRIBUTION_Z,
  );
  const inDistributionFeatureCount = inDistributionFeatures.length;
  const inDistribution = observedFeatureCount ? inDistributionFeatureCount / observedFeatureCount : 0;

  // 3. Calibration support — samples backing the matched bin.
  const bin = matchedCalibrationBin(input.rawProbability, artifact);
  const calibrationBinCount = bin ? bin.count : null;
  const calibrationSupport =
    bin != null
      ? bin.count / (bin.count + EVIDENCE_SUPPORT_CONSTANTS.CALIBRATION_HALF_SATURATION)
      : null;

  const components: EvidenceSupportComponent[] = [
    {
      key: "coverage",
      label: "Data coverage",
      value: coverage,
      detail: `${observedFeatureCount}/${evidentialFeatureCount} expected signals observed; missing ones were imputed to the cohort average.`,
    },
    {
      key: "in_distribution",
      label: "In-distribution fit",
      value: observedFeatureCount ? inDistribution : null,
      detail: observedFeatureCount
        ? `${inDistributionFeatureCount}/${observedFeatureCount} observed features sit within ${EVIDENCE_SUPPORT_CONSTANTS.IN_DISTRIBUTION_Z}σ of what the model trained on.`
        : "No observed evidential signals to compare against the training distribution.",
    },
    {
      key: "calibration_support",
      label: "Calibration support",
      value: calibrationSupport,
      detail:
        bin != null
          ? `${bin.count} samples backed the calibration band this score falls in.`
          : "No calibration bins on this artifact, so the probability is uncalibrated.",
    },
  ];

  const applicable = components
    .map((component) => component.value)
    .filter((value): value is number => value != null);
  const rollup = geometricMean(applicable);

  const marginToThreshold = Math.abs(input.calibratedProbability - input.threshold);
  const marginLabel: MarginLabel =
    marginToThreshold >= EVIDENCE_SUPPORT_CONSTANTS.MARGIN_DECISIVE
      ? "Decisive"
      : marginToThreshold <= EVIDENCE_SUPPORT_CONSTANTS.MARGIN_BORDERLINE
        ? "Borderline"
        : "Moderate";

  return {
    rollup,
    components,
    marginToThreshold,
    marginLabel,
    observedFeatureCount,
    evidentialFeatureCount,
    inDistributionFeatureCount,
    calibrationBinCount,
  };
}
