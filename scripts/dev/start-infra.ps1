param()

$ErrorActionPreference = "Stop"

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker is required to start local infrastructure."
}

docker compose up -d postgres
Write-Host "Local infrastructure is starting. Postgres will be on localhost:5432."
