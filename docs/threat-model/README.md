# Threat Model

This project analyzes public dependency and repository metadata. The main security goal is to keep the analysis pipeline trustworthy, reproducible, and transparent.

## Assets

- Analysis records and dependency snapshots
- Provider provenance and evidence
- User uploads and repository URLs
- Heuristic and model output
- CI and deployment configuration

## Trust boundaries

- Browser to Go API
- Go API to Python scoring service
- Go API to public enrichment providers
- Local development containers to the host machine

## Primary risks

- Malicious or malformed input from uploaded manifests
- Stale or rate-limited provider data
- Incomplete or misleading provenance
- Secret leakage through logs or sample data
- Supply-chain compromise through dependency updates or CI actions

## Initial mitigations

- Validate all incoming request shapes
- Store evidence with source timestamps
- Keep demo data clearly labeled
- Use pinned CI actions and update automation
- Keep services separated by responsibility and privilege
