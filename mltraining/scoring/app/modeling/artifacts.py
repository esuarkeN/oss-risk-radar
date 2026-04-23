from __future__ import annotations

from app.modeling.baseline import LogisticRegressionModel, StandardizationProfile
from app.modeling.features import FEATURE_VERSION
from app.schemas.score import CalibrationBin, LogisticRegressionModelArtifact, StandardizationProfileArtifact


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
