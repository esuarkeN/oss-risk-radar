# k3s + Argo CD deployment

This deploys OSS Risk Radar as four services:

- `web`: the public Next.js UI
- `api`: the Go API, exposed through `/api/v1`
- `scoring`: the internal Python scoring service
- `postgres`: the internal database with a persistent volume

The manifests are plain Kustomize so Argo CD can sync them directly from `deployment/k8s/base`.

## 1. Publish images

Build and push all three app images to a registry your k3s nodes can pull from:

```sh
docker build -f deployment/docker/api.Dockerfile -t ghcr.io/your-org/oss-risk-radar-api:latest .
docker build -f deployment/docker/scoring.Dockerfile -t ghcr.io/your-org/oss-risk-radar-scoring:latest .
docker build -f deployment/docker/web.Dockerfile -t ghcr.io/your-org/oss-risk-radar-web:latest .

docker push ghcr.io/your-org/oss-risk-radar-api:latest
docker push ghcr.io/your-org/oss-risk-radar-scoring:latest
docker push ghcr.io/your-org/oss-risk-radar-web:latest
```

Then update the `images` section in `deployment/k8s/base/kustomization.yaml`.

## 2. Set the public domain

Edit `deployment/k8s/base/app-config.yaml`:

```yaml
PUBLIC_HOST: radar.example.com
PUBLIC_ORIGIN: https://radar.example.com
```

Point that DNS name at your k3s server. With the default k3s Traefik install, ports `80` and `443` must reach the node.

## 3. Create secrets once

Keep real secrets out of Git. Before Argo syncs the app, create this secret on the server:

```sh
kubectl create namespace oss-risk-radar
kubectl -n oss-risk-radar create secret generic oss-risk-radar-secrets \
  --from-literal=POSTGRES_PASSWORD='replace-with-a-long-random-password' \
  --from-literal=DATABASE_URL='postgres://oss_risk_radar:replace-with-a-long-random-password@postgres:5432/oss_risk_radar?sslmode=disable' \
  --from-literal=GITHUB_TOKEN=''
```

Use the same password in `POSTGRES_PASSWORD` and `DATABASE_URL`. Add a GitHub token if you want higher API limits for repository analysis.

## 4. TLS

The ingress assumes cert-manager with a `letsencrypt-production` ClusterIssuer:

```yaml
cert-manager.io/cluster-issuer: letsencrypt-production
```

If you do not use cert-manager, remove that annotation and the `tls` block from `deployment/k8s/base/ingress.yaml`, or replace them with your existing certificate setup.

## 5. Argo CD application

Edit `deployment/argocd/oss-risk-radar.application.yaml` and set:

```yaml
repoURL: https://github.com/your-org/oss-risk-radar.git
targetRevision: main
```

Apply it:

```sh
kubectl apply -f deployment/argocd/oss-risk-radar.application.yaml
```

Argo CD will sync the Kustomize app from `deployment/k8s/base`.

## Quick checks

```sh
kubectl -n oss-risk-radar get pods,svc,ingress
kubectl -n oss-risk-radar logs deploy/api
kubectl -n oss-risk-radar logs deploy/web
```

Once DNS and TLS are ready, open `https://radar.example.com`.
