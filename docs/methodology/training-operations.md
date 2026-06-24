# Training Operations

This note captures the practical plan for keeping the Logistic Regression and XGBoost artifact path usable. Runtime analysis is model-artifact-only: the fixed offline artifact bundle is required configuration, and missing artifacts should stop scoring instead of producing substitute scores.

## What Can Train

Training requires labeled real-project snapshots. A repository URL or GitHub `owner/repo` name is useful because it identifies the project, but it is not a supervised label by itself.

For the current inactivity model, each usable row needs:

- observation-time features built only from data available at the observation date
- `label_inactive_12m`
- a GitHub repository identity
- enough historical coverage to know what happened during the following 12 months

This is why plain analysis captures and GitHub links in `snapshots.json` are not enough. They help build the dataset, but the labels must come from historical activity after each observation date.

Archived and dormant repositories are included intentionally because their earlier timelines show the warning signals before maintenance stops. The seed bucket is not the label. Rows where the repository is already archived at observation time are kept for diagnostics and excluded from the main predictive fit; archival inside `(t, t + 12 months]` is an outcome component of `label_inactive_12m`.

## GH Archive Coverage

Do not train from sparse random GH Archive hours. Absence of activity is meaningful only when the label window has complete enough coverage. If an hour was never processed, "no event" could mean "no activity" or "missing data", and the inactive label becomes unreliable.

For the current default thesis workflow, feature lookback starts two years before the first observation and labels use a 12 month future window. The JS dataset helper now inspects local `--gharchive-source` directories, finds dates with all 24 hourly files, and infers the latest cadence-aligned observation date whose future label window is covered. If `--observation-end` is passed explicitly, the helper validates that the requested end date is labelable and fails if local coverage is too short.

## Filtered Download

The repository has a seed-focused downloader at `scripts/download-gharchive-seed-filtered.ps1`. It streams hourly GH Archive files, keeps only events for repositories in the generated thesis seed, and writes coverage manifests. For the 5,000-repository thesis corpus, keep the long-run outputs under `tmp/training-foundation` and `tmp/gharchive-foundation` so the smaller local smoke corpus remains untouched.

Downloader modes:

- default mode resumes cheaply and skips filtered hourly files that already exist
- `-ForceRefilter` rebuilds existing filtered files for the current seed
- `-AugmentExisting` merges newly matched events into existing filtered files, useful after expanding the seed
- `-KeepRaw` keeps the downloaded full GH Archive hour under the raw cache directory so future re-filtering does not need to re-download that hour
- `-ShardCount` and `-ShardIndex` split the hourly range across multiple workers

When expanding the seed after a long run, use `-AugmentExisting` or `-ForceRefilter`. A normal resume will skip existing filtered files and will not add events for newly added repositories.

For a faster run, use the parallel wrapper. Four workers is a reasonable starting point on a normal connection:

```powershell
.\scripts\download-gharchive-seed-filtered-parallel.ps1 `
  -Workers 4 `
  -SeedPath ".\tmp\training-foundation\foundation-seed.csv" `
  -OutDir ".\tmp\gharchive-foundation" `
  -SeedCoveragePath ".\tmp\training-foundation\gharchive-seed-coverage.csv" `
  -KeepRaw `
  -Start "2021-01-01"
```

The wrapper writes per-shard coverage files, waits for all workers, then merges them into `tmp/gharchive-foundation/_coverage.csv` and `tmp/training-foundation/gharchive-seed-coverage.csv`. It preserves existing coverage rows from earlier runs unless a worker reports a newer status for the same hour.

Smoke test a tiny range first:

```powershell
.\scripts\download-gharchive-seed-filtered.ps1 `
  -SeedPath ".\tmp\training-foundation\foundation-seed.csv" `
  -OutDir ".\tmp\gharchive-smoke" `
  -Start "2023-01-01" `
  -EndExclusive "2023-01-04"

node scripts/ml/bootstrap-training.mjs --seed-file ".\tmp\training-foundation\foundation-seed.csv" --gharchive-source ".\tmp\gharchive-smoke"
```

The smoke run is expected to validate the pipeline shape, not produce thesis-grade model quality.

For the real run:

