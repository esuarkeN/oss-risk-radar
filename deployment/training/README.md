# Training seed artifacts

Place real historical training artifacts here before building the API image:

- `snapshots.json`
- `latest-run.json`
- `runs/*.json`

The API image copies this directory to `/app/seed/training`. On startup, the Kubernetes deployment seeds `/app/tmp/training` from these files so production can use the same real-world training base as local model builds.

Do not place demo, fixture, or synthetic labeled datasets here.
