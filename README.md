# OSS Risk Radar

OSS Risk Radar is a decision-support tool for OSS dependency maintenance and supply-chain risk triage. It helps engineering and security teams understand which dependencies look operationally fragile, which public signals shaped that risk profile, and where the evidence is incomplete.

This repository now contains a working phase-2 vertical slice with:

- a Next.js analyst dashboard in `frontend/web`
- a Go API/orchestration service in `backend/api`
- a Python FastAPI scoring and experimentation service in `mltraining/scoring`
- shared TypeScript contracts in `shared/packages/schemas`
- Docker, Postgres bootstrap assets, and local startup scripts in `deployment`, `compose.yaml`, and `scripts/dev`

## Current capabilities

- repository URL submission for GitHub-hosted projects
- upload registration for `package-lock.json`, `requirements.txt`, `poetry.lock`, and `go.mod`
- manifest parsing for direct and transitive dependencies where the artifact supports it
- durable analysis jobs with retryable lifecycle state in PostgreSQL
- dependency enrichment through pluggable deps.dev, GitHub, and OpenSSF Scorecard adapters
- explainable heuristic scoring plus ML-ready feature extraction and training utilities
- a historical dataset builder that exports quarter-based OSS maintenance training snapshots for the existing ML pipeline
- dependency overview, richer filtering, raw signal display, path exploration, and graph context in the frontend

## Monorepo structure

- `frontend`: user-facing applications, currently the Next.js dashboard in `frontend/web`
- `backend`: operational services, currently the Go API in `backend/api`
- `mltraining`: scoring, feature engineering, and model experimentation code in `mltraining/scoring`
- `shared`: reusable packages and contracts, including `shared/packages/schemas`
- `deployment`: Dockerfiles, Compose assets, and Postgres initialization scripts
- `docs`: architecture, methodology, threat model, roadmap, and API notes
- `scripts`: startup helpers, infra scripts, and scaffold validation

## MVP flow

1. Open the frontend at `http://localhost:3000`.
2. Submit a GitHub repository URL, upload a dependency artifact, or run the demo analysis.
3. The Go API registers an analysis and queues a durable background job in PostgreSQL.
4. The worker parses manifests, resolves package metadata via deps.dev, enriches repositories through GitHub, fetches Scorecard signals, and calls the scoring service.
5. The Python scoring service returns inactivity-oriented risk profiles, security posture context, confidence, caveats, explanation factors, and evidence.
6. The frontend renders the overview dashboard, dependency graph/path context, and detail views.

## Local development

### Canonical start path

1. Copy `.env.example` to `.env` if you want to override defaults.
2. Run `npm run dev`.
3. The script will build and start Postgres, the Go API, the scoring service, and the frontend through Docker Compose.
4. It waits for `http://localhost:8080/health`, `http://localhost:8090/health`, and `http://localhost:3000` before reporting success.

### Run services separately

1. Start Postgres with `docker compose up -d postgres`.
2. Run the scoring service from `mltraining/scoring` with `uvicorn app.main:app --reload --host 0.0.0.0 --port 8090`.
3. Run the Go API from `backend/api` with `go run ./cmd/api`.
4. Run the frontend from `frontend/web` with `npm run dev`.

## Current API surface

Public API endpoints:

- `GET /health`
- `GET /ready`
- `POST /api/v1/uploads`
- `POST /api/v1/analyses`
- `GET /api/v1/analyses`
- `GET /api/v1/analyses/:id`
- `GET /api/v1/analyses/:id/dependencies`
- `GET /api/v1/analyses/:id/graph`
- `GET /api/v1/dependencies/:id`
- `GET /api/v1/jobs/:id`

Internal scoring endpoints:

- `GET /health`
- `GET /ready`
- `POST /score/heuristic`
- `POST /features/extract`
- `POST /models/train`

## Important positioning

OSS Risk Radar is not framed as a vulnerability scanner or a definitive trust score. It is a decision-support tool for OSS dependency maintenance and supply-chain risk triage.

## Validation commands

- `npm run dev` to start the full stack
- `npm run test:api` to run Go tests
- `npm run test:scoring` to run Python tests
- `npm run ml:dataset -- build-all --seed-file <path> --gharchive-source <path> --output-dir tmp/training/oss-maintenance` to build a historical maintenance dataset
- `npm run ml:seed:foundation -- --target-repositories 2000 --github-token <token>` to generate a repository foundation seed directly from the GitHub Search API
- `npm run ml:bootstrap -- --gharchive-source <path>` to build `tmp/training/snapshots.json`, trigger training, and verify cached run artifacts under `tmp/training/runs`
- `npm run check:web` to lint and build the frontend
- `powershell -ExecutionPolicy Bypass -File scripts/dev/validate-scaffold.ps1` to validate the repo scaffold

## Next 10 implementation tasks

1. Support multi-manifest repository traversal instead of stopping at the first supported root artifact.
2. Persist provider provenance and refresh timestamps more explicitly for every enrichment source.
3. Add provider caching and rate-limit-aware backoff for GitHub, deps.dev, and Scorecard adapters.
4. Expand upload support to SBOM inputs and Maven/POM-style ecosystems.
5. Add stronger analysis polling, live job progress, and retry visibility in the frontend.
6. Introduce authenticated, tenant-ready middleware and analysis ownership boundaries in the API.
7. Persist trained model artifacts and model registry metadata beyond in-memory training responses.
8. Add notebook-friendly demo datasets and evaluation reports under `mltraining/scoring` for thesis validation.
9. Add browser-level end-to-end tests for submit -> job -> dashboard -> detail navigation.
10. Add deployment manifests and environment hardening for cloud or self-hosted production targets.
