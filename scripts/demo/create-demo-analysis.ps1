param(
  [string]$ApiBaseUrl = "http://localhost:8080"
)

$body = @{
  source = @{
    kind = "demo"
    label = "Demo: Node Web Application"
  }
  options = @{
    includeTransitive = $true
    demoProfile = "node-web"
  }
} | ConvertTo-Json -Depth 5

Invoke-RestMethod -Method Post -Uri "$ApiBaseUrl/api/v1/analyses" -ContentType "application/json" -Body $body