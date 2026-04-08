from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)


def test_heuristic_scoring_returns_explanations() -> None:
    response = client.post(
        "/score/heuristic",
        json={
            "analysis_id": "analysis_demo_001",
            "dependencies": [
                {
                    "dependency_id": "dep_1",
                    "package_name": "request",
                    "package_version": "2.88.2",
                    "ecosystem": "npm",
                    "direct": True,
                    "repository": {
                        "full_name": "request/request",
                        "url": "https://github.com/request/request",
                        "default_branch": "master",
                        "archived": True,
                        "stars": 26000,
                        "forks": 1800,
                        "open_issues": 250,
                        "last_push_age_days": 980,
                        "last_release_age_days": 1400,
                        "release_cadence_days": 300,
                        "recent_contributors_90d": 0,
                        "contributor_concentration": 0.95,
                        "open_issue_growth_90d": 0.41,
                        "pr_response_median_days": 63,
                    },
                    "scorecard": {
                        "score": 4.6,
                        "checks": [
                            {
                                "name": "Branch-Protection",
                                "score": 2,
                                "reason": "No branch protection evidence found.",
                            },
                            {
                                "name": "Binary-Artifacts",
                                "score": 8,
                                "reason": "No binary artifacts detected.",
                            },
                        ],
                    },
                }
            ],
        },
    )

    assert response.status_code == 200
    body = response.json()
    result = body["results"][0]
    assert result["risk_profile"]["risk_bucket"] in {"high", "critical"}
    assert result["risk_profile"]["action_level"] == "replace_candidate"
    assert len(result["risk_profile"]["explanation_factors"]) >= 3


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
    assert body["feature_version"] == "feature-set-v1"
    assert body["rows"][0]["feature_values"]["ecosystem_go"] == 1.0


def test_model_training_endpoint_returns_metrics(training_snapshots: list[dict[str, object]]) -> None:
    response = client.post(
        "/models/train",
        json={
            "model_name": "logistic-regression-baseline",
            "snapshots": training_snapshots,
            "train_ratio": 0.5,
            "validation_ratio": 0.25,
            "calibration_bins": 5,
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "completed"
    assert body["metrics"]["sample_count"] == 2
    assert len(body["calibration_bins"]) == 5
