from __future__ import annotations

from datetime import timedelta
from statistics import median

from app.training.maintenance_dataset.entities import ObservationSnapshot, PackageRecord, RepositoryHistory, RepositoryRecord, SnapshotFeatureRow
from app.training.maintenance_dataset.events import is_human_actor


HISTORICAL_FEATURE_NAMES = [
    "commits_30d",
    "commits_90d",
    "commits_365d",
    "active_commit_months_365d",
    "days_since_last_commit",
    "contributors_90d",
    "contributors_365d",
    "new_contributors_365d",
    "top1_contributor_commit_share_365d",
    "top2_contributor_commit_share_365d",
    "contributor_concentration_index",
    "maintainer_concentration_flag",
    "opened_issues_90d",
    "closed_issues_90d",
    "issue_closure_ratio_90d",
    "issue_backlog_growth_90d",
    "stale_open_issues_count_at_obs",
    "opened_prs_90d",
    "merged_prs_90d",
    "closed_unmerged_prs_90d",
    "pr_merge_ratio_90d",
    "stale_open_prs_count_at_obs",
    "releases_365d",
    "days_since_last_release",
    "versions_published_365d",
    "package_age_days",
    "repo_age_days",
    "stars_total_at_obs",
    "forks_total_at_obs",
    "direct_dependents_count_at_obs",
    "dependency_count_at_obs",
    "ecosystem_download_tier_at_obs",
    "popularity_tier_at_obs",
    "repo_archived_at_obs",
    "has_recent_release_flag",
    "has_recent_pr_merge_flag",
    "activity_drop_365d_vs_prev_365d",
    "contributors_drop_365d_vs_prev_365d",
    "release_gap_risk",
    "concentration_risk_score",
]