```powershell
.\scripts\download-gharchive-seed-filtered.ps1 `
  -SeedPath ".\tmp\training-foundation\foundation-seed.csv" `
  -OutDir ".\tmp\gharchive-foundation" `
  -SeedCoveragePath ".\tmp\training-foundation\gharchive-seed-coverage.csv" `
  -KeepRaw `
  -Start "2021-01-01"

node scripts/ml/bootstrap-training.mjs `
  --seed-file ".\tmp\training-foundation\foundation-seed.csv" `
  --gharchive-source ".\tmp\gharchive-foundation" `
  --output-dir ".\tmp\training-foundation\candidate\oss-maintenance" `
  --training-output-path ".\tmp\training-foundation\candidate\snapshots.json" `
  --feature-cache-output-path ".\tmp\training-foundation\candidate\repository-feature-cache.json" `
  --sample-limit-per-ecosystem 5000 `
  --minimum-repositories 5000 `
  --minimum-inactive-repositories 1000 `
  --replace-training-output `
  --force `
  --runner local
```

By default, the downloader stops at the current local date, so it downloads through yesterday. Pass `-EndExclusive` only when you want to pin or backfill a specific range. The dataset helper will still use only complete local days for label-safe observation windows.

Useful coverage checks:

```powershell
Import-Csv ".\tmp\gharchive-foundation\_coverage.csv" |
  Group-Object status |
  Select-Object Name, Count

Import-Csv ".\tmp\training-foundation\gharchive-seed-coverage.csv" |
  Sort-Object {[int]$_.matched_events} |
  Select-Object -First 20
```

If coverage has download or filter failures, fix or rerun those hours before trusting inactive labels.

## Offline Artifact Policy

Continuous or API-triggered training is intentionally out of scope for the current thesis/demo version. A submitted GitHub URL identifies a repository, but it does not provide a reliable inactive/active label. Labels come from historical GH Archive coverage after each observation date.

Recommended workflow:

1. Generate the 5,000-repository foundation seed with active, dormant, and archived strata, `stars >= 100`, `fork:false`, and a required license.
2. Download filtered GH Archive events for that seed set.
3. Build labeled historical snapshots.
4. Use `notebooks/oss-maintenance-training.ipynb` as the six-step ML workflow and artifact export surface.
5. Run the foundation bootstrap against preserved local inputs to build a separate candidate and execute dataset engineering plus artifact export through the notebook.
6. Run `npm run ml:stage-training -- --source-dir tmp/training-foundation/candidate --minimum-repositories 5000 --minimum-inactive-repositories 1000` to compare all four candidate models with `deployment/training` and promote only when every AUROC drop and Brier increase is at most 0.02.

The dataset build also writes `tmp/training/repository-feature-cache.json`. Production uses that staged cache to choose the full-history artifact family and feed GHArchive-derived historical features into live repository scoring. Repositories without a cache row use the separate cold-start artifact family trained only on current GitHub/API-style snapshot features. Daily GH Archive downloads should update the offline cache directly; request-time scoring must not download or scan archive files.

The production scorer should use staged model artifacts and the staged repository feature cache when available. Missing artifacts, artifact load failures, or insufficient labeled data are configuration or training readiness errors, not alternate runtime scoring modes.

The GH Archive parser uses pushes, issues, PRs, releases/tags, stars, forks, issue comments, PR reviews, and PR review comments. Comments and reviews improve PR response-time features when those events are present in the filtered files.

## Promotion Guardrails

Before a training run becomes the cached/latest model, require at least:

- labeled real-project rows
- both active and inactive classes
- non-empty train, validation, and test slices
- held-out metrics for Logistic Regression and XGBoost in both full-history and cold-start regimes
- `feature-set-v3-full-history` and `feature-set-v3-cold-start` model artifacts
- acceptable AUROC, Brier score, and calibration behavior
- no unexpected spike in missing features or failed repository resolution

For thesis reporting, keep every offline artifact under `tmp/training/runs` or the configured runs directory, and record which artifact was promoted.

## Operational Rule Of Thumb

Use user URLs only as candidates for a future training corpus. Use GH Archive coverage to create labels. Use the notebook-primary artifact workflow to train Logistic Regression and XGBoost. Promote a valid artifact bundle before enabling runtime scoring.
