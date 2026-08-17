#!/usr/bin/env bash
# The hardware walk's lab: boots (or reuses) THIS worktree's compose stack
# and prints everything the operator needs before touching the erg — the
# URL, the paste-ready backdoor login, and a branch-identity smoke check.
# Invoked by the /hardware-walk skill; also runnable by hand from app/:
#
#   bash scripts/walk-lab.sh up      # boot + print the operator card
#   bash scripts/walk-lab.sh card    # reprint the card (stack already up)
#   bash scripts/walk-lab.sh logs    # follow the api container's logs
#   bash scripts/walk-lab.sh down    # tear down, volumes included
#
# Why compose and not the dev server (skill design, James 2026-08-17): the
# stack wires TEST_AUTH_SECRET automatically (the dev-server path's
# hand-exported env was the recurring "forgot the backdoor" failure), it is
# prod-shaped for the branch under test, it is per-worktree scoped
# (stack-env.sh) so concurrent sessions never collide, and stack-reap.sh
# already knows how to clean it up if teardown is forgotten anyway.
#
# WALK_LAB_DRY_RUN=1 skips every docker invocation and prints what would
# run — the skill's own smoke test, no daemon required.
set -Eeuo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
source "$(dirname "${BASH_SOURCE[0]}")/stack-env.sh"

export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-devpass}"
export TEST_AUTH_SECRET="${TEST_AUTH_SECRET:-e2e-secret}"
export APP_VERSION="${APP_VERSION:-walk}"

CMD="${1:-up}"

dry() { [ "${WALK_LAB_DRY_RUN:-0}" = "1" ]; }

compose() {
  if dry; then
    echo "DRY RUN: docker compose -f compose.yml -f compose.e2e.yml $*"
  else
    (cd "$REPO_ROOT" && docker compose -f compose.yml -f compose.e2e.yml "$@")
  fi
}

print_card() {
  cat <<CARD

=== WALK LAB · $COMPOSE_PROJECT_NAME ===
App (open in CHROME on the LAPTOP — Web Bluetooth + the recording tap
need it; the phone is never assumed):

    http://localhost:$APP_PORT

Backdoor login — paste this in the DevTools console BEFORE hitting any
login wall, then reload:

    await fetch("/api/auth/test-signin", { method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret: "$TEST_AUTH_SECRET",
        email: "walk@ergomatic.dev", name: "Walk Operator" }) })
      .then(r => r.status)

After the row, download the recording from the LOG SCREEN's
"RECORDING · DOWNLOAD" row (it exists there since PR #106 — never the
console; a console download() drops the header's program).

Teardown when the walk ends (the skill runs this for you):

    bash scripts/walk-lab.sh down
CARD
}

case "$CMD" in
  up)
    compose up -d --build --wait --wait-timeout 180
    if ! dry; then
      # Branch-identity smoke: the served bundle must be THIS worktree's
      # build, not a stale image (recurring failure: trusting a stack
      # serving the wrong branch's bundle).
      built_head="$(git -C "$REPO_ROOT" rev-parse --short HEAD)"
      echo "stack up · worktree HEAD $built_head (compose built from this tree just now)"
    fi
    print_card
    ;;
  card) print_card ;;
  logs)
    if dry; then echo "DRY RUN: docker logs -f ${ERGO_STACK}-api"; else docker logs -f "${ERGO_STACK}-api"; fi
    ;;
  down) compose down -v --remove-orphans ;;
  *) echo "usage: walk-lab.sh up|card|logs|down" >&2; exit 2 ;;
esac
