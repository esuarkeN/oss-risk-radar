from __future__ import annotations

from typing import Any, Callable

import pytest


def make_dependency_payload(
    dependency_id: str = "dep_1",
    package_name: str = "requests",
    package_version: str = "2.31.0",
    ecosystem: str = "pypi",
    direct: bool = True,
    archived: bool = False,
    last_push_age_days: int | None = 14,
    last_release_age_days: int | None = 45,
    release_cadence_days: int | None = 60,
    recent_contributors_90d: int | None = 5,
    contributor_concentration: float | None = 0.35,
    open_issue_growth_90d: float | None = -0.05,
    pr_response_median_days: float | None = 3.0,
    stars: int = 4200,
    forks: int = 600,
    open_issues: int = 87,
    scorecard_score: float | None = 8.4,
) -> dict[str, Any]:
    repository: dict[str, Any] | None
    if (
        last_push_age_days is None
        and last_release_age_days is None
        and release_cadence_days is None
        and recent_contributors_90d is None
        and contributor_concentration is None
        and open_issue_growth_90d is None
        and pr_response_median_days is None
        and stars == 0
        and forks == 0
        and open_issues == 0
        and not archived
    ):
        repository = None
    else:
        repository = {
            "full_name": f"example/{package_name}",
            "url": f"https://github.com/example/{package_name}",
            "default_branch": "main",
            "archived": archived,
            "stars": stars,
            "forks": forks,
            "open_issues": open_issues,
            "last_push_age_days": last_push_age_days,
            "last_release_age_days": last_release_age_days,
            "release_cadence_days": release_cadence_days,
            "recent_contributors_90d": recent_contributors_90d,
            "contributor_concentration": contributor_concentration,
            "open_issue_growth_90d": open_issue_growth_90d,
            "pr_response_median_days": pr_response_median_days,
        }

    scorecard = None
    if scorecard_score is not None:
        scorecard = {
            "score": scorecard_score,
            "checks": [
                {"name": "Branch-Protection", "score": max(scorecard_score - 2, 0), "reason": "fixture"},
                {"name": "Binary-Artifacts", "score": min(scorecard_score + 1, 10), "reason": "fixture"},
            ],
        }

    return {
        "dependency_id": dependency_id,
        "package_name": package_name,
        "package_version": package_version,
        "ecosystem": ecosystem,
        "direct": direct,
        "repository": repository,
        "scorecard": scorecard,
    }


@pytest.fixture(name="make_dependency_payload")
def make_dependency_payload_fixture() -> Callable[..., dict[str, Any]]:
    return make_dependency_payload


@pytest.fixture()
def training_snapshots() -> list[dict[str, Any]]:
    snapshots: list[dict[str, Any]] = []
    monthly_rows = [
        ("2023-01-01T00:00:00Z", 25, 120, 0),
        ("2023-02-01T00:00:00Z", 700, 800, 1),
        ("2023-03-01T00:00:00Z", 20, 90, 0),
        ("2023-04-01T00:00:00Z", 650, 780, 1),
        ("2023-05-01T00:00:00Z", 18, 75, 0),
        ("2023-06-01T00:00:00Z", 600, 760, 1),
        ("2023-07-01T00:00:00Z", 16, 70, 0),
        ("2023-08-01T00:00:00Z", 550, 730, 1),
    ]
    for index, (observed_at, last_push_age_days, last_release_age_days, label) in enumerate(monthly_rows, start=1):
        snapshots.append(
            {
                "analysis_id": "analysis_train_001",
                "observed_at": observed_at,
                "label_inactive_12m": bool(label),
                "dependency": make_dependency_payload(
                    dependency_id=f"dep_{index}",
                    package_name=f"package-{index}",
                    last_push_age_days=last_push_age_days,
                    last_release_age_days=last_release_age_days,
                    release_cadence_days=last_release_age_days,
                    recent_contributors_90d=1 if label else 6,
                    contributor_concentration=0.9 if label else 0.3,
                    open_issue_growth_90d=0.45 if label else -0.1,
                    pr_response_median_days=40 if label else 2,
                    archived=bool(label and index % 2 == 0),
                    scorecard_score=4.5 if label else 8.8,
                ),
            }
        )
    return snapshots
