#!/usr/bin/env bash
# Boots (or reuses) the compose stack and runs the functional + design
# Playwright specs against it (excludes screenshots.spec.ts — see
# scripts/screenshots.sh for that). Invoked as `pnpm e2e` from app/.
#
# Leaves the stack running afterward by default (handy for iterating
# locally / re-running `pnpm e2e` without a rebuild); set E2E_KEEP=0 to
# tear it down on exit.
set -Eeuo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/../.." # repo root — compose.yml lives here

export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-devpass}"
export TEST_AUTH_SECRET="${TEST_AUTH_SECRET:-e2e-secret}"
export APP_VERSION="${APP_VERSION:-e2e}"

docker compose up -d --build --wait --wait-timeout 120

cleanup() {
  if [ "${E2E_KEEP:-1}" = "0" ]; then
    docker compose down
  fi
}
trap cleanup EXIT

cd app
pnpm exec playwright test --project=chromium
