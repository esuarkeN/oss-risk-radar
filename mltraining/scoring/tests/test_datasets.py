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
