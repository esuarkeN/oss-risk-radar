#!/usr/bin/env bash
set -euo pipefail

required_paths=(
  "README.md"
  ".env.example"
  ".gitignore"
  "compose.yaml"
  "scripts/dev/start.mjs"
  "scripts/dev/start.ps1"
  "scripts/dev/start.sh"
  "docs/architecture/README.md"
  "docs/api/contracts.md"
  "docs/methodology/README.md"
  "docs/threat-model/README.md"
  "docs/roadmap.md"
  "deployment/docker/README.md"
  ".github/workflows/ci.yml"
  ".github/workflows/security.yml"
  ".github/dependabot.yml"
)

missing=()
for path in "${required_paths[@]}"; do
  if [[ ! -e "$path" ]]; then
    missing+=("$path")
  fi
done

if (( ${#missing[@]} > 0 )); then
  printf 'Missing scaffold files: %s\n' "${missing[*]}" >&2
  exit 1
fi

echo "Scaffold validation passed."
