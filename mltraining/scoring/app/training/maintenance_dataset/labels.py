from __future__ import annotations

from app.training.maintenance_dataset.entities import ObservationSnapshot, PackageRecord, RepositoryHistory, RepositoryRecord, SnapshotLabelRow
from app.training.maintenance_dataset.events import is_human_actor


def build_snapshot_label(
    snapshot: ObservationSnapshot,
    repository: RepositoryRecord,
    package: PackageRecord,
    history: RepositoryHistory | None,
) -> SnapshotLabelRow:
    history = history or RepositoryHistory(repository_full_name=repository.full_name)
    window_end = snapshot.label_window_end
    missing_label_signals: list[str] = []

    coverage_end = history.coverage_end
    effective_end = min(window_end, coverage_end) if coverage_end is not None else window_end
    incomplete_future_window = coverage_end is None or coverage_end < window_end
    if incomplete_future_window:
        missing_label_signals.append("future_window_incomplete")

    future_commits = [
        item
        for item in history.commits
        if snapshot.observed_at < item.occurred_at <= effective_end and is_human_actor(item.actor)
    ]
    future_active_commit_months = len({item.occurred_at.strftime("%Y-%m") for item in future_commits})
    future_contributors = len({item.actor for item in future_commits if item.actor})
    future_merged_prs = sum(
        1 for pr in history.pull_requests.values() if pr.merged_at is not None and snapshot.observed_at < pr.merged_at <= effective_end
    )
    future_release_times = {
        item.isoformat()
        for item in history.releases
        if snapshot.observed_at < item <= effective_end
    }
    future_release_times.update(
        item.published_at.isoformat()
        for item in package.version_history
        if snapshot.observed_at < item.published_at <= effective_end
    )
    future_releases = len(future_release_times)

    archived_by_horizon = False
    if repository.archived_at is not None and snapshot.observed_at < repository.archived_at <= window_end:
        archived_by_horizon = True
    if repository.deleted_at is not None and snapshot.observed_at < repository.deleted_at <= window_end:
        archived_by_horizon = True
    if repository.current_archived and repository.archived_at is None:
        missing_label_signals.append("archived_timestamp_unavailable")

    maintained: bool | None
    inactive_label: bool | None
    if incomplete_future_window:
        maintained = None
        inactive_label = None
    else:
        conditions_met = 0
        if future_active_commit_months >= 3:
            conditions_met += 1
        if future_contributors >= 2:
            conditions_met += 1
        if future_releases >= 1:
            conditions_met += 1
        if future_merged_prs >= 2:
            conditions_met += 1
        maintained = (not archived_by_horizon) and conditions_met >= 2
        inactive_label = not maintained

    return SnapshotLabelRow(
        snapshot_id=snapshot.snapshot_id,
        repository_id=snapshot.repository_id,
        package_id=snapshot.package_id,
        observed_at=snapshot.observed_at,
        maintained_12m=maintained,
        label_inactive_12m=inactive_label,
        future_active_commit_months_12m=future_active_commit_months,
        future_contributors_12m=future_contributors,
        future_releases_12m=future_releases,
        future_merged_prs_12m=future_merged_prs,
        archived_by_t_plus_12m=archived_by_horizon,
        missing_label_signals=sorted(set(missing_label_signals)),
    )
