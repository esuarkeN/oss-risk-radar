# Shared Contracts

This package is the contract anchor for the monorepo.

Current strategy:

- `openapi/public-api.yaml` defines the frontend-facing REST surface exposed by the Go API.
- `openapi/scoring-internal.yaml` defines the internal HTTP contract between the Go API and the Python scoring service.
- `examples/` contains concrete payload snapshots for the initial demo flow.

Planned evolution:

1. Generate TypeScript client types for `frontend/web`.
2. Generate Go server/client bindings for `backend/api`.
3. Generate Python client/server models for `mltraining/scoring`.
4. Add JSON Schema emission for persisted evidence snapshots.

The MVP intentionally keeps generation out of the critical path so the vertical slice can ship quickly while the schema source of truth already exists.