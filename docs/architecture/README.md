# Architecture

OSS Risk Radar is organized as a monorepo with clear ownership boundaries so that the operational API, the scoring engine, and the analyst-facing UI can evolve independently without collapsing into one large application.

## Monorepo layout

- `frontend/web` hosts the Next.js dashboard and analyst experience.
- `backend/api` hosts the Go REST API, orchestration layer, and persistence coordination.
- `mltraining/scoring` hosts the Python scoring, feature extraction, and model experimentation code.
- `shared/packages/schemas` will hold shared contracts, generated clients, and JSON schema artifacts.
- `docs` captures architecture, methodology, API contracts, threat model, and roadmap material.
- `deployment` contains container, compose, and environment scaffolding.
- `scripts` contains developer helpers and validation scripts.

## Service boundaries

- The Go API is the system entry point for user-facing analysis requests, uploads, and job orchestration.
- The Python scoring service is stateless and should only consume normalized payloads from the Go API.
- The frontend should not talk directly to provider APIs or the database.
- Public enrichment providers should be isolated behind provider interfaces so they can be mocked, swapped, or disabled independently.

## First vertical slice

1. The user submits a repository URL or dependency artifact.
2. The Go API creates an analysis and queues a job.
3. The Go API normalizes a dependency set, either from a real parser or a demo fixture.
4. The Python service returns a conservative heuristic risk profile with evidence and caveats.
5. The frontend renders summary cards, charts, filters, and a dependency detail view.

## Design principles

- Explainability first
- Conservative language
- Clear provenance for each signal
- Missing-data visibility
- Versioned contracts and snapshots
- Simple local development path
