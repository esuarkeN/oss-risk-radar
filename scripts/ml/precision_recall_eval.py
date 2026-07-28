"""Average precision (PR-AUC) on the held-out test set and the active-at-t subgroup.

Companion to ``label_sensitivity.py``. Reruns the reported training configuration
to obtain per-row held-out predictions, then scores those predictions under
precision-recall metrics. The output records both the rerun and staged ROC-AUC
because small environment-dependent differences can remain.

The learned model and the two trivial baselines are always compared on an
identical row set. Average precision is computed with the step-wise estimator
used by ``sklearn.metrics.average_precision_score`` (no interpolation), with
tied scores collapsed into a single threshold so that a baseline with many ties
is neither rewarded nor punished for them.

Run from the repository root:

    python scripts/ml/precision_recall_eval.py
"""

from __future__ import annotations

import json
import random
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "mltraining" / "scoring"))

from app.training.pipeline import TrainingRunConfig, run_training_pipeline  # noqa: E402

DATASET_PATH = REPO_ROOT / "deployment" / "training" / "snapshots.json"
STAGED_RUN_PATH = REPO_ROOT / "deployment" / "training" / "latest-run.json"
MODEL_NAME = "xgboost-full-history"
TRAIN_RATIO = 0.75
VALIDATION_RATIO = 0.15
CALIBRATION_BINS = 10
BOOTSTRAP_SAMPLES = 2000
BOOTSTRAP_SEED = 42


def average_precision(scores: list[float], labels: list[int]) -> float:
    """Step-wise average precision, ties collapsed into one threshold."""
    positives = sum(labels)
    if positives == 0 or positives == len(labels):
        return float("nan")

    order = sorted(range(len(scores)), key=lambda i: -scores[i])
    total_tp = 0
    total_fp = 0
    previous_recall = 0.0
    result = 0.0
    index = 0
    while index < len(order):
        end = index
        while end + 1 < len(order) and scores[order[end + 1]] == scores[order[index]]:
            end += 1
        for position in range(index, end + 1):
            if labels[order[position]] == 1:
                total_tp += 1
            else:
                total_fp += 1
        recall = total_tp / positives
        precision = total_tp / (total_tp + total_fp)
        result += (recall - previous_recall) * precision
        previous_recall = recall
        index = end + 1
    return result


def roc_auc(scores: list[float], labels: list[int]) -> float:
    """Rank-based ROC-AUC with mid-ranks for ties (Mann-Whitney form)."""
    paired = sorted(zip(scores, labels))
    ranks = [0.0] * len(paired)
    index = 0
    while index < len(paired):
        end = index
        while end + 1 < len(paired) and paired[end + 1][0] == paired[index][0]:
            end += 1
        average_rank = (index + end) / 2.0 + 1.0
        for position in range(index, end + 1):
            ranks[position] = average_rank
        index = end + 1
    positives = sum(label for _, label in paired)
    negatives = len(paired) - positives
    if positives == 0 or negatives == 0:
        return float("nan")
    rank_sum = sum(rank for rank, (_, label) in zip(ranks, paired) if label == 1)
    return (rank_sum - positives * (positives + 1) / 2.0) / (positives * negatives)


def feature(row, name: str) -> float:
    return float(row.feature_values[name])


def defined(row, name: str) -> bool:
    value = row.feature_values.get(name)
    return value is not None and value == value  # NaN check


