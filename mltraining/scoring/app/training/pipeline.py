from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
from typing import Any

from app.modeling import FEATURE_VERSION, fit_logistic_regression, predict_probabilities, serialize_logistic_regression_model
from app.schemas.score import CalibrationBin, DatasetSplitSummary, EvaluationMetrics, LogisticRegressionModelArtifact, TrainingSnapshotInput
from app.training.calibration import fit_histogram_calibrator
from app.training.datasets import build_dataset, labeled_rows, load_snapshots_from_uri, rows_to_matrix, summarize_dataset, time_aware_split
from app.training.evaluation import compute_binary_classification_metrics


@dataclass(slots=True)
class TrainingRunConfig:
    dataset_path: str | None = None
    snapshots: list[TrainingSnapshotInput] | list[dict[str, Any]] | None = None
    label_horizon_months: int = 12
    algorithm: str = "logistic_regression"
    train_ratio: float = 0.7
    validation_ratio: float = 0.15
    calibration_bins: int = 10
    threshold: float = 0.5


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
    artifact: LogisticRegressionModelArtifact | None
    note: str


def _load_snapshots(config: TrainingRunConfig) -> list[TrainingSnapshotInput]:
    if config.snapshots:
        return [
            item if isinstance(item, TrainingSnapshotInput) else TrainingSnapshotInput.model_validate(item)
            for item in config.snapshots
        ]
    if config.dataset_path:
        return load_snapshots_from_uri(config.dataset_path)
    raise ValueError("a dataset path or inline snapshots are required")


def run_training_pipeline(config: TrainingRunConfig) -> TrainingRunResult:
    snapshots = _load_snapshots(config)
    dataset = build_dataset(snapshots)
    summary = summarize_dataset(dataset)
    labeled_dataset_rows = labeled_rows(dataset.rows)
    trained_at = datetime.now(UTC).isoformat()

    if len(labeled_dataset_rows) < 3:
        return TrainingRunResult(
            status="insufficient_data",
            model_name="logistic-regression-baseline",
            model_version="0.2.0",
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

    train_matrix, train_labels = rows_to_matrix(split.train, dataset.feature_names)
    validation_matrix, validation_labels = rows_to_matrix(split.validation, dataset.feature_names)
    test_matrix, test_labels = rows_to_matrix(split.test, dataset.feature_names)

    model = fit_logistic_regression(dataset.feature_names, train_matrix, train_labels)
    validation_predictions = predict_probabilities(model, validation_matrix)
    calibrator = fit_histogram_calibrator(
        validation_predictions,
        validation_labels,
        bin_count=config.calibration_bins,
    )

    test_predictions = predict_probabilities(model, test_matrix)
    calibrated_predictions = calibrator.predict(test_predictions)
    metrics = compute_binary_classification_metrics(
        calibrated_predictions,
        test_labels,
        threshold=config.threshold,
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
        ),
        calibration_bins=calibration_bins,
        artifact=serialize_logistic_regression_model(
            model,
            trained_at=trained_at,
            threshold=config.threshold,
            calibration_bins=calibration_bins,
        ),
        note=(
            f"Trained {model.model_name} using {FEATURE_VERSION} on a time-aware split. "
            "The latest model artifact is now available for runtime scoring, but it still needs historical-label validation before thesis claims."
        ),
    )


def train_placeholder(config: TrainingRunConfig) -> dict[str, str]:
    result = run_training_pipeline(config)
    return {
        "status": result.status,
        "dataset_path": config.dataset_path or "inline",
        "algorithm": config.algorithm,
        "note": result.note,
    }
