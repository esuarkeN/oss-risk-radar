param(
  [switch]$NoBuild,
  [switch]$Attach,
  [switch]$NoWait
)

$root = Split-Path -Parent $PSScriptRoot
$root = Split-Path -Parent $root
Set-Location $root

$args = @('scripts/dev/start.mjs')
if ($NoBuild) { $args += '--no-build' }
if ($Attach) { $args += '--attach' }
if ($NoWait) { $args += '--no-wait' }

node @args
