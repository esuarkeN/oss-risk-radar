from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from app.modeling import (
    FEATURE_REGIME_FULL_HISTORY,
    fit_logistic_regression,
    fit_xgboost_classifier,
    feature_version_for_regime,
    normalize_feature_regime,
    predict_probabilities,
    predict_xgboost_probabilities,
    serialize_logistic_regression_model,
    serialize_xgboost_model,
)
from app.schemas.score import CalibrationBin, DatasetSplitSummary, EvaluationMetrics, ModelArtifact, TrainingSnapshotInput
from app.training.calibration import fit_histogram_calibrator
from app.training.datasets import (
    DatasetSplit,
    TrainingRow,
    build_dataset,
    labeled_rows,
    load_snapshots_from_uri,
    rows_to_matrix,
    summarize_dataset,
    time_aware_split,
)
from app.training.evaluation import compute_binary_classification_metrics, select_decision_threshold


@dataclass(slots=True)
class TrainingRunConfig:
    dataset_path: str | None = None
    snapshots: list[TrainingSnapshotInput] | list[dict[str, Any]] | None = None
    label_horizon_months: int = 12
    algorithm: str = "logistic_regression"
    train_ratio: float = 0.75
    validation_ratio: float = 0.15
    calibration_bins: int = 10
    threshold: float | None = None
    feature_regime: str = FEATURE_REGIME_FULL_HISTORY
    exclude_already_archived_at_observation: bool = True


@dataclass(slots=True)
class TrainingRunResult:
    status: str
    model_name: str
    model_version: str
    trained_at: str
    dataset_summary: object | None
    split_summary: object | None
    metrics: object | None
    calibration_bins: list[CalibrationBin]
    artifact: ModelArtifact | None
    note: str


MODEL_ALIASES = {
    "logistic-regression-full-history": ("logistic_regression", "full-history", "logistic-regression-full-history", "0.4.0"),
    "logistic-regression-cold-start": ("logistic_regression", "cold-start", "logistic-regression-cold-start", "0.4.0"),
    "xgboost-full-history": ("xgboost", "full-history", "xgboost-full-history", "0.2.0"),
    "xgboost-cold-start": ("xgboost", "cold-start", "xgboost-cold-start", "0.2.0"),
    "logistic-regression-baseline": ("logistic_regression", "full-history", "logistic-regression-full-history", "0.4.0"),
    "logistic_regression": ("logistic_regression", "full-history", "logistic-regression-full-history", "0.4.0"),
    "logistic-regression": ("logistic_regression", "full-history", "logistic-regression-full-history", "0.4.0"),
    "xgboost-baseline": ("xgboost", "full-history", "xgboost-full-history", "0.2.0"),
    "xgboost": ("xgboost", "full-history", "xgboost-full-history", "0.2.0"),
    "xgboost_classifier": ("xgboost", "full-history", "xgboost-full-history", "0.2.0"),
    "xgboost-classifier": ("xgboost", "full-history", "xgboost-full-history", "0.2.0"),
    "gradient_boosted_trees": ("xgboost", "full-history", "xgboost-full-history", "0.2.0"),
    "gradient-boosted-trees": ("xgboost", "full-history", "xgboost-full-history", "0.2.0"),
}
SUPPORTED_ALGORITHMS = set(MODEL_ALIASES)


def _model_spec(algorithm: str, configured_regime: str) -> tuple[str, str, str, str]:
    normalized = algorithm.strip().lower()
    if normalized not in MODEL_ALIASES:
        raise ValueError(
            "unsupported model_name: "
            f"{algorithm}. Offline training supports logistic-regression-full-history, "
            "xgboost-full-history, logistic-regression-cold-start, and xgboost-cold-start."
        )
    algorithm_name, model_regime, model_name, model_version = MODEL_ALIASES[normalized]
    if normalized in {"logistic_regression", "logistic-regression", "xgboost", "xgboost_classifier", "xgboost-classifier", "gradient_boosted_trees", "gradient-boosted-trees"}:
        model_regime = normalize_feature_regime(configured_regime)
        if algorithm_name == "xgboost":
            model_name = "xgboost-cold-start" if model_regime == "cold-start" else "xgboost-full-history"
        else:
            model_name = "logistic-regression-cold-start" if model_regime == "cold-start" else "logistic-regression-full-history"
    return algorithm_name, normalize_feature_regime(model_regime), model_name, model_version


def _load_snapshots(config: TrainingRunConfig) -> list[TrainingSnapshotInput]:
    if config.snapshots:
        return [
            item if isinstance(item, TrainingSnapshotInput) else TrainingSnapshotInput.model_validate(item)
            for item in config.snapshots
        ]
    if config.dataset_path:
        return load_snapshots_from_uri(config.dataset_path)
    raise ValueError("a dataset path or inline snapshots are required")


def _row_identity(row: TrainingRow) -> tuple[str, str, str]:
    return (row.analysis_id, row.dependency_id, row.observed_at.isoformat())


