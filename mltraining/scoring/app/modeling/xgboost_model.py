from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(slots=True)
class XGBoostFeatureImportance:
    feature: str
    gain: float
    importance: float


@dataclass(slots=True)
class XGBoostModel:
    feature_names: list[str]
    booster_json: str
    tree_count: int
    max_depth: int
    learning_rate: float
    xgboost_version: str
    feature_importances: list[XGBoostFeatureImportance]
    model_name: str = "xgboost-full-history"
    model_version: str = "0.2.0"
    objective: str = "binary:logistic"


def _load_xgboost() -> Any:
    try:
        import xgboost as xgb
    except ModuleNotFoundError as exc:
        raise ValueError(
            "XGBoost support requires the xgboost Python package. "
            "Install mltraining/scoring requirements before training or scoring XGBoost artifacts."
        ) from exc
    return xgb


def _balanced_sample_weights(labels: list[int]) -> list[float]:
    positive_count = sum(1 for label in labels if label == 1)
    negative_count = len(labels) - positive_count
    if positive_count == 0 or negative_count == 0:
        return [1.0 for _ in labels]

    positive_weight = len(labels) / (2.0 * positive_count)
    negative_weight = len(labels) / (2.0 * negative_count)
    return [positive_weight if label == 1 else negative_weight for label in labels]


def fit_xgboost_classifier(
    feature_names: list[str],
    matrix: list[list[float]],
    labels: list[int],
    tree_count: int = 80,
    max_depth: int = 3,
    learning_rate: float = 0.08,
) -> XGBoostModel:
    if not matrix:
        raise ValueError("training matrix cannot be empty")
    if len(matrix) != len(labels):
        raise ValueError("feature matrix and labels must have the same length")
    if len(set(labels)) < 2:
        raise ValueError("XGBoost training requires both active and inactive labels in the training split")

    xgb = _load_xgboost()
    weights = _balanced_sample_weights(labels)
    dtrain = xgb.DMatrix(matrix, label=labels, weight=weights, feature_names=feature_names)
    params = {
        "objective": "binary:logistic",
        "eval_metric": "logloss",
        "max_depth": max_depth,
        "eta": learning_rate,
        "subsample": 0.9,
        "colsample_bytree": 0.9,
        "lambda": 1.0,
        "alpha": 0.0,
        "tree_method": "hist",
        "seed": 42,
        "nthread": 1,
    }
    booster = xgb.train(params, dtrain, num_boost_round=tree_count, verbose_eval=False)
    raw_model = booster.save_raw(raw_format="json")
    if isinstance(raw_model, bytearray):
        raw_model = bytes(raw_model)
    raw_importances = booster.get_score(importance_type="gain")
    gains = [
        XGBoostFeatureImportance(feature=feature, gain=max(0.0, float(raw_importances.get(feature, 0.0))), importance=0.0)
        for feature in feature_names
    ]
    total_gain = sum(item.gain for item in gains)
    feature_importances = sorted(
        [
            XGBoostFeatureImportance(
                feature=item.feature,
                gain=item.gain,
                importance=(item.gain / total_gain) if total_gain > 0 else 0.0,
            )
            for item in gains
        ],
        key=lambda item: item.importance,
        reverse=True,
    )

    return XGBoostModel(
        feature_names=feature_names,
        booster_json=raw_model.decode("utf-8"),
        tree_count=tree_count,
        max_depth=max_depth,
        learning_rate=learning_rate,
        xgboost_version=xgb.__version__,
        feature_importances=feature_importances,
    )


def predict_xgboost_probabilities(model: XGBoostModel, matrix: list[list[float]]) -> list[float]:
    if not matrix:
        return []

    xgb = _load_xgboost()
    booster = xgb.Booster()
    booster.load_model(bytearray(model.booster_json, "utf-8"))
    dmatrix = xgb.DMatrix(matrix, feature_names=model.feature_names)
    predictions = booster.predict(dmatrix)
    return [max(0.0, min(1.0, float(prediction))) for prediction in predictions]
