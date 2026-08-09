#!/usr/bin/env bash
# Per-worktree compose scoping (Phase CL). Source this from e2e.sh /
# screenshots.sh AFTER REPO_ROOT is set. Two agent sessions running browser
# gates from different worktrees used to stomp one shared stack — one
# Postgres volume and one pinned `ergomatic-*` container set meant
# duplicate fixtures, and worse, a served bundle from the WRONG BRANCH that
# reads as ~70 phantom test failures (.claude/agent-briefing.md's
# shared-stack note documents the workaround era; this file is the fix).
#
# Every value derives deterministically from the worktree's absolute path,
# so the same checkout always reuses its own stack (E2E_KEEP=1 iteration
# still works) and two checkouts can never share one:
#   - COMPOSE_PROJECT_NAME  → per-worktree project (networks, volumes —
#     including the pgdata volume, so fixtures stop bleeding across
#     sessions)
#   - ERGO_STACK            → container_name prefix (compose.yml:6,30,64,92
#     pins names; unset it and prod/deploy keep their unprefixed names —
#     docs/deploy.md's `docker exec ergomatic-postgres` runbook line stays
#     true on the host)
#   - APP_PORT / POSTGRES_PORT → host bindings (compose.yml:13,77 already
#     read these; the derived range 8100-8499 / 15100-15499 avoids the
#     prod (8082), dev-pg (5433), and legacy shared-stack (8081) ports)
#   - E2E_BASE_URL          → what playwright.config.ts points the browser
#     at (its default stays the legacy 8081 for a bare `playwright test`
#     against a hand-started stack)
#
# Explicit env always wins: every assignment below is `:-` guarded, so CI
# or a human can still pin any of these by exporting it first.
STACK_HASH=$(printf %s "$REPO_ROOT" | cksum | cut -d' ' -f1)
PORT_OFFSET=$((STACK_HASH % 400))

export ERGO_STACK="${ERGO_STACK:-ergomatic-$((STACK_HASH % 100000))}"
export COMPOSE_PROJECT_NAME="${COMPOSE_PROJECT_NAME:-$ERGO_STACK}"
export APP_PORT="${APP_PORT:-$((8100 + PORT_OFFSET))}"
export POSTGRES_PORT="${POSTGRES_PORT:-$((15100 + PORT_OFFSET))}"
export E2E_BASE_URL="${E2E_BASE_URL:-http://127.0.0.1:$APP_PORT}"

echo "stack: $COMPOSE_PROJECT_NAME (web :$APP_PORT, pg :$POSTGRES_PORT)"
