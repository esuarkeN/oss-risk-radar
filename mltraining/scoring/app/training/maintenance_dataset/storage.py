from __future__ import annotations

from csv import DictReader
import json
from pathlib import Path
from typing import Any, Callable, Iterable, TypeVar

from app.training.maintenance_dataset.entities import PackageCandidate, dataclass_to_dict


T = TypeVar("T")


def ensure_directory(path: Path) -> None:
    path.mkdir(parents=True, exist_ok=True)


def write_jsonl(path: Path, rows: Iterable[Any]) -> None:
    ensure_directory(path.parent)
    with path.open("w", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(dataclass_to_dict(row), sort_keys=True))
            handle.write("\n")


def write_json(path: Path, payload: Any) -> None:
    ensure_directory(path.parent)
    path.write_text(json.dumps(dataclass_to_dict(payload), indent=2, sort_keys=True), encoding="utf-8")


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def read_jsonl(path: Path, factory: Callable[[dict[str, Any]], T] | None = None) -> list[T] | list[dict[str, Any]]:
    rows: list[Any] = []
    with path.open("r", encoding="utf-8") as handle:
        for line in handle:
            if not line.strip():
                continue
            payload = json.loads(line)
            rows.append(factory(payload) if factory else payload)
    return rows


def load_package_candidates(path: Path) -> list[PackageCandidate]:
    suffix = path.suffix.lower()
    if suffix == ".csv":
        return _load_package_candidates_from_csv(path)
    if suffix == ".json":
        payload = read_json(path)
        items = payload if isinstance(payload, list) else payload.get("candidates", [])
        return [_package_candidate_from_dict(item) for item in items]
    if suffix == ".jsonl":
        return [item for item in read_jsonl(path, _package_candidate_from_dict)]
    raise ValueError("seed candidate input must be a .csv, .json, or .jsonl file")


def _load_package_candidates_from_csv(path: Path) -> list[PackageCandidate]:
    rows: list[PackageCandidate] = []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = DictReader(handle)
        for row in reader:
            rows.append(_package_candidate_from_dict(row))
    return rows


def _package_candidate_from_dict(payload: dict[str, Any]) -> PackageCandidate:
    direct_dependents_count = _int_or_none(payload.get("direct_dependents_count"))
    downloads_30d = _int_or_none(payload.get("downloads_30d"))
    package_version = _string_or_none(payload.get("package_version"))
    popularity_tier = _string_or_none(payload.get("popularity_tier"))
    repository_url = _string_or_none(payload.get("repository_url"))
    repository_full_name = _string_or_none(payload.get("repository_full_name"))
    source = _string_or_none(payload.get("source")) or "seed"
    return PackageCandidate(
        ecosystem=str(payload.get("ecosystem", "")).strip(),
        package_name=str(payload.get("package_name", "")).strip(),
        package_version=package_version,
        repository_url=repository_url,
        repository_full_name=repository_full_name,
        direct_dependents_count=direct_dependents_count,
        downloads_30d=downloads_30d,
        popularity_tier=popularity_tier,
        source=source,
    )


def _int_or_none(value: Any) -> int | None:
    if value in (None, "", "null"):
        return None
    return int(value)


def _string_or_none(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None
