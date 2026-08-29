# Pull the latest Fireline images from GHCR and restart the Compose stack.
# Requires Docker Desktop. Run from PowerShell: .\scripts\update.ps1
$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
  Write-Error "docker not found on PATH"
}

Write-Host "Pulling worker, api, and web images..."
docker compose pull worker api web
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "Restarting stack..."
docker compose up -d
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

$port = if ($env:FIRELINE_PORT) { $env:FIRELINE_PORT } else { "80" }
$url = "http://127.0.0.1:${port}/api/version"

Write-Host "Waiting for API at $url..."
$ok = $false
for ($i = 0; $i -lt 45; $i++) {
  try {
    $body = Invoke-RestMethod -Uri $url -TimeoutSec 3
    $json = $body | ConvertTo-Json -Compress
    Write-Host "Running: $json"
    $ok = $true
    break
  } catch {
    Start-Sleep -Seconds 2
  }
}

if (-not $ok) {
  Write-Error "Stack is up, but /api/version did not respond yet. Check: docker compose ps"
}
