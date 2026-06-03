import type { DependencyRecord, TrainingRunModelArtifact } from "@/lib/types";

export interface RepositoryVariableImpact {
  feature: string;
  label: string;
  value: number;
  coefficient: number;
  standardizedValue: number;
  impact: number;
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
  "scorecard_score",
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
  scorecard_score: "Scorecard score",
  scorecard_checks_scored: "Scorecard checks",
  scorecard_high_checks: "Strong scorecard checks",
  scorecard_low_checks: "Weak scorecard checks",
  stars_log1p: "Stars",
  forks_log1p: "Forks",
  open_issues_log1p: "Open issues",
  signal_completeness: "Signal completeness",
  ecosystem_npm: "npm ecosystem",
  ecosystem_pypi: "PyPI ecosystem",
  ecosystem_go: "Go ecosystem",
  ecosystem_maven: "Maven ecosystem",
  ecosystem_other: "Other ecosystem",
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

export function repositoryFeatureValues(dependency: DependencyRecord, featureNames: string[]) {
  const repository = dependency.repository;
  const scorecard = dependency.scorecard;
  const ecosystem = normalizeEcosystem(dependency.ecosystem);
  const missingSignals = new Set(dependency.riskProfile?.missingSignals ?? []);
  const missingExpectedSignals = expectedSignals.filter((signal) => missingSignals.has(signal)).length;
  const highChecks = scorecard?.checks.filter((check) => check.score >= 8).length ?? 0;
  const lowChecks = scorecard?.checks.filter((check) => check.score <= 4).length ?? 0;

  const values: Record<string, number> = {
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
    scorecard_score: numericRawSignal(dependency, "scorecard.score") ?? scorecard?.score ?? 0,
    scorecard_checks_scored: scorecard?.checks.length ?? 0,
    scorecard_high_checks: highChecks,
    scorecard_low_checks: lowChecks,
    stars_log1p: Math.log1p(repository?.stars ?? 0),
    forks_log1p: Math.log1p(repository?.forks ?? 0),
    open_issues_log1p: Math.log1p(repository?.openIssues ?? 0),
    signal_completeness: Math.max(0, (expectedSignals.length - missingExpectedSignals) / expectedSignals.length),
    ecosystem_npm: ecosystem === "npm" ? 1 : 0,
    ecosystem_pypi: ecosystem === "pypi" || ecosystem === "python" ? 1 : 0,
    ecosystem_go: ecosystem === "go" || ecosystem === "golang" ? 1 : 0,
    ecosystem_maven: ecosystem === "maven" ? 1 : 0,
    ecosystem_other: ["npm", "pypi", "python", "go", "golang", "maven"].includes(ecosystem) ? 0 : 1,
  };

  return Object.fromEntries(featureNames.map((feature) => [feature, values[feature] ?? 0]));
}

export function repositoryModelAnalysis(
  dependency: DependencyRecord,
  artifact?: TrainingRunModelArtifact | null,
): RepositoryModelAnalysis | null {
  const coefficients = artifact?.coefficients;
  const standardization = artifact?.standardization;
  if (
    !artifact?.featureNames.length ||
    !coefficients?.length ||
    !standardization ||
    artifact.featureNames.length !== coefficients.length
  ) {
    return null;
  }

  const featureValues = repositoryFeatureValues(dependency, artifact.featureNames);
  const impacts = artifact.featureNames.map((feature, index) => {
    const value = featureValues[feature] ?? 0;
    const scale = standardization.scales[index] || 1;
    const standardizedValue = (value - (standardization.means[index] ?? 0)) / scale;
    const coefficient = coefficients[index] ?? 0;

    return {
      feature,
      label: featureLabel(feature),
      value,
      coefficient,
      standardizedValue,
      impact: coefficient * standardizedValue,
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
