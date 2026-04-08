# Roadmap Milestones

## Milestone 1: Vertical slice MVP

- mocked submission flow
- Go orchestration service
- Python heuristic scoring
- Next.js dashboard with overview and detail views
- local Docker Compose stack

## Milestone 2: Real ingestion and enrichment

- dependency-file parsing
- deps.dev metadata and dependency graph integration
- GitHub repository enrichment
- OpenSSF Scorecard ingestion
- persisted snapshots in Postgres

## Milestone 3: Research-grade scoring

- snapshot dataset builder
- time-aware train/validation/test splits
- baseline logistic regression
- calibration and evaluation reports
- experiment tracking and model registry basics

## Milestone 4: Operational hardening

- background jobs and retry handling
- auth-ready middleware and multi-user boundaries
- observability, metrics, and tracing
- upload scanning and stricter threat mitigations
