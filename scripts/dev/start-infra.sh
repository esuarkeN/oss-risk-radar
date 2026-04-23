#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd)"
ROOT_DIR="$(CDPATH='' cd -- "$SCRIPT_DIR/../.." && pwd)"

if ! command -v docker >/dev/null 2>&1; then
  echo "Docker is required to start local infrastructure." >&2
  exit 1
fi

read_config_value() {
  local key="$1"
  local fallback="$2"

  if [[ -n "${!key:-}" ]]; then
    printf '%s\n' "${!key}"
    return
  fi

  local env_path="$ROOT_DIR/.env"
  if [[ -f "$env_path" ]]; then
    while IFS= read -r raw_line || [[ -n "$raw_line" ]]; do
      local line="${raw_line#"${raw_line%%[![:space:]]*}"}"
      line="${line%"${line##*[![:space:]]}"}"
      [[ -z "$line" || "${line:0:1}" == "#" ]] && continue
      if [[ "$line" == "$key="* ]]; then
        printf '%s\n' "${line#*=}"
        return
      fi
    done < "$env_path"
  fi

  printf '%s\n' "$fallback"
}

port_in_use() {
  local port="$1"

  if command -v lsof >/dev/null 2>&1; then
    lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
    return $?
  fi

  if command -v ss >/dev/null 2>&1; then
    ss -ltn "sport = :$port" 2>/dev/null | tail -n +2 | grep -q .
    return $?
  fi

  if command -v netstat >/dev/null 2>&1; then
    netstat -an 2>/dev/null | grep -Eq "[\[\:\.]$port[[:space:]].*LISTEN"
    return $?
  fi

  return 1
}

print_port_owners() {
  local port="$1"

  if command -v docker >/dev/null 2>&1; then
    while IFS=$'\t' read -r name ports; do
      [[ -z "$name" ]] && continue
      if [[ "$ports" == *":$port->"* ]]; then
        echo "  occupied by docker container $name ($ports)"
      fi
    done < <(cd "$ROOT_DIR" && docker ps --format '{{.Names}}\t{{.Ports}}' 2>/dev/null || true)
  fi

  if command -v lsof >/dev/null 2>&1; then
    while read -r command pid _; do
      [[ -z "$command" ]] && continue
      echo "  occupied by process $command (pid $pid)"
    done < <(lsof -nP -iTCP:"$port" -sTCP:LISTEN 2>/dev/null | awk 'NR>1 {print $1, $2}')
    return
  fi

  if command -v ss >/dev/null 2>&1; then
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      echo "  occupied by $line"
    done < <(ss -ltnp 2>/dev/null | grep -E "[\[\:\*]$port\\b" || true)
  fi
}

next_free_port() {
  local port="$1"
  local candidate
  for ((candidate = port + 1; candidate <= port + 25; candidate += 1)); do
    if ! port_in_use "$candidate"; then
      printf '%s\n' "$candidate"
      return
    fi
  done
}

postgres_port="$(read_config_value POSTGRES_PORT 5432)"

if port_in_use "$postgres_port"; then
  echo "Postgres port $postgres_port is already in use." >&2
  print_port_owners "$postgres_port" >&2

  suggested_port="$(next_free_port "$postgres_port" || true)"
  if [[ -n "${suggested_port:-}" ]]; then
    echo "  next free port: $suggested_port (set POSTGRES_PORT=$suggested_port in .env)" >&2
  fi

  exit 1
fi

(
  cd "$ROOT_DIR"
  docker compose up -d postgres
)

echo "Local infrastructure is starting. Postgres will be on localhost:$postgres_port."
