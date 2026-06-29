from datetime import UTC, datetime, timedelta

from app.schemas.score import TrainingSnapshotInput
from app.training.datasets import (
    TrainingRow,
    build_dataset,
    grouped_time_aware_split,
    repository_key,
    time_aware_split,
)


def _training_row(repository: str, observed_at: datetime) -> TrainingRow:
    return TrainingRow(
        analysis_id=f"dataset:{repository}:{observed_at.date().isoformat()}",
        dependency_id=f"{repository}:{observed_at.date().isoformat()}",
        package_name=repository,
        package_version="snapshot",
        ecosystem="github",
        observed_at=observed_at,
        label_inactive_12m=1,
        missing_signals=[],
        feature_values={},
    )


def test_build_dataset_orders_rows_by_observed_at(training_snapshots: list[dict[str, object]]) -> None:
    unordered = [
        TrainingSnapshotInput.model_validate(training_snapshots[3]),
        TrainingSnapshotInput.model_validate(training_snapshots[0]),
        TrainingSnapshotInput.model_validate(training_snapshots[2]),
    ]

    dataset = build_dataset(unordered)

    assert [row.dependency_id for row in dataset.rows] == ["dep_1", "dep_3", "dep_4"]
    assert dataset.feature_names


def test_time_aware_split_preserves_temporal_order(training_snapshots: list[dict[str, object]]) -> None:
    dataset = build_dataset([TrainingSnapshotInput.model_validate(snapshot) for snapshot in training_snapshots])
    split = time_aware_split(dataset.rows, train_ratio=0.5, validation_ratio=0.25)

    assert len(split.train) == 4
    assert len(split.validation) == 2
    assert len(split.test) == 2
    assert split.train[-1].observed_at < split.validation[0].observed_at
    assert split.validation[-1].observed_at < split.test[0].observed_at


def test_time_aware_split_defaults_to_75_15_10_for_large_datasets(training_snapshots: list[dict[str, object]]) -> None:
    snapshots = []
    base_observed_at = datetime(2023, 1, 1, tzinfo=UTC)
    for repeat in range(13):
        for snapshot in training_snapshots:
            cloned = dict(snapshot)
            cloned["observed_at"] = (base_observed_at + timedelta(days=len(snapshots))).isoformat()
            dependency = dict(snapshot["dependency"])
            dependency["dependency_id"] = f"{dependency['dependency_id']}_{repeat}"
            cloned["dependency"] = dependency
            snapshots.append(TrainingSnapshotInput.model_validate(cloned))

    dataset = build_dataset(snapshots[:100])
    split = time_aware_split(dataset.rows)

    assert len(split.train) == 75
    assert len(split.validation) == 15
    assert len(split.test) == 10


def test_grouped_split_is_repository_disjoint() -> None:
    rows: list[TrainingRow] = []
    base = datetime(2023, 1, 1, tzinfo=UTC)
    for repo_index in range(8):
        repository = f"acme__repo{repo_index}"
        for quarter in range(4):
            rows.append(_training_row(repository, base + timedelta(days=90 * quarter)))

    split = grouped_time_aware_split(rows, train_ratio=0.6, validation_ratio=0.2)

    train_repos = {repository_key(row) for row in split.train}
    validation_repos = {repository_key(row) for row in split.validation}
    test_repos = {repository_key(row) for row in split.test}

    # No repository may appear in more than one partition.
    assert not (train_repos & validation_repos)
    assert not (train_repos & test_repos)
    assert not (validation_repos & test_repos)
    # Every partition is non-empty and every row of a repository stays together.
    assert train_repos and validation_repos and test_repos
    assert len(split.train) + len(split.validation) + len(split.test) == len(rows)
    for repo in train_repos:
        assert sum(1 for row in rows if repository_key(row) == repo) == sum(
            1 for row in split.train if repository_key(row) == repo
        )
