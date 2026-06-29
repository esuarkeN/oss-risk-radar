from __future__ import annotations

from collections import Counter
from typing import Any, Callable

from app.training.datasets import DatasetBundle


def _historical_features(item: dict[str, Any]) -> dict[str, Any]:
    dependency = item.get("dependency") or {}
    features = dependency.get("historical_features")
    return features if isinstance(features, dict) else {}


def _label_signals(item: dict[str, Any]) -> list[str]:
    components = item.get("label_components") or {}
    signals = components.get("missing_label_signals")
    return list(signals) if isinstance(signals, list) else []


def _is_already_archived_at_observation(item: dict[str, Any]) -> bool:
    return float(_historical_features(item).get("repo_archived_at_obs", 0) or 0) >= 1.0


def summarize_row_accounting(raw_items: list[dict[str, Any]]) -> dict[str, Any]:
    """Headline dataset accounting from raw exported snapshot rows.

    Reports the total / labeled / unlabeled split, the label balance, and the
    completeness signals that explain why rows are kept or dropped. The
    ``repo_silent_before_horizon`` count quantifies how many rows the dataset-wide
    coverage-horizon gate keeps labelable that a per-repository last-event gate would
    have dropped.
    """
    total = len(raw_items)
    labeled = sum(1 for item in raw_items if item.get("label_inactive_12m") is not None)
    inactive = sum(1 for item in raw_items if item.get("label_inactive_12m") is True)
    active = sum(1 for item in raw_items if item.get("label_inactive_12m") is False)
    already_archived = sum(1 for item in raw_items if _is_already_archived_at_observation(item))
    archived_by_horizon = sum(
        1 for item in raw_items if (item.get("label_components") or {}).get("archived_by_t_plus_12m")
    )

    signal_counter: Counter[str] = Counter()
    rows_with_components = 0
    for item in raw_items:
        if isinstance(item.get("label_components"), dict):
            rows_with_components += 1
        signal_counter.update(_label_signals(item))

    return {
        "total_rows": total,
        "labeled_rows": labeled,
        "unlabeled_rows": total - labeled,
        "inactive_rows": inactive,
        "active_rows": active,
        "inactive_rate": round(inactive / labeled, 6) if labeled else 0.0,
        "already_archived_at_observation": already_archived,
        "pre_archival_rows": total - already_archived,
        "archived_by_t_plus_12m": archived_by_horizon,
        "future_window_incomplete": signal_counter.get("future_window_incomplete", 0),
        "repo_silent_before_horizon": signal_counter.get("repo_silent_before_horizon", 0),
        "archived_timestamp_unavailable": signal_counter.get("archived_timestamp_unavailable", 0),
        # When 0, the export predates label-component recording and the signal counts above
        # are "not recorded" rather than genuinely zero; rebuild the dataset to populate them.
        "rows_with_completeness_signals": rows_with_components,
    }


def summarize_label_balance(
    raw_items: list[dict[str, Any]],
    key_fn: Callable[[dict[str, Any]], Any],
    key_name: str,
) -> list[dict[str, Any]]:
    """Label balance per slice (e.g. ecosystem, popularity tier, seed source)."""
    groups: dict[str, dict[str, int]] = {}
    for item in raw_items:
        key = str(key_fn(item))
        bucket = groups.setdefault(key, {"inactive": 0, "active": 0, "unlabeled": 0})
        label = item.get("label_inactive_12m")
        if label is True:
            bucket["inactive"] += 1
        elif label is False:
            bucket["active"] += 1
        else:
            bucket["unlabeled"] += 1

    rows: list[dict[str, Any]] = []
    for key in sorted(groups):
        bucket = groups[key]
        labeled = bucket["inactive"] + bucket["active"]
        rows.append(
            {
                key_name: key,
                "labeled": labeled,
                "inactive": bucket["inactive"],
                "active": bucket["active"],
                "unlabeled": bucket["unlabeled"],
                "inactive_rate": round(bucket["inactive"] / labeled, 6) if labeled else 0.0,
            }
        )
    return rows


def summarize_feature_missingness(dataset: DatasetBundle, *, labeled_only: bool = True) -> list[dict[str, Any]]:
    """Per-feature missingness over the dataset rows.

    Uses the ``missing_signals`` already tracked during feature extraction, so a feature
    counts as missing when the underlying observation-time signal was unavailable rather
    than genuinely zero. Returned rows are sorted by descending missing rate.
    """
    rows = [
        row for row in dataset.rows if not labeled_only or row.label_inactive_12m is not None
    ]
    total = len(rows)
    counts: Counter[str] = Counter()
    for row in rows:
        counts.update(set(row.missing_signals))

    summary = [
        {
            "feature": name,
            "missing_rows": counts.get(name, 0),
            "missing_rate": round(counts.get(name, 0) / total, 6) if total else 0.0,
        }
        for name in dataset.feature_names
    ]
    summary.sort(key=lambda entry: (entry["missing_rate"], entry["feature"]), reverse=True)
    return summary
