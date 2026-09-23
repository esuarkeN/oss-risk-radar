# API Notes

Frontend contract reference:

- `shared/packages/schemas/openapi/public-api.yaml`

Internal scoring contract reference:

- `shared/packages/schemas/openapi/scoring-internal.yaml`

Key resource concepts:

- Analysis
- Dependency
- Job
- Risk profile
- Explanation factor
- Evidence item

Batch endpoints (`POST /api/v1/analyses/batch`, `POST /api/v1/analyses/batch/status`)
exist for callers holding many repository URLs at once (e.g. an external
dependency inventory scoring its whole package set) — they collapse the HTTP
round trip of one submission/lookup per repository into one call, but the
worker behind them is still the single sequential job queue: batching does not
change scoring throughput, only how many requests a caller needs to submit and
poll. Each entry in a batch carries its own outcome, so one bad URL or unknown
id never fails the rest of the call.

The MVP keeps the API intentionally small so the frontend, Go service, and Python service can evolve together before code generation is introduced.
