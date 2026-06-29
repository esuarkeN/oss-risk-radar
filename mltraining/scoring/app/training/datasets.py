from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
import json
from pathlib import Path

from app.modeling.features import feature_names_for_regime, build_feature_row
from app.schemas.score import DatasetSummary, TrainingSnapshotInput


@dataclass(slots=True)
class TrainingRow:
    analysis_id: str
    dependency_id: str
    package_name: str
    package_version: str
    ecosystem: str
    observed_at: datetime
    label_inactive_12m: int | None
    missing_signals: list[str]
    feature_values: dict[str, float]


@dataclass(slots=True)
class DatasetBundle:
    rows: list[TrainingRow]
    feature_names: list[str]


@dataclass(slots=True)
class DatasetSplit:
    train: list[TrainingRow]
    validation: list[TrainingRow]
    test: list[TrainingRow]


def parse_observed_at(value: str) -> datetime:
    normalized = value.replace("Z", "+00:00")
    parsed = datetime.fromisoformat(normalized)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=UTC)
    return parsed.astimezone(UTC)


def load_snapshots_from_uri(dataset_uri: str) -> list[TrainingSnapshotInput]:
    path = Path(dataset_uri)
    if not path.exists():
        raise FileNotFoundError(f"dataset path does not exist: {dataset_uri}")

    suffix = path.suffix.lower()
    if suffix == ".json":
        payload = json.loads(path.read_text(encoding="utf-8"))
        items = payload if isinstance(payload, list) else payload.get("snapshots", [])
    elif suffix == ".jsonl":
        items = [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
    else:
        raise ValueError("dataset_uri must point to a .json or .jsonl snapshot file")

    return [TrainingSnapshotInput.model_validate(item) for item in items]


def snapshot_already_archived_at_observation(snapshot: TrainingSnapshotInput) -> bool:
    historical_value = snapshot.dependency.historical_features.get("repo_archived_at_obs")
    if historical_value is not None:
        return float(historical_value) >= 1.0
    repository = snapshot.dependency.repository
    return bool(repository is not None and repository.archived)


def build_dataset(
    snapshots: list[TrainingSnapshotInput],
    *,
    feature_regime: str | None = None,
    exclude_already_archived_at_observation: bool = False,
) -> DatasetBundle:
    feature_names = feature_names_for_regime(feature_regime)
    rows: list[TrainingRow] = []
    for snapshot in snapshots:
        if exclude_already_archived_at_observation and snapshot_already_archived_at_observation(snapshot):
            continue
        feature_row = build_feature_row(
            snapshot.dependency,
            observed_at=snapshot.observed_at,
            feature_names=feature_names,
        )
        rows.append(
            TrainingRow(
                analysis_id=snapshot.analysis_id,
                dependency_id=snapshot.dependency.dependency_id,
                package_name=snapshot.dependency.package_name,
                package_version=snapshot.dependency.package_version,
                ecosystem=snapshot.dependency.ecosystem,
                observed_at=parse_observed_at(snapshot.observed_at),
                label_inactive_12m=None if snapshot.label_inactive_12m is None else int(snapshot.label_inactive_12m),
                missing_signals=feature_row.missing_signals,
                feature_values=feature_row.feature_values,
            )
        )

    rows.sort(key=lambda row: row.observed_at)
    return DatasetBundle(rows=rows, feature_names=list(feature_names))


def summarize_dataset(dataset: DatasetBundle) -> DatasetSummary:
    if not dataset.rows:
        return DatasetSummary(total_rows=0, labeled_rows=0, unlabeled_rows=0, feature_names=list(dataset.feature_names))

    labeled_rows = sum(1 for row in dataset.rows if row.label_inactive_12m is not None)
    return DatasetSummary(
        total_rows=len(dataset.rows),
        labeled_rows=labeled_rows,
        unlabeled_rows=len(dataset.rows) - labeled_rows,
        earliest_observed_at=dataset.rows[0].observed_at.isoformat(),
        latest_observed_at=dataset.rows[-1].observed_at.isoformat(),
        feature_names=list(dataset.feature_names),
    )


def labeled_rows(rows: list[TrainingRow]) -> list[TrainingRow]:
    return [row for row in rows if row.label_inactive_12m is not None]


def time_aware_split(rows: list[TrainingRow], train_ratio: float = 0.75, validation_ratio: float = 0.15) -> DatasetSplit:
    if len(rows) < 3:
        raise ValueError("at least three labeled rows are required for time-aware train/validation/test splits")
    if train_ratio <= 0 or validation_ratio <= 0 or train_ratio + validation_ratio >= 1:
        raise ValueError("train_ratio and validation_ratio must be positive and leave room for a test split")

    ordered = sorted(rows, key=lambda row: row.observed_at)
    count = len(ordered)
    train_count = max(1, min(count - 2, int(round(count * train_ratio))))
    validation_count = max(1, min(count - train_count - 1, int(round(count * validation_ratio))))
    test_count = count - train_count - validation_count

    if test_count < 1:
        if train_count > validation_count:
            train_count -= 1
        else:
            validation_count -= 1
        test_count = count - train_count - validation_count

    validation_end = train_count + validation_count
    return DatasetSplit(
        train=ordered[:train_count],
        validation=ordered[train_count:validation_end],
        test=ordered[validation_end:],
    )


def repository_key(row: TrainingRow) -> str:
    """Stable repository identifier for a training row.

    Dataset snapshot identities are ``"{repository_id}:{observation_date}"``, so stripping the
    trailing observation date recovers the repository. Rows whose identity does not follow that
    shape fall back to their full identity and form their own group.
    """
    return row.dependency_id.rsplit(":", 1)[0]


def grouped_time_aware_split(
    rows: list[TrainingRow],
    train_ratio: float = 0.75,
    validation_ratio: float = 0.15,
    *,
    key_fn=repository_key,
) -> DatasetSplit:
    """Repository-disjoint train/validation/test split.

    Every snapshot of a given repository is assigned to exactly one partition, so the held-out
    set measures generalization to unseen repositories rather than to future observations of
    repositories already seen in training. Groups are ordered by their latest observation date
    (with the repository key as a deterministic tie-breaker), which keeps the split time-aware
    when observation times vary and deterministic when they do not. Partition sizes target the
    same row ratios as the temporal split.
    """
    if len(rows) < 3:
        raise ValueError("at least three labeled rows are required for a grouped split")
    if train_ratio <= 0 or validation_ratio <= 0 or train_ratio + validation_ratio >= 1:
        raise ValueError("train_ratio and validation_ratio must be positive and leave room for a test split")

    groups: dict[str, list[TrainingRow]] = {}
    for row in rows:
        groups.setdefault(key_fn(row), []).append(row)
    if len(groups) < 3:
        raise ValueError("at least three repository groups are required for a grouped split")

    ordered_keys = sorted(groups, key=lambda key: (max(row.observed_at for row in groups[key]), key))
    total = len(rows)
    group_count = len(ordered_keys)

    train: list[TrainingRow] = []
    validation: list[TrainingRow] = []
    test: list[TrainingRow] = []
    cumulative = 0
    for index, key in enumerate(ordered_keys):
        group_rows = sorted(groups[key], key=lambda row: row.observed_at)
        remaining_groups = group_count - index
        fraction = cumulative / total
        if fraction < train_ratio and remaining_groups > 2:
            train.extend(group_rows)
        elif fraction < train_ratio + validation_ratio and remaining_groups > 1:
            validation.extend(group_rows)
        else:
            test.extend(group_rows)
        cumulative += len(group_rows)

    return DatasetSplit(
        train=sorted(train, key=lambda row: row.observed_at),
        validation=sorted(validation, key=lambda row: row.observed_at),
        test=sorted(test, key=lambda row: row.observed_at),
    )


def rows_to_matrix(rows: list[TrainingRow], feature_names: list[str]) -> tuple[list[list[float]], list[int]]:
    matrix = [[float(row.feature_values[name]) for name in feature_names] for row in rows]
    labels = [int(row.label_inactive_12m or 0) for row in rows]
    return matrix, labels
