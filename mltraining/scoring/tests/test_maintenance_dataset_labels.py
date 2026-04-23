from datetime import UTC, datetime

from app.training.maintenance_dataset.entities import CommitEvent, ObservationSnapshot, PackageRecord, PackageVersionRecord, PullRequestState, RepositoryHistory, RepositoryRecord
from app.training.maintenance_dataset.labels import build_snapshot_label


def make_snapshot() -> tuple[ObservationSnapshot, RepositoryRecord, PackageRecord]:
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
        selected_version="1.0.0",
        repository_url=repository.url,
        repository_full_name=repository.full_name,
        popularity_tier="medium",
        downloads_30d=None,
        direct_dependents_count=None,
        version_history=[PackageVersionRecord(version="1.0.0", published_at=datetime(2023, 1, 1, tzinfo=UTC), dependency_count=3)],
    )
    snapshot = ObservationSnapshot(
        snapshot_id="acme__project:2024-01-01",
        repository_id=repository.repository_id,
        package_id=package.package_id,
        ecosystem=package.ecosystem,
        observed_at=datetime(2024, 1, 1, tzinfo=UTC),
        feature_window_start=datetime(2023, 1, 1, tzinfo=UTC),
        previous_window_start=datetime(2022, 1, 1, tzinfo=UTC),
        label_window_end=datetime(2025, 1, 1, tzinfo=UTC),
    )
    return snapshot, repository, package


def test_build_snapshot_label_marks_maintained_when_future_window_is_active() -> None:
    snapshot, repository, package = make_snapshot()
    history = RepositoryHistory(
        repository_full_name=repository.full_name,
        commits=[
            CommitEvent(occurred_at=datetime(2024, 1, 10, tzinfo=UTC), actor="alice", count=2),
            CommitEvent(occurred_at=datetime(2024, 3, 10, tzinfo=UTC), actor="bob", count=1),
            CommitEvent(occurred_at=datetime(2024, 6, 10, tzinfo=UTC), actor="alice", count=1),
        ],
        pull_requests={
            "1": PullRequestState(pr_id="1", created_at=datetime(2024, 2, 1, tzinfo=UTC), author="alice", merged_at=datetime(2024, 2, 5, tzinfo=UTC), closed_at=datetime(2024, 2, 5, tzinfo=UTC)),
            "2": PullRequestState(pr_id="2", created_at=datetime(2024, 4, 1, tzinfo=UTC), author="bob", merged_at=datetime(2024, 4, 2, tzinfo=UTC), closed_at=datetime(2024, 4, 2, tzinfo=UTC)),
        },
        releases=[datetime(2024, 5, 1, tzinfo=UTC)],
        coverage_start=datetime(2023, 1, 1, tzinfo=UTC),
        coverage_end=datetime(2025, 1, 2, tzinfo=UTC),
    )

    label = build_snapshot_label(snapshot, repository, package, history)

    assert label.maintained_12m is True
    assert label.label_inactive_12m is False
    assert label.future_active_commit_months_12m == 3
    assert label.future_contributors_12m == 2
    assert label.future_releases_12m == 1
    assert label.future_merged_prs_12m == 2


def test_build_snapshot_label_leaves_incomplete_future_windows_unlabeled() -> None:
    snapshot, repository, package = make_snapshot()
    history = RepositoryHistory(
        repository_full_name=repository.full_name,
        commits=[CommitEvent(occurred_at=datetime(2024, 1, 10, tzinfo=UTC), actor="alice", count=2)],
        coverage_start=datetime(2023, 1, 1, tzinfo=UTC),
        coverage_end=datetime(2024, 6, 1, tzinfo=UTC),
    )

    label = build_snapshot_label(snapshot, repository, package, history)

    assert label.maintained_12m is None
    assert label.label_inactive_12m is None
    assert "future_window_incomplete" in label.missing_label_signals
