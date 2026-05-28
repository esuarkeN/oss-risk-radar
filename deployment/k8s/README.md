# k3s + Argo CD deployment

This is the canonical deployment guide for running OSS Risk Radar on k3s with Argo CD at `https://oss-risk-radar.gamedivers.de`.

The Kustomize manifests deploy four services:

- `web`: the public Next.js UI
- `api`: the Go API, exposed through `/api/v1`
- `scoring`: the internal Python scoring service
- `postgres`: the internal database with a persistent volume

The manifests are plain Kustomize so Argo CD can sync them directly from `deployment/k8s/base`.

## Prerequisites

- a k3s cluster reachable on ports `80` and `443`
- Traefik ingress, or equivalent ingress settings changed in `deployment/k8s/base/ingress.yaml`
- cert-manager with a `letsencrypt-gamedivers` ClusterIssuer, or equivalent TLS settings changed in the ingress
- DNS for `oss-risk-radar.gamedivers.de` pointing at the k3s server
- public GHCR images available under `ghcr.io/esuarken`. GitHub shows the account as `esuarkeN`, but container image references must stay lowercase.
- Argo CD installed, or permission to install it in the cluster

## 1. Push this repo to GitHub

The Argo CD application is wired to:

```yaml
repoURL: https://github.com/esuarkeN/oss-risk-radar.git
path: deployment/k8s/base
targetRevision: main
```

If you move the repo later, update `deployment/argocd/oss-risk-radar.application.yaml`.

## 2. Publish images

The GitHub workflow `.github/workflows/deploy.yml` builds and pushes these images to GHCR:

```text
ghcr.io/esuarken/oss-risk-radar-api
ghcr.io/esuarken/oss-risk-radar-scoring
ghcr.io/esuarken/oss-risk-radar-web
```

On every push to `main`, it builds the images, pushes them to GHCR, commits the new image tags to `deployment/k8s/base/kustomization.yaml`, and pushes that deploy commit back to `main`. Argo CD then syncs the updated image tags automatically.

For the first deployment, either run the workflow manually from GitHub Actions or build/push images yourself:

```sh
docker build -f deployment/docker/api.Dockerfile -t ghcr.io/esuarken/oss-risk-radar-api:latest .
docker build -f deployment/docker/scoring.Dockerfile -t ghcr.io/esuarken/oss-risk-radar-scoring:latest .
docker build -f deployment/docker/web.Dockerfile -t ghcr.io/esuarken/oss-risk-radar-web:latest .

docker push ghcr.io/esuarken/oss-risk-radar-api:latest
docker push ghcr.io/esuarken/oss-risk-radar-scoring:latest
docker push ghcr.io/esuarken/oss-risk-radar-web:latest
```

Make the GHCR packages public. The current manifests do not require an image pull secret.

## 3. Confirm the public domain

`deployment/k8s/base/app-config.yaml` is already configured for:

```yaml
PUBLIC_HOST: oss-risk-radar.gamedivers.de
PUBLIC_ORIGIN: https://oss-risk-radar.gamedivers.de
```

Point that DNS name at your k3s server. With the default k3s Traefik install, ports `80` and `443` must reach the node.

Also check `deployment/k8s/base/ingress.yaml`. It assumes:

```yaml
ingressClassName: traefik
cert-manager.io/cluster-issuer: letsencrypt-gamedivers
traefik.ingress.kubernetes.io/router.entrypoints: websecure
traefik.ingress.kubernetes.io/router.tls: "true"
```

Change the config map and ingress only if you are deploying to a different domain, ingress class, or certificate issuer.

## 4. Create secrets once

Keep real secrets out of Git. Before Argo syncs the app, create this runtime app secret on the server:

```sh
kubectl create namespace oss-risk-radar --dry-run=client -o yaml | kubectl apply -f -

kubectl -n oss-risk-radar create secret generic oss-risk-radar-secrets \
  --from-literal=POSTGRES_PASSWORD='replace-with-a-long-random-password' \
  --from-literal=DATABASE_URL='postgres://oss_risk_radar:replace-with-a-long-random-password@postgres:5432/oss_risk_radar?sslmode=disable' \
  --from-literal=GITHUB_TOKEN='' \
  --dry-run=client -o yaml | kubectl apply -f -
```

Use a newly generated database password. Put the exact same password in `POSTGRES_PASSWORD` and inside `DATABASE_URL`.

`GITHUB_TOKEN` is optional for the running app. If you leave it empty, repository analysis still works but has GitHub's lower unauthenticated rate limits. For production, create a new fine-grained GitHub token for this app with the smallest read-only access you can use for public repository metadata. Do not use the GitHub Actions `GITHUB_TOKEN`; that token only exists inside workflow runs.

If you later switch the GHCR packages to private, create a pull secret:

```sh
kubectl -n oss-risk-radar create secret docker-registry ghcr-pull-secret \
  --docker-server=ghcr.io \
  --docker-username='esuarkeN' \
  --docker-password='TOKEN_WITH_READ_PACKAGES' \
  --dry-run=client -o yaml | kubectl apply -f -
```

Then either add `imagePullSecrets` to the `api`, `scoring`, and `web` deployments or patch the namespace default service account to use it. This GHCR pull token is separate from the app's `GITHUB_TOKEN`; it needs package/image read access so k3s can pull the container images.

## 5. Install Argo CD

If Argo CD is not installed yet:

```sh
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

Then expose Argo CD however you prefer. For a quick admin login from your machine:

```sh
kubectl -n argocd port-forward svc/argocd-server 8081:443
kubectl -n argocd get secret argocd-initial-admin-secret \
  -o jsonpath="{.data.password}" | base64 -d
```

## 6. Apply the Argo CD application

From a checkout of this repo on your machine or server:

```sh
kubectl apply -f deployment/argocd/oss-risk-radar.application.yaml
```

Argo CD will sync the Kustomize app from `deployment/k8s/base`.

If your GitHub repo is private, add it to Argo CD first through the UI or CLI so Argo can read it.

## Quick checks

```sh
kubectl -n oss-risk-radar get pods,svc,ingress
kubectl -n oss-risk-radar logs deploy/api
kubectl -n oss-risk-radar logs deploy/web
```

Once DNS and TLS are ready, open `https://oss-risk-radar.gamedivers.de`.
