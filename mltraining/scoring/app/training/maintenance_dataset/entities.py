from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import Any


SUPPORTED_ECOSYSTEMS = ("npm", "pypi", "go", "maven", "cargo", "github")
POPULARITY_TIERS = ("low", "medium", "high")


def normalize_ecosystem(value: str) -> str:
    normalized = value.strip().lower()
    if normalized == "python":
        return "pypi"
    if normalized == "golang":
        return "go"
    return normalized


def slugify_identifier(value: str) -> str:
    return value.strip().lower().replace("/", "__").replace(":", "_").replace(" ", "_")


def isoformat_or_none(value: datetime | None) -> str | None:
    return None if value is None else value.isoformat()


@dataclass(slots=True)
class PackageVersionRecord:
    version: str
    published_at: datetime
    dependency_count: int | None = None


@dataclass(slots=True)
class PackageCandidate:
    ecosystem: str
    package_name: str
    package_version: str | None = None
    repository_url: str | None = None
    repository_full_name: str | None = None
    direct_dependents_count: int | None = None
    downloads_30d: int | None = None
    popularity_tier: str | None = None
    source: str = "seed"

    @property
    def package_id(self) -> str:
        return f"{normalize_ecosystem(self.ecosystem)}:{self.package_name}"


@dataclass(slots=True)
class PackageRecord:
    package_id: str
    ecosystem: str
    package_name: str
    selected_version: str | None
    repository_url: str | None
    repository_full_name: str | None
    popularity_tier: str | None
    downloads_30d: int | None
    direct_dependents_count: int | None
    version_history: list[PackageVersionRecord] = field(default_factory=list)
    source: str = "seed"
    registry_source: str | None = None
    mapping_source: str | None = None

    def latest_version_before(self, observed_at: datetime) -> PackageVersionRecord | None:
        eligible = [item for item in self.version_history if item.published_at <= observed_at]
        if not eligible:
            return None
        eligible.sort(key=lambda item: item.published_at)
        return eligible[-1]

    def first_version(self) -> PackageVersionRecord | None:
        if not self.version_history:
            return None
        return min(self.version_history, key=lambda item: item.published_at)


@dataclass(slots=True)
class RepositoryRecord:
    repository_id: str
    full_name: str
    url: str
    default_branch: str
    created_at: datetime | None
    is_fork: bool = False
    archived_at: datetime | None = None
    deleted_at: datetime | None = None
    current_archived: bool = False
    source: str = "github"
    metadata_source_url: str | None = None
    event_coverage_start: datetime | None = None
    event_coverage_end: datetime | None = None


@dataclass(slots=True)
class PackageRepositoryLinkRecord:
    link_id: str
    package_id: str
    repository_id: str
    repository_full_name: str
    resolved_version: str | None
    mapping_source: str
    source_url: str | None = None


@dataclass(slots=True)
class ObservationSnapshot:
    snapshot_id: str
    repository_id: str
    package_id: str
    ecosystem: str
    observed_at: datetime
    feature_window_start: datetime
    previous_window_start: datetime
    label_window_end: datetime


@dataclass(slots=True)
class SnapshotFeatureRow:
    snapshot_id: str
    repository_id: str
    package_id: str
    ecosystem: str
    observed_at: datetime
    package_version_at_obs: str | None
    feature_values: dict[str, float]
    missing_features: list[str] = field(default_factory=list)
    open_issues_total_at_obs: int = 0
    release_cadence_days: int | None = None
    pr_response_median_days: float | None = None


@dataclass(slots=True)
class SnapshotLabelRow:
    snapshot_id: str
    repository_id: str
    package_id: str
    observed_at: datetime
    maintained_12m: bool | None
    label_inactive_12m: bool | None
    future_active_commit_months_12m: int
    future_contributors_12m: int
    future_releases_12m: int
    future_merged_prs_12m: int
    archived_by_t_plus_12m: bool
    missing_label_signals: list[str] = field(default_factory=list)


@dataclass(slots=True)
class RegistryPackageMetadata:
    repository_url: str | None
    source_url: str | None
    versions: list[PackageVersionRecord] = field(default_factory=list)
    downloads_30d: int | None = None


@dataclass(slots=True)
class ResolvedRepositoryMetadata:
    repository_url: str | None
    repository_full_name: str | None
    dependency_count: int | None = None
    direct_dependents_count: int | None = None
    source_url: str | None = None


@dataclass(slots=True)
class GitHubRepositoryMetadata:
    full_name: str
    url: str
    default_branch: str
    created_at: datetime | None
    is_fork: bool = False
    current_archived: bool = False
    archived_at: datetime | None = None
    deleted_at: datetime | None = None
    source_url: str | None = None


@dataclass(slots=True)
class NormalizedEvent:
    repo_full_name: str
    kind: str
    occurred_at: datetime
    actor: str | None = None
    count: int = 1
    item_id: str | None = None
    item_created_at: datetime | None = None
    item_closed_at: datetime | None = None
    item_merged_at: datetime | None = None


@dataclass(slots=True)
class CommitEvent:
    occurred_at: datetime
    actor: str | None
    count: int


@dataclass(slots=True)
class IssueState:
    issue_id: str
    created_at: datetime
    closed_at: datetime | None = None


@dataclass(slots=True)
class PullRequestState:
    pr_id: str
    created_at: datetime
    author: str | None = None
    closed_at: datetime | None = None
    merged_at: datetime | None = None


@dataclass(slots=True)
class RepositoryHistory:
    repository_full_name: str
    commits: list[CommitEvent] = field(default_factory=list)
    issues: dict[str, IssueState] = field(default_factory=dict)
    pull_requests: dict[str, PullRequestState] = field(default_factory=dict)
    releases: list[datetime] = field(default_factory=list)
    stars: list[datetime] = field(default_factory=list)
    forks: list[datetime] = field(default_factory=list)
    coverage_start: datetime | None = None
    coverage_end: datetime | None = None


def dataclass_to_dict(item: Any) -> Any:
    if isinstance(item, datetime):
        return item.isoformat()
    if isinstance(item, list):
        return [dataclass_to_dict(value) for value in item]
    if isinstance(item, dict):
        return {key: dataclass_to_dict(value) for key, value in item.items()}
    if hasattr(item, "__dataclass_fields__"):
        return {key: dataclass_to_dict(getattr(item, key)) for key in item.__dataclass_fields__}
    return item
