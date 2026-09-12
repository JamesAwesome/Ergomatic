#!/usr/bin/env bash
# Boots (or reuses) the same compose stack as scripts/e2e.sh, then runs only
# screenshots.spec.ts (project-filtered) to (re)capture docs/screenshots/.
# Invoked as `pnpm screenshots` from app/. Not diff-asserted — a human
# judges the output; see docs/superpowers/specs/2026-07-28-testing-
# validation-design.md.
#
# Leaves the stack running afterward by default; set E2E_KEEP=0 to tear it
# down on exit.
#
# BOOTS ON A FRESH DATABASE EVERY TIME, unlike scripts/e2e.sh. A capture is
# only a record if the same tree produces the same pixels, and reusing the
# previous run's database does not: its users, logs and plan state are still
# there. The fresh volume is what makes ERGOMATIC_STABLE_RUN_ID below safe,
# and it retires the "not idempotent across runs on a KEPT stack" class in
# the same move. Measured cost 2026-09-10: a fresh boot is 17.8s against a
# warm 14.0s (two rounds, images cached both times) — 3.8s on a run whose
# test phase is ~85s. See
# docs/superpowers/specs/2026-09-10-screenshot-churn-design.md.
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)" # compose.yml lives here

# Per-worktree stack identity — see stack-env.sh for the why.
source "$(dirname "${BASH_SOURCE[0]}")/stack-env.sh"
# Reap stacks orphaned by torn-down worktrees before booting ours — see
# stack-reap.sh for the leak this closes.
source "$(dirname "${BASH_SOURCE[0]}")/stack-reap.sh"

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
# `-v` is the whole point: `down` alone keeps `pgdata`, which is exactly the
# state we are removing. Runs before the reap/boot so an interrupted previous
# run cannot leave a half-seeded database behind either.
docker compose -f compose.yml -f compose.e2e.yml down -v
docker compose -f compose.yml -f compose.e2e.yml up -d --build --wait --wait-timeout 120

cd app
# With a guaranteed-empty database, e2e identities no longer need a unique
# suffix to avoid colliding with a previous run's — and that suffix was the
# single largest source of screenshot churn, because it carries `Date.now()`
# and every capture of an account screen renders it. See helpers.ts's RUN_ID.
# `"$@"` forwards a filter, exactly as e2e.sh:39 does: `pnpm screenshots -g
# "today-freestyle"` runs only the named captures and leaves the other files
# untouched on disk. Its absence here was the whole "pnpm screenshots has no
# filter" premise that four filings carried (antagonist, 2026-09-11) — pnpm
# forwards fine; this script dropped the args. List names with
# `pnpm exec playwright test --project=screenshots --list`.
ERGOMATIC_STABLE_RUN_ID=1 pnpm exec playwright test --project=screenshots "$@"
