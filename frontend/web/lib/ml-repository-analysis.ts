import { featureCatalogLabels } from "@/lib/feature-catalog";
import type { DependencyRecord, TrainingRunModelArtifact } from "@/lib/types";

export interface RepositoryVariableImpact {
  feature: string;
  label: string;
  value: number;
  coefficient: number;
  standardizedValue: number;
  impact: number;
  /** Whether this feature came from a real observed signal (vs. an imputed default). */
  observed: boolean;
  /** The model's expected (training-cohort mean) raw value for this feature. */
  cohortReference: number;
  /** Plain-language effect of this feature on the repo's inactivity risk. */
  direction: "raises" | "lowers" | "neutral";
}

export interface RepositoryModelAnalysis {
  rawProbability: number;
  calibratedProbability: number;
  threshold: number;
  impacts: RepositoryVariableImpact[];
}

const expectedSignals = [
  "last_push_age_days",
  "last_release_age_days",
  "release_cadence_days",
  "recent_contributors_90d",
  "contributor_concentration",
  "open_issue_growth_90d",
  "pr_response_median_days",
];

const featureLabels: Record<string, string> = {
  has_repository_mapping: "Repository mapped",
  is_direct_dependency: "Direct dependency",
  repo_archived: "Archived repository",
  last_push_age_days: "Days since push",
  last_release_age_days: "Days since release",
  release_cadence_days: "Release cadence",
  recent_contributors_90d: "Recent contributors",
  contributor_concentration: "Contributor concentration",
  open_issue_growth_90d: "Issue growth",
  pr_response_median_days: "PR response time",
  stars_log1p: "Stars",
  forks_log1p: "Forks",
  open_issues_log1p: "Open issues",
  signal_completeness: "Signal completeness",
  ecosystem_npm: "npm ecosystem",
  ecosystem_pypi: "PyPI ecosystem",
  ecosystem_go: "Go ecosystem",
  ecosystem_maven: "Maven ecosystem",
  ecosystem_other: "Other ecosystem",
  // The 43 full-history feature labels come from the shared catalog (single source of truth).
  ...featureCatalogLabels,
};

function sigmoid(value: number) {
  if (value >= 0) {
    const exponent = Math.exp(-value);
    return 1 / (1 + exponent);
  }

  const exponent = Math.exp(value);
  return exponent / (1 + exponent);
}

function numericRawSignal(dependency: DependencyRecord, key: string) {
  const value = dependency.rawSignals?.find((signal) => signal.key === key)?.value;
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function ageDaysFromDate(value?: string) {
  if (!value) {
    return undefined;
  }

  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return undefined;
  }

  return Math.max(0, Math.round((Date.now() - timestamp) / 86_400_000));
}

function normalizeEcosystem(value: string) {
  return value.trim().toLowerCase();
}

function featureLabel(feature: string) {
  return featureLabels[feature] ?? feature.replace(/_/g, " ");
}

function calibratedProbability(rawProbability: number, artifact: TrainingRunModelArtifact) {
  if (!artifact.calibrationBins.length) {
    return rawProbability;
  }

  const clipped = Math.max(0, Math.min(1, rawProbability));
  const bin =
    artifact.calibrationBins.find((item, index) => clipped < item.upperBound || index === artifact.calibrationBins.length - 1) ??
    artifact.calibrationBins[artifact.calibrationBins.length - 1];

  return bin?.empiricalRate ?? rawProbability;
}

export interface RepositoryFeatureResolution {
  values: Record<string, number>;
  /** Per-feature flag: true when the value came from a real signal, false when imputed/defaulted. */
  observed: Record<string, boolean>;
}

/** Features that are structural or one-hot encodings rather than observed maintenance evidence. */
export const NON_EVIDENTIAL_FEATURES = new Set([
  "has_repository_mapping",
  "is_direct_dependency",
  "signal_completeness",
  "ecosystem_npm",
  "ecosystem_pypi",
  "ecosystem_go",
  "ecosystem_maven",
  "ecosystem_other",
]);

