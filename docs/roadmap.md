# Roadmap

## Phase 1: Vertical slice

1. Scaffold the monorepo and local development environment.
2. Implement the Go analysis orchestration API.
3. Implement the Python heuristic scoring service.
4. Implement the Next.js dashboard and demo submission flow.
5. Add the shared schema package and generated client types.

## Phase 2: Real ingestion

6. Parse common dependency manifests.
7. Map packages to repositories using deps.dev and public metadata.
8. Enrich repositories with GitHub activity signals.
9. Capture OpenSSF Scorecard snapshots and provenance.
10. Persist analysis snapshots and evidence in Postgres.

## Phase 3: Research-ready intelligence

11. Add time-aware dataset construction.
12. Add calibration and evaluation tooling.
13. Add baseline ML models and explanation support.
14. Add benchmark datasets and reproducible experiments.

## Phase 4: Hardening

15. Expand threat modeling and security review.
16. Add SBOM generation and release provenance checks.
17. Add secrets detection and release hygiene automation.
