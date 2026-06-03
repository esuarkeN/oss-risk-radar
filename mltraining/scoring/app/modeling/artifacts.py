from __future__ import annotations

from app.modeling.baseline import LogisticRegressionModel, StandardizationProfile
from app.modeling.features import FEATURE_VERSION
from app.modeling.xgboost_model import XGBoostFeatureImportance, XGBoostModel
from app.schemas.score import CalibrationBin, FeatureImportance, LogisticRegressionModelArtifact, StandardizationProfileArtifact, XGBoostModelArtifact


def serialize_logistic_regression_model(
    model: LogisticRegressionModel,
    trained_at: str,
    threshold: float,
    calibration_bins: list[CalibrationBin],
) -> LogisticRegressionModelArtifact:
    return LogisticRegressionModelArtifact(
        model_name=model.model_name,
        model_version=model.model_version,
        feature_version=FEATURE_VERSION,
        trained_at=trained_at,
        threshold=threshold,
        feature_names=list(model.feature_names),
        coefficients=list(model.coefficients),
        intercept=model.intercept,
        standardization=StandardizationProfileArtifact(
            means=list(model.standardization.means),
            scales=list(model.standardization.scales),
        ),
        calibration_bins=list(calibration_bins),
    )


def deserialize_logistic_regression_model(artifact: LogisticRegressionModelArtifact) -> LogisticRegressionModel:
    return LogisticRegressionModel(
        feature_names=list(artifact.feature_names),
        coefficients=list(artifact.coefficients),
        intercept=artifact.intercept,
        standardization=StandardizationProfile(
            means=list(artifact.standardization.means),
            scales=list(artifact.standardization.scales),
        ),
        model_name=artifact.model_name,
        model_version=artifact.model_version,
    )


def serialize_xgboost_model(
    model: XGBoostModel,
    trained_at: str,
    threshold: float,
    calibration_bins: list[CalibrationBin],
) -> XGBoostModelArtifact:
    return XGBoostModelArtifact(
        model_name=model.model_name,
        model_version=model.model_version,
        feature_version=FEATURE_VERSION,
        trained_at=trained_at,
        threshold=threshold,
        feature_names=list(model.feature_names),
        booster_json=model.booster_json,
        tree_count=model.tree_count,
        max_depth=model.max_depth,
        learning_rate=model.learning_rate,
        objective=model.objective,
        xgboost_version=model.xgboost_version,
        feature_importances=[
            FeatureImportance(feature=importance.feature, gain=importance.gain, importance=importance.importance)
            for importance in model.feature_importances
        ],
        calibration_bins=list(calibration_bins),
    )


def deserialize_xgboost_model(artifact: XGBoostModelArtifact) -> XGBoostModel:
    return XGBoostModel(
        feature_names=list(artifact.feature_names),
        booster_json=artifact.booster_json,
        tree_count=artifact.tree_count,
        max_depth=artifact.max_depth,
        learning_rate=artifact.learning_rate,
        objective=artifact.objective,
        xgboost_version=artifact.xgboost_version,
        feature_importances=[
            XGBoostFeatureImportance(feature=importance.feature, gain=importance.gain, importance=importance.importance)
            for importance in artifact.feature_importances
        ],
        model_name=artifact.model_name,
        model_version=artifact.model_version,
    )
