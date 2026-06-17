# AGENTS.md

## Project Positioning

OSS Risk Radar is a decision-support tool for OSS dependency maintenance and supply-chain risk triage. Do not describe it as a vulnerability scanner or a definitive trust score. Keep product language conservative, evidence-oriented, and explicit about missing data.

## Repo Map

- `frontend/web`: Next.js analyst dashboard.
- `backend/api`: Go API, orchestration, persistence, and provider adapters.
- `mltraining/scoring`: Python scoring service, feature extraction, notebook workflow, and offline ML training code.
- `shared/packages/schemas`: shared contracts and OpenAPI schema anchors.
- `deployment`: Dockerfiles, Compose assets, Kubernetes manifests, Argo CD config, and staged training artifacts.
- `docs`: architecture, methodology, threat model, roadmap, and API notes.
- `scripts`: local development, validation, infrastructure, and ML helper scripts.

## Common Commands

- `npm run dev`: start the full local Docker Compose stack.
- `npm run dev:down`: stop the local app stack.
- `npm run test:api`: run Go API tests.
- `npm run test:scoring`: run Python scoring tests.
- `npm run check:web`: lint and build the frontend.
- `npm run ml:notebook:execute:ci`: run the notebook smoke path with the local runner.
- `npm run ml:train`: execute the notebook-primary training workflow and export model artifacts.
- `npm run ml:stage-training`: validate and promote training artifacts into `deployment/training`.

## Architecture Guardrails

- The frontend talks to the Go API; it should not call providers or databases directly.
- The Python scoring service is internal and stateless at request time.
- Shared OpenAPI schemas are contract anchors. Keep API and UI changes aligned with them.
- Preserve provider provenance, timestamps, confidence, caveats, and missing-data signals instead of hiding uncertainty.
- Keep edits scoped. Avoid broad rewrites, unrelated formatting churn, and changes to user work already present in the tree.

## ML And Training Guardrails

- Training is offline and notebook-primary. `notebooks/oss-maintenance-training.ipynb` is the visible workflow and artifact export boundary.
- Runtime scoring is model-artifact-only. Missing or invalid artifacts are configuration errors, not a reason to use substitute scoring behavior.
- Submitted repositories are candidates for future corpus curation; they are not supervised active/inactive labels.
- Never place demo, fixture, or synthetic labeled datasets in `deployment/training`.
- GH Archive labels require complete enough historical coverage. Request-time scoring must not download, scan, or parse GH Archive files.
- Keep long foundation runs under `tmp/training-foundation` and `tmp/gharchive-foundation` so smaller smoke datasets stay separate.

## Deployment Notes

- `deployment/training` is copied into the API image at `/app/seed/training`.
- `deployment/training/snapshots.json` is tracked with Git LFS; CI/deploy checkouts that build or train from it must fetch LFS objects.
- A non-ignored push to `main` triggers `.github/workflows/deploy.yml`, rebuilds images, updates Kustomize image tags, and lets Argo CD sync the deployment.
- Markdown-only and docs-only pushes do not trigger the deploy workflow because of `paths-ignore`.
- Keep secrets out of git. Runtime `GITHUB_TOKEN` should be fine-grained and read-only for public repository metadata; do not use the GitHub Actions token as an app secret.

## Style And Safety

- Follow `.editorconfig`: UTF-8, LF endings, final newline, 2-space default indentation, tabs for Go, 4 spaces for Python.
- Prefer existing local patterns, helpers, and scripts over new abstractions.
- Use targeted tests for the subsystem changed, and mention any checks that could not be run.
- The worktree may be dirty. Do not revert or overwrite unrelated changes unless the user explicitly asks.
