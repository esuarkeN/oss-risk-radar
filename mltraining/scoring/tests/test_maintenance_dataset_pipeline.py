from datetime import UTC, datetime
import csv
import json

from app.schemas.score import TrainingSnapshotInput
from app.training.maintenance_dataset.adapters import GitHubRepositoryMetadata
from app.training.maintenance_dataset.entities import CommitEvent, PackageVersionRecord, RegistryPackageMetadata, RepositoryHistory, ResolvedRepositoryMetadata
from app.training.maintenance_dataset.pipeline import DatasetBuildConfig, DatasetBuilder, PipelineAdapters


class FakeGHArchiveAdapter:
    def load_repository_histories(self, sources, repository_names, start=None, end=None):  # noqa: ANN001
        histories = {}
        for repository_name in repository_names:
            histories[repository_name] = RepositoryHistory(
                repository_full_name=repository_name,
                commits=[
                    CommitEvent(occurred_at=datetime(2023, 12, 10, tzinfo=UTC), actor="alice", count=2),
                    CommitEvent(occurred_at=datetime(2024, 2, 10, tzinfo=UTC), actor="alice", count=1),
                    CommitEvent(occurred_at=datetime(2024, 4, 10, tzinfo=UTC), actor="bob", count=1),
                    CommitEvent(occurred_at=datetime(2024, 7, 10, tzinfo=UTC), actor="alice", count=1),
                ],
                releases=[datetime(2024, 5, 1, tzinfo=UTC)],
                coverage_start=datetime(2023, 1, 1, tzinfo=UTC),
                coverage_end=datetime(2025, 5, 1, tzinfo=UTC),
            )
        return histories


class FakeDepsDevAdapter:
    def resolve_repository(self, ecosystem, package_name, version):  # noqa: ANN001
        repo_name = package_name.replace("_", "-")
        return ResolvedRepositoryMetadata(
            repository_url=f"https://github.com/acme/{repo_name}",
            repository_full_name=f"acme/{repo_name}",
            dependency_count=3,
            direct_dependents_count=12,
            source_url=f"https://deps.dev/{ecosystem}/{package_name}/{version}",
        )


class FakeGitHubAdapter:
    def get_repository(self, repository_url):  # noqa: ANN001
        repo_name = repository_url.rstrip("/").split("/")[-1]
        return GitHubRepositoryMetadata(
            full_name=f"acme/{repo_name}",
            url=repository_url,
            default_branch="main",
            created_at=datetime(2022, 1, 1, tzinfo=UTC),
            is_fork=False,
            current_archived=False,
            source_url=repository_url,
        )


class FakeNpmRegistryAdapter:
    def get_package_metadata(self, package_name):  # noqa: ANN001
        return RegistryPackageMetadata(
            repository_url=f"https://github.com/acme/{package_name}",
            source_url=f"https://registry.npmjs.org/{package_name}",
            versions=[
                PackageVersionRecord(version="1.0.0", published_at=datetime(2023, 1, 1, tzinfo=UTC), dependency_count=2),
                PackageVersionRecord(version="2.0.0", published_at=datetime(2023, 8, 1, tzinfo=UTC), dependency_count=3),
            ],
        )


class FakePyPIRegistryAdapter:
    def get_package_metadata(self, package_name):  # noqa: ANN001
        normalized = package_name.replace("_", "-")
        return RegistryPackageMetadata(
            repository_url=f"https://github.com/acme/{normalized}",
            source_url=f"https://pypi.org/project/{package_name}",
            versions=[
                PackageVersionRecord(version="0.9.0", published_at=datetime(2023, 2, 1, tzinfo=UTC), dependency_count=1),
                PackageVersionRecord(version="1.1.0", published_at=datetime(2023, 9, 1, tzinfo=UTC), dependency_count=3),
            ],
        )


class ExplodingDepsDevAdapter:
    def resolve_repository(self, ecosystem, package_name, version):  # noqa: ANN001
        raise AssertionError(f"deps.dev should not be called for repository seed {ecosystem}:{package_name}@{version}")


