#!/usr/bin/env bash
set -euo pipefail

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required to start local infrastructure." >&2
  exit 1
fi

docker compose up -d postgres
echo "Local infrastructure is starting. Postgres will be on localhost:5432."
