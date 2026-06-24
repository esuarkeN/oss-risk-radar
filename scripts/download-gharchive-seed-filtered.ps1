[CmdletBinding()]
param(
  [string]$SeedPath = ".\tmp\training\foundation-seed.csv",
  [string]$OutDir = ".\tmp\gharchive",
  [datetime]$Start = "2021-01-01",
  [datetime]$EndExclusive = (Get-Date).Date,
  [string]$RepoColumn = "",
  [string]$SeedCoveragePath = ".\tmp\gharchive-seed-coverage.csv",
  [string]$RawDir = ".\tmp\gharchive-raw",
  [string]$CoveragePath = "",
  [int]$ShardCount = 1,
  [int]$ShardIndex = 0,
  [switch]$ForceRefilter,
  [switch]$AugmentExisting,
  [switch]$KeepRaw
)

$ErrorActionPreference = "Stop"

if ($ForceRefilter -and $AugmentExisting) {
  throw "Use either -ForceRefilter or -AugmentExisting, not both."
}

if ($ShardCount -lt 1) {
  throw "-ShardCount must be at least 1."
}

if ($ShardIndex -lt 0 -or $ShardIndex -ge $ShardCount) {
  throw "-ShardIndex must be between 0 and ShardCount - 1."
}

if ($ShardCount -gt 1 -and $SeedCoveragePath -eq ".\tmp\gharchive-seed-coverage.csv") {
  $SeedCoveragePath = ".\tmp\gharchive-seed-coverage.shard-$ShardIndex-of-$ShardCount.csv"
}

New-Item -ItemType Directory -Force $OutDir | Out-Null

New-Item -ItemType Directory -Force $RawDir | Out-Null

$seed = Import-Csv $SeedPath
if (-not $seed -or $seed.Count -eq 0) {
  throw "Seed CSV is empty or could not be read: $SeedPath"
}

$columns = ($seed | Select-Object -First 1).PSObject.Properties.Name

if ([string]::IsNullOrWhiteSpace($RepoColumn)) {
  $candidates = @(
    "repository_full_name",
    "repo_full_name",
    "full_name",
    "repo",
    "repository",
    "repo_name",
    "repoName",
    "github_repo",
    "githubRepository",
    "repository_url",
    "github_url",
    "githubRepositoryUrl",
    "html_url",
    "url",
    "package_name",
    "name"
  )

  $RepoColumn = $candidates | Where-Object { $columns -contains $_ } | Select-Object -First 1
}

if ([string]::IsNullOrWhiteSpace($RepoColumn)) {
  throw "Could not detect repo column. Columns found: $($columns -join ', '). Re-run with -RepoColumn <columnName>."
}

function Convert-ToRepoFullName {
  param(
    [AllowNull()]
    [string]$Value
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return $null
  }

  $candidate = $Value.Trim().TrimEnd("/")

  if ($candidate -match "^https?://github\.com/([^/\s]+)/([^/\s?#]+)") {
    $candidate = "$($Matches[1])/$($Matches[2])"
  }
  elseif ($candidate -match "^git@github\.com:([^/\s]+)/([^/\s?#]+)") {
    $candidate = "$($Matches[1])/$($Matches[2])"
  }
  elseif ($candidate -match "^github\.com/([^/\s]+)/([^/\s?#]+)") {
    $candidate = "$($Matches[1])/$($Matches[2])"
  }

  $candidate = $candidate -replace "\.git$", ""

  if ($candidate -match "^[^/\s]+/[^/\s]+$") {
    return $candidate
  }

  return $null
}

$repos = $seed |
  ForEach-Object { Convert-ToRepoFullName $_.$RepoColumn } |
  Where-Object { $_ } |
  Sort-Object -Unique

if ($repos.Count -eq 0) {
  throw "No GitHub repos found in column '$RepoColumn'. Expected values like owner/repo or https://github.com/owner/repo."
}

$repoSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
$repos | ForEach-Object { [void]$repoSet.Add($_) }

$repoCounts = @{}
$repos | ForEach-Object { $repoCounts[$_] = 0 }

$repoRegex = [regex]::new('"repo"\s*:\s*\{[^}]*"name"\s*:\s*"([^"]+)"')

if ([string]::IsNullOrWhiteSpace($CoveragePath)) {
  $coverageFileName = if ($ShardCount -gt 1) { "_coverage.shard-$ShardIndex-of-$ShardCount.csv" } else { "_coverage.csv" }
  $CoveragePath = Join-Path $OutDir $coverageFileName
}

