from datetime import UTC, datetime, timedelta

from app.schemas.score import TrainingSnapshotInput
from app.training.datasets import build_dataset, time_aware_split


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
