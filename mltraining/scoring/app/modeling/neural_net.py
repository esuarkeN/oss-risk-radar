from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any


@dataclass(slots=True)
class NeuralNetModel:
    feature_names: list[str]
    hidden_sizes: list[int]
    weights: list[list[list[float]]]  # weights[layer][out_neuron][in_neuron]
    biases: list[list[float]]          # biases[layer][out_neuron]
    means: list[float]                 # input standardization means
    scales: list[float]                # input standardization scales
    model_name: str = "neural-net-full-history"
    model_version: str = "0.1.0"


def _load_numpy() -> Any:
    try:
        import numpy as np
    except ModuleNotFoundError as exc:
        raise ValueError(
            "Neural network training requires numpy. "
            "Install mltraining/scoring requirements before training neural net artifacts."
        ) from exc
    return np


def _balanced_sample_weights(labels: list[int]) -> list[float]:
    positive_count = sum(1 for label in labels if label == 1)
    negative_count = len(labels) - positive_count
    if positive_count == 0 or negative_count == 0:
        return [1.0 for _ in labels]
    positive_weight = len(labels) / (2.0 * positive_count)
    negative_weight = len(labels) / (2.0 * negative_count)
    return [positive_weight if label == 1 else negative_weight for label in labels]


def fit_neural_net_classifier(
    feature_names: list[str],
    matrix: list[list[float]],
    labels: list[int],
    hidden_sizes: list[int] | None = None,
    learning_rate: float = 0.01,
    epochs: int = 150,
    batch_size: int = 256,
    l2_penalty: float = 0.001,
) -> NeuralNetModel:
    if not matrix:
        raise ValueError("training matrix cannot be empty")
    if len(matrix) != len(labels):
        raise ValueError("feature matrix and labels must have the same length")
    if len(set(labels)) < 2:
        raise ValueError("Neural net training requires both active and inactive labels in the training split")

    np = _load_numpy()

    if hidden_sizes is None:
        hidden_sizes = [64, 32]

    n_features = len(feature_names)
    layer_sizes = [n_features] + list(hidden_sizes) + [1]
    n_layers = len(layer_sizes) - 1

    # Xavier uniform initialization
    rng = np.random.default_rng(42)
    weights_np: list[Any] = []
    biases_np: list[Any] = []
    for i in range(n_layers):
        fan_in = layer_sizes[i]
        fan_out = layer_sizes[i + 1]
        limit = math.sqrt(6.0 / (fan_in + fan_out))
        weights_np.append(rng.uniform(-limit, limit, (fan_out, fan_in)))
        biases_np.append(np.zeros(fan_out, dtype=np.float64))

    X = np.array(matrix, dtype=np.float64)
    y = np.array(labels, dtype=np.float64)
    sample_weights = np.array(_balanced_sample_weights(labels), dtype=np.float64)

    # Standardize inputs; store params for inference-time application
    means = X.mean(axis=0)
    stds = X.std(axis=0)
    stds[stds == 0.0] = 1.0
    X = (X - means) / stds

    n_samples = X.shape[0]

    for _ in range(epochs):
        idx = rng.permutation(n_samples)
        X_shuf = X[idx]
        y_shuf = y[idx]
        w_shuf = sample_weights[idx]

        for start in range(0, n_samples, batch_size):
            end = min(start + batch_size, n_samples)
            X_b = X_shuf[start:end]
            y_b = y_shuf[start:end]
            w_b = w_shuf[start:end]
            b_size = end - start

            # Forward pass: activations[0] = input, activations[i+1] = output of layer i
            activations: list[Any] = [X_b]
            pre_acts: list[Any] = []
            for i in range(n_layers):
                z = activations[-1] @ weights_np[i].T + biases_np[i]
                pre_acts.append(z)
                if i == n_layers - 1:
                    activations.append(1.0 / (1.0 + np.exp(-np.clip(z, -500.0, 500.0))))
                else:
                    activations.append(np.maximum(0.0, z))

            # Backward pass
            # Last layer: CE + sigmoid simplification → dL/dz = (output − y) * sample_weight
            output = activations[-1].reshape(-1)
            deltas: list[Any] = [None] * n_layers
            deltas[n_layers - 1] = ((output - y_b) * w_b).reshape(-1, 1)

            for i in range(n_layers - 2, -1, -1):
                back = deltas[i + 1] @ weights_np[i + 1]
                deltas[i] = back * (pre_acts[i] > 0.0).astype(np.float64)

            for i in range(n_layers):
                dW = deltas[i].T @ activations[i] / b_size
                db = deltas[i].mean(axis=0)
                weights_np[i] -= learning_rate * (dW + l2_penalty * weights_np[i])
                biases_np[i] -= learning_rate * db

    return NeuralNetModel(
        feature_names=feature_names,
        hidden_sizes=list(hidden_sizes),
        weights=[W.tolist() for W in weights_np],
        biases=[b.tolist() for b in biases_np],
        means=means.tolist(),
        scales=stds.tolist(),
    )


def predict_neural_net_probabilities(model: NeuralNetModel, matrix: list[list[float]]) -> list[float]:
    if not matrix:
        return []

    np = _load_numpy()

    X = np.array(matrix, dtype=np.float64)
    means = np.array(model.means, dtype=np.float64)
    scales = np.array(model.scales, dtype=np.float64)
    a = (X - means) / scales

    n_layers = len(model.weights)
    for i in range(n_layers):
        W = np.array(model.weights[i], dtype=np.float64)
        b = np.array(model.biases[i], dtype=np.float64)
        z = a @ W.T + b
        a = 1.0 / (1.0 + np.exp(-np.clip(z, -500.0, 500.0))) if i == n_layers - 1 else np.maximum(0.0, z)

    return [max(0.0, min(1.0, float(p))) for p in a.reshape(-1)]
