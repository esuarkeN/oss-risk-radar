param()

$ErrorActionPreference = "Stop"

$requiredPaths = @(
  "README.md",
  ".env.example",
  ".gitignore",
  "compose.yaml",
  "scripts/dev/start.mjs",
  "scripts/dev/start.ps1",
  "scripts/dev/start.sh",
  "docs/architecture/README.md",
  "docs/api/contracts.md",
  "docs/methodology/README.md",
  "docs/threat-model/README.md",
  "docs/roadmap.md",
  "deployment/docker/README.md",
  ".github/workflows/ci.yml",
  ".github/workflows/security.yml",
  ".github/dependabot.yml"
)

$missing = @()
foreach ($path in $requiredPaths) {
  if (-not (Test-Path $path)) {
    $missing += $path
  }
}

if ($missing.Count -gt 0) {
  Write-Error ("Missing scaffold files: " + ($missing -join ", "))
  exit 1
}

Write-Host "Scaffold validation passed."