def build_snapshot_features(
    snapshot: ObservationSnapshot,
    repository: RepositoryRecord,
    package: PackageRecord,
    history: RepositoryHistory | None,
) -> SnapshotFeatureRow:
    observed_at = snapshot.observed_at
    history = history or RepositoryHistory(repository_full_name=repository.full_name)
    missing_features: list[str] = []

    window_30 = observed_at - timedelta(days=30)
    window_90 = observed_at - timedelta(days=90)
    window_365 = snapshot.feature_window_start
    previous_window_365 = snapshot.previous_window_start

    human_commits = [item for item in history.commits if item.occurred_at <= observed_at and is_human_actor(item.actor)]
    commits_30d = sum(item.count for item in human_commits if window_30 < item.occurred_at <= observed_at)
    commits_90d = sum(item.count for item in human_commits if window_90 < item.occurred_at <= observed_at)
    commits_365d = sum(item.count for item in human_commits if window_365 < item.occurred_at <= observed_at)
    commits_prev_365d = sum(item.count for item in human_commits if previous_window_365 < item.occurred_at <= window_365)
    active_commit_months_365d = len({item.occurred_at.strftime("%Y-%m") for item in human_commits if window_365 < item.occurred_at <= observed_at})

    last_commit = max((item.occurred_at for item in human_commits if item.occurred_at <= observed_at), default=None)
    days_since_last_commit = _age_days(observed_at, last_commit)
    if days_since_last_commit is None:
        missing_features.append("days_since_last_commit")

    contributors_90d = _contributors_in_window(human_commits, window_90, observed_at)
    contributors_365d = _contributors_in_window(human_commits, window_365, observed_at)
    contributors_prev_365d = _contributors_in_window(human_commits, previous_window_365, window_365)
    current_contributors = _contributor_set(human_commits, window_365, observed_at)
    historical_contributors = {item.actor for item in human_commits if item.actor and item.occurred_at <= window_365}
    new_contributors_365d = len(current_contributors - historical_contributors)

    commit_counts_365d = _commit_counts_by_actor(human_commits, window_365, observed_at)
    total_commits_365d = sum(commit_counts_365d.values())
    ordered_shares = sorted((count / total_commits_365d for count in commit_counts_365d.values()), reverse=True) if total_commits_365d else []
    top1_share = ordered_shares[0] if ordered_shares else 0.0
    top2_share = sum(ordered_shares[:2]) if ordered_shares else 0.0
    concentration_index = sum(share * share for share in ordered_shares)
    maintainer_concentration_flag = 1.0 if top1_share >= 0.7 or top2_share >= 0.85 else 0.0

    opened_issues_90d = sum(1 for issue in history.issues.values() if window_90 < issue.created_at <= observed_at)
    closed_issues_90d = sum(1 for issue in history.issues.values() if issue.closed_at is not None and window_90 < issue.closed_at <= observed_at)
    issue_closure_ratio_90d = closed_issues_90d / max(1, opened_issues_90d)
    backlog_prev = _open_issue_count_at(history, window_90)
    backlog_obs = _open_issue_count_at(history, observed_at)
    issue_backlog_growth_90d = (backlog_obs - backlog_prev) / max(1, backlog_prev)
    stale_open_issues = sum(1 for issue in history.issues.values() if issue.created_at <= window_90 and (issue.closed_at is None or issue.closed_at > observed_at))

    opened_prs_90d = sum(1 for pr in history.pull_requests.values() if window_90 < pr.created_at <= observed_at)
    merged_prs_90d = sum(1 for pr in history.pull_requests.values() if pr.merged_at is not None and window_90 < pr.merged_at <= observed_at)
    closed_unmerged_prs_90d = sum(1 for pr in history.pull_requests.values() if pr.closed_at is not None and pr.merged_at is None and window_90 < pr.closed_at <= observed_at)
    pr_merge_ratio_90d = merged_prs_90d / max(1, opened_prs_90d)
    stale_open_prs = sum(1 for pr in history.pull_requests.values() if pr.created_at <= window_90 and (pr.closed_at is None or pr.closed_at > observed_at))

    package_release_times = [item.published_at for item in package.version_history if item.published_at <= observed_at]
    repository_release_times = [item for item in history.releases if item <= observed_at]
    releases_365d = sum(1 for item in repository_release_times if window_365 < item <= observed_at)
    versions_published_365d = sum(1 for item in package_release_times if window_365 < item <= observed_at)
    combined_release_times = sorted(set(repository_release_times + package_release_times))
    last_release = combined_release_times[-1] if combined_release_times else None
    days_since_last_release = _age_days(observed_at, last_release)
    if days_since_last_release is None:
        missing_features.append("days_since_last_release")
    release_cadence_days = _release_cadence_days(combined_release_times)

    first_package_version = package.first_version()
    package_age_days = _age_days(observed_at, first_package_version.published_at if first_package_version else None)
    if package_age_days is None:
        missing_features.append("package_age_days")
    repo_age_days = _age_days(observed_at, repository.created_at)
    if repo_age_days is None:
        missing_features.append("repo_age_days")

    stars_total_at_obs = sum(1 for item in history.stars if item <= observed_at)
    forks_total_at_obs = sum(1 for item in history.forks if item <= observed_at)

    selected_version = package.latest_version_before(observed_at)
    dependency_count = selected_version.dependency_count if selected_version is not None else None
    if dependency_count is None:
        missing_features.append("dependency_count_at_obs")

    missing_features.append("direct_dependents_count_at_obs")
    missing_features.append("ecosystem_download_tier_at_obs")
    popularity_tier = _popularity_tier_from_history(stars_total_at_obs, forks_total_at_obs)
    popularity_tier_numeric = {"low": 0.0, "medium": 1.0, "high": 2.0}[popularity_tier]

    repo_archived_at_obs = 1.0 if repository.archived_at is not None and repository.archived_at <= observed_at else 0.0
    has_recent_release_flag = 1.0 if releases_365d > 0 or versions_published_365d > 0 else 0.0
    has_recent_pr_merge_flag = 1.0 if merged_prs_90d > 0 else 0.0
    activity_drop = (commits_prev_365d - commits_365d) / max(1, commits_prev_365d)
    contributors_drop = (contributors_prev_365d - contributors_365d) / max(1, contributors_prev_365d)
    release_gap_risk = _release_gap_risk(days_since_last_release, release_cadence_days, package_age_days, repo_age_days)
    concentration_risk_score = min(1.0, top1_share * 0.6 + top2_share * 0.2 + concentration_index * 0.2 + maintainer_concentration_flag * 0.15)

    pr_response_median_days = _pr_response_median_days(history, window_365, observed_at)

    if history.coverage_start is None or history.coverage_start > window_365:
        missing_features.append("history_coverage_before_observation")

    feature_values = {
        "commits_30d": float(commits_30d),
        "commits_90d": float(commits_90d),
        "commits_365d": float(commits_365d),
        "active_commit_months_365d": float(active_commit_months_365d),
        "days_since_last_commit": float(days_since_last_commit or 0),
        "contributors_90d": float(contributors_90d),
        "contributors_365d": float(contributors_365d),
        "new_contributors_365d": float(new_contributors_365d),
        "top1_contributor_commit_share_365d": round(top1_share, 6),
        "top2_contributor_commit_share_365d": round(top2_share, 6),
        "contributor_concentration_index": round(concentration_index, 6),
        "maintainer_concentration_flag": maintainer_concentration_flag,
        "opened_issues_90d": float(opened_issues_90d),
        "closed_issues_90d": float(closed_issues_90d),
        "issue_closure_ratio_90d": round(issue_closure_ratio_90d, 6),
        "issue_backlog_growth_90d": round(issue_backlog_growth_90d, 6),
        "stale_open_issues_count_at_obs": float(stale_open_issues),
        "opened_prs_90d": float(opened_prs_90d),
        "merged_prs_90d": float(merged_prs_90d),
        "closed_unmerged_prs_90d": float(closed_unmerged_prs_90d),
        "pr_merge_ratio_90d": round(pr_merge_ratio_90d, 6),
        "stale_open_prs_count_at_obs": float(stale_open_prs),
        "releases_365d": float(releases_365d),
        "days_since_last_release": float(days_since_last_release or 0),
        "versions_published_365d": float(versions_published_365d),
        "package_age_days": float(package_age_days or 0),
        "repo_age_days": float(repo_age_days or 0),
        "stars_total_at_obs": float(stars_total_at_obs),
        "forks_total_at_obs": float(forks_total_at_obs),
        "direct_dependents_count_at_obs": 0.0,
        "dependency_count_at_obs": float(dependency_count or 0),
        "ecosystem_download_tier_at_obs": 0.0,
        "popularity_tier_at_obs": popularity_tier_numeric,
        "repo_archived_at_obs": repo_archived_at_obs,
        "has_recent_release_flag": has_recent_release_flag,
        "has_recent_pr_merge_flag": has_recent_pr_merge_flag,
        "activity_drop_365d_vs_prev_365d": round(activity_drop, 6),
        "contributors_drop_365d_vs_prev_365d": round(contributors_drop, 6),
        "release_gap_risk": round(release_gap_risk, 6),
        "concentration_risk_score": round(concentration_risk_score, 6),
    }

    ordered_values = {name: float(feature_values[name]) for name in HISTORICAL_FEATURE_NAMES}
    return SnapshotFeatureRow(
        snapshot_id=snapshot.snapshot_id,
        repository_id=snapshot.repository_id,
        package_id=snapshot.package_id,
        ecosystem=snapshot.ecosystem,
        observed_at=snapshot.observed_at,
        package_version_at_obs=selected_version.version if selected_version is not None else package.selected_version,
        feature_values=ordered_values,
        missing_features=sorted(set(missing_features)),
        open_issues_total_at_obs=backlog_obs,
        release_cadence_days=release_cadence_days,
        pr_response_median_days=pr_response_median_days,
    )


