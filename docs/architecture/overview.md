# Architecture Overview

OSS Risk Radar is organized as a pragmatic monorepo with three primary runtime surfaces:

- `frontend/web`: analyst-facing dashboard for analysis submission and review
- `backend/api`: operational backbone responsible for orchestration, validation, storage coordination, and frontend-facing APIs
- `mltraining/scoring`: internal intelligence service responsible for heuristic scoring today and ML-backed inference later

Design principles:

- Clear separation of concerns between presentation, orchestration, and intelligence
- Explainability and provenance preserved in every score-bearing object
- Provider integrations designed behind adapters so the system is not coupled to a single data source
- Postgres as the long-term system of record, with the MVP using mocked in-memory persistence only in the Go service

The MVP vertical slice keeps one stable contract across the stack:

- create analysis
- score dependencies
- render overview
- inspect a dependency detail view

This lets the mocked slice behave like a real product while remaining straightforward to replace with real providers and storage.
