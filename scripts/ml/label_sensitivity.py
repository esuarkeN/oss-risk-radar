"""Label-definition sensitivity analysis for the inactivity label.

Re-labels every snapshot of the staged dataset under k-of-four variants of the
maintenance rule (Section 4.3 of the thesis), re-trains the full-history XGBoost
model per variant on the identical time-aware split, and reports the model
against the trivial baselines on identical rows.

The recency rule (days since last human commit) is undefined for repositories
with no observable commit history, so the model is reported both on the full
test slice and re-scored on the recency-defined rows; only the latter supports a
like-for-like comparison against that baseline.

Before training anything the script re-derives the primary (k=2) labels from the
stored future-window signals and requires them to match the exported
`label_inactive_12m` on every snapshot. A mismatch means this harness does not
implement the same rule as the dataset builder, and the run aborts.

Usage (from the repository root):

    cd mltraining/scoring
    PYTHONPATH=. python ../../scripts/ml/label_sensitivity.py

Optional: pass a dataset path as the first argument to analyse a different
export. Defaults to the staged bundle under deployment/training.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

from app.training.artifact_export import load_raw_snapshot_items
from app.training.pipeline import TrainingRunConfig, run_training_pipeline

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATASET = REPO_ROOT / "deployment" / "training" / "snapshots.json"

# The four future-window activity checks and their thresholds (Section 4.3).
CHECKS: tuple[tuple[str, int], ...] = (
    ("future_active_commit_months_12m", 3),
    ("future_contributors_12m", 2),
    ("future_releases_12m", 1),
    ("future_merged_prs_12m", 2),
)
PRIMARY_K = 2
VARIANTS = {1: "1-of-4 (permissive)", 2: "2-of-4 (primary)", 3: "3-of-4 (strict)"}

# Trivial single-signal rules: feature name and the sign that orients the raw
# value so that a higher score means higher predicted inactivity risk.
RECENCY = ("days_since_last_commit", 1.0)
COMMIT_VOLUME = ("commits_365d", -1.0)


def is_maintained(components: dict, k: int) -> bool:
    """Apply the k-of-four maintenance rule to one snapshot's stored signals."""
    if components.get("archived_by_t_plus_12m"):
        return False
    met = sum(1 for name, cutoff in CHECKS if (components.get(name) or 0) >= cutoff)
    return met >= k


def rank_auc(scores: list[float], labels: list[int]) -> float:
    """ROC-AUC as the Mann-Whitney statistic, ties counted as one half."""
    paired = sorted(zip(scores, labels))
    ranks = [0.0] * len(paired)
    i = 0
    while i < len(paired):
        j = i
        while j + 1 < len(paired) and paired[j + 1][0] == paired[i][0]:
            j += 1
        average = (i + j) / 2.0 + 1.0
        for position in range(i, j + 1):
            ranks[position] = average
        i = j + 1
    positives = sum(labels)
    negatives = len(labels) - positives
    if positives == 0 or negatives == 0:
        return float("nan")
    rank_sum = sum(rank for rank, (_, label) in zip(ranks, paired) if label == 1)
    return (rank_sum - positives * (positives + 1) / 2.0) / (positives * negatives)


def verify_primary_labels(raw: list[dict]) -> None:
    mismatches = sum(
        1
        for row in raw
        if row.get("label_inactive_12m") is not None
        and (not is_maintained(row.get("label_components") or {}, PRIMARY_K))
        != bool(row["label_inactive_12m"])
    )
    print(f"primary-label check: {mismatches} mismatch(es) over {len(raw)} snapshots")
    if mismatches:
        raise SystemExit(
            "re-derived primary labels disagree with the exported label; "
            "this harness does not match the dataset builder"
        )


def main() -> None:
    dataset = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else DEFAULT_DATASET
    raw = load_raw_snapshot_items(dataset)
    print(f"dataset: {dataset}")
    print(f"loaded {len(raw)} snapshots")
    verify_primary_labels(raw)

    header = (
        f"\n{'rule':<20}{'inactive':>10}{'model(all)':>12}{'model(rec)':>12}"
        f"{'recency':>10}{'volume':>10}{'best':>10}{'margin':>9}"
    )
    print(header)
    for k, name in VARIANTS.items():
        relabelled = []
        for row in raw:
            copy = dict(row)
            if copy.get("label_inactive_12m") is not None:
                copy["label_inactive_12m"] = not is_maintained(
                    copy.get("label_components") or {}, k
                )
            relabelled.append(copy)

        holdout = run_training_pipeline(
            TrainingRunConfig(
                snapshots=relabelled,
                algorithm="xgboost",
                feature_regime="full-history",
            )
        ).holdout
        rows, predictions, labels = holdout.rows, holdout.predictions, holdout.labels

        defined = [
            i
            for i, row in enumerate(rows)
            if not math.isnan(float(row.feature_values[RECENCY[0]]))
        ]
        take = lambda values: [values[i] for i in defined]  # noqa: E731
        signal = lambda spec: [  # noqa: E731
            spec[1] * float(rows[i].feature_values[spec[0]]) for i in defined
        ]

        sub_labels = take(labels)
        model_all = rank_auc(predictions, labels)
        model_rec = rank_auc(take(predictions), sub_labels)
        recency = rank_auc(signal(RECENCY), sub_labels)
        volume = rank_auc(signal(COMMIT_VOLUME), sub_labels)
        best = max(recency, volume)

        print(
            f"{name:<20}{sum(labels) / len(labels):>10.3f}{model_all:>12.4f}"
            f"{model_rec:>12.4f}{recency:>10.4f}{volume:>10.4f}{best:>10.4f}"
            f"{model_rec - best:>+9.4f}"
        )
    print(
        f"\nrows: {len(labels)} test, {len(defined)} recency-defined. "
        "model(rec), recency, volume, best and margin are on the recency-defined rows."
    )


if __name__ == "__main__":
    main()
