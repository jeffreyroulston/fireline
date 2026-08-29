#!/usr/bin/env bash
# Pull the latest Fireline images from GHCR and restart the Compose stack.
# Requires Docker (Engine or Desktop). Optional: curl for the version check.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

if ! command -v docker >/dev/null 2>&1; then
  echo "docker not found on PATH" >&2
  exit 1
fi

echo "Pulling worker, api, and web images..."
docker compose pull worker api web

echo "Restarting stack..."
docker compose up -d

port="${FIRELINE_PORT:-80}"
url="http://127.0.0.1:${port}/api/version"

if command -v curl >/dev/null 2>&1; then
  echo "Waiting for API at ${url}..."
  ok=0
  for _ in $(seq 1 45); do
    if body="$(curl -fsS "$url" 2>/dev/null)"; then
      echo "Running: ${body}"
      ok=1
      break
    fi
    sleep 2
  done
  if [[ "$ok" -ne 1 ]]; then
    echo "Stack is up, but /api/version did not respond yet. Check: docker compose ps" >&2
    exit 1
  fi
else
  echo "Stack restarted. Install curl to print engine version automatically."
fi
