from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime
import hashlib
import json
from pathlib import Path
from typing import Any, Sequence

from app.training.datasets import load_snapshots_from_uri
from app.training.pipeline import TrainingRunConfig, TrainingRunResult, run_training_pipeline


DEFAULT_MODELS = [
    "logistic-regression-full-history",
    "xgboost-full-history",
    "logistic-regression-cold-start",
    "xgboost-cold-start",
    "neural-net-full-history",
    "neural-net-cold-start",
]


@dataclass(slots=True)
class ArtifactExportConfig:
    dataset_path: str | Path = Path("tmp/training/snapshots.json")
    runs_dir: str | Path = Path("tmp/training/runs")
    latest_run_path: str | Path | None = None
    model_names: Sequence[str] | None = None
    train_ratio: float = 0.75
    validation_ratio: float = 0.15
    calibration_bins: int = 10
    force: bool = False
    verbose: bool = True


@dataclass(slots=True)
class ArtifactExportPlan:
    dataset_path: Path
    runs_dir: Path
    latest_run_path: Path
    raw_snapshots: list[dict[str, Any]]
    snapshots: list[Any]
    dataset_hash: str
    model_names: list[str]
    existing_runs: list[dict[str, Any]]


def load_raw_snapshot_items(dataset_path: Path) -> list[dict[str, Any]]:
    if not dataset_path.exists():
        raise FileNotFoundError(f"dataset path does not exist: {dataset_path}")
    if dataset_path.suffix.lower() == ".jsonl":
        return [json.loads(line) for line in dataset_path.read_text(encoding="utf-8").splitlines() if line.strip()]
    payload = json.loads(dataset_path.read_text(encoding="utf-8"))
    items = payload if isinstance(payload, list) else payload.get("snapshots", [])
    if not isinstance(items, list):
        raise ValueError("dataset must contain a snapshot array")
    return items


def _omit_none(value: dict[str, Any]) -> dict[str, Any]:
    return {key: item for key, item in value.items() if item is not None}


def _go_scorecard_check(raw: dict[str, Any]) -> dict[str, Any]:
    return {
        "name": str(raw.get("name", "")),
        "score": float(raw.get("score", 0)),
        "reason": str(raw.get("reason", "")),
    }


def _go_scorecard(raw: dict[str, Any]) -> dict[str, Any]:
    score = raw.get("score")
    return _omit_none(
        {
            "score": None if score is None else float(score),
            "checks": [_go_scorecard_check(item) for item in raw.get("checks", [])],
        }
    )


def _go_repository(raw: dict[str, Any]) -> dict[str, Any]:
    optional_ints = {
        "last_push_age_days": raw.get("last_push_age_days"),
        "last_release_age_days": raw.get("last_release_age_days"),
        "release_cadence_days": raw.get("release_cadence_days"),
        "recent_contributors_90d": raw.get("recent_contributors_90d"),
    }
    optional_floats = {
        "contributor_concentration": raw.get("contributor_concentration"),
        "open_issue_growth_90d": raw.get("open_issue_growth_90d"),
        "pr_response_median_days": raw.get("pr_response_median_days"),
    }
    return _omit_none(
        {
            "full_name": str(raw.get("full_name", "")),
            "url": str(raw.get("url", "")),
            "default_branch": str(raw.get("default_branch", "")),
            "archived": bool(raw.get("archived", False)),
            "stars": int(raw.get("stars", 0)),
            "forks": int(raw.get("forks", 0)),
            "open_issues": int(raw.get("open_issues", 0)),
            **{key: None if value is None else int(value) for key, value in optional_ints.items()},
            **{key: None if value is None else float(value) for key, value in optional_floats.items()},
        }
    )


def _go_dependency(raw: dict[str, Any]) -> dict[str, Any]:
    repository = raw.get("repository")
    scorecard = raw.get("scorecard")
    historical_features = raw.get("historical_features") or {}
    return _omit_none(
        {
            "dependency_id": str(raw.get("dependency_id", "")),
            "package_name": str(raw.get("package_name", "")),
            "package_version": str(raw.get("package_version", "")),
            "ecosystem": str(raw.get("ecosystem", "")),
            "direct": bool(raw.get("direct", False)),
            "repository": _go_repository(repository) if isinstance(repository, dict) else None,
            "scorecard": _go_scorecard(scorecard) if isinstance(scorecard, dict) else None,
            "historical_features": {key: float(historical_features[key]) for key in sorted(historical_features)}
            if historical_features
            else None,
        }
    )


def _go_snapshot(raw: dict[str, Any]) -> dict[str, Any]:
    label = raw.get("label_inactive_12m")
    return _omit_none(
        {
            "analysis_id": str(raw.get("analysis_id", "")),
            "observed_at": str(raw.get("observed_at", "")),
            "dependency": _go_dependency(raw.get("dependency", {})),
            "label_inactive_12m": None if label is None else bool(label),
        }
    )