class EmptyRegistryAdapter:
    def get_package_metadata(self, package_name):  # noqa: ANN001
        return RegistryPackageMetadata(
            repository_url=None,
            source_url=None,
            versions=[],
        )


def test_dataset_builder_exports_existing_training_snapshot_format(tmp_path) -> None:
    seed_path = tmp_path / "seed.csv"
    with seed_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=["ecosystem", "package_name", "package_version", "popularity_tier"])
        writer.writeheader()
        writer.writerow({"ecosystem": "npm", "package_name": "widget-ui", "package_version": "2.0.0", "popularity_tier": "medium"})
        writer.writerow({"ecosystem": "pypi", "package_name": "widget_core", "package_version": "1.1.0", "popularity_tier": "low"})

    builder = DatasetBuilder(
        config=DatasetBuildConfig(
            seed_file=seed_path,
            output_dir=tmp_path / "dataset",
            gharchive_sources=["fixture"],
            observation_start=datetime(2024, 1, 1, tzinfo=UTC),
            observation_end=datetime(2024, 4, 1, tzinfo=UTC),
            observation_interval_months=3,
        ),
        adapters=PipelineAdapters(
            gharchive=FakeGHArchiveAdapter(),
            depsdev=FakeDepsDevAdapter(),
            github=FakeGitHubAdapter(),
            npm_registry=FakeNpmRegistryAdapter(),
            pypi_registry=FakePyPIRegistryAdapter(),
        ),
    )

    summary = builder.build_all()

    assert summary["repositories"] == 2
    assert summary["training_snapshots"] == 4
    payload = json.loads(builder.paths.training_snapshots.read_text(encoding="utf-8"))
    snapshots = payload["snapshots"]
    assert len(snapshots) == 4
    validated = [TrainingSnapshotInput.model_validate(item) for item in snapshots]
    assert all(item.dependency.historical_features for item in validated)
    assert any(item.label_inactive_12m is False for item in validated)


def test_dataset_builder_supports_repository_seed_candidates(tmp_path) -> None:
    seed_path = tmp_path / "foundation-seed.csv"
    with seed_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "ecosystem",
                "package_name",
                "package_version",
                "popularity_tier",
                "repository_url",
                "repository_full_name",
            ],
        )
        writer.writeheader()
        writer.writerow(
            {
                "ecosystem": "github",
                "package_name": "acme/dormant-repo",
                "package_version": "repository-snapshot",
                "popularity_tier": "medium",
                "repository_url": "https://github.com/acme/dormant-repo",
                "repository_full_name": "acme/dormant-repo",
            }
        )

    builder = DatasetBuilder(
        config=DatasetBuildConfig(
            seed_file=seed_path,
            output_dir=tmp_path / "dataset",
            gharchive_sources=["fixture"],
            observation_start=datetime(2024, 1, 1, tzinfo=UTC),
            observation_end=datetime(2024, 4, 1, tzinfo=UTC),
            observation_interval_months=3,
        ),
        adapters=PipelineAdapters(
            gharchive=FakeGHArchiveAdapter(),
            depsdev=ExplodingDepsDevAdapter(),
            github=FakeGitHubAdapter(),
            npm_registry=EmptyRegistryAdapter(),
            pypi_registry=EmptyRegistryAdapter(),
        ),
    )

    summary = builder.build_all()

    assert summary["repositories"] == 1
    assert summary["training_snapshots"] == 2
    payload = json.loads(builder.paths.training_snapshots.read_text(encoding="utf-8"))
    snapshots = [TrainingSnapshotInput.model_validate(item) for item in payload["snapshots"]]
    assert all(item.dependency.package_version == "repository-snapshot" for item in snapshots)
    assert all(item.dependency.repository and item.dependency.repository.full_name == "acme/dormant-repo" for item in snapshots)
    assert all(item.dependency.historical_features for item in snapshots)