def main() -> None:
    result = run_training_pipeline(
        TrainingRunConfig(
            dataset_path=str(DATASET_PATH),
            algorithm=MODEL_NAME,
            train_ratio=TRAIN_RATIO,
            validation_ratio=VALIDATION_RATIO,
            calibration_bins=CALIBRATION_BINS,
        )
    )
    holdout = result.holdout
    if holdout is None or not holdout.rows:
        raise SystemExit("expected held-out predictions")

    # Consistency check 1: the re-analysis must reproduce this run's held-out ROC-AUC,
    # so the per-row predictions belong to the same execution as its aggregate metrics.
    reproduced = roc_auc(list(holdout.predictions), list(holdout.labels))
    if abs(reproduced - result.metrics.roc_auc) > 1e-6:
        raise SystemExit(f"re-scored AUROC {reproduced} != this run's {result.metrics.roc_auc}")

    # Consistency check 2: that run should in turn reproduce the *staged* artifact's
    # ROC-AUC. Check 1 alone is self-referential and would pass even if the dataset or
    # the model had drifted away from the figures reported in the thesis. Gradient
    # boosting is not bit-identical across library versions, so a mismatch here is
    # reported rather than fatal: the figures stay internally consistent, but they are
    # no longer the staged model's and the deviation must be disclosed.
    staged = json.loads(STAGED_RUN_PATH.read_text(encoding="utf-8"))
    staged_auc = staged["metrics"]["rocAuc"]
    if staged["modelName"] != MODEL_NAME:
        raise SystemExit(f"staged run is {staged['modelName']}, expected {MODEL_NAME}")
    deviation = result.metrics.roc_auc - staged_auc
    if abs(deviation) > 1e-6:
        print(
            f"WARNING: this rerun's ROC-AUC {result.metrics.roc_auc} deviates from the staged "
            f"artifact's {staged_auc} by {deviation:+.6f}. The figures below are NOT the staged "
            "model's and must not be reported alongside it without disclosing this.",
            file=sys.stderr,
        )

    report: dict[str, object] = {
        "model": MODEL_NAME,
        "dataset": str(DATASET_PATH.relative_to(REPO_ROOT)),
        "rerun_roc_auc": round(result.metrics.roc_auc, 6),
        "staged_roc_auc": round(staged_auc, 6),
        "delta_from_staged_roc_auc": round(deviation, 6),
        "bootstrap_samples": BOOTSTRAP_SAMPLES,
        "bootstrap_seed": BOOTSTRAP_SEED,
        "subsets": {},
    }

    subsets = {
        "full_test": list(range(len(holdout.rows))),
        "active_at_t": [i for i, row in enumerate(holdout.rows) if feature(row, "commits_90d") > 0],
    }

    for subset_name, indices in subsets.items():
        rows = [holdout.rows[i] for i in indices]
        labels = [holdout.labels[i] for i in indices]

        # Restrict to rows where every arm has a defined score, so the learned model
        # and the trivial rules are compared on one identical row set.
        keep = [
            position
            for position, row in enumerate(rows)
            if defined(row, "days_since_last_commit") and defined(row, "commits_365d")
        ]
        rows = [rows[p] for p in keep]
        labels = [labels[p] for p in keep]
        arms = {
            "model": [holdout.predictions[indices[p]] for p in keep],
            "recency": [feature(row, "days_since_last_commit") for row in rows],
            "commit_volume": [-feature(row, "commits_365d") for row in rows],
        }

        prevalence = sum(labels) / len(labels)
        point = {
            name: {
                "average_precision": round(average_precision(scores, labels), 6),
                "roc_auc": round(roc_auc(scores, labels), 6),
            }
            for name, scores in arms.items()
        }

        rng = random.Random(BOOTSTRAP_SEED)
        draws: dict[str, list[float]] = {name: [] for name in arms}
        differences: dict[str, list[float]] = {"model_minus_recency": [], "model_minus_commit_volume": []}
        count = len(labels)
        for _ in range(BOOTSTRAP_SAMPLES):
            sample = [rng.randrange(count) for _ in range(count)]
            sample_labels = [labels[i] for i in sample]
            if sum(sample_labels) == 0 or sum(sample_labels) == count:
                continue
            values = {}
            for name, scores in arms.items():
                values[name] = average_precision([scores[i] for i in sample], sample_labels)
                draws[name].append(values[name])
            differences["model_minus_recency"].append(values["model"] - values["recency"])
            differences["model_minus_commit_volume"].append(values["model"] - values["commit_volume"])

        def interval(values: list[float]) -> list[float]:
            ordered = sorted(values)
            low = ordered[int(0.025 * len(ordered))]
            high = ordered[int(0.975 * len(ordered)) - 1]
            return [round(low, 6), round(high, 6)]

        report["subsets"][subset_name] = {
            "n": count,
            "n_dropped_undefined": len(indices) - count,
            "prevalence_no_skill_ap": round(prevalence, 6),
            "point_estimates": point,
            "average_precision_ci95": {name: interval(values) for name, values in draws.items()},
            "difference_ci95": {name: interval(values) for name, values in differences.items()},
            "difference_point": {
                "model_minus_recency": round(
                    point["model"]["average_precision"] - point["recency"]["average_precision"], 6
                ),
                "model_minus_commit_volume": round(
                    point["model"]["average_precision"] - point["commit_volume"]["average_precision"], 6
                ),
            },
        }

    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