def compute_go_dataset_hash(raw_snapshots: list[dict[str, Any]]) -> str:
    normalized = [_go_snapshot(item) for item in raw_snapshots]
    payload = json.dumps(normalized, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _camel_dataset_summary(summary: Any | None) -> dict[str, Any] | None:
    if summary is None:
        return None
    return {
        "totalRows": summary.total_rows,
        "labeledRows": summary.labeled_rows,
        "unlabeledRows": summary.unlabeled_rows,
        **({"earliestObservedAt": summary.earliest_observed_at} if summary.earliest_observed_at else {}),
        **({"latestObservedAt": summary.latest_observed_at} if summary.latest_observed_at else {}),
        "featureNames": list(summary.feature_names),
    }


def _camel_split_summary(summary: Any | None) -> dict[str, Any] | None:
    if summary is None:
        return None
    return {
        "trainRows": summary.train_rows,
        "validationRows": summary.validation_rows,
        "testRows": summary.test_rows,
    }


def _camel_metrics(metrics: Any | None) -> dict[str, Any] | None:
    if metrics is None:
        return None
    return {
        "threshold": metrics.threshold,
        "sampleCount": metrics.sample_count,
        "positiveRate": metrics.positive_rate,
        "accuracy": metrics.accuracy,
        "precision": metrics.precision,
        "recall": metrics.recall,
        "f1Score": metrics.f1_score,
        "brierScore": metrics.brier_score,
        "logLoss": metrics.log_loss,
        "rocAuc": metrics.roc_auc,
        "expectedCalibrationError": metrics.expected_calibration_error,
        "qualityScore": metrics.model_quality_score,
    }


def _camel_calibration_bin(bin_summary: Any) -> dict[str, Any]:
    return {
        "lowerBound": bin_summary.lower_bound,
        "upperBound": bin_summary.upper_bound,
        "count": bin_summary.count,
        "averagePrediction": bin_summary.average_prediction,
        "empiricalRate": bin_summary.empirical_rate,
    }


def _camel_feature_importance(item: Any) -> dict[str, Any]:
    return {
        "feature": item.feature,
        "gain": item.gain,
        "importance": item.importance,
    }


def _camel_model_artifact(artifact: Any | None) -> dict[str, Any] | None:
    if artifact is None:
        return None
    payload: dict[str, Any] = {
        "modelName": artifact.model_name,
        "modelVersion": artifact.model_version,
        "featureVersion": artifact.feature_version,
        "trainedAt": artifact.trained_at,
        "threshold": artifact.threshold,
        "algorithm": artifact.algorithm,
        "featureNames": list(artifact.feature_names),
        "calibrationBins": [_camel_calibration_bin(item) for item in artifact.calibration_bins],
    }
    if artifact.algorithm == "logistic_regression":
        payload.update(
            {
                "coefficients": list(artifact.coefficients),
                "intercept": artifact.intercept,
                "standardization": {
                    "means": list(artifact.standardization.means),
                    "scales": list(artifact.standardization.scales),
                },
            }
        )
    elif artifact.algorithm == "neural_net":
        payload.update(
            {
                "hiddenSizes": list(artifact.hidden_sizes),
                "weights": [list(layer) for layer in artifact.weights],
                "biases": [list(layer) for layer in artifact.biases],
                "means": list(artifact.means),
                "scales": list(artifact.scales),
            }
        )
    else:
        payload.update(
            {
                "boosterJson": artifact.booster_json,
                "treeCount": artifact.tree_count,
                "maxDepth": artifact.max_depth,
                "learningRate": artifact.learning_rate,
                "objective": artifact.objective,
                "xgboostVersion": artifact.xgboost_version,
                "featureImportances": [_camel_feature_importance(item) for item in artifact.feature_importances],
            }
        )
    return payload


def quality_score(run: dict[str, Any]) -> float:
    metrics = run.get("metrics") or {}
    return float(metrics.get("qualityScore", -1))


def best_run(runs: Sequence[dict[str, Any]]) -> dict[str, Any]:
    if not runs:
        raise ValueError("no model artifacts were produced")
    return sorted(runs, key=quality_score, reverse=True)[0]


def run_file_name(cached_at: str, model_name: str, dataset_hash: str) -> str:
    stamp = cached_at.replace("+00:00", "Z").replace("-", "").replace(":", "")
    stamp = stamp.replace(".", "")
    short_hash = dataset_hash[:12] if dataset_hash else "adhoc"
    return f"{stamp}-{model_name}-{short_hash}.json"


def to_run_artifact(
    result: TrainingRunResult,
    *,
    dataset_path: Path,
    dataset_hash: str,
    artifact_path: Path,
    cached_at: str,
) -> dict[str, Any]:
    if result.status != "completed" or result.artifact is None or result.metrics is None or result.split_summary is None:
        raise ValueError(result.note or f"{result.model_name} did not produce a completed artifact")
    if min(result.split_summary.train_rows, result.split_summary.validation_rows, result.split_summary.test_rows) <= 0:
        raise ValueError(f"{result.model_name} produced an empty train, validation, or test split")
    return _omit_none(
        {
            "datasetPath": str(dataset_path),
            "datasetHash": dataset_hash,
            "artifactPath": str(artifact_path),
            "cachedAt": cached_at,
            "status": result.status,
            "modelName": result.model_name,
            "modelVersion": result.model_version,
            "trainedAt": result.trained_at,
            "datasetSummary": _camel_dataset_summary(result.dataset_summary),
            "splitSummary": _camel_split_summary(result.split_summary),
            "metrics": _camel_metrics(result.metrics),
            "calibrationBins": [_camel_calibration_bin(item) for item in result.calibration_bins],
            "modelArtifact": _camel_model_artifact(result.artifact),
            "message": result.note,
        }
    )


def read_existing_runs(runs_dir: Path) -> list[dict[str, Any]]:
    if not runs_dir.exists():
        return []
    runs: list[dict[str, Any]] = []
    for path in sorted(runs_dir.glob("*.json")):
        runs.append(json.loads(path.read_text(encoding="utf-8")))
    return runs


def existing_run_for_model(runs: list[dict[str, Any]], dataset_hash: str, model_name: str) -> dict[str, Any] | None:
    for run in reversed(runs):
        if run.get("status") == "completed" and run.get("datasetHash") == dataset_hash and run.get("modelName") == model_name:
            return run
    return None


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def requested_model_names(model_names: Sequence[str] | None) -> list[str]:
    requested = list(model_names or ["all"])
    return list(DEFAULT_MODELS) if "all" in requested else requested


def prepare_artifact_export(config: ArtifactExportConfig) -> ArtifactExportPlan:
    dataset_path = Path(config.dataset_path)
    runs_dir = Path(config.runs_dir)
    latest_path = Path(config.latest_run_path) if config.latest_run_path else runs_dir.parent / "latest-run.json"
    raw_snapshots = load_raw_snapshot_items(dataset_path)
    snapshots = load_snapshots_from_uri(str(dataset_path))
    if not any(snapshot.label_inactive_12m is not None for snapshot in snapshots):
        raise ValueError("training snapshots contain no labels; build the historical dataset first")

    return ArtifactExportPlan(
        dataset_path=dataset_path,
        runs_dir=runs_dir,
        latest_run_path=latest_path,
        raw_snapshots=raw_snapshots,
        snapshots=snapshots,
        dataset_hash=compute_go_dataset_hash(raw_snapshots),
        model_names=requested_model_names(config.model_names),
        existing_runs=read_existing_runs(runs_dir),
    )


def build_artifact_runs(config: ArtifactExportConfig, plan: ArtifactExportPlan | None = None) -> list[dict[str, Any]]:
    export_plan = plan or prepare_artifact_export(config)
    selected_runs: list[dict[str, Any]] = []

    for model_name in export_plan.model_names:
        cached = None if config.force else existing_run_for_model(export_plan.existing_runs, export_plan.dataset_hash, model_name)
        if cached is not None:
            selected_runs.append(cached)
            if config.verbose:
                print(f"reuse {model_name}: {cached.get('artifactPath')}")
            continue

        result = run_training_pipeline(
            TrainingRunConfig(
                snapshots=export_plan.snapshots,
                algorithm=model_name,
                train_ratio=config.train_ratio,
                validation_ratio=config.validation_ratio,
                calibration_bins=config.calibration_bins,
            )
        )
        cached_at = datetime.now(UTC).isoformat()
        artifact_path = export_plan.runs_dir / run_file_name(cached_at, result.model_name, export_plan.dataset_hash)
        run = to_run_artifact(
            result,
            dataset_path=export_plan.dataset_path,
            dataset_hash=export_plan.dataset_hash,
            artifact_path=artifact_path,
            cached_at=cached_at,
        )
        selected_runs.append(run)
        if config.verbose:
            print(f"trained {model_name}: {artifact_path}")

    if len({run.get("modelName") for run in selected_runs}) != len(export_plan.model_names):
        raise ValueError("offline training did not produce the requested model artifact set")
    return selected_runs


def write_artifact_bundle(runs: Sequence[dict[str, Any]], latest_run_path: str | Path) -> dict[str, Any]:
    for run in runs:
        artifact_path_value = str(run.get("artifactPath", "")).strip()
        if not artifact_path_value:
            raise ValueError(f"{run.get('modelName', 'model')} is missing artifactPath")
        artifact_path = Path(artifact_path_value)
        write_json(artifact_path, dict(run))

    latest = best_run(runs)
    write_json(Path(latest_run_path), dict(latest))
    return dict(latest)


def train_artifacts(config: ArtifactExportConfig) -> list[dict[str, Any]]:
    plan = prepare_artifact_export(config)
    runs = build_artifact_runs(config, plan)
    latest = write_artifact_bundle(runs, plan.latest_run_path)
    if config.verbose:
        print(f"latest artifact: {plan.latest_run_path}")
        print(f"latest model: {latest.get('modelName')} {latest.get('modelVersion')}")
    return runs
