from __future__ import annotations

from dataclasses import dataclass
import math


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


def compute_binary_classification_metrics(
    predictions: list[float], labels: list[int], threshold: float = 0.5
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

    return BinaryClassificationMetrics(
        threshold=threshold,
        sample_count=len(labels),
        positive_rate=sum(labels) / len(labels),
        accuracy=accuracy,
        precision=precision,
        recall=recall,
        f1_score=f1_score,
        brier_score=brier_score,
        log_loss=log_loss,
        roc_auc=_roc_auc(clipped, labels),
    )
