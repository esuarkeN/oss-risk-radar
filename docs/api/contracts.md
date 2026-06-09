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

The MVP keeps the API intentionally small so the frontend, Go service, and Python service can evolve together before code generation is introduced.
