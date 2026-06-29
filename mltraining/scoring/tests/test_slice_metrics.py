from dataclasses import dataclass

from app.training.evaluation import compute_sliced_metrics


@dataclass
class Row:
    tier: str
    active: bool


def test_compute_sliced_metrics_partitions_and_scores() -> None:
    rows = [
        Row("high", True),
        Row("high", True),
        Row("low", False),
        Row("low", False),
    ]
    # high slice has both classes; low slice is single-class (all inactive).
    predictions = [0.9, 0.2, 0.8, 0.1]
    labels = [1, 0, 1, 1]

    summary = {entry["slice"]: entry for entry in compute_sliced_metrics(
        rows, predictions, labels, key_fn=lambda row: row.tier
    )}

    assert summary["high"]["n"] == 2
    assert summary["high"]["positive_rate"] == 0.5
    assert summary["high"]["roc_auc"] is not None
    # Single-class slice: ROC-AUC undefined, reported as None, Brier still reported.
    assert summary["low"]["n"] == 2
    assert summary["low"]["positive_rate"] == 1.0
    assert summary["low"]["roc_auc"] is None
    assert summary["low"]["brier_score"] is not None


def test_compute_sliced_metrics_rejects_length_mismatch() -> None:
    rows = [Row("high", True)]
    try:
        compute_sliced_metrics(rows, [0.5, 0.5], [1], key_fn=lambda row: row.tier)
    except ValueError:
        return
    raise AssertionError("expected ValueError on length mismatch")
