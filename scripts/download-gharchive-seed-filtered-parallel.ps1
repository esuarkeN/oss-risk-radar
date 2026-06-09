[CmdletBinding()]
param(
  [string]$SeedPath = ".\tmp\training\foundation-seed.csv",
  [string]$OutDir = ".\tmp\gharchive",
  [datetime]$Start = "2021-01-01",
  [datetime]$EndExclusive = (Get-Date).Date,
  [string]$RepoColumn = "",
  [string]$SeedCoveragePath = ".\tmp\gharchive-seed-coverage.csv",
  [string]$RawDir = ".\tmp\gharchive-raw",
  [int]$Workers = 4,
  [switch]$ForceRefilter,
  [switch]$AugmentExisting,
  [switch]$KeepRaw
)

$ErrorActionPreference = "Stop"

if ($Workers -lt 1) {
  throw "-Workers must be at least 1."
}

$scriptRoot = Split-Path -Parent $PSCommandPath
$repoRoot = (Resolve-Path (Join-Path $scriptRoot "..")).Path
$downloaderPath = Join-Path $scriptRoot "download-gharchive-seed-filtered.ps1"

Set-Location $repoRoot
New-Item -ItemType Directory -Force $OutDir | Out-Null

$combinedCoveragePath = Join-Path $OutDir "_coverage.csv"
$existingCoverageRows = @()
if (Test-Path $combinedCoveragePath) {
  $existingCoverageRows = @(Import-Csv $combinedCoveragePath)
}

$existingSeedRows = @()
if ((-not $ForceRefilter) -and (-not $AugmentExisting) -and (Test-Path $SeedCoveragePath)) {
  $existingSeedRows = @(Import-Csv $SeedCoveragePath)
}

$coverageShardPaths = @()
$seedCoverageShardPaths = @()
$jobs = @()

Write-Host "Starting $Workers GH Archive downloader workers"
Write-Host "Date range: $($Start.ToString('yyyy-MM-dd')) to $($EndExclusive.AddDays(-1).ToString('yyyy-MM-dd'))"
Write-Host "Output dir: $OutDir"
Write-Host ""

for ($index = 0; $index -lt $Workers; $index++) {
  $coveragePath = Join-Path $OutDir ("_coverage.shard-{0}-of-{1}.csv" -f $index, $Workers)
  $seedCoveragePath = "{0}.shard-{1}-of-{2}.csv" -f ($SeedCoveragePath -replace "\.csv$", ""), $index, $Workers
  $coverageShardPaths += $coveragePath
  $seedCoverageShardPaths += $seedCoveragePath

  $job = Start-Job -Name ("gharchive-shard-{0}-of-{1}" -f $index, $Workers) -ScriptBlock {
    param(
      [string]$RepoRoot,
      [string]$DownloaderPath,
      [string]$SeedPath,
      [string]$OutDir,
      [datetime]$Start,
      [datetime]$EndExclusive,
      [string]$RepoColumn,
      [string]$SeedCoveragePath,
      [string]$RawDir,
      [string]$CoveragePath,
      [int]$ShardCount,
      [int]$ShardIndex,
      [bool]$ForceRefilter,
      [bool]$AugmentExisting,
      [bool]$KeepRaw
    )

    Set-Location $RepoRoot

    $params = @{
      SeedPath = $SeedPath
      OutDir = $OutDir
      Start = $Start
      EndExclusive = $EndExclusive
      SeedCoveragePath = $SeedCoveragePath
      RawDir = $RawDir
      CoveragePath = $CoveragePath
      ShardCount = $ShardCount
      ShardIndex = $ShardIndex
    }

    if (-not [string]::IsNullOrWhiteSpace($RepoColumn)) {
      $params.RepoColumn = $RepoColumn
    }
    if ($ForceRefilter) {
      $params.ForceRefilter = $true
    }
    if ($AugmentExisting) {
      $params.AugmentExisting = $true
    }
    if ($KeepRaw) {
      $params.KeepRaw = $true
    }

    & $DownloaderPath @params
  } -ArgumentList @(
    $repoRoot,
    $downloaderPath,
    $SeedPath,
    $OutDir,
    $Start,
    $EndExclusive,
    $RepoColumn,
    $seedCoveragePath,
    $RawDir,
    $coveragePath,
    $Workers,
    $index,
    [bool]$ForceRefilter,
    [bool]$AugmentExisting,
    [bool]$KeepRaw
  )

  $jobs += $job
  Write-Host "Started shard $index of $Workers"
}

