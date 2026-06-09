import importlib.util

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.training.pipeline import TrainingRunConfig, run_training_pipeline

client = TestClient(app)


def test_feature_extraction_endpoint_returns_rows(make_dependency_payload) -> None:
    response = client.post(
        "/features/extract",
        json={
            "analysis_id": "analysis_features_001",
            "dependencies": [make_dependency_payload(dependency_id="dep_features", ecosystem="go")],
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["feature_version"] == "feature-set-v3-full-history"
    assert body["rows"][0]["feature_values"]["ecosystem_go"] == 1.0


def test_model_training_endpoint_is_not_exposed() -> None:
    response = client.post("/models/train", json={})

    assert response.status_code == 404


def test_model_scoring_uses_historical_features(make_dependency_payload) -> None:
    artifact = {
        "model_name": "logistic-regression-full-history",
        "model_version": "historical-fixture",
        "feature_version": "feature-set-v3-full-history",
        "trained_at": "2026-01-01T00:00:00Z",
        "threshold": 0.5,
        "algorithm": "logistic_regression",
        "feature_names": ["contributors_90d"],
        "coefficients": [-1.0],
        "intercept": 0.0,
        "standardization": {"means": [0.0], "scales": [1.0]},
        "calibration_bins": [],
    }

    stale = make_dependency_payload(dependency_id="dep_stale", historical_features={"contributors_90d": 0})
    active = make_dependency_payload(dependency_id="dep_active", historical_features={"contributors_90d": 5})
    response = client.post(
        "/score/model",
        json={
            "analysis_id": "analysis_historical_features_001",
            "dependencies": [stale, active],
            "model_artifact": artifact,
        },
    )

    assert response.status_code == 200
    risks = {item["dependency_id"]: item["risk_profile"]["inactivity_risk_score"] for item in response.json()["results"]}
    assert risks["dep_stale"] > risks["dep_active"]


def test_model_scoring_endpoint_uses_trained_artifact(
    make_dependency_payload,
    training_snapshots: list[dict[str, object]],
) -> None:
    train_result = run_training_pipeline(
        TrainingRunConfig(
            algorithm="logistic-regression-full-history",
            snapshots=training_snapshots,
            train_ratio=0.5,
            validation_ratio=0.25,
            calibration_bins=5,
        )
    )

    assert train_result.artifact is not None
    artifact = train_result.artifact.model_dump(mode="json")

    response = client.post(
        "/score/model",
        json={
            "analysis_id": "analysis_model_score_001",
            "dependencies": [
                make_dependency_payload(
                    dependency_id="dep_model",
                    package_name="healthy-lib",
                    ecosystem="pypi",
                    last_push_age_days=12,
                    last_release_age_days=40,
                    recent_contributors_90d=6,
                    contributor_concentration=0.28,
                    open_issue_growth_90d=-0.08,
                    pr_response_median_days=2,
                    scorecard_score=8.9,
                )
            ],
            "model_artifact": artifact,
        },
    )

    assert response.status_code == 200
    body = response.json()
    result = body["results"][0]["risk_profile"]
    assert 0 <= result["maintenance_outlook_12m_score"] <= 100
    assert result["action_level"] in {"monitor", "review", "replace_candidate"}
    assert any(factor["label"] == "12-month outlook model" for factor in result["explanation_factors"])


@pytest.mark.skipif(importlib.util.find_spec("xgboost") is None, reason="xgboost is not installed")
def test_xgboost_training_and_scoring_endpoint(
    make_dependency_payload,
    training_snapshots: list[dict[str, object]],
) -> None:
    train_result = run_training_pipeline(
        TrainingRunConfig(
            algorithm="xgboost-full-history",
            snapshots=training_snapshots,
            train_ratio=0.5,
            validation_ratio=0.25,
            calibration_bins=5,
        )
    )

    assert train_result.artifact is not None
    artifact = train_result.artifact.model_dump(mode="json")
    assert artifact["algorithm"] == "xgboost"
    assert artifact["booster_json"]

    response = client.post(
        "/score/model",
        json={
            "analysis_id": "analysis_xgb_score_001",
            "dependencies": [make_dependency_payload(dependency_id="dep_xgb")],
            "model_artifact": artifact,
        },
    )

    assert response.status_code == 200
    result = response.json()["results"][0]["risk_profile"]
    assert 0 <= result["inactivity_risk_score"] <= 100
    assert any(factor["label"] == "12-month outlook model" for factor in result["explanation_factors"])
