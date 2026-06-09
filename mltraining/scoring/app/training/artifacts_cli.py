from __future__ import annotations

import argparse
from typing import Any

from app.training.artifact_export import (
    DEFAULT_MODELS,
    ArtifactExportConfig,
    build_artifact_runs,
    compute_go_dataset_hash,
    load_raw_snapshot_items,
    prepare_artifact_export,
    train_artifacts,
    write_artifact_bundle,
)

COMPATIBILITY_MODEL_ALIASES = ["logistic-regression-baseline", "xgboost-baseline"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train fixed OSS Risk Radar model artifacts offline.")
    parser.add_argument("--dataset-path", default="tmp/training/snapshots.json")
    parser.add_argument("--runs-dir", default="tmp/training/runs")
    parser.add_argument("--latest-run-path", default="")
    parser.add_argument("--model-name", action="append", choices=[*DEFAULT_MODELS, *COMPATIBILITY_MODEL_ALIASES, "all"], default=[])
    parser.add_argument("--train-ratio", type=float, default=0.75)
    parser.add_argument("--validation-ratio", type=float, default=0.15)
    parser.add_argument("--calibration-bins", type=int, default=10)
    parser.add_argument("--force", action="store_true")
    return parser.parse_args()


def config_from_args(args: argparse.Namespace) -> ArtifactExportConfig:
    return ArtifactExportConfig(
        dataset_path=args.dataset_path,
        runs_dir=args.runs_dir,
        latest_run_path=args.latest_run_path or None,
        model_names=args.model_name,
        train_ratio=args.train_ratio,
        validation_ratio=args.validation_ratio,
        calibration_bins=args.calibration_bins,
        force=args.force,
    )


def train_models(args: argparse.Namespace) -> list[dict[str, Any]]:
    return train_artifacts(config_from_args(args))


def main() -> None:
    train_models(parse_args())


if __name__ == "__main__":
    main()


__all__ = [
    "DEFAULT_MODELS",
    "ArtifactExportConfig",
    "build_artifact_runs",
    "compute_go_dataset_hash",
    "config_from_args",
    "load_raw_snapshot_items",
    "parse_args",
    "prepare_artifact_export",
    "train_artifacts",
    "train_models",
    "write_artifact_bundle",
]