try {
  while (@($jobs | Where-Object { $_.State -in @("NotStarted", "Running") }).Count -gt 0) {
    Receive-Job -Job $jobs -ErrorAction Continue
    $states = $jobs | Group-Object State | ForEach-Object { "$($_.Name)=$($_.Count)" }
    Write-Host "Worker states: $($states -join ', ')"
    Wait-Job -Job $jobs -Any -Timeout 30 | Out-Null
  }

  foreach ($job in $jobs) {
    Write-Host ""
    Write-Host "===== $($job.Name) ====="
    Receive-Job -Job $job -ErrorAction Continue
  }

  $failedJobs = @(
    $jobs | Where-Object {
      $_.State -ne "Completed" -or (($_.ChildJobs | ForEach-Object { $_.Error.Count } | Measure-Object -Sum).Sum -gt 0)
    }
  )

  if ($failedJobs.Count -gt 0) {
    throw "One or more GH Archive downloader workers failed: $($failedJobs.Name -join ', ')"
  }
}
finally {
  Remove-Job -Job $jobs -Force -ErrorAction SilentlyContinue
}

$coverageRows = @(
  $existingCoverageRows
  foreach ($path in $coverageShardPaths) {
    if (Test-Path $path) {
      Import-Csv $path
    }
  }
)

if ($coverageRows.Count -gt 0) {
  $coverageByHour = @{}
  foreach ($row in $coverageRows) {
    $key = "$($row.file)|$($row.date)|$($row.hour)"
    if ($row.status -eq "skipped_existing" -and $coverageByHour.ContainsKey($key)) {
      continue
    }
    $coverageByHour[$key] = $row
  }

  $coverageByHour.Values |
    Sort-Object @{Expression = "date"; Ascending = $true}, @{Expression = { [int]$_.hour }; Ascending = $true}, @{Expression = "file"; Ascending = $true} |
    Export-Csv $combinedCoveragePath -NoTypeInformation -Encoding UTF8
}
else {
  "file,date,hour,matched_events,status" | Set-Content $combinedCoveragePath -Encoding UTF8
}

$seedRows = @(
  $existingSeedRows
  foreach ($path in $seedCoverageShardPaths) {
    if (Test-Path $path) {
      Import-Csv $path
    }
  }
)

$repoCounts = @{}
foreach ($row in $seedRows) {
  if ([string]::IsNullOrWhiteSpace($row.repo)) {
    continue
  }
  $matchedEvents = 0
  [void][int]::TryParse([string]$row.matched_events, [ref]$matchedEvents)
  if (-not $repoCounts.ContainsKey($row.repo)) {
    $repoCounts[$row.repo] = 0
  }
  $repoCounts[$row.repo] = $repoCounts[$row.repo] + $matchedEvents
}

if ($repoCounts.Count -gt 0) {
  $repoCounts.GetEnumerator() |
    Sort-Object Value -Descending |
    Select-Object @{Name = "repo"; Expression = { $_.Key }}, @{Name = "matched_events"; Expression = { $_.Value }} |
    Export-Csv $SeedCoveragePath -NoTypeInformation -Encoding UTF8
}

Write-Host ""
Write-Host "Parallel download complete."
Write-Host "Merged coverage manifest: $combinedCoveragePath"
Write-Host "Merged seed repo coverage: $SeedCoveragePath"