def _assert_disjoint_splits(split: DatasetSplit) -> None:
    train_keys = {_row_identity(row) for row in split.train}
    validation_keys = {_row_identity(row) for row in split.validation}
    test_keys = {_row_identity(row) for row in split.test}

    if train_keys & validation_keys or train_keys & test_keys or validation_keys & test_keys:
        raise ValueError("train, validation, and test splits must be disjoint; duplicate snapshot identities crossed a split boundary")


def run_training_pipeline(config: TrainingRunConfig) -> TrainingRunResult:
    algorithm, feature_regime, model_name, model_version = _model_spec(config.algorithm, config.feature_regime)
    feature_version = feature_version_for_regime(feature_regime)
    snapshots = _load_snapshots(config)
    dataset = build_dataset(
        snapshots,
        feature_regime=feature_regime,
        exclude_already_archived_at_observation=config.exclude_already_archived_at_observation,
    )
    summary = summarize_dataset(dataset)
    labeled_dataset_rows = labeled_rows(dataset.rows)
    trained_at = datetime.now(UTC).isoformat()

    if len(labeled_dataset_rows) < 3:
        return TrainingRunResult(
            status="insufficient_data",
            model_name=model_name,
            model_version=model_version,
            trained_at=trained_at,
            dataset_summary=summary,
            split_summary=None,
            metrics=None,
            calibration_bins=[],
            artifact=None,
            note="At least three labeled snapshots are required for time-aware experimentation scaffolding.",
        )

    split = time_aware_split(
        labeled_dataset_rows,
        train_ratio=config.train_ratio,
        validation_ratio=config.validation_ratio,
    )
    _assert_disjoint_splits(split)

    train_matrix, train_labels = rows_to_matrix(split.train, dataset.feature_names)
    validation_matrix, validation_labels = rows_to_matrix(split.validation, dataset.feature_names)
    test_matrix, test_labels = rows_to_matrix(split.test, dataset.feature_names)

    if algorithm == "xgboost":
        model = fit_xgboost_classifier(dataset.feature_names, train_matrix, train_labels)
        validation_predictions = predict_xgboost_probabilities(model, validation_matrix)
    else:
        model = fit_logistic_regression(dataset.feature_names, train_matrix, train_labels)
        validation_predictions = predict_probabilities(model, validation_matrix)
    model.model_name = model_name
    model.model_version = model_version

    calibrator = fit_histogram_calibrator(
        validation_predictions,
        validation_labels,
        bin_count=config.calibration_bins,
    )
    calibrated_validation_predictions = calibrator.predict(validation_predictions)
    threshold = config.threshold
    if threshold is None:
        threshold = select_decision_threshold(calibrated_validation_predictions, validation_labels)

    if algorithm == "xgboost":
        test_predictions = predict_xgboost_probabilities(model, test_matrix)
    else:
        test_predictions = predict_probabilities(model, test_matrix)

    calibrated_predictions = calibrator.predict(test_predictions)
    metrics = compute_binary_classification_metrics(
        calibrated_predictions,
        test_labels,
        threshold=threshold,
        calibration_bin_count=config.calibration_bins,
    )
    calibration_bins = [
        CalibrationBin(
            lower_bound=bin_summary.lower_bound,
            upper_bound=bin_summary.upper_bound,
            count=bin_summary.count,
            average_prediction=bin_summary.average_prediction,
            empirical_rate=bin_summary.empirical_rate,
        )
        for bin_summary in calibrator.bins
    ]
    split_note = f"{config.train_ratio:.0%}/{config.validation_ratio:.0%}/{(1.0 - config.train_ratio - config.validation_ratio):.0%}"

    artifact = (
        serialize_xgboost_model(
            model,
            trained_at=trained_at,
            threshold=metrics.threshold,
            calibration_bins=calibration_bins,
            feature_version=feature_version,
        )
        if algorithm == "xgboost"
        else serialize_logistic_regression_model(
            model,
            trained_at=trained_at,
            threshold=metrics.threshold,
            calibration_bins=calibration_bins,
            feature_version=feature_version,
        )
    )

    return TrainingRunResult(
        status="completed",
        model_name=model.model_name,
        model_version=model.model_version,
        trained_at=trained_at,
        dataset_summary=summary,
        split_summary=DatasetSplitSummary(
            train_rows=len(split.train),
            validation_rows=len(split.validation),
            test_rows=len(split.test),
        ),
        metrics=EvaluationMetrics(
            threshold=metrics.threshold,
            sample_count=metrics.sample_count,
            positive_rate=round(metrics.positive_rate, 6),
            accuracy=round(metrics.accuracy, 6),
            precision=round(metrics.precision, 6),
            recall=round(metrics.recall, 6),
            f1_score=round(metrics.f1_score, 6),
            brier_score=round(metrics.brier_score, 6),
            log_loss=round(metrics.log_loss, 6),
            roc_auc=round(metrics.roc_auc, 6),
            expected_calibration_error=round(metrics.expected_calibration_error, 6),
            model_quality_score=round(metrics.model_quality_score, 6),
        ),
        calibration_bins=calibration_bins,
        artifact=artifact,
        note=(
            f"Trained {model.model_name} using {feature_version} on a {split_note} time-aware split with class-balanced inactive labels. "
            "Already-archived-at-observation rows are excluded so the model learns pre-inactivity warning indicators."
        ),
    )

