# Docker Assets

This directory contains container templates and deployment notes for the OSS Risk Radar monorepo.

## Intended images

- `api` for the Go orchestration service
- `scoring` for the Python intelligence service
- `web` for the Next.js frontend

## Notes

- The compose file starts shared infrastructure by default.
- App containers are placed behind the `apps` profile so the repo can still bootstrap before the service teams land their implementations.
- Use `npm run dev` or `node scripts/dev/start.mjs` as the canonical full-stack launcher.
- Canonical image definitions live in `deployment/docker/*.Dockerfile`.
- If you want raw Compose control, use `docker compose --profile apps up --build`.