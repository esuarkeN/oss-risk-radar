from __future__ import annotations

import argparse
from datetime import UTC, datetime

from app.training.maintenance_dataset.pipeline import DatasetBuildConfig, DatasetBuilder, PipelineAdapters


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build historical OSS maintenance training datasets.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    for command in ("ingest", "build-snapshots", "build-labels", "export", "build-all"):
        current = subparsers.add_parser(command)
        _add_shared_arguments(current)
        if command in {"ingest", "build-all"}:
            current.add_argument("--seed-file", required=True, help="CSV/JSON/JSONL candidate package or repository seed file.")
        if command in {"build-snapshots", "build-labels", "build-all"}:
            current.add_argument("--gharchive-source", action="append", default=[], help="Local GH Archive file/dir or remote archive URL. Repeatable.")

    return parser.parse_args()


def _add_shared_arguments(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--output-dir", required=True, help="Directory for intermediate JSONL tables and final dataset export.")
    parser.add_argument("--observation-start", default="2023-01-01", help="Observation range start date in YYYY-MM-DD format.")
    parser.add_argument("--observation-end", default="2024-01-01", help="Observation range end date in YYYY-MM-DD format.")
    parser.add_argument("--observation-interval-months", type=int, default=3, help="Observation cadence in months.")
    parser.add_argument("--label-horizon-months", type=int, default=12, help="Future label horizon in months.")
    parser.add_argument("--sample-limit-per-ecosystem", type=int, default=24, help="Deterministic sample limit for each ecosystem.")
    parser.add_argument("--sample-seed", type=int, default=42, help="Deterministic seed for package sampling.")
    parser.add_argument("--training-output-path", default=None, help="Optional final snapshot JSON path. Defaults under output-dir.")
    parser.add_argument("--github-token", default=None, help="GitHub token for repository metadata enrichment.")
    parser.add_argument("--include-forks", action="store_true", help="Keep forked repositories in the sampled candidate set.")


def _parse_date(value: str) -> datetime:
    return datetime.fromisoformat(value).replace(tzinfo=UTC)


def main() -> int:
    args = parse_args()
    config = DatasetBuildConfig(
        seed_file=getattr(args, "seed_file", ""),
        output_dir=args.output_dir,
        gharchive_sources=list(getattr(args, "gharchive_source", [])),
        observation_start=_parse_date(args.observation_start),
        observation_end=_parse_date(args.observation_end),
        observation_interval_months=args.observation_interval_months,
        label_horizon_months=args.label_horizon_months,
        sample_limit_per_ecosystem=args.sample_limit_per_ecosystem,
        sample_seed=args.sample_seed,
        include_forks=args.include_forks,
        training_output_path=args.training_output_path,
    )
    builder = DatasetBuilder(config=config, adapters=PipelineAdapters.live(github_token=args.github_token))

    if args.command == "ingest":
        result = builder.ingest_candidates()
    elif args.command == "build-snapshots":
        result = builder.build_snapshots()
    elif args.command == "build-labels":
        result = builder.build_labels()
    elif args.command == "export":
        result = builder.export_training_dataset()
    else:
        result = builder.build_all()

    for key, value in result.items():
        print(f"{key}: {value}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