$coverageDir = Split-Path -Parent $CoveragePath
if (-not [string]::IsNullOrWhiteSpace($coverageDir)) {
  New-Item -ItemType Directory -Force $coverageDir | Out-Null
}
if ($ForceRefilter -or -not (Test-Path $CoveragePath)) {
  "file,date,hour,matched_events,status" | Set-Content $CoveragePath -Encoding UTF8
}

$seedCoverageDir = Split-Path -Parent $SeedCoveragePath
if (-not [string]::IsNullOrWhiteSpace($seedCoverageDir)) {
  New-Item -ItemType Directory -Force $seedCoverageDir | Out-Null
}

function Filter-GhArchiveFile {
  param(
    [string]$InputFile,
    [string]$OutputFile
  )

  $count = 0

  $inFs = [System.IO.File]::OpenRead($InputFile)
  $gzipIn = [System.IO.Compression.GZipStream]::new($inFs, [System.IO.Compression.CompressionMode]::Decompress)
  $reader = [System.IO.StreamReader]::new($gzipIn)

  $outFs = [System.IO.File]::Create($OutputFile)
  $gzipOut = [System.IO.Compression.GZipStream]::new($outFs, [System.IO.Compression.CompressionLevel]::Optimal)
  $writer = [System.IO.StreamWriter]::new($gzipOut)

  try {
    while (($line = $reader.ReadLine()) -ne $null) {
      $m = $repoRegex.Match($line)
      if ($m.Success) {
        $repoName = $m.Groups[1].Value
        if ($repoSet.Contains($repoName)) {
          $writer.WriteLine($line)
          $script:repoCounts[$repoName] = $script:repoCounts[$repoName] + 1
          $count++
        }
      }
    }
    if ($count -eq 0) {
      # GZipStream emits no header when nothing is written. A blank line keeps
      # zero-match hours valid gzip files and is ignored by JSONL readers.
      $writer.WriteLine()
    }
  }
  finally {
    $writer.Dispose()
    $gzipOut.Dispose()
    $outFs.Dispose()

    $reader.Dispose()
    $gzipIn.Dispose()
    $inFs.Dispose()
  }

  return $count
}

function Merge-FilteredGhArchiveFiles {
  param(
    [string]$ExistingFile,
    [string]$AdditionsFile,
    [string]$OutputFile
  )

  $tempFile = "$OutputFile.merge-$PID-$([guid]::NewGuid().ToString('N')).tmp"
  $seen = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::Ordinal)
  $count = 0

  $outFs = [System.IO.File]::Create($tempFile)
  $gzipOut = [System.IO.Compression.GZipStream]::new($outFs, [System.IO.Compression.CompressionLevel]::Optimal)
  $writer = [System.IO.StreamWriter]::new($gzipOut)

  try {
    foreach ($sourceFile in @($ExistingFile, $AdditionsFile)) {
      if (-not (Test-Path $sourceFile)) {
        continue
      }

      $inFs = [System.IO.File]::OpenRead($sourceFile)
      $gzipIn = [System.IO.Compression.GZipStream]::new($inFs, [System.IO.Compression.CompressionMode]::Decompress)
      $reader = [System.IO.StreamReader]::new($gzipIn)

      try {
        while (($line = $reader.ReadLine()) -ne $null) {
          if ($seen.Add($line)) {
            $writer.WriteLine($line)
            $count++
          }
        }
      }
      finally {
        $reader.Dispose()
        $gzipIn.Dispose()
        $inFs.Dispose()
      }
    }
  }
  finally {
    $writer.Dispose()
    $gzipOut.Dispose()
    $outFs.Dispose()
  }

  Move-Item -LiteralPath $tempFile -Destination $OutputFile -Force
  return $count
}

Write-Host "Repo column: $RepoColumn"
Write-Host "Seed repos:   $($repos.Count)"
Write-Host "Date range:   $($Start.ToString('yyyy-MM-dd')) to $($EndExclusive.AddDays(-1).ToString('yyyy-MM-dd'))"
Write-Host "Output dir:   $OutDir"
Write-Host "Raw cache:    $RawDir"
Write-Host "Coverage:     $CoveragePath"
Write-Host "Shard:        $ShardIndex of $ShardCount"
Write-Host "Mode:         $(if ($ForceRefilter) { 'force-refilter' } elseif ($AugmentExisting) { 'augment-existing' } else { 'resume' })"
Write-Host ""

