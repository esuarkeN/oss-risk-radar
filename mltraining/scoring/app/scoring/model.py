from __future__ import annotations

from app.modeling import deserialize_logistic_regression_model, extract_feature_values, predict_probabilities
from app.modeling.features import FEATURE_VERSION
from app.schemas.score import CalibrationBin, DependencySignalPayload, LogisticRegressionModelArtifact, RiskProfileResponse, ScoreResult
from app.scoring.explanations import factor
from app.scoring.heuristic import clamp, derive_maintenance_outlook_12m_score, determine_action_level, determine_bucket, score_dependency
from app.training.calibration import CalibrationBinSummary, HistogramCalibrator


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
    artifact: LogisticRegressionModelArtifact,
) -> ScoreResult:
    heuristic_result = score_dependency(payload)
    heuristic_profile = heuristic_result.risk_profile
    feature_values, missing_signals = extract_feature_values(payload)
    model = deserialize_logistic_regression_model(artifact)
    matrix = [[feature_values[name] for name in artifact.feature_names]]
    raw_probability = predict_probabilities(model, matrix)[0]

    calibrator = _build_calibrator(artifact.calibration_bins)
    calibrated_probability = raw_probability
    if calibrator is not None:
        calibrated_probability = calibrator.predict([raw_probability])[0]

    inactivity_probability = max(0.0, min(1.0, calibrated_probability))
    inactivity_risk_score = round(clamp(inactivity_probability * 100), 2)
    maintenance_outlook_12m_score = derive_maintenance_outlook_12m_score(inactivity_risk_score)
    prediction_margin = abs(inactivity_probability - 0.5) * 2
    confidence_score = round(clamp(heuristic_profile.confidence_score * (0.5 + (0.5 * prediction_margin)), 0, 1), 2)

    caveats = list(heuristic_profile.caveats)
    if not artifact.calibration_bins:
        caveats.append("Model calibration bins were unavailable, so the 12-month outlook uses raw model probabilities.")
    if artifact.feature_version != FEATURE_VERSION:
        caveats.append("The stored model was trained on an older feature set, so runtime inference may drift until retrained.")

    direction = "increase" if inactivity_risk_score >= 50 else "decrease"
    model_factor = factor(
        "12-month outlook model",
        direction,
        round(10 + (prediction_margin * 20), 2),
        (
            f"Calibrated {artifact.model_name} predicts a {inactivity_risk_score:.1f}% risk "
            "that public maintenance signals trend inactive within 12 months."
        ),
    )
    explanation_factors = sorted([model_factor, *heuristic_profile.explanation_factors], key=lambda item: item.weight, reverse=True)[:6]

    return ScoreResult(
        dependency_id=payload.dependency_id,
        package_name=payload.package_name,
        package_version=payload.package_version,
        ecosystem=payload.ecosystem,
        risk_profile=RiskProfileResponse(
            inactivity_risk_score=inactivity_risk_score,
            maintenance_outlook_12m_score=maintenance_outlook_12m_score,
            security_posture_score=heuristic_profile.security_posture_score,
            confidence_score=confidence_score,
            risk_bucket=determine_bucket(inactivity_risk_score),
            action_level=determine_action_level(inactivity_risk_score),
            caveats=sorted(set(caveats)),
            missing_signals=sorted(set(heuristic_profile.missing_signals + missing_signals)),
            explanation_factors=explanation_factors,
            evidence=heuristic_profile.evidence,
        ),
    )
