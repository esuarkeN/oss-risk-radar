# Foundation training seed

Reproducibility inputs for the OSS Risk Radar foundation dataset. These let anyone rebuild the
training corpus and train the model artifacts with the repository's `ml:*` scripts, without
re-running the seed sampling.

## Files

| File | What it is |
|---|---|
| `foundation-seed.csv` | The **5,000-repository seed** — one row per repo (`ecosystem, package_name, package_version, popularity_tier, source, repository_url`). This is the sampling frame, **not** training labels. |
| `foundation-seed.metadata.json` | How the seed was sampled: target counts, GitHub Search queries, and per-bucket provenance. |
| `gharchive-seed-coverage.csv` | Which seed repos/time ranges have GH Archive event coverage — used to know what to download and to repair gaps. |

## How the seed was built

5,000 public, non-fork repositories with ≥100 stars and a detected license, sampled across
**active / dormant / archived** strata and star tiers via the GitHub Search API (see
`metadata.json` for the exact queries). The active/dormant/archived bucket is **sampling
provenance, not a label** — the inactivity label is derived later from forward GH Archive activity.
The seed deliberately oversamples dormant/archived repos (~55%) to get enough positive examples.

## Reproducing the dataset

GH Archive is a flat hourly firehose (`https://data.gharchive.org/YYYY-MM-DD-H.json.gz`, all public
events for that hour across all repos) — there is no per-repo download. The pipeline downloads the
hourly files and filters them to the seed repos.

```bash
# 1) Download + filter GH Archive to the seed repos (Windows PowerShell helper)
scripts/download-gharchive-seed-filtered.ps1 -SeedPath data/training-foundation/foundation-seed.csv -OutDir tmp/gharchive

# 2) Build the dataset (observation snapshots + 12-month labels) from the filtered events
npm run ml:dataset -- build-all --seed-file data/training-foundation/foundation-seed.csv --gharchive-source tmp/gharchive --output-dir tmp/training/oss-maintenance

# 3) Train + export the model artifacts
npm run ml:train
```

The raw GH Archive data and the built `snapshots.json` are intentionally **not** committed (large,
and derivable) — only the seed + coverage that pin *which* repos make up the corpus are versioned here.