$hourOrdinal = 0
for ($d = $Start.Date; $d -lt $EndExclusive.Date; $d = $d.AddDays(1)) {
  foreach ($h in 0..23) {
    $isAssignedToShard = ($hourOrdinal % $ShardCount) -eq $ShardIndex
    $hourOrdinal++
    if (-not $isAssignedToShard) {
      continue
    }

    $fileName = "{0}-{1}.json.gz" -f $d.ToString("yyyy-MM-dd"), $h
    $url = "https://data.gharchive.org/$fileName"

    $rawFile = Join-Path $RawDir $fileName
    $outFile = Join-Path $OutDir $fileName
    $hadOutput = Test-Path $outFile

    if ($hadOutput -and -not $ForceRefilter -and -not $AugmentExisting) {
      "$fileName,$($d.ToString('yyyy-MM-dd')),$h,0,skipped_existing" | Add-Content $CoveragePath -Encoding UTF8
      continue
    }

    if (Test-Path $rawFile) {
      Write-Host "RAW  $fileName"
    }
    else {
      Write-Host "GET  $fileName"
      $curlOutput = @()
      $curlExitCode = 0
      try {
        $curlOutput = & curl.exe -L --fail --silent --show-error --retry 5 --retry-delay 5 --connect-timeout 30 -o $rawFile $url 2>&1
        $curlExitCode = $LASTEXITCODE
      }
      catch {
        $curlOutput += $_.Exception.Message
        $curlExitCode = if ($LASTEXITCODE -ne $null) { $LASTEXITCODE } else { 1 }
      }

      if ($curlExitCode -ne 0) {
        $curlMessage = ($curlOutput | Where-Object { $_ } | ForEach-Object { "$_" }) -join " "
        if ([string]::IsNullOrWhiteSpace($curlMessage)) {
          $curlMessage = "curl exit code $curlExitCode"
        }
        Write-Warning "Download failed: $url ($curlMessage)"
        "$fileName,$($d.ToString('yyyy-MM-dd')),$h,0,download_failed" | Add-Content $CoveragePath -Encoding UTF8
        # A failed transfer is never a reusable cache entry. KeepRaw applies
        # only after a complete download has passed curl's success checks.
        if (Test-Path $rawFile) { Remove-Item $rawFile -Force }
        continue
      }
    }

    $tempOutFile = "$outFile.filter-$PID-$([guid]::NewGuid().ToString('N')).tmp"
    try {
      $matched = Filter-GhArchiveFile -InputFile $rawFile -OutputFile $tempOutFile

      if ($AugmentExisting -and $hadOutput) {
        $merged = Merge-FilteredGhArchiveFiles -ExistingFile $outFile -AdditionsFile $tempOutFile -OutputFile $outFile
        "$fileName,$($d.ToString('yyyy-MM-dd')),$h,$matched,augmented" | Add-Content $CoveragePath -Encoding UTF8
        Write-Host "MERGE $fileName matched_events=$matched merged_events=$merged"
      }
      else {
        Move-Item -LiteralPath $tempOutFile -Destination $outFile -Force
        $status = if ($ForceRefilter -and $hadOutput) { "refiltered" } else { "ok" }
        "$fileName,$($d.ToString('yyyy-MM-dd')),$h,$matched,$status" | Add-Content $CoveragePath -Encoding UTF8
        Write-Host "KEEP $fileName matched_events=$matched"
      }
    }
    catch {
      Write-Warning "Filtering failed for ${fileName}: $($_.Exception.Message)"
      "$fileName,$($d.ToString('yyyy-MM-dd')),$h,0,filter_failed" | Add-Content $CoveragePath -Encoding UTF8
      if ((Test-Path $tempOutFile)) { Remove-Item $tempOutFile -Force }
      if ((-not $hadOutput) -and (Test-Path $outFile)) { Remove-Item $outFile -Force }
    }
    finally {
      if ((Test-Path $tempOutFile)) { Remove-Item $tempOutFile -Force }
      if ((Test-Path $rawFile) -and -not $KeepRaw) { Remove-Item $rawFile -Force }
    }
  }
}

$repoCounts.GetEnumerator() |
  Sort-Object Value -Descending |
  Select-Object @{Name="repo";Expression={$_.Key}}, @{Name="matched_events";Expression={$_.Value}} |
  Export-Csv $SeedCoveragePath -NoTypeInformation -Encoding UTF8

Write-Host ""
Write-Host "Done."
Write-Host "Coverage manifest: $CoveragePath"
Write-Host "Seed repo coverage: $SeedCoveragePath"
