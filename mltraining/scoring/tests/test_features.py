from app.modeling.features import FEATURE_NAMES, FEATURE_VERSION, build_feature_row, extract_feature_values
from app.schemas.score import DependencySignalPayload


def test_extract_feature_values_tracks_missing_signals() -> None:
    payload = DependencySignalPayload.model_validate(
        {
            "dependency_id": "dep_missing",
            "package_name": "mystery-lib",
            "package_version": "0.1.0",
            "ecosystem": "npm",
            "direct": False,
            "repository": None,
            "scorecard": None,
        }
    )

    feature_values, missing = extract_feature_values(payload)

    assert set(FEATURE_NAMES) == set(feature_values)
    assert feature_values["has_repository_mapping"] == 0.0
    assert feature_values["ecosystem_npm"] == 1.0
    assert feature_values["signal_completeness"] == 0.0
    assert "last_push_age_days" in missing
    assert "scorecard_score" in missing


def test_build_feature_row_keeps_heuristic_reference_score(make_dependency_payload) -> None:
    payload = DependencySignalPayload.model_validate(make_dependency_payload(dependency_id="dep_2", ecosystem="pypi"))

    row = build_feature_row(payload, observed_at="2024-01-01T00:00:00Z")

    assert row.observed_at == "2024-01-01T00:00:00Z"
    assert row.heuristic_reference_score >= 0
    assert row.feature_values["ecosystem_pypi"] == 1.0
    assert FEATURE_VERSION == "feature-set-v1"
