#!/usr/bin/env bash
# Boots (or reuses) the compose stack and runs the functional + design
# Playwright specs against it (excludes screenshots.spec.ts — see
# scripts/screenshots.sh for that). Invoked as `pnpm e2e` from app/.
#
# Leaves the stack running afterward by default (handy for iterating
# locally / re-running `pnpm e2e` without a rebuild); set E2E_KEEP=0 to
# tear it down on exit.
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)" # compose.yml lives here

export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-devpass}"
export TEST_AUTH_SECRET="${TEST_AUTH_SECRET:-e2e-secret}"
export APP_VERSION="${APP_VERSION:-e2e}"

# Registered before `compose up` so a failure/interrupt during boot itself
# (not just during the test run) still tears down anything that came up.
# `cd`s to the repo root itself rather than relying on the caller's cwd —
# this can fire well after the `cd app` below.
cleanup() {
  if [ "${E2E_KEEP:-1}" = "0" ]; then
    cd "$REPO_ROOT"
    docker compose -f compose.yml -f compose.e2e.yml down
  fi
}
trap cleanup EXIT

cd "$REPO_ROOT"
docker compose -f compose.yml -f compose.e2e.yml up -d --build --wait --wait-timeout 120

cd app
pnpm exec playwright test --project=chromium
