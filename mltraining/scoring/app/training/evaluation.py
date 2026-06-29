from __future__ import annotations

from dataclasses import dataclass
import math
from typing import Any, Callable, Sequence


@dataclass(slots=True)
class BinaryClassificationMetrics:
    threshold: float
    sample_count: int
    positive_rate: float
    accuracy: float
    precision: float
    recall: float
    f1_score: float
    brier_score: float
    log_loss: float
    roc_auc: float
    expected_calibration_error: float
    model_quality_score: float


def _safe_divide(numerator: float, denominator: float) -> float:
    if denominator == 0:
        return 0.0
    return numerator / denominator


def _roc_auc(predictions: list[float], labels: list[int]) -> float:
    positives = [(prediction, label) for prediction, label in zip(predictions, labels, strict=True) if label == 1]
    negatives = [(prediction, label) for prediction, label in zip(predictions, labels, strict=True) if label == 0]
    if not positives or not negatives:
        return 0.5

    concordant = 0.0
    ties = 0.0
    for positive_prediction, _ in positives:
        for negative_prediction, _ in negatives:
            if positive_prediction > negative_prediction:
                concordant += 1
            elif positive_prediction == negative_prediction:
                ties += 1

    total_pairs = len(positives) * len(negatives)
    return (concordant + (0.5 * ties)) / total_pairs


def expected_calibration_error(predictions: list[float], labels: list[int], bin_count: int = 10) -> float:
    if len(predictions) != len(labels):
        raise ValueError("predictions and labels must have the same length")
    if not predictions:
        raise ValueError("predictions cannot be empty")
    if bin_count <= 0:
        raise ValueError("bin_count must be positive")

    clipped = [max(0.0, min(1.0, prediction)) for prediction in predictions]
    total = len(labels)
    error = 0.0
    for bin_index in range(bin_count):
        lower = bin_index / bin_count
        upper = (bin_index + 1) / bin_count
        if bin_index == bin_count - 1:
            member_indexes = [index for index, prediction in enumerate(clipped) if lower <= prediction <= upper]
        else:
            member_indexes = [index for index, prediction in enumerate(clipped) if lower <= prediction < upper]
        if not member_indexes:
            continue

        average_prediction = sum(clipped[index] for index in member_indexes) / len(member_indexes)
        empirical_rate = sum(labels[index] for index in member_indexes) / len(member_indexes)
        error += (len(member_indexes) / total) * abs(average_prediction - empirical_rate)
    return error


def select_decision_threshold(predictions: list[float], labels: list[int]) -> float:
    if len(predictions) != len(labels):
        raise ValueError("predictions and labels must have the same length")
    if not predictions:
        raise ValueError("predictions cannot be empty")

    clipped = [max(0.0, min(1.0, prediction)) for prediction in predictions]
    candidates = sorted({0.5, *clipped})
    best_threshold = 0.5
    best_score = (-1.0, -1.0, -1.0, -1.0)

    for threshold in candidates:
        metrics = compute_binary_classification_metrics(clipped, labels, threshold=threshold)
        score = (
            metrics.f1_score,
            metrics.recall,
            metrics.precision,
            -abs(threshold - 0.5),
        )
        if score > best_score:
            best_score = score
            best_threshold = threshold

    return max(0.01, min(0.99, best_threshold))


