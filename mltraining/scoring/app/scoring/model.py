from __future__ import annotations

from app.modeling import (
    deserialize_logistic_regression_model,
    deserialize_neural_net_model,
    deserialize_xgboost_model,
    extract_feature_values,
    predict_neural_net_probabilities,
    predict_probabilities,
    predict_xgboost_probabilities,
)
from app.modeling.features import COLD_START_FEATURE_VERSION, FEATURE_VERSION, FULL_HISTORY_FEATURE_VERSION
from app.schemas.score import (
    CalibrationBin,
    DependencySignalPayload,
    LogisticRegressionModelArtifact,
    ModelArtifact,
    NeuralNetModelArtifact,
    RiskProfileResponse,
    ScoreResult,
    XGBoostModelArtifact,
)
from app.scoring.explanations import build_evidence_items, factor
from app.training.calibration import CalibrationBinSummary, HistogramCalibrator


def _clamp(value: float, lower: float = 0, upper: float = 100) -> float:
    return max(lower, min(upper, value))


def _maintenance_outlook_12m_score(inactivity_risk_score: float) -> float:
    return round(_clamp(100 - inactivity_risk_score), 2)


def _risk_bucket(score: float) -> str:
    if score >= 80:
        return "critical"
    if score >= 60:
        return "high"
    if score >= 35:
        return "medium"
    return "low"


def _action_level(score: float) -> str:
    if score >= 80:
        return "replace_candidate"
    if score >= 50:
        return "review"
    return "monitor"


def _scorecard_posture(payload: DependencySignalPayload) -> tuple[float, list[str]]:
    if payload.scorecard is None or payload.scorecard.score is None:
        return 0, ["OpenSSF Scorecard data was unavailable, so security posture is not model-derived."]

    posture = payload.scorecard.score * 10
    for check in payload.scorecard.checks:
        if check.score >= 8:
            posture += 2
        elif check.score <= 4:
            posture -= 3
    return round(_clamp(posture), 2), []


def _build_calibrator(calibration_bins: list[CalibrationBin]) -> HistogramCalibrator | None:
    if not calibration_bins:
        return None
    return HistogramCalibrator(
        bins=[
            CalibrationBinSummary(
                lower_bound=bin_summary.lower_bound,
                upper_bound=bin_summary.upper_bound,
                count=bin_summary.count,
                average_prediction=bin_summary.average_prediction,
                empirical_rate=bin_summary.empirical_rate,
            )
            for bin_summary in calibration_bins
        ]
    )


def score_dependency_with_model(
    payload: DependencySignalPayload,
    artifact: ModelArtifact,
) -> ScoreResult:
    feature_values, missing_signals = extract_feature_values(payload, feature_names=artifact.feature_names)
    matrix = [[feature_values[name] for name in artifact.feature_names]]

    if isinstance(artifact, XGBoostModelArtifact):
        model = deserialize_xgboost_model(artifact)
        raw_probability = predict_xgboost_probabilities(model, matrix)[0]
    elif isinstance(artifact, NeuralNetModelArtifact):
        model = deserialize_neural_net_model(artifact)
        raw_probability = predict_neural_net_probabilities(model, matrix)[0]
    elif isinstance(artifact, LogisticRegressionModelArtifact):
        model = deserialize_logistic_regression_model(artifact)
        raw_probability = predict_probabilities(model, matrix)[0]
    else:
        raise ValueError(f"unsupported model artifact: {artifact.model_name}")

    calibrator = _build_calibrator(artifact.calibration_bins)
    calibrated_probability = raw_probability
    if calibrator is not None:
        calibrated_probability = calibrator.predict([raw_probability])[0]

    inactivity_probability = max(0.0, min(1.0, calibrated_probability))
    inactivity_risk_score = round(_clamp(inactivity_probability * 100), 2)
    prediction_margin = abs(inactivity_probability - 0.5) * 2
    signal_completeness = feature_values.get(
        "signal_completeness",
        max(0.0, min(1.0, 1.0 - (len(missing_signals) / max(1, len(artifact.feature_names))))),
    )
    confidence_score = round(max(0.0, min(1.0, signal_completeness * (0.5 + (0.5 * prediction_margin)))), 2)
    security_posture_score, caveats = _scorecard_posture(payload)

    if not artifact.calibration_bins:
        caveats.append("Model calibration bins were unavailable, so the 12-month outlook uses raw model probabilities.")
    if artifact.feature_version not in {FEATURE_VERSION, FULL_HISTORY_FEATURE_VERSION, COLD_START_FEATURE_VERSION}:
        caveats.append("The stored model was trained on an older feature set, so runtime inference may drift until retrained.")
    if missing_signals:
        caveats.append("Some model input signals were missing and imputed as neutral zero-valued features.")

    direction = "increase" if inactivity_risk_score >= 50 else "decrease"
    explanation_factors = [
        factor(
            "12-month outlook model",
            direction,
            round(10 + (prediction_margin * 20), 2),
            (
                f"Calibrated {artifact.model_name} predicts a {inactivity_risk_score:.1f}% risk "
                "that public maintenance signals trend inactive within 12 months."
            ),
        ),
        factor(
            "Model input completeness",
            "neutral",
            round(signal_completeness * 20, 2),
            f"{signal_completeness:.0%} of expected model input signals were available before imputation.",
        ),
    ]

    return ScoreResult(
        dependency_id=payload.dependency_id,
        package_name=payload.package_name,
        package_version=payload.package_version,
        ecosystem=payload.ecosystem,
        risk_profile=RiskProfileResponse(
            inactivity_risk_score=inactivity_risk_score,
            maintenance_outlook_12m_score=_maintenance_outlook_12m_score(inactivity_risk_score),
            security_posture_score=security_posture_score,
            confidence_score=confidence_score,
            risk_bucket=_risk_bucket(inactivity_risk_score),
            action_level=_action_level(inactivity_risk_score),
            caveats=sorted(set(caveats)),
            missing_signals=missing_signals,
            explanation_factors=explanation_factors,
            evidence=build_evidence_items(payload),
        ),
    )
