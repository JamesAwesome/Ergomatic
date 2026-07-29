#!/usr/bin/env bash
# Boots (or reuses) the same compose stack as scripts/e2e.sh, then runs only
# screenshots.spec.ts (project-filtered) to (re)capture docs/screenshots/.
# Invoked as `pnpm screenshots` from app/. Not diff-asserted — a human
# judges the output; see docs/superpowers/specs/2026-07-28-testing-
# validation-design.md.
#
# Leaves the stack running afterward by default; set E2E_KEEP=0 to tear it
# down on exit.
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
pnpm exec playwright test --project=screenshots
