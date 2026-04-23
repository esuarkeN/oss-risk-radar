from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from app.training.maintenance_dataset.adapters import (
    DepsDevAdapter,
    GitHubRepositoryAdapter,
    NpmRegistryAdapter,
    PyPIRegistryAdapter,
    normalize_repository_url,
    parse_datetime,
    repository_full_name_from_url,
)
from app.training.maintenance_dataset.entities import (
    ObservationSnapshot,
    PackageCandidate,
    PackageRecord,
    PackageRepositoryLinkRecord,
    PackageVersionRecord,
    RegistryPackageMetadata,
    RepositoryRecord,
    SnapshotFeatureRow,
    SnapshotLabelRow,
    GitHubRepositoryMetadata,
    ResolvedRepositoryMetadata,
    normalize_ecosystem,
    slugify_identifier,
)
from app.training.maintenance_dataset.events import GHArchiveAdapter
from app.training.maintenance_dataset.features import build_snapshot_features
from app.training.maintenance_dataset.labels import build_snapshot_label
from app.training.maintenance_dataset.sampling import derive_popularity_tier, sample_candidates
from app.training.maintenance_dataset.storage import load_package_candidates, read_jsonl, write_json, write_jsonl


@dataclass(slots=True)
class DatasetPaths:
    output_dir: Path
    repositories: Path
    packages: Path
    package_repository_links: Path
    observation_snapshots: Path
    snapshot_features: Path
    snapshot_labels: Path
    training_snapshots: Path

    @classmethod
    def from_output_dir(cls, output_dir: str | Path, training_output_path: str | Path | None = None) -> "DatasetPaths":
        root = Path(output_dir)
        training_path = Path(training_output_path) if training_output_path else root / "training_snapshots.json"
        return cls(
            output_dir=root,
            repositories=root / "repositories.jsonl",
            packages=root / "packages.jsonl",
            package_repository_links=root / "package_repository_links.jsonl",
            observation_snapshots=root / "observation_snapshots.jsonl",
            snapshot_features=root / "snapshot_features.jsonl",
            snapshot_labels=root / "snapshot_labels.jsonl",
            training_snapshots=training_path,
        )


@dataclass(slots=True)
class DatasetBuildConfig:
    seed_file: str | Path
    output_dir: str | Path
    gharchive_sources: list[str]
    observation_start: datetime
    observation_end: datetime
    observation_interval_months: int = 3
    label_horizon_months: int = 12
    sample_limit_per_ecosystem: int = 24
    sample_seed: int = 42
    include_forks: bool = False
    training_output_path: str | Path | None = None


@dataclass(slots=True)
class PipelineAdapters:
    gharchive: GHArchiveAdapter
    depsdev: DepsDevAdapter
    github: GitHubRepositoryAdapter
    npm_registry: NpmRegistryAdapter
    pypi_registry: PyPIRegistryAdapter

    @classmethod
    def live(cls, github_token: str | None = None) -> "PipelineAdapters":
        return cls(
            gharchive=GHArchiveAdapter(),
            depsdev=DepsDevAdapter(),
            github=GitHubRepositoryAdapter(token=github_token),
            npm_registry=NpmRegistryAdapter(),
            pypi_registry=PyPIRegistryAdapter(),
        )


