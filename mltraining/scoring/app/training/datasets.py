from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
import json
from pathlib import Path

from app.modeling.features import FEATURE_NAMES, build_feature_row
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
    heuristic_reference_score: float
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


def build_dataset(snapshots: list[TrainingSnapshotInput]) -> DatasetBundle:
    rows: list[TrainingRow] = []
    for snapshot in snapshots:
        feature_row = build_feature_row(snapshot.dependency, observed_at=snapshot.observed_at)
        rows.append(
            TrainingRow(
                analysis_id=snapshot.analysis_id,
                dependency_id=snapshot.dependency.dependency_id,
                package_name=snapshot.dependency.package_name,
                package_version=snapshot.dependency.package_version,
                ecosystem=snapshot.dependency.ecosystem,
                observed_at=parse_observed_at(snapshot.observed_at),
                label_inactive_12m=None if snapshot.label_inactive_12m is None else int(snapshot.label_inactive_12m),
                heuristic_reference_score=feature_row.heuristic_reference_score,
                missing_signals=feature_row.missing_signals,
                feature_values=feature_row.feature_values,
            )
        )

    rows.sort(key=lambda row: row.observed_at)
    return DatasetBundle(rows=rows, feature_names=list(FEATURE_NAMES))


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


def time_aware_split(rows: list[TrainingRow], train_ratio: float = 0.7, validation_ratio: float = 0.15) -> DatasetSplit:
    if len(rows) < 3:
        raise ValueError("at least three labeled rows are required for time-aware train/validation/test splits")

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


def rows_to_matrix(rows: list[TrainingRow], feature_names: list[str]) -> tuple[list[list[float]], list[int]]:
    matrix = [[float(row.feature_values[name]) for name in feature_names] for row in rows]
    labels = [int(row.label_inactive_12m or 0) for row in rows]
    return matrix, labels
