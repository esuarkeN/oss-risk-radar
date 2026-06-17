# Training seed artifacts

Place real historical training artifacts here before building the API image:

- `snapshots.json`
- `repository-feature-cache.json`
- `latest-run.json`
- `runs/*.json`

The API image copies this directory to `/app/seed/training`. On startup, the Kubernetes deployment seeds `/app/tmp/training` from these files so production can use the same real-world training base as local model builds.

For production updates, prefer the manual GitHub Actions workflow `ML Artifacts`. It executes the notebook-primary training runbook under Python 3.14, uploads the generated bundle as a workflow artifact, and opens a PR that changes only this directory. Local promotion is still available with `npm run ml:stage-training`. If your machine does not have Python 3.14 installed, use the Docker-backed notebook and training scripts.

Do not place demo, fixture, or synthetic labeled datasets here.

`snapshots.json` is stored with Git LFS because the real foundation dataset is larger than GitHub's normal blob limit. Run `git lfs pull` after cloning if the file contains an LFS pointer instead of JSON.