class DatasetBuilder:
    def __init__(self, config: DatasetBuildConfig, adapters: PipelineAdapters) -> None:
        self.config = config
        self.adapters = adapters
        self.paths = DatasetPaths.from_output_dir(config.output_dir, config.training_output_path)

    def ingest_candidates(self) -> dict[str, int]:
        candidates = self._dedupe_candidates(load_package_candidates(Path(self.config.seed_file)))
        sampled = sample_candidates(candidates, self.config.sample_limit_per_ecosystem, self.config.sample_seed)

        package_records: dict[str, PackageRecord] = {}
        repository_records: dict[str, RepositoryRecord] = {}
        link_records: dict[str, PackageRepositoryLinkRecord] = {}

        for candidate in sampled:
            registry_metadata = self._load_registry_metadata(candidate)
            selected_version = candidate.package_version or (registry_metadata.versions[-1].version if registry_metadata.versions else None)
            resolved_repository = self._resolve_repository(candidate, selected_version)
            mapping_source = self._mapping_source_for_candidate(candidate, resolved_repository)
            repository_url = resolved_repository.repository_url or registry_metadata.repository_url
            if not repository_url or "github.com" not in repository_url.lower():
                continue

            if resolved_repository.dependency_count is not None and selected_version:
                for version in registry_metadata.versions:
                    if version.version == selected_version and version.dependency_count is None:
                        version.dependency_count = resolved_repository.dependency_count

            github_repository = self._load_github_repository(repository_url)
            repository_full_name = (
                github_repository.full_name
                if github_repository is not None
                else resolved_repository.repository_full_name or candidate.repository_full_name or repository_full_name_from_url(repository_url)
            )
            if repository_full_name is None:
                continue
            if github_repository is not None and github_repository.is_fork and not self.config.include_forks:
                continue

            selected_version = selected_version or ("repository-snapshot" if normalize_ecosystem(candidate.ecosystem) == "github" else None)
            version_history = self._build_version_history(candidate, registry_metadata.versions, github_repository, selected_version)

            repository_id = slugify_identifier(repository_full_name)
            package_id = candidate.package_id
            package_records[package_id] = self._merge_package_record(
                package_records.get(package_id),
                PackageRecord(
                    package_id=package_id,
                    ecosystem=normalize_ecosystem(candidate.ecosystem),
                    package_name=candidate.package_name,
                    selected_version=selected_version,
                    repository_url=repository_url,
                    repository_full_name=repository_full_name,
                    popularity_tier=derive_popularity_tier(candidate),
                    downloads_30d=candidate.downloads_30d,
                    direct_dependents_count=candidate.direct_dependents_count or resolved_repository.direct_dependents_count,
                    version_history=version_history,
                    source=candidate.source,
                    registry_source=registry_metadata.source_url,
                    mapping_source=resolved_repository.source_url,
                ),
            )
            repository_records[repository_id] = self._merge_repository_record(
                repository_records.get(repository_id),
                self._build_repository_record(repository_id, repository_url, repository_full_name, github_repository),
            )
            link_id = f"{package_id}->{repository_id}"
            link_records[link_id] = PackageRepositoryLinkRecord(
                link_id=link_id,
                package_id=package_id,
                repository_id=repository_id,
                repository_full_name=repository_full_name,
                resolved_version=selected_version,
                mapping_source=mapping_source,
                source_url=resolved_repository.source_url or registry_metadata.source_url,
            )

        repositories = sorted(repository_records.values(), key=lambda item: item.full_name)
        packages = sorted(package_records.values(), key=lambda item: item.package_id)
        links = sorted(link_records.values(), key=lambda item: item.link_id)
        write_jsonl(self.paths.repositories, repositories)
        write_jsonl(self.paths.packages, packages)
        write_jsonl(self.paths.package_repository_links, links)
        return {
            "sampled_candidates": len(sampled),
            "packages": len(packages),
            "repositories": len(repositories),
            "package_repository_links": len(links),
        }

    def build_snapshots(self) -> dict[str, int]:
        repositories = self._load_repositories()
        packages = self._load_packages()
        links = self._select_primary_links(self._load_links(), packages)
        histories = self._load_histories(repositories)

        snapshots: list[ObservationSnapshot] = []
        feature_rows: list[SnapshotFeatureRow] = []
        for observed_at in self._iter_observation_dates():
            for repository_id, link in links.items():
                repository = repositories[repository_id]
                package = packages[link.package_id]
                if self._observation_before_entity_start(observed_at, repository, package):
                    continue
                snapshot = ObservationSnapshot(
                    snapshot_id=f"{repository_id}:{observed_at.date().isoformat()}",
                    repository_id=repository_id,
                    package_id=package.package_id,
                    ecosystem=package.ecosystem,
                    observed_at=observed_at,
                    feature_window_start=observed_at - timedelta(days=365),
                    previous_window_start=observed_at - timedelta(days=730),
                    label_window_end=self._add_months(observed_at, self.config.label_horizon_months),
                )
                history = histories.get(repository.full_name.lower())
                snapshots.append(snapshot)
                feature_rows.append(build_snapshot_features(snapshot, repository, package, history))

        for repository in repositories.values():
            history = histories.get(repository.full_name.lower())
            if history is None:
                continue
            repository.event_coverage_start = history.coverage_start
            repository.event_coverage_end = history.coverage_end

        write_jsonl(self.paths.repositories, sorted(repositories.values(), key=lambda item: item.full_name))
        write_jsonl(self.paths.observation_snapshots, snapshots)
        write_jsonl(self.paths.snapshot_features, feature_rows)
        return {"snapshots": len(snapshots), "snapshot_features": len(feature_rows)}

    def build_labels(self) -> dict[str, int]:
        repositories = self._load_repositories()
        packages = self._load_packages()
        histories = self._load_histories(repositories)
        labels: list[SnapshotLabelRow] = []
        for snapshot in self._load_observation_snapshots():
            repository = repositories[snapshot.repository_id]
            package = packages[snapshot.package_id]
            history = histories.get(repository.full_name.lower())
            labels.append(build_snapshot_label(snapshot, repository, package, history))
        write_jsonl(self.paths.snapshot_labels, labels)
        labeled_rows = sum(1 for item in labels if item.label_inactive_12m is not None)
        return {"snapshot_labels": len(labels), "labeled_rows": labeled_rows}

    def export_training_dataset(self) -> dict[str, int]:
        repositories = self._load_repositories()
        packages = self._load_packages()
        snapshots = {item.snapshot_id: item for item in self._load_observation_snapshots()}
        feature_rows = {item.snapshot_id: item for item in self._load_feature_rows()}
        label_rows = {item.snapshot_id: item for item in self._load_label_rows()}

        exported_rows: list[dict[str, Any]] = []
        for snapshot_id in sorted(snapshots):
            snapshot = snapshots[snapshot_id]
            feature_row = feature_rows[snapshot_id]
            label_row = label_rows.get(snapshot_id)
            repository = repositories[snapshot.repository_id]
            package = packages[snapshot.package_id]
            exported_rows.append(
                {
                    "analysis_id": f"dataset:{snapshot.snapshot_id}",
                    "observed_at": snapshot.observed_at.isoformat(),
                    "dependency": {
                        "dependency_id": snapshot.snapshot_id,
                        "package_name": package.package_name,
                        "package_version": feature_row.package_version_at_obs or f"snapshot-{snapshot.observed_at.date().isoformat()}",
                        "ecosystem": package.ecosystem,
                        "direct": True,
                        "repository": {
                            "full_name": repository.full_name,
                            "url": repository.url,
                            "default_branch": repository.default_branch,
                            "archived": bool(feature_row.feature_values["repo_archived_at_obs"]),
                            "stars": int(feature_row.feature_values["stars_total_at_obs"]),
                            "forks": int(feature_row.feature_values["forks_total_at_obs"]),
                            "open_issues": feature_row.open_issues_total_at_obs,
                            "last_push_age_days": self._none_if_missing(feature_row, "days_since_last_commit"),
                            "last_release_age_days": self._none_if_missing(feature_row, "days_since_last_release"),
                            "release_cadence_days": feature_row.release_cadence_days,
                            "recent_contributors_90d": int(feature_row.feature_values["contributors_90d"]),
                            "contributor_concentration": feature_row.feature_values["top1_contributor_commit_share_365d"],
                            "open_issue_growth_90d": feature_row.feature_values["issue_backlog_growth_90d"],
                            "pr_response_median_days": feature_row.pr_response_median_days,
                        },
                        "historical_features": feature_row.feature_values,
                    },
                    "label_inactive_12m": None if label_row is None else label_row.label_inactive_12m,
                }
            )

        payload = {"updatedAt": datetime.now(UTC).isoformat(), "snapshots": exported_rows}
        write_json(self.paths.training_snapshots, payload)
        labeled_rows = sum(1 for row in exported_rows if row["label_inactive_12m"] is not None)
        return {"training_snapshots": len(exported_rows), "labeled_rows": labeled_rows}

    def build_all(self) -> dict[str, int]:
        summary: dict[str, int] = {}
        summary.update(self.ingest_candidates())
        summary.update(self.build_snapshots())
        summary.update(self.build_labels())
        summary.update(self.export_training_dataset())
        return summary

    def _dedupe_candidates(self, candidates: list[PackageCandidate]) -> list[PackageCandidate]:
        unique: dict[str, PackageCandidate] = {}
        for candidate in candidates:
            if not candidate.package_name.strip() or not candidate.ecosystem.strip():
                continue
            unique[candidate.package_id] = candidate
        return sorted(unique.values(), key=lambda item: item.package_id)

    def _load_registry_metadata(self, candidate: PackageCandidate) -> RegistryPackageMetadata:
        ecosystem = normalize_ecosystem(candidate.ecosystem)
        if ecosystem == "github":
            return RegistryPackageMetadata(
                repository_url=normalize_repository_url(candidate.repository_url),
                source_url=None,
                versions=[],
            )
        try:
            if ecosystem == "npm":
                return self.adapters.npm_registry.get_package_metadata(candidate.package_name)
            if ecosystem == "pypi":
                return self.adapters.pypi_registry.get_package_metadata(candidate.package_name)
        except Exception:
            return RegistryPackageMetadata(repository_url=None, source_url=None, versions=[])
        return RegistryPackageMetadata(repository_url=None, source_url=None, versions=[])

    def _resolve_repository(self, candidate: PackageCandidate, version: str | None) -> ResolvedRepositoryMetadata:
        repository_url = normalize_repository_url(candidate.repository_url)
        repository_full_name = (
            candidate.repository_full_name.strip().lower()
            if candidate.repository_full_name
            else repository_full_name_from_url(repository_url)
        )
        if normalize_ecosystem(candidate.ecosystem) == "github" and repository_full_name is None:
            fallback_full_name = candidate.package_name.strip().lower()
            if "/" in fallback_full_name:
                repository_full_name = fallback_full_name
        if repository_url is None and repository_full_name is not None:
            repository_url = f"https://github.com/{repository_full_name}"
        if repository_url is not None or repository_full_name is not None:
            return ResolvedRepositoryMetadata(
                repository_url=repository_url,
                repository_full_name=repository_full_name,
                direct_dependents_count=candidate.direct_dependents_count,
                source_url=None,
            )
        try:
            resolved = self.adapters.depsdev.resolve_repository(candidate.ecosystem, candidate.package_name, version)
            if resolved is not None:
                return resolved
        except Exception:
            pass
        return ResolvedRepositoryMetadata(repository_url=None, repository_full_name=None)

    def _build_version_history(
        self,
        candidate: PackageCandidate,
        registry_versions: list[PackageVersionRecord],
        github_repository: GitHubRepositoryMetadata | None,
        selected_version: str | None,
    ) -> list[PackageVersionRecord]:
        versions = list(registry_versions)
        if versions:
            versions.sort(key=lambda item: item.published_at)
            return versions
        if normalize_ecosystem(candidate.ecosystem) != "github" or selected_version is None:
            return versions
        published_at = (
            github_repository.created_at
            if github_repository is not None and github_repository.created_at is not None
            else self.config.observation_start
        )
        return [PackageVersionRecord(version=selected_version, published_at=published_at)]

    def _mapping_source_for_candidate(
        self,
        candidate: PackageCandidate,
        resolved_repository: ResolvedRepositoryMetadata,
    ) -> str:
        if resolved_repository.source_url:
            return "deps.dev"
        if candidate.repository_url or candidate.repository_full_name or normalize_ecosystem(candidate.ecosystem) == "github":
            return "seed"
        return "registry-fallback"

    def _load_github_repository(self, repository_url: str) -> GitHubRepositoryMetadata | None:
        try:
            return self.adapters.github.get_repository(repository_url)
        except Exception:
            return None

    def _build_repository_record(
        self,
        repository_id: str,
        repository_url: str,
        repository_full_name: str,
        github_repository: GitHubRepositoryMetadata | None,
    ) -> RepositoryRecord:
        if github_repository is None:
            return RepositoryRecord(
                repository_id=repository_id,
                full_name=repository_full_name.lower(),
                url=repository_url,
                default_branch="main",
                created_at=None,
                source="deps.dev",
                metadata_source_url=repository_url,
            )
        return RepositoryRecord(
            repository_id=repository_id,
            full_name=github_repository.full_name.lower(),
            url=github_repository.url,
            default_branch=github_repository.default_branch,
            created_at=github_repository.created_at,
            is_fork=github_repository.is_fork,
            archived_at=github_repository.archived_at,
            deleted_at=github_repository.deleted_at,
            current_archived=github_repository.current_archived,
            source="github",
            metadata_source_url=github_repository.source_url,
        )

    def _merge_package_record(self, current: PackageRecord | None, candidate: PackageRecord) -> PackageRecord:
        if current is None:
            candidate.version_history.sort(key=lambda item: item.published_at)
            return candidate
        merged_versions = {item.version: item for item in current.version_history}
        for version in candidate.version_history:
            existing = merged_versions.get(version.version)
            if existing is None:
                merged_versions[version.version] = version
                continue
            if existing.dependency_count is None and version.dependency_count is not None:
                existing.dependency_count = version.dependency_count
        current.version_history = sorted(merged_versions.values(), key=lambda item: item.published_at)
        current.repository_url = current.repository_url or candidate.repository_url
        current.repository_full_name = current.repository_full_name or candidate.repository_full_name
        current.selected_version = current.selected_version or candidate.selected_version
        current.popularity_tier = current.popularity_tier or candidate.popularity_tier
        current.downloads_30d = current.downloads_30d or candidate.downloads_30d
        current.direct_dependents_count = current.direct_dependents_count or candidate.direct_dependents_count
        current.registry_source = current.registry_source or candidate.registry_source
        current.mapping_source = current.mapping_source or candidate.mapping_source
        return current

    def _merge_repository_record(self, current: RepositoryRecord | None, candidate: RepositoryRecord) -> RepositoryRecord:
        if current is None:
            return candidate
        current.default_branch = current.default_branch or candidate.default_branch
        current.created_at = current.created_at or candidate.created_at
        current.is_fork = current.is_fork or candidate.is_fork
        current.archived_at = current.archived_at or candidate.archived_at
        current.deleted_at = current.deleted_at or candidate.deleted_at
        current.current_archived = current.current_archived or candidate.current_archived
        current.metadata_source_url = current.metadata_source_url or candidate.metadata_source_url
        return current

    def _select_primary_links(
        self,
        links: list[PackageRepositoryLinkRecord],
        packages: dict[str, PackageRecord],
    ) -> dict[str, PackageRepositoryLinkRecord]:
        selected: dict[str, PackageRepositoryLinkRecord] = {}
        for link in links:
            package = packages.get(link.package_id)
            if package is None:
                continue
            current = selected.get(link.repository_id)
            if current is None:
                selected[link.repository_id] = link
                continue
            if self._package_priority(packages[link.package_id]) > self._package_priority(packages[current.package_id]):
                selected[link.repository_id] = link
        return selected

    def _package_priority(self, package: PackageRecord) -> tuple[int, int, int, str]:
        tier_weight = {"low": 0, "medium": 1, "high": 2}.get(package.popularity_tier or "low", 0)
        return (tier_weight, package.downloads_30d or 0, package.direct_dependents_count or 0, package.package_id)

    def _load_histories(self, repositories: dict[str, RepositoryRecord]):
        names = {item.full_name.lower() for item in repositories.values()}
        start = self.config.observation_start - timedelta(days=730)
        end = self._add_months(self.config.observation_end, self.config.label_horizon_months)
        return self.adapters.gharchive.load_repository_histories(self.config.gharchive_sources, names, start=start, end=end)

    def _observation_before_entity_start(self, observed_at: datetime, repository: RepositoryRecord, package: PackageRecord) -> bool:
        package_start = package.first_version().published_at if package.first_version() is not None else None
        starts = [value for value in (repository.created_at, package_start) if value is not None]
        return bool(starts and observed_at < max(starts))

    def _iter_observation_dates(self):
        current = self.config.observation_start.astimezone(UTC)
        end = self.config.observation_end.astimezone(UTC)
        while current <= end:
            yield current
            current = self._add_months(current, self.config.observation_interval_months)

    def _add_months(self, value: datetime, months: int) -> datetime:
        year = value.year + (value.month - 1 + months) // 12
        month = ((value.month - 1 + months) % 12) + 1
        day = min(value.day, 28)
        return value.replace(year=year, month=month, day=day)

    def _none_if_missing(self, feature_row: SnapshotFeatureRow, feature_name: str) -> int | None:
        if feature_name in feature_row.missing_features:
            return None
        return int(feature_row.feature_values.get(feature_name, 0))

    def _load_packages(self) -> dict[str, PackageRecord]:
        rows = read_jsonl(self.paths.packages)
        packages = [_package_record_from_dict(item) for item in rows]
        return {item.package_id: item for item in packages}

    def _load_repositories(self) -> dict[str, RepositoryRecord]:
        rows = read_jsonl(self.paths.repositories)
        repositories = [_repository_record_from_dict(item) for item in rows]
        return {item.repository_id: item for item in repositories}

    def _load_links(self) -> list[PackageRepositoryLinkRecord]:
        return [_link_record_from_dict(item) for item in read_jsonl(self.paths.package_repository_links)]

    def _load_observation_snapshots(self) -> list[ObservationSnapshot]:
        return [_observation_snapshot_from_dict(item) for item in read_jsonl(self.paths.observation_snapshots)]

    def _load_feature_rows(self) -> list[SnapshotFeatureRow]:
        return [_snapshot_feature_row_from_dict(item) for item in read_jsonl(self.paths.snapshot_features)]

    def _load_label_rows(self) -> list[SnapshotLabelRow]:
        return [_snapshot_label_row_from_dict(item) for item in read_jsonl(self.paths.snapshot_labels)]


