$ErrorActionPreference = "Stop"

$ThesisRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$BuildDir = Join-Path $ThesisRoot "build"

if (Test-Path $BuildDir) {
  Remove-Item -LiteralPath $BuildDir -Recurse -Force
}

Write-Host "Removed thesis build output."