export function resolveRepositoryFeatures(
  dependency: DependencyRecord,
  featureNames: string[],
): RepositoryFeatureResolution {
  const repository = dependency.repository;
  const historicalFeatures = dependency.historicalFeatures ?? {};
  const ecosystem = normalizeEcosystem(dependency.ecosystem);
  const missingSignals = new Set(dependency.riskProfile?.missingSignals ?? []);
  const modelCompletenessSignals = featureNames.filter((feature) => feature !== "signal_completeness");
  const completenessDenominator = modelCompletenessSignals.length || expectedSignals.length;
  const missingExpectedSignals =
    modelCompletenessSignals.length > 0
      ? modelCompletenessSignals.filter((signal) => missingSignals.has(signal)).length
      : expectedSignals.filter((signal) => missingSignals.has(signal)).length;

  const computed: Record<string, number> = {
    has_repository_mapping: repository ? 1 : 0,
    is_direct_dependency: dependency.direct ? 1 : 0,
    repo_archived: repository?.archived ? 1 : 0,
    last_push_age_days: numericRawSignal(dependency, "repository.last_push_age_days") ?? ageDaysFromDate(repository?.lastPushAt) ?? 0,
    last_release_age_days: numericRawSignal(dependency, "repository.last_release_age_days") ?? ageDaysFromDate(repository?.lastReleaseAt) ?? 0,
    release_cadence_days: numericRawSignal(dependency, "repository.release_cadence_days") ?? 0,
    recent_contributors_90d: numericRawSignal(dependency, "repository.recent_contributors_90d") ?? repository?.recentContributors90d ?? 0,
    contributor_concentration:
      numericRawSignal(dependency, "repository.contributor_concentration") ?? repository?.contributorConcentration ?? 0,
    open_issue_growth_90d: numericRawSignal(dependency, "repository.open_issue_growth_90d") ?? 0,
    pr_response_median_days:
      numericRawSignal(dependency, "repository.pr_median_response_days") ?? repository?.pullRequestMedianResponseDays ?? 0,
    stars_log1p: Math.log1p(repository?.stars ?? 0),
    forks_log1p: Math.log1p(repository?.forks ?? 0),
    open_issues_log1p: Math.log1p(repository?.openIssues ?? 0),
    signal_completeness: Math.max(0, (completenessDenominator - missingExpectedSignals) / completenessDenominator),
    ecosystem_npm: ecosystem === "npm" ? 1 : 0,
    ecosystem_pypi: ecosystem === "pypi" || ecosystem === "python" ? 1 : 0,
    ecosystem_go: ecosystem === "go" || ecosystem === "golang" ? 1 : 0,
    ecosystem_maven: ecosystem === "maven" ? 1 : 0,
    ecosystem_other: ["npm", "pypi", "python", "go", "golang", "maven"].includes(ecosystem) ? 0 : 1,
  };

  const values: Record<string, number> = {};
  const observed: Record<string, boolean> = {};
  for (const feature of featureNames) {
    const computedValue = computed[feature];
    const historicalValue = historicalFeatures[feature];
    values[feature] = computedValue ?? historicalValue ?? 0;
    // Structural and one-hot encodings are deterministic from the submission, so always "observed".
    // Evidential signals count as observed only when a source resolved and the signal is not flagged missing.
    observed[feature] = NON_EVIDENTIAL_FEATURES.has(feature)
      ? true
      : (computedValue !== undefined || historicalValue !== undefined) && !missingSignals.has(feature);
  }

  return { values, observed };
}

/** Backwards-compatible accessor returning only the resolved feature values. */
export function repositoryFeatureValues(dependency: DependencyRecord, featureNames: string[]) {
  return resolveRepositoryFeatures(dependency, featureNames).values;
}

/** Per-feature standardized position for a repo, independent of the model's algorithm. */
export interface RepositoryFeatureStat {
  feature: string;
  label: string;
  value: number;
  cohortReference: number;
  standardizedValue: number;
  observed: boolean;
}

/**
 * Resolve each model feature for a repository and express it as a z-score against the training
 * distribution. Requires only a standardization profile, so it works for any artifact (logistic
 * or tree) and underpins both the logistic impact decomposition and the per-prediction confidence.
 */
export function repositoryFeatureStats(
  dependency: DependencyRecord,
  artifact?: TrainingRunModelArtifact | null,
): RepositoryFeatureStat[] | null {
  const standardization = artifact?.standardization;
  if (!artifact?.featureNames.length || !standardization) {
    return null;
  }

  const { values, observed } = resolveRepositoryFeatures(dependency, artifact.featureNames);
  return artifact.featureNames.map((feature, index) => {
    const value = values[feature] ?? 0;
    const cohortReference = standardization.means[index] ?? 0;
    const scale = standardization.scales[index] || 1;
    return {
      feature,
      label: featureLabel(feature),
      value,
      cohortReference,
      standardizedValue: (value - cohortReference) / scale,
      observed: observed[feature] ?? false,
    };
  });
}

export function repositoryModelAnalysis(
  dependency: DependencyRecord,
  artifact?: TrainingRunModelArtifact | null,
): RepositoryModelAnalysis | null {
  const coefficients = artifact?.coefficients;
  const stats = repositoryFeatureStats(dependency, artifact);
  if (!artifact || !stats || !coefficients?.length || artifact.featureNames.length !== coefficients.length) {
    return null;
  }

  const impacts: RepositoryVariableImpact[] = stats.map((stat, index) => {
    const coefficient = coefficients[index] ?? 0;
    const impact = coefficient * stat.standardizedValue;
    return {
      ...stat,
      coefficient,
      impact,
      direction: impact > 0.001 ? "raises" : impact < -0.001 ? "lowers" : "neutral",
    };
  });

  const linearTerm = (artifact.intercept ?? 0) + impacts.reduce((total, impact) => total + impact.impact, 0);
  const rawProbability = sigmoid(linearTerm);

  return {
    rawProbability,
    calibratedProbability: calibratedProbability(rawProbability, artifact),
    threshold: artifact.threshold,
    impacts: impacts.sort((left, right) => Math.abs(right.impact) - Math.abs(left.impact)),
  };
}