def _package_record_from_dict(payload: dict[str, Any]) -> PackageRecord:
    version_history: list[PackageVersionRecord] = []
    for item in payload.get("version_history", []):
        published_at = parse_datetime(item.get("published_at"))
        if published_at is None:
            continue
        version_history.append(
            PackageVersionRecord(
                version=str(item["version"]),
                published_at=published_at,
                dependency_count=item.get("dependency_count"),
            )
        )
    return PackageRecord(
        package_id=str(payload["package_id"]),
        ecosystem=str(payload["ecosystem"]),
        package_name=str(payload["package_name"]),
        selected_version=payload.get("selected_version"),
        repository_url=payload.get("repository_url"),
        repository_full_name=payload.get("repository_full_name"),
        popularity_tier=payload.get("popularity_tier"),
        downloads_30d=payload.get("downloads_30d"),
        direct_dependents_count=payload.get("direct_dependents_count"),
        version_history=version_history,
        source=str(payload.get("source", "seed")),
        registry_source=payload.get("registry_source"),
        mapping_source=payload.get("mapping_source"),
    )


def _repository_record_from_dict(payload: dict[str, Any]) -> RepositoryRecord:
    return RepositoryRecord(
        repository_id=str(payload["repository_id"]),
        full_name=str(payload["full_name"]).lower(),
        url=str(payload["url"]),
        default_branch=str(payload.get("default_branch", "main")),
        created_at=parse_datetime(payload.get("created_at")),
        is_fork=bool(payload.get("is_fork", False)),
        archived_at=parse_datetime(payload.get("archived_at")),
        deleted_at=parse_datetime(payload.get("deleted_at")),
        current_archived=bool(payload.get("current_archived", False)),
        source=str(payload.get("source", "github")),
        metadata_source_url=payload.get("metadata_source_url"),
        event_coverage_start=parse_datetime(payload.get("event_coverage_start")),
        event_coverage_end=parse_datetime(payload.get("event_coverage_end")),
    )


