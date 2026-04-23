from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field, HttpUrl, model_validator


class ScorecardCheckInput(BaseModel):
    name: str
    score: float = Field(ge=0, le=10)
    reason: str


class ScorecardSnapshotInput(BaseModel):
    score: float | None = Field(default=None, ge=0, le=10)
    checks: list[ScorecardCheckInput] = Field(default_factory=list)


class RepositorySnapshotInput(BaseModel):
    full_name: str
    url: HttpUrl
    default_branch: str = "main"
    archived: bool = False
    stars: int = Field(default=0, ge=0)
    forks: int = Field(default=0, ge=0)
    open_issues: int = Field(default=0, ge=0)
    last_push_age_days: int | None = Field(default=None, ge=0)
    last_release_age_days: int | None = Field(default=None, ge=0)
    release_cadence_days: int | None = Field(default=None, ge=0)
    recent_contributors_90d: int | None = Field(default=None, ge=0)
    contributor_concentration: float | None = Field(default=None, ge=0, le=1)
    open_issue_growth_90d: float | None = None
    pr_response_median_days: float | None = Field(default=None, ge=0)


class DependencySignalPayload(BaseModel):
    dependency_id: str
    package_name: str
    package_version: str
    ecosystem: str
    direct: bool = True
    repository: RepositorySnapshotInput | None = None
    scorecard: ScorecardSnapshotInput | None = None
    historical_features: dict[str, float] = Field(default_factory=dict)


class ScoreHeuristicRequest(BaseModel):
    analysis_id: str
    scoring_version: str = "heuristic-v1"
    dependencies: list[DependencySignalPayload]


class ExplanationFactor(BaseModel):
    label: str
    direction: Literal["increase", "decrease", "neutral"]
    weight: float
    detail: str


class EvidenceItem(BaseModel):
    source: str
    signal: str
    value: str
    observed_at: str
    provenance_url: HttpUrl | None = None


class RiskProfileResponse(BaseModel):
    inactivity_risk_score: float = Field(ge=0, le=100)
    maintenance_outlook_12m_score: float = Field(ge=0, le=100)
    security_posture_score: float = Field(ge=0, le=100)
    confidence_score: float = Field(ge=0, le=1)
    risk_bucket: Literal["low", "medium", "high", "critical"]
    action_level: Literal["monitor", "review", "replace_candidate"]
    caveats: list[str]
    missing_signals: list[str]
    explanation_factors: list[ExplanationFactor]
    evidence: list[EvidenceItem]


class ScoreResult(BaseModel):
    dependency_id: str
    package_name: str
    package_version: str
    ecosystem: str
    risk_profile: RiskProfileResponse


class ScoreHeuristicResponse(BaseModel):
    analysis_id: str
    scoring_version: str
    generated_at: str
    results: list[ScoreResult]


class ExtractedFeatureRow(BaseModel):
    dependency_id: str
    package_name: str
    package_version: str
    ecosystem: str
    observed_at: str
    missing_signals: list[str]
    heuristic_reference_score: float = Field(ge=0, le=100)
    feature_values: dict[str, float]


class FeaturesExtractResponse(BaseModel):
    analysis_id: str
    feature_version: str
    generated_at: str
    rows: list[ExtractedFeatureRow]


class TrainingSnapshotInput(BaseModel):
    analysis_id: str
    observed_at: str
    dependency: DependencySignalPayload
    label_inactive_12m: bool | None = None


class DatasetSummary(BaseModel):
    total_rows: int = Field(ge=0)
    labeled_rows: int = Field(ge=0)
    unlabeled_rows: int = Field(ge=0)
    earliest_observed_at: str | None = None
    latest_observed_at: str | None = None
    feature_names: list[str] = Field(default_factory=list)


class DatasetSplitSummary(BaseModel):
    train_rows: int = Field(ge=0)
    validation_rows: int = Field(ge=0)
    test_rows: int = Field(ge=0)


class EvaluationMetrics(BaseModel):
    threshold: float = Field(ge=0, le=1)
    sample_count: int = Field(ge=0)
    positive_rate: float = Field(ge=0, le=1)
    accuracy: float = Field(ge=0, le=1)
    precision: float = Field(ge=0, le=1)
    recall: float = Field(ge=0, le=1)
    f1_score: float = Field(ge=0, le=1)
    brier_score: float = Field(ge=0, le=1)
    log_loss: float = Field(ge=0)
    roc_auc: float = Field(ge=0, le=1)


class CalibrationBin(BaseModel):
    lower_bound: float = Field(ge=0, le=1)
    upper_bound: float = Field(ge=0, le=1)
    count: int = Field(ge=0)
    average_prediction: float = Field(ge=0, le=1)
    empirical_rate: float = Field(ge=0, le=1)


class StandardizationProfileArtifact(BaseModel):
    means: list[float] = Field(default_factory=list)
    scales: list[float] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_lengths(self) -> "StandardizationProfileArtifact":
        if len(self.means) != len(self.scales):
            raise ValueError("standardization means and scales must have the same length")
        return self


class LogisticRegressionModelArtifact(BaseModel):
    model_name: str
    model_version: str
    feature_version: str
    trained_at: str
    threshold: float = Field(ge=0, le=1)
    feature_names: list[str] = Field(default_factory=list)
    coefficients: list[float] = Field(default_factory=list)
    intercept: float
    standardization: StandardizationProfileArtifact
    calibration_bins: list[CalibrationBin] = Field(default_factory=list)

    @model_validator(mode="after")
    def validate_dimensions(self) -> "LogisticRegressionModelArtifact":
        feature_count = len(self.feature_names)
        if feature_count == 0:
            raise ValueError("model artifact must include feature names")
        if feature_count != len(self.coefficients):
            raise ValueError("feature_names and coefficients must have the same length")
        if feature_count != len(self.standardization.means):
            raise ValueError("standardization profile must match the feature count")
        return self


class ModelTrainRequest(BaseModel):
    model_name: str = "logistic-regression-baseline"
    dataset_uri: str | None = None
    snapshots: list[TrainingSnapshotInput] = Field(default_factory=list)
    train_ratio: float = Field(default=0.7, gt=0, lt=1)
    validation_ratio: float = Field(default=0.15, gt=0, lt=1)
    calibration_bins: int = Field(default=10, ge=3, le=50)
    threshold: float = Field(default=0.5, gt=0, lt=1)

    @model_validator(mode="after")
    def validate_data_source(self) -> "ModelTrainRequest":
        if self.dataset_uri is None and not self.snapshots:
            raise ValueError("either dataset_uri or snapshots must be provided")
        if self.train_ratio + self.validation_ratio >= 1:
            raise ValueError("train_ratio + validation_ratio must leave room for a test split")
        return self


class ScoreModelRequest(BaseModel):
    analysis_id: str
    scoring_version: str = "model-v1"
    dependencies: list[DependencySignalPayload]
    model_artifact: LogisticRegressionModelArtifact


class ModelTrainResponse(BaseModel):
    status: str
    model_name: str
    model_version: str
    trained_at: str
    dataset_summary: DatasetSummary | None = None
    split_summary: DatasetSplitSummary | None = None
    metrics: EvaluationMetrics | None = None
    calibration_bins: list[CalibrationBin] = Field(default_factory=list)
    artifact: LogisticRegressionModelArtifact | None = None
    message: str
