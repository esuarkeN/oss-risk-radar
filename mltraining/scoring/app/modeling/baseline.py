from __future__ import annotations

import math
from dataclasses import dataclass, field
from statistics import median


@dataclass(slots=True)
class StandardizationProfile:
    means: list[float]
    scales: list[float]
    # Per-column training medians used to impute undefined (NaN) features. Linear and
    # neural models cannot consume NaN; the tree model handles it natively and ignores this.
    medians: list[float] = field(default_factory=list)


@dataclass(slots=True)
class LogisticRegressionModel:
    feature_names: list[str]
    coefficients: list[float]
    intercept: float
    standardization: StandardizationProfile
    model_name: str = "logistic-regression-full-history"
    model_version: str = "0.4.0"


def _sigmoid(value: float) -> float:
    if value >= 0:
        exponent = math.exp(-value)
        return 1.0 / (1.0 + exponent)
    exponent = math.exp(value)
    return exponent / (1.0 + exponent)


def _standardize_matrix(matrix: list[list[float]]) -> tuple[list[list[float]], StandardizationProfile]:
    if not matrix:
        raise ValueError("training matrix cannot be empty")

    column_count = len(matrix[0])
    means: list[float] = []
    scales: list[float] = []
    medians: list[float] = []
    transformed = [[0.0 for _ in range(column_count)] for _ in matrix]

    for index in range(column_count):
        column = [row[index] for row in matrix]
        observed = [value for value in column if not math.isnan(value)]
        # A column that is undefined everywhere imputes to 0.0; its scale is then 1.0, so it
        # contributes nothing rather than poisoning the fit.
        column_median = float(median(observed)) if observed else 0.0
        imputed = [column_median if math.isnan(value) else value for value in column]
        mean = sum(imputed) / len(imputed)
        variance = sum((value - mean) ** 2 for value in imputed) / len(imputed)
        scale = math.sqrt(variance) or 1.0
        means.append(mean)
        scales.append(scale)
        medians.append(column_median)
        for row_index, value in enumerate(imputed):
            transformed[row_index][index] = (value - mean) / scale

    return transformed, StandardizationProfile(means=means, scales=scales, medians=medians)


def _apply_standardization(matrix: list[list[float]], profile: StandardizationProfile) -> list[list[float]]:
    transformed: list[list[float]] = []
    for row in matrix:
        standardized_row: list[float] = []
        for index, value in enumerate(row):
            if math.isnan(value):
                # Older artifacts predate the median profile; fall back to the column mean,
                # which standardizes to zero and is the least-informative substitute.
                value = profile.medians[index] if index < len(profile.medians) else profile.means[index]
            standardized_row.append((value - profile.means[index]) / profile.scales[index])
        transformed.append(standardized_row)
    return transformed


def _balanced_sample_weights(labels: list[int]) -> list[float]:
    positive_count = sum(1 for label in labels if label == 1)
    negative_count = len(labels) - positive_count
    if positive_count == 0 or negative_count == 0:
        return [1.0 for _ in labels]

    positive_weight = len(labels) / (2.0 * positive_count)
    negative_weight = len(labels) / (2.0 * negative_count)
    return [positive_weight if label == 1 else negative_weight for label in labels]


def fit_logistic_regression(
    feature_names: list[str],
    matrix: list[list[float]],
    labels: list[int],
    learning_rate: float = 0.05,
    epochs: int = 800,
    l2_penalty: float = 0.01,
) -> LogisticRegressionModel:
    if not matrix:
        raise ValueError("training matrix cannot be empty")
    if len(matrix) != len(labels):
        raise ValueError("feature matrix and labels must have the same length")

    standardized_matrix, profile = _standardize_matrix(matrix)
    feature_count = len(feature_names)
    weights = [0.0 for _ in range(feature_count)]
    intercept = 0.0
    sample_weights = _balanced_sample_weights(labels)
    sample_weight_total = sum(sample_weights) or float(len(labels))

    for _ in range(epochs):
        gradient_weights = [0.0 for _ in range(feature_count)]
        gradient_intercept = 0.0

        for row, label, sample_weight in zip(standardized_matrix, labels, sample_weights, strict=True):
            linear_term = intercept + sum(weight * value for weight, value in zip(weights, row, strict=True))
            prediction = _sigmoid(linear_term)
            error = (prediction - label) * sample_weight
            gradient_intercept += error
            for index, value in enumerate(row):
                gradient_weights[index] += error * value

        intercept -= learning_rate * gradient_intercept / sample_weight_total
        for index in range(feature_count):
            penalty = l2_penalty * weights[index]
            weights[index] -= learning_rate * ((gradient_weights[index] / sample_weight_total) + penalty)

    return LogisticRegressionModel(
        feature_names=feature_names,
        coefficients=weights,
        intercept=intercept,
        standardization=profile,
    )


def predict_probabilities(model: LogisticRegressionModel, matrix: list[list[float]]) -> list[float]:
    standardized_matrix = _apply_standardization(matrix, model.standardization)
    probabilities: list[float] = []
    for row in standardized_matrix:
        linear_term = model.intercept + sum(
            weight * value for weight, value in zip(model.coefficients, row, strict=True)
        )
        probabilities.append(_sigmoid(linear_term))
    return probabilities