def compute_binary_classification_metrics(
    predictions: list[float], labels: list[int], threshold: float = 0.5, calibration_bin_count: int = 10
) -> BinaryClassificationMetrics:
    if len(predictions) != len(labels):
        raise ValueError("predictions and labels must have the same length")
    if not predictions:
        raise ValueError("predictions cannot be empty")

    clipped = [max(0.0, min(1.0, prediction)) for prediction in predictions]
    decisions = [1 if prediction >= threshold else 0 for prediction in clipped]

    true_positives = sum(1 for decision, label in zip(decisions, labels, strict=True) if decision == 1 and label == 1)
    true_negatives = sum(1 for decision, label in zip(decisions, labels, strict=True) if decision == 0 and label == 0)
    false_positives = sum(1 for decision, label in zip(decisions, labels, strict=True) if decision == 1 and label == 0)
    false_negatives = sum(1 for decision, label in zip(decisions, labels, strict=True) if decision == 0 and label == 1)

    positive_rate = sum(labels) / len(labels)
    accuracy = _safe_divide(true_positives + true_negatives, len(labels))
    precision = _safe_divide(true_positives, true_positives + false_positives)
    recall = _safe_divide(true_positives, true_positives + false_negatives)
    f1_score = _safe_divide(2 * precision * recall, precision + recall)
    brier_score = sum((prediction - label) ** 2 for prediction, label in zip(clipped, labels, strict=True)) / len(labels)
    epsilon = 1e-9
    log_loss = -sum(
        (label * math.log(prediction + epsilon)) + ((1 - label) * math.log(1 - prediction + epsilon))
        for prediction, label in zip(clipped, labels, strict=True)
    ) / len(labels)
    roc_auc = _roc_auc(clipped, labels)
    ece = expected_calibration_error(clipped, labels, bin_count=calibration_bin_count)

    if positive_rate <= 0 or positive_rate >= 1:
        model_quality_score = 0.0
    else:
        climatology_brier = positive_rate * (1.0 - positive_rate)
        auc_skill = max(0.0, min(1.0, (roc_auc - 0.5) / 0.5))
        brier_skill = max(0.0, min(1.0, 1.0 - (brier_score / climatology_brier)))
        model_quality_score = max(0.0, min(1.0, (0.6 * auc_skill) + (0.4 * brier_skill)))

    return BinaryClassificationMetrics(
        threshold=threshold,
        sample_count=len(labels),
        positive_rate=positive_rate,
        accuracy=accuracy,
        precision=precision,
        recall=recall,
        f1_score=f1_score,
        brier_score=brier_score,
        log_loss=log_loss,
        roc_auc=roc_auc,
        expected_calibration_error=ece,
        model_quality_score=model_quality_score,
    )


def compute_sliced_metrics(
    items: Sequence[Any],
    predictions: Sequence[float],
    labels: Sequence[int],
    key_fn: Callable[[Any], Any],
    *,
    threshold: float = 0.5,
    calibration_bin_count: int = 10,
) -> list[dict[str, Any]]:
    """Evaluate the same held-out predictions within subgroups.

    Partitions the held-out rows by ``key_fn`` and reports per-slice metrics so that a
    single aggregate number cannot hide a subgroup where the model is weak. Ranking
    metrics that need both classes (ROC-AUC) are reported as ``None`` for single-class
    slices, where they are undefined, while threshold-free scores such as the Brier
    score are still reported. Each slice carries its own ``n`` so that thin slices are
    not over-interpreted.
    """
    if not (len(items) == len(predictions) == len(labels)):
        raise ValueError("items, predictions, and labels must have the same length")

    grouped: dict[str, dict[str, list[float]]] = {}
    for item, prediction, label in zip(items, predictions, labels, strict=True):
        bucket = grouped.setdefault(str(key_fn(item)), {"predictions": [], "labels": []})
        bucket["predictions"].append(float(prediction))
        bucket["labels"].append(int(label))

    summary: list[dict[str, Any]] = []
    for slice_name in sorted(grouped):
        slice_predictions = grouped[slice_name]["predictions"]
        slice_labels = [int(value) for value in grouped[slice_name]["labels"]]
        count = len(slice_labels)
        positive_rate = sum(slice_labels) / count if count else 0.0
        metrics = compute_binary_classification_metrics(
            slice_predictions,
            slice_labels,
            threshold=threshold,
            calibration_bin_count=calibration_bin_count,
        )
        both_classes = len(set(slice_labels)) == 2
        summary.append(
            {
                "slice": slice_name,
                "n": count,
                "positive_rate": round(positive_rate, 6),
                "roc_auc": round(metrics.roc_auc, 6) if both_classes else None,
                "brier_score": round(metrics.brier_score, 6),
                "accuracy": round(metrics.accuracy, 6),
                "precision": round(metrics.precision, 6),
                "recall": round(metrics.recall, 6),
                "f1_score": round(metrics.f1_score, 6),
            }
        )
    return summary
