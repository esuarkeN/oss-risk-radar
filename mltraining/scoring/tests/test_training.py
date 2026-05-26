from app.training.calibration import fit_histogram_calibrator
from app.training.evaluation import compute_binary_classification_metrics
from app.modeling.baseline import fit_logistic_regression, predict_probabilities
from app.training.pipeline import TrainingRunConfig, run_training_pipeline


def test_calibration_bins_are_monotonic() -> None:
    calibrator = fit_histogram_calibrator(
        [0.1, 0.2, 0.4, 0.6, 0.8, 0.9],
        [0, 0, 1, 0, 1, 1],
        bin_count=3,
    )

    empirical_rates = [bucket.empirical_rate for bucket in calibrator.bins]
    assert empirical_rates == sorted(empirical_rates)


def test_binary_classification_metrics_handles_perfect_predictions() -> None:
    metrics = compute_binary_classification_metrics([0.01, 0.99, 0.02, 0.98], [0, 1, 0, 1])

    assert metrics.accuracy == 1.0
    assert metrics.roc_auc == 1.0
    assert metrics.brier_score < 0.001
    assert metrics.model_quality_score > 0.99


def test_balanced_logistic_regression_learns_rare_inactive_signal() -> None:
    matrix = [[0.0] for _ in range(20)] + [[10.0]]
    labels = [0 for _ in range(20)] + [1]

    model = fit_logistic_regression(["retirement_signal"], matrix, labels)
    negative_probability, positive_probability = predict_probabilities(model, [[0.0], [10.0]])

    assert positive_probability > negative_probability
    assert positive_probability > 0.5


def test_training_pipeline_returns_completed_result(training_snapshots: list[dict[str, object]]) -> None:
    result = run_training_pipeline(
        TrainingRunConfig(
            snapshots=training_snapshots,
            train_ratio=0.5,
            validation_ratio=0.25,
            calibration_bins=5,
        )
    )

    assert result.status == "completed"
    assert result.dataset_summary is not None
    assert result.split_summary is not None
    assert result.metrics is not None
    assert len(result.calibration_bins) == 5
    assert result.artifact is not None
    assert result.artifact.feature_version == "feature-set-v1"
    assert result.artifact.model_version == "0.3.0"
    assert len(result.artifact.feature_names) == len(result.artifact.coefficients)
