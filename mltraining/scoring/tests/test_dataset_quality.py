from datetime import UTC, datetime

from app.training.dataset_quality import (
    summarize_feature_missingness,
    summarize_label_balance,
    summarize_row_accounting,
)
from app.training.datasets import DatasetBundle, TrainingRow


def _raw_item(label, ecosystem, tier, *, archived_at_obs=0.0, signals=None):
    return {
        "label_inactive_12m": label,
        "dependency": {
            "ecosystem": ecosystem,
            "historical_features": {"repo_archived_at_obs": archived_at_obs},
        },
        "sampling": {"popularity_tier": tier},
        "label_components": {"missing_label_signals": signals or []},
    }


def _raw_items():
    return [
        _raw_item(True, "npm", "high", signals=["repo_silent_before_horizon"]),
        _raw_item(False, "npm", "high"),
        _raw_item(True, "pypi", "low", archived_at_obs=1.0),
        _raw_item(None, "pypi", "low", signals=["future_window_incomplete"]),
    ]


def test_summarize_row_accounting_counts_labels_and_signals() -> None:
    summary = summarize_row_accounting(_raw_items())

    assert summary["total_rows"] == 4
    assert summary["labeled_rows"] == 3
    assert summary["unlabeled_rows"] == 1
    assert summary["inactive_rows"] == 2
    assert summary["active_rows"] == 1
    assert summary["already_archived_at_observation"] == 1
    assert summary["pre_archival_rows"] == 3
    assert summary["future_window_incomplete"] == 1
    assert summary["repo_silent_before_horizon"] == 1
    assert summary["rows_with_completeness_signals"] == 4


def test_summarize_row_accounting_flags_missing_label_components() -> None:
    raw_items = [
        {"label_inactive_12m": True, "dependency": {"ecosystem": "npm", "historical_features": {}}},
        {"label_inactive_12m": False, "dependency": {"ecosystem": "npm", "historical_features": {}}},
    ]

    summary = summarize_row_accounting(raw_items)

    assert summary["rows_with_completeness_signals"] == 0
    assert summary["future_window_incomplete"] == 0


def test_summarize_label_balance_groups_by_key() -> None:
    rows = summarize_label_balance(
        _raw_items(),
        key_fn=lambda item: item["dependency"]["ecosystem"],
        key_name="ecosystem",
    )

    by_ecosystem = {row["ecosystem"]: row for row in rows}
    assert by_ecosystem["npm"]["labeled"] == 2
    assert by_ecosystem["npm"]["inactive"] == 1
    assert by_ecosystem["npm"]["inactive_rate"] == 0.5
    assert by_ecosystem["pypi"]["labeled"] == 1
    assert by_ecosystem["pypi"]["unlabeled"] == 1


def test_summarize_feature_missingness_uses_tracked_signals() -> None:
    feature_names = ["commits_90d", "pr_response_median_days"]
    rows = [
        TrainingRow(
            analysis_id="a1",
            dependency_id="d1",
            package_name="p1",
            package_version="1.0.0",
            ecosystem="npm",
            observed_at=datetime(2024, 1, 1, tzinfo=UTC),
            label_inactive_12m=1,
            missing_signals=["pr_response_median_days"],
            feature_values={"commits_90d": 0.0, "pr_response_median_days": 0.0},
        ),
        TrainingRow(
            analysis_id="a2",
            dependency_id="d2",
            package_name="p2",
            package_version="1.0.0",
            ecosystem="npm",
            observed_at=datetime(2024, 4, 1, tzinfo=UTC),
            label_inactive_12m=0,
            missing_signals=[],
            feature_values={"commits_90d": 3.0, "pr_response_median_days": 1.0},
        ),
    ]
    dataset = DatasetBundle(rows=rows, feature_names=feature_names)

    summary = {entry["feature"]: entry for entry in summarize_feature_missingness(dataset)}

    assert summary["pr_response_median_days"]["missing_rows"] == 1
    assert summary["pr_response_median_days"]["missing_rate"] == 0.5
    assert summary["commits_90d"]["missing_rows"] == 0