def _link_record_from_dict(payload: dict[str, Any]) -> PackageRepositoryLinkRecord:
    return PackageRepositoryLinkRecord(
        link_id=str(payload["link_id"]),
        package_id=str(payload["package_id"]),
        repository_id=str(payload["repository_id"]),
        repository_full_name=str(payload["repository_full_name"]),
        resolved_version=payload.get("resolved_version"),
        mapping_source=str(payload.get("mapping_source", "deps.dev")),
        source_url=payload.get("source_url"),
    )


def _observation_snapshot_from_dict(payload: dict[str, Any]) -> ObservationSnapshot:
    observed_at = parse_datetime(payload.get("observed_at")) or datetime.now(UTC)
    feature_window_start = parse_datetime(payload.get("feature_window_start")) or observed_at - timedelta(days=365)
    previous_window_start = parse_datetime(payload.get("previous_window_start")) or observed_at - timedelta(days=730)
    label_window_end = parse_datetime(payload.get("label_window_end")) or observed_at + timedelta(days=365)
    return ObservationSnapshot(
        snapshot_id=str(payload["snapshot_id"]),
        repository_id=str(payload["repository_id"]),
        package_id=str(payload["package_id"]),
        ecosystem=str(payload["ecosystem"]),
        observed_at=observed_at,
        feature_window_start=feature_window_start,
        previous_window_start=previous_window_start,
        label_window_end=label_window_end,
    )


