from datetime import UTC, datetime

from app.training.maintenance_dataset.entities import CommitEvent, IssueState, ObservationSnapshot, PackageRecord, PackageVersionRecord, PullRequestState, RepositoryHistory, RepositoryRecord
from app.training.maintenance_dataset.features import build_snapshot_features


def test_build_snapshot_features_calculates_chaoss_style_proxies() -> None:
    observed_at = datetime(2024, 1, 1, tzinfo=UTC)
    repository = RepositoryRecord(
        repository_id="acme__project",
        full_name="acme/project",
        url="https://github.com/acme/project",
        default_branch="main",
        created_at=datetime(2022, 1, 1, tzinfo=UTC),
    )
    package = PackageRecord(
        package_id="npm:project",
        ecosystem="npm",
        package_name="project",
        selected_version="2.0.0",
        repository_url=repository.url,
        repository_full_name=repository.full_name,
        popularity_tier="medium",
        downloads_30d=None,
        direct_dependents_count=None,
        version_history=[
            PackageVersionRecord(version="1.0.0", published_at=datetime(2023, 1, 1, tzinfo=UTC), dependency_count=3),
            PackageVersionRecord(version="2.0.0", published_at=datetime(2023, 8, 1, tzinfo=UTC), dependency_count=4),
        ],
    )
    history = RepositoryHistory(
        repository_full_name=repository.full_name,
        commits=[
            CommitEvent(occurred_at=datetime(2023, 12, 20, tzinfo=UTC), actor="alice", count=3),
            CommitEvent(occurred_at=datetime(2023, 11, 15, tzinfo=UTC), actor="bob", count=2),
            CommitEvent(occurred_at=datetime(2023, 8, 15, tzinfo=UTC), actor="carol", count=1),
            CommitEvent(occurred_at=datetime(2023, 2, 1, tzinfo=UTC), actor="alice", count=5),
            CommitEvent(occurred_at=datetime(2022, 6, 1, tzinfo=UTC), actor="dave", count=4),
        ],
        issues={
            "1": IssueState(issue_id="1", created_at=datetime(2023, 12, 10, tzinfo=UTC)),
            "2": IssueState(issue_id="2", created_at=datetime(2023, 11, 1, tzinfo=UTC), closed_at=datetime(2023, 12, 1, tzinfo=UTC)),
            "3": IssueState(issue_id="3", created_at=datetime(2023, 6, 1, tzinfo=UTC)),
        },
        pull_requests={
            "1": PullRequestState(pr_id="1", created_at=datetime(2023, 12, 5, tzinfo=UTC), author="alice", merged_at=datetime(2023, 12, 7, tzinfo=UTC), closed_at=datetime(2023, 12, 7, tzinfo=UTC)),
            "2": PullRequestState(pr_id="2", created_at=datetime(2023, 10, 1, tzinfo=UTC), author="bob", closed_at=datetime(2023, 10, 15, tzinfo=UTC)),
            "3": PullRequestState(pr_id="3", created_at=datetime(2023, 8, 1, tzinfo=UTC), author="carol"),
        },
        releases=[datetime(2023, 9, 1, tzinfo=UTC)],
        stars=[datetime(2023, 1, day, tzinfo=UTC) for day in range(1, 6)],
        forks=[datetime(2023, 2, day, tzinfo=UTC) for day in range(1, 3)],
        coverage_start=datetime(2022, 6, 1, tzinfo=UTC),
        coverage_end=datetime(2025, 1, 2, tzinfo=UTC),
    )
    snapshot = ObservationSnapshot(
        snapshot_id="acme__project:2024-01-01",
        repository_id=repository.repository_id,
        package_id=package.package_id,
        ecosystem=package.ecosystem,
        observed_at=observed_at,
        feature_window_start=datetime(2023, 1, 1, tzinfo=UTC),
        previous_window_start=datetime(2022, 1, 1, tzinfo=UTC),
        label_window_end=datetime(2025, 1, 1, tzinfo=UTC),
    )

    row = build_snapshot_features(snapshot, repository, package, history)

    assert row.package_version_at_obs == "2.0.0"
    assert row.feature_values["commits_30d"] == 3.0
    assert row.feature_values["commits_90d"] == 5.0
    assert row.feature_values["commits_365d"] == 11.0
    assert row.feature_values["contributors_365d"] == 3.0
    assert row.feature_values["new_contributors_365d"] == 3.0
    assert row.feature_values["opened_issues_90d"] == 2.0
    assert row.feature_values["closed_issues_90d"] == 1.0
    assert row.feature_values["issue_backlog_growth_90d"] == 1.0
    assert row.feature_values["stale_open_issues_count_at_obs"] == 1.0
    assert row.feature_values["opened_prs_90d"] == 1.0
    assert row.feature_values["merged_prs_90d"] == 1.0
    assert row.feature_values["releases_365d"] == 1.0
    assert row.feature_values["versions_published_365d"] == 1.0
    assert row.feature_values["dependency_count_at_obs"] == 4.0
    assert row.open_issues_total_at_obs == 2
    assert row.release_cadence_days is not None
    assert row.pr_response_median_days is not None
