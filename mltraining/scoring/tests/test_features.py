from app.modeling.features import (
    COLD_START_FEATURE_NAMES,
    COLD_START_FEATURE_VERSION,
    FEATURE_NAMES,
    FEATURE_VERSION,
    FULL_HISTORY_FEATURE_VERSION,
    build_feature_row,
    extract_feature_values,
)
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
    assert "signal_completeness" not in FEATURE_NAMES
    assert "repo_archived" not in FEATURE_NAMES
    assert "repo_archived_at_obs" not in FEATURE_NAMES
    assert "last_push_age_days" in missing
    assert "scorecard_score" not in missing
    assert "scorecard_score" not in FEATURE_NAMES
    assert "direct_dependents_count_at_obs" not in FEATURE_NAMES
    assert "ecosystem_download_tier_at_obs" not in FEATURE_NAMES


def test_build_feature_row_keeps_model_input_metadata(make_dependency_payload) -> None:
    payload = DependencySignalPayload.model_validate(make_dependency_payload(dependency_id="dep_2", ecosystem="pypi"))

    row = build_feature_row(payload, observed_at="2024-01-01T00:00:00Z")

    assert row.observed_at == "2024-01-01T00:00:00Z"
    assert row.missing_signals == []
    assert row.feature_values["ecosystem_pypi"] == 1.0
    assert row.feature_values["pr_response_median_days_365d"] == 3.0
    assert FEATURE_VERSION == FULL_HISTORY_FEATURE_VERSION
    assert COLD_START_FEATURE_VERSION == "feature-set-v3-cold-start"


def test_cold_start_feature_values_do_not_require_historical_signals(make_dependency_payload) -> None:
    payload = DependencySignalPayload.model_validate(make_dependency_payload(dependency_id="dep_cold", historical_features={}))

    feature_values, missing = extract_feature_values(payload, feature_names=COLD_START_FEATURE_NAMES)

    assert set(feature_values) == set(COLD_START_FEATURE_NAMES)
    assert "contributors_90d" not in feature_values
    assert "contributors_90d" not in missing
