param()

$ErrorActionPreference = "Stop"
$RootDir = Resolve-Path (Join-Path $PSScriptRoot "..\..")

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  throw "Docker is required to start local infrastructure."
}

function Get-ConfigValue {
  param(
    [string]$Key,
    [string]$Fallback
  )

  $environmentValue = [System.Environment]::GetEnvironmentVariable($Key)
  if (-not [string]::IsNullOrWhiteSpace($environmentValue)) {
    return $environmentValue.Trim()
  }

  $envPath = Join-Path $RootDir ".env"
  if (Test-Path $envPath) {
    foreach ($rawLine in Get-Content $envPath) {
      $line = $rawLine.Trim()
      if ($line.Length -eq 0 -or $line.StartsWith("#")) {
        continue
      }
      $separatorIndex = $line.IndexOf("=")
      if ($separatorIndex -le 0) {
        continue
      }
      if ($line.Substring(0, $separatorIndex).Trim() -eq $Key) {
        return $line.Substring($separatorIndex + 1).Trim()
      }
    }
  }

  return $Fallback
}

function Test-PortAvailable {
  param([int]$Port)

  $listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Any, $Port)
  try {
    $listener.Start()
    return $true
  } catch {
    return $false
  } finally {
    try {
      $listener.Stop()
    } catch {
    }
  }
}

function Test-PortIsFree {
  param([int]$Port)

  $owners = @(Get-PortOwners -Port $Port)
  if ($owners.Count -gt 0) {
    return $false
  }

  return Test-PortAvailable -Port $Port
}

function Get-PortOwners {
  param([int]$Port)

  $owners = [System.Collections.Generic.List[string]]::new()

  try {
    foreach ($line in (& docker ps --format "{{.Names}}`t{{.Ports}}" 2>$null)) {
      $parts = $line -split "`t", 2
      if ($parts.Length -eq 2 -and $parts[1] -match ":$Port(->|\b)") {
        $owners.Add("docker container $($parts[0]) ($($parts[1]))")
      }
    }
  } catch {
  }

  $pids = [System.Collections.Generic.HashSet[string]]::new()
  foreach ($entry in (netstat -ano -p tcp 2>$null | Select-String "LISTENING")) {
    $parts = $entry.Line.Trim() -split '\s+'
    if ($parts.Length -lt 5) {
      continue
    }
    if ($parts[1] -match ":$Port$") {
      [void]$pids.Add($parts[4])
    }
  }

  foreach ($pid in $pids) {
    try {
      $process = Get-Process -Id ([int]$pid) -ErrorAction Stop
      $owners.Add("process $($process.ProcessName) (pid $pid)")
    } catch {
      $owners.Add("pid $pid")
    }
  }

  return $owners | Select-Object -Unique
}

function Get-NextFreePort {
  param([int]$Port)

  for ($candidate = $Port + 1; $candidate -le $Port + 25; $candidate++) {
    if (Test-PortIsFree -Port $candidate) {
      return $candidate
    }
  }

  return $null
}

$postgresPort = [int](Get-ConfigValue -Key "POSTGRES_PORT" -Fallback "5432")

if (-not (Test-PortIsFree -Port $postgresPort)) {
  [Console]::Error.WriteLine("Postgres port $postgresPort is already in use.")
  foreach ($owner in Get-PortOwners -Port $postgresPort) {
    [Console]::Error.WriteLine("  occupied by $owner")
  }

  $suggestedPort = Get-NextFreePort -Port $postgresPort
  if ($null -ne $suggestedPort) {
    [Console]::Error.WriteLine("  next free port: $suggestedPort (set POSTGRES_PORT=$suggestedPort in .env)")
  }

  exit 1
}

Push-Location $RootDir
try {
  docker compose up -d postgres
} finally {
  Pop-Location
}

Write-Host "Local infrastructure is starting. Postgres will be on localhost:$postgresPort."
