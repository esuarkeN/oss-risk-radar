from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(slots=True)
class StandardizationProfile:
    means: list[float]
    scales: list[float]


@dataclass(slots=True)
class LogisticRegressionModel:
    feature_names: list[str]
    coefficients: list[float]
    intercept: float
    standardization: StandardizationProfile
    model_name: str = "logistic-regression-baseline"
    model_version: str = "0.2.0"


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
    transformed = [[0.0 for _ in range(column_count)] for _ in matrix]

    for index in range(column_count):
        column = [row[index] for row in matrix]
        mean = sum(column) / len(column)
        variance = sum((value - mean) ** 2 for value in column) / len(column)
        scale = math.sqrt(variance) or 1.0
        means.append(mean)
        scales.append(scale)
        for row_index, value in enumerate(column):
            transformed[row_index][index] = (value - mean) / scale

    return transformed, StandardizationProfile(means=means, scales=scales)


def _apply_standardization(matrix: list[list[float]], profile: StandardizationProfile) -> list[list[float]]:
    transformed: list[list[float]] = []
    for row in matrix:
        transformed.append(
            [
                (value - profile.means[index]) / profile.scales[index]
                for index, value in enumerate(row)
            ]
        )
    return transformed


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
    sample_count = float(len(labels))

    for _ in range(epochs):
        gradient_weights = [0.0 for _ in range(feature_count)]
        gradient_intercept = 0.0

        for row, label in zip(standardized_matrix, labels, strict=True):
            linear_term = intercept + sum(weight * value for weight, value in zip(weights, row, strict=True))
            prediction = _sigmoid(linear_term)
            error = prediction - label
            gradient_intercept += error
            for index, value in enumerate(row):
                gradient_weights[index] += error * value

        intercept -= learning_rate * gradient_intercept / sample_count
        for index in range(feature_count):
            penalty = l2_penalty * weights[index]
            weights[index] -= learning_rate * ((gradient_weights[index] / sample_count) + penalty)

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