def _contributors_in_window(commits, start, end) -> int:
    return len(_contributor_set(commits, start, end))


def _contributor_set(commits, start, end) -> set[str]:
    return {item.actor for item in commits if item.actor and start < item.occurred_at <= end}


def _commit_counts_by_actor(commits, start, end) -> dict[str, int]:
    counts: dict[str, int] = {}
    for item in commits:
        if not item.actor or not (start < item.occurred_at <= end):
            continue
        counts[item.actor] = counts.get(item.actor, 0) + item.count
    return counts


def _open_issue_count_at(history: RepositoryHistory, observed_at) -> int:
    return sum(1 for issue in history.issues.values() if issue.created_at <= observed_at and (issue.closed_at is None or issue.closed_at > observed_at))


def _age_days(observed_at, value) -> int | None:
    if value is None:
        return None
    return max(0, int((observed_at - value).total_seconds() // 86_400))


def _release_cadence_days(release_times) -> int | None:
    if len(release_times) < 2:
        return None
    ordered = sorted(release_times)
    deltas = []
    for index in range(1, len(ordered)):
        delta = int((ordered[index] - ordered[index - 1]).total_seconds() // 86_400)
        if delta > 0:
            deltas.append(delta)
    if not deltas:
        return None
    return int(sum(deltas) / len(deltas))


def _release_gap_risk(days_since_last_release: int | None, release_cadence_days: int | None, package_age_days: int | None, repo_age_days: int | None) -> float:
    age_reference = max(package_age_days or 0, repo_age_days or 0)
    if days_since_last_release is None:
        if age_reference >= 365:
            return 1.0
        return 0.5 if age_reference >= 180 else 0.0
    baseline = max(180.0, float((release_cadence_days or 90) * 2))
    return min(1.0, days_since_last_release / baseline)


def _popularity_tier_from_history(stars_total_at_obs: int, forks_total_at_obs: int) -> str:
    if stars_total_at_obs >= 500 or forks_total_at_obs >= 100:
        return "high"
    if stars_total_at_obs >= 50 or forks_total_at_obs >= 20:
        return "medium"
    return "low"


def _pr_response_median_days(history: RepositoryHistory, start, end) -> float | None:
    samples = []
    for pr in history.pull_requests.values():
        closed_at = pr.merged_at or pr.closed_at
        if closed_at is None or not (start < closed_at <= end):
            continue
        samples.append((closed_at - pr.created_at).total_seconds() / 86_400)
    if not samples:
        return None
    return round(float(median(samples)), 6)
