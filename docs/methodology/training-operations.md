# Training Operations

This note captures the practical plan for keeping the Logistic Regression and XGBoost training path usable. Runtime analysis can still fall back to heuristic scoring when no model artifact exists, but the thesis workflow should treat that as a temporary operational state, not the target behavior.

## What Can Train

Training requires labeled real-project snapshots. A repository URL or GitHub `owner/repo` name is useful because it identifies the project, but it is not a supervised label by itself.

For the current inactivity model, each usable row needs:

- observation-time features built only from data available at the observation date
- `label_inactive_12m`
- a GitHub repository identity
- enough historical coverage to know what happened during the following 12 months

This is why plain analysis captures and GitHub links in `snapshots.json` are not enough. They help build the dataset, but the labels must come from historical activity after each observation date.

## GH Archive Coverage

Do not train from sparse random GH Archive hours. Absence of activity is meaningful only when the label window has complete enough coverage. If an hour was never processed, "no event" could mean "no activity" or "missing data", and the inactive label becomes unreliable.

For the current default thesis window:

- feature lookback starts: `2021-01-01`
- observations run from: `2023-01-01`
- observations run through: `2024-01-01`
- 12 month labels require coverage through: `2025-01-01`

So the practical GH Archive range is `2021-01-01` through `2025-01-01` inclusive. The downloader script uses an exclusive end date, so pass `-EndExclusive "2025-01-02"`.

## Filtered Download

The repository has a seed-focused downloader at `scripts/download-gharchive-seed-filtered.ps1`. It streams hourly GH Archive files, keeps only events for repositories in `scripts/ml/real-project-foundation-seed.csv`, and writes coverage manifests.

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
  -SeedPath ".\scripts\ml\real-project-foundation-seed.csv" `
  -OutDir ".\tmp\gharchive" `
  -Start "2022-01-10" `
  -EndExclusive "2025-01-02"
```

The wrapper writes per-shard coverage files, waits for all workers, then merges them into `tmp/gharchive/_coverage.csv` and `tmp/gharchive-seed-coverage.csv`. It preserves existing coverage rows from earlier runs unless a worker reports a newer status for the same hour.

Smoke test a tiny range first:

```powershell
.\scripts\download-gharchive-seed-filtered.ps1 `
  -SeedPath ".\scripts\ml\real-project-foundation-seed.csv" `
  -OutDir ".\tmp\gharchive-smoke" `
  -Start "2023-01-01" `
  -EndExclusive "2023-01-04"

npm run ml:bootstrap:real-projects -- --gharchive-source ".\tmp\gharchive-smoke"
```

The smoke run is expected to validate the pipeline shape, not produce thesis-grade model quality.

For the real run:

```powershell
.\scripts\download-gharchive-seed-filtered.ps1 `
  -SeedPath ".\scripts\ml\real-project-foundation-seed.csv" `
  -OutDir ".\tmp\gharchive" `
  -Start "2021-01-01" `
  -EndExclusive "2025-01-02"

npm run ml:bootstrap:real-projects -- --gharchive-source ".\tmp\gharchive"
```

Useful coverage checks:

```powershell
Import-Csv ".\tmp\gharchive\_coverage.csv" |
  Group-Object status |
  Select-Object Name, Count

Import-Csv ".\tmp\gharchive-seed-coverage.csv" |
  Sort-Object {[int]$_.matched_events} |
  Select-Object -First 20
```

If coverage has download or filter failures, fix or rerun those hours before trusting inactive labels.

## Continuous Training Policy

Continuous training is useful if it means continuous data collection plus scheduled retraining. It is risky if it means retraining immediately every time a user submits a new repository URL.

Recommended workflow:

1. Accept new user-provided repository URLs into a candidate queue.
2. Normalize them to GitHub `owner/repo` identities.
3. Add eligible repos to a seed file or seed table.
4. Continuously or periodically download filtered GH Archive events for the tracked seed set.
5. Rebuild labeled snapshots on a schedule, for example nightly or weekly.
6. Train Logistic Regression and XGBoost from the rebuilt dataset.
7. Promote the new model artifacts only when evaluation and guardrails pass.

The production scorer should use trained model artifacts when available. Heuristic scoring remains a fallback for missing artifacts, artifact load failures, or insufficient labeled data.

The GH Archive parser uses pushes, issues, PRs, releases/tags, stars, forks, issue comments, PR reviews, and PR review comments. Comments and reviews improve PR response-time features when those events are present in the filtered files.

## Promotion Guardrails

Before a training run becomes the cached/latest model, require at least:

- labeled real-project rows
- both active and inactive classes
- non-empty train, validation, and test slices
- held-out metrics for Logistic Regression and XGBoost
- acceptable AUROC, Brier score, and calibration behavior
- no unexpected spike in missing features or failed repository resolution

For thesis reporting, keep every training run artifact under `tmp/training/runs` or the configured runs directory, and record which artifact was promoted.

## Operational Rule Of Thumb

Use user URLs to expand the future training corpus. Use GH Archive coverage to create labels. Use scheduled retraining to refresh Logistic Regression and XGBoost. Use heuristics only as the explainable fallback when the model path is not trained or not available.
