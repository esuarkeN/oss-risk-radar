# Historical Dataset Builder

OSS Risk Radar now includes a historical dataset builder for the thesis use case: predict whether an OSS repository will still be maintained 12 months after an observation date.

The builder lives in `mltraining/scoring/app/training/maintenance_dataset` and is designed to feed the existing training flow instead of replacing it.

## Current training contract

- The existing trainer already consumes snapshot JSON or JSONL through `TrainingSnapshotInput`.
- The default backend dataset path is `tmp/training/snapshots.json`.
- The dataset builder writes inspectable intermediate JSONL tables plus a final `training_snapshots.json` export in that same snapshot shape.
- The snapshot export now supports an optional `historical_features` map so richer observation-time features survive into the training pipeline unchanged.

## Data flow

1. Load package or repository candidates from a CSV, JSON, or JSONL seed file.
2. Stratify and sample candidates by ecosystem and popularity tier.
3. Resolve repository mappings from explicit seed fields when present, otherwise through deps.dev with registry metadata as a fallback.
4. Enrich repository metadata through GitHub for stable fields such as `created_at`, `default_branch`, and `fork`.
5. Parse GH Archive event files or URLs into normalized repository histories.
6. Build quarterly observation snapshots.
7. Derive observation-time feature rows using only history at or before `t`.
8. Derive `maintained_12m` labels using only the future window `(t, t + 12 months]`.
9. Export the final snapshot dataset for the existing model trainer.

## Source adapters

- `GHArchiveAdapter`: reads local `.json`, `.jsonl`, `.ndjson`, and `.gz` archives, or remote archive URLs, and normalizes GitHub events into commits, issues, PRs, releases, stars, and forks.
- `DepsDevAdapter`: resolves package versions to source repositories and captures dependency-count metadata when the version endpoint provides it.
- `GitHubRepositoryAdapter`: enriches stable repository metadata such as creation time, default branch, and fork state.
- `NpmRegistryAdapter` and `PyPIRegistryAdapter`: capture historical package version publish times and repository URLs from package metadata.

## Intermediate tables

The builder writes these inspectable files under the chosen output directory:

- `repositories.jsonl`
- `packages.jsonl`
- `package_repository_links.jsonl`
- `observation_snapshots.jsonl`
- `snapshot_features.jsonl`
- `snapshot_labels.jsonl`
- `training_snapshots.json`

## Label definition

Each exported row still uses the existing training label name `label_inactive_12m`, but the builder first computes:

- `maintained_12m`
- `future_active_commit_months_12m`
- `future_contributors_12m`
- `future_releases_12m`
- `future_merged_prs_12m`
- `archived_by_t_plus_12m`

Baseline rule:

- `maintained_12m = 1` if the repository is not archived or deleted by `t + 12 months`
- and at least two of these future-window checks pass:
  - human commits occurred in at least 3 distinct months
  - at least 2 contributors were active
  - at least 1 release or package version publish occurred
  - at least 2 merged PRs occurred

The merged-PR clause is a practical proxy for the broader "merged PRs or maintainer responses" concept because GH Archive does not reliably identify maintainer responses without additional issue-comment attribution logic.

## Leakage prevention

- Observation-time features are derived only from timestamps `<= t`.
- Labels are derived only from timestamps in `(t, t + 12 months]`.
- If GH Archive coverage does not extend through the full future window, the row remains unlabeled.
- GitHub live enrichment is limited to stable repository metadata. Historical stars, forks, issues, PRs, and releases are not taken from current API totals.

## Feature notes

The first builder slice computes the requested activity, contributor, issue, PR, release, popularity, and risk features, but a few columns remain practical proxies:

- `stars_total_at_obs` and `forks_total_at_obs` are cumulative GH Archive event counts across the archive coverage you provide. If your archive window starts after the repo was created, those counts are lower-bound proxies.
- `direct_dependents_count_at_obs` and `ecosystem_download_tier_at_obs` are written as missing/zero unless you extend the pipeline with a true point-in-time source. The current builder avoids leaking present-day counts into older observations.
- `issue_backlog_growth_90d` and `pr_response_median_days` are pragmatic CHAOSS-style proxies derived from GH Archive state reconstruction, not canonical CHAOSS metrics.

## Running it

Example using the repo-level helper:

```powershell
npm run ml:dataset -- build-all `
  --seed-file .\tmp\seed-packages.csv `
  --gharchive-source .\tmp\gharchive `
  --output-dir .\tmp\training\oss-maintenance `
  --observation-start 2023-01-01 `
  --observation-end 2024-01-01 `
  --training-output-path .\tmp\training\snapshots.json
```

The `npm run ml:dataset` helper runs the builder inside the `scoring` Docker image with the repo mounted into `/workspace`, so it does not depend on a local Python installation.

If you want the full path in one command, including training and cached model artifacts:

```powershell
npm run ml:bootstrap -- `
  --seed-file .\tmp\seed-packages.csv `
  --gharchive-source .\tmp\gharchive `
  --output-dir .\tmp\training\oss-maintenance `
  --training-output-path .\tmp\training\snapshots.json
```

That command:

- prepares the seed file if needed
- builds the historical dataset
- triggers the existing training API
- verifies that `tmp/training/runs/*.json` and `tmp/training/latest-run.json` were written

Seed file columns:

- required: `ecosystem`, `package_name`
- optional: `package_version`, `popularity_tier`, `downloads_30d`, `direct_dependents_count`, `source`, `repository_url`, `repository_full_name`

For repository-first foundation runs, use `ecosystem=github` plus `repository_url` and `repository_full_name`. The builder now treats those as first-class candidates instead of trying to resolve them back through package registries.

To generate a basic repository foundation seed from the GitHub Search API:

```powershell
npm run ml:seed:foundation -- `
  --target-repositories 2000 `
  --github-token $env:GITHUB_TOKEN `
  --output-file .\tmp\training\foundation-seed.csv
```

To build and train from that seed in one pass:

```powershell
npm run ml:bootstrap -- `
  --generate-foundation-seed `
  --foundation-target-repositories 2000 `
  --github-token $env:GITHUB_TOKEN `
  --gharchive-source .\tmp\gharchive `
  --output-dir .\tmp\training\oss-maintenance `
  --training-output-path .\tmp\training\snapshots.json
```

When `--generate-foundation-seed` is enabled, the repo helper now enforces:

- at least the requested number of unique repositories in the exported dataset
- at least a small inactive-repository floor in the labeled export
- non-empty validation and test slices during bootstrap
- a non-zero inactive 12m rate in the evaluation slice

## Connecting to the existing trainer

You have two straightforward options:

1. Export directly to `tmp/training/snapshots.json` and let the existing backend training flow use it.
2. Export to another path and point the backend to it through `TRAINING_DATASET_PATH`.

No frontend or training-API redesign is required.
