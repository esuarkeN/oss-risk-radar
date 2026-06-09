# Historical Dataset Builder

OSS Risk Radar now includes a historical dataset builder for the thesis use case: predict whether an OSS repository will still be maintained 12 months after an observation date.

The builder lives in `mltraining/scoring/app/training/maintenance_dataset` and is designed to feed the existing training flow instead of replacing it.

## Current training contract

- The existing trainer already consumes snapshot JSON or JSONL through `TrainingSnapshotInput`.
- The default backend dataset path is `tmp/training/snapshots.json`.
- Training requires labeled real-project snapshots. Runtime analysis captures without `label_inactive_12m` are not enough to train a model, and labeled rows must include a GitHub repository identity.
- The dataset builder writes inspectable intermediate JSONL tables plus a final `training_snapshots.json` export in that same snapshot shape.
- When the final export path already exists, the builder merges into it by `analysis_id`, `dependency_id`, and `observed_at`, so newly built repositories expand the current training base instead of replacing it.
- The snapshot export now supports an optional `historical_features` map so richer observation-time features survive into the training pipeline and runtime scoring unchanged.
- The builder also writes `repository-feature-cache.json` for runtime lookup. Daily GH Archive downloads should refresh this cache offline; live API requests must not scan archive files.

The project intentionally does not ship a fake training corpus. For thesis-grade claims, build the dataset from real repositories and real historical observations, then train only from that exported snapshot file.

For the GH Archive coverage plan, filtered downloader commands, and continuous retraining policy, see `docs/methodology/training-operations.md`.

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
- `repository-feature-cache.json`

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
- `direct_dependents_count_at_obs` and `ecosystem_download_tier_at_obs` are intentionally omitted from the v3 model feature sets until a true point-in-time source exists.
- `issue_backlog_growth_90d` and `pr_response_median_days` are pragmatic CHAOSS-style proxies derived from GH Archive state reconstruction, not canonical CHAOSS metrics.
- `issue_first_response_median_days_365d`, `issue_resolution_median_days_365d`, `stale_issue_share_at_obs`, and `pr_merge_latency_median_days_365d` are v3 derived features used to make responsiveness and backlog pressure explicit.
- `repo_archived_at_obs` is retained as diagnostic metadata but excluded from the predictive feature vectors. Already-archived observation rows are filtered out during model fitting so archived repositories contribute pre-archival timelines rather than shortcut labels.

## Running it

Example using the repo-level helper:

```powershell
npm run ml:dataset -- build-all `
  --seed-file .\tmp\seed-packages.csv `
  --gharchive-source .\tmp\gharchive `
  --output-dir .\tmp\training\oss-maintenance `
  --observation-start 2023-01-01 `
  --training-output-path .\tmp\training\snapshots.json
```

When the GHArchive source is a local directory, the helper infers the latest safe observation end from complete local daily coverage. Pass `--observation-end` only when you want to pin a specific end date; the helper will reject dates whose 12 month label horizon is not covered. The default runner uses the `scoring` Docker image; add `--runner local` to use the active Python 3.14 environment.

If you want the full path in one command, including training and cached model artifacts:

```powershell
npm run ml:bootstrap -- `
  --seed-file .\tmp\seed-packages.csv `
  --gharchive-source .\tmp\gharchive `
  --output-dir .\tmp\training\oss-maintenance `
  --training-output-path .\tmp\training\snapshots.json `
  --feature-cache-output-path .\tmp\training\repository-feature-cache.json
```

That command:

- prepares the seed file if needed
- builds the historical dataset
- merges the exported historical rows into `tmp/training/snapshots.json`
- writes `tmp/training/repository-feature-cache.json` for runtime feature lookup
- executes the notebook-primary Logistic Regression and XGBoost artifact workflow
- verifies that `tmp/training/runs/*.json` and `tmp/training/latest-run.json` were written

Seed file columns:

- required: `ecosystem`, `package_name`
- optional: `package_version`, `popularity_tier`, `downloads_30d`, `direct_dependents_count`, `source`, `repository_url`, `repository_full_name`

For repository-first foundation runs, use `ecosystem=github` plus `repository_url` and `repository_full_name`. The builder now treats those as first-class candidates instead of trying to resolve them back through package registries.

To generate the thesis repository foundation seed from the GitHub Search API:

```powershell
npm run ml:seed:foundation -- `
  --target-repositories 5000 `
  --github-token $env:GITHUB_TOKEN `
  --output-file .\tmp\training\foundation-seed.csv
```

The generator writes `tmp/training/foundation-seed.metadata.json` with the search strata, targets, license filter, and bucket counts. The default sampling frame is public, non-fork GitHub repositories with a license object, stratified across active, dormant, and archived seed buckets. Those buckets are sampling provenance only; they are not the label.

A repository from the archived seed bucket can still contribute earlier active or pre-archival snapshots. The main model is trained from rows before the outcome, with `label_inactive_12m` describing whether inactivity or archival happens in the following 12 months.

To build and train from that seed in one pass:

```powershell
npm run ml:bootstrap:foundation -- `
  --github-token $env:GITHUB_TOKEN `
  --gharchive-source .\tmp\gharchive `
  --output-dir .\tmp\training\oss-maintenance `
  --training-output-path .\tmp\training\snapshots.json
```

The plain `npm run ml:bootstrap -- --gharchive-source ...` path intentionally remains a small starter run for local smoke tests. Use `ml:bootstrap:foundation` for the thesis/training base because it asks the GitHub Search API for a broad active, dormant, and archived repository mix. The default foundation seed is intentionally inactive-heavy: about 45% active repositories and 55% dormant or archived repositories before sampling.

When `--generate-foundation-seed` is enabled, the repo helper now enforces:

- at least the requested number of unique repositories in the exported dataset
- at least a 20% inactive-repository floor in the labeled export
- non-empty validation and test slices during bootstrap
- a non-zero inactive 12m rate in the evaluation slice

Training uses a 75/15/10 time-aware split by default. The model fits only on the earliest training slice, calibrates on the following validation slice, and reports AUROC, Brier score, and a combined quality score only on the final held-out test slice. The combined quality score normalizes AUROC into ranking skill above random and combines it with Brier skill against the label-rate baseline. `notebooks/oss-maintenance-training.ipynb` is now both the interactive thesis workflow and the headless artifact export path used by `npm run ml:train`.

## Connecting to the existing trainer

You have two straightforward options:

1. Export directly to `tmp/training/snapshots.json` and run `npm run ml:train`.
2. Export to another path and pass it to `npm run ml:train -- --dataset-path <path>`.

No frontend or training-API redesign is required.