def _snapshot_feature_row_from_dict(payload: dict[str, Any]) -> SnapshotFeatureRow:
    return SnapshotFeatureRow(
        snapshot_id=str(payload["snapshot_id"]),
        repository_id=str(payload["repository_id"]),
        package_id=str(payload["package_id"]),
        ecosystem=str(payload["ecosystem"]),
        observed_at=parse_datetime(payload.get("observed_at")) or datetime.now(UTC),
        package_version_at_obs=payload.get("package_version_at_obs"),
        feature_values={str(key): float(value) for key, value in payload.get("feature_values", {}).items()},
        missing_features=[str(item) for item in payload.get("missing_features", [])],
        open_issues_total_at_obs=int(payload.get("open_issues_total_at_obs", 0)),
        release_cadence_days=payload.get("release_cadence_days"),
        pr_response_median_days=payload.get("pr_response_median_days"),
    )


def _snapshot_label_row_from_dict(payload: dict[str, Any]) -> SnapshotLabelRow:
    return SnapshotLabelRow(
        snapshot_id=str(payload["snapshot_id"]),
        repository_id=str(payload["repository_id"]),
        package_id=str(payload["package_id"]),
        observed_at=parse_datetime(payload.get("observed_at")) or datetime.now(UTC),
        maintained_12m=payload.get("maintained_12m"),
        label_inactive_12m=payload.get("label_inactive_12m"),
        future_active_commit_months_12m=int(payload.get("future_active_commit_months_12m", 0)),
        future_contributors_12m=int(payload.get("future_contributors_12m", 0)),
        future_releases_12m=int(payload.get("future_releases_12m", 0)),
        future_merged_prs_12m=int(payload.get("future_merged_prs_12m", 0)),
        archived_by_t_plus_12m=bool(payload.get("archived_by_t_plus_12m", False)),
        missing_label_signals=[str(item) for item in payload.get("missing_label_signals", [])],
    )
